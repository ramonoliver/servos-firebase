"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/auth/session";
import { auth } from "@/lib/firebase";
import { signInWithCustomToken } from "firebase/auth";
import Link from "next/link";

function ServosMark() {
  return (
    <div className="flex items-center gap-3" aria-label="Servos">
      <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-brand text-white shadow-[0_14px_28px_rgba(255,107,87,0.4)]">
        <svg viewBox="0 0 180 201" fill="none" width="22" height="25" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M74.97 48.53c9.53.03 32.73 17.37 41.45 23.66 26.31 18.98 55.86 31.69 59.08 67.85 1.16 14.63-3.07 27.67-11.64 37.82-13.36 17.09-37.81 24.46-57.27 16.06-18.41-8.6-14.96-12.85-33.77-2.56C57.86 200.4 36.23 197.68 22.15 185.8c-5.7-5.86-9.68-10.73-11.54-19.78a38.26 38.26 0 014.23-30.06c2.34-3.74 6.94-6.88 11.24-7.8 10.76-2.07 20.59 8.98 28.06 14.38 7.74 5.69 15.62 10.67 22.83 15.45 9.06 5.87 20.07 10.68 31.87 8.05 12.34-3.03 23.13-13.74 25.18-27.28 4.01-25.93-21.95-35.26-38.77-47.17-10.62-7.58-39.16-21.78-27.39-37.97 3.2-3.97 5.9-5.24 10.65-6.09z" fill="currentColor" />
          <path d="M49.85.99c7.01-1.42 16.82.42 23.6 2.83 7.04 2.51 16.36 9.86 23.94 8.67 7.83-1.17 14.56-8.2 22.63-9.87 12.3-3.2 25.7-2.72 36.94 3.52 9.52 5.29 16.59 14.09 19.69 23.53 4.97 17.27-2.97 47.83-27.4 40.58-3.61-1.07-8.72-5.67-12.07-7.84-13.39-8.72-26.22-18.36-39.88-26.65-9.6-5.83-22.83-8.68-33.79-5.86-8.82 2.43-15.46 8.38-19.78 15.64-4.73 8.67-4.78 16.61-2.16 24.83 5.67 15.16 24.97 23.2 37.52 31.06 10.28 7.14 40.88 21.48 28.6 37.38-2.57 3.29-6.34 5.42-10.49 5.94-9.79 1.19-24.89-12.07-32.24-17.01-13.06-8.86-25.9-18.72-38.67-28.05C-17.03 75.29-2.73 7.24 49.85.99z" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.user) {
        setError(data?.error || "Email ou senha incorretos.");
        setLoading(false);
        return;
      }

      createSession(data.user, data.token);
      if (data.firebaseToken) {
        await signInWithCustomToken(auth, data.firebaseToken);
      }
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Erro ao entrar.");
      setLoading(false);
      return;
    }

    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-start bg-[#f3eee6] px-4 py-8 sm:justify-center sm:px-6 lg:px-8">
      <div className="grid w-full max-w-[358px] min-w-0 overflow-hidden rounded-[30px] bg-white p-4 shadow-[0_34px_90px_rgba(92,64,37,0.18)] sm:max-w-[1096px] lg:grid-cols-[0.95fr_1fr] lg:p-5">
        <section className="relative hidden min-h-[650px] overflow-hidden rounded-[22px] border border-[#eadfce] bg-[#f8dcc0] lg:block">
          <img
            src="/welcome-login.png"
            alt="Robo Servos dando boas vindas"
            className="h-full w-full object-cover"
          />
        </section>

        <section className="flex min-w-0 items-center justify-center px-4 py-10 sm:min-h-[620px] sm:px-10 lg:px-16">
          <div className="w-full min-w-0 max-w-[420px]">
          <div className="mb-10">
            <ServosMark />
          </div>

          <div className="mb-8">
            <h1 className="font-display text-[34px] font-extrabold leading-[1.02] tracking-normal text-ink sm:text-[50px] sm:leading-[0.98]">
              Entre na sua conta
            </h1>
            <p className="mt-4 text-base text-ink-muted">Organize. Sirva. Viva o proposito.</p>
          </div>

          {error && (
            <div className="mb-5 rounded-[14px] border border-danger/10 bg-danger-light px-4 py-3 text-sm font-medium text-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="w-full min-w-0 space-y-5">
            <div>
              <label className="mb-2 block text-xs font-extrabold text-ink-muted">E-mail</label>
              <input
                type="email"
                className="h-[54px] w-full min-w-0 rounded-[15px] border border-[#ded9cf] bg-[#fbfaf6] px-5 text-[15px] font-medium text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-[4px] focus:ring-brand/10"
                placeholder="voce@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-extrabold text-ink-muted">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="h-[54px] w-full min-w-0 rounded-[15px] border border-[#ded9cf] bg-[#fbfaf6] px-5 pr-12 text-[15px] font-medium text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-[4px] focus:ring-brand/10"
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint transition hover:bg-black/5 hover:text-ink-muted"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 text-right">
                <Link href="/esqueci-senha" className="text-sm font-extrabold text-ink transition hover:text-brand">
                  Esqueci minha senha
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-[58px] w-full items-center justify-center rounded-full bg-brand px-6 text-[15px] font-extrabold text-white shadow-[0_20px_36px_rgba(255,107,87,0.38)] transition hover:bg-brand-deep hover:shadow-[0_18px_32px_rgba(255,107,87,0.44)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p className="mt-9 text-center text-sm font-medium text-ink-muted">
            Ainda nao tem conta?{" "}
            <Link href="/cadastro" className="font-extrabold text-ink transition hover:text-brand">
              Criar conta
            </Link>
          </p>
          </div>
        </section>
      </div>
    </main>
  );
}
