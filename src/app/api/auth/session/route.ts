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
  const firebaseToken = await adminAuth.createCustomToken(session.user_id);
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
