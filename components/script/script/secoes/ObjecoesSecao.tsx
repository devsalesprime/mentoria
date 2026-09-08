import React, { useState } from 'react';
import type { Bloco } from '../parseScript';
import { comTags } from '../ScriptPaper';
import type { ObjecaoItem } from './modelo';
import { Secao } from './base';

/**
 * "Objeções possíveis e resposta": uma objecao por item, fechada; tocar abre a resposta.
 * A lista fica curta na tela e a resposta aparece so quando ela for necessaria.
 *
 * Com `aberto` (vista Campo e folha impressa, SPEC-workflow-v4-decisoes-08-09 §2 item 25) todas as
 * respostas ja nascem visiveis e nao existe nada para clicar.
 */
export const ObjecoesSecao: React.FC<{ bloco: Bloco; itens: ObjecaoItem[]; aberto?: boolean }> = ({ bloco, itens, aberto: tudoAberto }) => {
  const [aberto, setAberto] = useState<number | null>(null);
  if (!itens.length) return null;
  if (tudoAberto) {
    return (
      <Secao rotulo={bloco.rotulo || 'Objeções possíveis e resposta'} icone="conversa" testId="secao-objecoes">
        <ul className="script-objecoes">
          {itens.map((o, i) => (
            <li key={i} className="script-objecao" data-testid="objecao">
              <p className="script-objecao-titulo script-objecao-titulo-fixo">{comTags(o.objecao)}</p>
              {o.resposta && <p className="script-objecao-resposta" data-testid="objecao-resposta">{comTags(o.resposta)}</p>}
            </li>
          ))}
        </ul>
      </Secao>
    );
  }
  return (
    <Secao rotulo={bloco.rotulo || 'Objeções possíveis e resposta'} icone="conversa" testId="secao-objecoes">
      <ul className="script-objecoes">
        {itens.map((o, i) => {
          const abertaAgora = aberto === i;
          return (
            <li key={i} className="script-objecao" data-testid="objecao">
              <button
                type="button"
                className="script-objecao-titulo"
                aria-expanded={abertaAgora}
                onClick={() => setAberto(abertaAgora ? null : i)}
              >
                <span className="script-objecao-seta" aria-hidden="true">{abertaAgora ? '\u2212' : '+'}</span>
                <span className="min-w-0 flex-1">{comTags(o.objecao)}</span>
              </button>
              {abertaAgora && o.resposta && (
                <p className="script-objecao-resposta" data-testid="objecao-resposta">{comTags(o.resposta)}</p>
              )}
            </li>
          );
        })}
      </ul>
    </Secao>
  );
};

export default ObjecoesSecao;
