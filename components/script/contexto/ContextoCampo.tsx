/**
 * Contexto por pergunta: linha "Adicionar contexto" com 5 ações (gravar áudio, foto ou imagem,
 * vídeo, link, nota), cartões do que já foi anexado e o botão "Pedir sugestão com esse contexto".
 * Montado embaixo do campo no passo a passo e no "Ver tudo".
 */
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import {
  useContextoCampo, itemEhMeu,
  type CampoComContexto, type ContextoItem, type ContextoTipo, type NovoContexto,
} from '../../../hooks/useContextoCampo';
import { emitirToast } from './toast';
import { ICONE_TIPO, IconeLixeira, IconeNota } from './icones';

export const MSG_REVISAO = 'A IA vai revisar este campo com o seu contexto. Aviso na tela quando a nova sugestão chegar.';
export const MAX_AUDIO_S = 120;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const ACOES: { tipo: ContextoTipo; rotulo: string }[] = [
  { tipo: 'audio', rotulo: 'Gravar áudio' },
  { tipo: 'imagem', rotulo: 'Foto ou imagem' },
  { tipo: 'video', rotulo: 'Vídeo' },
  { tipo: 'link', rotulo: 'Link' },
  { tipo: 'nota', rotulo: 'Nota' },
];

const TIPO_ROTULO: Record<ContextoTipo, string> = { audio: 'Áudio', imagem: 'Imagem', video: 'Vídeo', link: 'Link', nota: 'Nota' };

const INPUT = 'w-full bg-prosperus-navy-mid border border-white/10 focus:border-prosperus-gold-dark/60 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 font-sans outline-none min-h-[44px]';
const TAP = 'min-h-[44px]';

export function primeiroNome(nome?: string | null, email?: string | null): string {
  const n = (nome || '').trim();
  if (n) return n.split(/\s+/)[0];
  const e = (email || '').trim();
  if (e) return e.split('@')[0];
  return 'alguém';
}

/** Primeiros 120 caracteres do que importa no item (transcrição, texto, legenda, url ou nome do arquivo). */
export function resumoItem(item: ContextoItem, max = 120): string {
  const s = (item.transcricao || item.texto || item.legenda || item.url || item.file_name || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max).trimEnd()}...` : s;
}

function mmss(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function comEsquema(url: string) {
  const u = url.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`;
}

