/**
 * Contexto por pergunta da Ficha do Script: áudio, imagem, vídeo, link e nota que o mentor anexa
 * a um campo para a IA refazer a sugestão. Fala com /api/script/context e /api/script/ficha/refinar.
 * Auth: Bearer memberToken do localStorage, como o resto do app.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { ScriptFieldView } from '../data/script-ficha-fields';
import { textoVazio } from '../components/script/widgets/vazio';

export type ContextoTipo = 'audio' | 'imagem' | 'video' | 'link' | 'nota';

export interface ContextoItem {
  id: string;
  field_key: string;
  tipo: ContextoTipo;
  file_id: string | null;
  file_name: string | null;
  file_type: string | null;
  url: string | null;
  texto: string | null;
  legenda: string | null;
  transcricao: string | null;
  autor_email: string | null;
  autor_nome: string | null;
  created_at: string | null;
  download_url: string | null;
  /** Opcional: o servidor pode marcar os itens da própria pessoa. */
  mine?: boolean;
}

export interface NovoContexto {
  tipo: ContextoTipo;
  file?: File | Blob | null;
  fileName?: string;
  url?: string;
  texto?: string;
  legenda?: string;
}

export interface AdicionarResultado {
  ok: boolean;
  item?: ContextoItem;
  warning?: string;
  message?: string;
}

/** Campo da ficha com os dois campos novos do GET (contexto_count, refinando), sem mexer no tipo base. */
export type CampoComContexto = ScriptFieldView & { contexto_count?: number; refinando?: boolean };

export function campoRefinando(c: { refinando?: boolean } | null | undefined): boolean {
  return c?.refinando === true;
}

export function campoContextoCount(c: { contexto_count?: number } | null | undefined): number {
  const n = c?.contexto_count;
  return typeof n === 'number' && n > 0 ? n : 0;
}

/** Sugestão vazia de verdade ou só um marcador ("a definir" etc.). */
export function sugestaoVazia(sugerido: string | null | undefined): boolean {
  return textoVazio(sugerido);
}

export function memberToken(): string {
  try { return window.localStorage.getItem('memberToken') || ''; } catch { return ''; }
}

