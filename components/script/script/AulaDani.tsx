import React, { useEffect, useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AULA_7_PASSOS, capituloDoPasso, urlDaAula, type AulaReferencia } from '../../../data/aula-7-passos';
import { BUNNY_CDN } from './TreinamentosPasso';

/**
 * A aula da Dani sobre os 7 passos, como referência de aprofundamento do script.
 * - `AulaDani`: cartão navy 16:9 com a etiqueta dourada e a frase de uso. Nasce com a THUMBNAIL da Bunny e o
 *   botão de tocar; o player (iframe) só é montado quando a pessoa toca. Onda E1 (SPEC-workflow-v3-decisoes-07-09
 *   §2, item 7): nada de player carregado sozinho (o cartão do Sumário começava a tocar por conta própria) e nada
 *   de "Abrir em tela cheia".
 * - `AulaFolha`: o mesmo cartão numa folha que sobe do rodapé (celular) ou num painel lateral (desktop).
 * Sem estado de rede; a aula vem de data/aula-7-passos.ts.
 */

/** Permissões que o player da Bunny pede (as mesmas do RecommendationCard). */
export const AULA_ALLOW = 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;';

/**
 * Capa da aula: o `thumbnail.jpg` público da Bunny, tirado do GUID do próprio embed. Onda J (item 10): a capa
 * é ESTÁTICA, o mesmo padrão das capas dos treinamentos por passo (`thumbDoTreinamento`). O `preview.webp`
 * saiu daqui porque é uma prévia animada do vídeo, e a animação no resumo parecia um player tocando sozinho.
 * Se a imagem não carregar, o cartão cai na placa navy com o botão de tocar (o `onError` de quem usa).
 */
export function thumbDaAula(aula: AulaReferencia): string | null {
  const m = /\/embed\/\d+\/([0-9a-f-]+)/i.exec(aula.embedUrl);
  return m ? `${BUNNY_CDN}/${m[1]}/thumbnail.jpg` : null;
}

export const FRASE_AULA = 'Assista à aula da Dani antes da primeira reunião: o script é o que dizer; a aula é por que funciona.';

