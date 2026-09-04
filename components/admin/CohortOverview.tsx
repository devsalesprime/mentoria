import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { CohortClubDetail } from './CohortClubDetail';
import { FICHA_STATUS_LABEL, MATERIALS_STATUS_LABEL, SCRIPT_FIELD_BY_KEY } from '../../data/script-ficha-fields';
import type { FichaStatus, MaterialsStatus } from '../../data/script-ficha-fields';

/** Resumo dos gates de suficiencia (GET /api/admin/cohort .suficiencia); o detalhe do clube traz os motivos. */
export interface SuficienciaResumo {
  resultado: 'suficiente' | 'parcial' | 'insuficiente';
  faltam: string[];
  faltam_n: number;
  criticos_ok?: boolean;
  fontes_distintas?: number;
  forcado_por?: { acao: 'revisao' | 'script'; por: string; em: string } | null;
  avaliado_em?: string | null;
}

/** Pendencia aberta pelo worker com o mentor (job `pendencia` na fila): "Aguardando resposta do mentor". */
export interface PendenciaAberta {
  job_id: string;
  status: string;
  campos: { key: string; nome: string }[];
  desde: string | null;
  email: string;
}

export interface CohortRow {
  suficiencia?: SuficienciaResumo | null;
  pendencia?: PendenciaAberta | null;
  confirmada_por?: string | null;
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

const SUFICIENCIA_CLASS: Record<SuficienciaResumo['resultado'], string> = {
  suficiente: 'bg-green-600/20 text-green-400',
  parcial: 'bg-yellow-600/20 text-yellow-400',
  insuficiente: 'bg-red-600/20 text-red-300',
};

/** "suficiente" / "parcial N" / "insuficiente" (+ "forçado" quando o admin interveio); vazio antes do pré-preenchimento. */
export function suficienciaTexto(s: SuficienciaResumo | null | undefined): string {
  if (!s) return '';
  const base = s.resultado === 'parcial' ? `parcial ${s.faltam_n ?? (s.faltam || []).length}` : s.resultado;
  return s.forcado_por ? `${base} · forçado` : base;
}

export const SuficienciaBadge: React.FC<{ suficiencia: SuficienciaResumo | null | undefined }> = ({ suficiencia }) => {
  if (!suficiencia) return <span className="text-[11px] text-white/30" data-testid="suficiencia-badge">sem avaliação</span>;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SUFICIENCIA_CLASS[suficiencia.resultado] || SUFICIENCIA_CLASS.parcial}`} data-testid="suficiencia-badge">
      {suficienciaTexto(suficiencia)}
    </span>
  );
};

/** Nomes dos campos (sem código) de uma pendência ou de `faltam`. */
export function nomesDosCampos(keys: string[] | { key: string; nome: string }[] | undefined): string {
  return (keys || []).map((k) => (typeof k === 'string' ? SCRIPT_FIELD_BY_KEY[k]?.nome || k : k.nome)).join(', ');
}

/** "Aguardando resposta do mentor: campo A, campo B" (pendência aberta pelo worker). */
export const PendenciaLinha: React.FC<{ pendencia: PendenciaAberta | null | undefined }> = ({ pendencia }) => {
  if (!pendencia) return null;
  const nomes = nomesDosCampos(pendencia.campos);
  return (
    <p className="text-[11px] text-purple-300 mt-1" data-testid="pendencia-linha">
      Aguardando resposta do mentor{nomes ? `: ${nomes}` : ''}{pendencia.desde ? ` · desde ${formatDateTime(pendencia.desde)}` : ''}
    </p>
  );
};

// ─── Fila de pre-preenchimento (cohort_jobs) ─────────────────────────────────

export type CohortJobStatus = 'queued' | 'running' | 'done' | 'error' | 'needs_human';

/** Linha de GET /api/admin/cohort/jobs (job + nome do clube e da pessoa). */
export interface CohortJob {
  id: string;
  tipo: string;
  club_slug: string;
  club_nome?: string | null;
  email: string;
  pessoa_nome?: string | null;
  notify_phone: string | null;
  status: CohortJobStatus;
  attempts: number;
  /** { nome, submitted_at, notify } (prefill) · { nome, motivo } (script) · { field_key, nome, pedido } (refinar) · { versao, content_md, comentarios[], pedido? } (revisar) */
  payload?: any;
  error: string | null;
  /** Marcos do prefill em blocos (PATCH /api/jobs/:id { progresso }); null ate o worker mandar o primeiro. */
  progresso?: JobProgresso | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** { fase, etapa_atual, etapas_total, rotulo, arquivos_lidos?, arquivos_total?, blocos_concluidos, blocos_com_erro?, atualizado_em } */
export interface JobProgresso {
  fase?: string;
  etapa_atual?: number;
  etapas_total?: number;
  rotulo?: string;
  arquivos_lidos?: number;
  arquivos_total?: number;
  blocos_concluidos?: number[];
  blocos_com_erro?: number[];
  atualizado_em?: string;
}

/** "Montando o bloco Mentor (3/7)" ou '' sem progresso; pendência: "Aguardando: campo A, campo B". */
export function progressoResumo(j: { progresso?: JobProgresso | null; tipo?: string; payload?: any }): string {
  if (j.tipo === 'pendencia') {
    const nomes = nomesDosCampos(j.payload?.campos);
    return nomes ? `Aguardando: ${nomes}` : 'Aguardando resposta do mentor';
  }
  const p = j.progresso;
  if (!p || !p.rotulo) return '';
  const etapa = p.etapa_atual && p.etapas_total ? ` (${p.etapa_atual}/${p.etapas_total})` : '';
  return `${p.rotulo}${etapa}`;
}

const JOB_STATUS_LABEL: Record<CohortJobStatus, string> = {
  queued: 'Na fila',
  running: 'Rodando',
  done: 'Concluído',
  error: 'Erro',
  needs_human: 'Precisa de humano',
};

export const JOB_TIPO_LABEL: Record<string, string> = {
  prefill: 'Pré-preenchimento',
  script: 'Script',
  refinar: 'Refinar campo',
  revisar: 'Revisar script',
  pendencia: 'Aguardando resposta do mentor',
};

/** Etiqueta do tipo do job (prefill / script / refinar + campo / revisar + versao base). */
export const JobTipoBadge: React.FC<{ job: { tipo: string; payload?: any } }> = ({ job }) => (
  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-white/70">
    {JOB_TIPO_LABEL[job.tipo] || job.tipo}
    {job.tipo === 'refinar' && job.payload?.field_key ? ` ${job.payload.field_key}` : ''}
    {job.tipo === 'revisar' && job.payload?.versao ? ` v${job.payload.versao}` : ''}
  </span>
);

const JOB_STATUS_CLASS: Record<CohortJobStatus, string> = {
  queued: 'bg-blue-600/20 text-blue-300',
  running: 'bg-yellow-600/20 text-yellow-300',
  done: 'bg-green-600/20 text-green-400',
  error: 'bg-red-600/20 text-red-300',
  needs_human: 'bg-purple-600/20 text-purple-300',
};

export const JobStatusBadge: React.FC<{ status: CohortJobStatus }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${JOB_STATUS_CLASS[status] || JOB_STATUS_CLASS.queued}`}>
    {JOB_STATUS_LABEL[status] || status}
  </span>
);

