import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { deliverMemberInvitation } from "@/lib/server/member-invitations";

type SendWelcomeEmailBody = {
  to?: string;
  phone?: string;
  memberName?: string;
  churchName?: string;
  tempPassword?: string;
  userId?: string;
  churchId?: string;
  invitedByUserId?: string;
};

export async function POST(req: Request) {
  try {
    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;
    if (!actor?.active || !can(actor, "member.invite")) {
      return NextResponse.json({ error: "Sem permissao para enviar convite." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as SendWelcomeEmailBody;
    const {
      to,
      phone,
      memberName,
      churchName,
      tempPassword,
      userId,
      churchId,
      invitedByUserId,
    } = body;

    if (!to || !memberName || !churchName || !tempPassword) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const delivery = await deliverMemberInvitation({
      to,
      phone,
      memberName,
      churchName,
      tempPassword,
      userId,
      churchId,
      invitedByUserId,
    });

    return NextResponse.json(delivery);
  } catch (error) {
    console.error("API send-welcome-email error:", error);
    return NextResponse.json(
      { error: "Failed to send invite" },
      { status: 500 }
    );
  }
}
