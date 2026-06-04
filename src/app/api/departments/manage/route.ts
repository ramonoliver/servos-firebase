import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const departmentDataSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().default(""),
  icon: z.string().min(1),
  color: z.string().min(1),
  function_names: z.array(z.string().trim().min(1)).default([]),
  leader_ids: z.array(z.string()).default([]),
  co_leader_ids: z.array(z.string()).default([]),
});

const bodySchema = z.object({
  mode: z.enum(["create", "update", "delete"]),
  departmentId: z.string().optional(),
  data: departmentDataSchema.optional(),
  memberIds: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para gerenciar ministerio." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const { mode, departmentId, data, memberIds } = parsed.data;
    const supabase = getFirebaseAdminClient();
    if (!actor?.active) {
      return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    }

    const requiredAction =
      mode === "create" ? "department.create" : mode === "update" ? "department.edit" : "department.delete";

    if (!can(actor.role, requiredAction)) {
      return NextResponse.json({ error: "Sem permissao para gerenciar ministerios." }, { status: 403 });
    }

    if (mode === "create") {
      if (!data) {
        return NextResponse.json({ error: "Dados do ministerio sao obrigatorios." }, { status: 400 });
      }

      const deptId = genId();
      const { error } = await supabase.from("departments").insert({
        id: deptId,
        church_id: churchId,
        ...data,
        active: true,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;

      const now = new Date().toISOString();
      const dmRows = [
        ...data.leader_ids.map((uid) => ({
          id: genId(), department_id: deptId, user_id: uid,
          function_name: "Líder", function_names: ["Líder"], joined_at: now,
        })),
        ...data.co_leader_ids.map((uid) => ({
          id: genId(), department_id: deptId, user_id: uid,
          function_name: "Co-líder", function_names: ["Co-líder"], joined_at: now,
        })),
        ...memberIds
          .filter((uid) => !data.leader_ids.includes(uid) && !data.co_leader_ids.includes(uid))
          .map((uid) => ({
            id: genId(), department_id: deptId, user_id: uid,
            function_name: "Membro", function_names: ["Membro"], joined_at: now,
          })),
      ];

      if (dmRows.length > 0) {
        const { error: dmError } = await supabase.from("department_members").insert(dmRows);
        if (dmError) throw dmError;
      }

      return NextResponse.json({ success: true });
    }

    if (!departmentId) {
      return NextResponse.json({ error: "Ministerio nao informado." }, { status: 400 });
    }

    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .select("id, church_id")
      .eq("id", departmentId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (departmentError) throw departmentError;
    if (!department) {
      return NextResponse.json({ error: "Ministerio nao encontrado." }, { status: 404 });
    }

    if (mode === "update") {
      if (!data) {
        return NextResponse.json({ error: "Dados do ministerio sao obrigatorios." }, { status: 400 });
      }

      const { error } = await supabase
        .from("departments")
        .update(data)
        .eq("id", departmentId)
        .eq("church_id", churchId);
      if (error) throw error;

      const { data: existingDM } = await supabase
        .from("department_members")
        .select("id, user_id")
        .eq("department_id", departmentId);

      const typedDM = (existingDM || []) as { id: string; user_id: string }[];
      const existingIds = new Set(typedDM.map((dm) => dm.user_id));
      const now = new Date().toISOString();

      const allDesiredIds = [
        ...data.leader_ids,
        ...data.co_leader_ids,
        ...memberIds.filter(
          (uid) => !data.leader_ids.includes(uid) && !data.co_leader_ids.includes(uid)
        ),
      ];
      const desiredSet = new Set(allDesiredIds);

      const toRemove = typedDM
        .filter((dm) => !desiredSet.has(dm.user_id))
        .map((dm) => dm.id);
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase.from("department_members").delete().in("id", toRemove);
        if (removeError) throw removeError;
      }

      const toAdd = allDesiredIds.filter((uid) => !existingIds.has(uid));
      const newRows = toAdd.map((uid) => {
        const fn = data.leader_ids.includes(uid)
          ? "Líder"
          : data.co_leader_ids.includes(uid)
          ? "Co-líder"
          : "Membro";
        return {
          id: genId(), department_id: departmentId, user_id: uid,
          function_name: fn, function_names: [fn], joined_at: now,
        };
      });
      if (newRows.length > 0) {
        const { error: dmError } = await supabase.from("department_members").insert(newRows);
        if (dmError) throw dmError;
      }

      return NextResponse.json({ success: true });
    }

    const { error: deleteDMError } = await supabase
      .from("department_members")
      .delete()
      .eq("department_id", departmentId);

    if (deleteDMError) throw deleteDMError;

    const { error: deleteDepartmentError } = await supabase
      .from("departments")
      .delete()
      .eq("id", departmentId)
      .eq("church_id", churchId);

    if (deleteDepartmentError) throw deleteDepartmentError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API departments/manage error:", error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
        ? String((error as any).message)
        : "Falha ao gerenciar ministerio.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
