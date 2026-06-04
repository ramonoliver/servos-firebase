"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/auth/session";
import { auth } from "@/lib/firebase";
import { signInWithCustomToken } from "firebase/auth";
import Link from "next/link";

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda" },
  { value: "2", label: "Terca" },
  { value: "3", label: "Quarta" },
  { value: "4", label: "Quinta" },
  { value: "5", label: "Sexta" },
  { value: "6", label: "Sabado" },
] as const;

export default function CadastroPage() {
  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    churchName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [weeklyServices, setWeeklyServices] = useState([
    { day: "0", time: "18:00" },
    { day: "3", time: "19:30" },
  ]);
  const router = useRouter();

  const u = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  function updateWeeklyService(index: number, field: "day" | "time", value: string) {
    setWeeklyServices((current) =>
      current.map((service, serviceIndex) =>
        serviceIndex === index ? { ...service, [field]: value } : service
      )
    );
  }

  function addWeeklyService() {
    setWeeklyServices((current) => [...current, { day: "6", time: "19:00" }]);
  }

  function removeWeeklyService(index: number) {
    setWeeklyServices((current) => current.filter((_, serviceIndex) => serviceIndex !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (f.password.length < 6) {
        setError("Senha deve ter pelo menos 6 caracteres.");
        setLoading(false);
        return;
      }

      if (weeklyServices.length === 0 || weeklyServices.some((service) => !service.time)) {
        setError("Informe pelo menos um culto semanal com dia e horario.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          email: f.email.trim().toLowerCase(),
          phone: f.phone,
          password: f.password,
          churchName: f.churchName || "Minha Igreja",
          weeklyServices,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.user) {
        setError(data?.error || "Erro ao criar conta.");
        setLoading(false);
        return;
      }

      createSession(data.user, data.token);
      if (data.firebaseToken) {
        await signInWithCustomToken(auth, data.firebaseToken);
      }
      router.push("/onboarding");
    } catch (err: any) {
      setError(err?.message || "Erro ao criar conta.");
      setLoading(false);
      return;
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-[520px]">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-deep flex items-center justify-center shadow-lg shadow-brand/30 mb-5">
            <svg viewBox="0 0 180 201" fill="none" width="30" height="34" xmlns="http://www.w3.org/2000/svg"><path d="M74.97 48.53c9.53.03 32.73 17.37 41.45 23.66 26.31 18.98 55.86 31.69 59.08 67.85 1.16 14.63-3.07 27.67-11.64 37.82-13.36 17.09-37.81 24.46-57.27 16.06-18.41-8.6-14.96-12.85-33.77-2.56C57.86 200.4 36.23 197.68 22.15 185.8c-5.7-5.86-9.68-10.73-11.54-19.78a38.26 38.26 0 014.23-30.06c2.34-3.74 6.94-6.88 11.24-7.8 10.76-2.07 20.59 8.98 28.06 14.38 7.74 5.69 15.62 10.67 22.83 15.45 9.06 5.87 20.07 10.68 31.87 8.05 12.34-3.03 23.13-13.74 25.18-27.28 4.01-25.93-21.95-35.26-38.77-47.17-10.62-7.58-39.16-21.78-27.39-37.97 3.2-3.97 5.9-5.24 10.65-6.09z" fill="rgba(255,255,255,.85)"/><path d="M49.85.99c7.01-1.42 16.82.42 23.6 2.83 7.04 2.51 16.36 9.86 23.94 8.67 7.83-1.17 14.56-8.2 22.63-9.87 12.3-3.2 25.7-2.72 36.94 3.52 9.52 5.29 16.59 14.09 19.69 23.53 4.97 17.27-2.97 47.83-27.4 40.58-3.61-1.07-8.72-5.67-12.07-7.84-13.39-8.72-26.22-18.36-39.88-26.65-9.6-5.83-22.83-8.68-33.79-5.86-8.82 2.43-15.46 8.38-19.78 15.64-4.73 8.67-4.78 16.61-2.16 24.83 5.67 15.16 24.97 23.2 37.52 31.06 10.28 7.14 40.88 21.48 28.6 37.38-2.57 3.29-6.34 5.42-10.49 5.94-9.79 1.19-24.89-12.07-32.24-17.01-13.06-8.86-25.9-18.72-38.67-28.05C-17.03 75.29-2.73 7.24 49.85.99z" fill="rgba(255,255,255,.85)"/></svg>
          </div>
          <h1 className="font-display text-3xl mb-1">Criar conta</h1>
          <p className="text-sm text-ink-muted">Comece a organizar seu ministério.</p>
        </div>

        <div className="bg-white rounded-2xl border border-border-soft shadow-lg p-8">
          {error && (
            <div className="bg-danger-light text-danger text-sm px-4 py-3 rounded-[10px] mb-4 border border-danger/10">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="input-label">Seu nome</label>
              <input
                className="input-field"
                placeholder="Como voce e chamado?"
                value={f.name}
                onChange={(e) => u("name", e.target.value)}
                required
              />
            </div>

            <div>
              <label className="input-label">Email</label>
              <input
                type="email"
                className="input-field"
                placeholder="seu@email.com"
                value={f.email}
                onChange={(e) => u("email", e.target.value)}
                required
              />
            </div>

            <div>
              <label className="input-label">Nome da igreja</label>
              <input
                className="input-field"
                placeholder="Ex: Igreja Batista Central"
                value={f.churchName}
                onChange={(e) => u("churchName", e.target.value)}
                required
              />
            </div>

            <div>
              <label className="input-label">Senha (min. 6 caracteres)</label>
              <input
                type="password"
                className="input-field"
                placeholder="Crie uma senha"
                value={f.password}
                onChange={(e) => u("password", e.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="rounded-2xl border border-border-soft bg-surface-alt p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-lg">Cultos semanais</div>
                  <div className="text-sm text-ink-muted">
                    Defina os dias e horarios principais da sua igreja.
                  </div>
                </div>

                <button type="button" onClick={addWeeklyService} className="btn btn-secondary btn-sm">
                  + Adicionar
                </button>
              </div>

              <div className="space-y-3">
                {weeklyServices.map((service, index) => (
                  <div key={`${service.day}-${index}`} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2 items-end">
                    <div>
                      <label className="input-label">Dia</label>
                      <select
                        className="input-field"
                        value={service.day}
                        onChange={(e) => updateWeeklyService(index, "day", e.target.value)}
                      >
                        {WEEKDAY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="input-label">Horario</label>
                      <input
                        type="time"
                        className="input-field"
                        value={service.time}
                        onChange={(e) => updateWeeklyService(index, "time", e.target.value)}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeWeeklyService(index)}
                      disabled={weeklyServices.length === 1}
                      className="btn btn-ghost text-danger"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full py-3 text-base">
              {loading ? "Criando..." : "Criar conta gratuita"}
            </button>
          </form>

          <p className="text-center text-sm text-ink-muted mt-5">
            Ja tem conta?{" "}
            <Link href="/login" className="text-brand font-semibold hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
