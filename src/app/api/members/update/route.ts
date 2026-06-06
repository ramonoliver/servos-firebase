import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";
import { firstLastSlug, resolveUniqueSlug } from "@/lib/utils/slug";


const selectedDepartmentSchema = z.object({
  department_id: z.string().min(1),
  function_name: z.string().default(""),
  function_names: z.array(z.string().trim().min(1)).default([]),
});

const bodySchema = z.object({
  memberId: z.string().min(1),
  updates: z.object({
    name: z.string().trim().min(1),
    email: z.string().trim().email(),
    phone: z.string().trim().default(""),
    role: z.enum(["admin", "leader", "member"]),
    status: z.enum(["active", "inactive", "paused", "vacation"]),
    spouse_id: z.string().nullable(),
    photo_url: z.string().nullable().optional(),
    cell_role: z.enum(["pastor", "coordenacao"]).nullable().optional(),
    cell_id: z.string().nullable().optional(),
    birth_date: z.string().nullable().optional(),
    instagram: z.string().trim().default(""),
    address: z.string().trim().default(""),
    address_cep: z.string().trim().optional(),
    address_street: z.string().trim().optional(),
    address_number: z.string().trim().optional(),
    address_complement: z.string().trim().optional(),
    address_neighborhood: z.string().trim().optional(),
    address_city: z.string().trim().optional(),
    address_state: z.string().trim().max(2).optional(),
    notes: z.string().trim().default(""),
    baptized: z.boolean().optional(),
    in_discipleship: z.boolean().optional(),
  }),
  selectedDepartments: z.array(selectedDepartmentSchema).default([]),
  spouseId: z.string().default(""),
});

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") return false;
  const message =
    "message" in error ? String((error as { message?: unknown }).message || "").toLowerCase() : "";
  return message.includes("column") && message.includes(columnName.toLowerCase()) && message.includes("does not exist");
}

function normalizeDepartmentSelection(
  items: Array<{
    department_id: string;
    function_name?: string;
    function_names?: string[];
  }>
) {
  return items
    .map((item) => {
      const functionNames = (item.function_names || [])
        .map((value) => value.trim())
        .filter(Boolean);
      const primaryFunction = item.function_name?.trim() || functionNames[0] || "";
      const mergedFunctionNames = primaryFunction
        ? [...new Set([primaryFunction, ...functionNames])].sort((a, b) => a.localeCompare(b))
        : [...new Set(functionNames)].sort((a, b) => a.localeCompare(b));

      return {
        department_id: item.department_id,
        function_name: primaryFunction,
        function_names: mergedFunctionNames,
      };
    })
    .sort((a, b) => a.department_id.localeCompare(b.department_id));
}