const IconePlay: React.FC<{ tamanho?: number }> = ({ tamanho = 22 }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

interface AulaDaniProps {
  aula?: AulaReferencia;
  /** Passo em foco: legenda "Passo N · nome" e, quando o capítulo tem marcação, a aula abre naquele ponto. */
  passo?: number | null;
  /** Carrega o player de imediato (a folha abriu por um toque da pessoa), sem esperar aparecer na tela. */
  autoCarregar?: boolean;
  /** Dentro da folha: sem moldura própria (a folha já é navy). */
  compacto?: boolean;
  className?: string;
}

export const AulaDani: React.FC<AulaDaniProps> = ({ aula = AULA_7_PASSOS, passo = null, autoCarregar = false, compacto = false, className }) => {
  const [carregado, setCarregado] = useState(autoCarregar);
  const [pedido, setPedido] = useState(autoCarregar);
  const [passoAtivo, setPassoAtivo] = useState<number | null>(passo);
  const [semImagem, setSemImagem] = useState(false);
  const tituloId = useId();

  useEffect(() => { setPassoAtivo(passo); }, [passo]);

  const capitulo = capituloDoPasso(aula, passoAtivo);
  const src = urlDaAula(aula, { passo: passoAtivo, autoplay: pedido });
  const thumb = thumbDaAula(aula);
  const marcados = aula.capitulos.filter((c) => Number.isFinite(c.inicioSegundos) && (c.inicioSegundos as number) > 0);

  const assistir = () => { setPedido(true); setCarregado(true); };

  return (
    <section
      aria-labelledby={tituloId}
      data-testid="aula-dani"
      className={`script-aula min-w-0 ${compacto ? '' : 'rounded-2xl border border-prosperus-gold-dark bg-prosperus-navy-panel p-4 sm:p-5'} text-prosperus-neutral-white ${className || ''}`}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-prosperus-gold-light font-semibold">Aprenda a lógica por trás do script</p>
      <h3 id={tituloId} className="font-serif text-xl sm:text-[1.35rem] leading-tight text-prosperus-neutral-white mt-1">{aula.titulo}</h3>
      {capitulo && (
        <p className="text-xs text-prosperus-gold-light/85 mt-1" data-testid="aula-capitulo">
          Passo {capitulo.passo} · {capitulo.rotulo}
          {capitulo.inicioSegundos ? ' · a aula abre neste passo' : ''}
        </p>
      )}

      <div className="relative mt-3 w-full aspect-video overflow-hidden rounded-xl bg-prosperus-navy-dark">
        {carregado ? (
          <iframe
            key={src}
            src={src}
            title={aula.titulo}
            className="absolute inset-0 h-full w-full border-0"
            allow={AULA_ALLOW}
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <button
            type="button"
            onClick={assistir}
            aria-label={`Assistir: ${aula.titulo}`}
            className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,_rgba(18,63,91,0.9)_0%,_rgba(2,15,25,0.98)_75%)] text-prosperus-gold-light transition-colors hover:text-prosperus-gold"
          >
            {thumb && !semImagem && (
              <img
                src={thumb}
                alt=""
                aria-hidden="true"
                loading="lazy"
                data-testid="aula-thumb"
                className="absolute inset-0 h-full w-full object-cover opacity-75"
                onError={() => setSemImagem(true)}
              />
            )}
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-prosperus-gold-dark text-prosperus-navy-dark shadow-lg" aria-hidden="true">
              <IconePlay tamanho={30} />
            </span>
            <span className="relative text-[11px] uppercase tracking-[0.2em] font-semibold">Assistir</span>
          </button>
        )}
      </div>

      {marcados.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Ir para o passo na aula">
          {marcados.map((c) => (
            <button
              key={c.passo}
              type="button"
              onClick={() => { setPassoAtivo(c.passo); setPedido(true); setCarregado(true); }}
              aria-pressed={passoAtivo === c.passo}
              className={`min-h-[44px] rounded-lg border px-3 text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors ${passoAtivo === c.passo ? 'border-prosperus-gold-dark bg-prosperus-gold-dark text-prosperus-navy-dark' : 'border-white/20 text-white/80 hover:bg-white/10'}`}
            >
              {c.passo} · {c.rotulo}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed text-prosperus-neutral-white/85">{FRASE_AULA}</p>

      {aula.duracaoAprox && <p className="mt-1 text-xs text-white/60">{aula.duracaoAprox}</p>}
    </section>
  );
};

/** true a partir de 1024px (lg); false no celular e no jsdom, que não tem matchMedia. */
export function useDesktop(): boolean {
  const consulta = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;
  const [desktop, setDesktop] = useState<boolean>(consulta);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const ouvir = () => setDesktop(mq.matches);
    ouvir();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', ouvir);
      return () => mq.removeEventListener('change', ouvir);
    }
    mq.addListener(ouvir);
    return () => mq.removeListener(ouvir);
  }, []);
  return desktop;
}

interface AulaFolhaProps {
  aberta: boolean;
  /** Passo em foco no momento em que a folha abriu (não muda ao trocar de tela com a folha aberta). */
  passo?: number | null;
  onFechar: () => void;
  aula?: AulaReferencia;
}

/** Folha (celular) ou painel lateral (desktop) com a aula, aberta de qualquer tela do leitor. */
export const AulaFolha: React.FC<AulaFolhaProps> = ({ aberta, passo = null, onFechar, aula = AULA_7_PASSOS }) => {
  const desktop = useDesktop();
  return (
    <Dialog.Root open={aberta} onOpenChange={(open) => { if (!open) onFechar(); }} modal={!desktop}>
      <Dialog.Portal>
        {!desktop && <Dialog.Overlay className="script-no-print fixed inset-0 z-[60] bg-prosperus-navy-dark/75" />}
        <Dialog.Content
          aria-describedby={undefined}
          onInteractOutside={(e) => { if (desktop) e.preventDefault(); }}
          className="script-aula-folha script-no-print fixed z-[61] flex min-w-0 flex-col overflow-y-auto bg-prosperus-navy-panel text-prosperus-neutral-white shadow-2xl outline-none inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl border-t border-prosperus-gold-dark/60 lg:inset-x-auto lg:inset-y-0 lg:right-0 lg:w-[420px] lg:max-w-[92vw] lg:max-h-none lg:rounded-none lg:rounded-l-2xl lg:border-t-0 lg:border-l"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-5">
            <Dialog.Title className="text-[10px] uppercase tracking-[0.22em] text-prosperus-gold-light font-semibold">Aula de referência</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar a aula"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/20 px-3 text-[11px] uppercase tracking-[0.1em] font-semibold text-white/85 transition-colors hover:bg-white/10"
              >
                Fechar
              </button>
            </Dialog.Close>
          </div>
          <div className="px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:px-5">
            <AulaDani aula={aula} passo={passo} autoCarregar compacto />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default AulaDani;
