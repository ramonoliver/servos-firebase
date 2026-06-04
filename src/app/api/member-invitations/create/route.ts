import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { deliverMemberInvitation } from "@/lib/server/member-invitations";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const selectedDepartmentSchema = z.object({
  department_id: z.string().min(1),
  function_name: z.string().default(""),
  function_names: z.array(z.string().trim().min(1)).default([]),
});

const bodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().optional().default(""),
  role: z.enum(["member", "leader", "admin"]),
  spouseId: z.string().optional().default(""),
  photoUrl: z.string().nullable().optional(),
  selectedDepartments: z.array(selectedDepartmentSchema).default([]),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para criar convite." }, { status: 400 });
    }

    const {
      name,
      email,
      phone,
      role,
      spouseId,
      photoUrl,
      selectedDepartments,
    } = parsed.data;

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;
    if (!actor?.active || !can(actor.role, "member.invite")) {
      return NextResponse.json({ error: "Sem permissao para convidar membros." }, { status: 403 });
    }

    const churchId = session!.church_id;
    const invitedByUserId = session!.user_id;
    const supabase = getFirebaseAdminClient();
    const normalizedEmail = email.trim().toLowerCase();

    const { data: church, error: churchError } = await supabase
      .from("churches")
      .select("id, name")
      .eq("id", churchId)
      .maybeSingle();

    if (churchError) throw churchError;
    if (!church) {
      return NextResponse.json({ error: "Igreja nao encontrada." }, { status: 404 });
    }

    const { data: existingUser, error: existingUserError } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUserError) throw existingUserError;
    if (existingUser) {
      return NextResponse.json({ error: "Email ja cadastrado." }, { status: 409 });
    }

    const tempPassword = generateTempPassword();
    const now = new Date().toISOString();
    const newUserId = genId();

    const { data: newUser, error: newUserError } = await supabase
      .from("users")
      .insert({
        id: newUserId,
        church_id: churchId,
        email: normalizedEmail,
        password_hash: hashPassword(tempPassword),
        name: name.trim(),
        phone: phone.trim(),
        role,
        status: "active",
        avatar_color: `hsl(${Math.floor(Math.random() * 360)}, 40%, 55%)`,
        photo_url: photoUrl ?? null,
        spouse_id: spouseId || null,
        availability: [true, true, true, true, true, true, true],
        total_schedules: 0,
        confirm_rate: 100,
        must_change_password: true,
        last_served_at: null,
        notes: "",
        active: true,
        joined_at: now,
        created_at: now,
      })
      .select("id, name, email")
      .single();

    if (newUserError || !newUser) {
      throw newUserError || new Error("Falha ao criar usuario.");
    }

    if (selectedDepartments.length > 0) {
      const { error: deptMemberError } = await supabase
        .from("department_members")
        .insert(
          selectedDepartments.map((dept) => {
            const normalizedFunctionNames = dept.function_names.map((value) => value.trim()).filter(Boolean);
            const primaryFunction = normalizedFunctionNames[0] || dept.function_name.trim();
            const mergedFunctionNames = primaryFunction
              ? [...new Set([primaryFunction, ...normalizedFunctionNames])]
              : normalizedFunctionNames;
            return {
            id: genId(),
            department_id: dept.department_id,
            user_id: newUser.id,
            function_name: primaryFunction,
            function_names: mergedFunctionNames,
            joined_at: now,
          };
          })
        );

      if (deptMemberError) throw deptMemberError;
    }

    if (spouseId) {
      const { error: spouseUpdateError } = await supabase
        .from("users")
        .update({ spouse_id: newUser.id })
        .eq("id", spouseId)
        .eq("church_id", churchId);

      if (spouseUpdateError) {
        console.error("Erro ao atualizar conjuge:", spouseUpdateError);
      }
    }

    const { error: notificationError } = await supabase
      .from("notifications")
      .insert({
        id: genId(),
        user_id: newUser.id,
        church_id: churchId,
        title: "Bem-vindo ao Servos!",
        body: "Configure sua disponibilidade e comece a servir.",
        icon: "wave",
        type: "welcome",
        read: false,
        action_url: "/perfil",
        created_at: now,
      });

    if (notificationError) {
      console.error("Erro ao criar notificacao:", notificationError);
    }

    const delivery = await deliverMemberInvitation({
      to: normalizedEmail,
      phone: phone.trim(),
      memberName: name.trim(),
      churchName: church.name,
      tempPassword,
      userId: newUser.id,
      churchId,
      invitedByUserId,
    });

    return NextResponse.json({
      success: true,
      member: newUser,
      tempPassword,
      delivery,
    });
  } catch (error) {
    console.error("API member-invitations create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar convite." },
      { status: 500 }
    );
  }
}
