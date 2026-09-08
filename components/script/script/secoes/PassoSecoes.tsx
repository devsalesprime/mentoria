import React from 'react';
import type { PassoDoc, Premissa } from '../parseScript';
import { PASSO_DA_PREMISSA } from '../parseScript';
import { agrupa, PremissaBox } from '../ScriptPaper';
import { PerfisTabela, extrairPerfis } from '../PerfisTabela';
import { CabecalhoPasso } from './CabecalhoPasso';
import { FalasSequencia } from './FalasSequencia';
import { GruposFalasSecao } from './GruposFalasSecao';
import { PerguntasSecao } from './PerguntasSecao';
import { ObservarSecao } from './ObservarSecao';
import { AvancarSecao } from './AvancarSecao';
import { ObjecoesSecao } from './ObjecoesSecao';
import { CalloutSecao } from './CalloutSecao';
import { BlocoSolto } from './BlocoSolto';
import { montarSecoes, textoDoBloco } from './modelo';

/**
 * O corpo de um passo montado por seções (onda E2, refeito na onda F).
 *
 * A ordem é sempre a mesma: cabeçalho (objetivo, estado do cliente, princípio de condução), a tabela de
 * perfis quando o passo traz uma (Passo 1, item 16 da SPEC-workflow-v4-decisoes-08-09), a premissa REP no
 * Passo 2 (item 19), as falas, as perguntas que continuam na tela, o que observar, quando avançar ou
 * voltar, silêncio, objeções, erro a evitar, transição, alerta e, por último, o próximo passo obrigatório.
 *
 * O que mudou na onda F:
 * - "Perguntas recomendadas" não é mais desenhado em passo nenhum (item 14); o conteúdo continua no `.md`;
 * - no Passo 2 os quatro tipos do CNCS substituem a lista extensa de falas (item 18);
 * - "Critério de sucesso" entra dentro de "Quando avançar" (item 15), em vez de ser um aviso à parte;
 * - as falas encadeadas viram sequência ligada (item 13) e só as alternativas ficam em lista.
 *
 * Vista Campo (item 13 da SPEC v3, item 25 da v4): fica só o que o vendedor usa na reunião. Somem estado do
 * cliente, princípio de condução, o que observar, silêncio e escuta, erro a evitar e critério de sucesso; as
 * falas ficam sem a anatomia e nada é clicável: os grupos aparecem abertos.
 */

export const CAMPO_ESCONDE = ['estado', 'principio', 'observar', 'silencio', 'erro', 'sucesso'] as const;

export const PassoSecoes: React.FC<{
  passo: PassoDoc | null;
  n: number;
  nome: string;
  /** Objetivo do Documento 1, usado quando o passo desta vista nao repete o rotulo. */
  objetivoAlternativo?: string;
  /** Passo do Documento 1: de onde sai a tabela de perfis quando a vista Campo nao a traz. */
  passoAlternativo?: PassoDoc | null;
  /** Premissa REP do script: desenhada no Passo 2, entre o princípio de condução e as perguntas. */
  premissa?: Premissa | null;
  campo?: boolean;
  /** Folha impressa: tudo aberto, nada atrás de clique. */
  todosVisiveis?: boolean;
}> = ({ passo, n, nome, objetivoAlternativo = '', passoAlternativo = null, premissa = null, campo, todosVisiveis }) => {
  // "Quem está do outro lado" sai do corpo e vira tabela de verdade logo abaixo do princípio de condução.
  const perfis = extrairPerfis(passo) || extrairPerfis(passoAlternativo);
  const corpo = passo && perfis && passo.blocos.includes(perfis.bloco)
    ? { ...passo, blocos: passo.blocos.filter((b) => b !== perfis.bloco) }
    : passo;
  const s = montarSecoes(corpo, objetivoAlternativo);
  const abrirTudo = !!todosVisiveis;
  const gruposAbertos = !!campo || abrirTudo;
  const criterio = campo ? '' : textoDoBloco(s.sucesso);
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
      {perfis && <PerfisTabela tabela={perfis.tabela} />}
      {premissa && n === PASSO_DA_PREMISSA && (
        <section className="script-secao" data-testid="secao-premissa">
          <PremissaBox premissa={premissa} />
        </section>
      )}
      {s.falas && s.modoFalas === 'grupos' && (
        <GruposFalasSecao
          rotulo={s.falas.rotulo || 'Fala sugerida'}
          grupos={s.gruposFalas}
          nota={s.notaPerguntas}
          passo={n}
          aberto={gruposAbertos}
          semAnatomia={campo}
        />
      )}
      {s.falas && s.modoFalas === 'sequencia' && (
        <FalasSequencia bloco={s.falas} passo={n} semAnatomia={campo} abrirTudo={abrirTudo} />
      )}
      {s.perguntas && <PerguntasSecao secao={s.perguntas} aberto={gruposAbertos} />}
      {!campo && s.observar && <ObservarSecao bloco={s.observar} />}
      {(s.avancar || criterio) && <AvancarSecao bloco={s.avancar} decisao={s.decisao} criterio={criterio} />}
      {!campo && s.silencio && <CalloutSecao bloco={s.silencio} tom="silencio" />}
      {s.objecoes && <ObjecoesSecao bloco={s.objecoes} itens={s.objecoesItens} aberto={gruposAbertos} />}
      {!campo && s.erro && <CalloutSecao bloco={s.erro} tom="erro" />}
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
