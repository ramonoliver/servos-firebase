import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { sendScheduleReminderAlerts } from "@/lib/server/schedule-notifications";

type RouteBody = {
  scheduleId?: string;
};

export async function POST(req: Request) {
  try {
    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    if (!actor || (actor.role !== "admin" && actor.role !== "leader")) {
      return NextResponse.json({ error: "Sem permissao para enviar lembretes." }, { status: 403 });
    }

    const supabase = getFirebaseAdminClient();
    const body = (await req.json().catch(() => ({}))) as RouteBody;
    const { scheduleId } = body;
    const churchId = session!.church_id;
    const actorId = session!.user_id;

    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);

    let scheduleQuery = supabase
      .from("schedules")
      .select("*")
      .eq("church_id", churchId)
      .eq("status", "active");

    if (scheduleId) {
      scheduleQuery = scheduleQuery.eq("id", scheduleId);
    } else {
      const start = now.toISOString().split("T")[0];
      const end = tomorrow.toISOString().split("T")[0];
      scheduleQuery = scheduleQuery.gte("date", start).lte("date", end);
    }

    const { data: schedules, error: schedulesError } = await scheduleQuery;

    if (schedulesError) throw schedulesError;

    let visibleSchedules = schedules || [];

    if (actor.role === "leader" && visibleSchedules.length > 0) {
      const departmentIds = [...new Set(visibleSchedules.map((schedule) => schedule.department_id))];
      const { data: departments, error: departmentsError } = await supabase
        .from("departments")
        .select("id, leader_ids, co_leader_ids")
        .eq("church_id", churchId)
        .in("id", departmentIds);

      if (departmentsError) throw departmentsError;

      const allowedDepartmentIds = new Set(
        (departments || [])
          .filter(
            (department) =>
              (department.leader_ids || []).includes(actorId) ||
              (department.co_leader_ids || []).includes(actorId)
          )
          .map((department) => department.id)
      );

      visibleSchedules = visibleSchedules.filter((schedule) =>
        allowedDepartmentIds.has(schedule.department_id)
      );
    }

    if (!visibleSchedules || visibleSchedules.length === 0) {
      return NextResponse.json({ success: true, sentCount: 0, failedCount: 0, sent: [], failed: [] });
    }

    const sent: Array<{ scheduleId: string; channel: "email" | "sms" | "push"; count: number }> = [];
    const failed: Array<{ scheduleId: string; userId: string; channel: "email" | "sms" | "push"; error: string }> = [];
    let emailSentCount = 0;
    let smsSentCount = 0;
    let pushSentCount = 0;
    let emailSkippedCount = 0;
    let smsSkippedCount = 0;
    let pushSkippedCount = 0;

    const nowTime = new Date();
    const todayDate = nowTime.toISOString().split("T")[0];
    const tomorrowTime = new Date(nowTime);
    tomorrowTime.setDate(tomorrowTime.getDate() + 1);
    const tomorrowDate = tomorrowTime.toISOString().split("T")[0];

    for (const sched of visibleSchedules) {
      const scheduleDateString = sched.date;
      const scheduleTimeString = sched.time || "00:00";
      const scheduleDate = new Date(`${scheduleDateString}T${scheduleTimeString}:00`);
      let stage: "day_before" | "same_day" = "day_before";
      let onlyPendingForStage = false;

      if (scheduleDateString === tomorrowDate) {
        stage = "day_before";
        onlyPendingForStage = true;
      } else if (
        scheduleDateString === todayDate &&
        scheduleDate.getTime() > nowTime.getTime() &&
        scheduleDate.getTime() - nowTime.getTime() <= 3 * 60 * 60 * 1000
      ) {
        stage = "same_day";
        onlyPendingForStage = false;
      } else {
        continue;
      }

      const dedupeWindowMinutes = 20;
      const dedupeFrom = new Date(nowTime.getTime() - dedupeWindowMinutes * 60 * 1000).toISOString();
      const dedupeActionUrl = `/escalas/${encodeURIComponent(sched.id)}`;
      const { count: recentReminderCount, error: dedupeError } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("church_id", churchId)
        .eq("type", "reminder")
        .eq("action_url", dedupeActionUrl)
        .gte("created_at", dedupeFrom);
      if (dedupeError) throw dedupeError;
      if ((recentReminderCount || 0) > 0) {
        continue;
      }

      const delivery = await sendScheduleReminderAlerts({
        churchId,
        scheduleId: sched.id,
        stage,
        onlyPending: onlyPendingForStage,
      });

      emailSentCount += delivery.email.sent;
      smsSentCount += delivery.sms.sent;
      pushSentCount += delivery.push.sent;
      emailSkippedCount += delivery.email.skipped;
      smsSkippedCount += delivery.sms.skipped;
      pushSkippedCount += delivery.push.skipped;
      sent.push({ scheduleId: sched.id, channel: "email", count: delivery.email.sent });
      sent.push({ scheduleId: sched.id, channel: "sms", count: delivery.sms.sent });
      sent.push({ scheduleId: sched.id, channel: "push", count: delivery.push.sent });

      failed.push(...delivery.failed.map((item) => ({ scheduleId: sched.id, ...item })));
    }

    return NextResponse.json({
      success: true,
      sentCount: emailSentCount + smsSentCount + pushSentCount,
      emailSentCount,
      smsSentCount,
      pushSentCount,
      emailSkippedCount,
      smsSkippedCount,
      pushSkippedCount,
      failedCount: failed.length,
      sent,
      failed,
    });
  } catch (error) {
    console.error("Erro no envio de lembretes:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao enviar lembretes",
      },
      { status: 500 }
    );
  }
}
