import React from 'react';
import type { Bloco } from '../parseScript';
import { comTags } from '../ScriptPaper';
import { Icone, type NomeIcone } from './base';

/**
 * Avisos de uma linha, cada um com a sua cor: "Silêncio e escuta" (quieto), "Erro a evitar" (vermelho),
 * "Critério de sucesso" (verde), "Transição" e "Alerta" do Documento 2 e o "Próximo passo obrigatório",
 * que fica sempre no fim do passo.
 */

export type TomCallout = 'silencio' | 'erro' | 'sucesso' | 'transicao' | 'alerta' | 'proximo';

const ICONES: Record<TomCallout, NomeIcone> = {
  silencio: 'escuta',
  erro: 'alerta',
  sucesso: 'certo',
  transicao: 'setas',
  alerta: 'alerta',
  proximo: 'certo',
};

export const CalloutSecao: React.FC<{ bloco: Bloco; tom: TomCallout; testId?: string }> = ({ bloco, tom, testId }) => {
  const texto = (bloco.inline || '').trim();
  const itens = bloco.itens.filter((i) => i.trim());
  if (!texto && !itens.length) return null;
  return (
    <section className={`script-secao script-callout script-callout-${tom}`} aria-label={bloco.rotulo} data-testid={testId || `secao-${tom}`}>
      <p className="script-nota-rotulo script-secao-rotulo">
        <Icone nome={ICONES[tom]} />
        {bloco.rotulo}
      </p>
      {texto && <p className="script-callout-texto">{comTags(texto)}</p>}
      {itens.length > 0 && (
        <ul className="mt-1 space-y-1">
          {itens.map((it, i) => (
            <li key={i} className="flex items-start leading-relaxed"><span className="script-bolinha" aria-hidden="true" />{comTags(it)}</li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default CalloutSecao;
