/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Servos 2.0 — consolidação de rotas (Fundação Fase 1, Entregável 2).
      // Apenas redirects SEGUROS por enquanto: telas mock/stub → equivalente real.
      // A unificação /membros → /pessoas entra no passo 3 (merge das páginas),
      // para não quebrar /membros/convidar.
      { source: "/dashboard-pastoral", destination: "/dashboard", permanent: false },
      { source: "/relatorios-pastorais", destination: "/relatorios", permanent: false },

      // Unificação Pessoas ↔ Membros (passo 3). /pessoas/[id] é superset de
      // /membros/[id]. Ordem importa: convidar antes do :id (first-match wins).
      { source: "/membros/convidar", destination: "/pessoas/convidar", permanent: false },
      { source: "/membros/:id", destination: "/pessoas/:id", permanent: false },
      { source: "/membros", destination: "/pessoas", permanent: false },
    ];
  },
};

module.exports = nextConfig;
