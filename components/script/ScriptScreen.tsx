import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Button } from '../ui/Button';
import type { UseScriptFicha, ScriptVersion, ScriptComment, ScriptJobInfo } from '../../hooks/useScriptFicha';
import { cleanScriptMarkdown, grifoEncontrado, parseScript, slugify, splitScript } from './script/parseScript';
import { ScriptPaper } from './script/ScriptPaper';
import { ScriptReader, type FichaResumo } from './script/ScriptReader';
import { TELA_CARTAO, TOTAL_TELAS, clampTela, ehTelaDePasso, guardarTela, lerTelaLembrada, telaDoPasso, type DocumentoId } from './script/telas';
import { useGrifos } from './grifos/useGrifos';
import { GrifoBubble } from './grifos/GrifoBubble';
import { GrifosPanel } from './grifos/GrifosPanel';
import { PedirComGrifosModal } from './grifos/PedirComGrifosModal';
import { capturarSelecao, limparPendente, limparPintura, localizarGrifo, pintarGrifos, pintarPendente, rolarParaRange, type Captura } from './grifos/anchor';
import { grifoParaComentario, resumoGrifos, type Grifo, type GrifoCor } from './grifos/types';

export { splitScript };

/**
 * "Seu script" (/dashboard/script): o script escrito pelo worker a partir da ficha confirmada.
 * Estado 1: sem versao -> aviso "está sendo escrito" + status do job `script`, se houver.
 * Estado 2: versao -> leitor em telas (components/script/script/ScriptReader.tsx): 0 Cartao de bolso (primeira coisa que
 * aparece num script novo; copiar e imprimir em A6) · 1 Sumario (para quem vende, quem conduz, promessa, 3 blocos, os 7
 * passos em uma linha, premissa REP, como usar) · 2..8 um passo por tela com abas Treinamento | Campo · 9 Preparacao e
 * metricas. Barra fixa com Anterior / Proximo e o mapa; setas do teclado; a tela fica lembrada por versao (localStorage);
 * a versao nova abre na mesma tela. Ctrl+P imprime o script inteiro (ScriptPaper escondido, so na impressao).
 * Grifos (components/script/grifos/*): selecionar texto -> balao "Grifar" (dourado ajustar, verde manter, vermelho tirar,
 * nota opcional); painel "Seus grifos" ao lado (desktop) ou em folha (celular); "Pedir nova versao com os grifos" converte
 * cada grifo em comentario da revisao ("[GRIFO ajustar] «trecho» → nota") e chama POST /api/script/versoes/:v/revisar.
 * Comentarios por passo continuam (recolhidos em cada tela de passo; o geral fica no sumario). Acoes: Baixar (.md),
 * Imprimir ou salvar em PDF, Aprovar, Pedir nova versao, Gerar do zero. Classes .script-* e a folha de impressao vivem em styles/globals.css.
 */

interface ScriptScreenProps {
  ficha: UseScriptFicha;
  token: string;
  onNavigate?: (id: string) => void;
  /** Intervalo da consulta enquanto ha versao sendo escrita (ms); os testes encurtam. */
  pollMs?: number;
}

