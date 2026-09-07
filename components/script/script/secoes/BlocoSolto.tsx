import React from 'react';
import type { Bloco } from '../parseScript';
import { PassoCorpo } from '../ScriptPaper';
import { TabelaSecao } from './TabelaSecao';
import { tabelaDeCanos } from '../PerfisTabela';

/**
 * Rede de seguranca: bloco que nao caiu em nenhum molde continua desenhado como antes (`PassoCorpo`).
 * A unica esperteza aqui e a tabela: markdown de canos vira a tabela responsiva em vez de HTML cru.
 */
export const BlocoSolto: React.FC<{ bloco: Bloco; passo: number; semAnatomia?: boolean }> = ({ bloco, passo, semAnatomia }) => {
  const tabela = tabelaDeCanos(bloco.md);
  if (tabela) {
    return (
      <section className="script-secao" aria-label={bloco.rotulo || 'Tabela'} data-testid="secao-tabela">
        {bloco.rotulo && <p className="script-nota-rotulo">{bloco.rotulo}</p>}
        <TabelaSecao tabela={tabela} />
      </section>
    );
  }
  return (
    <div className="script-secao">
      <PassoCorpo passo={{ n: passo, nome: '', titulo: '', blocos: [bloco] }} semAnatomia={semAnatomia} />
    </div>
  );
};

export default BlocoSolto;
