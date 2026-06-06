"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSession } from "@/lib/auth/session";
import { auth } from "@/lib/firebase";
import { signInWithCustomToken } from "firebase/auth";

// ── Helpers de formatação ────────────────────────────────────────────────────

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatCep(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatDateMask(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function parseDateMask(masked: string): string {
  const parts = masked.split("/");
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return "";
  return `${yyyy}-${mm}-${dd}`;
}

function toDateMask(iso: string): string {
  if (!iso || iso.length !== 10) return "";
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

/** Redimensiona a imagem no cliente para um data URL leve (cabe no Firestore). */
function resizeImageToDataUrl(file: File, max = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(reader.result as string);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch {
          resolve(reader.result as string);
        }
      };
      img.onerror = () => resolve(reader.result as string);
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(file);
  });
}

const ServosMark = () => (
  <svg viewBox="0 0 180 201" fill="none" width="26" height="29" xmlns="http://www.w3.org/2000/svg">
    <path d="M74.97 48.53c9.53.03 32.73 17.37 41.45 23.66 26.31 18.98 55.86 31.69 59.08 67.85 1.16 14.63-3.07 27.67-11.64 37.82-13.36 17.09-37.81 24.46-57.27 16.06-18.41-8.6-14.96-12.85-33.77-2.56C57.86 200.4 36.23 197.68 22.15 185.8c-5.7-5.86-9.68-10.73-11.54-19.78a38.26 38.26 0 014.23-30.06c2.34-3.74 6.94-6.88 11.24-7.8 10.76-2.07 20.59 8.98 28.06 14.38 7.74 5.69 15.62 10.67 22.83 15.45 9.06 5.87 20.07 10.68 31.87 8.05 12.34-3.03 23.13-13.74 25.18-27.28 4.01-25.93-21.95-35.26-38.77-47.17-10.62-7.58-39.16-21.78-27.39-37.97 3.2-3.97 5.9-5.24 10.65-6.09z" fill="rgba(255,255,255,.9)" />
    <path d="M49.85.99c7.01-1.42 16.82.42 23.6 2.83 7.04 2.51 16.36 9.86 23.94 8.67 7.83-1.17 14.56-8.2 22.63-9.87 12.3-3.2 25.7-2.72 36.94 3.52 9.52 5.29 16.59 14.09 19.69 23.53 4.97 17.27-2.97 47.83-27.4 40.58-3.61-1.07-8.72-5.67-12.07-7.84-13.39-8.72-26.22-18.36-39.88-26.65-9.6-5.83-22.83-8.68-33.79-5.86-8.82 2.43-15.46 8.38-19.78 15.64-4.73 8.67-4.78 16.61-2.16 24.83 5.67 15.16 24.97 23.2 37.52 31.06 10.28 7.14 40.88 21.48 28.6 37.38-2.57 3.29-6.34 5.42-10.49 5.94-9.79 1.19-24.89-12.07-32.24-17.01-13.06-8.86-25.9-18.72-38.67-28.05C-17.03 75.29-2.73 7.24 49.85.99z" fill="rgba(255,255,255,.9)" />
  </svg>
);

type InvitePerson = {
  name: string;
  email: string;
  phone: string;
  birthDate: string;
  instagram: string;
  address: string;
  addressCep: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  photoUrl: string;
  avatarColor: string;
  churchName: string;
};

