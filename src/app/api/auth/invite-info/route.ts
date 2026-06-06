import { NextResponse } from "next/server";
import { z } from "zod";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { hashPasswordResetToken, isPasswordResetExpired } from "@/lib/auth/password-reset";

const bodySchema = z.object({
  token: z.string().min(1),
});

/**
 * Valida o token de convite e devolve os dados públicos do convidado para
 * a tela de conclusão de cadastro (boas-vindas + pré-preenchimento). O token
 * (48 chars, secreto) é a credencial — só quem o possui acessa estes dados.
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Token é obrigatório." }, { status: 400 });
    }

    const supabase = getFirebaseAdminClient();
    const tokenHash = hashPasswordResetToken(parsed.data.token);

    const { data: entry, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .select("id, user_id, church_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tokenError) throw tokenError;
    if (!entry || entry.used_at || isPasswordResetExpired(entry.expires_at)) {
      return NextResponse.json(
        { error: "Este convite é inválido ou expirou. Peça um novo à liderança." },
        { status: 400 }
      );
    }

    const [{ data: user }, { data: church }] = await Promise.all([
      supabase.from("users").select("*").eq("id", entry.user_id).eq("church_id", entry.church_id).maybeSingle(),
      supabase.from("churches").select("id, name").eq("id", entry.church_id).maybeSingle(),
    ]);

    if (!user) {
      return NextResponse.json({ error: "Cadastro não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      person: {
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        birthDate: user.birth_date || "",
        instagram: user.instagram || "",
        address: user.address || "",
        photoUrl: user.photo_url || "",
        avatarColor: user.avatar_color || "#F4532A",
        churchName: church?.name || "sua igreja",
      },
    });
  } catch (error) {
    console.error("API auth/invite-info error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao validar o convite." },
      { status: 500 }
    );
  }
}
