import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Button } from '../ui/Button';
import type { UseScriptFicha, ScriptVersion, ScriptComment, ScriptJobInfo } from '../../hooks/useScriptFicha';
import { cleanScriptMarkdown, parseScript, slugify, splitScript } from './script/parseScript';
import { ScriptPaper } from './script/ScriptPaper';

export { splitScript };

/**
 * "Seu script" (/dashboard/script): o script escrito pelo worker a partir da ficha confirmada.
 * Estado 1: sem versao -> aviso "está sendo escrito" + status do job `script`, se houver.
 * Estado 2: versao -> documento diagramado (components/script/script/parseScript.ts + ScriptPaper.tsx): papel creme,
 * bloco de titulo, indice fixo dos 7 passos (chips no celular, coluna a esquerda no desktop), cada passo com medalhao,
 * falas em cartoes com "copiar", perguntas em checklist, notas lado a lado, Mapa de preparacao, Cartao de bolso.
 * Scripts com dois documentos (treinamento e campo) ganham um seletor; a impressao leva os dois.
 * Comentarios por passo ficam recolhidos ("Comentar este passo"). Acoes: Baixar (.md), Imprimir ou salvar em PDF,
 * Aprovar, Pedir nova versao (job `revisar`: parte da versao aberta + comentarios dela) e Gerar do zero (job `script`, so da ficha).
 * A folha de impressao (@media print) e as classes .script-* vivem em styles/globals.css.
 */

interface ScriptScreenProps {
  ficha: UseScriptFicha;
  token: string;
  onNavigate?: (id: string) => void;
}

