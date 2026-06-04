import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { deliverMemberInvitation } from "@/lib/server/member-invitations";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import type { User } from "@/types";

type ResendInviteBody = {
  userId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ResendInviteBody;
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required." },
        { status: 400 }
      );
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;
    if (!actor?.active || !can(actor.role, "member.invite")) {
      return NextResponse.json({ error: "Sem permissao para reenviar convites." }, { status: 403 });
    }

    const churchId = session!.church_id;
    const invitedByUserId = session!.user_id;
    const supabase = getFirebaseAdminClient();
    const { data: member, error: memberError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (memberError) throw memberError;

    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const { data: church, error: churchError } = await supabase
      .from("churches")
      .select("id, name")
      .eq("id", churchId)
      .maybeSingle();

    if (churchError) throw churchError;
    if (!church) {
      return NextResponse.json({ error: "Church not found." }, { status: 404 });
    }

    const typedMember = member as User;
    const tempPassword = generateTempPassword();

    const { error: updateError } = await supabase
      .from("users")
      .update({
        password_hash: hashPassword(tempPassword),
        must_change_password: true,
      })
      .eq("id", typedMember.id);

    if (updateError) throw updateError;

    const delivery = await deliverMemberInvitation({
      to: typedMember.email,
      phone: typedMember.phone || "",
      memberName: typedMember.name,
      churchName: church.name,
      tempPassword,
      userId: typedMember.id,
      churchId,
      invitedByUserId,
    });

    return NextResponse.json({
      success: delivery.success,
      tempPassword,
      ...delivery,
    });
  } catch (error) {
    console.error("API resend member invitation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resend invite" },
      { status: 500 }
    );
  }
}
