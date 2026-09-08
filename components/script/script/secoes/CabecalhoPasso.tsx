import React from 'react';
import { comTags } from '../ScriptPaper';
import { Icone } from './base';

/**
 * Cabecalho de um passo: medalha com o numero, nome canonico, o objetivo estrategico como uma linha de
 * abertura e, embaixo, a dupla "Estado do cliente" e "Princípio de condução" em dois cartoes creme
 * (empilhados no celular). O texto e o mesmo do markdown; muda so a moldura.
 */

const CartaoNota: React.FC<{ rotulo: string; icone: 'pessoa' | 'bussola'; texto: string; testId: string }> = ({ rotulo, icone, texto, testId }) => (
  <div className="script-cartao-nota" data-testid={testId}>
    <p className="script-nota-rotulo script-secao-rotulo">
      <Icone nome={icone} />
      {rotulo}
    </p>
    <p className="script-cartao-nota-texto">{comTags(texto)}</p>
  </div>
);

export const CabecalhoPasso: React.FC<{
  n: number;
  nome: string;
  objetivo: string;
  rotuloObjetivo?: string;
  estado: string;
  principio: string;
  /** A linha de ordem acima do nome. Na tela é "Passo N de 7"; na folha impressa, só "Passo N". */
  ordem?: string;
}> = ({ n, nome, objetivo, rotuloObjetivo, estado, principio, ordem }) => (
  <header className="script-passo-cabecalho" data-testid="passo-cabecalho">
    <div className="flex items-center gap-4">
      <span className="script-medalha" aria-hidden="true">{n}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.22em] text-prosperus-gold-dark font-semibold">{ordem || `Passo ${n} de 7`}</p>
        <h2 className="script-h2 font-serif text-2xl sm:text-[1.7rem] leading-tight text-prosperus-navy-panel">{nome}</h2>
      </div>
    </div>
    {objetivo && (
      <p className="script-objetivo script-passo-objetivo" data-testid="passo-objetivo">
        <span className="script-nota-rotulo">{rotuloObjetivo || 'Objetivo estratégico'}</span>
        <span className="font-serif text-[1.15rem] leading-snug text-prosperus-navy-panel">{comTags(objetivo)}</span>
      </p>
    )}
    {(estado || principio) && (
      <div className="script-cartoes-dupla" data-testid="passo-dupla">
        {estado && <CartaoNota rotulo="Estado do cliente" icone="pessoa" texto={estado} testId="secao-estado" />}
        {principio && <CartaoNota rotulo="Princípio de condução" icone="bussola" texto={principio} testId="secao-principio" />}
      </div>
    )}
  </header>
);

export default CabecalhoPasso;