function jobStatusLabel(job: ScriptJobInfo | null | undefined): string | null {
  if (!job) return null;
  switch (job.status) {
    case 'queued': return 'Na fila para ser escrito.';
    case 'running': return 'Sendo escrito agora.';
    case 'needs_human': return 'Precisa de uma olhada do time. Já avisamos por aqui.';
    case 'error': return 'Deu um erro na escrita. O time já foi avisado; se quiser, peça uma nova versão.';
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


export const ScriptScreen: React.FC<ScriptScreenProps> = ({ ficha, token, onNavigate }) => {
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
  const [activePasso, setActivePasso] = useState<number | null>(null);
  const [docAtivo, setDocAtivo] = useState<string>('');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const loadList = useCallback(async () => {
    try {
      const res = await axios.get('/api/script/versoes', headers);
      if (res.data?.success) {
        const list: ScriptVersion[] = res.data.versoes || [];
        setVersoes(list);
        setJob(res.data.job || null);
        setError(null);
        setSelected((prev) => (prev && list.some((v) => v.versao === prev) ? prev : (list[0]?.versao ?? null)));
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Erro ao carregar o script');
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
      setError(e?.response?.data?.message || e?.message || 'Erro ao abrir a versão');
    }
  }, [headers]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (selected != null) loadVersao(selected); }, [selected, loadVersao]);

  // Enquanto nao ha versao e o job esta na fila/rodando, consulta de novo a cada 20 s
  const waiting = versoes !== null && versoes.length === 0 && !!job && (job.status === 'queued' || job.status === 'running');
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(loadList, 20000);
    return () => clearInterval(t);
  }, [waiting, loadList]);

  const parsed = useMemo(() => (versao?.content_md ? parseScript(versao.content_md) : null), [versao?.content_md]);
  const docAtual = useMemo(() => {
    if (!parsed) return null;
    return parsed.documentos.find((d) => d.id === docAtivo) || parsed.documentos[0] || null;
  }, [parsed, docAtivo]);
  const passosIndice = docAtual?.passos ?? [];
  const temPassos = parsed ? parsed.documentos.some((d) => d.passos.length > 0) : false;

  // Indice: destaca a secao visivel
  useEffect(() => {
    if (!parsed || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) {
        const p = Number((visible.target as HTMLElement).dataset.passo);
        if (!Number.isNaN(p)) setActivePasso(p);
      }
    }, { rootMargin: '-20% 0px -60% 0px' });
    Object.values(sectionRefs.current).forEach((el) => { if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [parsed, docAtual]);

  const refFor = useCallback((key: string) => (el: HTMLElement | null) => { sectionRefs.current[key] = el; }, []);

  const scrollTo = (key: string) => {
    const el = sectionRefs.current[key] || (typeof document !== 'undefined' ? document.getElementById(key) : null);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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

  const print = () => { if (typeof window !== 'undefined') window.print(); };

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
      setAviso(e?.response?.data?.errors?.join('; ') || e?.response?.data?.message || 'Não deu para enviar o comentário.');
    } finally {
      setSending(null);
    }
  };

  const aprovar = async () => {
    if (!versao) return;
    if (typeof window !== 'undefined' && !window.confirm(`Aprovar o script v${versao.versao}? Você continua podendo comentar e pedir outra versão.`)) return;
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
      setAviso(e?.response?.data?.message || 'Não deu para aprovar agora.');
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
      setAviso(r.message || 'Não deu para pedir agora.');
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
        : `Pedido feito: a próxima versão parte da v${versao.versao} e dos comentários dela. Você recebe um aviso no WhatsApp quando ficar pronta.`);
    } else {
      setAviso(r.message || 'Não deu para pedir agora.');
    }
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
              className="min-h-[40px] px-4 py-2 rounded-lg bg-prosperus-navy-panel text-white text-xs font-semibold disabled:opacity-40 hover:bg-prosperus-navy-light transition"
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
              <p className="text-sm text-white/70 leading-relaxed">Você recebe um aviso no WhatsApp quando ficar pronto. Ele aparece aqui, com os 7 passos, para ler, comentar, baixar ou imprimir.</p>
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
  const scriptJobAtivo = job && (job.status === 'queued' || job.status === 'running');
  const clubNome = ficha.data?.club.nome || 'Prosperus Exclusive';

  return (
    <div className="space-y-4">
      {/* Cabecalho e acoes */}
      <div className="script-no-print flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-prosperus-gold-dark font-semibold">Seu script</p>
            <h2 className="font-serif text-2xl sm:text-3xl text-white leading-tight">
              Script v{versao?.versao ?? selected}
              {aprovado && <span className="ml-3 align-middle text-[11px] font-sans font-semibold px-2 py-0.5 rounded-full bg-green-600/20 text-green-400">aprovado</span>}
            </h2>
            <p className="text-xs text-white/50 mt-1">
              {versao?.created_at ? `escrito em ${formatDate(versao.created_at)}` : ''}
              {versao?.resumo ? ` · ${versao.resumo}` : ''}
            </p>
          </div>
          {versoes.length > 1 && (
            <label className="text-xs text-white/60 flex items-center gap-2">
              Versão
              <select
                value={selected ?? ''}
                onChange={(e) => setSelected(Number(e.target.value))}
                className="bg-prosperus-navy border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white outline-none min-h-[40px]"
              >
                {versoes.map((v) => (
                  <option key={v.id} value={v.versao}>v{v.versao}{v.status === 'aprovado' ? ' (aprovado)' : ''}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="md" onClick={download} disabled={!versao?.content_md}>Baixar (.md)</Button>
          <Button variant="outline" size="md" onClick={print} disabled={!versao?.content_md}>Imprimir ou salvar em PDF</Button>
          {!aprovado && <Button variant="primary" size="md" onClick={aprovar} loading={aprovando} disabled={aprovando || !versao}>Aprovar</Button>}
          <Button variant="secondary" size="md" onClick={pedirNova} loading={pedindo} disabled={pedindo || !!scriptJobAtivo || !versao}>
            {scriptJobAtivo ? 'Nova versão a caminho' : 'Pedir nova versão'}
          </Button>
          <Button variant="outline" size="md" onClick={gerarDoZero} disabled={pedindo || !!scriptJobAtivo}>Gerar do zero</Button>
          {onNavigate && (
            <Button variant="link" size="md" onClick={() => onNavigate('script_ficha')} data-testid="link-revisar-ficha">Revisar ficha</Button>
          )}
          {parsed && parsed.documentos.length > 1 && (
            <div role="tablist" aria-label="Documento do script" className="inline-flex rounded-lg border border-white/15 overflow-hidden ml-auto">
              {parsed.documentos.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={docAtual?.id === d.id}
                  onClick={() => setDocAtivo(d.id)}
                  className={`min-h-[40px] px-3 text-xs font-semibold transition ${docAtual?.id === d.id ? 'bg-prosperus-gold-dark text-black' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                >
                  {d.rotulo || d.titulo}
                </button>
              ))}
            </div>
          )}
        </div>
        {aviso && <p className="text-xs text-prosperus-gold-light">{aviso}</p>}
        {scriptJobAtivo && !aviso && (
          <p className="text-xs text-white/60 flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${job?.status === 'running' ? 'bg-prosperus-gold-dark animate-pulse' : 'bg-yellow-400'}`} />
            <span>
              {job?.tipo === 'revisar' ? 'Uma nova versão está sendo escrita a partir dos seus comentários.' : 'Uma nova versão está sendo escrita do zero, a partir da ficha.'}
              {' '}{jobStatusLabel(job)} Você recebe um aviso no WhatsApp quando ficar pronta.
            </span>
          </p>
        )}
        {!scriptJobAtivo && !aviso && (job?.status === 'error' || job?.status === 'needs_human') && (
          <p className="text-xs text-red-300">{jobStatusLabel(job)}</p>
        )}
        {!scriptJobAtivo && (
          <p className="text-xs text-white/50">Comente os passos e peça a nova versão: ela parte desta versão e dos seus comentários. "Gerar do zero" ignora os comentários e escreve tudo de novo a partir da ficha.</p>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[180px_minmax(0,760px)] lg:justify-center lg:gap-6 lg:items-start">
        {/* Indice: chips fixos no topo do celular, coluna fixa a esquerda no desktop */}
        {passosIndice.length > 0 && docAtual && (
          <nav aria-label="Índice do script" className="script-no-print sticky top-0 z-10 -mx-1 px-1 py-2 bg-prosperus-navy/95 backdrop-blur lg:top-4 lg:mx-0 lg:px-0 lg:py-0 lg:bg-transparent lg:backdrop-blur-none">
            <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0 lg:bg-prosperus-navy-mid lg:border lg:border-white/10 lg:rounded-xl lg:p-3">
              <p className="hidden lg:block text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold mb-1">Os 7 passos</p>
              {passosIndice.map((p) => (
                <button
                  key={`nav-${docAtual.id}-${p.n}`}
                  type="button"
                  aria-label={`Passo ${p.n}: ${p.nome}`}
                  onClick={() => scrollTo(`${docAtual.id}-p${p.n}`)}
                  className={`shrink-0 min-h-[40px] px-3 py-1.5 rounded-lg text-xs text-left transition border ${activePasso === p.n ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark font-semibold' : 'bg-white/5 text-white/70 border-white/10 hover:text-white hover:bg-white/10'}`}
                >
                  <span className="lg:hidden">Passo {p.n}</span>
                  <span className="hidden lg:block truncate"><span className="font-serif text-sm mr-1.5 opacity-70">{p.n}</span>{p.nome}</span>
                </button>
              ))}
              {parsed?.cartao && (
                <button
                  type="button"
                  onClick={() => scrollTo('script-cartao')}
                  className="shrink-0 min-h-[40px] px-3 py-1.5 rounded-lg text-xs text-left transition border bg-white/5 text-prosperus-gold-light border-prosperus-gold-dark/40 hover:bg-white/10"
                >
                  Cartão de bolso
                </button>
              )}
            </div>
          </nav>
        )}

        <div className={`mt-3 lg:mt-0 ${passosIndice.length > 0 ? '' : 'lg:col-span-2'}`}>
          {parsed && (
            <ScriptPaper
              doc={parsed}
              clubNome={clubNome}
              versao={versao?.versao ?? selected}
              escritoEm={formatDate(versao?.created_at)}
              aprovadoEm={aprovado ? formatDate(versao?.aprovado_em) : null}
              docAtivo={docAtual?.id || ''}
              refFor={refFor}
              comentariosDo={renderComentarios}
            />
          )}
          {parsed && !temPassos && (
            <p className="text-sm text-white/60 mt-3">Esta versão veio sem os passos numerados; o texto acima é o conteúdo como chegou.</p>
          )}
          {!parsed && <p className="text-sm text-white/60">Esta versão veio vazia.</p>}
          {parsed && (
            <div className="script-no-print max-w-[760px] mx-auto mt-4 rounded-2xl bg-prosperus-neutral-white px-5 py-4 sm:px-10">
              {renderComentarios(0)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScriptScreen;
