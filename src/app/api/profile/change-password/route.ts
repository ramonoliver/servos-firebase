import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getFirebaseAdminClient, adminAuth } from "@/lib/firebase-admin";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
  confirmPassword: z.string().min(6),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para alterar senha." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req, {
      select: "id, church_id, active, password_hash",
    });
    if (errorResponse) return errorResponse;

    const { currentPassword, newPassword, confirmPassword } = parsed.data;

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "As senhas nao coincidem." }, { status: 400 });
    }

    const supabase = getFirebaseAdminClient();
    if (!actor?.active) {
      return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    }

    if (!verifyPassword(currentPassword, actor.password_hash)) {
      return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
    }

    // Update password in Firebase Auth
    await adminAuth.updateUser(actor.id, {
      password: newPassword,
    });

    const { error: updateError } = await supabase
      .from("users")
      .update({
        password_hash: hashPassword(newPassword),
        must_change_password: false,
      })
      .eq("id", actor.id)
      .eq("church_id", session!.church_id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API profile/change-password error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao alterar senha." },
      { status: 500 }
    );
  }
}
