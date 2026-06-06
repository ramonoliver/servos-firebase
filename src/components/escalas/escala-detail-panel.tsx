"use client";

import { useState, useRef, useEffect } from "react";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { suggestSubstitute } from "@/lib/ai/engine";
import { formatDate, getDayOfWeek, getInitials, getIconEmoji } from "@/lib/utils/helpers";
import { Modal } from "@/components/ui";
import { MentionInput } from "@/components/ui/mention-input";
import type {
  Schedule,
  ScheduleMember,
  ScheduleSlot,
  Event,
  User,
  DepartmentMember,
  UnavailableDate,
  ScheduleAttachment,
} from "@/types";

type ScheduleChat = {
  id: string;
  schedule_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type DeliveryPanelState = {
  title: string;
  emailSentCount: number;
  emailSkippedCount: number;
  smsSentCount: number;
  smsSkippedCount: number;
  failed: Array<{ userId: string; channel: "email" | "sms" | "push"; error: string }>;
} | null;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentIcon(mimeType: string) {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("powerpoint") || mimeType.includes("presentation")) return "PPT";
  if (mimeType.includes("word")) return "DOC";
  if (mimeType.includes("image")) return "IMG";
  return "ARQ";
}

function canPreviewAttachment(mimeType: string) {
  return mimeType.includes("pdf") || mimeType.includes("image");
}

function attachmentPreviewLabel(mimeType: string) {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("image")) return "Imagem";
  return "Arquivo";
}

function isChatInfrastructureError(errorMessage?: string | null) {
  if (!errorMessage) return false;
  const normalized = errorMessage.toLowerCase();
  return normalized.includes("schedule_chats") || normalized.includes("relation");
}

