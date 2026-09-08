import React from 'react';
import type { Bloco } from '../parseScript';
import { FalaCard } from '../ScriptPaper';

/**
 * Falas encadeadas (SPEC-workflow-v4-decisoes-08-09 §2, itens 13, 21 e 22).
 *
 * Quando as falas de um passo formam uma sequência lógica, uma puxando a outra, elas aparecem ligadas por
 * um trilho vertical: dá para ver de relance que é um caminho, não uma lista de opções. É o desenho padrão
 * de todos os passos; a exceção são os tipos de pergunta do Passo 2, que são alternativas e viram grupos.
 *
 * Os subtítulos que o script traz dentro das falas (`### Ancoragem por preço`, no Passo 5) viram marcos do
 * trilho: continuam sendo o mesmo texto do markdown, só que como etapa da sequência e não como cabeçalho
 * solto. Nada aqui reescreve fala nenhuma.
 */
export const FalasSequencia: React.FC<{
  bloco: Bloco;
  passo: number;
  semAnatomia?: boolean;
  /** Folha impressa e vista Campo: nada fechado atrás de clique. */
  abrirTudo?: boolean;
}> = ({ bloco, passo, semAnatomia, abrirTudo }) => (
  <section className="script-secao script-dizer" aria-label={bloco.rotulo || 'O que dizer'} data-testid="secao-falas">
    <p className="script-nota-rotulo">{bloco.rotulo || 'O que dizer'}</p>
    <ol className="script-sequencia" data-testid="falas-sequencia">
      {bloco.dizer.map((node, i) => (node.kind === 'sub'
        ? (
          <li key={i} className="script-sequencia-marco" data-testid="sequencia-marco">
            <span className="script-sequencia-marco-ponto" aria-hidden="true" />
            <h3 className="script-h3 script-sequencia-marco-titulo">{node.titulo}</h3>
          </li>
        )
        : (
          <li key={i} className="script-sequencia-item" data-testid="sequencia-item">
            <span className="script-sequencia-elo" aria-hidden="true" />
            <FalaCard fala={node} passo={passo} semAnatomia={semAnatomia} abrirTudo={abrirTudo} />
          </li>
        )))}
    </ol>
  </section>
);

export default FalasSequencia;
