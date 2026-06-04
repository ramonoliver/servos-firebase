import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppBaseUrl } from "@/lib/invitations";
import { sendPasswordResetEmail } from "@/lib/email/send";
import {
  createPasswordResetToken,
  getPasswordResetExpiryDate,
  hashPasswordResetToken,
} from "@/lib/auth/password-reset";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

const bodySchema = z.object({
  email: z.string().trim().email(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Email invalido." }, { status: 400 });
    }

    const supabase = getFirebaseAdminClient();
    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, name, church_id, active")
      .eq("email", normalizedEmail)
      .eq("active", true)
      .maybeSingle();

    if (error) throw error;
    if (!user) {
      return NextResponse.json({ success: true });
    }

    const rawToken = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(rawToken);
    const expiresAt = getPasswordResetExpiryDate();

    const { error: cleanupError } = await supabase
      .from("password_reset_tokens")
      .delete()
      .eq("user_id", user.id);

    if (cleanupError) throw cleanupError;

    const { error: tokenInsertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        church_id: user.church_id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (tokenInsertError) throw tokenInsertError;

    const { data: church } = await supabase
      .from("churches")
      .select("name")
      .eq("id", user.church_id)
      .maybeSingle();

    const resetUrl = `${getAppBaseUrl()}/redefinir-senha?token=${rawToken}`;

    await sendPasswordResetEmail({
      to: user.email,
      memberName: user.name,
      resetUrl,
      churchName: church?.name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API auth/forgot-password error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao solicitar redefinicao de senha." },
      { status: 500 }
    );
  }
}
