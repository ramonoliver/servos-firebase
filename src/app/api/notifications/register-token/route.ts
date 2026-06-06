import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { registerDeviceToken } from "@/services/notification.service";

const schema = z.object({
  token: z.string().min(1),
  platform: z.string().optional(),
});

export async function POST(req: Request) {
  const { session, errorResponse } = await requireApiActor(req, { select: "*" });
  if (errorResponse) return errorResponse;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Token é obrigatório." }, { status: 400 });
  }

  try {
    await registerDeviceToken({
      userId: session!.user_id,
      churchId: session!.church_id,
      token: parsed.data.token,
      platform: parsed.data.platform || "web",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API notifications/register-token error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao registrar token." },
      { status: 500 }
    );
  }
}
