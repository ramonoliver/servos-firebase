import { NextResponse } from "next/server";
import { decodeSessionToken, getSessionFromCookieHeader } from "@/lib/auth/server-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

type RequireActorOptions = {
  select?: string;
};

export function requireApiSession(req: Request) {
  const cookieHeader = req.headers.get("cookie");
  const tokenHeader = req.headers.get("x-servos-auth");
  const cookieSession = getSessionFromCookieHeader(cookieHeader);
  const headerSession = decodeSessionToken(tokenHeader);
  const session = cookieSession || headerSession;

  if (!session) {
    return {
      session: null,
      errorResponse: NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 }),
    };
  }

  return { session, errorResponse: null };
}

export async function requireApiActor(req: Request, options: RequireActorOptions = {}) {
  const { session, errorResponse } = requireApiSession(req);
  if (!session) {
    return { session: null, actor: null, errorResponse };
  }

  const supabase = getFirebaseAdminClient();
  const { data: actor, error } = await supabase
    .from("users")
    .select(options.select || "id, role, church_id, active")
    .eq("id", session.user_id)
    .eq("church_id", session.church_id)
    .maybeSingle();

  if (error) {
    return {
      session,
      actor: null,
      errorResponse: NextResponse.json({ error: error.message }, { status: 500 }),
    };
  }

  if (!actor) {
    return {
      session,
      actor: null,
      errorResponse: NextResponse.json({ error: "Usuario autenticado nao encontrado." }, { status: 401 }),
    };
  }

  return { session, actor, errorResponse: null };
}
