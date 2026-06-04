import { NextResponse } from "next/server";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=",
  "base64"
);

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const token = params.token?.trim();

  if (token) {
    try {
      const supabase = getFirebaseAdminClient();
      const { data: invitation } = await supabase
        .from("member_invitations")
        .select("id, open_count, opened_at")
        .eq("tracking_token", token)
        .maybeSingle();

      if (invitation?.id) {
        const now = new Date().toISOString();
        await supabase
          .from("member_invitations")
          .update({
            open_count: (invitation.open_count || 0) + 1,
            opened_at: invitation.opened_at || now,
          })
          .eq("id", invitation.id);
      }
    } catch (error) {
      console.error("Erro ao registrar abertura do convite:", error);
    }
  }

  return new NextResponse(TRANSPARENT_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
