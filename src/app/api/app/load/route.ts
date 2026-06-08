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
    { data: cells },
    { data: networks },
  ] = await Promise.all([
    supabase.from("churches").select("*").eq("id", churchId).maybeSingle(),
    supabase.from("departments").select("*").eq("church_id", churchId),
    supabase.from("department_members").select("department_id").eq("user_id", userId),
    // Necessário para derivar papéis (supervisor de rede / líder de célula) via
    // getPersonRoles — fonte única de papéis (docs/SERVOS-2.0-FUNDACAO-FASE1.md).
    supabase.from("cells").select("id, leader_ids, co_leader_ids, network_id").eq("church_id", churchId),
    supabase.from("cell_networks").select("id, supervisor_ids").eq("church_id", churchId),
  ]);

  return NextResponse.json({
    user: actor,
    church,
    departments: departments || [],
    departmentLinks: departmentLinks || [],
    cells: cells || [],
    networks: networks || [],
  });
}
