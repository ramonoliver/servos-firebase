import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { AUTH_COOKIE_NAME, createSessionPayload, encodeSessionToken } from "@/lib/auth/server-session";
import { getFirebaseAdminClient, adminAuth } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";
import type { User } from "@/types";

const bodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().default(""),
  password: z.string().min(6),
  churchName: z.string().trim().min(1),
  weeklyServices: z
    .array(
      z.object({
        day: z.string().min(1),
        time: z.string().min(1),
      })
    )
    .min(1)
    .default([
      { day: "0", time: "18:00" },
      { day: "3", time: "19:30" },
    ]),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para criar conta." }, { status: 400 });
    }

    const { name, email, phone, password, churchName, weeklyServices } = parsed.data;
    const db = getFirebaseAdminClient();
    const normalizedEmail = email.trim().toLowerCase();

    // Check in Firestore if user email is already registered
    const { data: existingUser, error: existingUserError } = await db
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUserError) throw existingUserError;
    if (existingUser) {
      return NextResponse.json({ error: "Email ja cadastrado." }, { status: 409 });
    }

    // Create user in Firebase Auth
    let userId;
    try {
      const userRecord = await adminAuth.createUser({
        email: normalizedEmail,
        password: password,
        displayName: name.trim(),
      });
      userId = userRecord.uid;
    } catch (authError: any) {
      if (authError.code === "auth/email-already-exists") {
        return NextResponse.json({ error: "Email ja cadastrado." }, { status: 409 });
      }
      throw authError;
    }

    const now = new Date().toISOString();
    const churchId = genId();

    const { data: church, error: churchError } = await db
      .from("churches")
      .insert({
        id: churchId,
        name: churchName,
        city: "",
        state: "",
        created_at: now,
      })
      .select()
      .single();

    if (churchError || !church) {
      throw churchError || new Error("Falha ao criar igreja.");
    }

    const { data: user, error: userError } = await db
      .from("users")
      .insert({
        id: userId,
        church_id: church.id,
        email: normalizedEmail,
        password_hash: hashPassword(password),
        name: name.trim(),
        phone: phone.trim(),
        role: "admin",
        status: "active",
        avatar_color: `hsl(${Math.floor(Math.random() * 360)}, 40%, 55%)`,
        photo_url: null,
        spouse_id: null,
        availability: [true, true, true, true, true, true, true],
        total_schedules: 0,
        confirm_rate: 100,
        must_change_password: false,
        last_served_at: null,
        notes: "",
        active: true,
        joined_at: now,
        created_at: now,
      })
      .select()
      .single();

    if (userError || !user) {
      throw userError || new Error("Falha ao criar usuario.");
    }

    const dayLabels = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
    const initialEvents = weeklyServices.map((service) => ({
      id: genId(),
      church_id: church.id,
      name: `Culto de ${dayLabels[Number(service.day)] || "Culto"}`,
      description: "",
      type: "recurring" as const,
      icon: "church",
      location: "",
      base_time: service.time,
      instructions: "",
      recurrence: `weekly:${service.day}`,
      active: true,
      created_at: now,
    }));

    const { error: eventsError } = await db.from("events").insert(initialEvents);
    if (eventsError) throw eventsError;

    const { error: onboardingError } = await db
      .from("onboarding_progress")
      .insert({
        id: genId(),
        church_id: church.id,
        completed_steps: ["church"],
        completed: false,
        created_at: now,
      });

    if (onboardingError) throw onboardingError;

    const session = createSessionPayload(user);
    const token = encodeSessionToken(session);
    const clientUser = {
      id: user.id,
      church_id: user.church_id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar_color: user.avatar_color,
      photo_url: user.photo_url,
    } satisfies Pick<User, "id" | "church_id" | "email" | "name" | "role" | "avatar_color" | "photo_url">;
    const response = NextResponse.json({ success: true, session, token, user: clientUser });
    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    console.error("API auth/register error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar conta." },
      { status: 500 }
    );
  }
}
