import React from 'react';
import type { Bloco } from '../parseScript';
import { comTags } from '../ScriptPaper';
import type { Decisao } from './modelo';
import { Secao } from './base';
import { ROTULO_AVANCAR, ROTULO_CRITERIO, ROTULO_DECISAO, ROTULO_VOLTAR } from './doutrina';

/**
 * "Quando avançar / Quando voltar" (SPEC-workflow-v4-decisoes-08-09 §2, itens 15 e 17).
 *
 * Um molde só, igual nos 7 passos e nos dois documentos: duas colunas no desktop, empilhadas no celular.
 * "Quando avançar" junta o que o script escreveu em "Avançar ou voltar" com o "Critério de sucesso", que
 * era o mesmo assunto dito duas vezes; "Quando voltar" fica com a parte do texto que fala em voltar.
 * Nada é reescrito: as duas colunas são recortes do texto aprovado. Sem a parte de voltar, a coluna some
 * e a de avançar ocupa a linha inteira.
 */
export const AvancarSecao: React.FC<{
  bloco: Bloco | null;
  decisao: Decisao | null;
  /** Texto do "Critério de sucesso", que passa a viver dentro de "Quando avançar". */
  criterio?: string;
}> = ({ bloco, decisao, criterio }) => {
  const texto = bloco ? (bloco.inline || bloco.itens.join(' ')).trim() : '';
  const avance = (decisao ? decisao.avance : texto).trim();
  const volte = decisao ? decisao.volte.trim() : '';
  const criterioTexto = (criterio || '').trim();
  if (!avance && !volte && !criterioTexto) return null;
  return (
    <Secao rotulo={bloco?.rotulo || ROTULO_DECISAO} icone="setas" testId="secao-avancar">
      <div className={`script-decisao${volte ? '' : ' script-decisao-so-avance'}`}>
        <div className="script-decisao-lado script-decisao-avance" data-testid="decisao-avance">
          <p className="script-nota-rotulo">{ROTULO_AVANCAR}</p>
          {avance && <p className="leading-relaxed">{comTags(avance)}</p>}
          {criterioTexto && (
            <p className="script-decisao-criterio" data-testid="decisao-criterio">
              <span className="script-nota-rotulo">{ROTULO_CRITERIO}</span>
              {comTags(criterioTexto)}
            </p>
          )}
        </div>
        {volte && (
          <div className="script-decisao-lado script-decisao-volte" data-testid="decisao-volte">
            <p className="script-nota-rotulo">{ROTULO_VOLTAR}</p>
            <p className="leading-relaxed">{comTags(volte)}</p>
          </div>
        )}
      </div>
    </Secao>
  );
};

export default AvancarSecao;
