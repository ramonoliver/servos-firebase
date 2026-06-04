import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { notifyDepartmentChatMessage } from "@/lib/server/chat-notifications";
import { sendUserNotification } from "@/lib/server/notification-service";
import { genId } from "@/lib/utils/helpers";

const getSchema = z.object({
  departmentId: z.string().min(1),
});

const postSchema = z.object({
  departmentId: z.string().min(1),
  content: z.string().trim().min(1).max(2000),
});

async function canAccessDepartmentMessages(params: {
  departmentId: string;
  churchId: string;
  userId: string;
}) {
  const { departmentId, churchId, userId } = params;
  const supabase = getFirebaseAdminClient();

  const [{ data: member }, { data: department }, { data: departmentMember }] = await Promise.all([
    supabase
      .from("users")
      .select("id, role, church_id, active")
      .eq("id", userId)
      .eq("church_id", churchId)
      .maybeSingle(),
    supabase
      .from("departments")
      .select("id, church_id, leader_ids, co_leader_ids")
      .eq("id", departmentId)
      .eq("church_id", churchId)
      .maybeSingle(),
    supabase
      .from("department_members")
      .select("id")
      .eq("department_id", departmentId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!member?.active || !department) return false;
  if (member.role === "admin") return true;
  if ((department.leader_ids || []).includes(userId)) return true;
  if ((department.co_leader_ids || []).includes(userId)) return true;

  return Boolean(departmentMember);
}

async function processMentions(content: string, departmentId: string, senderId: string, churchId: string, senderName: string) {
  const supabase = getFirebaseAdminClient();

  // Extract @mentions from content (format: @username)
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]); // username without @
  }

  if (mentions.length === 0) return;

  // Get all department members and leaders
  const [{ data: deptMembers }, { data: department }] = await Promise.all([
    supabase
      .from("department_members")
      .select("user_id")
      .eq("department_id", departmentId),
    supabase
      .from("departments")
      .select("leader_ids, co_leader_ids")
      .eq("id", departmentId)
      .single()
  ]);

  const memberIds = deptMembers?.map(m => m.user_id) || [];
  const leaderIds = [
    ...(department?.leader_ids || []),
    ...(department?.co_leader_ids || [])
  ];
  const allUserIds = [...new Set([...memberIds, ...leaderIds])];

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
        body: `${senderName} te mencionou em uma mensagem do ministério.`,
        actionUrl: `/mensagens?departmentId=${departmentId}`,
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
      departmentId: url.searchParams.get("departmentId"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query params." }, { status: 400 });
    }

    const { session, errorResponse } = requireApiSession(req);
    if (!session) return errorResponse!;

    const { departmentId } = parsed.data;
    const churchId = session.church_id;
    const supabase = getFirebaseAdminClient();

    const canAccess = await canAccessDepartmentMessages({
      departmentId,
      churchId,
      userId: session.user_id,
    });

    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("department_id", departmentId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, messages: data || [] });
  } catch (error) {
    console.error("API department-messages GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load department messages" },
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

    const { departmentId, content } = parsed.data;
    const churchId = session.church_id;
    const senderId = session.user_id;
    const supabase = getFirebaseAdminClient();

    const canAccess = await canAccessDepartmentMessages({
      departmentId,
      churchId,
      userId: senderId,
    });

    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const message = {
      id: genId(),
      department_id: departmentId,
      sender_id: senderId,
      content,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("messages")
      .insert(message)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    try {
      const { data: sender } = await supabase
        .from("users")
        .select("name")
        .eq("id", senderId)
        .eq("church_id", churchId)
        .maybeSingle();

      await notifyDepartmentChatMessage({
        churchId,
        departmentId,
        senderId,
        senderName: sender?.name || "Alguém do time",
        content,
      });

      // Process mentions and send notifications
      await processMentions(content, departmentId, senderId, churchId, sender?.name || "Alguém do time");
    } catch (notificationError) {
      console.error("API department-messages notification error:", notificationError);
    }

    return NextResponse.json({ success: true, message: data || message });
  } catch (error) {
    console.error("API department-messages POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send department message" },
      { status: 500 }
    );
  }
}
