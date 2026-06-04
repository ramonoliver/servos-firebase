import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { calculateAge } from "@/lib/kids/domain";
import type { KidsCheckIn, KidsChild, KidsGuardianLink, KidsRoom } from "@/lib/kids/types";
import type { User } from "@/types";

export const dynamic = "force-dynamic";

function isMissingKidsSchema(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : String(error || "");
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code === "42P01" || /kids_|is_child|guardian_ids|schema cache|does not exist/i.test(message);
}

export async function GET(req: Request) {
  try {
    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    if (!actor?.active) {
      return NextResponse.json({ error: "Usuario inativo." }, { status: 403 });
    }

    const url = new URL(req.url);
    const eventId = url.searchParams.get("eventId") || "";
    const eventDate = url.searchParams.get("eventDate") || new Date().toISOString().slice(0, 10);
    const churchId = session!.church_id;
    const supabase = getFirebaseAdminClient();

    const [{ data: users, error: usersError }, { data: rooms, error: roomsError }, { data: guardianship, error: guardianshipError }, { data: checkins, error: checkinsError }] =
      await Promise.all([
        supabase
          .from("users")
          .select("id, church_id, email, name, phone, role, status, avatar_color, photo_url, birth_date, gender, active, created_at, is_child, primary_guardian_id, guardian_ids")
          .eq("church_id", churchId)
          .eq("active", true),
        supabase.from("kids_rooms").select("*").eq("church_id", churchId).order("min_age", { ascending: true }),
        supabase.from("kids_guardianship").select("*").eq("church_id", churchId),
        eventId
          ? supabase.from("kids_checkins").select("*").eq("church_id", churchId).eq("event_id", eventId).eq("event_date", eventDate).order("checked_in_at", { ascending: true })
          : supabase.from("kids_checkins").select("*").eq("church_id", churchId).eq("event_date", eventDate).order("checked_in_at", { ascending: true }),
      ]);

    if (usersError) throw usersError;
    if (roomsError || guardianshipError || checkinsError) {
      const error = roomsError || guardianshipError || checkinsError;
      if (isMissingKidsSchema(error)) {
        return NextResponse.json({ children: [], rooms: [], checkins: [], schemaReady: false });
      }
      throw error;
    }

    const userRows = (users || []) as User[];
    const userById = new Map(userRows.map((user) => [user.id, user]));
    const links = (guardianship || []) as KidsGuardianLink[];
    const children: KidsChild[] = userRows
      .map((user) => ({ user, age: calculateAge(user.birth_date) }))
      .filter(({ user, age }) => Boolean((user as any).is_child) || (age !== null && age <= 12))
      .map(({ user, age }) => {
        const childLinks = links.filter((link) => link.child_id === user.id);
        const guardians = childLinks
          .map((link) => {
            const guardian = userById.get(link.guardian_id);
            if (!guardian) return null;
            return {
              link_id: link.id,
              guardian: {
                id: guardian.id,
                name: guardian.name,
                phone: guardian.phone,
                email: guardian.email,
                avatar_color: guardian.avatar_color,
                photo_url: guardian.photo_url,
              },
              relationship: link.relationship,
              is_primary: link.is_primary,
            };
          })
          .filter(Boolean) as KidsChild["guardians"];
        const primary = guardians.find((item) => item.is_primary) || guardians[0];
        return {
          ...user,
          age,
          guardians,
          primary_phone: primary?.guardian.phone || user.phone || "",
        };
      });

    const childrenById = new Map(children.map((child) => [child.id, child]));
    const roomsById = new Map(((rooms || []) as KidsRoom[]).map((room) => [room.id, room]));
    const checkinViews = ((checkins || []) as KidsCheckIn[]).map((checkin) => ({
      ...checkin,
      child: childrenById.get(checkin.child_id),
      room: roomsById.get(checkin.room_id),
      guardian: userById.get(checkin.guardian_id),
    }));

    return NextResponse.json({
      children,
      rooms: (rooms || []) as KidsRoom[],
      checkins: checkinViews,
      schemaReady: true,
    });
  } catch (error) {
    console.error("API kids/list error:", error);
    if (isMissingKidsSchema(error)) {
      return NextResponse.json({ children: [], rooms: [], checkins: [], schemaReady: false });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar Kids." },
      { status: 500 }
    );
  }
}
