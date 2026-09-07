import React from 'react';
import type { PassoDoc } from '../parseScript';
import { agrupa } from '../ScriptPaper';
import { CabecalhoPasso } from './CabecalhoPasso';
import { FalasSecao } from './FalasSecao';
import { PerguntasSecao } from './PerguntasSecao';
import { ObservarSecao } from './ObservarSecao';
import { AvancarSecao } from './AvancarSecao';
import { ObjecoesSecao } from './ObjecoesSecao';
import { CalloutSecao } from './CalloutSecao';
import { BlocoSolto } from './BlocoSolto';
import { montarSecoes } from './modelo';

/**
 * O corpo de um passo montado por secoes (onda E2). A ordem e sempre a mesma, que e a do markdown:
 * cabecalho, falas, perguntas, o que observar, avancar ou voltar, silencio, objecoes, erro, criterio,
 * transicao, alerta e, por ultimo, o proximo passo obrigatorio.
 *
 * Vista Campo (item 13 da SPEC): fica so o que o vendedor usa na reuniao. Somem estado do cliente,
 * principio de conducao, o que observar, silencio e escuta, erro a evitar e criterio de sucesso; as falas
 * ficam sem a anatomia.
 */

export const CAMPO_ESCONDE = ['estado', 'principio', 'observar', 'silencio', 'erro', 'sucesso'] as const;

export const PassoSecoes: React.FC<{
  passo: PassoDoc | null;
  n: number;
  nome: string;
  /** Objetivo do Documento 1, usado quando o passo desta vista nao repete o rotulo. */
  objetivoAlternativo?: string;
  campo?: boolean;
}> = ({ passo, n, nome, objetivoAlternativo = '', campo }) => {
  const s = montarSecoes(passo, objetivoAlternativo);
  return (
    <>
      <CabecalhoPasso
        n={n}
        nome={nome}
        objetivo={s.objetivo}
        estado={campo ? '' : s.estado}
        principio={campo ? '' : s.principio}
      />
      {!passo && (
        <p className="text-sm text-prosperus-navy-panel/70 mt-4">
          Este passo não está no script de {campo ? 'campo' : 'treinamento'} desta versão.
        </p>
      )}
      {s.falas && <FalasSecao bloco={s.falas} passo={n} semAnatomia={campo} />}
      {s.perguntas && <PerguntasSecao secao={s.perguntas} />}
      {!campo && s.observar && <ObservarSecao bloco={s.observar} />}
      {s.avancar && <AvancarSecao bloco={s.avancar} decisao={s.decisao} />}
      {!campo && s.silencio && <CalloutSecao bloco={s.silencio} tom="silencio" />}
      {s.objecoes && <ObjecoesSecao bloco={s.objecoes} itens={s.objecoesItens} />}
      {!campo && s.erro && <CalloutSecao bloco={s.erro} tom="erro" />}
      {!campo && s.sucesso && <CalloutSecao bloco={s.sucesso} tom="sucesso" />}
      {s.transicao && <CalloutSecao bloco={s.transicao} tom="transicao" />}
      {s.alerta && <CalloutSecao bloco={s.alerta} tom="alerta" />}
      {agrupa(s.outros).map((item, i) => (Array.isArray(item)
        ? <div key={i} className="script-secao grid gap-3 sm:grid-cols-2">{item.map((b, j) => <BlocoSolto key={j} bloco={b} passo={n} semAnatomia={campo} />)}</div>
        : <BlocoSolto key={i} bloco={item} passo={n} semAnatomia={campo} />))}
      {s.proximo && <CalloutSecao bloco={s.proximo} tom="proximo" />}
    </>
  );
};

export default PassoSecoes;