function sortChatMessages(messages: ScheduleChat[]) {
  return [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

interface EscalaDetailPanelProps {
  scheduleId: string;
  onRefreshList?: () => void;
}

export function EscalaDetailPanel({ scheduleId, onRefreshList }: EscalaDetailPanelProps) {
  const { user, toast, canDo, departments } = useApp();

  const [showAddMember, setShowAddMember] = useState(false);
  const [activeTab, setActiveTab] = useState<"escalados" | "anexos" | "chat">("escalados");
  const [groupByFunction, setGroupByFunction] = useState(true);
  const [chatMsg, setChatMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [ev, setEv] = useState<Event | null>(null);
  const [sm, setSm] = useState<ScheduleMember[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [deptMembers, setDeptMembers] = useState<DepartmentMember[]>([]);
  const [allUD, setAllUD] = useState<UnavailableDate[]>([]);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [allSM, setAllSM] = useState<ScheduleMember[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [attachments, setAttachments] = useState<ScheduleAttachment[]>([]);
  const [chatMessages, setChatMessages] = useState<ScheduleChat[]>([]);
  const [chatAvailable, setChatAvailable] = useState(true);
  const [chatInfrastructureMissing, setChatInfrastructureMissing] = useState(false);
  const [chatErrorMessage, setChatErrorMessage] = useState<string | null>(null);
  const [sendingChat, setSendingChat] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  const [chatSyncMode, setChatSyncMode] = useState<"idle" | "realtime" | "polling">("idle");
  const [responding, setResponding] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [deliveryPanel, setDeliveryPanel] = useState<DeliveryPanelState>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  async function loadAttachments(sid: string) {
    try {
      const response = await fetch(`/api/schedule-attachments?scheduleId=${encodeURIComponent(sid)}`);
      const payload = (await response.json().catch(() => null)) as
        | { attachments?: ScheduleAttachment[]; error?: string }
        | null;
      if (!response.ok) {
        setAttachments([]);
        return;
      }
      setAttachments((payload?.attachments || []) as ScheduleAttachment[]);
    } catch {
      setAttachments([]);
    }
  }

  async function loadChatMessages(sid: string, silent = false) {
    try {
      const response = await fetch(`/api/schedule-chats?scheduleId=${encodeURIComponent(sid)}`);
      const payload = (await response.json().catch(() => null)) as
        | { messages?: ScheduleChat[]; error?: string }
        | null;

      if (!response.ok) {
        const errorMessage = payload?.error || null;
        const infraMissing = isChatInfrastructureError(errorMessage);
        setChatInfrastructureMissing(infraMissing);
        setChatAvailable(!infraMissing);
        setChatMessages([]);
        if (response.status === 403) {
          setChatErrorMessage("O chat desta escala está disponível apenas para participantes e líderes.");
          return false;
        }
        if (response.status === 401) {
          setChatErrorMessage("Sua sessão expirou. Entre novamente.");
          if (!silent) toast("Sua sessão expirou. Entre novamente.");
          return false;
        }
        if (infraMissing) {
          setChatErrorMessage("O chat ainda não está habilitado. Aplique o script sql/communications.sql no Supabase.");
          return false;
        }
        setChatErrorMessage("Não foi possível carregar o chat desta escala.");
        if (!silent) toast("Não foi possível carregar o chat desta escala.");
        return false;
      }

      setChatInfrastructureMissing(false);
      setChatAvailable(true);
      setChatErrorMessage(null);
      setChatMessages(sortChatMessages(payload?.messages || []));
      return true;
    } catch {
      setChatMessages([]);
      setChatErrorMessage("Não foi possível carregar o chat desta escala.");
      if (!silent) toast("Não foi possível carregar o chat desta escala.");
      return false;
    }
  }

  async function loadData() {
    setLoading(true);

    const { data: scheduleData, error: scheduleError } = await supabase
      .from("schedules")
      .select("*")
      .eq("id", scheduleId)
      .maybeSingle();

    if (scheduleError || !scheduleData) {
      setLoading(false);
      return;
    }

    const [
      { data: eventData },
      { data: smData, error: smError },
      { data: slotsData },
      { data: usersData },
      { data: deptMembersData },
      { data: unavailableData },
      { data: allSchedulesData },
      { data: allSMData },
    ] = await Promise.all([
      supabase.from("events").select("*").eq("id", scheduleData.event_id).maybeSingle(),
      supabase.from("schedule_members").select("*").eq("schedule_id", scheduleData.id),
      supabase.from("schedule_slots").select("*").eq("schedule_id", scheduleData.id),
      supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
      supabase.from("department_members").select("*").eq("department_id", scheduleData.department_id),
      supabase.from("unavailable_dates").select("*"),
      supabase.from("schedules").select("*"),
      supabase.from("schedule_members").select("*"),
    ]);

    if (smError) {
      toast("Erro ao carregar detalhes da escala.");
      setLoading(false);
      return;
    }

    setSchedule(scheduleData as Schedule);
    setEv((eventData || null) as Event | null);
    setSm((smData || []) as ScheduleMember[]);
    setSlots((slotsData || []) as ScheduleSlot[]);
    setMembers((usersData || []) as User[]);
    setDeptMembers((deptMembersData || []) as DepartmentMember[]);
    setAllUD((unavailableData || []) as UnavailableDate[]);
    setAllSchedules((allSchedulesData || []) as Schedule[]);
    setAllSM((allSMData || []) as ScheduleMember[]);
    await loadAttachments(scheduleData.id);
    await loadChatMessages(scheduleData.id);
    setLoading(false);
  }

  useEffect(() => {
    setSchedule(null);
    setActiveTab("escalados");
    setDeliveryPanel(null);
    loadData();
  }, [scheduleId, user.church_id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, activeTab]);

  useEffect(() => {
    if (!schedule?.id || !chatAvailable) {
      setChatSyncMode("idle");
      return;
    }

    let isMounted = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const channelName = `schedule-chat-${schedule.id}`;
    const channel = supabase.channel(channelName);

    const enablePollingFallback = () => {
      if (!isMounted || pollInterval) return;
      setChatSyncMode("polling");
      pollInterval = setInterval(() => {
        void loadChatMessages(schedule.id, true);
      }, 12000);
    };

    channel
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "schedule_chats",
        filter: `schedule_id=eq.${schedule.id}`,
      }, (payload) => {
        const incoming = payload.new as ScheduleChat;
        setChatAvailable(true);
        setChatMessages((current) => {
          if (current.some((item) => item.id === incoming.id)) return current;
          return sortChatMessages([...current, incoming]);
        });
      })
      .subscribe((status) => {
        if (!isMounted) return;
        if (status === "SUBSCRIBED") {
          setChatSyncMode("realtime");
          if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          enablePollingFallback();
        }
      });

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [schedule?.id, chatAvailable, user.church_id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-ink-faint">
        Carregando...
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-ink-faint">
        Escala não encontrada.
      </div>
    );
  }

  if (user.role === "leader" && !departments.some((d) => d.id === schedule.department_id)) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-ink-faint">
        Você não tem acesso a esta escala.
      </div>
    );
  }

  const dept = departments.find((d) => d.id === schedule.department_id);
  const confirmed = sm.filter((m) => m.status === "confirmed").length;
  const pending = sm.filter((m) => m.status === "pending");
  const declined = sm.filter((m) => m.status === "declined");
  const allOk = confirmed === sm.length && sm.length > 0;
  const dow = getDayOfWeek(schedule.date);
  const avgSchedules = members.length
    ? members.reduce((a, m) => a + m.total_schedules, 0) / members.length
    : 0;

  const scheduledUserIds = sm.map((s) => s.user_id);
  const isParticipant = scheduledUserIds.includes(user.id);
  const canAccessScheduleChat = user.role === "admin" || user.role === "leader" || isParticipant;
  const myScheduleMember = sm.find((item) => item.user_id === user.id) || null;
  const canManageAttachments = canDo("schedule.edit");
  const previewAttachment =
    attachments.find((a) => a.id === previewAttachmentId) || attachments[0] || null;

  if (user.role === "member" && !isParticipant) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-ink-faint">
        Você não participa desta escala.
      </div>
    );
  }

  function openDeliveryPanel(
    title: string,
    payload?: {
      email?: { sent?: number; skipped?: number };
      sms?: { sent?: number; skipped?: number };
      failed?: Array<{ userId: string; channel: "email" | "sms" | "push"; error: string }>;
    } | null
  ) {
    setDeliveryPanel({
      title,
      emailSentCount: payload?.email?.sent || 0,
      emailSkippedCount: payload?.email?.skipped || 0,
      smsSentCount: payload?.sms?.sent || 0,
      smsSkippedCount: payload?.sms?.skipped || 0,
      failed: payload?.failed || [],
    });
  }

  const availableToAdd = deptMembers
    .filter((dm) => !scheduledUserIds.includes(dm.user_id))
    .map((dm) => {
      const m = members.find((u) => u.id === dm.user_id);
      return m ? { ...m, function_name: dm.function_name } : null;
    })
    .filter(Boolean) as (User & { function_name: string })[];

  const byFunction: Record<string, ScheduleMember[]> = {};
  sm.forEach((item) => {
    const fn = item.function_name || "Sem função";
    if (!byFunction[fn]) byFunction[fn] = [];
    byFunction[fn].push(item);
  });

  const slotCoverage = slots.map((slot) => {
    const assigned = byFunction[slot.function_name]?.length || 0;
    return {
      ...slot,
      assigned,
      missing: Math.max(0, slot.quantity - assigned),
      extra: Math.max(0, assigned - slot.quantity),
    };
  });

  async function addMemberToSchedule(userId: string) {
    try {
      const response = await fetch("/api/schedule-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: schedule!.id, userId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast(data?.error || "Erro ao adicionar membro.");
        return;
      }
      const emailSentCount = data?.notifications?.email?.sent || 0;
      const smsSentCount = data?.notifications?.sms?.sent || 0;
      const smsSkippedCount = data?.notifications?.sms?.skipped || 0;
      toast(
        emailSentCount > 0 || smsSentCount > 0
          ? `Membro adicionado. ${emailSentCount} email(s) e ${smsSentCount} SMS enviados.`
          : smsSkippedCount > 0
          ? "Membro adicionado. SMS não configurado e e-mail indisponível."
          : "Membro adicionado!"
      );
      openDeliveryPanel("Entrega ao adicionar membro", data?.notifications || null);
      setShowAddMember(false);
      await loadData();
    } catch {
      toast("Erro ao adicionar membro.");
    }
  }

  async function removeMemberFromSchedule(smItem: ScheduleMember) {
    const m = members.find((u) => u.id === smItem.user_id);
    if (!confirm(`Remover ${m?.name || "este membro"} da escala?`)) return;
    try {
      const params = new URLSearchParams({ scheduleId: schedule!.id, scheduleMemberId: smItem.id });
      const response = await fetch(`/api/schedule-members?${params.toString()}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast(data?.error || "Erro ao remover membro da escala.");
        return;
      }
      toast((m?.name || "Membro") + " removido da escala.");
      await loadData();
    } catch {
      toast("Erro ao remover membro da escala.");
    }
  }

  async function acceptSubstitute(declinedSM: ScheduleMember, substituteId: string) {
    const sub = members.find((m) => m.id === substituteId);
    if (!sub) return;
    try {
      const response = await fetch("/api/schedule-members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "substitute",
          scheduleId: schedule!.id,
          declinedScheduleMemberId: declinedSM.id,
          substituteId,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast(data?.error || "Erro ao adicionar substituto.");
        return;
      }
      const emailSentCount = data?.notifications?.email?.sent || 0;
      const smsSentCount = data?.notifications?.sms?.sent || 0;
      toast(emailSentCount > 0 || smsSentCount > 0 ? `${sub.name} adicionado como substituto. Notificação enviada.` : `${sub.name} adicionado como substituto!`);
      openDeliveryPanel("Entrega ao adicionar substituto", data?.notifications || null);
      await loadData();
    } catch {
      toast("Erro ao adicionar substituto.");
    }
  }

  async function sendChat() {
    const text = chatMsg.trim();
    if (!text || !chatAvailable || sendingChat || !canAccessScheduleChat) return;
    setSendingChat(true);
    try {
      const response = await fetch("/api/schedule-chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: schedule!.id, content: text }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: ScheduleChat } | null;
      if (!response.ok) {
        if (isChatInfrastructureError(payload?.error)) {
          setChatAvailable(false);
          toast("O chat ainda não foi habilitado no banco.");
        } else {
          toast("Erro ao enviar mensagem no chat.");
        }
        setSendingChat(false);
        return;
      }
      if (payload?.message) {
        setChatMessages((current) => {
          if (current.some((item) => item.id === payload.message?.id)) return current;
          return sortChatMessages([...current, payload.message!]);
        });
      }
    } catch (error) {
      if (error instanceof Error && isChatInfrastructureError(error.message)) {
        setChatAvailable(false);
        toast("O chat ainda não foi habilitado no banco.");
      } else {
        toast("Erro ao enviar mensagem no chat.");
      }
      setSendingChat(false);
      return;
    }
    setChatMsg("");
    setSendingChat(false);
  }

  async function uploadAttachment(file: File) {
    if (!canManageAttachments || !schedule) return;
    const allowedExtensions = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".jpg", ".jpeg", ".png"];
    if (!allowedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      toast("Arquivo não permitido. Use PDF, DOC, PPT ou JPG.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast("Arquivo muito grande. Limite de 4MB.");
      return;
    }
    setUploadingAttachment(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === "string" ? reader.result : "";
          resolve(result.split(",")[1] || "");
        };
        reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/schedule-attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: schedule.id,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          contentBase64: base64,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { attachment?: ScheduleAttachment; error?: string } | null;
      if (!response.ok) {
        toast(payload?.error || "Não foi possível anexar o arquivo.");
        setUploadingAttachment(false);
        return;
      }
      if (payload?.attachment) {
        const next = payload.attachment as ScheduleAttachment;
        setAttachments((current) => [next, ...current]);
        setPreviewAttachmentId(next.id);
      } else {
        await loadAttachments(schedule.id);
      }
      toast("Arquivo anexado com sucesso!");
    } catch {
      toast("Não foi possível anexar o arquivo.");
    }
    setUploadingAttachment(false);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }

  async function removeAttachment(attachment: ScheduleAttachment) {
    if (!schedule || !canManageAttachments) return;
    if (!confirm(`Remover o anexo "${attachment.file_name}"?`)) return;
    try {
      const params = new URLSearchParams({ scheduleId: schedule.id, attachmentId: attachment.id });
      const response = await fetch(`/api/schedule-attachments?${params.toString()}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast(payload?.error || "Não foi possível remover o anexo.");
        return;
      }
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      setPreviewAttachmentId((current) => (current === attachment.id ? null : current));
      toast("Anexo removido.");
    } catch {
      toast("Não foi possível remover o anexo.");
    }
  }

  async function respondToSchedule(status: "confirmed" | "declined") {
    if (!myScheduleMember) return;
    try {
      const response = await fetch("/api/schedule-members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "respond",
          scheduleMemberId: myScheduleMember.id,
          status,
          declineReason: status === "declined" ? declineReason : "",
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast(data?.error || "Erro ao responder escala.");
        return;
      }
      toast(status === "confirmed" ? "Presença confirmada!" : "Ausência registrada.");
      setResponding(false);
      setDeclineReason("");
      await loadData();
    } catch {
      toast("Erro ao responder escala.");
    }
  }

  function MemberRow({ item, showFn = true }: { item: ScheduleMember; showFn?: boolean }) {
    const m = members.find((u) => u.id === item.user_id);
    if (!m) return null;
    const spouse = m.spouse_id ? members.find((u) => u.id === m.spouse_id) : null;
    const isDeclined = item.status === "declined";
    let substitute = null;
    if (isDeclined && !item.substitute_id && canDo("schedule.edit")) {
      substitute = suggestSubstitute(
        members,
        deptMembers,
        item.user_id,
        item.function_name,
        {
          date: schedule!.date,
          dayOfWeek: dow,
          deptMemberIds: deptMembers.map((dm) => dm.user_id),
          unavailableDates: allUD,
          existingSchedules: allSchedules,
          existingScheduleMembers: allSM,
          avgSchedules,
        },
        scheduledUserIds
      );
    }

    return (
      <div>
        <div className="flex items-center gap-3.5 px-5 py-3 border-t border-border-soft group">
          {m.photo_url ? (
            <img src={m.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: m.avatar_color }}
            >
              {getInitials(m.name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{m.name}</div>
            {showFn && !groupByFunction && (
              <div className="text-[11px] text-ink-faint">{item.function_name}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {spouse && (
              <span className="text-[9px] font-semibold text-brand bg-brand-light px-1.5 py-0.5 rounded-full hidden sm:inline">
                &#128145; {spouse.name.split(" ")[0]}
              </span>
            )}
            <span className={`badge ${item.status === "confirmed" ? "badge-green" : item.status === "pending" ? "badge-amber" : "badge-red"}`}>
              {item.status === "confirmed" ? "✓ Confirmou" : item.status === "pending" ? "⏳ Pendente" : "✕ Recusou"}
            </span>
            {canDo("schedule.edit") && (
              <button
                onClick={() => removeMemberFromSchedule(item)}
                className="btn btn-ghost btn-sm text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remover"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
        </div>

        {isDeclined && item.decline_reason && (
          <div className="px-5 pb-2">
            <div className="text-xs text-ink-faint italic ml-[52px]">
              Motivo: &quot;{item.decline_reason}&quot;
            </div>
          </div>
        )}

        {substitute && (
          <div className="mx-5 mb-3 flex items-center gap-3 p-3 bg-brand-glow border border-brand-light rounded-[10px]">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
              style={{ background: substitute.user.avatar_color }}
            >
              {getInitials(substitute.user.name)}
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-bold text-brand uppercase tracking-wider">🤖 Substituto sugerido</div>
              <div className="text-[13px] font-semibold">{substitute.user.name}</div>
              <div className="text-[10px] text-ink-muted">
                {substitute.user.total_schedules} escalas · {substitute.user.confirm_rate}% confirmação
              </div>
            </div>
            <button onClick={() => acceptSubstitute(item, substitute.user.id)} className="btn btn-brand btn-sm">
              Aceitar
            </button>
          </div>
        )}

        {isDeclined && item.substitute_id && (() => {
          const sub = members.find((u) => u.id === item.substitute_id);
          return sub ? (
            <div className="mx-5 mb-3 text-xs text-success font-medium ml-[52px]">
              Substituído por {sub.name}
            </div>
          ) : null;
        })()}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-ink flex flex-wrap items-center gap-2">
            {ev && getIconEmoji(ev.icon)} {ev?.name || "Escala"}
          </h2>
          <p className="text-sm text-ink-muted mt-0.5">
            {formatDate(schedule.date)} · {schedule.time} · {dept?.name}
          </p>
          {schedule.arrival_time && (
            <p className="text-xs text-ink-faint mt-0.5">Chegada: {schedule.arrival_time}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="badge badge-green">{confirmed} confirmados</span>
            {pending.length > 0 && <span className="badge badge-amber">{pending.length} pendentes</span>}
            {declined.length > 0 && <span className="badge badge-red">{declined.length} recusaram</span>}
            {!schedule.published && <span className="badge badge-info">Rascunho</span>}
          </div>
        </div>
        {canDo("schedule.edit") && (
          <button onClick={() => setShowAddMember(true)} className="btn btn-primary btn-sm self-start">
            + Adicionar membro
          </button>
        )}
      </div>

      {/* My response card */}
      {myScheduleMember && (
        <div className="rounded-2xl border border-white/60 bg-white/40 backdrop-blur-md shadow-sm">
          <div className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand mb-1">Minha resposta</div>
                <div className="font-display text-lg leading-tight">
                  {myScheduleMember.status === "pending"
                    ? "Confirme sua participação nesta escala"
                    : myScheduleMember.status === "confirmed"
                    ? "Você já confirmou presença"
                    : "Você informou indisponibilidade"}
                </div>
                <div className="text-sm text-ink-muted mt-1">Função: {myScheduleMember.function_name || "Não informada"}</div>
              </div>
              <span className={`badge self-start ${myScheduleMember.status === "confirmed" ? "badge-green" : myScheduleMember.status === "pending" ? "badge-amber" : "badge-red"}`}>
                {myScheduleMember.status === "confirmed" ? "Confirmado" : myScheduleMember.status === "pending" ? "Pendente" : "Recusado"}
              </span>
            </div>
            {myScheduleMember.status === "pending" && !responding && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button onClick={() => respondToSchedule("confirmed")} className="btn btn-green sm:flex-1">Confirmar presença</button>
                <button onClick={() => setResponding(true)} className="btn btn-danger sm:flex-1">Não poderei servir</button>
              </div>
            )}
            {responding && myScheduleMember.status === "pending" && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="input-label">Motivo da ausência (opcional)</label>
                  <textarea
                    className="input-field min-h-[72px]"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Conte o motivo para ajudar a equipe..."
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button onClick={() => { setResponding(false); setDeclineReason(""); }} className="btn btn-secondary sm:flex-1">Cancelar</button>
                  <button onClick={() => respondToSchedule("declined")} className="btn btn-danger sm:flex-1">Confirmar ausência</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alerts */}
      {allOk && (
        <div className="flex items-center gap-3 px-5 py-3.5 bg-success-light rounded-[14px] border border-success/10">
          <span className="text-lg">🎉</span>
          <span className="text-[13px] text-success font-medium">Todos confirmados!</span>
        </div>
      )}

      {pending.length > 0 && canDo("schedule.edit") && (
        <div className="flex items-center gap-3 px-5 py-3.5 bg-amber-light rounded-[14px] border border-amber/10">
          <span className="text-lg">🔔</span>
          <span className="text-[13px] text-ink-soft flex-1"><strong>{pending.length}</strong> pendentes.</span>
          <button
            onClick={async () => {
              try {
                const response = await fetch("/api/send-schedule-reminders", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ scheduleId: schedule.id }),
                });
                const data = await response.json().catch(() => null);
                if (!response.ok) { toast("Erro ao enviar lembrete."); return; }
                const sentCount = data?.sentCount || 0;
                openDeliveryPanel("Resultado do envio de lembretes", {
                  email: { sent: data?.emailSentCount || 0, skipped: data?.emailSkippedCount || 0 },
                  sms: { sent: data?.smsSentCount || 0, skipped: data?.smsSkippedCount || 0 },
                  failed: data?.failed || [],
                });
                toast(sentCount > 0 ? `Lembretes enviados: ${data?.emailSentCount || 0} email(s) e ${data?.smsSentCount || 0} SMS(s).` : "Nenhum lembrete enviado.");
              } catch { toast("Erro ao enviar lembrete."); }
            }}
            className="text-xs font-semibold text-brand hover:underline"
          >
            Lembrar &rarr;
          </button>
        </div>
      )}

      {/* Delivery panel */}
      {deliveryPanel && (
        <div className="card p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
            <div>
              <div className="font-display text-lg">{deliveryPanel.title}</div>
              <p className="text-sm text-ink-muted">Resumo do último disparo por canal.</p>
            </div>
            <button onClick={() => setDeliveryPanel(null)} className="btn btn-ghost btn-sm self-start">Fechar</button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-surface-alt px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Email</div>
              <div className="text-sm font-medium mt-1">{deliveryPanel.emailSentCount} enviado(s)</div>
              {deliveryPanel.emailSkippedCount > 0 && <div className="text-xs text-ink-faint mt-1">{deliveryPanel.emailSkippedCount} pulado(s)</div>}
            </div>
            <div className="rounded-xl bg-surface-alt px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">SMS</div>
              <div className="text-sm font-medium mt-1">{deliveryPanel.smsSentCount} enviado(s)</div>
              {deliveryPanel.smsSkippedCount > 0 && <div className="text-xs text-ink-faint mt-1">{deliveryPanel.smsSkippedCount} pulado(s)</div>}
            </div>
          </div>
          {deliveryPanel.failed.length > 0 ? (
            <div className="rounded-xl border border-amber/20 bg-amber-light px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber mb-2">Falhas</div>
              <div className="space-y-2">
                {deliveryPanel.failed.map((item, index) => {
                  const memberName = members.find((m) => m.id === item.userId)?.name || "Membro";
                  return (
                    <div key={`${item.userId}-${item.channel}-${index}`} className="text-xs text-amber break-words">
                      <strong>{memberName}</strong> · {item.channel.toUpperCase()} · {item.error}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-sm text-ink-faint">Nenhuma falha registrada neste disparo.</div>
          )}
        </div>
      )}

      {/* Instructions */}
      {schedule.instructions && (
        <div className="bg-surface-alt rounded-[14px] px-5 py-4">
          <div className="text-xs font-bold text-ink-faint uppercase tracking-wider mb-1">Instruções</div>
          <div className="text-sm text-ink-soft">{schedule.instructions}</div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-alt rounded-[10px] p-0.5 w-fit max-w-full flex-wrap">
        {(["escalados", "anexos", "chat"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all capitalize ${
              activeTab === tab ? "bg-surface text-ink font-semibold shadow-sm" : "text-ink-muted"
            }`}
          >
            {tab === "escalados"
              ? `Escalados (${sm.length})`
              : tab === "anexos"
              ? `📎 Anexos ${attachments.length > 0 ? `(${attachments.length})` : ""}`
              : `💬 Chat ${chatMessages.length > 0 ? `(${chatMessages.length})` : ""}`}
          </button>
        ))}
        {activeTab === "escalados" && (
          <button
            onClick={() => setGroupByFunction((g) => !g)}
            className="ml-2 px-3 py-1.5 rounded-lg text-[12px] font-medium text-ink-muted hover:text-ink transition-colors"
          >
            {groupByFunction ? "🔀 Lista" : "📋 Funções"}
          </button>
        )}
      </div>

      {/* Tab: Escalados */}
      {activeTab === "escalados" && (
        <div className="card mb-5">
          {slotCoverage.length > 0 && (
            <div className="px-5 pt-4 pb-3 border-b border-border-soft">
              <div className="flex flex-col gap-1 mb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-display text-[15px]">Cobertura por função</div>
                <div className="text-[11px] text-ink-faint">
                  {slotCoverage.reduce((sum, slot) => sum + slot.assigned, 0)} para{" "}
                  {slotCoverage.reduce((sum, slot) => sum + slot.quantity, 0)} vagas
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {slotCoverage.map((slot) => (
                  <div key={slot.id} className={`rounded-[14px] border px-3.5 py-3 ${slot.missing > 0 ? "border-amber/35 bg-amber-light" : "border-success/25 bg-success-light"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{slot.function_name}</div>
                        <div className="text-[11px] text-ink-faint mt-1">{slot.assigned} escalado(s) para {slot.quantity} vaga(s)</div>
                      </div>
                      <div className={`text-[11px] font-semibold ${slot.missing > 0 ? "text-amber" : "text-success"}`}>
                        {slot.missing > 0 ? `Faltam ${slot.missing}` : slot.extra > 0 ? `+${slot.extra} extra` : "Coberto"}
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${slot.missing > 0 ? "bg-amber" : "bg-success"}`}
                        style={{ width: `${Math.min(100, slot.quantity > 0 ? Math.round((slot.assigned / slot.quantity) * 100) : slot.assigned > 0 ? 100 : 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sm.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-ink-faint">Nenhum membro escalado.</div>
          ) : groupByFunction ? (
            Object.entries(byFunction).map(([fn, items]) => (
              <div key={fn}>
                <div className="px-5 py-2 bg-surface-alt border-t border-border-soft first:border-t-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-ink-faint">{fn}</span>
                  <span className="text-[10px] text-ink-ghost ml-2">({items.length})</span>
                </div>
                {items.map((item) => <MemberRow key={item.id} item={item} showFn={false} />)}
              </div>
            ))
          ) : (
            sm.map((item) => <MemberRow key={item.id} item={item} showFn={true} />)
          )}
        </div>
      )}

      {/* Tab: Anexos */}
      {activeTab === "anexos" && (
        <div className="card mb-5">
          <div className="px-5 pt-4 pb-3 border-b border-border-soft flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-display text-[15px]">Anexos da escala</div>
              <p className="text-[11px] text-ink-faint mt-0.5">Documentos, apresentações e imagens.</p>
            </div>
            {canManageAttachments && (
              <div className="flex items-center gap-2">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadAttachment(file);
                  }}
                />
                <button onClick={() => attachmentInputRef.current?.click()} disabled={uploadingAttachment} className="btn btn-primary btn-sm">
                  {uploadingAttachment ? "Enviando..." : "+ Anexar arquivo"}
                </button>
              </div>
            )}
          </div>
          <div className="px-5 py-4">
            <div className="text-[11px] text-ink-faint mb-4">PDF, DOC, DOCX, PPT, PPTX, JPG e PNG. Limite 4MB.</div>
            {attachments.length === 0 ? (
              <div className="py-12 text-center text-sm text-ink-faint">Nenhum anexo enviado.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[18px] border border-border-soft bg-white overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-soft bg-surface-alt/40">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint mb-1">Visualização</div>
                      <div className="text-sm font-semibold text-ink-soft">{previewAttachment ? previewAttachment.file_name : "Selecione um anexo"}</div>
                    </div>
                  </div>
                  <div className="p-4">
                    {!previewAttachment ? (
                      <div className="min-h-[280px] rounded-[16px] border border-dashed border-border-soft bg-surface-alt/40 flex items-center justify-center text-sm text-ink-faint text-center px-6">
                        Escolha um anexo para visualizar.
                      </div>
                    ) : canPreviewAttachment(previewAttachment.mime_type) ? (
                      previewAttachment.mime_type.includes("image") ? (
                        <div className="rounded-[16px] border border-border-soft bg-surface-alt/30 p-3">
                          <img src={`data:${previewAttachment.mime_type};base64,${previewAttachment.content_base64}`} alt={previewAttachment.file_name} className="w-full max-h-[420px] object-contain rounded-[12px] bg-white" />
                        </div>
                      ) : (
                        <div className="rounded-[16px] border border-border-soft overflow-hidden bg-white">
                          <iframe title={previewAttachment.file_name} src={`data:${previewAttachment.mime_type};base64,${previewAttachment.content_base64}`} className="w-full h-[420px]" />
                        </div>
                      )
                    ) : (
                      <div className="min-h-[280px] rounded-[16px] border border-dashed border-border-soft bg-surface-alt/40 flex flex-col items-center justify-center text-center px-6">
                        <div className="w-14 h-14 rounded-[16px] border border-border-soft bg-white flex items-center justify-center text-sm font-bold tracking-[0.14em] text-brand mb-4">{attachmentIcon(previewAttachment.mime_type)}</div>
                        <div className="font-display text-lg leading-tight mb-2">Visualização externa necessária</div>
                        <p className="text-sm text-ink-muted leading-relaxed max-w-[340px]">{attachmentPreviewLabel(previewAttachment.mime_type)} disponível para download.</p>
                      </div>
                    )}
                    {previewAttachment && (
                      <div className="mt-4 rounded-[16px] border border-border-soft bg-surface-alt/50 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint mb-2">Detalhes</div>
                        <div className="grid grid-cols-3 gap-3">
                          <div><div className="text-[10px] font-semibold uppercase text-ink-faint">Tipo</div><div className="text-sm font-medium text-ink-soft mt-1">{attachmentPreviewLabel(previewAttachment.mime_type)}</div></div>
                          <div><div className="text-[10px] font-semibold uppercase text-ink-faint">Tamanho</div><div className="text-sm font-medium text-ink-soft mt-1">{formatFileSize(previewAttachment.size_bytes)}</div></div>
                          <div><div className="text-[10px] font-semibold uppercase text-ink-faint">Enviado em</div><div className="text-sm font-medium text-ink-soft mt-1">{new Date(previewAttachment.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}</div></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {attachments.map((attachment) => {
                    const uploader = members.find((m) => m.id === attachment.uploaded_by_user_id);
                    const href = `data:${attachment.mime_type};base64,${attachment.content_base64}`;
                    const isSelected = previewAttachment?.id === attachment.id;
                    return (
                      <div key={attachment.id} className={`rounded-[16px] border px-4 py-3 transition-colors ${isSelected ? "border-brand/30 bg-brand-glow" : "border-border-soft bg-surface-alt/50"}`}>
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start gap-3">
                            <button onClick={() => setPreviewAttachmentId(attachment.id)} className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-border-soft bg-white text-[11px] font-bold tracking-[0.12em] text-brand shrink-0">
                              {attachmentIcon(attachment.mime_type)}
                            </button>
                            <div className="min-w-0 flex-1">
                              <button onClick={() => setPreviewAttachmentId(attachment.id)} className="text-left w-full">
                                <div className="text-sm font-semibold break-words">{attachment.file_name}</div>
                              </button>
                              <div className="text-[11px] text-ink-faint leading-relaxed break-words mt-1">
                                {formatFileSize(attachment.size_bytes)}{uploader ? ` • Enviado por ${uploader.name}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <a href={href} download={attachment.file_name} className="btn btn-secondary btn-sm">Baixar</a>
                            {canPreviewAttachment(attachment.mime_type) && (
                              <button onClick={() => setPreviewAttachmentId(attachment.id)} className="btn btn-primary btn-sm">Abrir visualização</button>
                            )}
                            {canManageAttachments && (
                              <button onClick={() => removeAttachment(attachment)} className="btn btn-danger btn-sm">Remover</button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Chat */}
      {activeTab === "chat" && (
        <div className="card mb-5 flex flex-col" style={{ minHeight: 320 }}>
          <div className="px-5 pt-4 pb-3 border-b border-border-soft">
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-[15px]">Chat da escala</span>
              {chatAvailable && (
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${chatSyncMode === "realtime" ? "bg-success-light text-success" : chatSyncMode === "polling" ? "bg-amber-light text-amber" : "bg-surface-alt text-ink-faint"}`}>
                  {chatSyncMode === "realtime" ? "Ao vivo" : chatSyncMode === "polling" ? "Atualização automática" : "Sincronizando"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-ink-faint mt-0.5">Visível apenas para escalados e líderes</p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ maxHeight: 360 }}>
            {chatInfrastructureMissing ? (
              <div className="text-center text-sm text-ink-faint py-8">
                Chat não habilitado. Aplique <code>sql/communications.sql</code> no Supabase.
              </div>
            ) : chatErrorMessage ? (
              <div className="text-center text-sm text-ink-faint py-8">{chatErrorMessage}</div>
            ) : !canAccessScheduleChat ? (
              <div className="text-center text-sm text-ink-faint py-8">Chat disponível apenas para participantes e líderes.</div>
            ) : chatMessages.length === 0 ? (
              <div className="text-center text-sm text-ink-faint py-8">Nenhuma mensagem. Seja o primeiro!</div>
            ) : (
              chatMessages.map((msg) => {
                const sender = members.find((u) => u.id === msg.sender_id);
                const isMe = msg.sender_id === user.id;
                return (
                  <div key={msg.id} className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ background: sender?.avatar_color || "#999" }}>
                      {getInitials(sender?.name || "?")}
                    </div>
                    <div className={`max-w-[72%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {!isMe && <span className="text-[10px] text-ink-faint font-medium">{sender?.name?.split(" ")[0]}</span>}
                      <div className={`text-[13px] px-3.5 py-2 rounded-[12px] leading-snug ${isMe ? "bg-brand text-white rounded-tr-[4px]" : "bg-surface-alt text-ink rounded-tl-[4px]"}`}>
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-ink-ghost">{new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="px-4 py-3 border-t border-border-soft flex gap-2">
            <MentionInput
              value={chatMsg}
              onChange={setChatMsg}
              onSend={sendChat}
              placeholder="Digite @ para mencionar alguém..."
              disabled={!chatAvailable || sendingChat || !canAccessScheduleChat}
              scheduleId={schedule.id}
              churchId={user.church_id}
            />
            <button
              onClick={sendChat}
              disabled={!chatMsg.trim() || !chatAvailable || sendingChat || !canAccessScheduleChat}
              className="btn btn-primary px-4 py-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Add member modal */}
      {showAddMember && (
        <Modal title="Adicionar Membro a Escala" close={() => setShowAddMember(false)} width={460}>
          {availableToAdd.length === 0 ? (
            <div className="text-sm text-ink-faint text-center py-8">Todos os membros do ministério já estão escalados.</div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm text-ink-muted mb-3">Selecione um membro do ministério {dept?.name}:</p>
              {availableToAdd.map((m) => (
                <button
                  key={m.id}
                  onClick={() => addMemberToSchedule(m.id)}
                  className="flex items-center gap-3 w-full px-3.5 py-2.5 rounded-[10px] border-[1.5px] border-border-soft hover:border-brand hover:bg-brand-glow transition-all text-left"
                >
                  {m.photo_url ? (
                    <img src={m.photo_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: m.avatar_color }}>
                      {getInitials(m.name)}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-[11px] text-ink-faint">{m.function_name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
