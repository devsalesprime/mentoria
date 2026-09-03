import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { CohortClubDetail } from './CohortClubDetail';
import { FICHA_STATUS_LABEL, MATERIALS_STATUS_LABEL } from '../../data/script-ficha-fields';
import type { FichaStatus, MaterialsStatus } from '../../data/script-ficha-fields';

export interface CohortRow {
  club_slug: string;
  club_nome: string;
  ativo: boolean;
  membros: { email: string; nome: string | null; user_id: string | null; ultimo_login: string | null }[];
  /** Arquivos de todos os membros do clube. */
  materiais_count: number;
  /** Links + acessos de plataforma de todos os membros. */
  links_count: number;
  /** Quantos membros clicaram em "Enviei o que tinha" (materiais sao por pessoa). */
  pessoas_enviaram: number;
  materials_status: MaterialsStatus;
  materials_submitted_at: string | null;
  ficha_status: FichaStatus;
  confirmados: number;
  obrigatorios: number;
  decididos: number;
  total: number;
  prefilled_at: string | null;
  reviewed_at: string | null;
  ultima_atividade: string | null;
  ultimo_login: string | null;
}

interface CohortOverviewProps {
  token: string;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return 'nunca';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const FICHA_BADGE: Record<FichaStatus, string> = {
  vazia: 'bg-gray-600/20 text-gray-400',
  pre_preenchida: 'bg-blue-600/20 text-blue-400',
  em_revisao: 'bg-yellow-600/20 text-yellow-400',
  confirmada: 'bg-green-600/20 text-green-400',
};

export const FichaBadge: React.FC<{ status: FichaStatus }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${FICHA_BADGE[status] || FICHA_BADGE.vazia}`}>
    {FICHA_STATUS_LABEL[status] || status}
  </span>
);

export const MaterialsBadge: React.FC<{ status: MaterialsStatus; count: number }> = ({ status, count }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status === 'submitted' ? 'bg-green-600/20 text-green-400' : 'bg-gray-600/20 text-gray-400'}`}>
    {MATERIALS_STATUS_LABEL[status] || status}{count ? ` · ${count}` : ''}
  </span>
);

type SortKey = 'atividade' | 'nome' | 'ficha';

