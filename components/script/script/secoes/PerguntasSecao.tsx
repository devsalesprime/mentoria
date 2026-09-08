import React, { useState } from 'react';
import { comTags, CopyButton } from '../ScriptPaper';
import type { GrupoPerguntas, SecaoPerguntas } from './modelo';
import { Icone, Secao } from './base';
import { ModalSecao } from './ModalSecao';

/**
 * Perguntas do passo (SPEC-workflow-v3-decisoes-07-09 §2 item 11).
 *
 * "Perguntas recomendadas" não chega mais aqui: a onda F tirou o bloco da tela em todos os passos
 * (SPEC-workflow-v4-decisoes-08-09 §2 item 14). O que sobra é o `**Perguntas:**` do Documento 2, uma lista
 * curta de alternativas, que continua como cartão de checklist. Quando um script trouxer tipos de pergunta
 * dentro do próprio bloco, cada tipo vira um botão que abre a lista daquele tipo numa folha.
 *
 * Com `aberto` (vista Campo e folha impressa, item 25) os tipos aparecem abertos em vez de botões.
 */

export const ROTULO_COPIAR_TUDO = 'Copiar todas';

const ListaPerguntas: React.FC<{ grupo: GrupoPerguntas }> = ({ grupo }) => (
  <ol className="script-perguntas-lista" data-testid="perguntas-lista">
    {grupo.itens.map((it, i) => (
      <li key={i} className="script-perguntas-item">
        <span className="script-num" aria-hidden="true">{i + 1}</span>
        <span className="min-w-0 flex-1">{comTags(it)}</span>
      </li>
    ))}
  </ol>
);

const Nota: React.FC<{ linhas: string[]; className?: string }> = ({ linhas, className }) => (
  <div className={`script-perguntas-nota ${className || ''}`} data-testid="perguntas-nota">
    <p className="script-nota-rotulo script-secao-rotulo"><Icone nome="bussola" />Como usar estas perguntas</p>
    <ul className="space-y-1">
      {linhas.map((l, i) => (
        <li key={i} className="flex items-start leading-relaxed"><span className="script-bolinha" aria-hidden="true" />{comTags(l)}</li>
      ))}
    </ul>
  </div>
);

export const PerguntasSecao: React.FC<{ secao: SecaoPerguntas; aberto?: boolean }> = ({ secao, aberto }) => {
  const [qual, setQual] = useState<number | null>(null);
  const comBotoes = secao.grupos.length >= 2 && !aberto;
  const grupo = qual == null ? null : secao.grupos[qual] || null;

  return (
    <Secao rotulo={secao.rotulo} icone="pergunta" testId="secao-perguntas">
      {comBotoes && (
        <>
          <div className="script-perguntas-botoes" data-testid="perguntas-botoes">
            {secao.grupos.map((g, i) => (
              <button
                key={i}
                type="button"
                className="script-perguntas-botao"
                data-testid="perguntas-botao"
                onClick={() => setQual(i)}
                aria-haspopup="dialog"
                aria-label={`Abrir as perguntas de ${g.curto}`}
              >
                <span className="script-perguntas-botao-nome">{g.curto}</span>
                <span className="script-perguntas-botao-conta">{g.itens.length}</span>
              </button>
            ))}
          </div>
          <ModalSecao
            titulo={grupo ? grupo.titulo : ''}
            aberto={grupo != null}
            onFechar={() => setQual(null)}
            testId="perguntas-folha"
            acoes={grupo && (
              <CopyButton
                texto={grupo.itens.join('\n')}
                rotulo={ROTULO_COPIAR_TUDO}
                ariaLabel={`Copiar as perguntas de ${grupo.curto}`}
                className="script-folha-copiar"
              />
            )}
          >
            {secao.nota.length > 0 && <Nota linhas={secao.nota} />}
            {grupo && <ListaPerguntas grupo={grupo} />}
          </ModalSecao>
        </>
      )}

      {aberto && secao.grupos.length > 0 && (
        <>
          {secao.nota.length > 0 && <Nota linhas={secao.nota} />}
          {secao.grupos.map((g, i) => (
            <div key={i} className="script-grupo-aberto" data-testid="grupo-aberto">
              <h3 className="script-h3 script-grupo-titulo">{g.titulo}</h3>
              <ListaPerguntas grupo={g} />
            </div>
          ))}
        </>
      )}

      {secao.itens.length > 0 && (
        <ul className={`script-perguntas-checklist ${secao.grupos.length ? 'mt-3' : ''}`} data-testid="perguntas-checklist">
          {secao.itens.map((it, i) => (
            <li key={i} className="flex items-start leading-relaxed"><span className="script-check" aria-hidden="true" />{comTags(it)}</li>
          ))}
        </ul>
      )}

      {!comBotoes && !aberto && secao.nota.length > 0 && <Nota linhas={secao.nota} className="mt-3" />}
    </Secao>
  );
};

export default PerguntasSecao;
