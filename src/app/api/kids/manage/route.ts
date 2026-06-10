import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient, adminAuth } from "@/lib/firebase-admin";
import { calculateAge, generateKidsCode, isKidsAge } from "@/lib/kids/domain";
import { genId } from "@/lib/utils/helpers";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { sendInviteEmail } from "@/lib/email/send";
import { createPasswordResetToken, hashPasswordResetToken } from "@/lib/auth/password-reset";
import { getAppBaseUrl } from "@/lib/invitations";
import { firstLastSlug, resolveUniqueSlug } from "@/lib/utils/slug";
import { sendUserNotification } from "@/lib/server/notification-service";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const roomSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  min_age: z.number().int().min(0).max(12),
  max_age: z.number().int().min(0).max(12),
  capacity: z.number().int().min(0).default(12),
  description: z.string().default(""),
  status: z.enum(["active", "inactive"]).default("active"),
  volunteer_ids: z.array(z.string()).default([]),
});

const personSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  phone: z.string().trim().default(""),
  email: z.string().trim().optional().default(""),
  birth_date: z.string().optional().default(""),
  gender: z.enum(["feminino", "masculino", "nao_informado"]).default("nao_informado"),
  relationship: z.string().optional().default("Responsavel"),
});

const bodySchema = z.object({
  mode: z.enum(["upsert_room", "delete_room", "create_child", "checkin", "call_guardian", "checkout"]),
  room: roomSchema.optional(),
  roomId: z.string().optional(),
  childId: z.string().optional(),
  guardianId: z.string().optional(),
  guardian: personSchema.optional(),
  // Segundo responsável opcional (ex.: pai + mãe). Pode ser um membro já
  // cadastrado (guardianId2) ou um responsável novo (guardian2).
  guardianId2: z.string().optional(),
  guardian2: personSchema.optional(),
  child: personSchema.optional(),
  eventId: z.string().optional(),
  eventDate: z.string().optional(),
  checkinId: z.string().optional(),
  notes: z.string().default(""),
});

function isMissingKidsSchema(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : String(error || "");
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code === "42P01" || /kids_|is_child|guardian_ids|schema cache|does not exist/i.test(message);
}

function randomEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@kids.local`;
}

type EnsureGuardianResult = { id: string; invited: boolean };

interface InviteContext {
  invitedByUserId: string;
  churchName: string;
}

/**
 * Garante que existe um usuário responsável e retorna seu id.
 * - Se `guardianId` foi informado, apenas o retorna (membro já cadastrado).
 * - Se for um responsável novo COM e-mail válido e `inviteCtx` presente, cria a
 *   pessoa como convidada (Firebase Auth + token de redefinição + registro em
 *   member_invitations) e dispara o e-mail de convite — igual ao fluxo de
 *   "Enviar convite" de Pessoas.
 * - Caso contrário (sem e-mail), cria um cadastro simples sem convite.
 */
async function ensureGuardian(
  supabase: ReturnType<typeof getFirebaseAdminClient>,
  churchId: string,
  guardianId?: string,
  guardian?: z.infer<typeof personSchema>,
  inviteCtx?: InviteContext
): Promise<EnsureGuardianResult> {
  if (guardianId) return { id: guardianId, invited: false };
  if (!guardian?.name || guardian.phone.replace(/\D/g, "").length < 8) {
    throw new Error("Informe um responsável com nome e telefone válidos.");
  }

  const email = guardian.email?.trim().toLowerCase() || "";
  const wantsInvite = Boolean(inviteCtx) && EMAIL_RE.test(email);
  const now = new Date().toISOString();

  // Convite real (precisa de e-mail válido). Reutiliza o mesmo fluxo de Pessoas.
  if (wantsInvite && inviteCtx) {
    // Não convidar se o e-mail já pertence a alguém.
    const { data: existingUser } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
    if (existingUser?.id) return { id: existingUser.id, invited: false };

    const tempPassword = generateTempPassword();
    let id = "";
    try {
      const userRecord = await adminAuth.createUser({ email, password: tempPassword, displayName: guardian.name.trim() });
      id = userRecord.uid;
    } catch (authError: any) {
      // E-mail já existe no Auth mas não na coleção: cai para cadastro simples.
      if (authError?.code === "auth/email-already-exists") return createSimpleGuardian(supabase, churchId, guardian, now);
      throw authError;
    }

    const baseSlug = firstLastSlug(guardian.name.trim());
    const slug = await resolveUniqueSlug(baseSlug, async (candidate) => {
      const { data } = await supabase.from("users").select("id").eq("slug", candidate).eq("church_id", churchId).maybeSingle();
      return Boolean(data);
    });

    const { error: userError } = await supabase.from("users").insert({
      id,
      church_id: churchId,
      email,
      password_hash: hashPassword(tempPassword),
      name: guardian.name.trim(),
      slug,
      phone: guardian.phone.trim(),
      role: "member",
      status: "active",
      avatar_color: "#F4532A",
      photo_url: null,
      birth_date: null,
      gender: guardian.gender || "nao_informado",
      spouse_id: null,
      availability: [true, true, true, true, true, true, true],
      total_schedules: 0,
      confirm_rate: 100,
      must_change_password: true,
      last_served_at: null,
      notes: "Responsavel convidado pelo modulo Kids.",
      active: true,
      joined_at: now,
      created_at: now,
    });
    if (userError) {
      await adminAuth.deleteUser(id).catch(() => undefined);
      throw userError;
    }

    // Token de redefinição + e-mail de convite (best-effort).
    const rawToken = createPasswordResetToken();
    await Promise.resolve(
      supabase.from("password_reset_tokens").insert({
        id: crypto.randomUUID(),
        user_id: id,
        church_id: churchId,
        token_hash: hashPasswordResetToken(rawToken),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
    ).catch(() => undefined);

    const invitationId = genId();
    await Promise.resolve(
      supabase.from("member_invitations").insert({
        id: invitationId,
        church_id: churchId,
        user_id: id,
        invited_by_user_id: inviteCtx.invitedByUserId,
        email,
        phone: guardian.phone.trim(),
        tracking_token: rawToken,
        email_status: "pending",
        sms_status: "skipped",
        sent_at: now,
        created_at: now,
      })
    ).catch(() => undefined);

    let emailStatus: "sent" | "failed" = "sent";
    let emailError: string | null = null;
    try {
      await sendInviteEmail({
        to: email,
        memberName: guardian.name.trim(),
        inviteUrl: `${getAppBaseUrl()}/concluir-cadastro?token=${rawToken}`,
        churchName: inviteCtx.churchName,
      });
    } catch (emailErr) {
      emailStatus = "failed";
      emailError = emailErr instanceof Error ? emailErr.message : "Falha ao enviar email";
      console.error("Erro ao enviar convite Kids:", emailErr);
    }
    await Promise.resolve(
      supabase.from("member_invitations").update({ email_status: emailStatus, email_error: emailError }).eq("id", invitationId)
    ).catch(() => undefined);

    return { id, invited: emailStatus === "sent" };
  }

  return createSimpleGuardian(supabase, churchId, guardian, now);
}

/** Cadastro simples de responsável (sem convite — usado quando não há e-mail). */
async function createSimpleGuardian(
  supabase: ReturnType<typeof getFirebaseAdminClient>,
  churchId: string,
  guardian: z.infer<typeof personSchema>,
  now: string
): Promise<EnsureGuardianResult> {
  const id = genId();
  const { error } = await supabase.from("users").insert({
    id,
    church_id: churchId,
    email: guardian.email?.trim().toLowerCase() || randomEmail("responsavel"),
    password_hash: "",
    name: guardian.name.trim(),
    phone: guardian.phone.trim(),
    role: "member",
    status: "active",
    avatar_color: "#F4532A",
    photo_url: null,
    birth_date: null,
    gender: guardian.gender || "nao_informado",
    spouse_id: null,
    availability: [true, true, true, true, true, true, true],
    total_schedules: 0,
    confirm_rate: 100,
    must_change_password: false,
    last_served_at: null,
    notes: "Responsavel cadastrado pelo modulo Kids.",
    active: true,
    joined_at: now,
    created_at: now,
  });
  if (error) throw error;
  return { id, invited: false };
}

interface GuardianLink {
  guardianId: string;
  relationship: string;
  is_primary: boolean;
}

async function createChildWithGuardians(
  supabase: ReturnType<typeof getFirebaseAdminClient>,
  churchId: string,
  child: z.infer<typeof personSchema>,
  guardians: GuardianLink[]
) {
  const age = calculateAge(child.birth_date);
  if (!isKidsAge(age)) throw new Error("A criança precisa ter até 12 anos.");
  // De-duplica responsáveis repetidos (ex.: mesmo membro selecionado duas vezes).
  const seen = new Set<string>();
  const links = guardians.filter((g) => g.guardianId && !seen.has(g.guardianId) && seen.add(g.guardianId));
  if (links.length === 0) throw new Error("Vincule pelo menos um responsável.");
  const primary = links.find((g) => g.is_primary) || links[0];

  const id = genId();
  const now = new Date().toISOString();
  const { error: childError } = await supabase.from("users").insert({
    id,
    church_id: churchId,
    email: child.email?.trim().toLowerCase() || randomEmail("crianca"),
    password_hash: "",
    name: child.name.trim(),
    phone: child.phone.trim(),
    role: "member",
    status: "active",
    avatar_color: "#7B61FF",
    photo_url: null,
    birth_date: child.birth_date,
    gender: child.gender || "nao_informado",
    is_child: true,
    primary_guardian_id: primary.guardianId,
    guardian_ids: links.map((g) => g.guardianId),
    spouse_id: null,
    availability: [true, true, true, true, true, true, true],
    total_schedules: 0,
    confirm_rate: 100,
    must_change_password: false,
    last_served_at: null,
    notes: child.relationship || "",
    active: true,
    joined_at: now,
    created_at: now,
  });
  if (childError) throw childError;

  for (const link of links) {
    const { error: linkError } = await supabase.from("kids_guardianship").insert({
      id: genId(),
      church_id: churchId,
      child_id: id,
      guardian_id: link.guardianId,
      relationship: link.relationship,
      is_primary: link.guardianId === primary.guardianId,
      created_at: now,
    });
    if (linkError) throw linkError;
  }
  return id;
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para Kids." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req, { select: "id, role, church_id, active" });
    if (errorResponse) return errorResponse;
    if (!actor?.active) return NextResponse.json({ error: "Usuário inativo." }, { status: 403 });

    const supabase = getFirebaseAdminClient();
    const churchId = session!.church_id;
    const actorId = session!.user_id;
    const body = parsed.data;
    const canManage = actor.role === "admin" || can(actor, "event.edit") || can(actor, "member.edit");

    if (!canManage) {
      return NextResponse.json({ error: "Você não possui permissão para realizar check-in neste evento." }, { status: 403 });
    }

    // Contexto de convite (nome da igreja) carregado sob demanda e cacheado.
    let inviteCtxCache: InviteContext | undefined;
    async function loadInviteCtx(): Promise<InviteContext> {
      if (inviteCtxCache) return inviteCtxCache;
      const { data: church } = await supabase.from("churches").select("name").eq("id", churchId).maybeSingle();
      inviteCtxCache = { invitedByUserId: actorId, churchName: church?.name || "sua igreja" };
      return inviteCtxCache;
    }

    // Resolve responsável(is) de uma criança nova: primário (obrigatório) e um
    // segundo opcional. Responsáveis novos com e-mail recebem convite.
    async function buildGuardianLinks(): Promise<GuardianLink[]> {
      const inviteCtx = await loadInviteCtx();
      const primary = await ensureGuardian(supabase, churchId, body.guardianId, body.guardian, inviteCtx);
      const links: GuardianLink[] = [
        { guardianId: primary.id, relationship: body.guardian?.relationship || "Responsavel", is_primary: true },
      ];
      const hasSecond = Boolean(body.guardianId2 || body.guardian2?.name);
      if (hasSecond) {
        const second = await ensureGuardian(supabase, churchId, body.guardianId2, body.guardian2, inviteCtx);
        if (second.id !== primary.id) {
          links.push({ guardianId: second.id, relationship: body.guardian2?.relationship || "Responsavel", is_primary: false });
        }
      }
      return links;
    }

    if (body.mode === "upsert_room") {
      if (!body.room) return NextResponse.json({ error: "Sala não informada." }, { status: 400 });
      if (body.room.max_age < body.room.min_age) return NextResponse.json({ error: "Faixa etária inválida." }, { status: 400 });
      const now = new Date().toISOString();
      const payload = {
        ...body.room,
        id: body.room.id || genId(),
        church_id: churchId,
        created_at: now,
        updated_at: now,
      };
      const { error } = await supabase.from("kids_rooms").upsert(payload);
      if (error) throw error;
      return NextResponse.json({ success: true, roomId: payload.id });
    }

    if (body.mode === "delete_room") {
      if (!body.roomId) return NextResponse.json({ error: "Sala não informada." }, { status: 400 });
      const { count, error: countError } = await supabase
        .from("kids_checkins")
        .select("id", { count: "exact", head: true })
        .eq("room_id", body.roomId);
      if (countError) throw countError;
      if ((count || 0) > 0) {
        const { error } = await supabase.from("kids_rooms").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", body.roomId).eq("church_id", churchId);
        if (error) throw error;
        return NextResponse.json({ success: true, inactivated: true });
      }
      const { error } = await supabase.from("kids_rooms").delete().eq("id", body.roomId).eq("church_id", churchId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (body.mode === "create_child") {
      if (!body.child) return NextResponse.json({ error: "Criança não informada." }, { status: 400 });
      const links = await buildGuardianLinks();
      const childId = await createChildWithGuardians(supabase, churchId, body.child, links);
      return NextResponse.json({ success: true, childId, guardianId: links[0].guardianId });
    }

    if (body.mode === "checkin") {
      if (!body.eventId || !body.eventDate) return NextResponse.json({ error: "Evento/data não informado." }, { status: 400 });
      if (!body.roomId) return NextResponse.json({ error: "Selecione uma sala." }, { status: 400 });

      let childId = body.childId || "";
      let guardianId = body.guardianId || "";
      if (!childId) {
        if (!body.child) return NextResponse.json({ error: "Selecione ou cadastre uma criança." }, { status: 400 });
        const links = await buildGuardianLinks();
        childId = await createChildWithGuardians(supabase, churchId, body.child, links);
        guardianId = links.find((l) => l.is_primary)?.guardianId || links[0].guardianId;
      }
      if (!guardianId) {
        const { data: primaryLink, error: linkError } = await supabase
          .from("kids_guardianship")
          .select("guardian_id")
          .eq("church_id", churchId)
          .eq("child_id", childId)
          .order("is_primary", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (linkError) throw linkError;
        guardianId = primaryLink?.guardian_id || "";
      }
      if (!guardianId) return NextResponse.json({ error: "Vincule um responsável antes do check-in." }, { status: 400 });

      const { data: duplicate, error: duplicateError } = await supabase
        .from("kids_checkins")
        .select("id")
        .eq("church_id", churchId)
        .eq("event_id", body.eventId)
        .eq("event_date", body.eventDate)
        .eq("child_id", childId)
        .neq("status", "checked_out")
        .maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) return NextResponse.json({ error: "Esta criança já possui check-in ativo neste culto." }, { status: 409 });

      const { data: existingCodes, error: codesError } = await supabase
        .from("kids_checkins")
        .select("code")
        .eq("church_id", churchId)
        .eq("event_id", body.eventId)
        .eq("event_date", body.eventDate);
      if (codesError) throw codesError;

      const now = new Date().toISOString();
      const code = generateKidsCode((existingCodes || []).map((item) => item.code), Date.now());
      const checkinId = genId();
      const { error: insertError } = await supabase.from("kids_checkins").insert({
        id: checkinId,
        church_id: churchId,
        event_id: body.eventId,
        event_date: body.eventDate,
        child_id: childId,
        room_id: body.roomId,
        guardian_id: guardianId,
        code,
        status: "in_room",
        checked_in_at: now,
        checked_in_by: actorId,
        notes: body.notes || "",
        created_at: now,
        updated_at: now,
      });
      if (insertError) throw insertError;
      return NextResponse.json({ success: true, checkinId, code });
    }

    if (!body.checkinId) return NextResponse.json({ error: "Check-in não informado." }, { status: 400 });

    if (body.mode === "call_guardian") {
      // Lê o check-in para saber criança, sala, código e responsável antes de
      // atualizar — assim avisamos o responsável com o código de retirada.
      const { data: checkin } = await supabase
        .from("kids_checkins")
        .select("child_id, guardian_id, room_id, code")
        .eq("id", body.checkinId)
        .eq("church_id", churchId)
        .maybeSingle();

      const { error } = await supabase
        .from("kids_checkins")
        .update({ status: "called", called_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", body.checkinId)
        .eq("church_id", churchId);
      if (error) throw error;

      // Aviso ao responsável (in-app + push) com o código de retirada.
      const guardianId = (checkin as { guardian_id?: string } | null)?.guardian_id;
      if (guardianId) {
        try {
          const [{ data: child }, { data: room }] = await Promise.all([
            supabase.from("users").select("name").eq("id", (checkin as { child_id?: string }).child_id).maybeSingle(),
            supabase.from("kids_rooms").select("name").eq("id", (checkin as { room_id?: string }).room_id).maybeSingle(),
          ]);
          const childName = (child as { name?: string } | null)?.name || "Sua criança";
          const roomName = (room as { name?: string } | null)?.name || "sala Kids";
          const code = (checkin as { code?: string }).code || "";
          await sendUserNotification({
            userId: guardianId,
            churchId,
            title: "Hora de buscar 👶",
            body: `${childName} está pronto para retirada na ${roomName}.${code ? ` Código: ${code}.` : ""}`,
            actionUrl: "/kids",
            type: "reminder",
          });
        } catch (notifyError) {
          console.error("Falha ao avisar responsável Kids:", notifyError);
        }
      }

      return NextResponse.json({ success: true });
    }

    const { error } = await supabase
      .from("kids_checkins")
      .update({
        status: "checked_out",
        checked_out_at: new Date().toISOString(),
        checked_out_by: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.checkinId)
      .eq("church_id", churchId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API kids/manage error:", error);
    if (isMissingKidsSchema(error)) {
      return NextResponse.json({ error: "Execute a migration do modulo Kids antes de usar esta acao." }, { status: 500 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao gerenciar Kids." },
      { status: 500 }
    );
  }
}
