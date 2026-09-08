import React from 'react';
import type { ScriptDoc } from '../parseScript';
import { tabelaDeCanos } from '../PerfisTabela';
import { TabelaSecao } from './TabelaSecao';
import { CHECKLIST_PERFORMANCE } from './doutrina';

/**
 * A Preparação como cartão do dia a dia (SPEC-workflow-v4-decisoes-08-09 §2 item 23, decisão A6).
 *
 * O cartão de bolso deixou de existir e a Preparação tomou o lugar dele: é o que a pessoa baixa e leva para
 * a reunião. Este componente desenha esse cartão inteiro num nó só, `#script-preparacao-export`, com
 * largura de imagem (até 900 px), papel creme e títulos navy, para virar PNG sem recorte. Quem liga o botão
 * de baixar é a tela do script; aqui é só o desenho.
 *
 * O conteúdo é o do script (`## Mapa de preparação` e `## Performance e métricas`, quando existirem) mais
 * o checklist da Dani, que é doutrina fixa do leitor e igual para todo clube. Nada é reescrito.
 *
 * `campo` deixa o cartão no essencial da reunião: mapa e checklist, sem as métricas de acompanhamento.
 * `comId` desliga o `id` do download: a folha impressa também fecha com a Preparação, e o id do nó
 * exportado precisa ser único na página.
 */

export const ID_EXPORT = 'script-preparacao-export';
export const TITULO_CARTAO = 'Preparação e métricas';

const MapaCartao: React.FC<{ titulo: string; md: string; html: string }> = ({ titulo, md, html }) => {
  const tabela = tabelaDeCanos(md);
  return (
    <section className="script-prep-bloco script-mapa" data-testid="preparacao-mapa">
      <h3 className="script-prep-titulo">{titulo}</h3>
      {tabela
        ? <TabelaSecao tabela={tabela} />
        : <div className="script-md script-table" dangerouslySetInnerHTML={{ __html: html }} />}
    </section>
  );
};

export const PreparacaoCartao: React.FC<{ doc: ScriptDoc; campo?: boolean; comId?: boolean }> = ({ doc, campo, comId = true }) => {
  const extras = campo ? [] : doc.documentos.flatMap((d) => d.extras.filter((e) => e.titulo !== 'Abertura'));
  return (
    <div id={comId ? ID_EXPORT : undefined} className="script-prep-cartao" data-testid="preparacao-cartao">
      <header className="script-prep-cabecalho">
        <p className="script-nota-rotulo">Antes e depois da reunião</p>
        <h2 className="script-prep-h2">{TITULO_CARTAO}</h2>
        {doc.oferta && <p className="script-prep-oferta">{doc.oferta}</p>}
      </header>

      {doc.mapa && <MapaCartao titulo={doc.mapa.titulo} md={doc.mapa.md} html={doc.mapa.html} />}

      {extras.map((e) => (
        <section key={e.slug} className="script-prep-bloco" data-testid="preparacao-extra">
          <h3 className="script-prep-titulo">{e.titulo}</h3>
          <div className="script-md" dangerouslySetInnerHTML={{ __html: e.html }} />
        </section>
      ))}

      <section className="script-prep-bloco script-prep-checklist" data-testid="preparacao-checklist">
        <h3 className="script-prep-titulo">{CHECKLIST_PERFORMANCE.titulo}</h3>
        <ol className="script-prep-perguntas">
          {CHECKLIST_PERFORMANCE.perguntas.map((q, i) => (
            <li key={i} className="script-prep-pergunta">
              <span className="script-num" aria-hidden="true">{i + 1}</span>
              <span className="min-w-0 flex-1">{q}</span>
            </li>
          ))}
        </ol>
        <p className="script-prep-atribuicao">{CHECKLIST_PERFORMANCE.atribuicao}</p>
      </section>

      {!doc.mapa && extras.length === 0 && (
        <p className="script-prep-vazio">Esta versão veio sem mapa de preparação e sem métricas.</p>
      )}
    </div>
  );
};

export default PreparacaoCartao;
