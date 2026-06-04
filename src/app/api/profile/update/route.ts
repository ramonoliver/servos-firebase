import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

const bodySchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().default(""),
  availability: z.array(z.boolean()).length(7),
  photoUrl: z.string().nullable(),
  birthDate: z.string().nullable().optional(),
  addressCep: z.string().trim().default(""),
  addressStreet: z.string().trim().default(""),
  addressNumber: z.string().trim().default(""),
  addressComplement: z.string().trim().default(""),
  addressNeighborhood: z.string().trim().default(""),
  addressCity: z.string().trim().default(""),
  addressState: z.string().trim().max(2).default(""),
});

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const msg = "message" in error ? String((error as { message?: unknown }).message || "").toLowerCase() : "";
  return msg.includes("column") && msg.includes("does not exist");
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para atualizar perfil." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req, { select: "id, church_id, active" });
    if (errorResponse) return errorResponse;

    const { name, phone, availability, photoUrl, birthDate, addressCep, addressStreet, addressNumber, addressComplement, addressNeighborhood, addressCity, addressState } = parsed.data;
    const supabase = getFirebaseAdminClient();
    if (!actor?.active) {
      return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    }

    const baseUpdates = {
      name,
      phone,
      availability,
      photo_url: photoUrl,
    };

    const extendedUpdates: Record<string, unknown> = {
      ...baseUpdates,
      birth_date: birthDate ?? null,
      address_cep: addressCep,
      address_street: addressStreet,
      address_number: addressNumber,
      address_complement: addressComplement,
      address_neighborhood: addressNeighborhood,
      address_city: addressCity,
      address_state: addressState,
    };

    const query = supabase
      .from("users")
      .update(extendedUpdates)
      .eq("id", actor.id)
      .eq("church_id", session!.church_id)
      .select("*")
      .single();

    let { data: updatedUser, error: updateError } = await query;

    // If new columns don't exist yet (migration pending), fall back to base fields only
    if (updateError && isMissingColumnError(updateError)) {
      const fallback = await supabase
        .from("users")
        .update(baseUpdates)
        .eq("id", actor.id)
        .eq("church_id", session!.church_id)
        .select("*")
        .single();
      updatedUser = fallback.data;
      updateError = fallback.error;
    }

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("API profile/update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar perfil." },
      { status: 500 }
    );
  }
}