function sameDepartmentSelection(
  currentItems: Array<{
    department_id: string;
    function_name?: string;
    function_names?: string[];
  }>,
  nextItems: Array<{
    department_id: string;
    function_name?: string;
    function_names?: string[];
  }>
) {
  const current = normalizeDepartmentSelection(currentItems);
  const next = normalizeDepartmentSelection(nextItems);

  if (current.length !== next.length) return false;

  return current.every((item, index) => {
    const other = next[index];
    return (
      item.department_id === other.department_id &&
      item.function_name === other.function_name &&
      item.function_names.join("|") === other.function_names.join("|")
    );
  });
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para atualizar membro." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req, {
      select: "id, role, cell_role, church_id, active",
    });
    if (errorResponse) return errorResponse;

    const actorId = session!.user_id;
    const churchId = session!.church_id;
    const { memberId, updates, selectedDepartments, spouseId } = parsed.data;
    const supabase = getFirebaseAdminClient();
    const requestedDepartmentSelection = selectedDepartments as Array<{
      department_id: string;
      function_name?: string;
      function_names?: string[];
    }>;

    const [{ data: member, error: memberError }, { data: currentDepartmentMembers, error: currentDepartmentMembersError }] =
      await Promise.all([
        supabase
        .from("users")
        .select("id, church_id, spouse_id, active, role, cell_id")
        .eq("id", memberId)
        .eq("church_id", churchId)
        .maybeSingle(),
        supabase
          .from("department_members")
          .select("department_id, function_name, function_names")
          .eq("user_id", memberId),
      ]);
    if (memberError) throw memberError;
    if (currentDepartmentMembersError) throw currentDepartmentMembersError;

    // Check permission using the matrix:
    const isSystemAdmin = actor.role === "admin";
    const isPastor = actor.cell_role === "pastor";
    let hasEditPermission = isSystemAdmin || isPastor;

    if (!hasEditPermission && actor.role === "leader") {
      // 1. Cell leader check
      if (member.cell_id) {
        const { data: targetCell } = await supabase
          .from("cells")
          .select("id, leader_ids, co_leader_ids, network_id")
          .eq("id", member.cell_id)
          .maybeSingle();

        if (targetCell) {
          const cellLeaders = [...(targetCell.leader_ids || []), ...(targetCell.co_leader_ids || [])];
          if (cellLeaders.includes(actorId)) {
            hasEditPermission = true;
          }

          // 2. Supervision check
          if (!hasEditPermission && targetCell.network_id) {
            const { data: targetNetwork } = await supabase
              .from("cell_networks")
              .select("id, supervisor_ids")
              .eq("id", targetCell.network_id)
              .maybeSingle();

            if (targetNetwork && (targetNetwork.supervisor_ids || []).includes(actorId)) {
              hasEditPermission = true;
            }
          }
        }
      }

      // 3. Ministry leader check
      if (!hasEditPermission) {
        const { data: allDepts } = await supabase
          .from("departments")
          .select("id, leader_ids, co_leader_ids")
          .eq("church_id", churchId);

        const ledDeptIds = (allDepts || [])
          .filter((d) => [...(d.leader_ids || []), ...(d.co_leader_ids || [])].includes(actorId))
          .map((d) => d.id);

        const targetDeptIds = (currentDepartmentMembers || []).map((dm) => dm.department_id);
        const hasDeptOverlap = targetDeptIds.some((id) => ledDeptIds.includes(id));

        if (hasDeptOverlap) {
          hasEditPermission = true;
        }
      }
    }

    if (!actor?.active || !hasEditPermission) {
      return NextResponse.json({ error: "Sem permissao para editar este membro." }, { status: 403 });
    }

    // Only admin/pastor may assign the cell_role (pastor/coordenação).
    if ((updates as { cell_role?: unknown }).cell_role !== undefined) {
      const canAssignCellRole = isSystemAdmin || isPastor;
      if (!canAssignCellRole) delete (updates as { cell_role?: unknown }).cell_role;
    }

    if (!member.active && !isSystemAdmin) {
      return NextResponse.json({ error: "Somente administradores podem editar membros desativados." }, { status: 403 });
    }

    if (actor.role === "leader" && member.id === actorId) {
      return NextResponse.json(
        { error: "Use a tela de perfil para editar os seus proprios dados." },
        { status: 400 }
      );
    }

    const normalizedEmail = updates.email.trim().toLowerCase();
    const { data: existingEmailUser, error: existingEmailError } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .neq("id", memberId)
      .maybeSingle();

    if (existingEmailError) throw existingEmailError;
    if (existingEmailUser) {
      return NextResponse.json({ error: "Ja existe outro membro com este email." }, { status: 409 });
    }

    if (spouseId) {
      const { data: spouse, error: spouseError } = await supabase
        .from("users")
        .select("id, church_id, active, spouse_id")
        .eq("id", spouseId)
        .eq("church_id", churchId)
        .maybeSingle();

      if (spouseError) throw spouseError;
      if (!spouse?.active) {
        return NextResponse.json({ error: "Conjuge informado nao foi encontrado." }, { status: 404 });
      }
      if (spouse.id === memberId) {
        return NextResponse.json({ error: "Um membro nao pode ser vinculado a si mesmo." }, { status: 400 });
      }
      if (spouse.spouse_id && spouse.spouse_id !== memberId) {
        return NextResponse.json(
          { error: "O conjuge selecionado ja esta vinculado a outra pessoa." },
          { status: 409 }
        );
      }
    }

    // Regenerar slug se o nome mudou — ou gerar pela primeira vez se a pessoa ainda não tem slug
    let slugUpdate: Record<string, string> = {};
    const nameChanged = Boolean(updates.name && updates.name.trim() !== (member as any).name);
    const missingSlug = !(member as any).slug;
    if (nameChanged || missingSlug) {
      const churchId2 = churchId;
      const slugSource = (updates.name?.trim() || (member as any).name || "").trim();
      const baseSlug = firstLastSlug(slugSource);
      const newSlug = await resolveUniqueSlug(baseSlug, async (candidate) => {
        const { data } = await supabase
          .from("users")
          .select("id")
          .eq("slug", candidate)
          .eq("church_id", churchId2)
          .neq("id", memberId)
          .maybeSingle();
        return Boolean(data);
      });
      slugUpdate = { slug: newSlug };
    }

    const normalizedAddress = {
      ...updates,
      address_state: updates.address_state?.toUpperCase() || updates.address_state,
    };

    const { error: updateUserError } = await supabase
      .from("users")
      .update({
        ...normalizedAddress,
        ...slugUpdate,
        email: normalizedEmail,
        spouse_id: spouseId || null,
      })
      .eq("id", memberId)
      .eq("church_id", churchId);

    if (updateUserError) throw updateUserError;

    const currentDepartmentSelection = (currentDepartmentMembers || []) as Array<{
      department_id: string;
      function_name?: string;
      function_names?: string[];
    }>;

    if (!sameDepartmentSelection(currentDepartmentSelection, requestedDepartmentSelection)) {
      const { error: deleteDMError } = await supabase
        .from("department_members")
        .delete()
        .eq("user_id", memberId);

      if (deleteDMError) throw deleteDMError;

      if (requestedDepartmentSelection.length > 0) {
        const payload = normalizeDepartmentSelection(requestedDepartmentSelection).map((dept) => ({
          id: genId(),
          department_id: dept.department_id,
          user_id: memberId,
          function_name: dept.function_name,
          function_names: dept.function_names,
          joined_at: new Date().toISOString(),
        }));

        let insertDMError = (
          await supabase
            .from("department_members")
            .insert(payload)
        ).error;

        if (insertDMError && isMissingColumnError(insertDMError, "function_names")) {
          insertDMError = (
            await supabase
              .from("department_members")
              .insert(
                payload.map(({ function_names, ...dept }) => dept)
              )
          ).error;
        }

        if (insertDMError) throw insertDMError;
      }
    }

    if (member.spouse_id && member.spouse_id !== spouseId) {
      const { error: previousSpouseClearError } = await supabase
        .from("users")
        .update({ spouse_id: null })
        .eq("id", member.spouse_id)
        .eq("church_id", churchId);

      if (previousSpouseClearError) {
        console.error("Erro ao desvincular conjuge anterior:", previousSpouseClearError);
      }
    }

    if (spouseId && spouseId !== member.spouse_id) {
      const { error: spouseSetError } = await supabase
        .from("users")
        .update({ spouse_id: memberId })
        .eq("id", spouseId)
        .eq("church_id", churchId);

      if (spouseSetError) {
        console.error("Erro ao vincular conjuge:", spouseSetError);
      }
    }

    if (!spouseId && member.spouse_id) {
      const { error: spouseClearError } = await supabase
        .from("users")
        .update({ spouse_id: null })
        .eq("id", member.spouse_id)
        .eq("church_id", churchId);

      if (spouseClearError) {
        console.error("Erro ao desvincular conjuge:", spouseClearError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API members/update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar membro." },
      { status: 500 }
    );
  }
}
