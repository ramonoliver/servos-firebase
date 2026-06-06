"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/hooks/use-app";
import { Avatar, PageHeader, DateField } from "@/components/ui";
import { supabase } from "@/lib/firebase";
import { suggestMembers, autoSelectWithCouples } from "@/lib/ai/engine";
import { getDayOfWeek, getIconEmoji } from "@/lib/utils/helpers";
import type {
  Event,
  User,
  DepartmentMember,
  Schedule,
  ScheduleMember,
  UnavailableDate,
} from "@/types";

export default function NovaEscalaPage() {
  const { user, toast, departments } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [events, setEvents] = useState<Event[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [allDM, setAllDM] = useState<DepartmentMember[]>([]);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [allSM, setAllSM] = useState<ScheduleMember[]>([]);
  const [allUD, setAllUD] = useState<UnavailableDate[]>([]);
  const [loading, setLoading] = useState(true);

  const [eventId, setEventId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [arrivalTime, setArrivalTime] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aiRan, setAiRan] = useState(false);
  const [activeFunctionFilter, setActiveFunctionFilter] = useState<string>("all");
  const [functionTargets, setFunctionTargets] = useState<Record<string, number>>({});

  async function loadData() {
    setLoading(true);

    const [
      { data: eventsData, error: eventsError },
      { data: membersData, error: membersError },
      { data: schedulesData, error: schedulesError },
    ] = await Promise.all([
      supabase.from("events").select("*").eq("church_id", user.church_id).eq("active", true),
      supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
      supabase.from("schedules").select("*").eq("church_id", user.church_id),
    ]);

    if (eventsError || membersError || schedulesError) {
      console.error({
        eventsError,
        membersError,
        schedulesError,
      });
      toast("Erro ao carregar dados da escala.");
      setLoading(false);
      return;
    }

    const loadedEvents = (eventsData || []) as Event[];
    const loadedMembers = (membersData || []) as User[];
    const loadedSchedules = (schedulesData || []) as Schedule[];
    const memberIds = loadedMembers.map((member) => member.id);
    const scheduleIds = loadedSchedules.map((schedule) => schedule.id);

    const [
      { data: dmData, error: dmError },
      { data: smData, error: smError },
      { data: udData, error: udError },
    ] = await Promise.all([
      departments.length
        ? supabase.from("department_members").select("*").in("department_id", departments.map((dept) => dept.id))
        : Promise.resolve({ data: [], error: null }),
      scheduleIds.length
        ? supabase.from("schedule_members").select("*").in("schedule_id", scheduleIds)
        : Promise.resolve({ data: [], error: null }),
      memberIds.length
        ? supabase.from("unavailable_dates").select("*").in("user_id", memberIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (dmError || smError || udError) {
      console.error({ dmError, smError, udError });
      toast("Erro ao carregar dados da escala.");
      setLoading(false);
      return;
    }

    setEvents(loadedEvents);
    setMembers(loadedMembers);
    setAllDM((dmData || []) as DepartmentMember[]);
    setAllSchedules(loadedSchedules);
    setAllSM((smData || []) as ScheduleMember[]);
    setAllUD((udData || []) as UnavailableDate[]);

    if (!eventId && loadedEvents.length > 0) setEventId(loadedEvents[0].id);
    if (!deptId && departments.length > 0) {
      const requestedDepartmentId = searchParams.get("departmentId");
      const initialDepartmentId = departments.some((department) => department.id === requestedDepartmentId)
        ? requestedDepartmentId
        : departments[0].id;
      setDeptId(initialDepartmentId || "");
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [user.church_id, departments.length, searchParams]);

  const deptMembers = useMemo(
    () => allDM.filter((dm) => dm.department_id === deptId),
    [deptId, allDM]
  );
  const selectedDepartment = useMemo(
    () => departments.find((department) => department.id === deptId) || null,
    [departments, deptId]
  );
  const functionOptions = useMemo(
    () => selectedDepartment?.function_names || [],
    [selectedDepartment]
  );

  useEffect(() => {
    setFunctionTargets((prev) => {
      if (functionOptions.length === 0) return {};

      const next: Record<string, number> = {};
      for (const functionName of functionOptions) {
        next[functionName] = prev[functionName] || 0;
      }
      return next;
    });
  }, [functionOptions]);

  const deptMemberIds = deptMembers.map((dm) => dm.user_id);

  const avgSchedules = members.length
    ? members.reduce((a, m) => a + m.total_schedules, 0) / members.length
    : 0;

  const scored = useMemo(() => {
    if (!date) return [];
    const dow = getDayOfWeek(date);

    return suggestMembers(members, deptMembers, {
      date,
      dayOfWeek: dow,
      deptMemberIds,
      unavailableDates: allUD,
      existingSchedules: allSchedules,
      existingScheduleMembers: allSM,
      avgSchedules,
    });
  }, [date, deptId, members, deptMembers, allUD, allSchedules, allSM]);

  const filteredScored = useMemo(() => {
    if (activeFunctionFilter === "all") return scored;
    return scored.filter(
      (item) =>
        (item.dept_member?.function_name || "Sem função") === activeFunctionFilter ||
        item.dept_member?.function_names?.includes(activeFunctionFilter)
    );
  }, [scored, activeFunctionFilter]);

  const groupedScored = useMemo(() => {
    const groups: Record<string, typeof scored> = {};
    for (const item of scored) {
      const key = item.dept_member?.function_name || "Sem função";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [scored]);

  const selectedCountByFunction = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of scored) {
      if (!selectedIds.includes(item.user.id)) continue;
      const key = item.dept_member?.function_name || "Sem função";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [scored, selectedIds]);

  const desiredCountByFunction = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const functionName of functionOptions) {
      counts[functionName] = Math.max(0, functionTargets[functionName] || 0);
    }
    return counts;
  }, [functionOptions, functionTargets]);

  const totalDesiredCount = useMemo(
    () => Object.values(desiredCountByFunction).reduce((sum, quantity) => sum + quantity, 0),
    [desiredCountByFunction]
  );

  const coverageByFunction = useMemo(
    () =>
      functionOptions.map((functionName) => {
        const desired = desiredCountByFunction[functionName] || 0;
        const selected = selectedCountByFunction[functionName] || 0;
        return {
          functionName,
          desired,
          selected,
          missing: Math.max(0, desired - selected),
          extra: Math.max(0, selected - desired),
        };
      }),
    [functionOptions, desiredCountByFunction, selectedCountByFunction]
  );

  const missingFunctions = useMemo(
    () => coverageByFunction.filter((item) => item.missing > 0),
    [coverageByFunction]
  );

  function adjustFunctionTarget(functionName: string, delta: number) {
    setFunctionTargets((prev) => ({
      ...prev,
      [functionName]: Math.max(0, (prev[functionName] || 0) + delta),
    }));
    setAiRan(false);
  }

  function runAI() {
    if (!date) {
      toast("Selecione a data primeiro.");
      return;
    }

    let auto: string[] = [];

    if (activeFunctionFilter !== "all") {
      auto = autoSelectWithCouples(
        filteredScored,
        Math.max(1, desiredCountByFunction[activeFunctionFilter] || 4)
      );
    } else if (totalDesiredCount > 0) {
      const picks = new Set<string>();

      for (const slot of coverageByFunction) {
        if (slot.desired <= 0) continue;
        const candidates = scored.filter(
          (item) =>
            (item.dept_member?.function_name || "Sem função") === slot.functionName ||
            item.dept_member?.function_names?.includes(slot.functionName)
        );
        for (const userId of autoSelectWithCouples(candidates, slot.desired)) {
          picks.add(userId);
        }
      }

      if (picks.size < totalDesiredCount) {
        for (const userId of autoSelectWithCouples(scored, totalDesiredCount)) {
          if (picks.size < totalDesiredCount) picks.add(userId);
        }
      }

      auto = [...picks];
    } else if (functionOptions.length > 0) {
      const picks = new Set<string>();

      for (const functionName of functionOptions) {
        const candidates = scored.filter(
          (item) =>
            (item.dept_member?.function_name || "") === functionName ||
            item.dept_member?.function_names?.includes(functionName)
        );
        for (const userId of autoSelectWithCouples(candidates, 2)) {
          if (picks.size < 8) picks.add(userId);
        }
      }

      if (picks.size < 8) {
        for (const userId of autoSelectWithCouples(scored, 8)) {
          if (picks.size < 8) picks.add(userId);
        }
      }

      auto = [...picks];
    } else {
      auto = autoSelectWithCouples(scored, 8);
    }

    setSelectedIds(auto);
    setAiRan(true);
    toast(
      activeFunctionFilter === "all"
        ? `IA sugeriu ${auto.length} membros com equilibrio entre funções.`
        : `IA sugeriu ${auto.length} membros para ${activeFunctionFilter}.`
    );
  }

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);

      const next = [...prev, id];
      const m = members.find((u) => u.id === id);

      if (m?.spouse_id && deptMemberIds.includes(m.spouse_id) && !next.includes(m.spouse_id)) {
        const spouseScore = scored.find((s) => s.user.id === m.spouse_id);
        if (spouseScore?.available) next.push(m.spouse_id);
      }

      return next;
    });
  }

  async function save(publish: boolean) {
    if (!date || !eventId || !deptId) {
      toast("Preencha evento, ministério e data.");
      return;
    }

    if (publish && missingFunctions.length > 0) {
      const confirmed = window.confirm(
        `Ainda faltam vagas nas funções: ${missingFunctions
          .map((item) => `${item.functionName} (${item.missing})`)
          .join(", ")}. Deseja publicar mesmo assim?`
      );

      if (!confirmed) return;
    }

    try {
      const response = await fetch("/api/schedules/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          departmentId: deptId,
          date,
          time,
          arrivalTime: arrivalTime || "",
          instructions,
          publish,
          selectedIds,
          functionTargets: desiredCountByFunction,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("Erro ao criar escala:", data);
        toast(data?.error || "Erro ao criar escala.");
        return;
      }

      if (publish) {
        const smsSentCount = data?.notifications?.sms?.sent || 0;
        const smsFailedCount = data?.notifications?.sms?.failed || 0;
        const smsSkippedCount = data?.notifications?.sms?.skipped || 0;

        if (smsSentCount > 0) {
          toast(
            `Escala publicada com ${selectedIds.length} membro(s). SMS enviado para ${smsSentCount}.`
          );
        } else if (smsSkippedCount > 0) {
          toast("Escala publicada. SMS ainda nao configurado neste ambiente.");
        } else if (smsFailedCount > 0) {
          toast(`Escala publicada, mas o SMS falhou para ${smsFailedCount} membro(s).`);
        } else {
          toast(`Escala publicada com ${selectedIds.length} membro(s)!`);
        }
      } else {
        toast("Rascunho salvo.");
      }
      router.push("/escalas");
    } catch (error) {
      console.error("Erro ao criar escala:", error);
      toast("Erro ao criar escala.");
    }
  }

  if (loading) {
    return (
      <div className="w-full">
        <div className="card p-10 text-center text-ink-faint">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        className="mb-6"
        backHref="/escalas"
        backLabel="Escalas"
        eyebrow="Serviço"
        title="Nova Escala"
        subtitle="Configure o evento, equipe e publique."
      />

      <div className="card p-6 mb-5">
        <h3 className="font-display text-lg mb-4">Evento e Data</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">Evento</label>
            <select className="input-field" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {getIconEmoji(ev.icon)} {ev.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="input-label">Ministério</label>
            <select
              className="input-field"
              value={deptId}
              onChange={(e) => {
                setDeptId(e.target.value);
                setSelectedIds([]);
                setAiRan(false);
                setActiveFunctionFilter("all");
              }}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="input-label">Data</label>
            <DateField
              value={date}
              onChange={(v) => {
                setDate(v);
                setAiRan(false);
              }}
            />
          </div>

          <div>
            <label className="input-label">Horario</label>
            <input
              type="time"
              className="input-field"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          <div>
            <label className="input-label">Horario de chegada (opcional)</label>
            <input
              type="time"
              className="input-field"
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
              placeholder="Ex: 1h antes"
            />
          </div>
        </div>
      </div>

      <div className="card p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg">Equipe ({selectedIds.length} selecionados)</h3>
          <button onClick={runAI} disabled={!date} className="btn btn-brand btn-sm disabled:opacity-40">
            &#129302; IA Sugerir
          </button>
        </div>

        {functionOptions.length > 0 && (
          <div className="mb-5 space-y-4">
            <div className="rounded-[18px] border border-border-soft bg-surface-alt/70 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                    Cobertura por função
                  </div>
                  <div className="text-sm text-ink-soft mt-1">
                    Defina quantas pessoas você quer por função e acompanhe a cobertura da equipe em tempo real.
                  </div>
                </div>
                <div className="text-xs font-medium text-ink-faint">
                  {totalDesiredCount > 0
                    ? `${selectedIds.length} de ${totalDesiredCount} vagas sugeridas preenchidas`
                    : "Defina as quantidades desejadas para orientar melhor a escala"}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {coverageByFunction.map((item) => (
                  <div
                    key={item.functionName}
                    className={`rounded-[12px] border px-3 py-2 ${
                      item.missing > 0
                        ? "border-amber/35 bg-amber-light"
                        : item.desired > 0
                        ? "border-success/25 bg-success-light"
                        : "border-border-soft bg-white/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold truncate leading-tight">{item.functionName}</div>
                        <div className="text-[10px] text-ink-faint mt-0.5">
                          {item.desired > 0 ? `${item.selected}/${item.desired} vaga(s)` : "Sem vaga"}
                          {item.missing > 0 && <span className="text-amber font-semibold"> · faltam {item.missing}</span>}
                          {item.extra > 0 && <span className="text-success font-semibold"> · +{item.extra}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => adjustFunctionTarget(item.functionName, -1)}
                          className="w-6 h-6 rounded-full border border-border-soft bg-surface text-sm font-bold leading-none"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={item.desired}
                          onChange={(e) => {
                            setFunctionTargets((prev) => ({
                              ...prev,
                              [item.functionName]: Math.max(0, Number(e.target.value) || 0),
                            }));
                            setAiRan(false);
                          }}
                          className="input-field h-7 w-10 px-1 text-center text-[13px]"
                        />
                        <button
                          type="button"
                          onClick={() => adjustFunctionTarget(item.functionName, 1)}
                          className="w-6 h-6 rounded-full border border-border-soft bg-surface text-sm font-bold leading-none"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {missingFunctions.length > 0 && (
                <div className="mt-4 rounded-[14px] border border-amber/25 bg-white/70 px-3.5 py-3 text-sm text-amber">
                  Faltando cobertura em:{" "}
                  <strong>{missingFunctions.map((item) => item.functionName).join(", ")}</strong>.
                </div>
              )}
            </div>

            <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint mb-2">
              Funções do ministério
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveFunctionFilter("all")}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                  activeFunctionFilter === "all"
                    ? "bg-brand text-white"
                    : "bg-surface-alt text-ink-muted"
                }`}
              >
                Todas
              </button>
              {functionOptions.map((functionName) => (
                <button
                  key={functionName}
                  type="button"
                  onClick={() => setActiveFunctionFilter(functionName)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                    activeFunctionFilter === functionName
                      ? "bg-brand text-white"
                      : "bg-surface-alt text-ink-muted"
                  }`}
                >
                  {functionName}
                  {selectedCountByFunction[functionName]
                    ? ` (${selectedCountByFunction[functionName]})`
                    : ""}
                  {desiredCountByFunction[functionName]
                    ? ` / ${desiredCountByFunction[functionName]}`
                    : ""}
                </button>
              ))}
            </div>
          </div>
          </div>
        )}

        {aiRan && (
          <div className="text-xs text-brand font-semibold mb-3 flex items-center gap-1">
            &#129302; IA selecionou com base em disponibilidade, rodizio, casais e aderência às funções do ministério.
          </div>
        )}

        {missingFunctions.length > 0 && (
          <div className="mb-4 rounded-[16px] border border-amber/25 bg-amber-light px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber mb-1">
              Atenção na cobertura
            </div>
            <div className="text-sm text-amber">
              Ainda faltam pessoas em <strong>{missingFunctions.map((item) => item.functionName).join(", ")}</strong>.
              Se quiser, você ainda pode publicar assim, mas o alerta vai aparecer antes da confirmação.
            </div>
          </div>
        )}

        {!date ? (
          <p className="text-sm text-ink-faint py-8 text-center">
            Selecione uma data para ver os membros disponiveis.
          </p>
        ) : filteredScored.length === 0 ? (
          <p className="text-sm text-ink-faint py-8 text-center">
            {activeFunctionFilter === "all"
              ? "Nenhum membro neste ministério."
              : `Nenhum membro com a função ${activeFunctionFilter}.`}
          </p>
        ) : activeFunctionFilter === "all" && functionOptions.length > 0 ? (
          <div className="space-y-4">
            {[
              ...functionOptions.filter((functionName) => groupedScored[functionName]?.length),
              ...Object.keys(groupedScored).filter(
                (functionName) => !functionOptions.includes(functionName)
              ),
            ].map((functionName) => (
              <div key={functionName} className="rounded-[16px] border border-border-soft overflow-hidden">
                <div className="px-4 py-2.5 bg-surface-alt border-b border-border-soft flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{functionName}</div>
                  <span className="text-[11px] text-ink-faint">
                    {selectedCountByFunction[functionName] || 0} selecionado(s)
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  {groupedScored[functionName].map((item) => {
                    const isSelected = selectedIds.includes(item.user.id);
                    const spouse = item.user.spouse_id
                      ? members.find((m) => m.id === item.user.spouse_id)
                      : null;

                    return (
                      <div key={item.user.id}>
                        <div
                          onClick={() => item.available && toggleMember(item.user.id)}
                          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] border-[1.5px] transition-all ${
                            !item.available
                              ? "opacity-35 cursor-not-allowed border-transparent bg-surface-alt"
                              : isSelected
                              ? "border-success bg-success-light cursor-pointer"
                              : "border-border-soft cursor-pointer hover:border-ink-ghost"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[10px] font-bold transition-all ${
                              isSelected ? "bg-ink border-ink text-white" : "border-border"
                            }`}
                          >
                            {isSelected ? "\u2713" : ""}
                          </div>

                          <Avatar
                            name={item.user.name}
                            color={item.user.avatar_color}
                            photoUrl={item.user.photo_url}
                            size={28}
                          />

                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium truncate">{item.user.name}</div>
                            <div className="text-[10px] text-ink-faint">
                              {item.user.total_schedules} escalas &middot; Score: {item.score}
                            </div>
                          </div>

                          {spouse && deptMemberIds.includes(spouse.id) && (
                            <span className="text-[9px] font-semibold text-brand bg-brand-light px-1.5 py-0.5 rounded-full">
                              &#128145; {spouse.name.split(" ")[0]}
                            </span>
                          )}

                          <div className={`w-2 h-2 rounded-full ${item.available ? "bg-success" : "bg-danger"}`} />
                        </div>

                        {!item.available && (
                          <div className="text-[10px] text-danger font-medium ml-9 mt-0.5">
                            &#9888; {item.reasons[0]?.label}
                          </div>
                        )}

                        {item.alerts.length > 0 && item.available && (
                          <div className="text-[10px] text-amber font-medium ml-9 mt-0.5">
                            &#9888; {item.alerts.join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredScored.map((item) => {
              const isSelected = selectedIds.includes(item.user.id);
              const spouse = item.user.spouse_id
                ? members.find((m) => m.id === item.user.spouse_id)
                : null;

              return (
                <div key={item.user.id}>
                  <div
                    onClick={() => item.available && toggleMember(item.user.id)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] border-[1.5px] transition-all ${
                      !item.available
                        ? "opacity-35 cursor-not-allowed border-transparent bg-surface-alt"
                        : isSelected
                        ? "border-success bg-success-light cursor-pointer"
                        : "border-border-soft cursor-pointer hover:border-ink-ghost"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[10px] font-bold transition-all ${
                        isSelected ? "bg-ink border-ink text-white" : "border-border"
                      }`}
                    >
                      {isSelected ? "\u2713" : ""}
                    </div>

                    <Avatar
                      name={item.user.name}
                      color={item.user.avatar_color}
                      photoUrl={item.user.photo_url}
                      size={28}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{item.user.name}</div>
                      <div className="text-[10px] text-ink-faint">
                        {item.dept_member?.function_name || ""} &middot; {item.user.total_schedules} escalas &middot; Score: {item.score}
                      </div>
                    </div>

                    {spouse && deptMemberIds.includes(spouse.id) && (
                      <span className="text-[9px] font-semibold text-brand bg-brand-light px-1.5 py-0.5 rounded-full">
                        &#128145; {spouse.name.split(" ")[0]}
                      </span>
                    )}

                    <div className={`w-2 h-2 rounded-full ${item.available ? "bg-success" : "bg-danger"}`} />
                  </div>

                  {!item.available && (
                    <div className="text-[10px] text-danger font-medium ml-9 mt-0.5">
                      &#9888; {item.reasons[0]?.label}
                    </div>
                  )}

                  {item.alerts.length > 0 && item.available && (
                    <div className="text-[10px] text-amber font-medium ml-9 mt-0.5">
                      &#9888; {item.alerts.join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-6 mb-5">
        <h3 className="font-display text-lg mb-4">Instrucoes (opcional)</h3>
        <textarea
          className="input-field min-h-[80px]"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Notas para a equipe, repertorio, orientacoes..."
        />
      </div>

      <div className="flex gap-3 justify-end">
        <button onClick={() => router.back()} className="btn btn-secondary">
          Cancelar
        </button>
        <button onClick={() => save(false)} className="btn btn-secondary">
          Salvar rascunho
        </button>
        <button onClick={() => save(true)} className="btn btn-primary">
          Publicar e notificar &middot;{" "}
          {totalDesiredCount > 0 ? `${selectedIds.length}/${totalDesiredCount}` : selectedIds.length}
        </button>
      </div>
    </div>
  );
}
