"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell, PageHeader } from "@/components/ui";
import { useApp } from "@/hooks/use-app";
import { enablePushNotifications, isPushSupported } from "@/lib/notifications/fcm-client";

type Prefs = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  scheduleNotifications: boolean;
  eventNotifications: boolean;
  messageNotifications: boolean;
  prayerNotifications: boolean;
  birthdayNotifications: boolean;
};

const DEFAULT_PREFS: Prefs = {
  pushEnabled: true,
  emailEnabled: true,
  whatsappEnabled: true,
  scheduleNotifications: true,
  eventNotifications: true,
  messageNotifications: true,
  prayerNotifications: true,
  birthdayNotifications: true,
};

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-brand" : "bg-border"
      }`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function Row({ title, description, checked, onChange }: { title: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-ink">{title}</div>
        {description && <div className="text-[12px] text-ink-muted">{description}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function NotificacoesPage() {
  const { user, toast } = useApp();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [enablingPush, setEnablingPush] = useState(false);

  useEffect(() => {
    void isPushSupported().then(setPushSupported);
    fetch("/api/notifications/preferences", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (d?.preferences) setPrefs((p) => ({ ...p, ...d.preferences })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user.id]);

  function set<K extends keyof Prefs>(key: K, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        toast(d?.error || "Não foi possível salvar.");
      } else {
        toast("Preferências salvas!");
      }
    } catch {
      toast("Erro ao salvar preferências.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEnablePush() {
    setEnablingPush(true);
    try {
      const result = await enablePushNotifications();
      if (result.ok) {
        toast("Notificações push ativadas neste dispositivo!");
        set("pushEnabled", true);
        return;
      }
      if (result.reason === "denied") {
        toast("Permissão negada. Ative as notificações no navegador.");
      } else if (result.reason === "no-vapid") {
        toast("Push ainda não configurado (chave VAPID ausente). Peça ao administrador.");
      } else if (result.reason === "unsupported") {
        toast("Este navegador não suporta notificações push.");
      } else {
        toast(result.message || "Não foi possível ativar o push.");
      }
    } finally {
      setEnablingPush(false);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="py-20 text-center text-ink-faint">Carregando preferências...</div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader title="Notificações" subtitle="Escolha como e quando você quer ser avisado" />

      <div className="mx-auto w-full max-w-[640px] space-y-5">
        <Link href="/configuracoes" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-brand">
          ← Configurações
        </Link>

        {/* Canais */}
        <div className="rounded-2xl border border-border-soft bg-white p-5">
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Canais</h3>
          <div className="divide-y divide-border-soft">
            <Row title="Push" description="Notificações no navegador/dispositivo" checked={prefs.pushEnabled} onChange={(v) => set("pushEnabled", v)} />
            <Row title="E-mail" description="Avisos por e-mail" checked={prefs.emailEnabled} onChange={(v) => set("emailEnabled", v)} />
            <Row title="WhatsApp" description="Mensagens no WhatsApp" checked={prefs.whatsappEnabled} onChange={(v) => set("whatsappEnabled", v)} />
          </div>
          {pushSupported && (
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={enablingPush}
              className="btn btn-secondary btn-sm mt-3"
            >
              {enablingPush ? "Ativando..." : "Ativar push neste dispositivo"}
            </button>
          )}
        </div>

        {/* Categorias */}
        <div className="rounded-2xl border border-border-soft bg-white p-5">
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Categorias</h3>
          <div className="divide-y divide-border-soft">
            <Row title="Escalas" description="Quando você é escalado, alterações e lembretes" checked={prefs.scheduleNotifications} onChange={(v) => set("scheduleNotifications", v)} />
            <Row title="Eventos" description="Novos eventos e lembretes" checked={prefs.eventNotifications} onChange={(v) => set("eventNotifications", v)} />
            <Row title="Mensagens" description="Novas mensagens na comunicação" checked={prefs.messageNotifications} onChange={(v) => set("messageNotifications", v)} />
            <Row title="Aniversários" description="Aniversários de membros" checked={prefs.birthdayNotifications} onChange={(v) => set("birthdayNotifications", v)} />
            <Row title="Pedidos de oração" description="Novos acompanhamentos e pedidos" checked={prefs.prayerNotifications} onChange={(v) => set("prayerNotifications", v)} />
          </div>
        </div>

        <button onClick={save} disabled={saving} className="btn btn-primary w-full py-3">
          {saving ? "Salvando..." : "Salvar preferências"}
        </button>
      </div>
    </PageShell>
  );
}
