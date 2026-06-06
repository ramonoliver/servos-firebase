import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getPreferences, savePreferences } from "@/services/notification.service";

export async function GET(req: Request) {
  const { session, errorResponse } = await requireApiActor(req, { select: "*" });
  if (errorResponse) return errorResponse;
  const prefs = await getPreferences(session!.user_id, session!.church_id);
  return NextResponse.json({ preferences: prefs });
}

const patchSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  scheduleNotifications: z.boolean().optional(),
  eventNotifications: z.boolean().optional(),
  messageNotifications: z.boolean().optional(),
  prayerNotifications: z.boolean().optional(),
  birthdayNotifications: z.boolean().optional(),
});

export async function POST(req: Request) {
  const { session, errorResponse } = await requireApiActor(req, { select: "*" });
  if (errorResponse) return errorResponse;

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Preferências inválidas." }, { status: 400 });
  }

  try {
    const prefs = await savePreferences(session!.user_id, session!.church_id, parsed.data);
    return NextResponse.json({ success: true, preferences: prefs });
  } catch (error) {
    console.error("API notifications/preferences error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar preferências." },
      { status: 500 }
    );
  }
}
