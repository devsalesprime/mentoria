import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Button } from '../ui/Button';
import { renderMarkdown } from '../../utils/markdown';
import type { UseScriptFicha, ScriptVersion, ScriptComment, ScriptJobInfo } from '../../hooks/useScriptFicha';

/**
 * "Seu script" (/dashboard/script): o script escrito pelo worker a partir da ficha confirmada.
 * Estado 1: sem versao -> aviso "está sendo escrito" + status do job `script`, se houver.
 * Estado 2: versao -> markdown renderizado (utils/markdown.ts), dividido nos "## Passo N", com caixa de
 * comentario por passo, indice flutuante, Baixar (.md), Imprimir ou salvar em PDF, Aprovar, Pedir nova versao.
 * Mobile-first: indice vira faixa de chips no topo; no desktop fica fixo a direita.
 */

interface ScriptScreenProps {
  ficha: UseScriptFicha;
  token: string;
  onNavigate?: (id: string) => void;
}

interface Section {
  /** 0 = geral (antes do primeiro passo ou secao sem numero), 1..7 = passo. */
  passo: number;
  titulo: string;
  md: string;
  html: string;
}

const PASSO_RE = /^##\s+Passo\s+(\d)\b[^\n]*$/im;

/** Divide o markdown por "## Passo N" (e outros "## "), mantendo o cabecalho dentro da secao. */
export function splitScript(md: string): Section[] {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n');
  const out: { passo: number; titulo: string; lines: string[] }[] = [];
  let cur: { passo: number; titulo: string; lines: string[] } = { passo: 0, titulo: 'Abertura', lines: [] };
  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2 && !/^#/.test(h2[1])) {
      if (cur.lines.some((l) => l.trim())) out.push(cur);
      const m = PASSO_RE.exec(line);
      cur = { passo: m ? Number(m[1]) : 0, titulo: h2[1].replace(/#+$/, '').trim(), lines: [line] };
      continue;
    }
    cur.lines.push(line);
  }
  if (cur.lines.some((l) => l.trim())) out.push(cur);
  return out.map((s) => {
    const body = s.lines.join('\n').trim();
    return { passo: s.passo, titulo: s.titulo, md: body, html: renderMarkdown(body) };
  });
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

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'x';
}

