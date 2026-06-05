import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

const bodySchema = z.object({
  targetUserId: z.string().min(1),
  action: z.enum(["deactivate", "reactivate", "hard_delete"]).default("deactivate"),
});

function isIgnorableCleanupError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const message =
    "message" in error ? String((error as { message?: unknown }).message || "").toLowerCase() : "";

  return (
    code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("relation") && message.includes("does not exist") ||
    message.includes("column") && message.includes("does not exist")
  );
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para remover membro." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req, {
      select: "id, role, cell_role, church_id, active",
    });
    if (errorResponse) return errorResponse;

    const actorId = session!.user_id;
    const churchId = session!.church_id;
    const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { targetUserId, action } = parsed.data;
    if (actorId === targetUserId) {
      return NextResponse.json({ error: "Voce nao pode alterar a propria conta por esta acao." }, { status: 400 });
    }

    const supabase = getFirebaseAdminClient();
    const { data: target, error: targetError } = await supabase
        .from("users")
        .select("id, church_id, spouse_id, active, status, role, cell_id")
        .eq("id", targetUserId)
        .eq("church_id", churchId)
        .maybeSingle();
    if (targetError) throw targetError;

    if (!target) {
      return NextResponse.json({ error: "Membro nao encontrado." }, { status: 404 });
    }

    // Check permission using the matrix:
    const isSystemAdmin = actor.role === "admin";
    const isPastor = actor.cell_role === "pastor";
    let hasRemovePermission = isSystemAdmin || isPastor;

    if (!hasRemovePermission && actor.role === "leader") {
      if (target.role !== "admin") {
        // 1. Cell leader check
        if (target.cell_id) {
          const { data: targetCell } = await supabase
            .from("cells")
            .select("id, leader_ids, co_leader_ids, network_id")
            .eq("id", target.cell_id)
            .maybeSingle();

          if (targetCell) {
            const cellLeaders = [...(targetCell.leader_ids || []), ...(targetCell.co_leader_ids || [])];
            if (cellLeaders.includes(actorId)) {
              hasRemovePermission = true;
            }

            // 2. Supervision check
            if (!hasRemovePermission && targetCell.network_id) {
              const { data: targetNetwork } = await supabase
                .from("cell_networks")
                .select("id, supervisor_ids")
                .eq("id", targetCell.network_id)
                .maybeSingle();

              if (targetNetwork && (targetNetwork.supervisor_ids || []).includes(actorId)) {
                hasRemovePermission = true;
              }
            }
          }
        }

        // 3. Ministry leader check
        if (!hasRemovePermission) {
          const { data: allDepts } = await supabase
            .from("departments")
            .select("id, leader_ids, co_leader_ids")
            .eq("church_id", churchId);

          const ledDeptIds = (allDepts || [])
            .filter((d) => [...(d.leader_ids || []), ...(d.co_leader_ids || [])].includes(actorId))
            .map((d) => d.id);

          const { data: targetDeptMembers } = await supabase
            .from("department_members")
            .select("department_id")
            .eq("user_id", targetUserId);

          const targetDeptIds = (targetDeptMembers || []).map((dm) => dm.department_id);
          const hasDeptOverlap = targetDeptIds.some((id) => ledDeptIds.includes(id));

          if (hasDeptOverlap) {
            hasRemovePermission = true;
          }
        }
      }
    }

    if (!actor?.active || !hasRemovePermission) {
      return NextResponse.json({ error: "Sem permissao para remover este membro." }, { status: 403 });
    }

    if (action === "reactivate") {
      if (actor.role !== "admin") {
        return NextResponse.json({ error: "Somente administradores podem reativar membros." }, { status: 403 });
      }

      if (target.active) {
        return NextResponse.json({ error: "Este membro ja esta ativo." }, { status: 400 });
      }

      const { error: reactivateError } = await supabase
        .from("users")
        .update({ active: true, status: target.status === "inactive" ? "active" : target.status })
        .select("id, active, status")
        .eq("id", targetUserId)
        .eq("church_id", churchId);

      if (reactivateError) {
        console.error("Erro ao reativar membro:", reactivateError);
        return NextResponse.json(
          { error: reactivateError.message || "Nao foi possivel reativar o membro." },
          { status: 500 }
        );
      }

      const { data: reactivatedUser, error: verifyReactivateError } = await supabase
        .from("users")
        .select("id, active, status")
        .eq("id", targetUserId)
        .eq("church_id", churchId)
        .maybeSingle();

      if (verifyReactivateError) {
        console.error("Erro ao verificar reativacao do membro:", verifyReactivateError);
        return NextResponse.json(
          { error: verifyReactivateError.message || "Nao foi possivel confirmar a reativacao do membro." },
          { status: 500 }
        );
      }

      if (!reactivatedUser?.active) {
        return NextResponse.json(
          { error: "O membro nao foi reativado no banco de dados." },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, mode: "reactivate" });
    }

    if (!target.active && action !== "hard_delete") {
      return NextResponse.json({ error: "Este membro ja esta desativado." }, { status: 400 });
    }

    if (action === "hard_delete" && actor.role !== "admin") {
      return NextResponse.json({ error: "Somente administradores podem excluir permanentemente." }, { status: 403 });
    }

    if (action === "hard_delete") {
      if (target.spouse_id) {
        const { error: spouseCleanupError } = await supabase
          .from("users")
          .update({ spouse_id: null })
          .eq("id", target.spouse_id)
          .eq("church_id", churchId);

        if (spouseCleanupError) throw spouseCleanupError;
      }

      const { data: departments } = await supabase
        .from("departments")
        .select("id, leader_ids, co_leader_ids")
        .eq("church_id", churchId);

      for (const department of departments || []) {
        const nextLeaderIds = (department.leader_ids || []).filter((id: string) => id !== targetUserId);
        const nextCoLeaderIds = (department.co_leader_ids || []).filter((id: string) => id !== targetUserId);

        if (
          nextLeaderIds.length !== (department.leader_ids || []).length ||
          nextCoLeaderIds.length !== (department.co_leader_ids || []).length
        ) {
          const { error: deptUpdateError } = await supabase
            .from("departments")
            .update({
              leader_ids: nextLeaderIds,
              co_leader_ids: nextCoLeaderIds,
            })
            .eq("id", department.id)
            .eq("church_id", churchId);

          if (deptUpdateError) throw deptUpdateError;
        }
      }

      const cleanupSteps: Array<{ label: string; run: () => Promise<{ error: any }> }> = [
        {
          label: "member_invitations.user_id",
          run: async () =>
            supabase.from("member_invitations").delete().eq("user_id", targetUserId).eq("church_id", churchId),
        },
        {
          label: "member_invitations.invited_by_user_id",
          run: async () =>
            supabase.from("member_invitations").update({ invited_by_user_id: null }).eq("invited_by_user_id", targetUserId),
        },
        {
          label: "password_reset_tokens",
          run: async () =>
            supabase.from("password_reset_tokens").delete().eq("user_id", targetUserId).eq("church_id", churchId),
        },
        {
          label: "notifications",
          run: async () =>
            supabase.from("notifications").delete().eq("user_id", targetUserId).eq("church_id", churchId),
        },
        {
          label: "unavailable_dates",
          run: async () =>
            supabase.from("unavailable_dates").delete().eq("user_id", targetUserId).eq("church_id", churchId),
        },
        {
          label: "department_members",
          run: async () => supabase.from("department_members").delete().eq("user_id", targetUserId),
        },
        {
          label: "messages",
          run: async () => supabase.from("messages").delete().eq("sender_id", targetUserId),
        },
        {
          label: "schedule_chats",
          run: async () => supabase.from("schedule_chats").delete().eq("sender_id", targetUserId),
        },
        {
          label: "schedule_attachments",
          run: async () => supabase.from("schedule_attachments").delete().eq("uploaded_by_user_id", targetUserId),
        },
        {
          label: "schedule_members.user_id",
          run: async () => supabase.from("schedule_members").delete().eq("user_id", targetUserId),
        },
        {
          label: "schedule_members.substitute_id",
          run: async () => supabase.from("schedule_members").update({ substitute_id: null }).eq("substitute_id", targetUserId),
        },
        {
          label: "schedule_members.substitute_for",
          run: async () => supabase.from("schedule_members").update({ substitute_for: null }).eq("substitute_for", targetUserId),
        },
        {
          label: "schedules.created_by",
          run: async () => supabase.from("schedules").update({ created_by: actorId }).eq("created_by", targetUserId),
        },
        {
          label: "songs.created_by",
          run: async () => supabase.from("songs").update({ created_by: actorId }).eq("created_by", targetUserId),
        },
      ];

      for (const step of cleanupSteps) {
        const result = await step.run();
        if (result.error) {
          if (isIgnorableCleanupError(result.error)) {
            console.warn(`Ignorando limpeza opcional em ${step.label}:`, result.error);
            continue;
          }
          console.error(`Erro ao limpar ${step.label}:`, result.error);
          throw new Error(`Nao foi possivel excluir o usuario por causa de ${step.label}.`);
        }
      }

      const { error: deleteUserError } = await supabase
        .from("users")
        .delete()
        .eq("id", targetUserId)
        .eq("church_id", churchId);

      if (deleteUserError) throw deleteUserError;

      const { data: remainingUser, error: verifyDeleteError } = await supabase
        .from("users")
        .select("id, active")
        .eq("id", targetUserId)
        .eq("church_id", churchId)
        .maybeSingle();

      if (verifyDeleteError) throw verifyDeleteError;

      if (remainingUser) {
        const { error: fallbackDeactivateError } = await supabase
          .from("users")
          .update({ active: false, status: "inactive" })
          .eq("id", targetUserId)
          .eq("church_id", churchId);

        if (fallbackDeactivateError) throw fallbackDeactivateError;

        return NextResponse.json({
          success: true,
          mode: "deactivate_fallback",
          warning: hasServiceRole
            ? "O usuário não pôde ser apagado fisicamente, mas foi desativado."
            : "O ambiente não possui SUPABASE_SERVICE_ROLE_KEY. O usuário foi desativado e saiu da listagem, mas não pôde ser apagado fisicamente do banco.",
        });
      }

      return NextResponse.json({ success: true, mode: "hard_delete" });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ active: false, status: "inactive" })
      .eq("id", targetUserId)
      .eq("church_id", churchId);

    if (updateError) throw updateError;

    if (target.spouse_id) {
      const { error: spouseError } = await supabase
        .from("users")
        .update({ spouse_id: null })
        .eq("id", target.spouse_id)
        .eq("church_id", churchId);

      if (spouseError) {
        console.error("Erro ao limpar conjuge:", spouseError);
      }
    }

    const { error: deleteDeptMemberError } = await supabase
      .from("department_members")
      .delete()
      .eq("user_id", targetUserId);

    if (deleteDeptMemberError) {
      console.error("Erro ao remover vinculos de departamento:", deleteDeptMemberError);
    }

    return NextResponse.json({ success: true, mode: "deactivate" });
  } catch (error) {
    console.error("API members/deactivate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao remover membro." },
      { status: 500 }
    );
  }
}
