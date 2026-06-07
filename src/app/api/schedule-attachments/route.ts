import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const getSchema = z.object({
  scheduleId: z.string().min(1),
});

const postSchema = z.object({
  scheduleId: z.string().min(1),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  contentBase64: z.string().trim().min(1),
});

const deleteSchema = z.object({
  attachmentId: z.string().min(1),
  scheduleId: z.string().min(1),
});

async function canAccessScheduleAttachments(params: {
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

  // Qualquer pessoa ESCALADA (participante) pode ver os anexos — inclusive um
  // líder que foi escalado num ministério que não lidera (caso da Fernanda).
  if (scheduleMember) return true;

  // Líder do ministério da escala (mesmo sem estar escalado) também pode ver.
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

async function canEditScheduleAttachments(params: {
  scheduleId: string;
  churchId: string;
  userId: string;
}) {
  const { scheduleId, churchId, userId } = params;
  const supabase = getFirebaseAdminClient();

  const [{ data: member }, { data: schedule }] = await Promise.all([
    supabase
      .from("users")
      .select("id, role, active")
      .eq("id", userId)
      .eq("church_id", churchId)
      .maybeSingle(),
    supabase
      .from("schedules")
      .select("id, department_id")
      .eq("id", scheduleId)
      .eq("church_id", churchId)
      .maybeSingle(),
  ]);

  if (!member?.active || !schedule) return false;
  if (member.role === "admin") return true;
  if (member.role !== "leader") return false;

  const { data: department, error } = await supabase
    .from("departments")
    .select("leader_ids, co_leader_ids")
    .eq("id", schedule.department_id)
    .eq("church_id", churchId)
    .maybeSingle();

  if (error) throw error;

  return Boolean(
    department &&
      ((department.leader_ids || []).includes(userId) ||
        (department.co_leader_ids || []).includes(userId))
  );
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

    const canAccess = await canAccessScheduleAttachments({
      scheduleId,
      churchId,
      userId: session.user_id,
    });

    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("schedule_attachments")
      .select("*")
      .eq("schedule_id", scheduleId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, attachments: data || [] });
  } catch (error) {
    console.error("API schedule-attachments GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load attachments" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const { session, errorResponse } = requireApiSession(req);
    if (!session) return errorResponse!;

    const { scheduleId, fileName, mimeType, sizeBytes, contentBase64 } = parsed.data;
    const churchId = session.church_id;
    const userId = session.user_id;
    const supabase = getFirebaseAdminClient();

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: "Tipo de arquivo nao permitido." }, { status: 400 });
    }

    const canEdit = await canEditScheduleAttachments({
      scheduleId,
      churchId,
      userId,
    });

    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const attachment = {
      id: genId(),
      schedule_id: scheduleId,
      uploaded_by_user_id: userId,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      content_base64: contentBase64,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("schedule_attachments")
      .insert(attachment)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ success: true, attachment: data || attachment });
  } catch (error) {
    console.error("API schedule-attachments POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload attachment" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = deleteSchema.safeParse({
      attachmentId: url.searchParams.get("attachmentId"),
      scheduleId: url.searchParams.get("scheduleId"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query params." }, { status: 400 });
    }

    const { session, errorResponse } = requireApiSession(req);
    if (!session) return errorResponse!;

    const { attachmentId, scheduleId } = parsed.data;
    const churchId = session.church_id;
    const userId = session.user_id;
    const supabase = getFirebaseAdminClient();

    const canEdit = await canEditScheduleAttachments({
      scheduleId,
      churchId,
      userId,
    });

    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { error } = await supabase
      .from("schedule_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("schedule_id", scheduleId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API schedule-attachments DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete attachment" },
      { status: 500 }
    );
  }
}
