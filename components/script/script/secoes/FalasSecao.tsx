import React from 'react';
import type { Bloco } from '../parseScript';
import { FalaCard } from '../ScriptPaper';

/**
 * As falas do passo como lista separada: cartões independentes, um por fala, sem o trilho da sequência.
 * É o desenho das falas alternativas, em que a pessoa escolhe uma e não percorre todas.
 *
 * O desenho padrão dos passos é o `FalasSequencia` (SPEC-workflow-v4-decisoes-08-09 §2 item 13); quem
 * decide entre os dois é o `PassoSecoes`, pelo `modoFalas` do modelo.
 *
 * O texto de cada fala fica em nós de texto simples e o cartão não é remontado quando o resto da tela muda:
 * é o que mantém a âncora dos grifos valendo.
 */
export const FalasSecao: React.FC<{ bloco: Bloco; passo: number; semAnatomia?: boolean; abrirTudo?: boolean }> = ({ bloco, passo, semAnatomia, abrirTudo }) => (
  <section className="script-secao script-dizer" aria-label={bloco.rotulo || 'O que dizer'} data-testid="secao-falas">
    <p className="script-nota-rotulo">{bloco.rotulo || 'O que dizer'}</p>
    <div className="space-y-3">
      {bloco.dizer.map((node, i) => (node.kind === 'sub'
        ? <h3 key={i} className="script-h3 script-falas-sub font-serif text-lg text-prosperus-navy-panel">{node.titulo}</h3>
        : <FalaCard key={i} fala={node} passo={passo} semAnatomia={semAnatomia} abrirTudo={abrirTudo} />))}
    </div>
  </section>
);

export default FalasSecao;
