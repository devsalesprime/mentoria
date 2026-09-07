import React from 'react';
import { useCelular } from './base';

/**
 * Tabela do script (SPEC-workflow-v3-decisoes-07-09 §2 item 14: "texto de tabelas em colunas pequeno demais").
 *
 * No desktop e uma `<table>` de verdade, com 15 px de corpo e largura minima por coluna. Abaixo de 768 px
 * a mesma tabela vira um cartao por linha: a primeira coluna e o titulo do cartao e cada outra coluna
 * aparece como rotulo em maiusculas mais o texto, sem rolagem lateral e sem letra abaixo de 14 px.
 */

export interface DadosTabela { titulo?: string; colunas: string[]; linhas: string[][]; }

export const TabelaSecao: React.FC<{
  tabela: DadosTabela;
  className?: string;
  rolagemClassName?: string;
  tabelaClassName?: string;
}> = ({ tabela, className, rolagemClassName, tabelaClassName }) => {
  const celular = useCelular();
  if (celular) {
    return (
      <ul className={`script-tabela-cartoes ${className || ''}`} data-testid="tabela-cartoes">
        {tabela.linhas.map((linha, i) => (
          <li key={i} className="script-tabela-cartao" data-testid="tabela-cartao">
            <p className="script-tabela-cartao-titulo">{linha[0]}</p>
            {linha.slice(1).map((celula, j) => (
              celula ? (
                <div key={j} className="script-tabela-cartao-campo">
                  <span className="script-nota-rotulo">{tabela.colunas[j + 1] || ''}</span>
                  <span className="script-tabela-cartao-texto">{celula}</span>
                </div>
              ) : null
            ))}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className={`script-tabela-rolagem ${rolagemClassName || ''}`}>
      <table className={`script-tabela ${tabelaClassName || ''}`}>
        <thead>
          <tr>{tabela.colunas.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {tabela.linhas.map((linha, i) => (
            <tr key={i}>
              {linha.map((celula, j) => (
                <td key={j} className={j === 0 ? 'script-tabela-chave' : undefined}>{celula}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TabelaSecao;
