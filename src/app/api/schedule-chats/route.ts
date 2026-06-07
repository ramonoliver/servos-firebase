import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth/api-session";
import { notifyScheduleChatMessage } from "@/lib/server/chat-notifications";
import { sendUserNotification } from "@/lib/server/notification-service";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const getSchema = z.object({
  scheduleId: z.string().min(1),
});

const postSchema = z.object({
  scheduleId: z.string().min(1),
  content: z.string().trim().min(1).max(2000),
});

async function ensureScheduleBelongsToChurch(scheduleId: string, churchId: string) {
  const supabase = getFirebaseAdminClient();
  const { data, error } = await supabase
    .from("schedules")
    .select("id, church_id")
    .eq("id", scheduleId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function canAccessScheduleChat(params: {
  scheduleId: string;
  churchId: string;
  userId: string;
}) {
  const { scheduleId, churchId, userId } = params;
  const supabase = getFirebaseAdminClient();

  const [{ data: member }, { data: scheduleMember }, schedule] = await Promise.all([
    supabase
      .from("users")
      .select("id, role, church_id, active")
      .eq("id", userId)
      .eq("church_id", churchId)
      .maybeSingle(),
    supabase
      .from("schedule_members")
      .select("id")
      .eq("schedule_id", scheduleId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("schedules")
      .select("id, department_id")
      .eq("id", scheduleId)
      .eq("church_id", churchId)
      .maybeSingle(),
  ]);

  if (!member?.active) return false;
  if (member.role === "admin") return true;

  // Qualquer pessoa ESCALADA (participante) acessa o chat — inclusive um líder
  // escalado num ministério que não lidera (caso da Fernanda).
  if (scheduleMember) return true;

  // Líder do ministério da escala (mesmo sem estar escalado) também acessa.
  if (member.role === "leader") {
    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .select("id, leader_ids, co_leader_ids")
      .eq("id", schedule.data?.department_id || "")
      .eq("church_id", churchId)
      .maybeSingle();

    if (departmentError) throw departmentError;

    return Boolean(
      department &&
        ((department.leader_ids || []).includes(userId) ||
          (department.co_leader_ids || []).includes(userId))
    );
  }

  return false;
}

async function processMentions(content: string, scheduleId: string, senderId: string, churchId: string, senderName: string) {
  const supabase = getFirebaseAdminClient();

  // Extract @mentions from content (format: @username)
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]); // username without @
  }

  if (mentions.length === 0) return;

  // Get all users in the schedule (participants and leaders)
  const [{ data: scheduleMembers }, { data: department }] = await Promise.all([
    supabase
      .from("schedule_members")
      .select("user_id")
      .eq("schedule_id", scheduleId),
    supabase
      .from("schedules")
      .select("department_id")
      .eq("id", scheduleId)
      .single()
  ]);

  const participantIds = scheduleMembers?.map(m => m.user_id) || [];

  // Get department leaders
  let leaderIds: string[] = [];
  if (department?.department_id) {
    const { data: dept } = await supabase
      .from("departments")
      .select("leader_ids, co_leader_ids")
      .eq("id", department.department_id)
      .single();

    leaderIds = [
      ...(dept?.leader_ids || []),
      ...(dept?.co_leader_ids || [])
    ];
  }

  const allUserIds = [...new Set([...participantIds, ...leaderIds])];

  // Get user details for mentioned usernames
  const { data: users } = await supabase
    .from("users")
    .select("id, name")
    .eq("church_id", churchId)
    .in("id", allUserIds);

  if (!users) return;

  // Create a map of username to user ID
  const usernameToUserId = new Map<string, string>();
  users.forEach(user => {
    const username = user.name?.toLowerCase().replace(/\s+/g, '') || '';
    if (username) {
      usernameToUserId.set(username, user.id);
    }
  });

  // Send notifications to mentioned users
  const mentionedUserIds = mentions
    .map(username => usernameToUserId.get(username.toLowerCase()))
    .filter((id): id is string => id !== undefined && id !== senderId); // Don't notify sender

  for (const mentionedUserId of mentionedUserIds) {
    try {
      await sendUserNotification({
        userId: mentionedUserId,
        churchId,
        title: "Você foi mencionado",
        body: `${senderName} te mencionou em uma mensagem no chat da escala.`,
        actionUrl: `/escalas/${scheduleId}?tab=chat`,
        type: "info",
      });
    } catch (error) {
      console.error(`Failed to send mention notification to user ${mentionedUserId}:`, error);
    }
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = getSchema.safeParse({
      scheduleId: url.searchParams.get("scheduleId"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query params." }, { status: 400 });
    }

    const { session, errorResponse } = requireApiSession(req);
    if (!session) return errorResponse!;

    const { scheduleId } = parsed.data;
    const churchId = session.church_id;
    const supabase = getFirebaseAdminClient();

    const allowed = await ensureScheduleBelongsToChurch(scheduleId, churchId);
    if (!allowed) {
      return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
    }

    const canAccess = await canAccessScheduleChat({ scheduleId, churchId, userId: session.user_id });
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("schedule_chats")
      .select("*")
      .eq("schedule_id", scheduleId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, messages: data || [] });
  } catch (error) {
    console.error("API schedule-chats GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load schedule chat" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = postSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const { session, errorResponse } = requireApiSession(req);
    if (!session) return errorResponse!;

    const { scheduleId, content } = parsed.data;
    const churchId = session.church_id;
    const senderId = session.user_id;
    const supabase = getFirebaseAdminClient();

    const [scheduleResult, senderResult] = await Promise.all([
      supabase
        .from("schedules")
        .select("id, church_id")
        .eq("id", scheduleId)
        .eq("church_id", churchId)
        .maybeSingle(),
      supabase
        .from("users")
        .select("id, church_id, active")
        .eq("id", senderId)
        .eq("church_id", churchId)
        .maybeSingle(),
    ]);

    if (scheduleResult.error) throw scheduleResult.error;
    if (senderResult.error) throw senderResult.error;

    if (!scheduleResult.data) {
      return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
    }

    if (!senderResult.data?.active) {
      return NextResponse.json({ error: "Sender not allowed." }, { status: 403 });
    }

    const canAccess = await canAccessScheduleChat({
      scheduleId,
      churchId,
      userId: senderId,
    });

    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const message = {
      id: genId(),
      schedule_id: scheduleId,
      sender_id: senderId,
      content,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("schedule_chats")
      .insert(message)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    if (error) throw error;

    try {
      const { data: sender } = await supabase
        .from("users")
        .select("name")
        .eq("id", senderId)
        .eq("church_id", churchId)
        .maybeSingle();

      await notifyScheduleChatMessage({
        churchId,
        scheduleId,
        senderId,
        senderName: sender?.name || "Alguém da equipe",
        content,
      });

      // Process mentions and send notifications
      await processMentions(content, scheduleId, senderId, churchId, sender?.name || "Alguém da equipe");
    } catch (notificationError) {
      console.error("API schedule-chats notification error:", notificationError);
    }

    return NextResponse.json({ success: true, message: data || message });

    return NextResponse.json({ success: true, message: data || message });
  } catch (error) {
    console.error("API schedule-chats POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send chat message" },
      { status: 500 }
    );
  }
}
