import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import type {
  ScriptBlockView, ScriptFieldStatus, ScriptFieldView, ScriptHoje, ScriptProgresso, ScriptDayDef,
  FichaStatus, MaterialsStatus,
} from '../data/script-ficha-fields';
import { SCRIPT_DAYS, isDecided } from '../data/script-ficha-fields';

export interface ClubFile {
  id: string;
  userId: string;
  category: string;
  fileName: string;
  fileType?: string | null;
  fileSize?: number | null;
  createdAt?: string;
  ownerEmail?: string;
  ownerName?: string | null;
  mine: boolean;
}

export interface MaterialLink {
  url: string;
  rotulo: string;
  tipo: 'drive' | 'site' | 'plataforma' | 'outro';
}

/** Acesso a plataforma de conteudo (opcional). Sensivel: so a propria pessoa e o admin veem. */
export interface MaterialAcesso {
  plataforma_url: string;
  login: string;
  senha: string;
  observacoes: string;
}

/** Resposta colada da IA do mentor ("Peca para a sua IA preencher"), com a leitura leve do servidor. */
export interface MaterialRespostaIA {
  texto: string;
  salvo_em: string | null;
  /** Ex.: "34 campos: 20 certos, 8 parciais, 6 incertos" ou "formato não reconhecido, salvamos mesmo assim". */
  resumo: string;
}

/** Materiais da PROPRIA pessoa (links, observacoes, acessos). Socios nao veem uns aos outros. */
export interface ScriptMaterials {
  links: MaterialLink[];
  observacoes: string;
  acessos: MaterialAcesso[];
  submitted_at: string | null;
  resposta_ia?: MaterialRespostaIA | null;
  notify_phone?: string | null;
}

/** PUT parcial: resposta_ia vai como texto; o servidor devolve { texto, salvo_em, resumo }. */
export type ScriptMaterialsPatch = Partial<Pick<ScriptMaterials, 'links' | 'observacoes' | 'acessos'>> & { resposta_ia?: string };

export interface ScriptConfig {
  prazo_materiais: string;
}

export type ScriptJobStatus = 'queued' | 'running' | 'done' | 'error' | 'needs_human';

/** Marcos do worker no pre-preenchimento (PATCH /api/jobs/:id { progresso }): etapa 1 = leitura, 2 a 7 = blocos 1 a 6. */
export interface ScriptJobProgresso {
  fase?: 'extracao' | 'bloco' | 'finalizando' | string;
  etapa_atual?: number;
  etapas_total?: number;
  rotulo?: string;
  arquivos_lidos?: number;
  arquivos_total?: number;
  blocos_concluidos?: number[];
  blocos_com_erro?: number[];
  atualizado_em?: string;
}

/**
 * Ultimo job de pre-preenchimento desta pessoa (queued/running = "ja estamos processando").
 * O servidor so manda `done` por 10 min depois de finished_at; depois vem null.
 */
