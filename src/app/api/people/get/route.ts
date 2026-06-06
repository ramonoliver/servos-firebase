import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { firstLastSlug, resolveUniqueSlug } from "@/lib/utils/slug";
import { z } from "zod";

const bodySchema = z.object({
  personId: z.string().min(1).optional(),
  personSlug: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const { actor, session, errorResponse } = await requireApiActor(req, { select: "*" });
  if (errorResponse) return errorResponse;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || (!parsed.data.personId && !parsed.data.personSlug)) {
    return NextResponse.json({ error: "personId ou personSlug é obrigatório." }, { status: 400 });
  }

  const { personId, personSlug } = parsed.data;
  // O parâmetro recebido pode ser um slug amigável (ex: "ramon-sousa") ou um ID legado.
  const ref = personSlug || personId!;
  const churchId = session!.church_id;
  const supabase = getFirebaseAdminClient();

  // 1) Tenta por slug. 2) Se não encontrar, tenta por ID (pessoas antigas ainda não têm slug).
  let person: any = null;
  let personError: unknown = null;

  if (personSlug) {
    const bySlug = await supabase
      .from("users")
      .select("*")
      .eq("slug", ref)
      .eq("church_id", churchId)
      .maybeSingle();
    person = bySlug.data;
    personError = bySlug.error;
  }

  if (!person && !personError) {
    const byId = await supabase
      .from("users")
      .select("*")
      .eq("id", ref)
      .eq("church_id", churchId)
      .maybeSingle();
    person = byId.data;
    personError = byId.error;
  }

  if (personError) {
    console.error("Erro ao buscar pessoa:", personError);
    return NextResponse.json({ error: "Erro ao buscar pessoa." }, { status: 500 });
  }

  if (!person) {
    return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });
  }

  // Backfill preguiçoso: gera um slug amigável para pessoas antigas que ainda não têm.
  if (!person.slug && person.name) {
    try {
      const baseSlug = firstLastSlug(String(person.name));
      const newSlug = await resolveUniqueSlug(baseSlug, async (candidate) => {
        const { data } = await supabase
          .from("users")
          .select("id")
          .eq("slug", candidate)
          .eq("church_id", churchId)
          .neq("id", person.id)
          .maybeSingle();
        return Boolean(data);
      });
      await supabase.from("users").update({ slug: newSlug }).eq("id", person.id).eq("church_id", churchId);
      person.slug = newSlug;
    } catch (slugErr) {
      console.error("Erro ao gerar slug da pessoa:", slugErr);
    }
  }

  const [
    { data: notesData, error: notesError2 },
    { data: departmentLinks, error: departmentLinksError },
    { data: scheduleMembers, error: scheduleMembersError },
    { data: reverseSpouse, error: reverseSpouseError },
  ] = await Promise.all([
    supabase
      .from("pastoral_notes")
      .select("*")
      .eq("person_id", person.id)
      .order("date", { ascending: false }),
    supabase.from("department_members").select("*").eq("user_id", person.id),
    supabase.from("schedule_members").select("*").eq("user_id", person.id),
    supabase
      .from("users")
      .select("id, name")
      .eq("church_id", churchId)
      .eq("spouse_id", person.id)
      .maybeSingle(),
  ]);

  if (notesError2) {
    console.error("Erro ao buscar notas pastorais:", notesError2);
  }
  if (departmentLinksError) console.error("Erro ao buscar ministérios da pessoa:", departmentLinksError);
  if (scheduleMembersError) console.error("Erro ao buscar escalas da pessoa:", scheduleMembersError);
  if (reverseSpouseError) console.error("Erro ao buscar cônjuge reverso:", reverseSpouseError);

  const scheduleIds = [...new Set((scheduleMembers || []).map((item: any) => item.schedule_id).filter(Boolean))];
  const { data: schedules, error: schedulesError } = scheduleIds.length
    ? await supabase
        .from("schedules")
        .select("*")
        .eq("church_id", churchId)
        .in("id", scheduleIds)
    : { data: [], error: null };

  if (schedulesError) console.error("Erro ao buscar detalhes das escalas da pessoa:", schedulesError);

  const eventIds = [...new Set((schedules || []).map((item: any) => item.event_id).filter(Boolean))];
  const { data: events, error: eventsError } = eventIds.length
    ? await supabase
        .from("events")
        .select("*")
        .eq("church_id", churchId)
        .in("id", eventIds)
    : { data: [], error: null };

  if (eventsError) console.error("Erro ao buscar eventos das escalas da pessoa:", eventsError);

  return NextResponse.json({
    person,
    notes: notesData || [],
    departmentLinks: departmentLinks || [],
    scheduleMembers: scheduleMembers || [],
    schedules: schedules || [],
    events: events || [],
    reverseSpouse: reverseSpouse || null,
  });
}
