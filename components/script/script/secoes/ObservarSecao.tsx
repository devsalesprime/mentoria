import React from 'react';
import type { Bloco } from '../parseScript';
import { comTags } from '../ScriptPaper';
import { Secao } from './base';

/** "O que observar": os sinais do cliente, um por linha, num cartao claro. */
export const ObservarSecao: React.FC<{ bloco: Bloco }> = ({ bloco }) => {
  const sinais = bloco.itens.length ? bloco.itens : (bloco.inline ? [bloco.inline] : []);
  if (!sinais.length) return null;
  return (
    <Secao rotulo={bloco.rotulo || 'O que observar'} icone="olho" testId="secao-observar">
      <ul className="script-sinais">
        {sinais.map((s, i) => (
          <li key={i} className="script-sinal" data-testid="sinal">
            <span className="script-bolinha" aria-hidden="true" />
            <span className="min-w-0 flex-1">{comTags(s)}</span>
          </li>
        ))}
      </ul>
    </Secao>
  );
};

export default ObservarSecao;