export interface ScriptJobInfo {
  id: string;
  tipo: string;
  status: ScriptJobStatus;
  attempts: number;
  progresso?: ScriptJobProgresso | null;
  error?: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface SubmitMaterialsOptions {
  notify_phone?: string;
  notify?: boolean;
}

export interface SubmitMaterialsResult {
  ok: boolean;
  /** true quando ja havia job queued/running desta pessoa (o servidor nao duplicou). */
  existing?: boolean;
  job?: ScriptJobInfo | null;
  message?: string;
}

/** Resumo do script escrito (GET /api/script/ficha .script): versoes do clube + ultimo job `script`. */
export interface ScriptSummary {
  versoes: number;
  ultima: { versao: number; status: 'rascunho' | 'aprovado'; created_at: string } | null;
  aprovada: number | null;
  job: ScriptJobInfo | null;
}

/** Item de contexto por pergunta (GET /api/script/context). Do clube, com autor. */
export interface ContextItem {
  id: string;
  field_key: string;
  tipo: 'audio' | 'imagem' | 'video' | 'link' | 'nota';
  file_id: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  url: string;
  texto: string;
  legenda: string;
  transcricao: string | null;
  erro_transcricao: string | null;
  autor_email: string | null;
  autor_nome: string | null;
  autor_user_id: string;
  created_at: string;
  /** Relativo (/api/script/context/files/:id/download); adicione ?token= ou o header. */
  download_url: string | null;
}

/** Versao do script (GET /api/script/versoes). content_md so em GET /api/script/versoes/:versao. */
export interface ScriptVersion {
  id: string;
  club_slug: string;
  versao: number;
  status: 'rascunho' | 'aprovado';
  resumo: string;
  meta: any;
  job_id: string | null;
  aprovado_em: string | null;
  aprovado_por: string | null;
  created_at: string;
  comentarios_count?: number;
  content_md?: string;
}

export interface ScriptComment {
  id: string;
  versao: number;
  /** 0 = geral, 1..7 = passo. */
  passo: number;
  texto: string;
  autor_email: string | null;
  autor_nome: string | null;
  created_at: string;
}

export interface ScriptFichaData {
  club: { slug: string; nome: string };
  ficha_status: FichaStatus;
  /** Por pessoa: "submitted" quando ESTE membro clicou em "Enviei o que tinha". */
  materials_status: MaterialsStatus;
  materials_submitted_at: string | null;
  materials: ScriptMaterials;
  job?: ScriptJobInfo | null;
  script?: ScriptSummary;
  config: ScriptConfig;
  prefilled_at: string | null;
  reviewed_at: string | null;
  last_user_activity_at: string | null;
  categorias: string[];
  files: ClubFile[];
  blocos: ScriptBlockView[];
  hoje: ScriptHoje;
  progresso: ScriptProgresso;
  dias: ScriptDayDef[];
}

export interface FieldDecision {
  status: ScriptFieldStatus;
  valor?: string;
  /** JSON do widget (so com status 'editado'); o servidor guarda ao lado do valor. */
  estrutura?: Record<string, any>;
}

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 1500;

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/** Recalcula contadores, "fechado", progresso e "hoje" a partir dos campos (espelha utils/script-ficha.cjs). */
export function recomputeView(blocos: ScriptBlockView[]): { blocos: ScriptBlockView[]; progresso: ScriptProgresso; hoje: ScriptHoje } {
  const next = blocos.map((b) => {
    const obrig = b.campos.filter((c) => c.obrigatorio);
    const pend = b.campos.filter((c) => !c.decidido).reduce((s, c) => s + c.minutos, 0);
    return {
      ...b,
      decididos: b.campos.filter((c) => c.decidido).length,
      obrigatorios_decididos: obrig.filter((c) => c.decidido).length,
      minutos_pendentes: pend > 0 ? Math.max(1, Math.round(pend)) : 0,
      fechado: obrig.every((c) => c.decidido),
    };
  });
  const all = next.flatMap((b) => b.campos);
  const progresso: ScriptProgresso = {
    total: all.length,
    decididos: all.filter((c) => c.decidido).length,
    obrigatorios: all.filter((c) => c.obrigatorio).length,
    obrigatorios_decididos: all.filter((c) => c.obrigatorio && c.decidido).length,
    confirmados: all.filter((c) => c.status === 'confirmado').length,
    editados: all.filter((c) => c.status === 'editado').length,
    aceitos_vazios: all.filter((c) => c.status === 'aceito_vazio').length,
  };
  let hoje: ScriptHoje | null = null;
  for (const d of SCRIPT_DAYS) {
    if (!d.blocos.length) continue;
    const abertos = next.filter((b) => d.blocos.includes(b.numero) && !b.fechado);
    if (abertos.length) {
      const min = next.filter((b) => d.blocos.includes(b.numero)).reduce((s, b) => s + b.minutos_pendentes, 0);
      hoje = { dia: d.dia, titulo: d.titulo, blocos: d.blocos, blocos_abertos: abertos.map((b) => b.numero), minutos: min > 0 ? Math.max(1, Math.round(min)) : d.minutos, em_breve: false };
      break;
    }
  }
  if (!hoje) {
    const d3 = SCRIPT_DAYS.find((d) => d.dia === 3) || { dia: 3, titulo: 'Revisar o script', minutos: 30 };
    hoje = { dia: 3, titulo: d3.titulo, blocos: [], blocos_abertos: [], minutos: d3.minutos, em_breve: true };
  }
  return { blocos: next, progresso, hoje };
}

function applyDecisionLocal(campo: ScriptFieldView, decision: FieldDecision, email: string): ScriptFieldView {
  const ts = new Date().toISOString();
  let status = campo.status;
  let valor = campo.valor;
  let estrutura: Record<string, any> | null = null;
  if (decision.status === 'confirmado') {
    if (!campo.sugerido.trim()) return campo;
    status = 'confirmado'; valor = campo.sugerido;
  } else if (decision.status === 'editado') {
    const v = (decision.valor || '').trim();
    if (!v) return campo;
    status = 'editado'; valor = v;
    estrutura = decision.estrutura && typeof decision.estrutura === 'object' && !Array.isArray(decision.estrutura) ? decision.estrutura : null;
  } else if (decision.status === 'aceito_vazio') {
    status = 'aceito_vazio'; valor = '';
  } else {
    status = campo.sugerido.trim() ? 'sugerido' : 'vazio'; valor = '';
  }
  const valor_efetivo = status === 'confirmado' ? (valor || campo.sugerido) : status === 'editado' ? valor : '';
  return { ...campo, status, valor, estrutura, valor_efetivo, decidido: isDecided(status), atualizado_por: email, atualizado_em: ts };
}

/**
 * Editor daquele campo aberto na tela (o mentor esta escrevendo): a sugestao nova espera a proxima sincronizacao.
 * Campo com sugestao: o editor (`editor-<key>` / `wizard-editor-<key>`) so aparece depois de "Editar".
 * Campo vazio: o editor fica sempre na tela; conta como edicao se tem foco ou algo digitado.
 */
export function campoEmEdicaoNaTela(key: string, status: ScriptFieldStatus): boolean {
  if (typeof document === 'undefined') return false;
  const editores = Array.from(document.querySelectorAll(`[data-testid="editor-${key}"], [data-testid="wizard-editor-${key}"]`));
  if (!editores.length) return false;
  if (status !== 'vazio') return true;
  const ativo = document.activeElement;
  return editores.some((el) => (!!ativo && el.contains(ativo))
    || Array.from(el.querySelectorAll('input, textarea, select')).some((i) => {
      const inp = i as HTMLInputElement;
      if (inp.type === 'checkbox' || inp.type === 'radio') return inp.checked;
      return !!(inp.value || '').trim();
    }));
}

export interface MergeFichaOptions {
  /** Chaves que nao recebem sugestao nova agora (editor aberto, decisao ainda na fila). */
  skip?: Iterable<string>;
}

function mesmaSugestao(a: ScriptFieldView, b: ScriptFieldView): boolean {
  return a.sugerido === b.sugerido && a.fonte === b.fonte && a.classe === b.classe && a.status === b.status
    && JSON.stringify(a.alternativas || []) === JSON.stringify(b.alternativas || []);
}

function mesmoComplemento(a: ScriptFieldView['complemento'], b: ScriptFieldView['complemento']): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.sugerido === b.sugerido && a.fonte === b.fonte && a.recebido_em === b.recebido_em;
}

