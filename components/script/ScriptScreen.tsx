import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toPng } from 'html-to-image';
import { Button } from '../ui/Button';
import type { UseScriptFicha, ScriptVersion, ScriptComment, ScriptJobInfo, ScriptSummary } from '../../hooks/useScriptFicha';
import { AvisoModoAutomatico } from './AvisoModoAutomatico';
import { EtaEspera } from './EtaEspera';
import { cleanScriptMarkdown, grifoEncontrado, parseScript, slugify, splitScript } from './script/parseScript';
import { ScriptPaper } from './script/ScriptPaper';
import { ScriptReader, COPY_AJUSTES_USADOS, type AjustesInfo, type ApresentacaoCartao, type ConectorCartao, type FichaResumo } from './script/ScriptReader';
import { PreparacaoCartao, ID_PREPARACAO_EXPORT } from './script/secoes';
import { ConfirmarApresentacaoModal, type EtapaApresentacao } from './script/ConfirmarApresentacaoModal';
import {
  NAV_INICIO, NAV_PREPARACAO, TOTAL_NAV, clampNav, conteudoDaNav, navDoConteudo,
  ehTelaDePasso, guardarTela, lerTelaLembrada, telaDoPasso, type DocumentoId,
} from './script/telas';
import { chaveTarefa } from './script/tarefas';
import { EVENTO_FOLHA } from './script/secoes/ModalSecao';
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
 * Estado 2: versao -> barra de cima + leitor em telas (components/script/script/ScriptReader.tsx): 0 Inicio
 * (a introducao com o sumario na mesma tela, a primeira coisa que aparece num script novo) · 1..7 um passo por
 * tela · 8 Preparacao e metricas.
 *
 * Onda E4 (07/09): a tela de Inicio, o rodape de navegacao no fim de cada tela (dentro do leitor), a confirmacao
 * em duas etapas do "Gerar apresentação" (ConfirmarApresentacaoModal) e a rodada unica de ajustes (o servidor conta
 * os pedidos de revisao do clube e manda `ajustes_usados`/`ajustes_limite` na ficha). O `tela` daqui e o indice de
 * NAVEGACAO; o `passo` de grifos e comentarios continua na coordenada de CONTEUDO (telas.ts explica as duas).
 *
 * Barra de cima (onda E1, SPEC-workflow-v3-decisoes-07-09 §2, itens 2, 4 e 8):
 *   esquerda -> pilula da versao (com a troca de versao) e "O que mudou" (folha/popover com o resumo);
 *   direita  -> "Baixar" (cartao em imagem, os PDFs, o texto .md e a apresentacao quando existe) e a chave
 *               Treinamento | Campo, na mesma altura e hierarquia do "Baixar".
 * A chave Treinamento | Campo e GLOBAL: vale para o leitor inteiro, fica lembrada na sessao (sessionStorage) e
 * nao existe mais dentro do passo. "Aprovar o script", "Pedir nova versão com os grifos" e "Gerar apresentação"
 * sairam do topo e viraram o bloco "Ações", no fim do leitor (depois do Passo 7 e da Preparacao). Na onda E4
 * "Pedir nova versão" e "Escrever do zero" sairam do leitor: a versao nova so nasce dos grifos e dos comentarios.
 * "Revisar a ficha" e "Aprofundar para o completo" saem daqui: quem leva ate elas e o menu do Dashboard (Ficha).
 *
 * Setas do teclado; a tela fica lembrada por versao (localStorage); a versao nova abre na mesma tela. Ctrl+P imprime
 * o script inteiro (ScriptPaper escondido, so na impressao).
 * Grifos (components/script/grifos/*): selecionar texto -> balao "Grifar" (dourado ajustar, verde manter, vermelho tirar,
 * nota opcional); a lista "Seus grifos" abre so pela pastilha flutuante, em qualquer tamanho: gaveta a direita no
 * desktop (lg+) e folha de baixo no celular, as duas com o mesmo GrifosPanel; "Pedir nova versao com os grifos"
 * converte cada grifo em comentario da revisao ("[GRIFO ajustar] «trecho» → nota") e chama
 * POST /api/script/versoes/:v/revisar. Comentarios por passo continuam (recolhidos em cada tela de passo; o geral
 * fica na tela de Inicio). Classes .script-* e a folha de impressao vivem em styles/globals.css.
 * Movimentos: cada tela de passo traz o script, a tabela de perfis quando o markdown tem a secao, as tarefas com
 * checkbox e, no fim, os treinamentos recomendados (ocultos na vista Campo). Esta tela e quem guarda o estado das
 * tarefas: le em GET /api/script/versoes/:v/tarefas quando a versao abre, marca na hora (otimista) e grava em
 * PUT .../tarefas/:passo/:tarefa_id; recusa do servidor volta o checkbox e avisa. Nada no localStorage: a marcacao
 * e por pessoa e por versao, no banco (tabela script_tarefas).
 * Apresentacao comercial: a versao traz `entregaveis` (arquivos ja publicados pelo worker) e `slides_job` (pedido na
 * fila). Com arquivo -> baixar o PPTX (e ver o PDF / as notas no bloco "Ações"); na fila -> "Apresentação sendo
 * montada"; sem nada -> "Gerar apresentação" (POST /api/script/versoes/:versao/slides). Aprovar ja pede a apresentacao.
 * Conector de IA: quando a versao traz o entregavel `conector`, o bloco "Ações" ganha o cartao "Seu conector"
 * com a pagina de instalacao (meta.pagina) e o arquivo instalacao.md. Clube sem esse entregavel nao ve nada.
 * "Baixar a preparação" (onda J, item 23): a Preparacao vira PNG (html-to-image, 2x, fundo creme e texto navy) a
 * partir do proprio cartao (#script-preparacao-export). Fora da tela de Preparacao o cartao fica montado
 * escondido, entao o download funciona de qualquer tela; nunca ha dois nos com o mesmo id.
 * O cartao de bolso deixou de ter tela e deixou de ser baixavel; o texto dele continua no `.md`.
 *
 * Onda J (itens 7 e 24): a chave Treinamento | Campo virou uma barra de duas opcoes em LARGURA CHEIA, logo acima
 * do leitor (o seletor pequeno do canto saiu); a lista de grifos perdeu a coluna fixa do desktop e abre pela
 * pastilha flutuante nos dois tamanhos, como gaveta a direita (lg+) ou folha de baixo (celular).
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

/**
 * Apresentacao comercial da versao (entregavel `slides`, publicado pelo worker): a versao ja vem com
 * `entregaveis` e `slides_job` de GET /api/script/versoes (e de /:versao), sem chamada a mais.
 */
interface EntregavelArquivo { campo: string; nome: string; bytes: number; url: string }
/** `meta` e livre por tipo; o `conector` grava { url, pagina, tools, atualizado_em, refresh }. */
interface EntregavelMeta { url?: string; pagina?: string; tools?: number; atualizado_em?: string; refresh?: unknown; [k: string]: unknown }
interface Entregavel { tipo: string; versao: number; created_at: string; meta?: EntregavelMeta | null; arquivos: EntregavelArquivo[] }
type VersaoComEntregaveis = ScriptVersion & { entregaveis?: Entregavel[]; slides_job?: ScriptJobInfo | null };

/** Os outros arquivos da apresentacao, no bloco "Ações" (o PPTX tem botao proprio). */
const SLIDES_OUTROS: Array<{ campo: string; rotulo: string; inline: boolean }> = [
  { campo: 'pdf', rotulo: 'Ver em PDF', inline: true },
  { campo: 'notas', rotulo: 'Notas do apresentador', inline: false },
];

/**
 * Rodada de ajustes (onda E4): o servidor manda quantas o clube ja usou e qual e o teto (`cohort_config`).
 * Sem os campos (servidor antigo), o teto e 1.
 */
interface ScriptAjustes { ajustes_usados?: number; ajustes_limite?: number }
const AJUSTES_LIMITE_PADRAO = 1;

/** Chave da vista Treinamento | Campo lembrada na sessao (a escolha vale para o leitor inteiro). */
const MODO_SESSAO = 'script-aba';

function lerModoDaSessao(): DocumentoId | null {
  try {
    const v = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(MODO_SESSAO);
    return v === 'campo' || v === 'treinamento' ? v : null;
  } catch { return null; }
}

function guardarModoNaSessao(modo: DocumentoId): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(MODO_SESSAO, modo);
  } catch { /* sem armazenamento */ }
}