/** Painel "Fila": jobs de pre-preenchimento com Reprocessar. */
export const CohortJobsPanel: React.FC<CohortOverviewProps> = ({ token, showToast }) => {
  const [jobs, setJobs] = useState<CohortJob[]>([]);
  const [filaLigada, setFilaLigada] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<boolean | null>(null);
  const [requeuing, setRequeuing] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/cohort/jobs', { headers: { Authorization: `Bearer ${token}` } });
      if (res.data.success) {
        const list: CohortJob[] = res.data.data || [];
        setJobs(list);
        setFilaLigada(res.data.fila_ligada ?? null);
        // Abre sozinho quando ha algo pendente ou com problema
        setOpen((prev) => (prev === null ? list.some((j) => j.status !== 'done') : prev));
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Erro ao carregar a fila', 'error');
    } finally {
      setLoading(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const requeue = async (job: CohortJob) => {
    if (!window.confirm(`Reprocessar o job "${JOB_TIPO_LABEL[job.tipo] || job.tipo}" de ${job.pessoa_nome || job.email}?`)) return;
    setRequeuing(job.id);
    try {
      const res = await axios.post(`/api/admin/cohort/jobs/${job.id}/requeue`, {}, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data.success) {
        showToast('Job de volta na fila', 'success');
        await fetchJobs();
      }
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Erro ao reprocessar', 'error');
    } finally {
      setRequeuing(null);
    }
  };

  const pendentes = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
  const problemas = jobs.filter((j) => j.status === 'error' || j.status === 'needs_human').length;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={!!open}
        className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/5 transition"
      >
        <span className="text-sm font-semibold text-white">
          Fila do worker (pré-preenchimento, script, refinar, revisar)
          <span className="ml-2 text-xs font-normal text-white/50">
            {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}{pendentes ? ` · ${pendentes} pendentes` : ''}{problemas ? ` · ${problemas} com problema` : ''}
          </span>
        </span>
        <span className="flex items-center gap-3 text-xs text-white/50">
          {filaLigada === false && <span className="text-yellow-300">fila desligada no servidor (COHORT_JOBS_TOKEN vazio)</span>}
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex justify-end">
            <button
              onClick={fetchJobs}
              disabled={loading}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Atualizando...' : 'Atualizar fila'}
            </button>
          </div>
          {jobs.length === 0 ? (
            <p className="text-xs text-white/40">Nenhum job ainda. Um job nasce quando o mentor clica em "Confirmar e ir para a ficha".</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/50">
                      <th className="px-3 py-2 text-left">Pessoa</th>
                      <th className="px-3 py-2 text-left">Clube</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Andamento</th>
                      <th className="px-3 py-2 text-left">Tentativas</th>
                      <th className="px-3 py-2 text-left">Criado</th>
                      <th className="px-3 py-2 text-left">Erro</th>
                      <th className="px-3 py-2 text-left"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id} className="border-b border-white/5 text-xs">
                        <td className="px-3 py-2">
                          <p className="text-white">{j.pessoa_nome || j.email}</p>
                          <p className="text-white/40">{j.email}{j.notify_phone ? ` · ${j.notify_phone}` : ''}</p>
                        </td>
                        <td className="px-3 py-2 text-white/70">{j.club_nome || j.club_slug}</td>
                        <td className="px-3 py-2"><JobTipoBadge job={j} /></td>
                        <td className="px-3 py-2"><JobStatusBadge status={j.status} /></td>
                        <td className="px-3 py-2 text-prosperus-gold-light/80 max-w-[220px] break-words">{progressoResumo(j)}</td>
                        <td className="px-3 py-2 text-white/70">{j.attempts}</td>
                        <td className="px-3 py-2 text-white/60">{formatDateTime(j.created_at)}{j.finished_at ? <span className="block text-white/40">fim {formatDateTime(j.finished_at)}</span> : null}</td>
                        <td className="px-3 py-2 text-red-300 max-w-[260px] break-words">{j.error || ''}</td>
                        <td className="px-3 py-2 text-right">
                          {j.status !== 'queued' && j.status !== 'running' && (
                            <button
                              onClick={() => requeue(j)}
                              disabled={requeuing === j.id}
                              className="px-3 py-1.5 bg-prosperus-gold text-black text-xs font-semibold rounded-lg transition disabled:opacity-40"
                            >
                              {requeuing === j.id ? '...' : 'Reprocessar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-2">
                {jobs.map((j) => (
                  <div key={j.id} className="border border-white/10 rounded-lg p-3 space-y-1 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-white font-semibold">{j.pessoa_nome || j.email}</span>
                      <JobStatusBadge status={j.status} />
                    </div>
                    <p className="text-white/50">{j.email}{j.notify_phone ? ` · ${j.notify_phone}` : ''}</p>
                    <p className="text-white/60">{j.club_nome || j.club_slug} · {j.attempts} {j.attempts === 1 ? 'tentativa' : 'tentativas'} · {formatDateTime(j.created_at)}</p>
                    {progressoResumo(j) && <p className="text-prosperus-gold-light/80 break-words">{progressoResumo(j)}</p>}
                    {j.error && <p className="text-red-300 break-words">{j.error}</p>}
                    {j.status !== 'queued' && j.status !== 'running' && (
                      <button
                        onClick={() => requeue(j)}
                        disabled={requeuing === j.id}
                        className="mt-1 px-3 py-2 min-h-[44px] bg-prosperus-gold text-black text-xs font-semibold rounded-lg transition disabled:opacity-40"
                      >
                        {requeuing === j.id ? '...' : 'Reprocessar'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

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
    suficientes: rows.filter((r) => r.suficiencia?.resultado === 'suficiente').length,
    aguardando: rows.filter((r) => !!r.pendencia).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Cohort · Script 7 Passos</h3>
          <p className="text-xs text-white/50">
            {totals.clubes} clubes ({totals.ativos} ativos) · {totals.comMateriais} com materiais · {totals.emRevisao} em revisão · {totals.confirmadas} confirmadas
            {totals.suficientes ? ` · ${totals.suficientes} direto ao script` : ''}{totals.aguardando ? ` · ${totals.aguardando} aguardando resposta do mentor` : ''}
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

      <CohortJobsPanel token={token} showToast={showToast} />

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
                  <th className="px-4 py-3 text-left">Suficiência</th>
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
                        {r.confirmada_por === 'automatica' && <span className="text-[10px] text-prosperus-gold">pelos materiais</span>}
                      </div>
                      <PendenciaLinha pendencia={r.pendencia} />
                    </td>
                    <td className="px-4 py-3"><SuficienciaBadge suficiencia={r.suficiencia} /></td>
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
                  <SuficienciaBadge suficiencia={r.suficiencia} />
                </div>
                <PendenciaLinha pendencia={r.pendencia} />
                <p className="text-[11px] text-white/40 mt-2">atividade {formatDateTime(r.ultima_atividade)} · login {formatDateTime(r.ultimo_login)}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
