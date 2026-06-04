import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { calculateAge, generateKidsCode, isKidsAge } from "@/lib/kids/domain";
import { genId } from "@/lib/utils/helpers";

export const dynamic = "force-dynamic";

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

async function ensureGuardian(supabase: ReturnType<typeof getFirebaseAdminClient>, churchId: string, guardianId?: string, guardian?: z.infer<typeof personSchema>) {
  if (guardianId) return guardianId;
  if (!guardian?.name || guardian.phone.replace(/\D/g, "").length < 8) {
    throw new Error("Informe um responsavel com nome e telefone validos.");
  }

  const id = genId();
  const now = new Date().toISOString();
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
  return id;
}

async function createChildWithGuardian(
  supabase: ReturnType<typeof getFirebaseAdminClient>,
  churchId: string,
  child: z.infer<typeof personSchema>,
  guardianId: string,
  relationship: string
) {
  const age = calculateAge(child.birth_date);
  if (!isKidsAge(age)) throw new Error("A crianca precisa ter ate 12 anos.");
  if (!guardianId) throw new Error("Vincule pelo menos um responsavel.");

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
    primary_guardian_id: guardianId,
    guardian_ids: [guardianId],
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

  const { error: linkError } = await supabase.from("kids_guardianship").insert({
    id: genId(),
    church_id: churchId,
    child_id: id,
    guardian_id: guardianId,
    relationship,
    is_primary: true,
    created_at: now,
  });
  if (linkError) throw linkError;
  return id;
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para Kids." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req, { select: "id, role, church_id, active" });
    if (errorResponse) return errorResponse;
    if (!actor?.active) return NextResponse.json({ error: "Usuario inativo." }, { status: 403 });

    const supabase = getFirebaseAdminClient();
    const churchId = session!.church_id;
    const actorId = session!.user_id;
    const body = parsed.data;
    const canManage = actor.role === "admin" || can(actor.role, "event.edit") || can(actor.role, "member.edit");

    if (!canManage) {
      return NextResponse.json({ error: "Voce nao possui permissao para realizar check-in neste evento." }, { status: 403 });
    }

    if (body.mode === "upsert_room") {
      if (!body.room) return NextResponse.json({ error: "Sala nao informada." }, { status: 400 });
      if (body.room.max_age < body.room.min_age) return NextResponse.json({ error: "Faixa etaria invalida." }, { status: 400 });
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
      if (!body.roomId) return NextResponse.json({ error: "Sala nao informada." }, { status: 400 });
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
      if (!body.child) return NextResponse.json({ error: "Crianca nao informada." }, { status: 400 });
      const guardianId = await ensureGuardian(supabase, churchId, body.guardianId, body.guardian);
      const childId = await createChildWithGuardian(supabase, churchId, body.child, guardianId, body.guardian?.relationship || "Responsavel");
      return NextResponse.json({ success: true, childId, guardianId });
    }

    if (body.mode === "checkin") {
      if (!body.eventId || !body.eventDate) return NextResponse.json({ error: "Evento/data nao informado." }, { status: 400 });
      if (!body.roomId) return NextResponse.json({ error: "Selecione uma sala." }, { status: 400 });

      let childId = body.childId || "";
      let guardianId = body.guardianId || "";
      if (!childId) {
        if (!body.child) return NextResponse.json({ error: "Selecione ou cadastre uma crianca." }, { status: 400 });
        guardianId = await ensureGuardian(supabase, churchId, body.guardianId, body.guardian);
        childId = await createChildWithGuardian(supabase, churchId, body.child, guardianId, body.guardian?.relationship || "Responsavel");
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
      if (!guardianId) return NextResponse.json({ error: "Vincule um responsavel antes do check-in." }, { status: 400 });

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
      if (duplicate) return NextResponse.json({ error: "Esta crianca ja possui check-in ativo neste culto." }, { status: 409 });

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

    if (!body.checkinId) return NextResponse.json({ error: "Check-in nao informado." }, { status: 400 });

    if (body.mode === "call_guardian") {
      const { error } = await supabase
        .from("kids_checkins")
        .update({ status: "called", called_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", body.checkinId)
        .eq("church_id", churchId);
      if (error) throw error;
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