/**
 * Funde a ficha fresca do servidor na local SEM resetar o que o mentor esta fazendo:
 * - campo decidido localmente: fica como esta (so recebe `complemento`, contexto_count e refinando);
 * - campo em `skip` (editor aberto / decisao pendente): so os sinais laterais;
 * - campo vazio/sugerido: recebe a sugestao nova (ou a decisao de um socio) e ganha `nova_sugestao`.
 * Devolve tambem as chaves que mudaram (badge "Nova sugestão").
 */
export function mergeFichaData(prev: ScriptFichaData, fresh: ScriptFichaData, opts: MergeFichaOptions = {}): { data: ScriptFichaData; alteradas: string[] } {
  const skip = new Set(opts.skip || []);
  const freshByKey: Record<string, ScriptFieldView> = Object.fromEntries(fresh.blocos.flatMap((b) => b.campos.map((c) => [c.key, c])));
  const alteradas: string[] = [];
  const blocos = prev.blocos.map((b) => ({
    ...b,
    campos: b.campos.map((local) => {
      const remoto = freshByKey[local.key];
      if (!remoto) return local;
      const lateral = { contexto_count: remoto.contexto_count, refinando: remoto.refinando };
      if (local.decidido) {
        const chegou = !!remoto.complemento && !mesmoComplemento(local.complemento || null, remoto.complemento);
        if (chegou) alteradas.push(local.key);
        return { ...local, ...lateral, complemento: remoto.complemento || null, nova_sugestao: chegou || (!!local.nova_sugestao && !!remoto.complemento) };
      }
      if (skip.has(local.key) || mesmaSugestao(local, remoto)) return { ...local, ...lateral };
      const mudou = !remoto.decidido && remoto.sugerido !== local.sugerido && !!remoto.sugerido.trim();
      if (mudou) alteradas.push(local.key);
      return { ...local, ...remoto, ...lateral, nova_sugestao: mudou || (!!local.nova_sugestao && !remoto.decidido) };
    }),
  }));
  const rec = recomputeView(blocos);
  // O servidor manda; so nao rebaixa uma ficha que o mentor ja mexeu localmente
  const ficha_status: FichaStatus = prev.ficha_status === 'em_revisao' && (fresh.ficha_status === 'vazia' || fresh.ficha_status === 'pre_preenchida')
    ? prev.ficha_status : fresh.ficha_status;
  return { data: { ...fresh, ...rec, ficha_status }, alteradas };
}

