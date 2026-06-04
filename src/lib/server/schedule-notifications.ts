import {
  sendScheduleReminderEmail,
  sendSmsScheduleAssignment,
  sendSmsScheduleReminder,
} from "@/lib/email/send";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { sendUserNotification } from "@/lib/server/notification-service";
import {
  getUserReminderProfile,
  buildScheduleReminderText,
  type ReminderStage,
} from "@/lib/server/behavior-analysis-service";
import type { Department, Event, Schedule, User } from "@/types";

type ScheduleContext = {
  schedule: Schedule;
  event: Event | null;
  department: Department | null;
};

type ChannelSummary = { sent: number; failed: number; skipped: number };

type DeliveryResult = {
  email: ChannelSummary;
  sms: ChannelSummary;
  push: ChannelSummary;
  failed: Array<{ userId: string; channel: "email" | "sms" | "push"; error: string }>;
};

async function getScheduleContext(scheduleId: string, churchId: string): Promise<ScheduleContext | null> {
  const supabase = getFirebaseAdminClient();
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("*")
    .eq("id", scheduleId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (scheduleError) throw scheduleError;
  if (!schedule) return null;

  const [{ data: event, error: eventError }, { data: department, error: departmentError }] =
    await Promise.all([
      supabase.from("events").select("*").eq("id", schedule.event_id).maybeSingle(),
      supabase.from("departments").select("*").eq("id", schedule.department_id).maybeSingle(),
    ]);

  if (eventError) throw eventError;
  if (departmentError) throw departmentError;

  return {
    schedule: schedule as Schedule,
    event: (event || null) as Event | null,
    department: (department || null) as Department | null,
  };
}

function emptyDeliveryResult(): DeliveryResult {
  return {
    email: { sent: 0, failed: 0, skipped: 0 },
    sms: { sent: 0, failed: 0, skipped: 0 },
    push: { sent: 0, failed: 0, skipped: 0 },
    failed: [],
  };
}

function trackChannelResult(
  summary: DeliveryResult,
  channel: "email" | "sms" | "push",
  status: "sent" | "failed" | "skipped",
  userId: string,
  error?: string | null
) {
  summary[channel][status] += 1;
  if (status === "failed" && error) {
    summary.failed.push({ userId, channel, error });
  }
}

export async function sendScheduleAssignmentAlerts(params: {
  churchId: string;
  scheduleId: string;
  userIds: string[];
}) {
  const { churchId, scheduleId, userIds } = params;
  const supabase = getFirebaseAdminClient();
  const context = await getScheduleContext(scheduleId, churchId);

  if (!context || userIds.length === 0 || context.schedule.status !== "active") {
    return emptyDeliveryResult();
  }

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("*")
    .eq("church_id", churchId)
    .in("id", userIds)
    .eq("active", true);

  if (usersError) throw usersError;

  const summary = emptyDeliveryResult();

  for (const user of (users || []) as User[]) {
    const result = await sendSmsScheduleAssignment({
      to: user.phone || "",
      memberName: user.name,
      eventName: context.event?.name || "Evento",
      date: context.schedule.date,
      time: context.schedule.time,
      departmentName: context.department?.name || "Ministério",
    });

    trackChannelResult(summary, "sms", result.status, user.id, result.error);
  }

  return summary;
}

export async function sendScheduleReminderAlerts(params: {
  churchId: string;
  scheduleId: string;
  stage: ReminderStage;
  onlyPending?: boolean;
}) {
  const { churchId, scheduleId, stage, onlyPending = false } = params;
  const supabase = getFirebaseAdminClient();
  const context = await getScheduleContext(scheduleId, churchId);

  if (!context || context.schedule.status !== "active") {
    return emptyDeliveryResult();
  }

  let membersQuery = supabase.from("schedule_members").select("*").eq("schedule_id", scheduleId);
  if (onlyPending) {
    membersQuery = membersQuery.eq("status", "pending");
  }

  const { data: scheduleMembers, error: scheduleMembersError } = await membersQuery;
  if (scheduleMembersError) throw scheduleMembersError;

  const userIds = [...new Set((scheduleMembers || []).map((item) => item.user_id))];
  if (userIds.length === 0) return emptyDeliveryResult();

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("*")
    .eq("church_id", churchId)
    .in("id", userIds)
    .eq("active", true);

  if (usersError) throw usersError;

  const summary = emptyDeliveryResult();

  for (const user of (users || []) as User[]) {
    const member = (scheduleMembers || []).find((item) => item.user_id === user.id);
    if (!member) continue;

    const profile = await getUserReminderProfile(user.id, churchId);
    const reminder = buildScheduleReminderText({
      profile,
      stage,
      status: member.status,
      departmentName: context.department?.name || "Ministério",
      time: context.schedule.time,
    });

    if (user.email) {
      try {
        await sendScheduleReminderEmail({
          to: user.email,
          memberName: user.name,
          eventName: context.event?.name || "Evento",
          date: context.schedule.date,
          time: context.schedule.time,
          departmentName: context.department?.name || "Ministério",
        });
        trackChannelResult(summary, "email", "sent", user.id);
      } catch (error) {
        trackChannelResult(
          summary,
          "email",
          "failed",
          user.id,
          error instanceof Error ? error.message : "Falha ao enviar email."
        );
      }
    } else {
      trackChannelResult(summary, "email", "skipped", user.id);
    }

    const smsResult = await sendSmsScheduleReminder({
      to: user.phone || "",
      memberName: user.name,
      eventName: context.event?.name || "Evento",
      date: context.schedule.date,
      time: context.schedule.time,
      departmentName: context.department?.name || "Ministério",
    });

    trackChannelResult(summary, "sms", smsResult.status, user.id, smsResult.error);

    try {
      const pushResult = await sendUserNotification({
        userId: user.id,
        churchId,
        title: reminder.title,
        body: reminder.body,
        actionUrl: `/escalas/${encodeURIComponent(scheduleId)}`,
        type: reminder.type,
      });
      if (pushResult.pushSent > 0) {
        trackChannelResult(summary, "push", "sent", user.id);
      } else {
        trackChannelResult(summary, "push", "skipped", user.id);
      }
      if (pushResult.pushFailed > 0) {
        trackChannelResult(summary, "push", "failed", user.id, "Falha ao enviar push.");
      }
    } catch (error) {
      trackChannelResult(
        summary,
        "push",
        "failed",
        user.id,
        error instanceof Error ? error.message : "Falha ao enviar push."
      );
    }
  }

  return summary;
}
