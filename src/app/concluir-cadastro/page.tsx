import { Suspense } from "react";
import CompleteRegistrationClient from "./complete-registration-client";

export default function ConcluirCadastroPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-bg px-4 text-sm text-ink-muted">
          Carregando...
        </div>
      }
    >
      <CompleteRegistrationClient />
    </Suspense>
  );
}
