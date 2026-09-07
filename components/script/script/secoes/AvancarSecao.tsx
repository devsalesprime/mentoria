import React from 'react';
import type { Bloco } from '../parseScript';
import { comTags } from '../ScriptPaper';
import type { Decisao } from './modelo';
import { Secao } from './base';

/**
 * "Avançar ou voltar": cartao de decisao em duas colunas quando o texto traz o gancho do "volte"
 * (`separarDecisao`); sem ele, um cartao so com o texto inteiro. Nada e reescrito.
 */
export const AvancarSecao: React.FC<{ bloco: Bloco; decisao: Decisao | null }> = ({ bloco, decisao }) => {
  const texto = (bloco.inline || bloco.itens.join(' ')).trim();
  if (!texto) return null;
  return (
    <Secao rotulo={bloco.rotulo || 'Avançar ou voltar'} icone="setas" testId="secao-avancar">
      {decisao ? (
        <div className="script-decisao">
          <div className="script-decisao-lado script-decisao-avance" data-testid="decisao-avance">
            <p className="script-nota-rotulo">Quando avançar</p>
            <p className="leading-relaxed">{comTags(decisao.avance)}</p>
          </div>
          <div className="script-decisao-lado script-decisao-volte" data-testid="decisao-volte">
            <p className="script-nota-rotulo">Quando voltar</p>
            <p className="leading-relaxed">{comTags(decisao.volte)}</p>
          </div>
        </div>
      ) : (
        <div className="script-decisao-unico" data-testid="decisao-unico">
          <p className="leading-relaxed">{comTags(texto)}</p>
        </div>
      )}
    </Secao>
  );
};

export default AvancarSecao;
