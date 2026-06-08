"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { Avatar, ConfirmDialog, PageShell } from "@/components/ui";
import { CellForm } from "@/components/shared/cell-form";
import { CellMeetingForm } from "@/components/shared/cell-meeting-form";
import { fetchCells, saveCell, fetchMeetings, saveMeeting } from "@/lib/cells/client";
import {
  cellHealthAverage,
  cellHealthStatus,
  HEALTH_STATUS_STYLES,
  formatMeetingDate,
  MEETING_FEELINGS,
  type Cell,
  type CellMemberRow,
  type CellHealth,
  type CellMeeting,
  type CellAttendanceRow,
  type CellNetwork,
} from "@/lib/cells/types";
import { isCareCaseType, CARE_CASE_TYPES } from "@/lib/care/types";
import type { User } from "@/types";

const HEALTH_LABELS: Record<keyof CellHealth, string> = {
  frequency: "Frequência",
  communion: "Comunhão",
  participation: "Participação",
  growth: "Crescimento",
  engagement: "Engajamento",
  care: "Acompanhamento",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  paused: "Pausada",
  multiplying: "Multiplicando",
};

export default function CellDetailPage() {
  const params = useParams<{ id: string }>();
  const cellId = params?.id;
  const router = useRouter();
  const { user, toast } = useApp();
  const canDelete =
    user.role === "admin" || user.cell_role === "pastor" || user.cell_role === "coordenacao";

  const [cell, setCell] = useState<Cell | null>(null);
  const [cellMembers, setCellMembers] = useState<CellMemberRow[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [networks, setNetworks] = useState<CellNetwork[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [meetings, setMeetings] = useState<CellMeeting[]>([]);
  const [meetingAttendance, setMeetingAttendance] = useState<CellAttendanceRow[]>([]);
  const [careNotes, setCareNotes] = useState<Array<{ person_id?: string; type?: string; status?: string; title?: string; description?: string }>>([]);
  const [meetingModal, setMeetingModal] = useState<null | { meeting?: CellMeeting }>(null);
  const [deleteMeeting, setDeleteMeeting] = useState<CellMeeting | null>(null);

  async function loadMeetings() {
    if (!cellId) return;
    try {
      const { meetings: ms, attendance } = await fetchMeetings(cellId);
      setMeetings(ms);
      setMeetingAttendance(attendance);
    } catch (error) {
      console.warn("Falha ao carregar reuniões:", error);
    }
  }

  async function handleDeleteMeeting(meeting: CellMeeting) {
    try {
      await saveMeeting({ mode: "delete", cellId: cellId!, meetingId: meeting.id });
      toast("Reunião removida.");
      setDeleteMeeting(null);
      await Promise.all([loadMeetings(), loadData()]);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao remover reunião.");
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: usersData }, cellsData, { data: notesData }] = await Promise.all([
        supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
        fetchCells(),
        supabase.from("pastoral_notes").select("*").eq("church_id", user.church_id).in("type", [...CARE_CASE_TYPES]),
      ]);
      setMembers((usersData || []) as User[]);
      setCareNotes((notesData || []) as typeof careNotes);
      setCellMembers(cellsData.cellMembers.filter((cm) => cm.cell_id === cellId));
      setCell(cellsData.cells.find((c) => c.id === cellId) ?? null);
      setNetworks(cellsData.networks);
      setCanManage(cellsData.manageableIds.includes(cellId as string));
    } catch (error) {
      console.warn("Falha ao carregar célula:", error);
      setCell(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    loadMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellId, user.church_id]);

  const memberById = useMemo(() => {
    const map = new Map<string, User>();
    members.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  const memberUsers = useMemo(
    () => cellMembers.map((cm) => memberById.get(cm.user_id)).filter(Boolean) as User[],
    [cellMembers, memberById]
  );

  // Pessoas desta célula que estão em acompanhamento pastoral aberto.
  const careMembers = useMemo(() => {
    const open = careNotes.filter((n) => isCareCaseType(n.type) && n.status !== "resolved");
    return memberUsers
      .map((m) => {
        const note = open.find((n) => n.person_id === m.id);
        return note
          ? { member: m, reason: note.description || note.title || "Acompanhamento pastoral" }
          : null;
      })
      .filter(Boolean) as Array<{ member: User; reason: string }>;
  }, [careNotes, memberUsers]);

  async function handleDelete() {
    if (!cell) return;
    try {
      await saveCell({ mode: "delete", cellId: cell.id });
      toast(`${cell.name} excluída.`);
      router.push("/celulas");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao excluir célula.");
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="py-16 text-center text-sm text-ink-faint">Carregando célula...</div>
      </PageShell>
    );
  }

  if (!cell) {
    return (
      <PageShell>
        <Link href="/celulas" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-deep hover:underline">
          &larr; Células
        </Link>
        <div className="rounded-[18px] border border-border-soft bg-white/70 px-6 py-12 text-center backdrop-blur">
          <p className="text-sm font-semibold text-ink">Célula não encontrada</p>
          <p className="mt-1 text-sm text-ink-muted">Ela pode ter sido removida.</p>
        </div>
      </PageShell>
    );
  }

  const leaders = (cell.leader_ids || []).map((id) => memberById.get(id)).filter(Boolean) as User[];
  const coLeaders = (cell.co_leader_ids || []).map((id) => memberById.get(id)).filter(Boolean) as User[];
  const average = cellHealthAverage(cell.health);
  const healthStatus = cellHealthStatus(cell.health, cell.created_at);
  const healthStatusCls = HEALTH_STATUS_STYLES[healthStatus];
  const network = cell.network_id ? networks.find((n) => n.id === cell.network_id) : null;
  const networkSupervisors = (network?.supervisor_ids || []).map((id) => memberById.get(id)).filter(Boolean) as User[];

  return (
    <PageShell>
      <Link href="/celulas" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-deep hover:underline">
        &larr; Células
      </Link>

      {/* Header */}
      <div className="relative overflow-hidden rounded-[24px] border border-border-soft bg-white/70 p-6 shadow-lift backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,107,87,0.10),transparent_45%),radial-gradient(70%_120%_at_92%_8%,rgba(155,140,251,0.14),transparent_55%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1.5 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-brand-deep">
              Célula · {STATUS_LABEL[cell.status] || cell.status}
            </div>
            <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-tight text-ink">{cell.name}</h1>
            <p className="mt-1 text-[14px] text-ink-muted">
              {[cell.audience, cell.week_day, cell.time].filter(Boolean).join(" · ") || "Sem horário definido"}
            </p>
            {cell.address && <p className="mt-1 text-[13px] text-ink-faint">📍 {cell.address}</p>}
          </div>
          <div className="flex items-center gap-2 self-start flex-shrink-0">
            <span className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${healthStatusCls}`}>{healthStatus}</span>
            {canManage && (
              <button onClick={() => setShowEdit(true)} className="btn btn-secondary btn-sm">Editar</button>
            )}
            {canDelete && (
              <button onClick={() => setShowDelete(true)} className="btn btn-danger btn-sm">Excluir</button>
            )}
          </div>
        </div>
        {cell.description && <p className="relative mt-4 max-w-[680px] text-[14px] leading-relaxed text-ink-soft">{cell.description}</p>}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Supervisão */}
        <div className="rounded-[18px] border border-border-soft bg-white/70 p-4 shadow-soft backdrop-blur">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">Supervisão</p>
          {network ? (
            <>
              <p className="mt-1.5 font-display text-[15px] font-bold text-ink leading-tight">{network.name}</p>
              {networkSupervisors.length > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  {networkSupervisors.slice(0, 2).map((s) => (
                    <Avatar key={s.id} name={s.name} color={s.avatar_color} photoUrl={s.photo_url} size={22} />
                  ))}
                  <span className="text-[11px] text-ink-muted">{networkSupervisors[0]?.name.split(" ")[0]}{networkSupervisors.length > 1 ? ` & ${networkSupervisors[1]?.name.split(" ")[0]}` : ""}</span>
                </div>
              )}
              <Link href="/celulas/estrutura" className="mt-2 block text-[11px] font-semibold text-brand-deep hover:underline">Ver estrutura →</Link>
            </>
          ) : (
            <p className="mt-1.5 text-[13px] text-ink-faint">Sem supervisão</p>
          )}
        </div>

        {/* Participantes */}
        <div className="rounded-[18px] border border-border-soft bg-white/70 p-4 shadow-soft backdrop-blur">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">Participantes</p>
          <p className="mt-1.5 font-display text-[28px] font-extrabold text-ink leading-none">{memberUsers.length}</p>
          <p className="mt-0.5 text-[12px] text-ink-muted">de {cell.max_members} vagas</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt">
            <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.min((memberUsers.length / Math.max(cell.max_members, 1)) * 100, 100)}%` }} />
          </div>
        </div>

        {/* Saúde */}
        <div className="rounded-[18px] border border-border-soft bg-white/70 p-4 shadow-soft backdrop-blur">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">Saúde da célula</p>
          <div className="mt-1.5 flex items-end gap-2">
            <p className="font-display text-[28px] font-extrabold text-ink leading-none">{average}%</p>
            <span className={`mb-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${healthStatusCls}`}>{healthStatus}</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            {average >= 80 ? "Boa frequência e crescimento estável." : average >= 60 ? "Crescimento progressivo, em boa direção." : average >= 40 ? "Requer atenção pastoral." : "Necessita acompanhamento urgente."}
          </p>
        </div>

        {/* Próximo encontro */}
        <div className="rounded-[18px] border border-border-soft bg-white/70 p-4 shadow-soft backdrop-blur">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">Próximo encontro</p>
          {cell.week_day ? (
            <>
              <p className="mt-1.5 font-display text-[15px] font-bold text-ink">{cell.week_day}</p>
              <p className="text-[13px] text-ink-muted">{cell.time ? `às ${cell.time}` : "Horário não definido"}</p>
              {cell.address && <p className="mt-1 text-[11px] text-ink-faint truncate">📍 {cell.address}</p>}
            </>
          ) : (
            <p className="mt-1.5 text-[13px] text-ink-faint">Não definido</p>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="space-y-5">
        {/* Members */}
        <div className="rounded-[20px] border border-border-soft bg-white/70 p-5 shadow-soft backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[17px] font-bold text-ink">Membros</h2>
            <span className="text-[12px] font-semibold text-ink-faint">{memberUsers.length}/{cell.max_members}</span>
          </div>
          {memberUsers.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">Nenhum membro ainda. Use “Editar” para adicionar.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {memberUsers.map((m) => {
                const roleTag = (cell.leader_ids || []).includes(m.id) ? "Líder" : (cell.co_leader_ids || []).includes(m.id) ? "Co-líder" : null;
                return (
                  <Link key={m.id} href={`/pessoas/${m.id}`} className="flex items-center gap-3 rounded-[14px] border border-border-soft bg-white/60 p-2.5 transition hover:border-ink-ghost hover:bg-white hover:shadow-soft">
                    <Avatar name={m.name} color={m.avatar_color} photoUrl={m.photo_url} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">{m.name}</div>
                      {roleTag && <div className="text-[11px] font-semibold text-brand-deep">{roleTag}</div>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Reuniões */}
        <div className="rounded-[20px] border border-border-soft bg-white/70 p-5 shadow-soft backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[17px] font-bold text-ink">Reuniões</h2>
            {canManage && (
              <button onClick={() => setMeetingModal({})} className="btn btn-primary btn-sm">+ Registrar</button>
            )}
          </div>
          {meetings.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">Nenhuma reunião registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {meetings.map((mt) => {
                const rows = meetingAttendance.filter((a) => a.meeting_id === mt.id);
                const present = rows.filter((a) => a.status === "present" || a.status === "visitor" || a.status === "first_visit").length;
                const feel = MEETING_FEELINGS.find((f) => f.value === mt.feeling);
                const [dd, mm] = formatMeetingDate(mt.date).split(" ");
                return (
                  <div key={mt.id} className="flex items-center gap-3 rounded-[14px] border border-border-soft bg-white/60 p-3">
                    <div className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-[12px] bg-brand-light text-brand-deep">
                      <span className="text-[15px] font-extrabold leading-none">{dd}</span>
                      <span className="text-[9px] font-bold uppercase">{mm}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-ink">{mt.theme || "Encontro"}</div>
                      <div className="text-[11px] text-ink-muted">{present} presentes{feel ? ` · ${feel.emoji} ${feel.label}` : ""}</div>
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <button onClick={() => setMeetingModal({ meeting: mt })} className="rounded-full px-2 py-1 text-[11px] font-semibold text-ink-muted transition hover:bg-surface-alt hover:text-ink">Editar</button>
                        <button onClick={() => setDeleteMeeting(mt)} className="rounded-full px-2 py-1 text-[11px] font-semibold text-danger transition hover:bg-danger-light">Excluir</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pessoas precisando de cuidado (admin/pastor/líder desta célula) */}
        {(canManage || canDelete) && (
          <div className="rounded-[20px] border border-border-soft bg-white/70 p-5 shadow-soft backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-[17px] font-bold text-ink">Pessoas precisando de cuidado</h2>
              {careMembers.length > 0 && (
                <span className="rounded-full bg-amber-light px-2.5 py-1 text-[11px] font-bold text-amber">{careMembers.length}</span>
              )}
            </div>
            {careMembers.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-faint">Ninguém em acompanhamento nesta célula. 🎉</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {careMembers.map(({ member, reason }) => (
                  <Link
                    key={member.id}
                    href={`/pessoas/${member.id}`}
                    className="flex items-start gap-3 rounded-[14px] border border-amber-light bg-amber-light/30 p-3 transition hover:bg-amber-light/60"
                  >
                    <Avatar name={member.name} color={member.avatar_color} photoUrl={member.photo_url} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">{member.name}</div>
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-ink-muted">{reason}</div>
                      <span className="mt-1.5 inline-block rounded-full bg-amber-light px-2 py-0.5 text-[10px] font-bold text-amber">
                        Atenção pastoral
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Side: leadership + health */}
        <div className="space-y-5">
          <div className="rounded-[20px] border border-border-soft bg-white/70 p-5 shadow-soft backdrop-blur">
            <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Liderança</h2>
            {leaders.length === 0 && coLeaders.length === 0 ? (
              <p className="text-sm text-ink-faint">Sem liderança definida.</p>
            ) : (
              <div className="space-y-3">
                {leaders.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <Avatar name={p.name} color={p.avatar_color} photoUrl={p.photo_url} size={40} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold text-ink">{p.name}</div>
                      <div className="text-[11px] text-ink-faint">{leaders.length > 1 ? "Líder (casal)" : "Líder"}</div>
                    </div>
                  </div>
                ))}
                {coLeaders.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 border-t border-border-soft pt-3">
                    <Avatar name={p.name} color={p.avatar_color} photoUrl={p.photo_url} size={40} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold text-ink">{p.name}</div>
                      <div className="text-[11px] text-ink-faint">Co-líder</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[20px] border border-border-soft bg-white/70 p-5 shadow-soft backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-[15px] font-bold text-ink">Saúde da célula</h2>
              <span className="rounded-full bg-brand-light px-2.5 py-1 text-[12px] font-bold text-brand-deep">{average}%</span>
            </div>
            <div className="space-y-3">
              {(Object.keys(HEALTH_LABELS) as (keyof CellHealth)[]).map((key) => {
                const value = cell.health?.[key] ?? 0;
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-ink-muted">{HEALTH_LABELS[key]}</span>
                      <span className="text-ink-faint">{value}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-alt">
                      <div className="h-1.5 rounded-full bg-gradient-to-r from-brand to-rose" style={{ width: `${value}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-ink-faint">A <strong className="font-semibold text-ink-muted">frequência</strong> é calculada automaticamente pela presença nas reuniões.</p>
          </div>
        </div>
      </div>

      {showEdit && (
        <CellForm
          cell={cell}
          members={members}
          cellMembers={cellMembers}
          networks={networks}
          toast={toast}
          close={() => setShowEdit(false)}
          onSaved={async () => { setShowEdit(false); await loadData(); }}
        />
      )}

      {showDelete && (
        <ConfirmDialog
          title="Excluir célula"
          message={`Você está prestes a excluir <strong>${cell.name}</strong>.`}
          confirmLabel="Excluir"
          onCancel={() => setShowDelete(false)}
          onConfirm={() => void handleDelete()}
        />
      )}

      {meetingModal && (
        <CellMeetingForm
          cellId={cell.id}
          members={memberUsers}
          meeting={meetingModal.meeting}
          existingAttendance={meetingModal.meeting ? meetingAttendance.filter((a) => a.meeting_id === meetingModal.meeting!.id) : []}
          toast={toast}
          close={() => setMeetingModal(null)}
          onSaved={async () => { setMeetingModal(null); await Promise.all([loadMeetings(), loadData()]); }}
        />
      )}

      {deleteMeeting && (
        <ConfirmDialog
          title="Remover reunião"
          message={`Remover a reunião de <strong>${formatMeetingDate(deleteMeeting.date)}</strong>?`}
          confirmLabel="Remover"
          onCancel={() => setDeleteMeeting(null)}
          onConfirm={() => void handleDeleteMeeting(deleteMeeting)}
        />
      )}
    </PageShell>
  );
}
