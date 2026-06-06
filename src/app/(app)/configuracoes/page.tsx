"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { PageHeader } from "@/components/ui";

const ESTADOS = [
  { uf: "AC", nome: "Acre" },
  { uf: "AL", nome: "Alagoas" },
  { uf: "AP", nome: "Amapá" },
  { uf: "AM", nome: "Amazonas" },
  { uf: "BA", nome: "Bahia" },
  { uf: "CE", nome: "Ceará" },
  { uf: "DF", nome: "Distrito Federal" },
  { uf: "ES", nome: "Espírito Santo" },
  { uf: "GO", nome: "Goiás" },
  { uf: "MA", nome: "Maranhão" },
  { uf: "MT", nome: "Mato Grosso" },
  { uf: "MS", nome: "Mato Grosso do Sul" },
  { uf: "MG", nome: "Minas Gerais" },
  { uf: "PA", nome: "Pará" },
  { uf: "PB", nome: "Paraíba" },
  { uf: "PR", nome: "Paraná" },
  { uf: "PE", nome: "Pernambuco" },
  { uf: "PI", nome: "Piauí" },
  { uf: "RJ", nome: "Rio de Janeiro" },
  { uf: "RN", nome: "Rio Grande do Norte" },
  { uf: "RS", nome: "Rio Grande do Sul" },
  { uf: "RO", nome: "Rondônia" },
  { uf: "RR", nome: "Roraima" },
  { uf: "SC", nome: "Santa Catarina" },
  { uf: "SP", nome: "São Paulo" },
  { uf: "SE", nome: "Sergipe" },
  { uf: "TO", nome: "Tocantins" },
];

export default function ConfiguraçõesPage() {
  const { toast, church, refresh, user } = useApp();
  const [churchName, setChurchName] = useState(church.name);
  const [selectedState, setSelectedState] = useState(church.state || "");
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState(church.city || "");
  const [loadingCities, setLoadingCities] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (church) {
      setChurchName(church.name);
      setSelectedState(church.state || "");
      setSelectedCity(church.city || "");
    }
  }, [church]);


  useEffect(() => {
    if (!selectedState) {
      setCities([]);
      return;
    }
    let active = true;
    async function fetchCities() {
      setLoadingCities(true);
      try {
        const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${selectedState}/municipios`);
        if (res.ok && active) {
          const data = await res.json();
          const names = data.map((item: any) => item.nome).sort() as string[];
          setCities(names);
        }
      } catch (err) {
        console.error("Erro ao carregar cidades:", err);
      } finally {
        if (active) setLoadingCities(false);
      }
    }
    void fetchCities();
    return () => {
      active = false;
    };
  }, [selectedState]);

  async function saveChurch() {
    if (!churchName.trim()) {
      toast("Informe o nome da igreja.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/church/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: churchName.trim(),
          city: selectedCity.trim(),
          state: selectedState.trim(),
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("Erro ao salvar igreja:", data);
        toast(data?.error || "Erro ao salvar.");
        setSaving(false);
        return;
      }

      await refresh();
      toast("Salvo!");
      setSaving(false);
    } catch (error) {
      console.error("Erro ao salvar igreja:", error);
      toast("Erro ao salvar.");
      setSaving(false);
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        className="mb-6"
        eyebrow="Sistema"
        title="Configurações"
        subtitle="Ajustes gerais da igreja e orientações de uso"
      />

      <Link
        href="/configuracoes/notificacoes"
        className="card mb-5 flex items-center justify-between gap-4 p-5 transition-colors hover:bg-surface-alt"
      >
        <div>
          <h3 className="font-display text-lg">Notificações</h3>
          <p className="text-sm text-ink-muted">Canais (push, e-mail, WhatsApp) e categorias de avisos</p>
        </div>
        <span aria-hidden className="text-ink-faint">→</span>
      </Link>

      <div className="card p-6 mb-5">
        <h3 className="font-display text-lg mb-4">Igreja</h3>
        <div className="space-y-3">
          <div>
            <label className="input-label">Nome</label>
            <input
              className="input-field"
              value={churchName}
              onChange={(e) => setChurchName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="input-label">Estado</label>
              <select
                className="input-field"
                value={selectedState}
                onChange={(e) => {
                  setSelectedState(e.target.value);
                  setSelectedCity(""); // reset city
                }}
              >
                <option value="">Selecione o estado</option>
                {ESTADOS.map((est) => (
                  <option key={est.uf} value={est.uf}>
                    {est.nome} ({est.uf})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="input-label">Cidade</label>
              <select
                className="input-field"
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                disabled={!selectedState || loadingCities}
              >
                <option value="">
                  {loadingCities ? "Carregando cidades..." : "Selecione a cidade"}
                </option>
                {selectedCity && !cities.includes(selectedCity) && (
                  <option value={selectedCity}>{selectedCity}</option>
                )}
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button onClick={saveChurch} disabled={saving} className="btn btn-primary btn-sm w-full sm:w-auto">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div className="card p-6 mb-5">
        <h3 className="font-display text-lg mb-3">Permissões</h3>
        <div className="text-[13px] text-ink-muted leading-relaxed space-y-2">
          <p>
            <strong className="text-ink">Admin:</strong> acesso total - ministérios, membros, escalas, eventos, configurações.
          </p>
          <p>
            <strong className="text-ink">Líder:</strong> gerencia seu ministério - cria escalas, convida membros, envia mensagens.
          </p>
          <p>
            <strong className="text-ink">Membro:</strong> visualiza escalas, confirma presença, edita perfil.
          </p>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="font-display text-lg mb-3">Dados</h3>
        <p className="text-sm text-ink-muted">
          O reset local de demonstração foi descontinuado, porque os dados agora ficam persistidos no Firebase.
        </p>
      </div>
    </div>
  );
}
