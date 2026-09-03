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

/** Materiais da PROPRIA pessoa (links, observacoes, acessos). Socios nao veem uns aos outros. */
export interface ScriptMaterials {
  links: MaterialLink[];
  observacoes: string;
  acessos: MaterialAcesso[];
  submitted_at: string | null;
}

export type ScriptMaterialsPatch = Partial<Pick<ScriptMaterials, 'links' | 'observacoes' | 'acessos'>>;

export interface ScriptConfig {
  prazo_materiais: string;
}

export interface ScriptFichaData {
  club: { slug: string; nome: string };
  ficha_status: FichaStatus;
  /** Por pessoa: "submitted" quando ESTE membro clicou em "Enviei o que tinha". */
  materials_status: MaterialsStatus;
  materials_submitted_at: string | null;
  materials: ScriptMaterials;
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

export const useScriptFicha = (token: string, enabled: boolean, userEmail: string = '') => {
  const [data, setData] = useState<ScriptFichaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const pendingRef = useRef<Record<string, FieldDecision>>({});
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
        campos: b.campos.map((c) => (c.key === key ? applyDecisionLocal(c, decision, userEmail) : c)),
      }));
      const rec = recomputeView(blocos);
      const ficha_status: FichaStatus = prev.ficha_status === 'vazia' || prev.ficha_status === 'pre_preenchida' || prev.ficha_status === 'confirmada'
        ? 'em_revisao' : prev.ficha_status;
      return { ...prev, ...rec, ficha_status };
    });
    pendingRef.current[key] = decision;
    schedule();
  }, [schedule, userEmail]);

  const complete = useCallback(async (): Promise<{ ok: boolean; faltam?: string[]; message?: string }> => {
    await flush();
    try {
      const res = await axios.post('/api/script/ficha/complete', {}, authHeaders(token));
      if (res.data?.success) {
        setData((prev) => (prev ? { ...prev, ficha_status: 'confirmada', reviewed_at: new Date().toISOString() } : prev));
        return { ok: true };
      }
      return { ok: false, message: res.data?.message };
    } catch (e: any) {
      return { ok: false, faltam: e?.response?.data?.faltam, message: e?.response?.data?.message || e?.message };
    }
  }, [flush, token]);

  /** Salva so o que veio no patch (links, observacoes e/ou acessos) da propria pessoa; o resto e mantido no servidor. */
  const saveMaterials = useCallback(async (patch: ScriptMaterialsPatch): Promise<boolean> => {
    const previous = dataRef.current?.materials;
    setData((prev) => (prev ? { ...prev, materials: { ...prev.materials, ...patch } } : prev));
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

  const submitMaterials = useCallback(async (): Promise<boolean> => {
    try {
      const res = await axios.post('/api/script/ficha/materials/submit', {}, authHeaders(token));
      if (res.data?.success) {
        const at = res.data.materials_submitted_at || new Date().toISOString();
        setData((prev) => (prev ? { ...prev, materials_status: 'submitted', materials_submitted_at: at, materials: { ...prev.materials, submitted_at: at } } : prev));
        return true;
      }
      return false;
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Erro ao enviar');
      return false;
    }
  }, [token]);

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
    saveMaterials,
    submitMaterials,
    setFiles,
    refreshFiles,
    refresh: load,
  };
};

export type UseScriptFicha = ReturnType<typeof useScriptFicha>;