/** Folha de impressao: papel creme, titulos em serifa, sem menu (window.print). */
const PRINT_CSS = `
@media print {
  body { background: #FCF7F0 !important; color: #111 !important; }
  body * { visibility: hidden !important; }
  #script-print-root, #script-print-root * { visibility: visible !important; }
  #script-print-root { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important;
    padding: 18mm 16mm !important; background: #FCF7F0 !important; color: #111 !important; box-shadow: none !important; border: 0 !important; }
  #script-print-root .no-print { display: none !important; }
  #script-print-root h1, #script-print-root h2, #script-print-root h3 { font-family: "EB Garamond", Georgia, serif !important; color: #0A2540 !important; page-break-after: avoid; }
  #script-print-root h2 { border-bottom: 1px solid #CA9A43; padding-bottom: 4px; margin-top: 18pt; }
  #script-print-root .script-secao { page-break-inside: avoid; }
  #script-print-root .script-md { color: #111 !important; font-size: 11.5pt; line-height: 1.5; }
  #script-print-root .script-md * { color: #111 !important; background: transparent !important; }
  #script-print-root a { color: #0A2540 !important; text-decoration: none !important; }
  @page { size: A4; margin: 12mm; }
}
`;

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

  const sections = useMemo(() => (versao?.content_md ? splitScript(versao.content_md) : []), [versao?.content_md]);
  const passos = useMemo(() => sections.filter((s) => s.passo > 0), [sections]);

  // Indice: destaca a secao visivel
  useEffect(() => {
    if (!sections.length || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) {
        const p = Number((visible.target as HTMLElement).dataset.passo);
        if (!Number.isNaN(p)) setActivePasso(p);
      }
    }, { rootMargin: '-20% 0px -60% 0px' });
    Object.values(sectionRefs.current).forEach((el) => { if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [sections]);

  const scrollTo = (key: string) => {
    const el = sectionRefs.current[key];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const download = () => {
    if (!versao?.content_md) return;
    const blob = new Blob([versao.content_md], { type: 'text/markdown;charset=utf-8' });
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

  const pedirNova = async () => {
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

  const comentariosDo = (passo: number) => comentarios.filter((c) => c.passo === passo);

  /** Caixa de comentario de um passo (0 = geral). */
  const renderComentarios = (passo: number) => {
    const lista = comentariosDo(passo);
    return (
      <div className="no-print mt-4 rounded-xl border border-prosperus-navy-panel/15 bg-white/60 p-3 sm:p-4 space-y-3">
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
    );
  };

  // ─── Estado 0: carregando / erro ─────────────────────────────────────────
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

  // ─── Estado 1: ainda sem versao ──────────────────────────────────────────
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
              {status && (
                <p className="text-xs text-white/60 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${job?.status === 'running' ? 'bg-prosperus-gold-dark animate-pulse' : job?.status === 'queued' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                  {status}
                </p>
              )}
              {job?.status === 'error' && (
                <Button variant="outline" size="md" onClick={pedirNova} loading={pedindo} disabled={pedindo}>Pedir nova versão</Button>
              )}
              {!job && fichaConfirmada && (
                <Button variant="outline" size="md" onClick={pedirNova} loading={pedindo} disabled={pedindo}>Pedir o script agora</Button>
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

  // ─── Estado 2: versao presente ───────────────────────────────────────────
  const aprovado = versao?.status === 'aprovado';
  const scriptJobAtivo = job && (job.status === 'queued' || job.status === 'running');

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>

      {/* Cabecalho e acoes */}
      <div className="no-print flex flex-col gap-3">
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
              {aprovado && versao?.aprovado_em ? ` · aprovado em ${formatDate(versao.aprovado_em)}` : ''}
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

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="md" onClick={download} disabled={!versao?.content_md}>Baixar (.md)</Button>
          <Button variant="outline" size="md" onClick={print} disabled={!versao?.content_md}>Imprimir ou salvar em PDF</Button>
          {!aprovado && <Button variant="primary" size="md" onClick={aprovar} loading={aprovando} disabled={aprovando || !versao}>Aprovar este script</Button>}
          <Button variant="secondary" size="md" onClick={pedirNova} loading={pedindo} disabled={pedindo || !!scriptJobAtivo}>
            {scriptJobAtivo ? 'Nova versão a caminho' : 'Pedir nova versão'}
          </Button>
        </div>
        {aviso && <p className="text-xs text-prosperus-gold-light">{aviso}</p>}
        {scriptJobAtivo && !aviso && (
          <p className="text-xs text-white/60">Uma nova versão está sendo escrita. Você recebe um aviso no WhatsApp quando ficar pronta.</p>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_200px] lg:gap-6 lg:items-start">
        {/* Indice: chips no celular, coluna fixa no desktop */}
        {passos.length > 0 && (
          <nav aria-label="Índice do script" className="no-print lg:order-2 lg:sticky lg:top-4">
            <div className="flex gap-1.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0 lg:bg-prosperus-navy-mid lg:border lg:border-white/10 lg:rounded-xl lg:p-3">
              <p className="hidden lg:block text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold mb-1">Os 7 passos</p>
              {passos.map((s) => (
                <button
                  key={`nav-${s.passo}`}
                  type="button"
                  onClick={() => scrollTo(`p${s.passo}`)}
                  className={`shrink-0 min-h-[40px] px-3 py-1.5 rounded-lg text-xs text-left transition border ${activePasso === s.passo ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark font-semibold' : 'bg-white/5 text-white/70 border-white/10 hover:text-white hover:bg-white/10'}`}
                >
                  <span className="lg:hidden">Passo {s.passo}</span>
                  <span className="hidden lg:inline truncate block">{s.titulo}</span>
                </button>
              ))}
            </div>
          </nav>
        )}

        {/* O script */}
        <article id="script-print-root" className="lg:order-1 bg-prosperus-neutral-white text-prosperus-neutral-black rounded-2xl p-5 sm:p-8 shadow-2xl">
          <header className="mb-6 border-b border-prosperus-gold-dark/40 pb-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-prosperus-gold-dark font-semibold">{ficha.data?.club.nome || 'Prosperus Exclusive'}</p>
            <h1 className="font-serif text-3xl sm:text-4xl text-prosperus-navy-panel leading-tight mt-1">Script de 7 passos · v{versao?.versao ?? selected}</h1>
          </header>

          {sections.length === 0 && <p className="text-sm text-prosperus-navy-panel/70">Esta versão veio vazia.</p>}

          {sections.map((s, i) => {
            const key = s.passo > 0 ? `p${s.passo}` : `g${i}`;
            return (
              <section
                key={key}
                data-passo={s.passo}
                ref={(el) => { sectionRefs.current[key] = el; }}
                className="script-secao scroll-mt-4 mb-8"
              >
                <div
                  className="script-md prose prose-sm sm:prose-base max-w-none font-sans text-prosperus-neutral-black
                    [&_h1]:font-serif [&_h1]:text-prosperus-navy-panel [&_h1]:text-2xl [&_h1]:mt-2 [&_h1]:mb-3
                    [&_h2]:font-serif [&_h2]:text-prosperus-navy-panel [&_h2]:text-2xl [&_h2]:mt-2 [&_h2]:mb-3 [&_h2]:border-b [&_h2]:border-prosperus-gold-dark/40 [&_h2]:pb-1
                    [&_h3]:font-serif [&_h3]:text-prosperus-navy-panel [&_h3]:text-xl [&_h3]:mt-5 [&_h3]:mb-2
                    [&_p]:my-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1
                    [&_blockquote]:border-l-4 [&_blockquote]:border-prosperus-gold-dark [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-prosperus-navy-panel/80
                    [&_strong]:text-prosperus-navy-panel [&_a]:text-prosperus-navy-light [&_a]:underline
                    [&_table]:w-full [&_table]:text-sm [&_th]:text-left [&_th]:border-b [&_th]:border-prosperus-navy-panel/20 [&_td]:border-b [&_td]:border-prosperus-navy-panel/10 [&_td]:py-1 [&_th]:py-1
                    [&_hr]:border-prosperus-gold-dark/30 [&_hr]:my-4 [&_code]:bg-prosperus-navy-panel/5 [&_code]:px-1 [&_code]:rounded"
                  dangerouslySetInnerHTML={{ __html: s.html }}
                />

                {s.passo > 0 && renderComentarios(s.passo)}
              </section>
            );
          })}
          {sections.length > 0 && (
            <section className="script-secao mt-2" data-passo="0">
              <h3 className="no-print font-serif text-xl text-prosperus-navy-panel">Sobre o script como um todo</h3>
              {renderComentarios(0)}
            </section>
          )}
        </article>
      </div>
    </div>
  );
};

export default ScriptScreen;
