/**
 * Anexos do grifo (onda E3): a mesma linha "Adicionar contexto" da Ficha, agora no papel creme do leitor.
 * Reusa o gravador de áudio e os ícones do contexto por pergunta (components/script/contexto/*) e fala com
 * POST /api/script/grifos/:id/contexto (áudio transcrito na hora pela Groq) e DELETE .../contexto/:itemId.
 *
 * Dois usos:
 *  - balão de criação: o grifo ainda não existe, então os itens ficam numa fila local (`AnexoPendente`) e sobem
 *    logo depois do POST do grifo;
 *  - cartão de "Seus grifos": o grifo já existe, cada botão envia na hora.
 * Alvos de toque de 44 px nos dois.
 */
import React, { useState } from 'react';
import { GravadorAudio, MAX_VIDEO_BYTES } from '../contexto/ContextoCampo';
import { ICONE_TIPO, IconeLixeira, IconeNota } from '../contexto/icones';
import { ANEXO_ACAO, ANEXO_ROTULO, ANEXO_TIPOS, resumoAnexo, type AnexoPendente, type AnexoTipo, type GrifoAnexo } from './types';

const INPUT = 'w-full bg-white border border-prosperus-navy-panel/20 rounded-lg px-3 py-2 text-sm text-prosperus-neutral-black placeholder-prosperus-navy-panel/40 outline-none focus:border-prosperus-gold-dark min-h-[44px]';