function jobStatusLabel(job: ScriptJobInfo | null | undefined): string | null {
  if (!job) return null;
  switch (job.status) {
    case 'queued': return 'Na fila para ser escrito.';
    case 'running': return 'Sendo escrito agora.';
    case 'needs_human': return 'Nossa equipe está conferindo. Você não precisa fazer nada.';
    case 'error': return 'Deu um erro na escrita. Nossa equipe já foi avisada. Se quiser, peça uma nova versão.';
    case 'done': return null;
    default: return null;
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** E-mail de quem esta logado, lido do token (campo `user`), para saber quais grifos sao meus. */
export function emailDoToken(token: string): string | null {
  try {
    const parte = token.split('.')[1];
    if (!parte) return null;
    const b64 = parte.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
    const payload = JSON.parse(decodeURIComponent(Array.from(json, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
    return typeof payload?.user === 'string' ? payload.user.toLowerCase() : null;
  } catch {
    return null;
  }
}

const GRIFO_RE = /^\[GRIFO (ajustar|manter|tirar)\]\s/;

export const ScriptScreen: React.FC<ScriptScreenProps> = ({ ficha, token, onNavigate, pollMs = 20000 }) => {
  const [versoes, setVersoes] = useState<ScriptVersion[] | null>(null);
  const [job, setJob] = useState<ScriptJobInfo | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [versao, setVersao] = useState<ScriptVersion | null>(null);
  const [comentarios, setComentarios] = useState<ScriptComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [sending, setSending] = useState<number | null>(null);
  const [aprovando, setAprovando] = useState(false);
  const [pedindo, setPedindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [docAtivo, setDocAtivo] = useState<DocumentoId>('treinamento');
  // leitor em telas
  const [tela, setTelaState] = useState<number>(TELA_CARTAO);
  // grifos
  const [captura, setCaptura] = useState<Captura | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [painelAberto, setPainelAberto] = useState(false);
  const [modalGrifos, setModalGrifos] = useState(false);
  const [encontradosDom, setEncontradosDom] = useState<Set<string>>(() => new Set());
  const readerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const telaRef = useRef(tela);
  telaRef.current = tela;
  const primeiraAberturaRef = useRef(true);
  const maxConhecidoRef = useRef<number | null>(null);
  const focoRoladoRef = useRef<string | null>(null);

  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const meuEmail = useMemo(() => emailDoToken(token), [token]);
  const clubSlug = ficha.data?.club.slug || '';
  const clubNome = ficha.data?.club.nome || 'Prosperus Exclusive';
  const grifosApi = useGrifos(token, versao?.versao ?? null);
  const { grifos, pendentes } = grifosApi;

  const loadList = useCallback(async () => {
    try {
      const res = await axios.get('/api/script/versoes', headers);
      if (res.data?.success) {
        const list: ScriptVersion[] = res.data.versoes || [];
        const max = list.length ? Math.max(...list.map((v) => v.versao)) : null;
        const nova = maxConhecidoRef.current != null && max != null && max > maxConhecidoRef.current;
        maxConhecidoRef.current = max;
        setVersoes(list);
        setJob(res.data.job || null);
        setError(null);
        if (nova && max != null) {
          setSelected(max);
          setAviso(`Nova versão pronta: v${max}. Ela abre na mesma tela em que você estava.`);
        } else {
          setSelected((prev) => (prev && list.some((v) => v.versao === prev) ? prev : (list[0]?.versao ?? null)));
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Não deu para carregar o script. Tente de novo.');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const loadVersao = useCallback(async (n: number) => {
    try {
      const res = await axios.get(`/api/script/versoes/${n}`, headers);
      if (res.data?.success) {
        setVersao(res.data.versao);
        setComentarios(res.data.comentarios || []);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Não deu para abrir esta versão. Tente de novo.');
    }
  }, [headers]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (selected != null) loadVersao(selected); }, [selected, loadVersao]);

  // Enquanto o job esta na fila/rodando (sem versao ou escrevendo a proxima), consulta de novo a cada 20 s
  const scriptJobAtivo = !!job && (job.status === 'queued' || job.status === 'running');
  useEffect(() => {
    if (!scriptJobAtivo) return;
    const t = setInterval(loadList, pollMs);
    return () => clearInterval(t);
  }, [scriptJobAtivo, loadList, pollMs]);

  const parsed = useMemo(() => (versao?.content_md ? parseScript(versao.content_md) : null), [versao?.content_md]);
  const multiplos = !!parsed && parsed.documentos.length > 1;
  const temPassos = parsed ? parsed.documentos.some((d) => d.passos.length > 0) : false;

  // Tela lembrada por versao: script novo abre no cartao; trocar de versao na mesma sessao mantem a tela
  useEffect(() => {
    if (!versao) return;
    const lembrada = lerTelaLembrada(clubSlug, versao.versao);
    const proxima = lembrada ?? (primeiraAberturaRef.current ? TELA_CARTAO : telaRef.current);
    primeiraAberturaRef.current = false;
    setTelaState(clampTela(proxima));
    setFoco(null);
    setCaptura(null);
  }, [versao?.versao, clubSlug]);
  useEffect(() => {
    if (versao) guardarTela(clubSlug, versao.versao, tela);
  }, [tela, versao?.versao, clubSlug]);

  const irPara = useCallback((t: number) => {
    setTelaState(clampTela(Math.max(0, Math.min(TOTAL_TELAS - 1, t))));
    setCaptura(null);
  }, []);

  // Setas do teclado (desktop), fora de campos de texto e sem balao/modal aberto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc fecha o balao "Grifar" (e apaga a marca pendente do trecho)
      if (captura && !modalGrifos && e.key === 'Escape') { e.preventDefault(); setCaptura(null); return; }
      if (modalGrifos || captura || !parsed) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); irPara(telaRef.current + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); irPara(telaRef.current - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalGrifos, captura, parsed, irPara]);

  // Selecao de texto -> balao "Grifar" (mouse: ao soltar; toque: selectionchange com atraso)
  useEffect(() => {
    if (!parsed || typeof document === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let arrastando = false;
    const ler = () => {
      const root = readerRef.current;
      if (!root) return;
      const c = capturarSelecao(root, window.getSelection ? window.getSelection() : null);
      // selecao recolhida (toque no balao, foco na nota, celular) devolve null e NAO derruba a captura: o trecho fica pintado
      // como pendente e o balao aberto. So pointerdown fora do balao, Esc, "Cancelar" ou salvar fecham.
      if (!c) return;
      // a mesma selecao lida de novo nao vira uma captura nova (o balao nao perde a cor e a nota ja escolhidas)
      setCaptura((prev) => (prev && prev.texto === c.texto && prev.tela === c.tela && prev.documento === c.documento ? prev : c));
    };
    const onSel = () => {
      if (arrastando) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(ler, 250);
    };
    const onDown = (e: PointerEvent) => {
      arrastando = e.pointerType === 'mouse';
      const alvo = e.target as Element | null;
      if (alvo && typeof alvo.closest === 'function' && alvo.closest('[data-testid="grifo-balao"]')) return;
      setCaptura(null);
      setFoco(null);
    };
    const onUp = () => {
      if (!arrastando) return;
      arrastando = false;
      setTimeout(ler, 0);
    };
    document.addEventListener('selectionchange', onSel);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', onUp);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('selectionchange', onSel);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
    };
  }, [parsed]);

  // Grifos desta tela pintados no texto (CSS Custom Highlight API); "ir para" rola ate o trecho em foco
  const grifosDaTela = useMemo(
    () => grifos.filter((g) => g.passo === tela && (!ehTelaDePasso(tela) || !multiplos || g.documento === docAtivo)),
    [grifos, tela, multiplos, docAtivo]
  );
  useEffect(() => {
    const root = readerRef.current;
    if (!root || !parsed) { limparPintura(); return; }
    const enc = pintarGrifos(root, grifosDaTela, foco);
    setEncontradosDom(new Set(enc.keys()));
    if (foco && enc.has(foco) && focoRoladoRef.current !== foco) {
      focoRoladoRef.current = foco;
      rolarParaRange(enc.get(foco)!);
    }
    return () => limparPintura();
  }, [grifosDaTela, parsed, foco, tela, docAtivo]);

  // Trecho capturado (balao "Grifar" aberto) com marca propria (`script-grifo-pendente`): sobrevive a selecao nativa recolher.
  // Some quando o balao fecha (salvar, cancelar, Esc, toque fora) ou outra selecao substitui a captura. Sem Highlight API, so o balao.
  useEffect(() => {
    if (!captura) { limparPendente(); return; }
    const root = readerRef.current;
    const vivo = captura.range && !captura.range.collapsed ? captura.range : null;
    pintarPendente(vivo || (root ? localizarGrifo(root, captura) : null));
    return () => limparPendente();
  }, [captura]);

  const encontrado = useCallback((g: Grifo) => {
    if (!parsed) return false;
    const nestaTela = g.passo === tela && (!ehTelaDePasso(tela) || !multiplos || g.documento === docAtivo);
    if (nestaTela) return encontradosDom.has(g.id);
    return grifoEncontrado(parsed, g.passo, g.documento, g.texto);
  }, [parsed, tela, multiplos, docAtivo, encontradosDom]);

  const marcadas = useMemo(() => {
    const s = new Set<number>();
    for (const g of pendentes) s.add(clampTela(g.passo));
    for (const c of comentarios) s.add(telaDoPasso(c.passo));
    return s;
  }, [pendentes, comentarios]);

  const fichaResumo = useMemo<FichaResumo | undefined>(() => {
    const blocos = ficha.data?.blocos;
    if (!blocos) return undefined;
    const valor = (key: string) => {
      for (const b of blocos) { const c = b.campos.find((x) => x.key === key); if (c) return (c.valor_efetivo || '').trim(); }
      return '';
    };
    return { oferta: valor('1.1'), promessa: valor('5.1'), quemConduz: valor('6.2'), paraQuem: valor('3.1') };
  }, [ficha.data?.blocos]);

  const refFor = useCallback((key: string) => (el: HTMLElement | null) => { sectionRefs.current[key] = el; }, []);

  const download = () => {
    if (!versao?.content_md) return;
    const blob = new Blob([cleanScriptMarkdown(versao.content_md)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `script-${slugify(ficha.data?.club.nome || 'clube')}-v${versao.versao}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * "Imprimir ou salvar em PDF": abre a pagina de impressao (/dashboard/script/imprimir), fora do layout do Dashboard.
   * Imprimir de dentro do Dashboard cortava o PDF na primeira pagina (containers com overflow escondido e altura da janela).
   */
  const abrirImpressao = (docImpressao: 'treinamento' | 'campo' | 'ambos') => {
    if (typeof window === 'undefined' || !versao) return;
    const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
    const url = `${base}dashboard/script/imprimir?doc=${docImpressao}&versao=${versao.versao}`;
    if (typeof window.open === 'function') {
      const aberta = window.open(url, '_blank', 'noopener');
      if (aberta) return;
    }
    window.location.assign(url);
  };

  /** Imprime so o cartao de bolso (A6): classe no body + @page temporario; a folha de impressao normal fica escondida. */
  const imprimirCartao = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.id = 'script-cartao-page';
    style.textContent = '@page { size: A6; margin: 8mm; }';
    document.head.appendChild(style);
    document.body.classList.add('script-print-cartao');
    let limpo = false;
    const limpar = () => {
      if (limpo) return;
      limpo = true;
      document.body.classList.remove('script-print-cartao');
      style.remove();
      window.removeEventListener('afterprint', limpar);
    };
    window.addEventListener('afterprint', limpar);
    window.print();
    setTimeout(limpar, 60000);
  };

  const enviarComentario = async (passo: number) => {
    const texto = (draft[passo] || '').trim();
    if (!texto || !versao) return;
    setSending(passo);
    try {
      const res = await axios.post(`/api/script/versoes/${versao.versao}/comentarios`, { passo, texto }, headers);
      if (res.data?.success && res.data.comentario) {
        setComentarios((prev) => [...prev, res.data.comentario]);
        setDraft((d) => ({ ...d, [passo]: '' }));
        setVersoes((prev) => (prev ? prev.map((v) => (v.versao === versao.versao ? { ...v, comentarios_count: (v.comentarios_count || 0) + 1 } : v)) : prev));
      }
    } catch (e: any) {
      setAviso(e?.response?.data?.errors?.join('; ') || e?.response?.data?.message || 'Não deu para enviar o comentário. Tente de novo.');
    } finally {
      setSending(null);
    }
  };

  const aprovar = async () => {
    if (!versao) return;
    if (typeof window !== 'undefined' && !window.confirm('Aprovar esta versão do script? Você continua podendo comentar e pedir outra versão.')) return;
    setAprovando(true);
    try {
      const res = await axios.post(`/api/script/versoes/${versao.versao}/aprovar`, {}, headers);
      if (res.data?.success) {
        setVersao((v) => (v ? { ...v, status: 'aprovado', aprovado_em: res.data.versao?.aprovado_em || new Date().toISOString() } : v));
        setVersoes((prev) => (prev ? prev.map((v) => (v.versao === versao.versao ? { ...v, status: 'aprovado' } : v)) : prev));
        setAviso('Script aprovado. Ele fica aqui para você baixar ou imprimir quando quiser.');
        ficha.refresh();
      }
    } catch (e: any) {
      setAviso(e?.response?.data?.message || 'Não deu para aprovar agora. Tente de novo.');
    } finally {
      setAprovando(false);
    }
  };

  /** "Gerar do zero" (e o pedido sem versao nenhuma): job `script`, so a partir da ficha. */
  const gerarDoZero = async () => {
    setPedindo(true);
    const r = await ficha.gerarScript();
    setPedindo(false);
    if (r.ok) {
      setJob(r.job || null);
      setAviso(r.existing ? 'Já tem uma versão nova sendo escrita. Você recebe um aviso no WhatsApp quando ficar pronta.' : 'Pedido feito. Você recebe um aviso no WhatsApp quando a nova versão ficar pronta.');
    } else {
      setAviso(r.message || 'Não deu para pedir agora. Tente de novo.');
    }
  };

  /** "Pedir nova versão": job `revisar` a partir da versao aberta e de todos os comentarios dela. */
  const pedirNova = async () => {
    if (!versao) return gerarDoZero();
    setPedindo(true);
    const r = await ficha.pedirRevisao(versao.versao);
    setPedindo(false);
    if (r.ok) {
      setJob(r.job || null);
      setAviso(r.existing
        ? 'Já tem uma versão nova sendo escrita. Você recebe um aviso no WhatsApp quando ficar pronta.'
        : 'Pedido feito: a próxima versão parte desta e dos seus comentários. Você recebe um aviso no WhatsApp quando ficar pronta.');
    } else {
      setAviso(r.message || 'Não deu para pedir agora. Tente de novo.');
    }
  };

  /** "Pedir nova versão com os grifos": cada grifo pendente vira um comentario da revisao, mais a orientacao geral. */
  const pedirComGrifos = async (orientacao: string) => {
    if (!versao) return;
    const lista = pendentes.map(grifoParaComentario);
    const r = await ficha.pedirRevisao(versao.versao, orientacao, { comentarios: lista });
    if (r.ok) {
      setJob(r.job || null);
      setModalGrifos(false);
      const resumo = resumoGrifos(pendentes);
      setAviso(r.existing
        ? 'Já tem uma versão nova sendo escrita. Você recebe um aviso no WhatsApp quando ficar pronta.'
        : `Pedido feito com ${resumo.total} ${resumo.total === 1 ? 'grifo' : 'grifos'}: a próxima versão parte desta. Você recebe um aviso no WhatsApp quando ficar pronta.`);
      await loadVersao(versao.versao);
    } else {
      setAviso(r.message || 'Não deu para pedir agora. Tente de novo.');
    }
  };

  const salvarGrifo = async (cor: GrifoCor, nota: string): Promise<boolean> => {
    if (!captura) return false;
    const r = await grifosApi.criar({
      passo: captura.tela,
      documento: captura.documento,
      texto: captura.texto,
      prefixo: captura.prefixo,
      sufixo: captura.sufixo,
      cor,
      nota,
    });
    if (r.ok) {
      setCaptura(null);
      if (typeof window !== 'undefined' && window.getSelection) window.getSelection()?.removeAllRanges();
      return true;
    }
    setAviso(r.message || 'Não deu para salvar o grifo. Tente de novo.');
    return false;
  };

  const irParaGrifo = (g: Grifo) => {
    focoRoladoRef.current = null;
    if (ehTelaDePasso(clampTela(g.passo)) && multiplos) setDocAtivo(g.documento);
    setTelaState(clampTela(g.passo));
    setFoco(g.id);
    setPainelAberto(false);
  };

  const comentariosDo = (passo: number) => comentarios.filter((c) => c.passo === passo);

  /** Caixa de comentario de um passo (0 = geral), recolhida. */
  const renderComentarios = (passo: number) => {
    const lista = comentariosDo(passo);
    const titulo = passo > 0 ? 'Comentar este passo' : 'Comentar o script como um todo';
    return (
      <details className="script-no-print script-comentarios mt-5" open={lista.length > 0 ? true : undefined}>
        <summary className="script-comentarios-titulo">
          {titulo}
          {lista.length > 0 && <span className="ml-2 text-prosperus-gold-dark">· {lista.length} {lista.length === 1 ? 'comentário' : 'comentários'}</span>}
        </summary>
        <div className="mt-3 rounded-xl border border-prosperus-navy-panel/15 bg-white/70 p-3 sm:p-4 space-y-3">
          {lista.length > 0 && (
            <ul className="space-y-2">
              {lista.map((c) => (
                <li key={c.id} className="text-sm text-prosperus-neutral-black">
                  <span className="font-semibold text-prosperus-navy-panel">{c.autor_nome || c.autor_email || 'Você'}</span>
                  <span className="text-[11px] text-prosperus-navy-panel/50 ml-2">{formatDate(c.created_at)}</span>
                  {GRIFO_RE.test(c.texto) && <span className="script-tag ml-2">grifo</span>}
                  <p className="whitespace-pre-line leading-relaxed">{c.texto}</p>
                </li>
              ))}
            </ul>
          )}
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.16em] text-prosperus-navy-panel/60 font-semibold">
              {passo > 0 ? `Comentar o passo ${passo}` : 'Comentário geral'}
            </span>
            <textarea
              value={draft[passo] || ''}
              onChange={(e) => setDraft((d) => ({ ...d, [passo]: e.target.value }))}
              rows={2}
              placeholder={passo > 0 ? 'O que mudar, cortar ou reforçar neste passo?' : 'O que achou do script como um todo?'}
              className="mt-1 w-full bg-white border border-prosperus-navy-panel/20 rounded-lg px-3 py-2 text-sm text-prosperus-neutral-black placeholder-prosperus-navy-panel/40 outline-none focus:border-prosperus-gold-dark min-h-[64px]"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => enviarComentario(passo)}
              disabled={!(draft[passo] || '').trim() || sending === passo}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-prosperus-navy-panel text-white text-xs font-semibold disabled:opacity-40 hover:bg-prosperus-navy-light transition"
            >
              {sending === passo ? 'Enviando...' : 'Enviar comentário'}
            </button>
          </div>
        </div>
      </details>
    );
  };

  // Estado 0: carregando / erro
  if (loading && versoes === null) {
    return <div className="animate-pulse h-40 bg-white/5 rounded-xl" />;
  }
  if (error && !versoes) {
    return (
      <div className="bg-prosperus-navy-mid border border-red-500/20 rounded-xl p-6 space-y-3">
        <p className="text-sm text-red-300">{error}</p>
        <Button variant="outline" size="md" onClick={loadList}>Tentar de novo</Button>
      </div>
    );
  }

  // Estado 1: ainda sem versao
  if (!versoes || versoes.length === 0) {
    const fichaConfirmada = ficha.data?.ficha_status === 'confirmada';
    const status = jobStatusLabel(job);
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="bg-prosperus-navy-mid border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-prosperus-gold-dark font-semibold">Seu script</p>
          {fichaConfirmada || job ? (
            <>
              <h2 className="font-serif text-2xl sm:text-3xl text-white leading-tight">Seu script está sendo escrito.</h2>
              <p className="text-sm text-white/70 leading-relaxed">Você recebe um aviso no WhatsApp quando ficar pronto. Ele aparece aqui, com os 7 passos, para ler, grifar, comentar, baixar ou imprimir.</p>
              {ficha.data?.confirmada_por === 'automatica' && (
                <p className="text-xs text-prosperus-gold-light/90" data-testid="nota-automatica">
                  Os seus materiais bastaram: a ficha foi preenchida por eles e o script já está a caminho. Se quiser conferir ou ajustar algo, a ficha continua aberta.
                </p>
              )}
              {status && (
                <p className="text-xs text-white/60 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${job?.status === 'running' ? 'bg-prosperus-gold-dark animate-pulse' : job?.status === 'queued' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                  {status}
                </p>
              )}
              {job?.status === 'error' && (
                <Button variant="outline" size="md" onClick={gerarDoZero} loading={pedindo} disabled={pedindo}>Pedir nova versão</Button>
              )}
              {!job && fichaConfirmada && (
                <Button variant="outline" size="md" onClick={gerarDoZero} loading={pedindo} disabled={pedindo}>Pedir o script agora</Button>
              )}
              {onNavigate && (
                <Button variant="link" size="md" className="!px-0" onClick={() => onNavigate('script_ficha')} data-testid="link-revisar-ficha">Revisar ficha</Button>
              )}
            </>
          ) : (
            <>
              <h2 className="font-serif text-2xl sm:text-3xl text-white leading-tight">O script nasce da ficha.</h2>
              <p className="text-sm text-white/70 leading-relaxed">Quando você fechar a Ficha do Script, a gente escreve o seu script de 7 passos e avisa no WhatsApp. Ele aparece aqui.</p>
              {onNavigate && <Button variant="primary" size="lg" onClick={() => onNavigate('script_ficha')}>Ir para a ficha</Button>}
            </>
          )}
          {aviso && <p className="text-xs text-prosperus-gold-light">{aviso}</p>}
        </div>
      </div>
    );
  }

  // Estado 2: versao presente
  const aprovado = versao?.status === 'aprovado';
  const totalPendentes = pendentes.length;

  const painel = parsed && (
    <GrifosPanel
      grifos={grifos}
      encontrado={encontrado}
      meuEmail={meuEmail}
      nomeDoPasso={(n) => { for (const d of parsed.documentos) { const p = d.passos.find((x) => x.n === n); if (p) return p.nome; } return ''; }}
      onIrPara={irParaGrifo}
      onEditarNota={async (g, nota) => { const r = await grifosApi.editar(g.id, { nota }); if (!r.ok) setAviso(r.message || null); return r.ok; }}
      onApagar={async (g) => { const r = await grifosApi.apagar(g.id); if (!r.ok) setAviso(r.message || null); return r.ok; }}
      onFechar={painelAberto ? () => setPainelAberto(false) : undefined}
    />
  );

  return (
    <div className="space-y-4 script-screen">
      {/* Cabecalho e acoes: pilula da versao (com a troca num menu), "O que mudou", Aprovar, Pedir nova versao e o menu "Mais" */}
      <div className="script-no-print flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-prosperus-gold-dark font-semibold">Seu script</p>
            <h2 className="font-serif text-2xl sm:text-3xl text-white leading-tight">
              Script v{versao?.versao ?? selected}
              {aprovado && <span className="ml-3 align-middle text-[11px] font-sans font-semibold px-2 py-0.5 rounded-full bg-green-600/20 text-green-400">aprovado</span>}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <details className="script-versao-menu">
                <summary className="script-versao-pilula" aria-label="Trocar a versão do script" data-testid="versao-pilula">
                  <span className="font-semibold text-prosperus-gold-light">v{versao?.versao ?? selected}</span>
                  {versao?.created_at && <span className="text-white/60">{formatDate(versao.created_at)}</span>}
                  {versoes.length > 1 && <span aria-hidden="true" className="text-white/50">&#x25BE;</span>}
                </summary>
                {versoes.length > 1 && (
                  <div className="script-versao-lista" role="menu" aria-label="Versões do script">
                    {versoes.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        role="menuitem"
                        className={`script-menu-item ${v.versao === selected ? 'script-menu-item-atual' : ''}`}
                        onClick={(e) => { setSelected(v.versao); e.currentTarget.closest('details')?.removeAttribute('open'); }}
                      >
                        <span>Versão {v.versao}{v.status === 'aprovado' ? ' · aprovada' : ''}</span>
                        <span className="text-xs text-white/50">{formatDate(v.created_at)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </details>
              {versao?.resumo && (
                <details className="script-mudou">
                  <summary>O que mudou nesta versão</summary>
                  <p className="script-mudou-texto">{versao.resumo}</p>
                </details>
              )}
            </div>
          </div>

          <div className="script-acoes">
            {!aprovado ? (
              <span className="script-acoes-primaria"><Button variant="primary" size="md" onClick={aprovar} loading={aprovando} disabled={aprovando || !versao}>Aprovar o script</Button></span>
            ) : (
              <span className="script-acoes-primaria inline-flex min-h-[44px] items-center justify-center rounded-lg border border-green-500/40 px-4 text-sm font-semibold text-green-300">
                Aprovado{versao?.aprovado_em ? ` em ${formatDate(versao.aprovado_em)}` : ''}
              </span>
            )}
            {totalPendentes > 0 && (
              <Button variant="primary" size="md" onClick={() => setModalGrifos(true)} disabled={pedindo || scriptJobAtivo || !versao} data-testid="pedir-com-grifos">
                {scriptJobAtivo ? 'Nova versão a caminho' : `Pedir nova versão com os grifos (${totalPendentes})`}
              </Button>
            )}
            <Button variant="secondary" size="md" onClick={pedirNova} loading={pedindo} disabled={pedindo || scriptJobAtivo || !versao}>
              {scriptJobAtivo ? 'Nova versão a caminho' : 'Pedir nova versão'}
            </Button>
            <details className="script-mais">
              <summary className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/20 px-4 text-sm font-semibold text-white/85 hover:bg-white/10" aria-label="Mais ações">
                Mais <span aria-hidden="true" className="text-white/50">&#x25BE;</span>
              </summary>
              <div className="script-mais-menu">
                <div role="group" aria-label="Imprimir ou salvar em PDF">
                  <span className="script-menu-rotulo">Imprimir ou salvar em PDF</span>
                  {multiplos ? (
                    <>
                      <button type="button" className="script-menu-item" onClick={() => abrirImpressao('treinamento')} disabled={!versao?.content_md} data-testid="pdf-treinamento">Treinamento</button>
                      <button type="button" className="script-menu-item" onClick={() => abrirImpressao('campo')} disabled={!versao?.content_md} data-testid="pdf-campo">Campo</button>
                      <button type="button" className="script-menu-item" onClick={() => abrirImpressao('ambos')} disabled={!versao?.content_md} data-testid="pdf-ambos">Os dois</button>
                    </>
                  ) : (
                    <button type="button" className="script-menu-item" onClick={() => abrirImpressao('ambos')} disabled={!versao?.content_md} data-testid="pdf-ambos">Imprimir o script</button>
                  )}
                </div>
                <div className="script-menu-sep" />
                <button type="button" className="script-menu-item" onClick={download} disabled={!versao?.content_md}>Baixar o texto</button>
                {onNavigate && (
                  <button type="button" className="script-menu-item" onClick={() => onNavigate('script_ficha')} data-testid="link-revisar-ficha">Revisar a ficha</button>
                )}
                <div className="script-menu-sep" />
                <button
                  type="button"
                  className="script-menu-item script-menu-item-perigo"
                  onClick={(e) => {
                    e.currentTarget.closest('details')?.removeAttribute('open');
                    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm('Escrever o script do zero? Isso ignora os grifos e os comentários desta versão e escreve de novo a partir da ficha.')) return;
                    gerarDoZero();
                  }}
                  disabled={pedindo || scriptJobAtivo}
                >
                  Escrever do zero
                </button>
                <button type="button" className="script-menu-item script-mais-fechar" onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}>Fechar</button>
              </div>
            </details>
            {parsed && (
              <Button variant="outline" size="md" className="lg:hidden" onClick={() => setPainelAberto(true)} aria-label="Abrir a lista de grifos">
                Grifos{grifos.length ? ` (${grifos.length})` : ''}
              </Button>
            )}
          </div>
        </div>
        {aviso && <p className="text-xs text-prosperus-gold-light">{aviso}</p>}
        {scriptJobAtivo && !aviso && (
          <p className="text-xs text-white/60 flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${job?.status === 'running' ? 'bg-prosperus-gold-dark animate-pulse' : 'bg-yellow-400'}`} />
            <span>
              {job?.tipo === 'revisar' ? 'Uma nova versão está sendo escrita a partir dos seus comentários e grifos.' : 'Uma nova versão está sendo escrita do zero, a partir da ficha.'}
              {' '}{jobStatusLabel(job)} Você recebe um aviso no WhatsApp quando ficar pronta.
            </span>
          </p>
        )}
        {!scriptJobAtivo && !aviso && (job?.status === 'error' || job?.status === 'needs_human') && (
          <p className="text-xs text-red-300">{jobStatusLabel(job)}</p>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,760px)_300px] lg:justify-center lg:gap-6 lg:items-start">
        <div className="min-w-0">
          {parsed && (
            <ScriptReader
              doc={parsed}
              clubNome={clubNome}
              tela={tela}
              onTela={irPara}
              documento={docAtivo}
              onDocumento={setDocAtivo}
              marcadas={marcadas}
              comentariosDo={renderComentarios}
              ficha={fichaResumo}
              onImprimirCartao={imprimirCartao}
              totalGrifos={grifos.length}
              onAbrirGrifos={() => setPainelAberto(true)}
              rootRef={readerRef}
            />
          )}
          {parsed && !temPassos && (
            <p className="script-no-print text-sm text-white/60 mt-3">Esta versão veio sem os passos numerados; o texto acima é o conteúdo como chegou.</p>
          )}
          {!parsed && <p className="text-sm text-white/60">Esta versão veio vazia. Peça uma nova versão.</p>}
        </div>

        {/* "Seus grifos": coluna no desktop */}
        {parsed && (
          <aside className="script-no-print hidden lg:block lg:sticky lg:top-4">
            {painel}
          </aside>
        )}
      </div>

      {/* "Seus grifos": folha no celular */}
      {parsed && painelAberto && (
        <div className="script-no-print lg:hidden script-grifos-folha-fundo" onClick={() => setPainelAberto(false)}>
          <div className="script-grifos-folha" onClick={(e) => e.stopPropagation()}>
            {painel}
          </div>
        </div>
      )}

      {/* Balao "Grifar" sobre a selecao */}
      {parsed && captura && (
        <GrifoBubble captura={captura} onSalvar={salvarGrifo} onCancelar={() => setCaptura(null)} erro={grifosApi.erro} />
      )}

      {parsed && (
        <PedirComGrifosModal
          isOpen={modalGrifos}
          grifos={pendentes}
          versao={versao?.versao ?? null}
          onClose={() => setModalGrifos(false)}
          onConfirmar={pedirComGrifos}
        />
      )}

      {/* Folha de impressao: o script inteiro nos dois documentos (so aparece no Ctrl+P) */}
      {parsed && (
        <div className="hidden print:block">
          <ScriptPaper
            doc={parsed}
            clubNome={clubNome}
            versao={versao?.versao ?? selected}
            escritoEm={formatDate(versao?.created_at)}
            aprovadoEm={aprovado ? formatDate(versao?.aprovado_em) : null}
            docAtivo={parsed.documentos[0]?.id || ''}
            refFor={refFor}
            comentariosDo={() => null}
          />
        </div>
      )}

      {/* Cartao de bolso para a impressao em A6 ("Imprimir cartão") */}
      {parsed && parsed.cartao && (
        <div id="script-cartao-print" className="hidden" aria-hidden="true">
          <div className="script-cartao-corpo" dangerouslySetInnerHTML={{ __html: parsed.cartao.html }} />
        </div>
      )}
    </div>
  );
};

export default ScriptScreen;
