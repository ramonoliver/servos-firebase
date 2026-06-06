import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { AUTH_COOKIE_NAME, createSessionPayload, encodeSessionToken } from "@/lib/auth/server-session";
import { getFirebaseAdminClient, adminAuth } from "@/lib/firebase-admin";
import { hashPasswordResetToken, isPasswordResetExpired } from "@/lib/auth/password-reset";
import { firstLastSlug, resolveUniqueSlug } from "@/lib/utils/slug";
import { notifyUser } from "@/services/notification.service";
import type { User } from "@/types";

const bodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
  confirmPassword: z.string().min(6),
  profile: z
    .object({
      name: z.string().trim().min(1).optional(),
      phone: z.string().trim().optional(),
      birthDate: z.string().trim().optional(),
      instagram: z.string().trim().optional(),
      address: z.string().trim().optional(),
      addressCep: z.string().trim().optional(),
      addressStreet: z.string().trim().optional(),
      addressNumber: z.string().trim().optional(),
      addressComplement: z.string().trim().optional(),
      addressNeighborhood: z.string().trim().optional(),
      addressCity: z.string().trim().optional(),
      addressState: z.string().trim().max(2).optional(),
      photoUrl: z.string().optional(),
    })
    .default({}),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para concluir o cadastro." }, { status: 400 });
    }

    const { token, newPassword, confirmPassword, profile } = parsed.data;
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "As senhas não coincidem." }, { status: 400 });
    }

    const supabase = getFirebaseAdminClient();
    const tokenHash = hashPasswordResetToken(token);

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

    const { data: currentUser } = await supabase
      .from("users")
      .select("*")
      .eq("id", entry.user_id)
      .eq("church_id", entry.church_id)
      .maybeSingle();

    if (!currentUser) {
      return NextResponse.json({ error: "Cadastro não encontrado." }, { status: 404 });
    }

    const finalName = (profile.name?.trim() || currentUser.name || "").trim();

    // Define a senha no Firebase Auth (cria o usuário caso não exista ainda).
    try {
      await adminAuth.updateUser(entry.user_id, {
        password: newPassword,
        displayName: finalName || undefined,
      });
    } catch (authErr: any) {
      if (authErr?.code === "auth/user-not-found") {
        await adminAuth.createUser({
          uid: entry.user_id,
          email: currentUser.email,
          password: newPassword,
          displayName: finalName || undefined,
        });
      } else {
        throw authErr;
      }
    }

    // Monta os campos de perfil a atualizar (só os enviados).
    const updates: Record<string, unknown> = {
      password_hash: hashPassword(newPassword),
      must_change_password: false,
      active: true,
      status: "active",
    };
    if (!currentUser.joined_at) updates.joined_at = new Date().toISOString();
    if (profile.name !== undefined) updates.name = finalName;
    if (profile.phone !== undefined) updates.phone = profile.phone.trim();
    if (profile.birthDate !== undefined) updates.birth_date = profile.birthDate.trim() || null;
    if (profile.instagram !== undefined) updates.instagram = profile.instagram.trim();
    if (profile.address !== undefined) updates.address = profile.address.trim();
    if (profile.addressCep !== undefined) updates.address_cep = profile.addressCep.trim();
    if (profile.addressStreet !== undefined) updates.address_street = profile.addressStreet.trim();
    if (profile.addressNumber !== undefined) updates.address_number = profile.addressNumber.trim();
    if (profile.addressComplement !== undefined) updates.address_complement = profile.addressComplement.trim();
    if (profile.addressNeighborhood !== undefined) updates.address_neighborhood = profile.addressNeighborhood.trim();
    if (profile.addressCity !== undefined) updates.address_city = profile.addressCity.trim();
    if (profile.addressState !== undefined) updates.address_state = profile.addressState.trim().toUpperCase();
    if (profile.photoUrl !== undefined && profile.photoUrl) updates.photo_url = profile.photoUrl;

    // (Re)gera o slug amigável se o nome mudou ou se ainda não há slug.
    const nameChanged = Boolean(profile.name && finalName !== currentUser.name);
    if ((nameChanged || !currentUser.slug) && finalName) {
      const baseSlug = firstLastSlug(finalName);
      updates.slug = await resolveUniqueSlug(baseSlug, async (candidate) => {
        const { data } = await supabase
          .from("users")
          .select("id")
          .eq("slug", candidate)
          .eq("church_id", entry.church_id)
          .neq("id", entry.user_id)
          .maybeSingle();
        return Boolean(data);
      });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", entry.user_id)
      .eq("church_id", entry.church_id);
    if (updateError) throw updateError;

    // Invalida o token usado e limpa os demais do usuário.
    await supabase.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("id", entry.id);
    await supabase.from("password_reset_tokens").delete().eq("user_id", entry.user_id).neq("id", entry.id);

    // Notificação centralizada: cadastro concluído (não-fatal).
    try {
      await notifyUser({
        userId: entry.user_id,
        churchId: entry.church_id,
        category: "system",
        title: "Cadastro concluído! 🎉",
        message: `Que bom ter você no Servos${finalName ? ", " + finalName.split(" ")[0] : ""}! Seu acesso está liberado.`,
        dedupeKey: `welcome:${entry.user_id}`,
        content: { clickUrl: "/dashboard" },
      });
    } catch (notifyErr) {
      console.error("Falha ao notificar cadastro concluído:", notifyErr);
    }

    // Busca o usuário já atualizado e cria a sessão (auto-login).
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", entry.user_id)
      .eq("church_id", entry.church_id)
      .maybeSingle();

    const finalUser = user || { ...currentUser, ...updates };
    const session = createSessionPayload(finalUser as User);
    const sessionToken = encodeSessionToken(session);

    // O cadastro já está concluído (senha + perfil + sessão por cookie). O custom
    // token é só para o login automático no Firebase client — se falhar, não
    // invalidamos o cadastro: o cliente segue com a sessão por cookie.
    let firebaseToken: string | null = null;
    try {
      firebaseToken = await adminAuth.createCustomToken(entry.user_id);
    } catch (tokenErr) {
      console.error("Falha ao gerar custom token (login automático):", tokenErr);
    }

    const clientUser = {
      id: finalUser.id,
      church_id: finalUser.church_id,
      email: finalUser.email,
      name: finalUser.name,
      role: finalUser.role,
      avatar_color: finalUser.avatar_color,
      photo_url: finalUser.photo_url,
    } satisfies Pick<User, "id" | "church_id" | "email" | "name" | "role" | "avatar_color" | "photo_url">;

    const response = NextResponse.json({
      success: true,
      session,
      token: sessionToken,
      firebaseToken,
      user: clientUser,
    });
    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    console.error("API auth/complete-registration error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao concluir o cadastro." },
      { status: 500 }
    );
  }
}
