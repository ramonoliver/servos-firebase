import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const postSchema = z.object({
  departmentId: z.string().min(1),
  userId: z.string().min(1).optional(),
  functionName: z.string().default(""),
  functionNames: z.array(z.string().trim().min(1)).default([]),
  members: z
    .array(
      z.object({
        userId: z.string().min(1),
        functionName: z.string().default(""),
        functionNames: z.array(z.string().trim().min(1)).default([]),
      })
    )
    .default([]),
});

const deleteSchema = z.object({
  departmentId: z.string().min(1),
  departmentMemberId: z.string().min(1),
});

async function canManageDepartmentMember(params: {
  actorId: string;
  churchId: string;
  departmentId: string;
}) {
  const { actorId, churchId, departmentId } = params;
  const supabase = getFirebaseAdminClient();

  const [{ data: actor }, { data: department }] = await Promise.all([
    supabase
      .from("users")
      .select("id, role, church_id, active")
      .eq("id", actorId)
      .eq("church_id", churchId)
      .maybeSingle(),
    supabase
      .from("departments")
      .select("id, church_id, leader_ids, co_leader_ids")
      .eq("id", departmentId)
      .eq("church_id", churchId)
      .maybeSingle(),
  ]);

  if (!actor?.active || !department) return false;
  if (!can(actor, "member.edit", { departmentId, userDepartmentIds: [departmentId] })) {
    return false;
  }

  if (actor.role === "admin") return true;
  if ((department.leader_ids || []).includes(actorId)) return true;
  if ((department.co_leader_ids || []).includes(actorId)) return true;

  return false;
}

export async function POST(req: Request) {
  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para adicionar membro." }, { status: 400 });
    }

    const { session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const actorId = session!.user_id;
    const churchId = session!.church_id;
    const { departmentId, userId, functionName, functionNames, members } = parsed.data;
    const supabase = getFirebaseAdminClient();

    const allowed = await canManageDepartmentMember({ actorId, churchId, departmentId });
    if (!allowed) {
      return NextResponse.json({ error: "Sem permissao para alterar este ministerio." }, { status: 403 });
    }

    const normalizedMembers =
      members.length > 0
        ? members
        : userId
        ? [{ userId, functionName, functionNames }]
        : [];

    if (normalizedMembers.length === 0) {
      return NextResponse.json({ error: "Nenhum membro informado." }, { status: 400 });
    }

    const uniqueUserIds = [...new Set(normalizedMembers.map((item) => item.userId))];
    const [{ data: foundMembers, error: membersError }, { data: existingLinks, error: existingLinksError }] =
      await Promise.all([
        supabase
          .from("users")
          .select("id, church_id, active")
          .in("id", uniqueUserIds)
          .eq("church_id", churchId)
          .eq("active", true),
        supabase
          .from("department_members")
          .select("id, user_id")
          .eq("department_id", departmentId)
          .in("user_id", uniqueUserIds),
      ]);

    if (membersError) throw membersError;
    if (existingLinksError) throw existingLinksError;

    const activeMemberIds = new Set((foundMembers || []).map((member) => member.id));
    const linkedUserIds = new Set((existingLinks || []).map((link) => link.user_id));

    if (uniqueUserIds.some((id) => !activeMemberIds.has(id))) {
      return NextResponse.json({ error: "Um dos membros selecionados nao foi encontrado." }, { status: 404 });
    }

    if (uniqueUserIds.some((id) => linkedUserIds.has(id))) {
      return NextResponse.json({ error: "Um dos membros selecionados ja esta no ministerio." }, { status: 409 });
    }

    const { error } = await supabase.from("department_members").insert(
      normalizedMembers.map((item) => {
        const normalizedFunctionNames = item.functionNames.map((value) => value.trim()).filter(Boolean);
        const primaryFunction = normalizedFunctionNames[0] || item.functionName.trim();
        const mergedFunctionNames = primaryFunction
          ? [...new Set([primaryFunction, ...normalizedFunctionNames])]
          : normalizedFunctionNames;
        return {
        id: genId(),
        department_id: departmentId,
        user_id: item.userId,
        function_name: primaryFunction,
        function_names: mergedFunctionNames,
        joined_at: new Date().toISOString(),
      };
      })
    );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API department-members POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao adicionar membro ao ministerio." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = deleteSchema.safeParse({
      departmentId: url.searchParams.get("departmentId"),
      departmentMemberId: url.searchParams.get("departmentMemberId"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para remover membro." }, { status: 400 });
    }

    const { session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const actorId = session!.user_id;
    const churchId = session!.church_id;
    const { departmentId, departmentMemberId } = parsed.data;
    const supabase = getFirebaseAdminClient();

    const allowed = await canManageDepartmentMember({ actorId, churchId, departmentId });
    if (!allowed) {
      return NextResponse.json({ error: "Sem permissao para alterar este ministerio." }, { status: 403 });
    }

    const { data: departmentMember, error: departmentMemberError } = await supabase
      .from("department_members")
      .select("id, department_id")
      .eq("id", departmentMemberId)
      .eq("department_id", departmentId)
      .maybeSingle();

    if (departmentMemberError) throw departmentMemberError;
    if (!departmentMember) {
      return NextResponse.json({ error: "Vinculo do ministerio nao encontrado." }, { status: 404 });
    }

    const { error } = await supabase
      .from("department_members")
      .delete()
      .eq("id", departmentMemberId)
      .eq("department_id", departmentId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API department-members DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao remover membro do ministerio." },
      { status: 500 }
    );
  }
}
