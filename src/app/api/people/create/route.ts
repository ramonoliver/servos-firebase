import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const bodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().optional().default(""),
  phone: z.string().trim().default(""),
  birthDate: z.string().optional().default(""),
  gender: z.enum(["feminino", "masculino", "nao_informado"]).default("nao_informado"),
  kind: z.enum(["member", "visitor", "volunteer", "leader", "pastor"]).default("visitor"),
  cellId: z.string().nullable().optional(),
  notes: z.string().default(""),
});

function randomEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@people.local`;
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para criar pessoa." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;
    if (!actor?.active) return NextResponse.json({ error: "Usuário inativo." }, { status: 403 });

    const isAuthorized = actor.role === "admin" || can(actor.role, "member.edit");
    if (!isAuthorized) {
      return NextResponse.json({ error: "Sem permissão para criar pessoas." }, { status: 403 });
    }

    const churchId = session!.church_id;
    const { name, email, phone, birthDate, gender, kind, cellId, notes } = parsed.data;
    const supabase = getFirebaseAdminClient();

    const normalizedEmail = email.trim()
      ? email.trim().toLowerCase()
      : randomEmail(kind === "visitor" ? "visitante" : "membro");

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: "E-mail já está sendo utilizado por outro cadastro." }, { status: 409 });
    }

    const id = genId();
    const now = new Date().toISOString();

    const role = (kind === "leader" || kind === "pastor") ? "leader" : "member";

    const { error: userError } = await supabase.from("users").insert({
      id,
      church_id: churchId,
      email: normalizedEmail,
      password_hash: "",
      name: name.trim(),
      phone: phone.trim(),
      role,
      status: "active",
      avatar_color: `hsl(${Math.floor(Math.random() * 360)}, 40%, 55%)`,
      photo_url: null,
      birth_date: birthDate || null,
      gender,
      spouse_id: null,
      availability: [true, true, true, true, true, true, true],
      total_schedules: 0,
      confirm_rate: 100,
      must_change_password: false,
      last_served_at: null,
      notes,
      active: true,
      joined_at: now,
      created_at: now,
    });

    if (userError) throw userError;

    // If cell_id is specified, link in cell_members
    if (cellId) {
      const { error: cellMemberError } = await supabase.from("cell_members").insert({
        id: genId(),
        cell_id: cellId,
        user_id: id,
        status: "active",
        joined_at: now,
      });
      if (cellMemberError) {
        console.error("Erro ao vincular membro à célula:", cellMemberError);
      }
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("API people/create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar pessoa." },
      { status: 500 }
    );
  }
}