/** Selo "Em revisão pela IA" (campo com pedido de nova sugestão em andamento). */
export const BadgeRefinando: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-prosperus-gold-light/15 text-prosperus-gold-light font-sans ${className}`}
    data-testid="badge-refinando"
  >
    <span className="w-1.5 h-1.5 rounded-full bg-prosperus-gold-light animate-pulse" aria-hidden="true" />
    Em revisão pela IA
  </span>
);

// ── gravador de áudio (MediaRecorder, até 2 min) ────────────────────────────

const GravadorAudio: React.FC<{ onGravado: (blob: Blob, segundos: number) => void; enviando: boolean }> = ({ onGravado, enviando }) => {
  const suportado = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && 'MediaRecorder' in window;
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inicioRef = useRef(0);
  const mimeRef = useRef('audio/webm');

  const parar = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const r = recRef.current;
    if (r && r.state !== 'inactive') r.stop();
    setGravando(false);
  };

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const r = recRef.current;
    if (r && r.state !== 'inactive') { r.onstop = null; r.stop(); r.stream?.getTracks?.().forEach((t) => t.stop()); }
  }, []);

  const comecar = async () => {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ok = (m: string) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m);
      const mime = ok('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ok('audio/webm') ? 'audio/webm' : ok('audio/mp4') ? 'audio/mp4' : '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mimeRef.current = rec.mimeType || mime || 'audio/webm';
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const dur = Math.max(1, Math.round((Date.now() - inicioRef.current) / 1000));
        if (chunksRef.current.length) onGravado(new Blob(chunksRef.current, { type: mimeRef.current }), dur);
      };
      recRef.current = rec;
      inicioRef.current = Date.now();
      setSegundos(0);
      rec.start(250);
      setGravando(true);
      timerRef.current = setInterval(() => {
        const s = (Date.now() - inicioRef.current) / 1000;
        setSegundos(Math.min(MAX_AUDIO_S, Math.floor(s)));
        if (s >= MAX_AUDIO_S) parar();
      }, 250);
    } catch {
      setErro('Não conseguimos acessar o microfone. Libere a permissão no navegador ou escreva uma nota.');
    }
  };

  if (!suportado) {
    return <p className="text-xs text-white/50 font-sans">Este navegador não grava áudio aqui. Escreva uma nota ou envie um vídeo.</p>;
  }

  return (
    <div className="space-y-2" data-testid="gravador-audio">
      <div className="flex flex-wrap items-center gap-3">
        {!gravando ? (
          <Button variant="secondary" size="md" className={TAP} onClick={comecar} disabled={enviando} loading={enviando}>
            {enviando ? 'Enviando e transcrevendo' : 'Começar a gravar'}
          </Button>
        ) : (
          <Button variant="danger-soft" size="md" className={TAP} onClick={parar}>Parar</Button>
        )}
        {gravando && (
          <span className="inline-flex items-center text-sm font-sans text-white tabular-nums" aria-live="polite" data-testid="gravador-timer">
            <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse mr-2" aria-hidden="true" />
            {mmss(segundos)} / {mmss(MAX_AUDIO_S)}
          </span>
        )}
      </div>
      <p className="text-[11px] text-white/40 font-sans">Até 2 minutos. Fale como se estivesse explicando para a gente.</p>
      {erro && <p className="text-xs text-red-400 font-sans">{erro}</p>}
    </div>
  );
};

// ── o componente ─────────────────────────────────────────────────────────────

export interface ContextoCampoProps {
  campo: CampoComContexto;
  /** Recarrega a ficha (flush + GET) depois de pedir a revisão. */
  onRecarregar?: () => Promise<void> | void;
  /** Versão mais apertada (colunas do par antes × depois). */
  compacto?: boolean;
  /** Usa uma transcrição de áudio ou uma nota como a resposta do campo (abre o editor com o texto). */
  onUsarTexto?: (texto: string) => void;
}

/** Texto do item que pode virar resposta: a transcrição do áudio ou o texto da nota. */
export function textoParaResposta(item: ContextoItem): string {
  if (item.tipo === 'audio') return (item.transcricao || '').trim();
  if (item.tipo === 'nota') return (item.texto || '').trim();
  return '';
}

export const ContextoCampo: React.FC<ContextoCampoProps> = ({ campo, onRecarregar, compacto = false, onUsarTexto }) => {
  const ctx = useContextoCampo(campo, { onRecarregar });
  const [acao, setAcao] = useState<ContextoTipo | null>(null);
  const [ultimoAudio, setUltimoAudio] = useState<ContextoItem | null>(null);
  const [url, setUrl] = useState('');
  const [rotulo, setRotulo] = useState('');
  const [texto, setTexto] = useState('');
  const [legenda, setLegenda] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [videoModo, setVideoModo] = useState<'arquivo' | 'link'>('arquivo');
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [salvoAgora, setSalvoAgora] = useState<string | null>(null);

  const limparForm = () => {
    setUrl(''); setRotulo(''); setTexto(''); setLegenda(''); setArquivo(null); setErroLocal(null);
  };

  const escolher = (t: ContextoTipo) => {
    setAcao((a) => (a === t ? null : t));
    limparForm();
    setUltimoAudio(null);
    setSalvoAgora(null);
    ctx.limparAviso();
    if (!ctx.carregado && !ctx.loading) ctx.carregar();
  };

  const enviar = async (novo: NovoContexto) => {
    setErroLocal(null);
    const r = await ctx.adicionar(novo);
    if (r.ok) {
      limparForm();
      if (novo.tipo === 'audio') {
        setUltimoAudio(r.item || null);
      } else {
        setAcao(null);
        setSalvoAgora(`${TIPO_ROTULO[novo.tipo]} salvo. Quando terminar, peça a sugestão.`);
      }
    }
    return r;
  };

  const onGravado = (blob: Blob, _segundos: number) => {
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    void enviar({ tipo: 'audio', file: blob, fileName: `contexto-${campo.key}-${Date.now()}.${ext}` });
  };

  const escolherArquivo = (e: React.ChangeEvent<HTMLInputElement>, tipo: 'imagem' | 'video') => {
    const f = e.target.files?.[0] || null;
    setErroLocal(null);
    if (f && tipo === 'video' && f.size > MAX_VIDEO_BYTES) {
      setArquivo(null);
      setErroLocal('O vídeo passa de 50 MB. Suba em um link (Drive, YouTube, Loom) e cole aqui.');
      return;
    }
    setArquivo(f);
  };

  const pedir = async () => {
    const r = await ctx.pedirSugestao();
    if (r.ok) emitirToast(MSG_REVISAO);
  };

  const painel = () => {
    if (acao === 'audio') {
      return (
        <div className="space-y-3">
          <GravadorAudio onGravado={onGravado} enviando={ctx.enviando} />
          {ultimoAudio && (
            <div className="space-y-1" data-testid="transcricao-audio">
              <p className="text-[11px] uppercase tracking-wide text-prosperus-gold-dark font-sans">Transcrição</p>
              <div className="w-full bg-prosperus-navy-mid border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 font-sans whitespace-pre-line min-h-[44px]">
                {ultimoAudio.transcricao?.trim() || 'Áudio enviado. A transcrição aparece em instantes.'}
              </div>
              <p className="text-[11px] text-white/50 font-sans">A IA vai usar isto. Gravou errado? Exclua o item embaixo e grave de novo.</p>
              <div className="flex flex-wrap gap-2">
                {onUsarTexto && !!ultimoAudio.transcricao?.trim() && (
                  <Button variant="secondary" size="sm" className={TAP} onClick={() => { onUsarTexto(ultimoAudio.transcricao!.trim()); setUltimoAudio(null); setAcao(null); }}>Usar como resposta</Button>
                )}
                <Button variant="ghost" size="sm" className={TAP} onClick={() => { setUltimoAudio(null); setAcao(null); }}>Pronto</Button>
              </div>
            </div>
          )}
        </div>
      );
    }
    if (acao === 'imagem') {
      return (
        <div className="space-y-2">
          <input type="file" accept="image/*" aria-label="Arquivo de imagem" onChange={(e) => escolherArquivo(e, 'imagem')} className="block w-full text-sm text-white/80 font-sans file:mr-3 file:min-h-[44px] file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-white file:font-sans" />
          <input type="text" value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Legenda (opcional): o que essa imagem mostra" aria-label="Legenda da imagem" className={INPUT} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" className={TAP} onClick={() => enviar({ tipo: 'imagem', file: arquivo, legenda })} disabled={!arquivo || ctx.enviando} loading={ctx.enviando}>Enviar imagem</Button>
            <Button variant="ghost" size="md" className={TAP} onClick={() => setAcao(null)}>Cancelar</Button>
          </div>
        </div>
      );
    }
    if (acao === 'video') {
      return (
        <div className="space-y-2">
          <div className="flex gap-2" role="group" aria-label="Como enviar o vídeo">
            {(['arquivo', 'link'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setVideoModo(m); setArquivo(null); setUrl(''); setErroLocal(null); }} aria-pressed={videoModo === m}
                className={`min-h-[44px] px-3 rounded-full text-xs font-sans border transition ${videoModo === m ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark font-semibold' : 'border-white/15 text-white/70 hover:border-prosperus-gold-dark/60'}`}>
                {m === 'arquivo' ? 'Arquivo (até 50 MB)' : 'Link'}
              </button>
            ))}
          </div>
          {videoModo === 'arquivo' ? (
            <input type="file" accept="video/*" aria-label="Arquivo de vídeo" onChange={(e) => escolherArquivo(e, 'video')} className="block w-full text-sm text-white/80 font-sans file:mr-3 file:min-h-[44px] file:px-3 file:rounded-lg file:border-0 file:bg-white/10 file:text-white file:font-sans" />
          ) : (
            <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link do vídeo (Drive, YouTube, Loom)" aria-label="Link do vídeo" className={INPUT} />
          )}
          <input type="text" value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Legenda (opcional): o que tem nesse vídeo" aria-label="Legenda do vídeo" className={INPUT} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" className={TAP}
              onClick={() => enviar(videoModo === 'arquivo' ? { tipo: 'video', file: arquivo, legenda } : { tipo: 'video', url: comEsquema(url), legenda })}
              disabled={ctx.enviando || (videoModo === 'arquivo' ? !arquivo : !url.trim())} loading={ctx.enviando}>
              Enviar vídeo
            </Button>
            <Button variant="ghost" size="md" className={TAP} onClick={() => setAcao(null)}>Cancelar</Button>
          </div>
        </div>
      );
    }
    if (acao === 'link') {
      return (
        <div className="space-y-2">
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." aria-label="Endereço do link" className={INPUT} />
          <input type="text" value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder="Rótulo: o que tem nesse link" aria-label="Rótulo do link" className={INPUT} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" className={TAP} onClick={() => enviar({ tipo: 'link', url: comEsquema(url), texto: rotulo })} disabled={!url.trim() || ctx.enviando} loading={ctx.enviando}>Salvar link</Button>
            <Button variant="ghost" size="md" className={TAP} onClick={() => setAcao(null)}>Cancelar</Button>
          </div>
        </div>
      );
    }
    if (acao === 'nota') {
      return (
        <div className="space-y-2">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Escreva o que a IA precisa saber sobre esta pergunta" aria-label="Nota" className={`${INPUT} resize-y`} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" className={TAP} onClick={() => enviar({ tipo: 'nota', texto })} disabled={!texto.trim() || ctx.enviando} loading={ctx.enviando}>Salvar nota</Button>
            {onUsarTexto && (
              <Button variant="secondary" size="md" className={TAP} onClick={() => { onUsarTexto(texto.trim()); limparForm(); setAcao(null); }} disabled={!texto.trim() || ctx.enviando}>Usar como resposta</Button>
            )}
            <Button variant="ghost" size="md" className={TAP} onClick={() => setAcao(null)}>Cancelar</Button>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`border-t border-white/10 ${compacto ? 'pt-3' : 'pt-4'} space-y-3`} data-testid={`contexto-${campo.key}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-white/50 font-sans">
          Adicionar contexto{ctx.total > 0 ? ` · ${ctx.total}` : ''}
        </p>
        {ctx.refinando && <BadgeRefinando />}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Adicionar contexto">
        {ACOES.map((a) => {
          const Ic = ICONE_TIPO[a.tipo];
          const ativo = acao === a.tipo;
          return (
            <button
              key={a.tipo}
              type="button"
              onClick={() => escolher(a.tipo)}
              aria-pressed={ativo}
              className={`min-h-[44px] inline-flex items-center gap-1.5 px-3 rounded-full text-xs font-sans border transition ${
                ativo ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark font-semibold' : 'border-white/15 text-white/70 hover:border-prosperus-gold-dark/60 hover:text-white'
              }`}
            >
              <Ic />
              {a.rotulo}
            </button>
          );
        })}
      </div>
      {!acao && ctx.total === 0 && !salvoAgora && (
        <p className="text-[11px] text-white/40 font-sans">Faltou algo na sugestão? Anexe o que ajuda a IA a acertar e peça uma nova.</p>
      )}

      {acao && (
        <div className="rounded-lg border border-prosperus-gold-dark/25 bg-prosperus-gold-dark/[0.03] p-3" data-testid={`contexto-painel-${acao}`}>
          {painel()}
        </div>
      )}

      {(erroLocal || ctx.erro) && <p className="text-xs text-red-400 font-sans" role="alert">{erroLocal || ctx.erro}</p>}
      {ctx.aviso && <p className="text-xs text-prosperus-gold-light/80 font-sans">{ctx.aviso}</p>}
      {salvoAgora && !acao && <p className="text-xs text-green-400 font-sans">{salvoAgora}</p>}

      {ctx.items.length > 0 && (
        <ul className="space-y-1.5" aria-label="Contexto anexado" data-testid={`contexto-itens-${campo.key}`}>
          {ctx.items.map((item) => {
            const Ic = ICONE_TIPO[item.tipo] || IconeNota;
            const meu = itemEhMeu(item, ctx.meuEmail);
            const nome = primeiroNome(item.autor_nome, item.autor_email);
            const resumo = resumoItem(item);
            return (
              <li key={item.id} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2" data-testid={`contexto-item-${item.id}`}>
                <span className="mt-0.5 text-prosperus-gold-dark shrink-0"><Ic title={TIPO_ROTULO[item.tipo] || 'Contexto'} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/85 font-sans leading-snug break-words">
                    {item.tipo === 'link' && item.url
                      ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 hover:decoration-white">{resumo || item.url}</a>
                      : (resumo || TIPO_ROTULO[item.tipo] || 'Contexto')}
                  </p>
                  <p className="text-[11px] text-white/40 font-sans">
                    {TIPO_ROTULO[item.tipo] || 'Contexto'} · {nome}
                    {item.tipo === 'audio' && !item.transcricao?.trim() ? ' · transcrição a caminho' : ''}
                  </p>
                  {onUsarTexto && !!textoParaResposta(item) && (
                    <button
                      type="button"
                      onClick={() => onUsarTexto(textoParaResposta(item))}
                      className="min-h-[44px] -mb-2 text-[11px] text-prosperus-gold-light/90 hover:text-prosperus-gold-light font-sans underline-offset-2 hover:underline"
                    >
                      Usar como resposta
                    </button>
                  )}
                </div>
                {meu && (
                  <button
                    type="button"
                    onClick={() => ctx.remover(item.id)}
                    disabled={ctx.removendo === item.id}
                    aria-label={`Excluir ${(TIPO_ROTULO[item.tipo] || 'contexto').toLowerCase()} de ${nome}`}
                    className="min-h-[44px] min-w-[44px] -my-2 -mr-1.5 flex items-center justify-center text-white/40 hover:text-red-300 disabled:opacity-50"
                  >
                    <IconeLixeira />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {ctx.loading && ctx.items.length === 0 && <p className="text-[11px] text-white/40 font-sans">Carregando o contexto</p>}

      {ctx.total > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="md"
            className={TAP}
            onClick={pedir}
            disabled={ctx.refinando || ctx.pedindo}
            loading={ctx.pedindo}
            data-testid={`pedir-sugestao-${campo.key}`}
          >
            Pedir sugestão com esse contexto
          </Button>
          {ctx.refinando && <span className="text-[11px] text-white/50 font-sans">A nova sugestão aparece aqui quando ficar pronta.</span>}
        </div>
      )}
    </div>
  );
};
