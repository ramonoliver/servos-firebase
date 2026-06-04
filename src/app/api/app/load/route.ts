import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

export async function GET(req: Request) {
  const { actor, session, errorResponse } = await requireApiActor(req, { select: "*" });
  if (errorResponse) return errorResponse;

  const supabase = getFirebaseAdminClient();
  const churchId = session!.church_id;
  const userId = session!.user_id;

  const [
    { data: church },
    { data: departments },
    { data: departmentLinks },
  ] = await Promise.all([
    supabase.from("churches").select("*").eq("id", churchId).maybeSingle(),
    supabase.from("departments").select("*").eq("church_id", churchId),
    supabase.from("department_members").select("department_id").eq("user_id", userId),
  ]);

  return NextResponse.json({
    user: actor,
    church,
    departments: departments || [],
    departmentLinks: departmentLinks || [],
  });
}
