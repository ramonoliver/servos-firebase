import { NextResponse } from "next/server";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { sendUserNotification } from "@/lib/server/notification-service";

/**
 * POST /api/birthday-notifications
 *
 * Triggered daily by Vercel Cron (see vercel.json).
 * Finds all users whose birthday is today and notifies their cell leader.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getFirebaseAdminClient();
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Query active users and filter birthdays in memory
    const { data: allUsers, error: birthdayError } = await supabase
      .from("users")
      .select("id, name, church_id, birth_date")
      .eq("active", true);

    if (birthdayError) {
      console.error("Birthday query error:", birthdayError);
      return NextResponse.json({ error: birthdayError.message }, { status: 500 });
    }

    const birthdayUsers = (allUsers ?? []).filter((user: any) => {
      const bDate = user.birth_date || user.birthDate;
      if (!bDate) return false;
      const dateParts = bDate.split("T")[0].split("-");
      if (dateParts.length < 3) return false;
      const birthMonth = parseInt(dateParts[1], 10);
      const birthDay = parseInt(dateParts[2], 10);
      return birthMonth === month && birthDay === day;
    });

    const users = birthdayUsers as Array<{ id: string; name: string; church_id: string }>;

    let notificationsSent = 0;

    for (const person of users) {
      // Find active cell membership
      const { data: membership } = await supabase
        .from("cell_members")
        .select("cell_id")
        .eq("user_id", person.id)
        .eq("status", "active")
        .maybeSingle();

      if (!membership?.cell_id) continue;

      // Find cell and its leader
      const { data: cell } = await supabase
        .from("cells")
        .select("leader_id, name")
        .eq("id", membership.cell_id)
        .maybeSingle();

      const leaderId = (cell as { leader_id?: string | null; name?: string } | null)?.leader_id;
      if (!leaderId || leaderId === person.id) continue;

      try {
        await sendUserNotification({
          userId: leaderId,
          churchId: person.church_id,
          title: "🎂 Aniversário hoje!",
          body: `${person.name} faz aniversário hoje. Que tal enviar uma mensagem de parabéns?`,
          actionUrl: `/membros/${person.id}`,
          type: "info",
        });
        notificationsSent++;
      } catch (err) {
        console.error(`Failed to notify leader for ${person.name}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      birthdayCount: users.length,
      notificationsSent,
    });
  } catch (error) {
    console.error("birthday-notifications error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
