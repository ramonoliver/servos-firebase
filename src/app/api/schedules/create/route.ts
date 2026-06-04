import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { sendScheduleAssignmentAlerts } from "@/lib/server/schedule-notifications";
import { genId } from "@/lib/utils/helpers";

const bodySchema = z.object({
  eventId: z.string().min(1),
  departmentId: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  arrivalTime: z.string().default(""),
  instructions: z.string().default(""),
  publish: z.boolean(),
  selectedIds: z.array(z.string()).default([]),
  functionTargets: z.record(z.string(), z.number().int().min(0)).default({}),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para criar escala." }, { status: 400 });
    }

    const {
      eventId,
      departmentId,
      date,
      time,
      arrivalTime,
      instructions,
      publish,
      selectedIds,
      functionTargets,
    } = parsed.data;

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const actorId = session!.user_id;
    const churchId = session!.church_id;
    const supabase = getFirebaseAdminClient();

    const [{ data: department, error: departmentError }, { data: event, error: eventError }] =
      await Promise.all([
        supabase
          .from("departments")
          .select("id, church_id, leader_ids, co_leader_ids")
          .eq("id", departmentId)
          .eq("church_id", churchId)
          .maybeSingle(),
        supabase
          .from("events")
          .select("id, church_id, active")
          .eq("id", eventId)
          .eq("church_id", churchId)
          .maybeSingle(),
      ]);

    if (departmentError) throw departmentError;
    if (eventError) throw eventError;

    if (!actor?.active || !can(actor.role, "schedule.create", { departmentId, userDepartmentIds: [departmentId] })) {
      return NextResponse.json({ error: "Sem permissao para criar escalas." }, { status: 403 });
    }

    if (actor.role === "leader") {
      const canManageDepartment =
        (department?.leader_ids || []).includes(actorId) ||
        (department?.co_leader_ids || []).includes(actorId);
      if (!canManageDepartment) {
        return NextResponse.json({ error: "Sem permissao para criar escala neste ministerio." }, { status: 403 });
      }
    }

    if (!department || !event?.active) {
      return NextResponse.json({ error: "Evento ou ministerio nao encontrado." }, { status: 404 });
    }

    const { data: departmentLinks, error: departmentLinksError } = await supabase
      .from("department_members")
      .select("user_id, function_name")
      .eq("department_id", departmentId);

    if (departmentLinksError) throw departmentLinksError;

    const linkMap = new Map<string, string>((departmentLinks || []).map((link: any) => [link.user_id, link.function_name || ""]));
    const validSelectedIds = selectedIds.filter((userId) => linkMap.has(userId));
    const normalizedFunctionTargets = Object.entries(functionTargets)
      .map(([functionName, quantity]) => ({
        function_name: functionName.trim() || "Sem função",
        quantity,
      }))
      .filter((slot) => slot.quantity > 0);
    const filledCounts = validSelectedIds.reduce<Record<string, number>>((acc, userId) => {
      const functionName = (linkMap.get(userId) || "").trim() || "Sem função";
      acc[functionName] = (acc[functionName] || 0) + 1;
      return acc;
    }, {});

    const now = new Date().toISOString();
    const scheduleId = genId();

    const { error: scheduleError } = await supabase.from("schedules").insert({
      id: scheduleId,
      church_id: churchId,
      event_id: eventId,
      department_id: departmentId,
      date,
      time,
      arrival_time: arrivalTime,
      status: publish ? "active" : "draft",
      instructions,
      notes: "",
      published: publish,
      created_by: actorId,
      created_at: now,
    });

    if (scheduleError) throw scheduleError;

    if (normalizedFunctionTargets.length > 0) {
      const { error: slotError } = await supabase.from("schedule_slots").insert(
        normalizedFunctionTargets.map((slot) => ({
          id: genId(),
          schedule_id: scheduleId,
          function_name: slot.function_name,
          quantity: slot.quantity,
          filled: filledCounts[slot.function_name] || 0,
        }))
      );

      if (slotError) throw slotError;
    }

    if (validSelectedIds.length > 0) {
      const payload = validSelectedIds.map((userId) => ({
        id: genId(),
        schedule_id: scheduleId,
        user_id: userId,
        function_name: linkMap.get(userId) || "",
        status: "pending",
        decline_reason: "",
        substitute_id: null,
        substitute_for: null,
        is_reserve: false,
        responded_at: null,
        notified_at: now,
      }));

      const { error: scheduleMembersError } = await supabase
        .from("schedule_members")
        .insert(payload);

      if (scheduleMembersError) throw scheduleMembersError;
    }

    const notifications =
      publish && validSelectedIds.length > 0
        ? await sendScheduleAssignmentAlerts({
            churchId,
            scheduleId,
            userIds: validSelectedIds,
          })
        : null;

    return NextResponse.json({ success: true, scheduleId, notifications });
  } catch (error) {
    console.error("API schedules/create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar escala." },
      { status: 500 }
    );
  }
}
