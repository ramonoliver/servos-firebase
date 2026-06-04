import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { sendScheduleAssignmentAlerts } from "@/lib/server/schedule-notifications";
import {
  awardConfirmationPoints,
  awardSubstitutionPoints,
  evaluateBadgesForUser,
} from "@/lib/server/scoring-service";
import { sendUserNotification } from "@/lib/server/notification-service";
import { genId } from "@/lib/utils/helpers";

const postSchema = z.object({
  scheduleId: z.string().min(1),
  userId: z.string().min(1),
});

const deleteSchema = z.object({
  scheduleId: z.string().min(1),
  scheduleMemberId: z.string().min(1),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("respond"),
    scheduleMemberId: z.string().min(1),
    status: z.enum(["confirmed", "declined"]),
    declineReason: z.string().default(""),
  }),
  z.object({
    action: z.literal("substitute"),
    scheduleId: z.string().min(1),
    declinedScheduleMemberId: z.string().min(1),
    substituteId: z.string().min(1),
  }),
]);

async function getScheduleContext(scheduleId: string, churchId: string) {
  const supabase = getFirebaseAdminClient();
  const { data: schedule, error } = await supabase
    .from("schedules")
    .select("id, church_id, department_id")
    .eq("id", scheduleId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (error) throw error;
  return schedule;
}

async function canManageSchedule(params: { actorId: string; churchId: string; scheduleId: string }) {
  const { actorId, churchId, scheduleId } = params;
  const supabase = getFirebaseAdminClient();
  const [actorResult, schedule] = await Promise.all([
    supabase
      .from("users")
      .select("id, role, church_id, active")
      .eq("id", actorId)
      .eq("church_id", churchId)
      .maybeSingle(),
    getScheduleContext(scheduleId, churchId),
  ]);

  if (actorResult.error) throw actorResult.error;
  const actor = actorResult.data;
  if (!actor?.active || !schedule) return { allowed: false, schedule: null };

  if (!can(actor.role, "schedule.edit", { departmentId: schedule.department_id, userDepartmentIds: [schedule.department_id] })) {
    return { allowed: false, schedule };
  }

  if (actor.role === "leader") {
    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .select("id, leader_ids, co_leader_ids")
      .eq("id", schedule.department_id)
      .eq("church_id", churchId)
      .maybeSingle();

    if (departmentError) throw departmentError;

    const managesDepartment =
      (department?.leader_ids || []).includes(actorId) ||
      (department?.co_leader_ids || []).includes(actorId);

    if (!managesDepartment) return { allowed: false, schedule };
  }

  return { allowed: true, schedule };
}

async function refreshScheduleSlotCounts(scheduleId: string) {
  const supabase = getFirebaseAdminClient();
  const [{ data: slots, error: slotsError }, { data: scheduleMembers, error: membersError }] =
    await Promise.all([
      supabase.from("schedule_slots").select("id, function_name").eq("schedule_id", scheduleId),
      supabase.from("schedule_members").select("function_name").eq("schedule_id", scheduleId),
    ]);

  if (slotsError) throw slotsError;
  if (membersError) throw membersError;

  if (!slots?.length) return;

  const counts = ((scheduleMembers as any[]) || []).reduce<Record<string, number>>((acc, member) => {
    const functionName = member.function_name?.trim() || "Sem função";
    acc[functionName] = (acc[functionName] || 0) + 1;
    return acc;
  }, {});

  const updates = await Promise.all(
    slots.map((slot) =>
      supabase
        .from("schedule_slots")
        .update({ filled: counts[slot.function_name?.trim() || "Sem função"] || 0 })
        .eq("id", slot.id)
    )
  );

  const failedUpdate = updates.find((result) => result.error);
  if (failedUpdate?.error) throw failedUpdate.error;
}

export async function POST(req: Request) {
  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para adicionar membro a escala." }, { status: 400 });
    }

    const { session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const actorId = session!.user_id;
    const churchId = session!.church_id;
    const { scheduleId, userId } = parsed.data;
    const supabase = getFirebaseAdminClient();
    const { allowed, schedule } = await canManageSchedule({ actorId, churchId, scheduleId });

    if (!allowed || !schedule) {
      return NextResponse.json({ error: "Sem permissao para editar esta escala." }, { status: 403 });
    }

    const [{ data: targetMember, error: targetMemberError }, { data: departmentLink, error: departmentLinkError }, { data: existingMember, error: existingMemberError }] =
      await Promise.all([
        supabase
          .from("users")
          .select("id, church_id, active")
          .eq("id", userId)
          .eq("church_id", churchId)
          .maybeSingle(),
        supabase
          .from("department_members")
          .select("user_id, function_name")
          .eq("department_id", schedule.department_id)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("schedule_members")
          .select("id")
          .eq("schedule_id", scheduleId)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

    if (targetMemberError) throw targetMemberError;
    if (departmentLinkError) throw departmentLinkError;
    if (existingMemberError) throw existingMemberError;

    if (!targetMember?.active || !departmentLink) {
      return NextResponse.json({ error: "Membro nao elegivel para esta escala." }, { status: 404 });
    }

    if (existingMember) {
      return NextResponse.json({ error: "Este membro ja esta na escala." }, { status: 409 });
    }

    const { error } = await supabase.from("schedule_members").insert({
      id: genId(),
      schedule_id: scheduleId,
      user_id: userId,
      function_name: departmentLink.function_name || "",
      status: "pending",
      decline_reason: "",
      substitute_id: null,
      substitute_for: null,
      is_reserve: false,
      responded_at: null,
      notified_at: new Date().toISOString(),
    });

    if (error) throw error;

    await refreshScheduleSlotCounts(scheduleId);

    const notifications = await sendScheduleAssignmentAlerts({
      churchId,
      scheduleId,
      userIds: [userId],
    });

    // Send in-app notification to the added member
    try {
      const { data: scheduleInfo } = await supabase
        .from("schedules")
        .select("title, date, events(title)")
        .eq("id", scheduleId)
        .single();

      const eventTitle = Array.isArray(scheduleInfo?.events) 
        ? (scheduleInfo.events[0] as any)?.title || "Evento"
        : (scheduleInfo?.events as any)?.title || "Evento";
      const scheduleDate = new Date(scheduleInfo?.date || "").toLocaleDateString("pt-BR");

      await sendUserNotification({
        userId,
        churchId,
        title: "Adicionado à escala",
        body: `Você foi adicionado à escala "${scheduleInfo?.title || "Escala"}" do evento "${eventTitle}" em ${scheduleDate}.`,
        actionUrl: `/escalas/${scheduleId}`,
        type: "confirmation",
      });
    } catch (notificationError) {
      console.error("Error sending in-app notification for schedule assignment:", notificationError);
      // Don't fail the request if notification fails
    }

    return NextResponse.json({ success: true, notifications });
  } catch (error) {
    console.error("API schedule-members POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao adicionar membro a escala." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = deleteSchema.safeParse({
      scheduleId: url.searchParams.get("scheduleId"),
      scheduleMemberId: url.searchParams.get("scheduleMemberId"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para remover membro da escala." }, { status: 400 });
    }

    const { session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const actorId = session!.user_id;
    const churchId = session!.church_id;
    const { scheduleId, scheduleMemberId } = parsed.data;
    const supabase = getFirebaseAdminClient();
    const { allowed } = await canManageSchedule({ actorId, churchId, scheduleId });

    if (!allowed) {
      return NextResponse.json({ error: "Sem permissao para editar esta escala." }, { status: 403 });
    }

    const { error } = await supabase
      .from("schedule_members")
      .delete()
      .eq("id", scheduleMemberId)
      .eq("schedule_id", scheduleId);

    if (error) throw error;

    await refreshScheduleSlotCounts(scheduleId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API schedule-members DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao remover membro da escala." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para atualizar membro da escala." }, { status: 400 });
    }

    const supabase = getFirebaseAdminClient();
    const { session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    if (parsed.data.action === "respond") {
      const actorId = session!.user_id;
      const churchId = session!.church_id;
      const { scheduleMemberId, status, declineReason } = parsed.data;
      const { data: scheduleMember, error: scheduleMemberError } = await supabase
        .from("schedule_members")
        .select("id, user_id, status, schedule_id")
        .eq("id", scheduleMemberId)
        .maybeSingle();

      if (scheduleMemberError) throw scheduleMemberError;
      if (!scheduleMember) {
        return NextResponse.json({ error: "Participacao na escala nao encontrada." }, { status: 404 });
      }

      if (scheduleMember.user_id !== actorId) {
        return NextResponse.json({ error: "Sem permissao para responder esta escala." }, { status: 403 });
      }

      const { data: actor, error: actorError } = await supabase
        .from("users")
        .select("id, church_id, active")
        .eq("id", actorId)
        .eq("church_id", churchId)
        .maybeSingle();

      if (actorError) throw actorError;
      if (!actor?.active) {
        return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
      }

      const { error } = await supabase
        .from("schedule_members")
        .update({
          status,
          decline_reason: status === "declined" ? declineReason : "",
          responded_at: new Date().toISOString(),
        })
        .eq("id", scheduleMemberId);

      if (error) throw error;

      if (status === "confirmed" && scheduleMember.status !== "confirmed") {
        await awardConfirmationPoints(actorId, churchId, scheduleMember.schedule_id);

        await sendUserNotification({
          userId: actorId,
          churchId,
          title: "Presença confirmada ✅",
          body: "Perfeito! Você ganhou +5 pontos 🎉",
          actionUrl: `/escalas/${encodeURIComponent(scheduleMember.schedule_id)}`,
          type: "confirmation",
        });

        const badges = await evaluateBadgesForUser(actorId, churchId);
        for (const badge of badges) {
          await sendUserNotification({
            userId: actorId,
            churchId,
            title: "Nova conquista desbloqueada 🏅",
            body: `Você conquistou: '${badge.name}'`,
            actionUrl: "/perfil",
            type: "badge",
          });
        }
      }

      return NextResponse.json({ success: true });
    }

    const actorId = session!.user_id;
    const churchId = session!.church_id;
    const { scheduleId, declinedScheduleMemberId, substituteId } = parsed.data;
    const { allowed, schedule } = await canManageSchedule({ actorId, churchId, scheduleId });

    if (!allowed || !schedule) {
      return NextResponse.json({ error: "Sem permissao para editar esta escala." }, { status: 403 });
    }

    const [{ data: declinedMember, error: declinedMemberError }, { data: substituteLink, error: substituteLinkError }, { data: existingSubstitute, error: existingSubstituteError }] =
      await Promise.all([
        supabase
          .from("schedule_members")
          .select("id, user_id, function_name, status, substitute_id")
          .eq("id", declinedScheduleMemberId)
          .eq("schedule_id", scheduleId)
          .maybeSingle(),
        supabase
          .from("department_members")
          .select("user_id, function_name")
          .eq("department_id", schedule.department_id)
          .eq("user_id", substituteId)
          .maybeSingle(),
        supabase
          .from("schedule_members")
          .select("id")
          .eq("schedule_id", scheduleId)
          .eq("user_id", substituteId)
          .maybeSingle(),
      ]);

    if (declinedMemberError) throw declinedMemberError;
    if (substituteLinkError) throw substituteLinkError;
    if (existingSubstituteError) throw existingSubstituteError;

    if (!declinedMember || declinedMember.status !== "declined") {
      return NextResponse.json({ error: "Membro recusado nao encontrado." }, { status: 404 });
    }

    if (!substituteLink) {
      return NextResponse.json({ error: "Substituto nao elegivel para este ministerio." }, { status: 404 });
    }

    if (existingSubstitute) {
      return NextResponse.json({ error: "Este substituto ja esta na escala." }, { status: 409 });
    }

    const { error: insertError } = await supabase.from("schedule_members").insert({
      id: genId(),
      schedule_id: scheduleId,
      user_id: substituteId,
      function_name: substituteLink.function_name || declinedMember.function_name,
      status: "pending",
      decline_reason: "",
      substitute_id: null,
      substitute_for: declinedMember.user_id,
      is_reserve: false,
      responded_at: null,
      notified_at: new Date().toISOString(),
    });

    if (insertError) throw insertError;

    const { error: updateError } = await supabase
      .from("schedule_members")
      .update({ substitute_id: substituteId })
      .eq("id", declinedScheduleMemberId)
      .eq("schedule_id", scheduleId);

    if (updateError) throw updateError;

    await refreshScheduleSlotCounts(scheduleId);

    await awardSubstitutionPoints(substituteId, churchId, scheduleId);
    await sendUserNotification({
      userId: substituteId,
      churchId,
      title: "Você ganhou pontos 🎉",
      body: "+15 pontos por substituir alguém! Continue assim 🙌",
      actionUrl: `/escalas/${encodeURIComponent(scheduleId)}`,
      type: "points",
    });

    const badges = await evaluateBadgesForUser(substituteId, churchId);
    for (const badge of badges) {
      await sendUserNotification({
        userId: substituteId,
        churchId,
        title: "Nova conquista desbloqueada 🏅",
        body: `Você conquistou: '${badge.name}'`,
        actionUrl: "/perfil",
        type: "badge",
      });
    }

    const notifications = await sendScheduleAssignmentAlerts({
      churchId,
      scheduleId,
      userIds: [substituteId],
    });

    return NextResponse.json({ success: true, notifications });
  } catch (error) {
    console.error("API schedule-members PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar membro da escala." },
      { status: 500 }
    );
  }
}