/** E-mail de quem está logado, lido do payload do JWT (campo `user`). Vazio quando não dá para ler. */
export function emailDoToken(token: string): string {
  try {
    const parte = token.split('.')[1];
    if (!parte) return '';
    const b64 = parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '=');
    const bin = atob(b64);
    const json = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    const payload = JSON.parse(json);
    const email = payload?.user || payload?.email || '';
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

export function itemEhMeu(item: ContextoItem, meuEmail: string): boolean {
  if (item.mine === true) return true;
  if (item.mine === false) return false;
  if (!meuEmail) return true; // sem como saber: mostra o botão, o servidor decide
  return (item.autor_email || '').trim().toLowerCase() === meuEmail;
}

function auth(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function mensagemDe(e: any, padrao: string): string {
  const errs = e?.response?.data?.errors;
  return e?.response?.data?.message || (Array.isArray(errs) ? errs.join('; ') : '') || e?.message || padrao;
}

const POLL_MS = 30000;
const REFINANDO_LOCAL_MAX_MS = 45000;

export interface UseContextoCampoOptions {
  /** Busca a lista ao montar mesmo sem contexto_count (padrão: só quando contexto_count > 0). */
  carregarAoMontar?: boolean;
  /** Recarrega a ficha (flush + GET) depois de pedir a revisão. Se faltar, o hook faz o GET sozinho para saber quando acabou. */
  onRecarregar?: () => Promise<void> | void;
}

export function useContextoCampo(campo: CampoComContexto, opts: UseContextoCampoOptions = {}) {
  const fieldKey = campo.key;
  const { onRecarregar } = opts;
  const [items, setItems] = useState<ContextoItem[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [refinandoLocal, setRefinandoLocal] = useState(false);

  const token = memberToken();
  const meuEmail = emailDoToken(token);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const carregar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/script/context', { ...auth(token), params: { field: fieldKey } });
      const lista = res.data?.items ?? res.data?.data?.items ?? [];
      if (alive.current) { setItems(Array.isArray(lista) ? lista : []); setCarregado(true); setErro(null); }
    } catch (e: any) {
      if (alive.current) setErro(mensagemDe(e, 'Não foi possível carregar o contexto.'));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [token, fieldKey]);

  // Carrega ao montar só quando já existe contexto (evita dezenas de GETs no "Ver tudo")
  const countInicial = campoContextoCount(campo);
  useEffect(() => {
    setItems([]); setCarregado(false); setRefinandoLocal(false);
    if (opts.carregarAoMontar || countInicial > 0) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldKey]);

  const adicionar = useCallback(async (novo: NovoContexto): Promise<AdicionarResultado> => {
    if (!token) return { ok: false, message: 'Sessão expirada. Entre de novo.' };
    setEnviando(true); setErro(null); setAviso(null);
    try {
      const fd = new FormData();
      fd.append('field_key', fieldKey);
      fd.append('tipo', novo.tipo);
      if (novo.file) fd.append('file', novo.file, novo.fileName || (novo.file as File).name || `${novo.tipo}-${Date.now()}`);
      if (novo.url) fd.append('url', novo.url.trim());
      if (novo.texto) fd.append('texto', novo.texto.trim());
      if (novo.legenda) fd.append('legenda', novo.legenda.trim());
      const res = await axios.post('/api/script/context', fd, { ...auth(token), timeout: 120000 });
      const item: ContextoItem | undefined = res.data?.item ?? res.data?.data?.item;
      const warning: string | undefined = res.data?.warning;
      if (item && alive.current) {
        setItems((prev) => [...prev.filter((x) => x.id !== item.id), item]);
        setCarregado(true);
      }
      if (warning && alive.current) setAviso(warning);
      return { ok: true, item, warning };
    } catch (e: any) {
      const message = mensagemDe(e, 'Não foi possível salvar o contexto.');
      if (alive.current) setErro(message);
      return { ok: false, message };
    } finally {
      if (alive.current) setEnviando(false);
    }
  }, [token, fieldKey]);

  const remover = useCallback(async (id: string): Promise<boolean> => {
    if (!token) return false;
    setRemovendo(id); setErro(null);
    try {
      await axios.delete(`/api/script/context/${encodeURIComponent(id)}`, auth(token));
      if (alive.current) setItems((prev) => prev.filter((x) => x.id !== id));
      return true;
    } catch (e: any) {
      if (alive.current) setErro(mensagemDe(e, 'Não foi possível excluir.'));
      return false;
    } finally {
      if (alive.current) setRemovendo(null);
    }
  }, [token]);

  const pedirSugestao = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (!token) return { ok: false, message: 'Sessão expirada. Entre de novo.' };
    setPedindo(true); setErro(null);
    try {
      await axios.post('/api/script/ficha/refinar', { field_key: fieldKey }, auth(token));
      if (alive.current) setRefinandoLocal(true);
      try { await onRecarregar?.(); } catch { /* a ficha recarrega no próximo ciclo */ }
      return { ok: true };
    } catch (e: any) {
      const message = mensagemDe(e, 'Não foi possível pedir a revisão agora.');
      if (alive.current) setErro(message);
      return { ok: false, message };
    } finally {
      if (alive.current) setPedindo(false);
    }
  }, [token, fieldKey, onRecarregar]);

  // Assim que o servidor confirma "refinando", o flag local sai de cena; se nunca confirmar, cai sozinho
  const refinandoServidor = campoRefinando(campo);
  useEffect(() => { if (refinandoServidor) setRefinandoLocal(false); }, [refinandoServidor]);
  useEffect(() => {
    if (!refinandoLocal) return;
    const t = setTimeout(() => setRefinandoLocal(false), REFINANDO_LOCAL_MAX_MS);
    return () => clearTimeout(t);
  }, [refinandoLocal]);

  // Sem função de recarga da ficha: o hook mesmo consulta a ficha a cada 30 s até a revisão terminar
  useEffect(() => {
    if (onRecarregar || !token || !(refinandoServidor || refinandoLocal)) return;
    const t = setInterval(async () => {
      try {
        const res = await axios.get('/api/script/ficha', auth(token));
        const blocos: any[] = res.data?.data?.blocos || [];
        const c = blocos.flatMap((b) => b.campos || []).find((x: any) => x?.key === fieldKey);
        if (c && !c.refinando && alive.current) setRefinandoLocal(false);
      } catch { /* tenta de novo no próximo ciclo */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [onRecarregar, token, fieldKey, refinandoServidor, refinandoLocal]);

  const refinando = refinandoServidor || refinandoLocal;
  const total = carregado ? items.length : Math.max(items.length, countInicial);

  return {
    items,
    total,
    carregado,
    loading,
    enviando,
    removendo,
    pedindo,
    refinando,
    erro,
    aviso,
    meuEmail,
    carregar,
    adicionar,
    remover,
    pedirSugestao,
    limparAviso: () => { setAviso(null); setErro(null); },
  };
}

export type UseContextoCampo = ReturnType<typeof useContextoCampo>;
