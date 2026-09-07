import React, { useState } from 'react';
import { comTags, CopyButton } from '../ScriptPaper';
import type { GrupoPerguntas, SecaoPerguntas } from './modelo';
import { Icone, Secao } from './base';
import { ModalSecao } from './ModalSecao';

/**
 * Perguntas do passo (SPEC-workflow-v3-decisoes-07-09 §2 item 11).
 *
 * Com dois ou mais tipos de pergunta (no Passo 2, os quatro do CNCS: Contexto, Necessidade, Consequência,
 * Soluções), cada tipo vira um botao que abre a lista daquele tipo numa folha, com "copiar todas" e a nota
 * "Como usar estas perguntas" no alto. Sem tipos, a secao e um cartao de checklist, como sempre foi.
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

export const PerguntasSecao: React.FC<{ secao: SecaoPerguntas }> = ({ secao }) => {
  const [aberto, setAberto] = useState<number | null>(null);
  const comBotoes = secao.grupos.length >= 2;
  const grupo = aberto == null ? null : secao.grupos[aberto] || null;

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
                onClick={() => setAberto(i)}
                aria-haspopup="dialog"
                aria-label={`Ver as perguntas de ${g.curto}`}
              >
                <span className="script-perguntas-botao-nome">{g.curto}</span>
                <span className="script-perguntas-botao-conta">{g.itens.length}</span>
              </button>
            ))}
          </div>
          <ModalSecao
            titulo={grupo ? grupo.titulo : ''}
            aberto={grupo != null}
            onFechar={() => setAberto(null)}
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
            {secao.nota.length > 0 && (
              <div className="script-perguntas-nota" data-testid="perguntas-nota">
                <p className="script-nota-rotulo script-secao-rotulo"><Icone nome="bussola" />Como usar estas perguntas</p>
                <ul className="space-y-1">
                  {secao.nota.map((l, i) => (
                    <li key={i} className="flex items-start leading-relaxed"><span className="script-bolinha" aria-hidden="true" />{comTags(l)}</li>
                  ))}
                </ul>
              </div>
            )}
            {grupo && <ListaPerguntas grupo={grupo} />}
          </ModalSecao>
        </>
      )}

      {secao.itens.length > 0 && (
        <ul className={`script-perguntas-checklist ${comBotoes ? 'mt-3' : ''}`} data-testid="perguntas-checklist">
          {secao.itens.map((it, i) => (
            <li key={i} className="flex items-start leading-relaxed"><span className="script-check" aria-hidden="true" />{comTags(it)}</li>
          ))}
        </ul>
      )}

      {!comBotoes && secao.nota.length > 0 && (
        <div className="script-perguntas-nota mt-3" data-testid="perguntas-nota">
          <p className="script-nota-rotulo script-secao-rotulo"><Icone nome="bussola" />Como usar estas perguntas</p>
          <ul className="space-y-1">
            {secao.nota.map((l, i) => (
              <li key={i} className="flex items-start leading-relaxed"><span className="script-bolinha" aria-hidden="true" />{comTags(l)}</li>
            ))}
          </ul>
        </div>
      )}
    </Secao>
  );
};

export default PerguntasSecao;