const IconeBaixar: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
  </svg>
);

export const ScriptScreen: React.FC<ScriptScreenProps> = ({ ficha, token, onNavigate, pollMs = 20000 }) => {
  const [versoes, setVersoes] = useState<VersaoComEntregaveis[] | null>(null);
  const [job, setJob] = useState<ScriptJobInfo | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [versao, setVersao] = useState<VersaoComEntregaveis | null>(null);
  // Job `slides` que ESTA tela acabou de pedir (o servidor so devolve na proxima consulta)
  const [slidesJobs, setSlidesJobs] = useState<Record<number, ScriptJobInfo | null>>({});
  const [comentarios, setComentarios] = useState<ScriptComment[]>([]);
  // Tarefas dos movimentos ja concluidas por esta pessoa nesta versao (chave `passo:tarefa_id`)
  const [tarefas, setTarefas] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [sending, setSending] = useState<number | null>(null);
  const [aprovando, setAprovando] = useState(false);
  const [pedindo, setPedindo] = useState(false);
  const [gerandoSlides, setGerandoSlides] = useState(false);
  // "Gerar apresentação" em duas etapas (onda E4): 'aviso' -> 'confirmar' -> POST
  const [etapaSlides, setEtapaSlides] = useState<EtapaApresentacao | null>(null);
  // Rodada de ajustes gasta nesta sessão (o servidor manda o total em `script.ajustes_usados`)
  const [pediAjuste, setPediAjuste] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Vista Treinamento | Campo: global (a barra de cima manda) e lembrada na sessao
  const [docAtivo, setDocAtivo] = useState<DocumentoId>(() => lerModoDaSessao() || 'treinamento');
  // leitor em telas (indice de NAVEGACAO: 0 Inicio, 1..7 Passos, 8 Preparacao)
  const [tela, setTelaState] = useState<number>(NAV_INICIO);
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
  // A ficha traz `ajustes_usados` e `ajustes_limite` dentro de `script` (onda E4)
  const resumoScript = ficha.data?.script as (ScriptSummary & ScriptAjustes) | undefined;
  const grifosApi = useGrifos(token, versao?.versao ?? null);
  const { grifos, pendentes } = grifosApi;

  const loadList = useCallback(async () => {
    try {
      const res = await axios.get('/api/script/versoes', headers);
      if (res.data?.success) {
        const list: VersaoComEntregaveis[] = res.data.versoes || [];
        const max = list.length ? Math.max(...list.map((v) => v.versao)) : null;
        const nova = maxConhecidoRef.current != null && max != null && max > maxConhecidoRef.current;
        maxConhecidoRef.current = max;
        setVersoes(list);
        setJob(res.data.job || null);
        setError(null);
        // o servidor ja sabe da apresentacao (pedida ou pronta): o estado local desta tela sai de cena
        setSlidesJobs((prev) => {
          const next = { ...prev };
          for (const v of list) {
            if (v.slides_job || (v.entregaveis || []).some((e) => e.tipo === 'slides')) delete next[v.versao];
          }
          return next;
        });
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

  /**
   * Tarefas dos movimentos (onda C): o que ESTA pessoa ja marcou nesta versao. Vem do servidor
   * (`GET /api/script/versoes/:v/tarefas`), nunca do navegador: as trilhas guardaram os checkboxes no
   * localStorage e quem limpava o navegador perdia o parcial. Falha de rede na leitura nao atrapalha o
   * script (a tela abre com tudo desmarcado e a proxima marcacao tenta gravar de novo).
   */
  const loadTarefas = useCallback(async (n: number) => {
    try {
      const res = await axios.get(`/api/script/versoes/${n}/tarefas`, headers);
      if (res.data?.success) {
        const feitas = new Set<string>();
        for (const t of res.data.tarefas || []) if (t.concluida) feitas.add(chaveTarefa(t.passo, t.tarefa_id));
        setTarefas(feitas);
      }
    } catch {
      setTarefas(new Set());
    }
  }, [headers]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (selected != null) loadVersao(selected); }, [selected, loadVersao]);
  useEffect(() => { if (selected != null) loadTarefas(selected); }, [selected, loadTarefas]);

  /** Marca ou desmarca na hora (otimista) e grava; se o servidor recusar, volta como estava e avisa. */
  const alternarTarefa = useCallback(async (passo: number, tarefaId: string, concluida: boolean) => {
    const n = versao?.versao ?? selected;
    if (n == null) return;
    const chave = chaveTarefa(passo, tarefaId);
    setTarefas((prev) => {
      const proxima = new Set(prev);
      if (concluida) proxima.add(chave); else proxima.delete(chave);
      return proxima;
    });
    try {
      const res = await axios.put(`/api/script/versoes/${n}/tarefas/${passo}/${encodeURIComponent(tarefaId)}`, { concluida }, headers);
      if (!res.data?.success) throw new Error(res.data?.message || 'não salvou');
    } catch (e: any) {
      setTarefas((prev) => {
        const volta = new Set(prev);
        if (concluida) volta.delete(chave); else volta.add(chave);
        return volta;
      });
      setAviso(e?.response?.data?.message || 'Não deu para salvar a tarefa. Tente de novo.');
    }
  }, [headers, versao?.versao, selected]);

  // Apresentacao comercial da versao aberta: o que ja foi publicado e o pedido que ainda esta na fila
  const versaoDaLista = useMemo(
    () => (versoes || []).find((v) => v.versao === (versao?.versao ?? selected)) || null,
    [versoes, versao?.versao, selected]
  );
  const slides = useMemo<Entregavel | null>(
    () => ((versao?.entregaveis ?? versaoDaLista?.entregaveis ?? []).find((e) => e.tipo === 'slides') || null),
    [versao?.entregaveis, versaoDaLista]
  );
  const slidesJob = useMemo<ScriptJobInfo | null>(() => {
    const n = versao?.versao ?? selected;
    if (n == null) return null;
    return slidesJobs[n] ?? versao?.slides_job ?? versaoDaLista?.slides_job ?? null;
  }, [slidesJobs, versao, versaoDaLista, selected]);
  const slidesJobAtivo = !!slidesJob && (slidesJob.status === 'queued' || slidesJob.status === 'running');
  const arquivoDoSlides = useCallback(
    (campo: string) => (slides ? slides.arquivos.find((a) => a.campo === campo) || null : null),
    [slides]
  );
  const pptx = useMemo(() => arquivoDoSlides('pptx'), [arquivoDoSlides]);
  // Conector de IA do clube: so existe quando o worker publicou o entregavel `conector` desta versao
  const conectorEntregavel = useMemo<Entregavel | null>(
    () => ((versao?.entregaveis ?? versaoDaLista?.entregaveis ?? []).find((e) => e.tipo === 'conector') || null),
    [versao?.entregaveis, versaoDaLista]
  );

  // Enquanto o job esta na fila/rodando (sem versao, escrevendo a proxima ou montando a apresentacao), consulta de novo a cada 20 s
  const scriptJobAtivo = !!job && (job.status === 'queued' || job.status === 'running');
  const consultando = scriptJobAtivo || slidesJobAtivo;
  useEffect(() => {
    if (!consultando) return;
    const t = setInterval(loadList, pollMs);
    return () => clearInterval(t);
  }, [consultando, loadList, pollMs]);

  const parsed = useMemo(() => (versao?.content_md ? parseScript(versao.content_md) : null), [versao?.content_md]);
  const multiplos = !!parsed && parsed.documentos.length > 1;
  const temPassos = parsed ? parsed.documentos.some((d) => d.passos.length > 0) : false;

  /** Trocar de vista pela barra de cima: vale para o leitor inteiro e fica lembrada na sessao. */
  const trocarModo = useCallback((modo: DocumentoId) => {
    setDocAtivo(modo);
    guardarModoNaSessao(modo);
  }, []);

  // Tela lembrada por versao: script novo abre no Inicio; trocar de versao na mesma sessao mantem a tela
  useEffect(() => {
    if (!versao) return;
    const lembrada = lerTelaLembrada(clubSlug, versao.versao);
    const proxima = lembrada ?? (primeiraAberturaRef.current ? NAV_INICIO : telaRef.current);
    primeiraAberturaRef.current = false;
    setTelaState(clampNav(proxima));
    setFoco(null);
    setCaptura(null);
  }, [versao?.versao, clubSlug]);
  useEffect(() => {
    if (versao) guardarTela(clubSlug, versao.versao, tela);
  }, [tela, versao?.versao, clubSlug]);

  const irPara = useCallback((t: number) => {
    setTelaState(clampNav(Math.max(0, Math.min(TOTAL_NAV - 1, t))));
    setCaptura(null);
  }, []);

  // Setas do teclado (desktop), fora de campos de texto e sem balao/modal aberto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc fecha o balao "Grifar" (e apaga a marca pendente do trecho)
      if (captura && !modalGrifos && e.key === 'Escape') { e.preventDefault(); setCaptura(null); return; }
      if (modalGrifos || etapaSlides || captura || !parsed) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); irPara(telaRef.current + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); irPara(telaRef.current - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalGrifos, etapaSlides, captura, parsed, irPara]);

  // Os menus da barra de cima ("Baixar", a pilula da versao e "O que mudou") sao <details> nativos: o navegador
  // nao fecha no Esc nem ao clicar fora. Aqui os tres passam a fechar dos dois jeitos; no Esc o foco volta para o
  // proprio botao que abriu.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const abertos = () => Array.from(
      document.querySelectorAll<HTMLDetailsElement>('details.script-mais[open], details.script-versao-menu[open], details.script-mudou[open]'),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const lista = abertos();
      if (!lista.length) return;
      e.stopPropagation();
      for (const d of lista) {
        d.removeAttribute('open');
        d.querySelector<HTMLElement>('summary')?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const alvo = e.target as Element | null;
      for (const d of abertos()) {
        if (alvo && typeof alvo.closest === 'function' && alvo.closest('details') === d) continue;
        d.removeAttribute('open');
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown);
    };
  }, []);

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

  // A folha de perguntas do passo (CNCS) abriu ou fechou: o texto dela entra e sai do indice dos grifos
  // junto com ela, entao a pintura precisa ser refeita nas duas horas (pedido do dono em 09/09, item 4a).
  const [folhaAberta, setFolhaAberta] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const ouvir = () => setFolhaAberta((n) => n + 1);
    document.addEventListener(EVENTO_FOLHA, ouvir);
    return () => document.removeEventListener(EVENTO_FOLHA, ouvir);
  }, []);

  // O `passo` do grifo e a coordenada de CONTEUDO (0..9); a tela aberta e a de NAVEGACAO (0..10)
  const conteudoAtual = conteudoDaNav(tela);
  // Grifos desta tela pintados no texto (CSS Custom Highlight API); "ir para" rola ate o trecho em foco
  const grifosDaTela = useMemo(
    () => grifos.filter((g) => g.passo === conteudoAtual && (!ehTelaDePasso(conteudoAtual) || !multiplos || g.documento === docAtivo)),
    [grifos, conteudoAtual, multiplos, docAtivo]
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
  }, [grifosDaTela, parsed, foco, tela, docAtivo, folhaAberta]);

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
    const nestaTela = g.passo === conteudoAtual && (!ehTelaDePasso(conteudoAtual) || !multiplos || g.documento === docAtivo);
    if (nestaTela) return encontradosDom.has(g.id);
    return grifoEncontrado(parsed, g.passo, g.documento, g.texto);
  }, [parsed, conteudoAtual, multiplos, docAtivo, encontradosDom]);

  // Telas de NAVEGACAO com ponto no mapa (o grifo e o comentario chegam na coordenada de conteudo)
  const marcadas = useMemo(() => {
    const s = new Set<number>();
    for (const g of pendentes) s.add(navDoConteudo(g.passo));
    for (const c of comentarios) s.add(navDoConteudo(telaDoPasso(c.passo)));
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

  /** Baixa um arquivo montado aqui (o .md e a imagem do cartao). */
  const baixarArquivo = (href: string, nome: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const download = () => {
    if (!versao?.content_md) return;
    const blob = new Blob([cleanScriptMarkdown(versao.content_md)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    baixarArquivo(url, `script-${slugify(ficha.data?.club.nome || 'clube')}-v${versao.versao}.md`);
    URL.revokeObjectURL(url);
  };

  /**
   * "Baixar a preparação" (onda J, item 23): a Preparação vira PNG. A imagem sai do cartão da Preparação
   * (#script-preparacao-export), em creme com texto navy; fora daquela tela ele fica montado escondido, então
   * dá para baixar de qualquer tela do leitor. 2x para não sair borrada.
   */
  const baixarPreparacao = async () => {
    if (typeof document === 'undefined') return;
    const alvo = document.getElementById(ID_PREPARACAO_EXPORT);
    if (!alvo || !parsed) {
      setAviso('Esta versão veio sem preparação.');
      return;
    }
    try {
      const imagem = await toPng(alvo, { pixelRatio: 2, backgroundColor: '#FCF7F0', cacheBust: true });
      baixarArquivo(imagem, `preparacao-${slugify(ficha.data?.club.nome || 'clube')}-v${versao?.versao ?? selected ?? 1}.png`);
    } catch {
      setAviso('Não deu para baixar a preparação agora. Tente de novo.');
    }
  };

  /**
   * "Imprimir ou salvar em PDF": abre a pagina de impressao (/dashboard/script/imprimir), fora do layout do Dashboard.
   * Imprimir de dentro do Dashboard cortava o PDF na primeira pagina (containers com overflow escondido e altura da janela).
   */
  const abrirImpressao = (docImpressao: 'treinamento' | 'campo') => {
    if (typeof window === 'undefined' || !versao) return;
    const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
    const url = `${base}dashboard/script/imprimir?doc=${docImpressao}&versao=${versao.versao}`;
    if (typeof window.open === 'function') {
      const aberta = window.open(url, '_blank', 'noopener');
      if (aberta) return;
    }
    window.location.assign(url);
  };

  /** Abre um endereco de fora do app numa aba nova (a pagina de instalacao do conector). Nunca leva o token. */
  const abrirPagina = (url: string) => {
    if (typeof window === 'undefined' || !url) return;
    if (typeof window.open === 'function') {
      const aberta = window.open(url, '_blank', 'noopener');
      if (aberta) return;
    }
    window.location.assign(url);
  };

  /** Abre um arquivo da apresentacao comercial (o token vai na URL: o link nasce fora do axios). */
  const abrirEntregavel = (arq: EntregavelArquivo, inline: boolean) => {
    if (typeof window === 'undefined') return;
    const url = `${arq.url}${arq.url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}${inline ? '&inline=1' : ''}`;
    if (typeof window.open === 'function') {
      const aberta = window.open(url, '_blank', 'noopener');
      if (aberta) return;
    }
    window.location.assign(url);
  };

  /**
   * "Quero ajustar antes" (etapa 1 da apresentação): fecha o aviso, abre a lista de grifos e leva a pessoa até a
   * caixa de comentário. A tela das ações não tem caixa de comentário, então o caminho é a tela de Início
   * ("Comentar o script como um todo"), que vale para o script inteiro.
   */
  const abrirComentarios = useCallback(() => {
    const caixa = readerRef.current?.querySelector<HTMLDetailsElement>('details.script-comentarios');
    if (!caixa) return false;
    caixa.open = true;
    if (typeof caixa.scrollIntoView === 'function') {
      try { caixa.scrollIntoView({ block: 'start' }); } catch { /* jsdom */ }
    }
    return true;
  }, []);

  const ajustarAntesDaApresentacao = () => {
    setEtapaSlides(null);
    setPainelAberto(true);
    if (!abrirComentarios()) {
      irPara(NAV_INICIO);
      setTimeout(abrirComentarios, 0);
    }
  };

  /** "Gerar apresentação": manda montar os slides desta versao com as falas do script nas notas. */
  const gerarSlides = async () => {
    const n = versao?.versao ?? selected;
    if (n == null) return;
    setGerandoSlides(true);
    try {
      const res = await axios.post(`/api/script/versoes/${n}/slides`, {}, headers);
      if (res.data?.success) {
        setSlidesJobs((prev) => ({ ...prev, [n]: res.data.job || { id: `slides-${n}`, tipo: 'slides', status: 'queued', attempts: 0 } }));
        setAviso(res.data.job?.existing
          ? 'A sua apresentação já está sendo montada. Avisamos quando ficar pronta.'
          : 'Vamos montar a sua apresentação com as falas do script nas notas. Avisamos quando ficar pronta.');
      }
    } catch (e: any) {
      setAviso(e?.response?.data?.message || 'Não deu para pedir a apresentação agora. Tente de novo.');
    } finally {
      setGerandoSlides(false);
    }
  };

  /** Etapa 2 do "Gerar apresentação": confirmada a versão, aí sim o pedido vai para o servidor. */
  const confirmarSlides = async () => {
    await gerarSlides();
    setEtapaSlides(null);
  };

  /**
   * Bloco da apresentacao no "Ações", no fim do leitor (onda E1, item 1: ele saiu da tela de abertura).
   * "Gerar apresentação" abre a confirmação em duas etapas (onda E4); o POST
   * /api/script/versoes/:versao/slides só sai depois do "Confirmar".
   */
  const apresentacao: ApresentacaoCartao = pptx
    ? {
      estado: 'pronta',
      onBaixar: () => abrirEntregavel(pptx, false),
      outros: SLIDES_OUTROS
        .filter((it) => !!arquivoDoSlides(it.campo))
        .map((it) => ({ campo: it.campo, rotulo: it.rotulo, onAbrir: () => abrirEntregavel(arquivoDoSlides(it.campo)!, it.inline) })),
    }
    : slidesJobAtivo
    ? { estado: 'montando' }
    : { estado: 'ausente', onGerar: () => setEtapaSlides('aviso'), gerando: gerandoSlides };

  /**
   * Cartao "Seu conector" no bloco "Ações": a pagina de instalacao (meta.pagina, e o endereco do conector
   * quando ela nao vier) e o arquivo com o passo a passo. Sem o entregavel publicado, nada aparece.
   */
  const conector = useMemo<ConectorCartao | undefined>(() => {
    if (!conectorEntregavel) return undefined;
    const meta = conectorEntregavel.meta || {};
    const pagina = String(meta.pagina || meta.url || '').trim();
    const instalacao = conectorEntregavel.arquivos.find((a) => a.campo === 'instalacao') || null;
    return {
      onAbrirPagina: pagina ? () => abrirPagina(pagina) : undefined,
      onBaixar: instalacao ? () => abrirEntregavel(instalacao, false) : undefined,
    };
  }, [conectorEntregavel, token]);

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
        // Aprovar tambem manda montar a apresentacao comercial desta versao
        if (res.data.slides_job) setSlidesJobs((prev) => ({ ...prev, [versao.versao]: res.data.slides_job }));
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

  /** "Pedir nova versão com os grifos": cada grifo pendente vira um comentario da revisao, mais a orientacao geral. */
  const pedirComGrifos = async (orientacao: string) => {
    if (!versao) return;
    const lista = pendentes.map(grifoParaComentario);
    const r = await ficha.pedirRevisao(versao.versao, orientacao, { comentarios: lista });
    if (r.ok) {
      setPediAjuste(true);
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
    if (ehTelaDePasso(g.passo) && multiplos) setDocAtivo(g.documento);
    setTelaState(navDoConteudo(g.passo));
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
        {/* O app escolheu o caminho sozinho (o material bastou antes da tela de escolha): oferece o essencial uma vez */}
        <AvisoModoAutomatico
          clubeSlug={clubSlug}
          modo={ficha.data?.modo}
          modoOrigem={ficha.data?.modo_origem}
          onEssencial={() => ficha.definirModo('essencial')}
        />
        <div className="bg-prosperus-navy-mid border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-prosperus-gold-dark font-semibold">Seu script</p>
          {fichaConfirmada || job ? (
            <>
              <h2 className="font-serif text-2xl sm:text-3xl text-white leading-tight">Seu script está sendo escrito.</h2>
              <p className="text-sm text-white/70 leading-relaxed">Ele aparece aqui, com os 7 passos, para ler, grifar, comentar, baixar ou imprimir. Você não precisa ficar nesta tela.</p>
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
              {/* Onda I, item I4: a fila com o nome dos clubes na frente, o tempo médio e o WhatsApp */}
              <EtaEspera
                token={token}
                tipo="script"
                ativo={job?.status === 'queued' || job?.status === 'running'}
                temWhatsapp={!!ficha.data?.materials?.notify_phone}
                sugerido={ficha.data?.materials?.notify_phone_sugerido}
                onConfirmarWhats={ficha.salvarNotifyPhone}
                lembreteDispensado={!!ficha.data?.visto_whatsapp_lembrete}
                onDispensarLembrete={ficha.marcarLembreteWhatsapp}
                id="script-espera-whatsapp"
                testId="eta-script"
              />
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
  // Uma rodada de ajustes por clube (onda E4): o servidor conta os pedidos e a tela trava o botão quando acaba
  const ajustes: AjustesInfo = {
    usados: (Number(resumoScript?.ajustes_usados) || 0) + (pediAjuste ? 1 : 0),
    limite: Number.isFinite(Number(resumoScript?.ajustes_limite)) ? Number(resumoScript?.ajustes_limite) : AJUSTES_LIMITE_PADRAO,
  };
  const semAjustes = ajustes.limite > 0 && ajustes.usados >= ajustes.limite;

  /**
   * "Ações", no fim do leitor (onda E1, item 2 da spec: nada disso fica no topo): aprovar o script e gerar a
   * apresentação. Onda E4 (decisão do dono em 07/09): "Pedir nova versão" e "Escrever do zero" saíram do leitor.
   * O único caminho para uma versão nova é o grifo mais o comentário ("Pedir nova versão com os grifos"), e ele
   * vale uma rodada só: gasta a rodada, o botão trava e explica. O admin continua com as rotas dele.
   */
  const acoesFinais = (
    <>
      {!aprovado ? (
        <Button variant="primary" size="md" onClick={aprovar} loading={aprovando} disabled={aprovando || !versao}>Aprovar o script</Button>
      ) : (
        <span className="script-acao script-acao-aprovado" data-testid="script-aprovado">
          Aprovado{versao?.aprovado_em ? ` em ${formatDate(versao.aprovado_em)}` : ''}
        </span>
      )}
      {totalPendentes > 0 && (
        <Button variant="primary" size="md" onClick={() => setModalGrifos(true)} disabled={pedindo || scriptJobAtivo || semAjustes || !versao} data-testid="pedir-com-grifos">
          {scriptJobAtivo ? 'Nova versão a caminho' : `Pedir nova versão com os grifos (${totalPendentes})`}
        </Button>
      )}
      {semAjustes && !scriptJobAtivo && (
        <p className="script-acoes-nota" data-testid="ajustes-esgotados">{COPY_AJUSTES_USADOS}</p>
      )}
    </>
  );

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
      {/* O app escolheu o caminho sozinho: oferece o essencial uma vez (a mesma memória da Ficha) */}
      <div className="script-no-print">
        <AvisoModoAutomatico
          clubeSlug={clubSlug}
          modo={ficha.data?.modo}
          modoOrigem={ficha.data?.modo_origem}
          onEssencial={() => ficha.definirModo('essencial')}
        />
      </div>
      {/* Barra de cima: esquerda = versão e "O que mudou"; direita = "Baixar" e a chave Treinamento | Campo */}
      <div className="script-no-print flex flex-col gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-prosperus-gold-dark font-semibold">Seu script</p>
          <h2 className="font-serif text-2xl sm:text-3xl text-white leading-tight">
            Script v{versao?.versao ?? selected}
            {aprovado && <span className="ml-3 align-middle text-[11px] font-sans font-semibold px-2 py-0.5 rounded-full bg-green-600/20 text-green-400">aprovado</span>}
          </h2>
        </div>

        <div className="script-topo" data-testid="script-topo">
          <div className="script-topo-lado">
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
                <summary className="script-topo-btn" aria-label="Ver o que mudou nesta versão" data-testid="mudou-botao">O que mudou</summary>
                <div className="script-mudou-folha" data-testid="mudou-folha">
                  <span className="script-menu-rotulo">O que mudou nesta versão</span>
                  <p className="script-mudou-texto">{versao.resumo}</p>
                  <button type="button" className="script-menu-item script-mais-fechar" onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}>Fechar</button>
                </div>
              </details>
            )}
          </div>

          <div className="script-topo-lado script-topo-direita">
            <details className="script-mais">
              <summary className="script-topo-btn script-topo-btn-forte" aria-label="Baixar" data-testid="baixar-botao">
                <IconeBaixar />
                Baixar
                <span aria-hidden="true" className="text-black/50">&#x25BE;</span>
              </summary>
              <div className="script-mais-menu" role="group" aria-label="Baixar">
                <button type="button" className="script-menu-item" data-testid="baixar-preparacao" disabled={!parsed} onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); baixarPreparacao(); }}>Preparação (imagem)</button>
                <div className="script-menu-sep" />
                {multiplos ? (
                  <>
                    <button type="button" className="script-menu-item" onClick={() => abrirImpressao('campo')} disabled={!versao?.content_md} data-testid="pdf-campo">Script de campo (PDF)</button>
                    <button type="button" className="script-menu-item" onClick={() => abrirImpressao('treinamento')} disabled={!versao?.content_md} data-testid="pdf-treinamento">Treinamento (PDF)</button>
                  </>
                ) : (
                  <button type="button" className="script-menu-item" onClick={() => abrirImpressao('treinamento')} disabled={!versao?.content_md} data-testid="pdf-treinamento">Script (PDF)</button>
                )}
                <button type="button" className="script-menu-item" data-testid="baixar-md" onClick={download} disabled={!versao?.content_md}>Texto (.md)</button>
                {pptx && (
                  <button type="button" className="script-menu-item" data-testid="slides-pptx" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); abrirEntregavel(pptx, false); }}>Apresentação (PPTX)</button>
                )}
                <button type="button" className="script-menu-item script-mais-fechar" onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}>Fechar</button>
              </div>
            </details>
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

      {/* Onda J (item 24): no lugar do trilho, a escolha Treinamento ou Campo em largura cheia, duas opções só */}
      {multiplos && (
        <div className="script-modo-barra script-no-print" role="group" aria-label="Modo de leitura" data-testid="script-modo">
          {(['treinamento', 'campo'] as DocumentoId[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={docAtivo === id}
              data-testid={`modo-${id}`}
              onClick={() => trocarModo(id)}
              className={`script-modo-barra-btn ${docAtivo === id ? 'script-modo-barra-btn-ativo' : ''}`}
            >
              <span className="script-modo-barra-nome">{id === 'campo' ? 'Campo' : 'Treinamento'}</span>
              <span className="script-modo-barra-linha">
                {id === 'campo' ? 'Só o que dizer e perguntar, para levar aberto na conversa.' : 'Cada fala com o porquê, mais as gravações recomendadas.'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto w-full lg:max-w-[760px]">
        <div className="min-w-0">
          {parsed && (
            <ScriptReader
              doc={parsed}
              clubNome={clubNome}
              tela={tela}
              onTela={irPara}
              versao={versao?.versao ?? selected}
              ajustes={ajustes}
              documento={docAtivo}
              marcadas={marcadas}
              comentariosDo={renderComentarios}
              ficha={fichaResumo}
              onBaixarPreparacao={baixarPreparacao}
              apresentacao={apresentacao}
              conector={conector}
              acoes={acoesFinais}
              totalGrifos={grifos.length}
              onAbrirGrifos={() => setPainelAberto(true)}
              rootRef={readerRef}
              tarefasConcluidas={tarefas}
              onTarefa={alternarTarefa}
            />
          )}
          {parsed && !temPassos && (
            <p className="script-no-print text-sm text-white/60 mt-3">Esta versão veio sem os passos numerados; o texto acima é o conteúdo como chegou.</p>
          )}
          {!parsed && <p className="text-sm text-white/60">Esta versão veio vazia. Peça uma nova versão.</p>}
        </div>
      </div>

      {/* "Seus grifos" (onda J, item 7): a mesma folha nos dois tamanhos, aberta pela pastilha flutuante.
          No celular ela sobe do rodapé; a partir de 1024 px entra como gaveta pela direita (quem decide é o CSS). */}
      {parsed && painelAberto && (
        <div className="script-no-print script-grifos-folha-fundo" onClick={() => setPainelAberto(false)}>
          <div className="script-grifos-folha" data-testid="grifos-folha" onClick={(e) => e.stopPropagation()}>
            {painel}
          </div>
        </div>
      )}

      {/* Balao "Grifar" sobre a selecao */}
      {parsed && captura && (
        <GrifoBubble captura={captura} onSalvar={salvarGrifo} onCancelar={() => setCaptura(null)} erro={grifosApi.erro} anexar={grifosApi.anexarNoUltimo} />
      )}

      {/* "Gerar apresentação" em duas etapas: o aviso dos ajustes e a confirmação da versão */}
      <ConfirmarApresentacaoModal
        etapa={etapaSlides}
        versao={versao?.versao ?? selected}
        gerando={gerandoSlides}
        onAjustar={ajustarAntesDaApresentacao}
        onAvancar={() => setEtapaSlides('confirmar')}
        onVoltar={() => setEtapaSlides('aviso')}
        onConfirmar={confirmarSlides}
        onClose={() => setEtapaSlides(null)}
      />

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
            todosVisiveis
            refFor={refFor}
            comentariosDo={() => null}
          />
        </div>
      )}

      {/* Preparação de onde sai a imagem do "Baixar a preparação". Na tela da Preparação o cartão já está no
          papel; nas outras ele fica montado fora da tela, para o download funcionar de qualquer lugar. */}
      {parsed && tela !== NAV_PREPARACAO && (
        <div className="script-export-fora script-no-print" aria-hidden="true">
          <PreparacaoCartao doc={parsed} campo={multiplos && docAtivo === 'campo'} />
        </div>
      )}
    </div>
  );
};

export default ScriptScreen;
