import React from 'react';
import type { Bloco } from '../parseScript';
import { FalaCard } from '../ScriptPaper';

/**
 * As falas do passo, nos dois documentos: cartoes numerados, a citacao em serifa grande, os campos de
 * personalizacao como etiquetas e o botao de copiar. No Treinamento a anatomia continua fechada atras de
 * "Por que funciona"; na vista Campo ela nao aparece.
 *
 * O texto de cada fala fica em nos de texto simples e o cartao nao e remontado quando o resto da tela muda:
 * e o que mantem a ancora dos grifos valendo.
 */
export const FalasSecao: React.FC<{ bloco: Bloco; passo: number; semAnatomia?: boolean }> = ({ bloco, passo, semAnatomia }) => (
  <section className="script-secao script-dizer" aria-label={bloco.rotulo || 'O que dizer'} data-testid="secao-falas">
    <p className="script-nota-rotulo">{bloco.rotulo || 'O que dizer'}</p>
    <div className="space-y-3">
      {bloco.dizer.map((node, i) => (node.kind === 'sub'
        ? <h3 key={i} className="script-h3 script-falas-sub font-serif text-lg text-prosperus-navy-panel">{node.titulo}</h3>
        : <FalaCard key={i} fala={node} passo={passo} semAnatomia={semAnatomia} />))}
    </div>
  </section>
);

export default FalasSecao;