export const CohortOverview: React.FC<CohortOverviewProps> = ({ token, showToast }) => {
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('atividade');
  const [selected, setSelected] = useState<string | null>(null);
  const [prazo, setPrazo] = useState('');
  const [prazoSaved, setPrazoSaved] = useState('');
  const [savingPrazo, setSavingPrazo] = useState(false);

  const fetchCohort = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/cohort', { headers: { Authorization: `Bearer ${token}` } });
      if (res.data.success) setRows(res.data.data || []);
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Erro ao carregar o cohort', 'error');
    } finally {
      setLoading(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchConfig = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/cohort/config', { headers: { Authorization: `Bearer ${token}` } });
      if (res.data.success) {
        const v = res.data.data?.prazo_materiais || '';
        setPrazo(v);
        setPrazoSaved(v);
      }
    } catch { /* silencioso: a tabela pode nao existir ainda */ }
  }, [token]);

  useEffect(() => { fetchCohort(); fetchConfig(); }, [fetchCohort, fetchConfig]);

  const savePrazo = async () => {
    setSavingPrazo(true);
    try {
      const res = await axios.put('/api/admin/cohort/config', { prazo_materiais: prazo.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data.success) {
        const v = res.data.data?.prazo_materiais || '';
        setPrazo(v);
        setPrazoSaved(v);
        showToast('Prazo salvo', 'success');
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Erro ao salvar o prazo', 'error');
    } finally {
      setSavingPrazo(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          r.club_nome.toLowerCase().includes(q) ||
          r.club_slug.includes(q) ||
          r.membros.some((m) => m.email.includes(q) || (m.nome || '').toLowerCase().includes(q)))
      : rows;
    const sorted = [...filtered];
    if (sort === 'nome') sorted.sort((a, b) => a.club_nome.localeCompare(b.club_nome, 'pt-BR'));
    else if (sort === 'ficha') sorted.sort((a, b) => (b.confirmados / (b.obrigatorios || 1)) - (a.confirmados / (a.obrigatorios || 1)));
    else sorted.sort((a, b) => (b.ultima_atividade || '').localeCompare(a.ultima_atividade || ''));
    return sorted;
  }, [rows, search, sort]);

  if (selected) {
    return (
      <CohortClubDetail
        slug={selected}
        token={token}
        showToast={showToast}
        onBack={() => { setSelected(null); fetchCohort(); }}
      />
    );
  }

  const totals = {
    clubes: rows.length,
    ativos: rows.filter((r) => r.ativo).length,
    comMateriais: rows.filter((r) => r.materials_status === 'submitted' || r.materiais_count > 0 || (r.links_count || 0) > 0).length,
    emRevisao: rows.filter((r) => r.ficha_status === 'em_revisao').length,
    confirmadas: rows.filter((r) => r.ficha_status === 'confirmada').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Cohort · Script 7 Passos</h3>
          <p className="text-xs text-white/50">
            {totals.clubes} clubes ({totals.ativos} ativos) · {totals.comMateriais} com materiais · {totals.emRevisao} em revisão · {totals.confirmadas} confirmadas
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar clube ou e-mail"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-prosperus-gold/50 w-full sm:w-64"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
            aria-label="Ordenar"
          >
            <option value="atividade">Última atividade</option>
            <option value="nome">Nome</option>
            <option value="ficha">Progresso da ficha</option>
          </select>
          <button
            onClick={fetchCohort}
            disabled={loading}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2">
        <label htmlFor="cohort-prazo-materiais" className="text-xs text-white/60 sm:w-64">
          Prazo dos materiais <span className="text-white/40">(aparece no "Como funciona" da tela Materiais; vazio esconde)</span>
        </label>
        <input
          id="cohort-prazo-materiais"
          type="text"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); savePrazo(); } }}
          maxLength={200}
          placeholder="Ex.: até sexta, 12/09"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-prosperus-gold/50"
        />
        <button
          onClick={savePrazo}
          disabled={savingPrazo || prazo.trim() === prazoSaved}
          className="px-4 py-2 bg-prosperus-gold text-black text-sm font-semibold rounded-lg transition disabled:opacity-40"
        >
          {savingPrazo ? 'Salvando...' : 'Salvar prazo'}
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-white/50 text-sm">
          Nenhum clube encontrado
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-prosperus-navy rounded-xl overflow-hidden border border-white/10">
            <table className="w-full">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
                  <th className="px-4 py-3 text-left">Clube</th>
                  <th className="px-4 py-3 text-left">Membros</th>
                  <th className="px-4 py-3 text-left">Materiais</th>
                  <th className="px-4 py-3 text-left">Ficha</th>
                  <th className="px-4 py-3 text-left">Última atividade</th>
                  <th className="px-4 py-3 text-left">Último login</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.club_slug}
                    onClick={() => setSelected(r.club_slug)}
                    className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition ${r.ativo ? '' : 'opacity-50'}`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-white">{r.club_nome}{!r.ativo && <span className="ml-2 text-[10px] text-white/40">inativo</span>}</p>
                      <p className="text-xs text-white/40">{r.club_slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-white/70">{r.membros.length} {r.membros.length === 1 ? 'pessoa' : 'pessoas'}</p>
                      <p className="text-[11px] text-white/40 truncate max-w-[220px]">{r.membros.map((m) => m.email).join(', ') || 'sem e-mail'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <MaterialsBadge status={r.materials_status} count={r.materiais_count} />
                      <p className="text-[11px] text-white/40 mt-1">
                        {r.pessoas_enviaram || 0} de {r.membros.length} {r.membros.length === 1 ? 'enviou' : 'enviaram'}{r.links_count ? ` · ${r.links_count} ${r.links_count === 1 ? 'link/acesso' : 'links/acessos'}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FichaBadge status={r.ficha_status} />
                        <span className="text-xs text-white/50">{r.confirmados}/{r.obrigatorios}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-white/60">{formatDateTime(r.ultima_atividade)}</td>
                    <td className="px-4 py-3 text-xs text-white/60">{formatDateTime(r.ultimo_login)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {visible.map((r) => (
              <div
                key={r.club_slug}
                onClick={() => setSelected(r.club_slug)}
                className={`bg-white/5 border border-white/10 rounded-xl p-4 cursor-pointer hover:bg-white/10 transition ${r.ativo ? '' : 'opacity-50'}`}
              >
                <p className="font-semibold text-white text-sm mb-1">{r.club_nome}</p>
                <p className="text-xs text-white/50 mb-2">{r.membros.map((m) => m.email).join(', ') || 'sem e-mail'}</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <MaterialsBadge status={r.materials_status} count={r.materiais_count} />
                  <span className="text-[11px] text-white/40">{r.pessoas_enviaram || 0}/{r.membros.length} enviaram</span>
                  <FichaBadge status={r.ficha_status} />
                  <span className="text-xs text-white/50">{r.confirmados}/{r.obrigatorios}</span>
                </div>
                <p className="text-[11px] text-white/40 mt-2">atividade {formatDateTime(r.ultima_atividade)} · login {formatDateTime(r.ultimo_login)}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
