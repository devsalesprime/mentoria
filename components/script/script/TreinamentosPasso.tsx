import React, { useId, useState } from 'react';
import { duracaoLegivel, treinamentosDoPasso, urlDoTreinamento, type Treinamento } from '../../../data/treinamentos-por-passo';
import { AULA_ALLOW } from './AulaDani';

/**
 * "Treinamentos deste passo": as gravações recomendadas de cada Passo do leitor. O catálogo é
 * `data/treinamentos-por-passo.ts`.
 *
 * Onda E1 (SPEC-workflow-v3-decisoes-07-09 §2, itens 5, 7 e 9):
 * - o bloco vai para o FIM da tela do passo, depois das tarefas;
 * - cada cartão é título, a linha de quem deu / de onde veio / quanto dura, o "Por que ver agora" como
 *   descrição logo abaixo do título e só então o vídeo;
 * - o vídeo nasce como thumbnail (imagem da Bunny) com o botão de tocar: nenhum player carrega sozinho.
 *   O iframe só é montado no toque da pessoa, e é esse toque que dá o autoplay;
 * - na vista Campo o bloco inteiro fica oculto (quem decide é a tela do passo, no ScriptReader);
 * - nada de "Abrir em tela cheia" nem de "Ver na aula da Dani".
 *
 * Só um player fica montado por vez: abrir o segundo desmonta o primeiro.
 *
 * Thumbnail: o catálogo pode trazer `thumbUrl` por treinamento; sem ele, cai no pôster público da Bunny
 * (`<cdn>/<guid>/preview.webp`). Se a imagem não carregar, o cartão mostra uma placa navy com o título.
 */

/** CDN público da library 716048 da Bunny Stream (o mesmo vídeo do `embedUrl`). */
export const BUNNY_CDN = 'https://vz-6999111b-a97.b-cdn.net';

/** Pôster do treinamento: o do catálogo quando existir, senão o `preview.webp` da Bunny. */
export function thumbDoTreinamento(t: Treinamento): string {
  const doCatalogo = (t as Treinamento & { thumbUrl?: string }).thumbUrl;
  if (typeof doCatalogo === 'string' && doCatalogo.trim()) return doCatalogo.trim();
  return `${BUNNY_CDN}/${t.bunnyGuid}/preview.webp`;
}

const IconePlay: React.FC<{ tamanho?: number }> = ({ tamanho = 22 }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

export const ROTULO_TREINAMENTOS = 'Treinamentos deste passo';
export const ROTULO_PORQUE = 'Por que ver agora';

/** Linha de identificação da gravação: quem deu, de onde veio e quanto tempo tem. */
export function metaDoTreinamento(t: Treinamento): string {
  return `${t.palestrante} · ${t.tipo} · ${duracaoLegivel(t.duracaoMin)}`;
}

const CartaoTreinamento: React.FC<{ treinamento: Treinamento; aberto: boolean; onAssistir: () => void }> = ({ treinamento, aberto, onAssistir }) => {
  const tituloId = useId();
  const [semImagem, setSemImagem] = useState(false);
  return (
    <article className="script-treino-card min-w-0" aria-labelledby={tituloId} data-testid="treinamento-card" data-treinamento={treinamento.id}>
      <h4 id={tituloId} className="script-treino-titulo">{treinamento.titulo}</h4>
      <p className="script-treino-meta mt-0.5" data-testid="treinamento-meta">{metaDoTreinamento(treinamento)}</p>
      <p className="script-treino-porque mt-2">
        <span className="script-nota-rotulo">{ROTULO_PORQUE}</span>
        {treinamento.porQueAgora}
      </p>
      <div className="script-treino-player mt-2.5">
        {aberto ? (
          <iframe
            src={urlDoTreinamento(treinamento, { autoplay: true })}
            title={treinamento.titulo}
            className="absolute inset-0 h-full w-full border-0"
            allow={AULA_ALLOW}
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <button type="button" onClick={onAssistir} aria-label={`Assistir: ${treinamento.titulo}`} className="script-treino-assistir">
            {semImagem ? (
              <span className="script-treino-placa" data-testid="treinamento-placa">{treinamento.titulo}</span>
            ) : (
              <img
                src={thumbDoTreinamento(treinamento)}
                alt=""
                aria-hidden="true"
                loading="lazy"
                data-testid="treinamento-thumb"
                className="script-treino-thumb"
                onError={() => setSemImagem(true)}
              />
            )}
            <span className="script-treino-play" aria-hidden="true">
              <IconePlay tamanho={24} />
            </span>
          </button>
        )}
      </div>
    </article>
  );
};

/** O bloco inteiro do passo; sem treinamento recomendado, não desenha nada. */
export const TreinamentosPasso: React.FC<{ passo: number }> = ({ passo }) => {
  const lista = treinamentosDoPasso(passo);
  const [aberto, setAberto] = useState<string | null>(null);
  if (!lista.length) return null;
  return (
    <section className="script-treinos script-no-print min-w-0 mt-6" aria-label={ROTULO_TREINAMENTOS} data-testid="treinamentos-passo">
      <p className="script-nota-rotulo">{ROTULO_TREINAMENTOS}</p>
      <div className="space-y-3">
        {lista.map((t) => (
          <CartaoTreinamento key={t.id} treinamento={t} aberto={aberto === t.id} onAssistir={() => setAberto(t.id)} />
        ))}
      </div>
    </section>
  );
};

export default TreinamentosPasso;