function comEsquema(url: string) {
  const u = url.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`;
}

export type EnviarAnexo = (novo: AnexoPendente) => Promise<{ ok: boolean; message?: string }>;

interface AnexosGrifoProps {
  /** Itens já anexados (ou a fila local do balão). */
  itens: (GrifoAnexo | AnexoPendente)[];
  onEnviar: EnviarAnexo;
  /** Sem função de remover, os chips ficam só de leitura. */
  onRemover?: (item: GrifoAnexo | AnexoPendente, indice: number) => void | Promise<void>;
  /** Quais itens mostram a lixeira (no painel, só os que a própria pessoa anexou). */
  podeRemover?: (item: GrifoAnexo | AnexoPendente) => boolean;
  enviando?: boolean;
  /** Sufixo dos data-testid, para o balão e cada cartão do painel não colidirem. */
  id: string;
  /** Texto de apoio embaixo da linha de botões. */
  dica?: string;
}

/** Chips do que já foi anexado, com o resumo (transcrição, texto, legenda, url ou nome do arquivo). */
export const AnexosChips: React.FC<{
  itens: (GrifoAnexo | AnexoPendente)[];
  onRemover?: (item: GrifoAnexo | AnexoPendente, indice: number) => void | Promise<void>;
  podeRemover?: (item: GrifoAnexo | AnexoPendente) => boolean;
  id: string;
}> = ({ itens, onRemover, podeRemover, id }) => {
  if (!itens.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Materiais anexados" data-testid={`grifo-anexos-${id}`}>
      {itens.map((a, i) => {
        const Ic = ICONE_TIPO[a.tipo] || IconeNota;
        const chave = (a as GrifoAnexo).id || `${a.tipo}-${i}`;
        const rotulo = ANEXO_ROTULO[a.tipo];
        const imagem = a.tipo === 'imagem' && (a as GrifoAnexo).download_url;
        return (
          <li key={chave} className="script-grifo-anexo" data-testid={`grifo-anexo-${chave}`}>
            {imagem ? (
              <img src={`${(a as GrifoAnexo).download_url}?inline=1`} alt={resumoAnexo(a)} className="script-grifo-anexo-miniatura" />
            ) : (
              <span className="script-grifo-anexo-icone" aria-hidden="true"><Ic /></span>
            )}
            <span className="script-grifo-anexo-texto">
              <span className="script-grifo-anexo-tipo">{rotulo}</span>
              {' '}
              {resumoAnexo(a)}
            </span>
            {onRemover && (!podeRemover || podeRemover(a)) && (
              <button
                type="button"
                onClick={() => onRemover(a, i)}
                aria-label={`Remover ${rotulo.toLowerCase()} anexado`}
                className="script-grifo-anexo-tirar"
              >
                <IconeLixeira />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export const AnexosGrifo: React.FC<AnexosGrifoProps> = ({ itens, onEnviar, onRemover, podeRemover, enviando = false, id, dica }) => {
  const [acao, setAcao] = useState<AnexoTipo | null>(null);
  const [url, setUrl] = useState('');
  const [texto, setTexto] = useState('');
  const [legenda, setLegenda] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [videoModo, setVideoModo] = useState<'arquivo' | 'link'>('arquivo');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const limpar = () => { setUrl(''); setTexto(''); setLegenda(''); setArquivo(null); setErro(null); };

  const escolher = (t: AnexoTipo) => { setAcao((a) => (a === t ? null : t)); limpar(); };

  const enviar = async (novo: AnexoPendente) => {
    setErro(null);
    setOcupado(true);
    const r = await onEnviar(novo);
    setOcupado(false);
    if (r.ok) { limpar(); setAcao(null); } else setErro(r.message || 'Não deu para anexar o material.');
  };

  const escolherArquivo = (e: React.ChangeEvent<HTMLInputElement>, tipo: 'imagem' | 'video') => {
    const f = e.target.files?.[0] || null;
    setErro(null);
    if (f && tipo === 'video' && f.size > MAX_VIDEO_BYTES) {
      setArquivo(null);
      setErro('O vídeo passa de 50 MB. Suba em um link (Drive, YouTube, Loom) e cole aqui.');
      return;
    }
    setArquivo(f);
  };

  const onGravado = (blob: Blob) => {
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    void enviar({ tipo: 'audio', file: blob, fileName: `grifo-${Date.now()}.${ext}` });
  };

  const ocupadoAgora = ocupado || enviando;

  const painel = () => {
    if (acao === 'audio') return <GravadorAudio onGravado={onGravado} enviando={ocupadoAgora} claro />;
    if (acao === 'imagem') {
      return (
        <div className="space-y-2">
          <input type="file" accept="image/*" aria-label="Arquivo de imagem" onChange={(e) => escolherArquivo(e, 'imagem')}
            className="block w-full text-sm text-prosperus-navy-panel font-sans file:mr-3 file:min-h-[44px] file:px-3 file:rounded-lg file:border-0 file:bg-prosperus-navy-panel/10 file:text-prosperus-navy-panel file:font-sans" />
          <input type="text" value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Legenda (opcional): o que essa imagem mostra" aria-label="Legenda da imagem" className={INPUT} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => enviar({ tipo: 'imagem', file: arquivo, legenda })} disabled={!arquivo || ocupadoAgora} className="script-grifo-btn script-grifo-btn-primario">Anexar imagem</button>
            <button type="button" onClick={() => setAcao(null)} className="script-grifo-btn script-grifo-btn-secundario">Cancelar</button>
          </div>
        </div>
      );
    }
    if (acao === 'video') {
      return (
        <div className="space-y-2">
          <div className="flex gap-2" role="group" aria-label="Como enviar o vídeo">
            {(['arquivo', 'link'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setVideoModo(m); setArquivo(null); setUrl(''); setErro(null); }} aria-pressed={videoModo === m}
                className={`script-grifo-cor ${videoModo === m ? 'script-grifo-cor-ativa script-grifo-cor-dourado' : ''}`}>
                {m === 'arquivo' ? 'Arquivo (até 50 MB)' : 'Link'}
              </button>
            ))}
          </div>
          {videoModo === 'arquivo' ? (
            <input type="file" accept="video/*" aria-label="Arquivo de vídeo" onChange={(e) => escolherArquivo(e, 'video')}
              className="block w-full text-sm text-prosperus-navy-panel font-sans file:mr-3 file:min-h-[44px] file:px-3 file:rounded-lg file:border-0 file:bg-prosperus-navy-panel/10 file:text-prosperus-navy-panel file:font-sans" />
          ) : (
            <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link do vídeo (Drive, YouTube, Loom)" aria-label="Link do vídeo" className={INPUT} />
          )}
          <input type="text" value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Legenda (opcional): o que tem nesse vídeo" aria-label="Legenda do vídeo" className={INPUT} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="script-grifo-btn script-grifo-btn-primario"
              onClick={() => enviar(videoModo === 'arquivo' ? { tipo: 'video', file: arquivo, legenda } : { tipo: 'video', url: comEsquema(url), legenda })}
              disabled={ocupadoAgora || (videoModo === 'arquivo' ? !arquivo : !url.trim())}>
              Anexar vídeo
            </button>
            <button type="button" onClick={() => setAcao(null)} className="script-grifo-btn script-grifo-btn-secundario">Cancelar</button>
          </div>
        </div>
      );
    }
    if (acao === 'link') {
      return (
        <div className="space-y-2">
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." aria-label="Endereço do link" className={INPUT} />
          <input type="text" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O que tem nesse link (opcional)" aria-label="Rótulo do link" className={INPUT} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => enviar({ tipo: 'link', url: comEsquema(url), texto })} disabled={!url.trim() || ocupadoAgora} className="script-grifo-btn script-grifo-btn-primario">Anexar link</button>
            <button type="button" onClick={() => setAcao(null)} className="script-grifo-btn script-grifo-btn-secundario">Cancelar</button>
          </div>
        </div>
      );
    }
    if (acao === 'nota') {
      return (
        <div className="space-y-2">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Escreva o que quem reescreve precisa saber sobre este trecho" aria-label="Nota do anexo" className={`${INPUT} resize-y`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => enviar({ tipo: 'nota', texto })} disabled={!texto.trim() || ocupadoAgora} className="script-grifo-btn script-grifo-btn-primario">Anexar nota</button>
            <button type="button" onClick={() => setAcao(null)} className="script-grifo-btn script-grifo-btn-secundario">Cancelar</button>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-2" data-testid={`grifo-anexar-${id}`}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Anexar material ao grifo">
        {ANEXO_TIPOS.map((t) => {
          const Ic = ICONE_TIPO[t];
          const ativo = acao === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => escolher(t)}
              aria-pressed={ativo}
              className={`script-grifo-anexar-botao ${ativo ? 'script-grifo-anexar-botao-ativo' : ''}`}
            >
              <Ic />
              {ANEXO_ACAO[t]}
            </button>
          );
        })}
      </div>
      {dica && !acao && <p className="text-[11px] text-prosperus-navy-panel/55 leading-snug">{dica}</p>}
      {acao && <div className="script-grifo-anexar-painel">{painel()}</div>}
      {erro && <p className="text-xs text-red-700" role="alert">{erro}</p>}
      <AnexosChips itens={itens} onRemover={onRemover} podeRemover={podeRemover} id={id} />
    </div>
  );
};

export default AnexosGrifo;
