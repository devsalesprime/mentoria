import React, { useId, useState } from 'react';
import { duracaoLegivel, treinamentosDoPasso, urlDoTreinamento, type Treinamento } from '../../../data/treinamentos-por-passo';
import { AULA_ALLOW } from './AulaDani';

/**
 * "Treinamentos deste passo": até 2 gravações recomendadas em cada Passo do leitor (onda C,
 * SPEC-workflow-v2-decisoes-06-09 §1 decisão 4 e §3). O catálogo é `data/treinamentos-por-passo.ts`.
 *
 * Mesma mecânica da aula da Dani (`AulaDani`): o cartão nasce com o pôster e o player (iframe da Bunny)
 * só é montado quando a pessoa toca em "Assistir", com `autoplay=true`. Aqui um passo pode ter dois
 * treinamentos, então só um player fica montado por vez: abrir o segundo desmonta o primeiro.
 *
 * A aula macro "Os 7 Passos da Venda" continua onde estava (Sumário e item "Aula" da barra), fora daqui.
 */

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
  return (
    <article className="script-treino-card min-w-0" aria-labelledby={tituloId} data-testid="treinamento-card" data-treinamento={treinamento.id}>
      <h4 id={tituloId} className="script-treino-titulo">{treinamento.titulo}</h4>
      <p className="script-treino-meta mt-0.5" data-testid="treinamento-meta">{metaDoTreinamento(treinamento)}</p>
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
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-prosperus-gold-dark text-prosperus-navy-dark" aria-hidden="true">
              <IconePlay tamanho={22} />
            </span>
            Assistir
          </button>
        )}
      </div>
      <p className="script-treino-porque mt-2.5">
        <span className="script-nota-rotulo">{ROTULO_PORQUE}</span>
        {treinamento.porQueAgora}
      </p>
    </article>
  );
};

/** O bloco inteiro do passo; sem treinamento recomendado, não desenha nada. */
export const TreinamentosPasso: React.FC<{ passo: number }> = ({ passo }) => {
  const lista = treinamentosDoPasso(passo);
  const [aberto, setAberto] = useState<string | null>(null);
  if (!lista.length) return null;
  return (
    <section className="script-treinos script-no-print min-w-0 mb-5" aria-label={ROTULO_TREINAMENTOS} data-testid="treinamentos-passo">
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