export default function CompleteRegistrationClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<InvitePerson | null>(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<"welcome" | "form">("welcome");

  const [form, setForm] = useState({
    password: "",
    confirmPassword: "",
    name: "",
    phone: "",
    birthDate: "",
    instagram: "",
    photoUrl: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
  });
  const [birthMask, setBirthMask] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const firstName = (info?.name || "").trim().split(/\s+/)[0] || "";

  useEffect(() => {
    async function load() {
      if (!token) {
        setLoadError("Link inválido. Peça um novo convite à liderança.");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/auth/invite-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.person) {
          setLoadError(data?.error || "Convite inválido ou expirado.");
          setLoading(false);
          return;
        }
        const p = data.person as InvitePerson;
        setInfo(p);
        setForm((f) => ({
          ...f,
          name: p.name || "",
          phone: p.phone || "",
          birthDate: p.birthDate || "",
          instagram: p.instagram || "",
          photoUrl: p.photoUrl || "",
          cep: formatCep(p.addressCep || ""),
          street: p.addressStreet || "",
          number: p.addressNumber || "",
          complement: p.addressComplement || "",
          neighborhood: p.addressNeighborhood || "",
          city: p.addressCity || "",
          state: p.addressState || "",
        }));
        setBirthMask(toDateMask(p.birthDate || ""));
      } catch {
        setLoadError("Não foi possível validar o convite. Tente novamente.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [token]);

  async function handleCepBlur() {
    const digits = form.cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) return;
      const data = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) return;
      setForm((f) => ({
        ...f,
        street: data.logradouro || f.street,
        neighborhood: data.bairro || f.neighborhood,
        city: data.localidade || f.city,
        state: data.uf || f.state,
      }));
    } catch {
      /* silencioso */
    } finally {
      setCepLoading(false);
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Imagem muito grande (máx. 5MB).");
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      set("photoUrl", dataUrl);
      setError("");
    } catch {
      setError("Não foi possível carregar a imagem.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    const profile: Record<string, string> = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      birthDate: form.birthDate,
      instagram: form.instagram.trim(),
    };
    if (form.photoUrl) profile.photoUrl = form.photoUrl;
    const addr = [form.street, form.number, form.complement, form.neighborhood, form.city, form.state, form.cep]
      .filter((part) => part && part.trim())
      .join(", ");
    if (addr) profile.address = addr;
    profile.addressCep = form.cep.trim();
    profile.addressStreet = form.street.trim();
    profile.addressNumber = form.number.trim();
    profile.addressComplement = form.complement.trim();
    profile.addressNeighborhood = form.neighborhood.trim();
    profile.addressCity = form.city.trim();
    profile.addressState = form.state.trim().toUpperCase();

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/complete-registration", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword: form.password,
          confirmPassword: form.confirmPassword,
          profile,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.user) {
        setError(data?.error || "Não foi possível concluir o cadastro.");
        setSubmitting(false);
        return;
      }

      createSession(data.user, data.token);
      if (data.firebaseToken) {
        await signInWithCustomToken(auth, data.firebaseToken);
      }
      router.push("/onboarding");
    } catch {
      setError("Não foi possível concluir o cadastro. Tente novamente.");
      setSubmitting(false);
    }
  }

  // ── Estados de carregamento / erro ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4 text-sm text-ink-muted">
        Validando seu convite...
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="w-full max-w-[440px] bg-white rounded-2xl border border-border-soft shadow-lg p-8 text-center">
          <h1 className="font-display text-2xl mb-2">Convite indisponível</h1>
          <p className="text-sm text-ink-muted mb-6">{loadError || "Convite inválido ou expirado."}</p>
          <Link href="/login" className="btn btn-secondary">Ir para o login</Link>
        </div>
      </div>
    );
  }

  const avatar = (size: number) =>
    form.photoUrl ? (
      <img src={form.photoUrl} alt="Foto" className="rounded-full object-cover" style={{ width: size, height: size }} />
    ) : (
      <div
        className="rounded-full flex items-center justify-center font-display font-bold text-white"
        style={{ width: size, height: size, background: info.avatarColor, fontSize: size * 0.4 }}
      >
        {firstName.charAt(0).toUpperCase() || "S"}
      </div>
    );

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[520px]">
        {/* Cabeçalho com a marca */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-deep flex items-center justify-center shadow-lg shadow-brand/30 mb-4">
            <ServosMark />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[.28em] text-brand">Servos</div>
        </div>

        {step === "welcome" ? (
          <div className="bg-white rounded-2xl border border-border-soft shadow-lg p-8 text-center">
            <div className="flex justify-center mb-5">{avatar(84)}</div>
            <h1 className="font-display text-[26px] leading-tight mb-2">
              Bem-vindo(a){firstName ? `, ${firstName}` : ""}!
            </h1>
            <p className="text-sm text-ink-muted leading-relaxed mb-6">
              Você foi convidado(a) para servir com <strong className="text-ink">{info.churchName}</strong> no Servos.
              Vamos concluir seu acesso em dois passos rápidos: criar sua senha e confirmar seus dados.
            </p>
            <button onClick={() => setStep("form")} className="btn btn-primary w-full py-3 text-base">
              Concluir meu cadastro
            </button>
            <p className="text-xs text-ink-faint mt-4">Acesso para <strong>{info.email}</strong></p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-border-soft shadow-lg p-8 space-y-7">
            {error && (
              <div className="bg-danger-light text-danger text-sm px-4 py-3 rounded-[10px] border border-danger/10">
                {error}
              </div>
            )}

            {/* Foto */}
            <div className="flex items-center gap-4">
              {avatar(64)}
              <div>
                <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
                <button type="button" onClick={() => photoInputRef.current?.click()} className="btn btn-secondary btn-sm">
                  {form.photoUrl ? "Trocar foto" : "Adicionar foto"}
                </button>
                {form.photoUrl && (
                  <button type="button" onClick={() => set("photoUrl", "")} className="ml-2 text-sm text-danger font-semibold hover:underline">
                    Remover
                  </button>
                )}
              </div>
            </div>

            {/* Senha */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">Crie sua senha</p>
              <div className="space-y-3">
                <div>
                  <label className="input-label">Senha de acesso</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input-field"
                    placeholder="Mínimo de 6 caracteres"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <div>
                  <label className="input-label">Confirmar senha</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input-field"
                    placeholder="Repita a senha"
                    value={form.confirmPassword}
                    onChange={(e) => set("confirmPassword", e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <button type="button" onClick={() => setShowPassword((s) => !s)} className="text-sm font-semibold text-brand hover:underline">
                  {showPassword ? "Ocultar senha" : "Ver senha"}
                </button>
              </div>
            </div>

            {/* Dados */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">Confirme seus dados</p>
              <div className="space-y-3">
                <div>
                  <label className="input-label">Nome completo</label>
                  <input className="input-field" value={form.name} onChange={(e) => set("name", e.target.value)} required />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="input-label">Telefone</label>
                    <input
                      className="input-field"
                      placeholder="(00) 00000-0000"
                      value={form.phone}
                      onChange={(e) => set("phone", formatPhone(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="input-label">Data de nascimento</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="input-field"
                      placeholder="dd/mm/aaaa"
                      maxLength={10}
                      value={birthMask}
                      onChange={(e) => {
                        const masked = formatDateMask(e.target.value);
                        setBirthMask(masked);
                        set("birthDate", parseDateMask(masked));
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="input-label">Instagram</label>
                  <input className="input-field" placeholder="@seuusuario" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Endereço */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">Endereço (opcional)</p>
              {info.address && (
                <p className="text-xs text-ink-faint mb-3">Atual: {info.address}</p>
              )}
              <div className="space-y-3">
                <div className="relative">
                  <label className="input-label">CEP</label>
                  <input
                    className="input-field"
                    placeholder="00000-000"
                    value={form.cep}
                    onChange={(e) => set("cep", formatCep(e.target.value))}
                    onBlur={handleCepBlur}
                  />
                  {cepLoading && (
                    <span className="absolute right-3 top-9">
                      <svg className="animate-spin w-4 h-4 text-brand" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    </span>
                  )}
                </div>
                <div>
                  <label className="input-label">Rua</label>
                  <input className="input-field" value={form.street} onChange={(e) => set("street", e.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="input-label">Número</label>
                    <input className="input-field" value={form.number} onChange={(e) => set("number", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">Complemento</label>
                    <input className="input-field" value={form.complement} onChange={(e) => set("complement", e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="input-label">Bairro</label>
                  <input className="input-field" value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
                  <div>
                    <label className="input-label">Cidade</label>
                    <input className="input-field" value={form.city} onChange={(e) => set("city", e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label">UF</label>
                    <input className="input-field" maxLength={2} value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase())} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setStep("welcome")} className="btn btn-secondary" disabled={submitting}>
                Voltar
              </button>
              <button type="submit" className="btn btn-primary flex-1 py-3 text-base" disabled={submitting}>
                {submitting ? "Concluindo..." : "Concluir e acessar"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 text-center">
          <Link href="/login" className="text-sm font-semibold text-ink-muted hover:text-brand">
            Já tenho acesso — entrar
          </Link>
        </div>
      </div>
    </div>
  );
}
