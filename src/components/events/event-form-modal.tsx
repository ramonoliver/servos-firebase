"use client";

import { useState } from "react";
import {
  EVENT_CATEGORIES,
  EVENT_WEEKDAYS,
  getEventCategory,
  nextOccurrenceDate,
  parseEventRecurrence,
} from "@/lib/events/recurrence";
import { useApp } from "@/hooks/use-app";
import { formatDate } from "@/lib/utils/helpers";
import { defaultRooms } from "@/components/kids/kids-ui";
import type { Event } from "@/types";
import { ActionDrawer } from "@/components/ui";

type EventFormModalProps = {
  ev?: Event;
  toast: (msg: string) => void;
  close: () => void;
  onSaved: () => Promise<void>;
};

export function EventFormModal({ ev, toast, close, onSaved }: EventFormModalProps) {
  const { departments, canDo } = useApp();
  const isEdit = !!ev;
  const parsedRecurrence = parseEventRecurrence(ev?.recurrence);
  const [category, setCategory] = useState(ev?.icon || "church");
  const [name, setName] = useState(ev?.name || "");
  const [desc, setDesc] = useState(ev?.description || "");
  const [type, setType] = useState<"recurring" | "special">((ev?.type as "recurring" | "special") || "recurring");
  const [location, setLocation] = useState(ev?.location || "");
  const [baseTime, setBaseTime] = useState(ev?.base_time || "");
  const [weekday, setWeekday] = useState(parsedRecurrence.weekday);
  const [eventDate, setEventDate] = useState(parsedRecurrence.date);
  const [instructions, setInstructions] = useState(ev?.instructions || "");
  const [saving, setSaving] = useState(false);

  // Passo 2 — "Agenda como motor": configurar a operação do evento recém-criado.
  const [step, setStep] = useState<"form" | "operation">("form");
  const [createdEventId, setCreatedEventId] = useState("");
  const [opDate, setOpDate] = useState("");
  const [opTime, setOpTime] = useState("");
  const [selectedMinistryIds, setSelectedMinistryIds] = useState<string[]>([]);
  const [sendNotice, setSendNotice] = useState(false);
  const [noticeAudience, setNoticeAudience] = useState<"church" | "ministry">("church");
  const [noticeMinistryId, setNoticeMinistryId] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [enableKids, setEnableKids] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Ministérios em que o usuário pode criar escala (líder só nos que lidera).
  const eligibleMinistries = departments.filter((d) => canDo("schedule.create", d.id));

  const recurrenceString = type === "recurring" ? `weekly:${weekday}` : `once:${eventDate}`;

  async function save() {
    if (!name.trim()) {
      toast("Informe o nome.");
      return;
    }
    if (type === "special" && !eventDate) {
      toast("Informe a data do evento especial.");
      return;
    }

    setSaving(true);

    const data = {
      name: name.trim(),
      description: desc,
      type,
      icon: category,
      location,
      base_time: baseTime,
      instructions,
      recurrence: recurrenceString,
    };

    try {
      const response = await fetch("/api/events/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: isEdit ? "update" : "create",
          eventId: ev?.id,
          data,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("Erro ao salvar evento:", payload);
        toast(payload?.error || "Erro ao salvar evento.");
        setSaving(false);
        return;
      }

      setSaving(false);

      // Edição: comportamento antigo (fecha + recarrega).
      if (isEdit || !payload?.id) {
        toast(isEdit ? "Atualizado!" : "Evento criado!");
        await onSaved();
        return;
      }

      // Criação: abre o passo de operação ("motor") em vez de fechar.
      toast("Evento criado!");
      const nextDate = nextOccurrenceDate(recurrenceString);
      const nextTime = baseTime || "18:00";
      setCreatedEventId(payload.id);
      setOpDate(nextDate);
      setOpTime(nextTime);
      setSelectedMinistryIds([]);
      setSendNotice(false);
      setEnableKids(false);
      setNoticeTitle(`Novo: ${name.trim()}`);
      setNoticeBody(
        `${name.trim()} em ${formatDate(nextDate)} às ${nextTime}${location ? ` — ${location}` : ""}.`
      );
      setStep("operation");
    } catch (error) {
      console.error("Erro ao salvar evento:", error);
      toast("Erro ao salvar evento.");
      setSaving(false);
    }
  }

  function toggleMinistry(id: string) {
    setSelectedMinistryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function generate() {
    setGenerating(true);
    let scheduleCount = 0;
    let noticeSent = false;
    let kidsDone = false;
    try {
      // Escalas rascunho (uma por ministério selecionado).
      for (const deptId of selectedMinistryIds) {
        const dept = departments.find((d) => d.id === deptId);
        const functionTargets = Object.fromEntries((dept?.function_names || []).map((fn) => [fn, 1]));
        const res = await fetch("/api/schedules/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: createdEventId,
            departmentId: deptId,
            date: opDate,
            time: opTime,
            arrivalTime: "",
            instructions,
            publish: false,
            selectedIds: [],
            functionTargets,
          }),
        });
        if (res.ok) scheduleCount += 1;
      }

      // Aviso/comunicado opcional.
      if (sendNotice && noticeTitle.trim() && noticeBody.trim()) {
        const payload =
          noticeAudience === "ministry" && noticeMinistryId
            ? { audience: "ministry", departmentId: noticeMinistryId, title: noticeTitle.trim(), body: noticeBody.trim() }
            : { audience: "church", title: noticeTitle.trim(), body: noticeBody.trim() };
        const res = await fetch("/api/communications/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) noticeSent = true;
      }

      // Setup Kids: garante que existam salas (semeia padrão se não houver).
      if (enableKids) {
        try {
          const listRes = await fetch(`/api/kids/list?eventId=${createdEventId}&eventDate=${opDate}`);
          const listData = await listRes.json().catch(() => null);
          const rooms = (listData?.rooms || []) as unknown[];
          if (rooms.length === 0) {
            for (const room of defaultRooms) {
              await fetch("/api/kids/manage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "upsert_room", room: { ...room, status: "active", volunteer_ids: [] } }),
              });
            }
          }
          kidsDone = true;
        } catch (kidsErr) {
          console.error("Falha ao configurar Kids:", kidsErr);
        }
      }

      const parts: string[] = [];
      if (scheduleCount) parts.push(`${scheduleCount} escala${scheduleCount > 1 ? "s" : ""} rascunho`);
      if (noticeSent) parts.push("aviso enviado");
      if (kidsDone) parts.push("Kids configurado");
      toast(parts.length ? `Operação gerada: ${parts.join(", ")}.` : "Operação concluída.");
      await onSaved();
    } catch (error) {
      console.error("Erro ao gerar operação:", error);
      toast("Falha ao gerar operação.");
      setGenerating(false);
    }
  }

  if (step === "operation") {
    return (
      <ActionDrawer
        open={true}
        title="Configurar operação"
        onClose={() => void onSaved()}
        width={540}
        footer={
          <>
            <button onClick={() => void onSaved()} disabled={generating} className="btn btn-secondary">
              Pular
            </button>
            <button onClick={generate} disabled={generating} className="btn btn-primary">
              {generating ? "Gerando..." : "Gerar"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-ink-muted">
            O evento <strong className="text-ink">{name.trim()}</strong> foi criado. Configure a operação dele de uma vez —
            escalas, aviso e Kids.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Data da operação</label>
              <input type="date" className="input-field" value={opDate} onChange={(e) => setOpDate(e.target.value)} />
            </div>
            <div>
              <label className="input-label">Horário</label>
              <input type="time" className="input-field" value={opTime} onChange={(e) => setOpTime(e.target.value)} />
            </div>
          </div>

          {/* Escalas */}
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">Escalas (rascunho)</div>
            {eligibleMinistries.length === 0 ? (
              <p className="text-[13px] text-ink-faint">Nenhum ministério disponível para você criar escala.</p>
            ) : (
              <div className="grid gap-2">
                {eligibleMinistries.map((d) => {
                  const checked = selectedMinistryIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleMinistry(d.id)}
                      className={`flex items-center justify-between rounded-[14px] border px-4 py-3 text-left transition ${
                        checked ? "border-brand bg-brand-light/40" : "border-border-soft bg-white hover:bg-surface-alt"
                      }`}
                    >
                      <div>
                        <div className="text-[13px] font-semibold text-ink">{d.name}</div>
                        <div className="text-[11px] text-ink-muted">
                          {(d.function_names || []).length > 0 ? `${(d.function_names || []).length} funções` : "Sem funções definidas"}
                        </div>
                      </div>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-brand bg-brand text-white" : "border-border"}`}>
                        {checked ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Aviso */}
          <div className="rounded-[16px] border border-border-soft bg-surface-alt/40 p-4">
            <label className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">Enviar aviso sobre o evento</span>
              <input type="checkbox" checked={sendNotice} onChange={(e) => setSendNotice(e.target.checked)} className="h-4 w-4 accent-brand" />
            </label>
            {sendNotice && (
              <div className="mt-3 space-y-2">
                <select className="input-field" value={noticeAudience} onChange={(e) => setNoticeAudience(e.target.value as "church" | "ministry")}>
                  <option value="church">Toda a igreja</option>
                  <option value="ministry">Um ministério</option>
                </select>
                {noticeAudience === "ministry" && (
                  <select className="input-field" value={noticeMinistryId} onChange={(e) => setNoticeMinistryId(e.target.value)}>
                    <option value="">Selecione o ministério…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
                <input className="input-field" value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} placeholder="Título" maxLength={120} />
                <textarea className="input-field min-h-[70px]" value={noticeBody} onChange={(e) => setNoticeBody(e.target.value)} placeholder="Mensagem" maxLength={2000} />
              </div>
            )}
          </div>

          {/* Kids */}
          <div className="rounded-[16px] border border-border-soft bg-surface-alt/40 p-4">
            <label className="flex items-center justify-between">
              <div>
                <span className="text-[13px] font-semibold text-ink">Este evento terá Kids</span>
                <p className="text-[11px] text-ink-muted">Garante que existam salas para o check-in infantil.</p>
              </div>
              <input type="checkbox" checked={enableKids} onChange={(e) => setEnableKids(e.target.checked)} className="h-4 w-4 accent-brand" />
            </label>
          </div>
        </div>
      </ActionDrawer>
    );
  }

  return (
    <ActionDrawer
      open={true}
      title={isEdit ? "Editar evento" : "Novo evento"}
      onClose={close}
      width={540}
      footer={
        <>
          <button onClick={close} className="btn btn-secondary">
            Cancelar
          </button>
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Salvando..." : isEdit ? "Salvar" : "Criar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="input-label">Categoria</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {EVENT_CATEGORIES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategory(item.value)}
                className={`flex h-11 items-center justify-center rounded-2xl border px-3 text-xs font-semibold transition ${
                  category === item.value
                    ? "border-brand bg-brand-light text-brand"
                    : "border-border-soft bg-white text-ink-muted hover:bg-surface-alt"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="input-label">Nome</label>
          <input
            className="input-field"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={`Ex: ${getEventCategory(category).label} de domingo`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="input-label">Tipo</label>
            <select className="input-field" value={type} onChange={(event) => setType(event.target.value as "recurring" | "special")}>
              <option value="recurring">Recorrente</option>
              <option value="special">Especial</option>
            </select>
          </div>

          {type === "recurring" ? (
            <div>
              <label className="input-label">Dia da semana</label>
              <select className="input-field" value={weekday} onChange={(event) => setWeekday(event.target.value)}>
                {EVENT_WEEKDAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="input-label">Data</label>
              <input
                type="date"
                className="input-field"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="input-label">Local</label>
            <input
              className="input-field"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Templo principal"
            />
          </div>

          <div>
            <label className="input-label">Horário base</label>
            <input
              type="time"
              className="input-field"
              value={baseTime}
              onChange={(event) => setBaseTime(event.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="input-label">Descrição</label>
          <textarea
            className="input-field min-h-[70px]"
            value={desc}
            onChange={(event) => setDesc(event.target.value)}
            placeholder="Resumo curto do evento..."
          />
        </div>

        <div>
          <label className="input-label">Instruções</label>
          <textarea
            className="input-field min-h-[70px]"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Orientações para este evento..."
          />
        </div>
      </div>
    </ActionDrawer>
  );
}
