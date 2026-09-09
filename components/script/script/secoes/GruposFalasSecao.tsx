import React, { useState } from 'react';
import { comTags, CopyButton, FalaCard } from '../ScriptPaper';
import type { GrupoFalas } from './modelo';
import { Icone, Secao } from './base';
import { ModalSecao } from './ModalSecao';

/**
 * Os tipos de pergunta do Passo 2 (SPEC-workflow-v4-decisoes-08-09 §2, itens 14 e 18).
 *
 * A lista extensa de falas sai do corpo do passo e no lugar dela ficam os quatro botões do CNCS. Cada botão
 * abre a folha com as falas daquele tipo, cada uma com o título curto e a fala inteira, mais a nota "Como
 * usar estas perguntas" no alto. Os botões têm cara de botão: borda, ícone, contagem e a ação escrita.
 *
 * Pedido do dono em 09/09 (item 4b): dentro da folha a anatomia ("Por que funciona") nasce FECHADA, com o
 * mesmo botão do resto do leitor. Só a vista Campo e a folha impressa continuam com tudo aberto.
 *
 * Na vista Campo e na folha impressa nada é clicável (item 25): os quatro grupos aparecem abertos, um
 * embaixo do outro, com as falas na íntegra.
 */

export const ROTULO_ABRIR = 'Abrir as perguntas';
export const ROTULO_COPIAR_GRUPO = 'Copiar todas';
export const ROTULO_NOTA = 'Como usar estas perguntas';

const IconeLista: React.FC = () => (
  <svg className="script-secao-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M8.5 7h11" /><path d="M8.5 12h11" /><path d="M8.5 17h11" />
    <circle cx="4.6" cy="7" r="1.1" fill="currentColor" /><circle cx="4.6" cy="12" r="1.1" fill="currentColor" /><circle cx="4.6" cy="17" r="1.1" fill="currentColor" />
  </svg>
);

const Nota: React.FC<{ linhas: string[] }> = ({ linhas }) => (
  <div className="script-perguntas-nota" data-testid="perguntas-nota">
    <p className="script-nota-rotulo script-secao-rotulo"><Icone nome="bussola" />{ROTULO_NOTA}</p>
    <ul className="space-y-1">
      {linhas.map((l, i) => (
        <li key={i} className="flex items-start leading-relaxed"><span className="script-bolinha" aria-hidden="true" />{comTags(l)}</li>
      ))}
    </ul>
  </div>
);

/** As falas de um tipo, uma embaixo da outra, com título, fala e anatomia. */
const FalasDoGrupo: React.FC<{ grupo: GrupoFalas; passo: number; semAnatomia?: boolean; abrirTudo?: boolean }> = ({ grupo, passo, semAnatomia, abrirTudo }) => (
  <div className="script-grupo-falas" data-testid="grupo-falas">
    {grupo.falas.map((f, i) => <FalaCard key={i} fala={f} passo={passo} semAnatomia={semAnatomia} abrirTudo={abrirTudo} />)}
  </div>
);

export const GruposFalasSecao: React.FC<{
  rotulo: string;
  grupos: GrupoFalas[];
  nota: string[];
  passo: number;
  /** Campo ou folha impressa: os grupos nascem abertos, sem botão e sem folha. */
  aberto?: boolean;
  /** Vista Campo: sem a anatomia dentro das falas, como no resto do passo. */
  semAnatomia?: boolean;
}> = ({ rotulo, grupos, nota, passo, aberto, semAnatomia }) => {
  const [qual, setQual] = useState<number | null>(null);
  const grupo = qual == null ? null : grupos[qual] || null;
  if (!grupos.length) return null;

  if (aberto) {
    return (
      <Secao rotulo={rotulo} icone="pergunta" testId="secao-grupos-falas" className="script-grupos">
        {nota.length > 0 && <Nota linhas={nota} />}
        {grupos.map((g, i) => (
          <div key={i} className="script-grupo-aberto" data-testid="grupo-aberto">
            <h3 className="script-h3 script-grupo-titulo">{g.titulo}</h3>
            <FalasDoGrupo grupo={g} passo={passo} semAnatomia={semAnatomia} abrirTudo={!semAnatomia} />
          </div>
        ))}
      </Secao>
    );
  }

  return (
    <Secao rotulo={rotulo} icone="pergunta" testId="secao-grupos-falas" className="script-grupos">
      <div className="script-perguntas-botoes" data-testid="perguntas-botoes">
        {grupos.map((g, i) => (
          <button
            key={i}
            type="button"
            className="script-perguntas-botao script-grupo-botao"
            data-testid="perguntas-botao"
            onClick={() => setQual(i)}
            aria-haspopup="dialog"
            aria-label={`Abrir as perguntas de ${g.curto}`}
          >
            <span className="script-grupo-botao-corpo">
              <IconeLista />
              <span className="min-w-0">
                <span className="script-perguntas-botao-nome">{g.curto}</span>
                <span className="script-grupo-botao-acao">{ROTULO_ABRIR}</span>
              </span>
            </span>
            <span className="script-perguntas-botao-conta">{g.falas.length}</span>
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
            texto={grupo.falas.map((f) => f.texto).join('\n')}
            rotulo={ROTULO_COPIAR_GRUPO}
            ariaLabel={`Copiar as perguntas de ${grupo.curto}`}
            className="script-folha-copiar"
          />
        )}
      >
        {nota.length > 0 && <Nota linhas={nota} />}
        {grupo && (
          <ol className="script-perguntas-lista" data-testid="perguntas-lista">
            {grupo.falas.map((f, i) => (
              // Dentro da folha a anatomia nasce FECHADA, com o mesmo "Por que funciona" do resto do leitor
              // (pedido do dono em 09/09, item 4b). Aberta de saída, ela empurrava a fala para fora da tela.
              <li key={i} className="script-perguntas-fala" data-testid="perguntas-fala">
                <FalaCard fala={f} passo={passo} />
              </li>
            ))}
          </ol>
        )}
      </ModalSecao>
    </Secao>
  );
};

export default GruposFalasSecao;
