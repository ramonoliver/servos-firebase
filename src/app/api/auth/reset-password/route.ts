import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { getFirebaseAdminClient, adminAuth } from "@/lib/firebase-admin";
import { hashPasswordResetToken, isPasswordResetExpired } from "@/lib/auth/password-reset";

const bodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
  confirmPassword: z.string().min(6),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para redefinir a senha." }, { status: 400 });
    }

    const { token, newPassword, confirmPassword } = parsed.data;

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "As senhas nao coincidem." }, { status: 400 });
    }

    const supabase = getFirebaseAdminClient();
    const tokenHash = hashPasswordResetToken(token);

    const { data: resetEntry, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .select("id, user_id, church_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenError) throw tokenError;
    if (!resetEntry || resetEntry.used_at || isPasswordResetExpired(resetEntry.expires_at)) {
      return NextResponse.json({ error: "Este link de redefinicao e invalido ou expirou." }, { status: 400 });
    }

    // Update password in Firebase Auth
    await adminAuth.updateUser(resetEntry.user_id, {
      password: newPassword,
    });

    const { error: updateUserError } = await supabase
      .from("users")
      .update({
        password_hash: hashPassword(newPassword),
        must_change_password: false,
      })
      .eq("id", resetEntry.user_id)
      .eq("church_id", resetEntry.church_id);

    if (updateUserError) throw updateUserError;

    const { error: markUsedError } = await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", resetEntry.id);

    if (markUsedError) throw markUsedError;

    const { error: cleanupError } = await supabase
      .from("password_reset_tokens")
      .delete()
      .eq("user_id", resetEntry.user_id)
      .neq("id", resetEntry.id);

    if (cleanupError) throw cleanupError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API auth/reset-password error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao redefinir a senha." },
      { status: 500 }
    );
  }
}
