import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  decodeSessionToken,
  encodeSessionToken,
  getSessionFromCookieHeader,
} from "@/lib/auth/server-session";
import { adminAuth } from "@/lib/firebase-admin";

export async function GET(req: Request) {
  const cookieSession = getSessionFromCookieHeader(req.headers.get("cookie"));
  const headerSession = decodeSessionToken(req.headers.get("x-servos-auth"));
  const session = cookieSession || headerSession;

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const token = encodeSessionToken(session);
  // Não-fatal: a sessão do app vale pelo cookie/token próprio. Se a geração do
  // custom token do Firebase falhar, ainda autenticamos (apenas o login do
  // Firebase no cliente não acontece, mas a sessão do app segue válida).
  let firebaseToken: string | null = null;
  try {
    firebaseToken = await adminAuth.createCustomToken(session.user_id);
  } catch (error) {
    console.error("Falha ao gerar custom token na sessão:", error);
  }
  const response = NextResponse.json({ authenticated: true, session, token, firebaseToken });

  if (!cookieSession) {
    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
  }

  return response;
}
