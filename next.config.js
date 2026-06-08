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
    ];
  },
};

module.exports = nextConfig;
