import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";
import type { Department, User } from "@/types";

function buildPreview(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 96) return normalized;
  return `${normalized.slice(0, 93)}...`;
}

async function upsertUnreadNotifications(params: {
  churchId: string;
  userIds: string[];
  title: string;
  body: string;
  actionUrl: string;
}) {
  const { churchId, userIds, title, body, actionUrl } = params;
  if (userIds.length === 0) return;

  const supabase = getFirebaseAdminClient();

  await supabase
    .from("notifications")
    .delete()
    .eq("church_id", churchId)
    .eq("action_url", actionUrl)
    .eq("type", "info")
    .eq("read", false)
    .in("user_id", userIds);

  const createdAt = new Date().toISOString();

  const { error } = await supabase.from("notifications").insert(
    userIds.map((userId) => ({
      id: genId(),
      user_id: userId,
      church_id: churchId,
      title,
      body,
      icon: "message-circle",
      type: "info" as const,
      read: false,
      action_url: actionUrl,
      created_at: createdAt,
    }))
  );

  if (error) throw error;
}

export async function notifyDepartmentChatMessage(params: {
  churchId: string;
  departmentId: string;
  senderId: string;
  senderName: string;
  content: string;
}) {
  const { churchId, departmentId, senderId, senderName, content } = params;
  const supabase = getFirebaseAdminClient();

  const [{ data: department, error: departmentError }, { data: departmentMembers, error: membersError }] =
    await Promise.all([
      supabase
        .from("departments")
        .select("id, name, leader_ids, co_leader_ids")
        .eq("id", departmentId)
        .eq("church_id", churchId)
        .maybeSingle(),
      supabase
        .from("department_members")
        .select("user_id")
        .eq("department_id", departmentId),
    ]);

  if (departmentError) throw departmentError;
  if (membersError) throw membersError;
  if (!department) return;

  const recipientIds = [
    ...new Set([
      ...((departmentMembers || []).map((item) => item.user_id) as string[]),
      ...(((department as Department).leader_ids || []) as string[]),
      ...(((department as Department).co_leader_ids || []) as string[]),
    ]),
  ].filter((userId) => userId && userId !== senderId);

  if (recipientIds.length === 0) return;

  const { data: activeUsers, error: usersError } = await supabase
    .from("users")
    .select("id")
    .eq("church_id", churchId)
    .eq("active", true)
    .in("id", recipientIds);

  if (usersError) throw usersError;

  await upsertUnreadNotifications({
    churchId,
    userIds: ((activeUsers || []) as Array<Pick<User, "id">>).map((user) => user.id),
    title: `Nova mensagem em ${department.name}`,
    body: `${senderName}: ${buildPreview(content)}`,
    actionUrl: `/mensagens?departmentId=${encodeURIComponent(departmentId)}`,
  });
}

export async function notifyScheduleChatMessage(params: {
  churchId: string;
  scheduleId: string;
  senderId: string;
  senderName: string;
  content: string;
}) {
  const { churchId, scheduleId, senderId, senderName, content } = params;
  const supabase = getFirebaseAdminClient();

  const [{ data: schedule, error: scheduleError }, { data: scheduleMembers, error: membersError }] =
    await Promise.all([
      supabase
        .from("schedules")
        .select("id, department_id, date, time")
        .eq("id", scheduleId)
        .eq("church_id", churchId)
        .maybeSingle(),
      supabase
        .from("schedule_members")
        .select("user_id")
        .eq("schedule_id", scheduleId),
    ]);

  if (scheduleError) throw scheduleError;
  if (membersError) throw membersError;
  if (!schedule) return;

  const { data: department, error: departmentError } = await supabase
    .from("departments")
    .select("id, name, leader_ids, co_leader_ids")
    .eq("id", schedule.department_id)
    .eq("church_id", churchId)
    .maybeSingle();

  if (departmentError) throw departmentError;

  const recipientIds = [
    ...new Set([
      ...((scheduleMembers || []).map((item) => item.user_id) as string[]),
      ...(((department?.leader_ids || []) as string[])),
      ...(((department?.co_leader_ids || []) as string[])),
    ]),
  ].filter((userId) => userId && userId !== senderId);

  if (recipientIds.length === 0) return;

  const { data: activeUsers, error: usersError } = await supabase
    .from("users")
    .select("id")
    .eq("church_id", churchId)
    .eq("active", true)
    .in("id", recipientIds);

  if (usersError) throw usersError;

  const eventLabel = [schedule.date, schedule.time].filter(Boolean).join(" às ");

  await upsertUnreadNotifications({
    churchId,
    userIds: ((activeUsers || []) as Array<Pick<User, "id">>).map((user) => user.id),
    title: department?.name
      ? `Nova mensagem na escala de ${department.name}`
      : "Nova mensagem na escala",
    body: `${senderName}: ${buildPreview(content)}${eventLabel ? ` • ${eventLabel}` : ""}`,
    actionUrl: `/escalas/${encodeURIComponent(scheduleId)}`,
  });
}