export const useScriptFicha = (token: string, enabled: boolean, userEmail: string = '') => {
  const [data, setData] = useState<ScriptFichaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  /** Momento (ms) da ultima leitura bem-sucedida do servidor ("Atualizado há 20 s" no painel). */
  const [ultimaSincronia, setUltimaSincronia] = useState<number | null>(null);

  const pendingRef = useRef<Record<string, FieldDecision>>({});
  /** Campos com editor aberto, avisados pela tela (alem da leitura do DOM em campoEmEdicaoNaTela). */
  const editingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<ScriptFichaData | null>(null);

  useEffect(() => { dataRef.current = data; }, [data]);

  const load = useCallback(async () => {
    if (!token || !enabled) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/script/ficha', authHeaders(token));
      if (res.data?.success && res.data.data) {
        setData(res.data.data as ScriptFichaData);
        setServerEnabled(true);
        setError(null);
        setUltimaSincronia(Date.now());
      }
    } catch (e: any) {
      if (e?.response?.status === 403) {
        setServerEnabled(false);
      } else {
        setError(e?.response?.data?.message || e?.message || 'Erro ao carregar a ficha');
      }
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [token, enabled]);

  useEffect(() => { load(); }, [load]);

  /**
   * Envia a fila pendente sem esperar resposta (fetch keepalive): usado em pagehide/beforeunload,
   * no logout e no unmount, para nao perder decisao presa no debounce de 1,5 s.
   */
  const flushKeepalive = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const updates = pendingRef.current;
    if (!token || !Object.keys(updates).length) return;
    pendingRef.current = {};
    try {
      fetch('/api/script/ficha/fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ updates }),
        keepalive: true,
      }).catch(() => { /* sem retry: a pagina esta fechando */ });
    } catch { /* ambiente sem fetch */ }
  }, [token]);

  const flushRef = useRef(flushKeepalive);
  useEffect(() => { flushRef.current = flushKeepalive; }, [flushKeepalive]);

  useEffect(() => {
    if (!token || !enabled || typeof window === 'undefined') return;
    const handler = () => flushRef.current();
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, [token, enabled]);

  useEffect(() => () => {
    flushRef.current();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const updates = pendingRef.current;
    if (!Object.keys(updates).length) return;
    pendingRef.current = {};
    setSaveState('saving');
    try {
      const res = await axios.put('/api/script/ficha/fields', { updates }, { ...authHeaders(token), timeout: 30000 });
      if (res.data?.success) {
        setData((prev) => {
          if (!prev) return prev;
          const summary: Record<number, any> = Object.fromEntries((res.data.blocos || []).map((b: any) => [b.numero, b]));
          const blocos = prev.blocos.map((b) => summary[b.numero] ? { ...b, ...summary[b.numero], campos: b.campos } : b);
          return { ...prev, blocos, ficha_status: res.data.ficha_status || prev.ficha_status, progresso: res.data.progresso || prev.progresso, hoje: res.data.hoje || prev.hoje };
        });
        setSaveState('saved');
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2500);
      } else {
        throw new Error(res.data?.message || 'Falha ao salvar');
      }
    } catch (e: any) {
      // Mantem as decisoes na fila para a proxima tentativa
      pendingRef.current = { ...updates, ...pendingRef.current };
      setSaveState('error');
      setError(e?.response?.data?.message || e?.message || 'Erro ao salvar');
    }
  }, [token]);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState('pending');
    timerRef.current = setTimeout(() => { flush(); }, DEBOUNCE_MS);
  }, [flush]);

  const decide = useCallback((key: string, decision: FieldDecision) => {
    setData((prev) => {
      if (!prev) return prev;
      const blocos = prev.blocos.map((b) => ({
        ...b,
        // Decidir apaga a etiqueta "Nova sugestão" do campo
        campos: b.campos.map((c) => (c.key === key ? { ...applyDecisionLocal(c, decision, userEmail), nova_sugestao: false } : c)),
      }));
      const rec = recomputeView(blocos);
      const ficha_status: FichaStatus = prev.ficha_status === 'vazia' || prev.ficha_status === 'pre_preenchida' || prev.ficha_status === 'confirmada'
        ? 'em_revisao' : prev.ficha_status;
      return { ...prev, ...rec, ficha_status };
    });
    pendingRef.current[key] = decision;
    schedule();
  }, [schedule, userEmail]);

  const toJobInfo = (j: any): ScriptJobInfo | null => (j
    ? { id: j.id, tipo: j.tipo, status: j.status, attempts: j.attempts, progresso: j.progresso ?? null, error: j.error ?? null, created_at: j.created_at, started_at: j.started_at, finished_at: j.finished_at }
    : null);

  /** Fecha a ficha; o servidor enfileira o job `script` (1 ativo por clube) e devolve `job`. */
  const complete = useCallback(async (): Promise<{ ok: boolean; faltam?: string[]; message?: string; job?: ScriptJobInfo | null; existing?: boolean }> => {
    await flush();
    try {
      const res = await axios.post('/api/script/ficha/complete', {}, authHeaders(token));
      if (res.data?.success) {
        const job = toJobInfo(res.data.job);
        setData((prev) => (prev ? {
          ...prev,
          ficha_status: 'confirmada',
          reviewed_at: new Date().toISOString(),
          script: { ...(prev.script || { versoes: 0, ultima: null, aprovada: null, job: null }), job: job ?? prev.script?.job ?? null },
        } : prev));
        return { ok: true, job, existing: !!res.data.job?.existing };
      }
      return { ok: false, message: res.data?.message };
    } catch (e: any) {
      return { ok: false, faltam: e?.response?.data?.faltam, message: e?.response?.data?.message || e?.message };
    }
  }, [flush, token]);

  /** "Gerar do zero": job `script` so a partir da ficha (so com a ficha confirmada; 400 com `faltam` caso contrario). */
  const gerarScript = useCallback(async (): Promise<{ ok: boolean; job?: ScriptJobInfo | null; existing?: boolean; faltam?: string[]; message?: string }> => {
    try {
      const res = await axios.post('/api/script/ficha/gerar-script', {}, authHeaders(token));
      if (res.data?.success) {
        const job = toJobInfo(res.data.job);
        setData((prev) => (prev ? {
          ...prev,
          script: { ...(prev.script || { versoes: 0, ultima: null, aprovada: null, job: null }), job: job ?? prev.script?.job ?? null },
        } : prev));
        return { ok: true, job, existing: !!res.data.job?.existing };
      }
      return { ok: false, message: res.data?.message };
    } catch (e: any) {
      return { ok: false, faltam: e?.response?.data?.faltam, message: e?.response?.data?.message || e?.message };
    }
  }, [token]);

  /**
   * "Pedir nova versão": job `revisar` a partir da versao N e de TODOS os comentarios dela (1 ativo por clube, no mesmo
   * escopo do job `script`: se ja ha um ativo, o servidor devolve esse com `existing: true`). Atualiza `data.script.job`.
   */
  const pedirRevisao = useCallback(async (versao: number, pedido: string = ''): Promise<{ ok: boolean; job?: ScriptJobInfo | null; existing?: boolean; message?: string }> => {
    try {
      const res = await axios.post(`/api/script/versoes/${versao}/revisar`, pedido ? { pedido } : {}, authHeaders(token));
      if (res.data?.success) {
        const job = toJobInfo(res.data.job);
        setData((prev) => (prev ? {
          ...prev,
          script: { ...(prev.script || { versoes: 0, ultima: null, aprovada: null, job: null }), job: job ?? prev.script?.job ?? null },
        } : prev));
        return { ok: true, job, existing: !!res.data.job?.existing };
      }
      return { ok: false, message: res.data?.message };
    } catch (e: any) {
      return { ok: false, message: e?.response?.data?.errors?.join('; ') || e?.response?.data?.message || e?.message };
    }
  }, [token]);

  /** "Quero outra sugestão" para 1 campo: job `refinar` (1 ativo por clube + campo). Marca campo.refinando localmente. */
  const refinar = useCallback(async (key: string, pedido: string = ''): Promise<{ ok: boolean; job?: ScriptJobInfo | null; existing?: boolean; message?: string }> => {
    try {
      const res = await axios.post('/api/script/ficha/refinar', { field_key: key, pedido }, authHeaders(token));
      if (res.data?.success) {
        setData((prev) => (prev ? {
          ...prev,
          blocos: prev.blocos.map((b) => ({ ...b, campos: b.campos.map((c) => (c.key === key ? { ...c, refinando: true } : c)) })),
        } : prev));
        return { ok: true, job: toJobInfo(res.data.job), existing: !!res.data.job?.existing };
      }
      return { ok: false, message: res.data?.message };
    } catch (e: any) {
      return { ok: false, message: e?.response?.data?.message || e?.message };
    }
  }, [token]);

  /** Atualiza contexto_count de um campo (a tela de contexto chama depois de anexar/apagar). */
  const setContextoCount = useCallback((key: string, count: number) => {
    setData((prev) => (prev ? {
      ...prev,
      blocos: prev.blocos.map((b) => ({ ...b, campos: b.campos.map((c) => (c.key === key ? { ...c, contexto_count: count } : c)) })),
    } : prev));
  }, []);

  /** Salva so o que veio no patch (links, observacoes e/ou acessos) da propria pessoa; o resto e mantido no servidor. */
  const saveMaterials = useCallback(async (patch: ScriptMaterialsPatch): Promise<boolean> => {
    const previous = dataRef.current?.materials;
    const { resposta_ia, ...rest } = patch;
    const optimistic: Partial<ScriptMaterials> = { ...rest };
    if (typeof resposta_ia === 'string') {
      optimistic.resposta_ia = resposta_ia.trim() ? { texto: resposta_ia, salvo_em: new Date().toISOString(), resumo: '' } : null;
    }
    setData((prev) => (prev ? { ...prev, materials: { ...prev.materials, ...optimistic } } : prev));
    setSaveState('saving');
    try {
      const res = await axios.put('/api/script/ficha/materials', patch, authHeaders(token));
      if (res.data?.success && res.data.materials) {
        const m = res.data.materials as ScriptMaterials;
        setData((prev) => (prev ? { ...prev, materials: m } : prev));
      }
      setSaveState('saved');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2500);
      return true;
    } catch (e: any) {
      if (previous) setData((prev) => (prev ? { ...prev, materials: previous } : prev));
      setSaveState('error');
      setError(e?.response?.data?.errors?.join('; ') || e?.response?.data?.message || e?.message || 'Erro ao salvar os materiais');
      return false;
    }
  }, [token]);

  /** "Confirmar e ir para a ficha": marca o submit desta pessoa e enfileira o pre-preenchimento (1 job ativo por pessoa). */
  const submitMaterials = useCallback(async (opts: SubmitMaterialsOptions = {}): Promise<SubmitMaterialsResult> => {
    try {
      const body: SubmitMaterialsOptions = {};
      if (opts.notify_phone !== undefined) body.notify_phone = opts.notify_phone;
      if (opts.notify !== undefined) body.notify = opts.notify;
      const res = await axios.post('/api/script/ficha/materials/submit', body, authHeaders(token));
      if (res.data?.success) {
        const at = res.data.materials_submitted_at || new Date().toISOString();
        const job: ScriptJobInfo | null = toJobInfo(res.data.job);
        setData((prev) => (prev ? {
          ...prev,
          materials_status: 'submitted',
          materials_submitted_at: at,
          job: job ?? prev.job ?? null,
          materials: { ...prev.materials, submitted_at: at, ...(res.data.notify_phone ? { notify_phone: res.data.notify_phone } : {}) },
        } : prev));
        return { ok: true, existing: !!res.data.job?.existing, job };
      }
      return { ok: false, message: res.data?.message };
    } catch (e: any) {
      const message = e?.response?.data?.errors?.join('; ') || e?.response?.data?.message || e?.message || 'Erro ao enviar';
      setError(message);
      return { ok: false, message };
    }
  }, [token]);

  /** A tela avisa que o editor de um campo abriu/fechou (o merge do poll deixa esse campo em paz). */
  const setFieldEditing = useCallback((key: string, editing: boolean) => {
    if (editing) editingRef.current.add(key); else editingRef.current.delete(key);
  }, []);

  /**
   * Sincronizacao do pre-preenchimento em marcos (poll de 20 s): GET ficha e merge na local sem resetar o
   * campo atual nem um editor aberto (mergeFichaData). Decidido nao muda; vazio/sugerido recebe sugestao nova.
   * @returns true quando leu o servidor
   */
  const refreshMerge = useCallback(async (): Promise<boolean> => {
    if (!token || !enabled) return false;
    try {
      const res = await axios.get('/api/script/ficha', authHeaders(token));
      if (!(res.data?.success && res.data.data)) return false;
      const fresh = res.data.data as ScriptFichaData;
      setData((prev) => {
        if (!prev) return fresh;
        const skip = new Set<string>([...editingRef.current, ...Object.keys(pendingRef.current)]);
        for (const b of prev.blocos) for (const c of b.campos) if (!skip.has(c.key) && campoEmEdicaoNaTela(c.key, c.status)) skip.add(c.key);
        return mergeFichaData(prev, fresh, { skip }).data;
      });
      setServerEnabled(true);
      setError(null);
      setUltimaSincronia(Date.now());
      return true;
    } catch (e: any) {
      if (e?.response?.status === 403) setServerEnabled(false);
      return false;
    }
  }, [token, enabled]);

  /**
   * Complemento de um campo decidido (achado do worker em cima do texto do mentor):
   * incorporar = o servidor anexa ao valor atual (status editado) e devolve o campo; dispensar = apaga.
   */
  const complemento = useCallback(async (key: string, acao: 'incorporar' | 'dispensar'): Promise<{ ok: boolean; campo?: ScriptFieldView; message?: string }> => {
    await flush();
    try {
      const res = await axios.post(`/api/script/ficha/fields/${encodeURIComponent(key)}/complemento`, { acao }, authHeaders(token));
      if (res.data?.success && res.data.campo) {
        const campoNovo = res.data.campo as ScriptFieldView;
        setData((prev) => {
          if (!prev) return prev;
          const blocos = prev.blocos.map((b) => ({
            ...b,
            campos: b.campos.map((c) => (c.key === key
              ? { ...c, ...campoNovo, contexto_count: c.contexto_count, refinando: c.refinando, nova_sugestao: false }
              : c)),
          }));
          return { ...prev, ...recomputeView(blocos), ficha_status: res.data.ficha_status || prev.ficha_status };
        });
        return { ok: true, campo: campoNovo };
      }
      return { ok: false, message: res.data?.message };
    } catch (e: any) {
      return { ok: false, message: e?.response?.data?.message || e?.message };
    }
  }, [flush, token]);

  const setFiles = useCallback((files: ClubFile[]) => {
    setData((prev) => (prev ? { ...prev, files } : prev));
  }, []);

  const refreshFiles = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/script/materials/files', authHeaders(token));
      if (res.data?.success) setFiles(res.data.data || []);
    } catch { /* silencioso */ }
  }, [token, setFiles]);

  return {
    data,
    loading,
    loaded,
    enabled: enabled && serverEnabled !== false,
    error,
    saveState,
    decide,
    flush,
    flushKeepalive,
    complete,
    gerarScript,
    pedirRevisao,
    refinar,
    setContextoCount,
    saveMaterials,
    submitMaterials,
    setFiles,
    refreshFiles,
    refresh: load,
    refreshMerge,
    setFieldEditing,
    complemento,
    ultimaSincronia,
  };
};

export type UseScriptFicha = ReturnType<typeof useScriptFicha>;
