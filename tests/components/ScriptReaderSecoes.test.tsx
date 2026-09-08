import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { parseScript, tituloDaFala, tituloHeuristico, tituloEscritoDaLinha, PASSO_DA_PREMISSA } from '../../components/script/script/parseScript';
import type { Fala, PassoDoc } from '../../components/script/script/parseScript';
import {
  montarSecoes, montarPerguntas, separarDecisao, separarObjecao, rotuloCurtoGrupo,
  gruposDasFalas, gruposDeFalas, modoDasFalas, ehPerguntasRecomendadas,
} from '../../components/script/script/secoes/modelo';
import { ScriptPaper } from '../../components/script/script/ScriptPaper';
import { PassoSecoes } from '../../components/script/script/secoes/PassoSecoes';
import { CabecalhoPasso } from '../../components/script/script/secoes/CabecalhoPasso';
import { ObservarSecao } from '../../components/script/script/secoes/ObservarSecao';
import { AvancarSecao } from '../../components/script/script/secoes/AvancarSecao';
import { ObjecoesSecao } from '../../components/script/script/secoes/ObjecoesSecao';
import { CalloutSecao } from '../../components/script/script/secoes/CalloutSecao';
import { TabelaSecao } from '../../components/script/script/secoes/TabelaSecao';
import { PreparacaoCartao, ID_EXPORT } from '../../components/script/script/secoes/PreparacaoCartao';
import { CHECKLIST_PERFORMANCE, NOTA_PERFIS } from '../../components/script/script/secoes/doutrina';
import { ROTULO_ABRIR } from '../../components/script/script/secoes/GruposFalasSecao';

/**
 * Onda F (SPEC-workflow-v4-decisoes-08-09 §2, itens 12 a 23): a apresentação de cada passo muda, o texto
 * aprovado não. Os testes rodam direto sobre `PassoSecoes`, o corpo de um passo, porque é essa a frente:
 * a navegação e as telas são testadas por quem cuida delas.
 *
 * A fixture (`tests/fixtures/script-secoes-v4.md`) é o formato de verdade da v5: premissa REP em `##`,
 * Passo 1 com a tabela de perfis e uma fala com título escrito e outra sem, Passo 2 com os quatro tipos do
 * CNCS, Passo 5 com subtítulos e o Documento 2 com `**Perguntas:**`.
 */

const MD = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/script-secoes-v4.md'), 'utf8');
const DOC = parseScript(MD);
const D1 = DOC.documentos[0];
const D2 = DOC.documentos[1];
const P1 = D1.passos[0];
const P2 = D1.passos[1];
const P5 = D1.passos[2];
const C1 = D2.passos[0];
const C2 = D2.passos[1];

function blocoFalso(over: Partial<any> = {}): any {
  return { tipo: 'outro', rotulo: 'Rótulo', inline: '', itens: [], grupos: [], dizer: [], md: '', ...over };
}

function falaFalsa(over: Partial<Fala> = {}): Fala {
  return { kind: 'fala', n: 1, titulo: '', texto: '', direcao: '', voz: null, vozRotulo: '', anatomia: [], anatomiaBruta: [], ...over };
}

/** O corpo de um passo, como o leitor desenha. */
function abrirPasso(passo: PassoDoc | null, over: Partial<React.ComponentProps<typeof PassoSecoes>> = {}) {
  const utils = render(
    <div data-testid="corpo">
      <PassoSecoes passo={passo} n={passo?.n || 1} nome={passo?.nome || 'Passo'} {...over} />
    </div>
  );
  return { ...utils, corpo: screen.getByTestId('corpo') };
}

/** matchMedia do jsdom (que não existe): a consulta responde o que o teste pedir. */
function fingirLargura(celular: boolean) {
  (window as any).matchMedia = (media: string) => ({
    media,
    matches: celular,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

afterEach(() => { delete (window as any).matchMedia; });

describe('parseScript · as seções de um passo de verdade', () => {
  it('cada rótulo vira um objeto de seção; o objetivo do Documento 1 cobre o Documento 2', () => {
    const s = montarSecoes(P1);
    expect(s.objetivo).toContain('fazer o cliente responder sim, em segundos');
    expect(s.estado).toContain('ele baixou a guarda');
    expect(s.principio).toContain('a pessoa vem antes da empresa');
    expect(s.falas!.dizer.filter((n) => n.kind === 'fala')).toHaveLength(2);
    expect(s.observar!.itens).toHaveLength(2);
    expect(s.decisao).not.toBeNull();
    expect(s.silencio!.inline).toContain('cale e deixe ele reagir');
    expect(s.objecoesItens).toHaveLength(2);
    expect(s.erro!.inline).toContain('abrir falando do clube');
    expect(s.sucesso!.inline).toContain('autorizou as perguntas em voz alta');
    expect(s.transicao).toBeNull();
    expect(s.proximo).toBeNull();

    const c = montarSecoes(C1, s.objetivo);
    expect(c.objetivo).toBe(s.objetivo);
    expect(c.transicao!.inline).toContain('o que te fez estar aqui hoje');
    expect(c.alerta!.inline).toContain('abertura de um minuto');
    expect(c.proximo!.inline).toContain('autorizou as perguntas em voz alta');
    expect(c.estado).toBe('');
  });

  it('"Quem está do outro lado" como subtítulo vira bloco próprio e as falas continuam inteiras', () => {
    const falas = P1.blocos.find((b) => b.tipo === 'dizer')!;
    expect(falas.md).not.toContain('|--|');
    expect(falas.dizer.filter((n) => n.kind === 'fala')).toHaveLength(2);
    const perfis = P1.blocos.find((b) => b.rotulo === 'Quem está do outro lado');
    expect(perfis).toBeTruthy();
    expect(perfis!.md).toContain('| Dominante |');
  });

  it('a premissa REP escrita como seção vira doc.premissa e sai dos extras (item 19)', () => {
    expect(DOC.premissa).not.toBeNull();
    expect(DOC.premissa!.titulo).toBe('Premissa REP: Repetir, Elogiar, Perguntar');
    expect(DOC.premissa!.citacao).toMatch(/Alex Hormozi/);
    expect(D1.extras.map((e) => e.titulo)).not.toContain('Premissa REP: Repetir, Elogiar, Perguntar');
    expect(PASSO_DA_PREMISSA).toBe(2);
  });

  it('separarDecisao pega os vários jeitos de escrever o voltar; separarObjecao e o rótulo curto', () => {
    expect(separarDecisao('avance quando ele responder sobre si; volte se ele só falar de números.')).toEqual({
      avance: 'avance quando ele responder sobre si',
      volte: 'volte se ele só falar de números.',
    });
    // "continue aqui" no meio da frase: o corte é no começo da frase, não na marca
    expect(separarDecisao('avance quando tiver a dor escrita. Se faltar algum deles, continue aqui.')).toEqual({
      avance: 'avance quando tiver a dor escrita.',
      volte: 'Se faltar algum deles, continue aqui.',
    });
    expect(separarDecisao('avance quando ele confirmar. Qualquer outra resposta significa voltar ao Passo 3.')!.volte)
      .toContain('significa voltar ao Passo 3');
    expect(separarDecisao('encerre com decisão tomada. Sem isso, você abandonou a venda.')!.volte)
      .toContain('Sem isso');
    expect(separarDecisao('avance quando a dor estiver escrita.')).toBeNull();
    expect(separarDecisao('')).toBeNull();

    expect(separarObjecao('Objeção: "Quanto custa isso?" Resposta: "O preço a gente conversa depois."')).toEqual({
      objecao: 'Quanto custa isso?',
      resposta: 'O preço a gente conversa depois.',
    });
    expect(separarObjecao('ele some depois da reunião')).toEqual({ objecao: 'ele some depois da reunião', resposta: '' });

    expect(rotuloCurtoGrupo('C · Contexto')).toBe('Contexto');
    expect(rotuloCurtoGrupo('N · Necessidade (desejo antes da dor)')).toBe('Necessidade');
    expect(rotuloCurtoGrupo('Ancoragem por preço')).toBe('Ancoragem por preço');
    expect(gruposDasFalas(null)).toEqual([]);
    expect(gruposDeFalas(null)).toEqual([]);
    expect(montarPerguntas(null, null)).toBeNull();
  });
});

describe('item 12 · título curto na frente de cada fala', () => {
  it('lê o título escrito "**Fala N · Título**" e mantém o número', () => {
    expect(tituloEscritoDaLinha('**Fala 3 · Entrega de controle**')).toEqual({ n: 3, titulo: 'Entrega de controle' });
    expect(tituloEscritoDaLinha('**Fala sugerida:**')).toBeNull();
    expect(tituloEscritoDaLinha('1. "uma fala"')).toBeNull();

    const falas = montarSecoes(P1).falas!.dizer.filter((n) => n.kind === 'fala') as Fala[];
    expect(falas[0].titulo).toBe('Abertura com domínio');
    expect(falas[0].n).toBe(1);
    expect(tituloDaFala(falas[0])).toBe('Abertura com domínio');
    // a fala sem título escrito ganha o título deduzido, com no máximo seis palavras e sem pontuação no fim
    expect(falas[1].titulo).toBe('');
    expect(tituloDaFala(falas[1])).toBe('O nosso objetivo nestes 40 minutos');
  });

  it('a heurística corta na primeira pontuação e cai no componente da anatomia quando a oração é curta', () => {
    expect(tituloHeuristico(falaFalsa({ texto: 'Antes do número, quero deixar claro o que você decide.' })))
      .toBe('Antes do número');
    expect(tituloHeuristico(falaFalsa({ texto: 'Percebe a diferença? Esses dois números são seus.' })))
      .toBe('Percebe a diferença');
    // saudação curta: o título vem do primeiro componente da anatomia, que também foi escrito no documento
    expect(tituloHeuristico(falaFalsa({
      texto: '[FALA DO VENDEDOR] Oi, [nome], tudo bem? Prazer em falar com você.',
      anatomia: [{ componente: 'Conexão', trecho: 'Oi', porque: 'abre com uma resposta fácil' }],
    }))).toBe('Conexão');
    expect(tituloHeuristico(falaFalsa({ texto: '' }))).toBe('');
  });

  it('o cartão mostra o título como rótulo principal e o número como marca secundária', () => {
    const { corpo } = abrirPasso(P1);
    const titulos = within(corpo).getAllByTestId('fala-titulo').map((e) => e.textContent);
    expect(titulos).toEqual(['Abertura com domínio', 'O nosso objetivo nestes 40 minutos']);
    expect(within(corpo).getAllByTestId('fala-ordem').map((e) => e.textContent)).toEqual(['Fala 1', 'Fala 2']);
  });
});

describe('item 13 · sequência ligada e lista separada', () => {
  it('todo passo é sequência, menos os tipos de pergunta do Passo 2', () => {
    expect(montarSecoes(P1).modoFalas).toBe('sequencia');
    expect(montarSecoes(P5).modoFalas).toBe('sequencia');
    expect(montarSecoes(C1).modoFalas).toBe('sequencia');
    expect(montarSecoes(P2).modoFalas).toBe('grupos');
    expect(montarSecoes(C2).modoFalas).toBe('grupos');
    expect(modoDasFalas(null, null)).toBe('sequencia');
  });

  it('a sequência liga as falas num trilho e os subtítulos do Passo 5 viram marcos (itens 21 e 22)', () => {
    const { corpo } = abrirPasso(P5);
    expect(within(corpo).getByTestId('falas-sequencia')).toBeInTheDocument();
    expect(within(corpo).getAllByTestId('sequencia-item')).toHaveLength(3);
    expect(within(corpo).getAllByTestId('sequencia-marco').map((e) => e.textContent)).toEqual([
      'Ancoragem por preço', 'Ancoragem por resultado', 'Condições e fechamento',
    ]);
    // subtítulo do Passo 5 nunca vira botão
    expect(within(corpo).queryByTestId('perguntas-botao')).toBeNull();
  });

  it('no Documento 2 o "Perguntas" continua como lista separada', () => {
    const { corpo } = abrirPasso(C1, { campo: true });
    const perguntas = within(corpo).getByTestId('secao-perguntas');
    expect(within(perguntas).getByText('Perguntas')).toBeInTheDocument();
    expect(within(corpo).getByTestId('perguntas-checklist')).toHaveTextContent('chegou por indicação');
  });
});

describe('item 14 e 18 · "Perguntas recomendadas" some e o CNCS vira botão', () => {
  it('"Perguntas recomendadas" não é desenhado em passo nenhum, mas o conteúdo segue no documento', () => {
    expect(ehPerguntasRecomendadas('Perguntas recomendadas')).toBe(true);
    expect(ehPerguntasRecomendadas('Perguntas')).toBe(false);
    expect(montarSecoes(P1).perguntas).toBeNull();
    expect(montarSecoes(P2).perguntas).toBeNull();
    // o bloco continua parseado (só não vai para a tela)
    expect(montarSecoes(P1).perguntasBrutas!.itens).toHaveLength(2);

    const { corpo } = abrirPasso(P1);
    expect(within(corpo).queryByTestId('secao-perguntas')).toBeNull();
    expect(corpo.textContent).not.toContain('você está em qual cidade?');
  });

  it('os quatro botões do CNCS substituem a lista extensa e têm cara de botão', () => {
    const { corpo } = abrirPasso(P2);
    expect(within(corpo).queryByTestId('falas-sequencia')).toBeNull();
    const botoes = within(corpo).getAllByTestId('perguntas-botao');
    expect(botoes.map((b) => b.querySelector('.script-perguntas-botao-nome')?.textContent)).toEqual([
      'Contexto', 'Necessidade', 'Consequência', 'Soluções que você já tentou',
    ]);
    expect(botoes[0].tagName).toBe('BUTTON');
    expect(botoes[0]).toHaveAttribute('aria-haspopup', 'dialog');
    expect(botoes[0]).toHaveAttribute('aria-label', 'Abrir as perguntas de Contexto');
    expect(botoes[0]).toHaveTextContent(ROTULO_ABRIR);
    expect(botoes[0].querySelector('svg')).not.toBeNull();
    expect(botoes[0]).toHaveTextContent('2');
    // a lista extensa saiu do corpo
    expect(corpo.textContent).not.toContain('Se daqui a 12 meses tudo tivesse dado certo');
  });

  it('o botão abre a folha com as falas do tipo, o "por que funciona" aberto e a nota no alto', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    const { corpo } = abrirPasso(P2);
    expect(screen.queryByTestId('perguntas-folha')).toBeNull();
    fireEvent.click(within(corpo).getAllByTestId('perguntas-botao')[0]);

    const folha = await screen.findByTestId('perguntas-folha');
    expect(folha).toHaveAttribute('role', 'dialog');
    expect(folha).toHaveAttribute('aria-modal', 'true');
    expect(within(folha).getByText('C · Contexto')).toBeInTheDocument();
    expect(within(folha).getByTestId('perguntas-nota')).toHaveTextContent('repertório, não roteiro');
    const falas = within(folha).getAllByTestId('perguntas-fala');
    expect(falas).toHaveLength(2);
    expect(within(folha).getAllByTestId('fala-titulo')[0]).toHaveTextContent('Então me conta com as suas');
    expect(folha).toHaveTextContent('o que te fez estar aqui hoje?');
    // "por que funciona" já aberto dentro da folha
    expect(within(folha).getByText(/pergunta ampla devolve o controle ao cliente/)).toBeInTheDocument();
    expect(within(folha).queryByRole('button', { name: 'Por que funciona' })).toBeNull();
    // a folha vai para fora do corpo do passo: o texto dela não entra no índice dos grifos
    expect(corpo.contains(folha)).toBe(false);

    fireEvent.click(within(folha).getByRole('button', { name: /Copiar as perguntas de Contexto/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('o que te fez estar aqui hoje?')));

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('perguntas-folha')).toBeNull());
  });
});

describe('item 15 e 17 · um molde só de "Quando avançar / Quando voltar"', () => {
  it('o critério de sucesso entra dentro de "Quando avançar" e some como aviso separado', () => {
    const { corpo } = abrirPasso(P1);
    expect(within(corpo).queryByTestId('secao-sucesso')).toBeNull();
    const avance = within(corpo).getByTestId('decisao-avance');
    expect(avance).toHaveTextContent('Quando avançar');
    expect(avance).toHaveTextContent('avance quando ele responder à sua última pergunta');
    expect(within(avance).getByTestId('decisao-criterio')).toHaveTextContent('autorizou as perguntas em voz alta');
    const volte = within(corpo).getByTestId('decisao-volte');
    expect(volte).toHaveTextContent('Quando voltar');
    expect(volte).toHaveTextContent('refaça a entrega de controle');
    // o erro a evitar continua sozinho
    expect(within(corpo).getByTestId('secao-erro')).toHaveTextContent('abrir falando do clube');
  });

  it('o mesmo molde nos outros passos, mesmo quando o texto escreve o voltar de outro jeito', () => {
    for (const passo of [P2, P5]) {
      const { corpo, unmount } = abrirPasso(passo);
      expect(within(corpo).getByTestId('decisao-avance')).toHaveTextContent('Quando avançar');
      expect(within(corpo).getByTestId('decisao-volte')).toHaveTextContent('Quando voltar');
      expect(within(corpo).queryByTestId('secao-sucesso')).toBeNull();
      unmount();
    }
  });

  it('sem a parte do voltar, a coluna some e "Quando avançar" ocupa a linha', () => {
    const bloco = blocoFalso({ tipo: 'avancar', rotulo: 'Avançar ou voltar', inline: 'avance quando a dor estiver escrita.' });
    render(<AvancarSecao bloco={bloco} decisao={separarDecisao(bloco.inline)} criterio="ele disse a dor em voz alta" />);
    expect(screen.getByTestId('decisao-avance')).toHaveTextContent('avance quando a dor estiver escrita.');
    expect(screen.getByTestId('decisao-criterio')).toHaveTextContent('ele disse a dor em voz alta');
    expect(screen.queryByTestId('decisao-volte')).toBeNull();
  });
});

describe('item 16 e 19 · perfis no Passo 1 e REP no Passo 2', () => {
  it('a tabela de perfis fica acima da fala sugerida, com a conclusão fixa embaixo', () => {
    const { corpo } = abrirPasso(P1);
    const perfis = within(corpo).getByTestId('perfis-tabela');
    const falas = within(corpo).getByTestId('secao-falas');
    const principio = within(corpo).getByTestId('secao-principio');
    expect(principio.compareDocumentPosition(perfis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(perfis.compareDocumentPosition(falas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(perfis).getByTestId('perfis-nota')).toHaveTextContent(NOTA_PERFIS);
    expect(within(perfis).getByText('Dominante')).toBeInTheDocument();
    // o markdown cru da tabela não sobra no corpo
    expect(corpo.textContent).not.toContain('|--|');
  });

  it('a vista Campo pega a tabela do Documento 1 quando o passo de campo não a traz', () => {
    const semTabela = { ...C1, blocos: C1.blocos.filter((b) => b.rotulo !== 'Quem está do outro lado') };
    const { corpo } = abrirPasso(semTabela, { campo: true, passoAlternativo: P1 });
    expect(within(corpo).getByTestId('perfis-tabela')).toBeInTheDocument();
  });

  it('a premissa REP aparece no Passo 2, entre o princípio de condução e as perguntas', () => {
    const { corpo } = abrirPasso(P2, { premissa: DOC.premissa });
    const premissa = within(corpo).getByTestId('secao-premissa');
    expect(premissa).toHaveTextContent('Premissa REP: Repetir, Elogiar, Perguntar');
    expect(premissa).toHaveTextContent(/Alex Hormozi/);
    const grupos = within(corpo).getByTestId('secao-grupos-falas');
    expect(premissa.compareDocumentPosition(grupos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a premissa não é desenhada nos outros passos', () => {
    const { corpo } = abrirPasso(P1, { premissa: DOC.premissa });
    expect(within(corpo).queryByTestId('secao-premissa')).toBeNull();
  });
});

describe('item 23 · a Preparação como cartão baixável', () => {
  it('um nó só para exportar, com o mapa, as métricas e o checklist da Dani', () => {
    fingirLargura(false);
    const { container } = render(<PreparacaoCartao doc={DOC} />);
    const cartao = container.querySelector(`#${ID_EXPORT}`)!;
    expect(cartao).not.toBeNull();
    expect(cartao.getAttribute('id')).toBe('script-preparacao-export');
    expect(within(cartao as HTMLElement).getByTestId('preparacao-mapa')).toHaveTextContent('Mapa de preparação');
    expect(within(cartao as HTMLElement).getByRole('table')).toBeInTheDocument();
    expect(within(cartao as HTMLElement).getByTestId('preparacao-extra')).toHaveTextContent('Performance e métricas');

    const checklist = within(cartao as HTMLElement).getByTestId('preparacao-checklist');
    expect(checklist).toHaveTextContent(CHECKLIST_PERFORMANCE.titulo);
    expect(within(checklist).getAllByRole('listitem')).toHaveLength(10);
    expect(checklist).toHaveTextContent('Deixei o cliente falar mais do que eu?');
    expect(checklist).toHaveTextContent('Pedi a recomendação / indicação de novos clientes?');
    expect(checklist).toHaveTextContent('Dani Martins, no treinamento Mentalidade de CEO com foco em receita.');
  });

  it('as 10 perguntas do checklist saem do material da camada comum, sem travessão', () => {
    expect(CHECKLIST_PERFORMANCE.perguntas).toHaveLength(10);
    for (const q of CHECKLIST_PERFORMANCE.perguntas) {
      expect(q).not.toContain('—');
      expect(q).not.toContain('–');
      expect(q.endsWith('?') || q.endsWith(')')).toBe(true);
    }
    expect(CHECKLIST_PERFORMANCE.titulo).toBe('Checklist de performance da venda, por Dani Martins (10 perguntas para avaliar uma reunião)');
  });

  it('no cartão de campo ficam o mapa e o checklist, sem as métricas de acompanhamento', () => {
    fingirLargura(false);
    render(<PreparacaoCartao doc={DOC} campo />);
    expect(screen.queryByTestId('preparacao-extra')).toBeNull();
    expect(screen.getByTestId('preparacao-checklist')).toBeInTheDocument();
  });
});

describe('item 25 · vista Campo e folha impressa com tudo aberto', () => {
  it('Campo esconde estado, princípio, observar, silêncio, erro, critério e a anatomia', () => {
    const { corpo } = abrirPasso(C1, { campo: true, objetivoAlternativo: 'fazer o cliente responder sim' });
    for (const id of ['secao-estado', 'secao-principio', 'secao-observar', 'secao-silencio', 'secao-erro', 'secao-sucesso']) {
      expect(within(corpo).queryByTestId(id)).toBeNull();
    }
    expect(within(corpo).queryByTestId('anatomia')).toBeNull();
    expect(within(corpo).getByTestId('passo-objetivo')).toHaveTextContent('fazer o cliente responder sim');
    expect(within(corpo).getByTestId('secao-falas')).toHaveTextContent('Eu sou do time comercial do Prosperus Club');
    expect(within(corpo).getByTestId('secao-transicao')).toBeInTheDocument();
    expect(within(corpo).getByTestId('secao-alerta')).toBeInTheDocument();
    expect(within(corpo).getByTestId('secao-proximo')).toHaveTextContent('autorizou as perguntas em voz alta');
  });

  it('em Campo os quatro tipos ficam abertos na tela, sem botão e sem folha', () => {
    const { corpo } = abrirPasso(C2, { campo: true });
    expect(within(corpo).queryByTestId('perguntas-botao')).toBeNull();
    const abertos = within(corpo).getAllByTestId('grupo-aberto');
    expect(abertos.map((g) => g.querySelector('.script-grupo-titulo')?.textContent)).toEqual([
      'C · Contexto', 'N · Necessidade (desejo antes da dor)',
    ]);
    expect(corpo.textContent).toContain('O que te fez estar aqui hoje?');
    expect(corpo.textContent).toContain('Se daqui a 12 meses tudo tivesse dado certo');
    expect(within(corpo).queryByTestId('anatomia')).toBeNull();
  });

  it('na folha impressa a anatomia nasce aberta e as objeções não têm o que clicar', () => {
    const { corpo } = abrirPasso(P1, { todosVisiveis: true });
    expect(within(corpo).queryByRole('button', { name: 'Por que funciona' })).toBeNull();
    expect(within(corpo).getByText(/apresenta a pessoa antes da estrutura/)).toBeInTheDocument();
    const objecoes = within(corpo).getByTestId('secao-objecoes');
    expect(within(objecoes).getAllByTestId('objecao-resposta')).toHaveLength(2);
    expect(within(objecoes).queryByRole('button')).toBeNull();
  });

  it('no Treinamento a anatomia continua fechada atrás de "Por que funciona"', () => {
    const { corpo } = abrirPasso(P1);
    const anatomias = within(corpo).getAllByTestId('anatomia');
    expect(anatomias).toHaveLength(2);
    expect(within(anatomias[0]).getByRole('button', { name: 'Por que funciona' })).toBeInTheDocument();
    expect(corpo.textContent).not.toContain('apresenta a pessoa antes da estrutura');
    fireEvent.click(within(anatomias[0]).getByRole('button', { name: 'Por que funciona' }));
    expect(corpo.textContent).toContain('apresenta a pessoa antes da estrutura');
  });
});

describe('a folha e a tela desenham a mesma coisa', () => {
  function abrirFolha() {
    const { container } = render(
      <ScriptPaper
        doc={DOC}
        clubNome="Prosperus Club"
        versao={1}
        escritoEm="08/09/2026"
        docAtivo="d1"
        todosVisiveis
        refFor={() => () => undefined}
        comentariosDo={() => null}
      />
    );
    return container.querySelector('#script-print-root') as HTMLElement;
  }

  it('a folha usa o mesmo corpo de passo da tela: sem "Perguntas recomendadas" e sem cartão de bolso', () => {
    fingirLargura(false);
    const folha = abrirFolha();
    expect(within(folha).queryByText('Perguntas recomendadas')).toBeNull();
    expect(folha.textContent).not.toContain('você está em qual cidade?');
    expect(folha.textContent).not.toContain('O que hoje só anda quando você está presente?');
    // o `**Perguntas:**` do Documento 2 continua, que é a lista curta de alternativas
    expect(within(folha).getAllByTestId('perguntas-checklist').length).toBeGreaterThan(0);
    expect(folha.querySelector('#script-cartao')).toBeNull();
    expect(within(folha).queryByText('Cartão de bolso')).toBeNull();
    // o corpo do passo veio do PassoSecoes: cabeçalho canônico e sequência ligada
    expect(within(folha).getAllByTestId('passo-cabecalho').length).toBe(DOC.documentos.flatMap((d) => d.passos).length);
    expect(within(folha).getAllByTestId('falas-sequencia').length).toBeGreaterThan(0);
  });

  it('a premissa REP aparece uma vez só, dentro do Passo 2, e não no alto do Documento 1', () => {
    fingirLargura(false);
    const folha = abrirFolha();
    const premissas = within(folha).getAllByTestId('premissa');
    expect(premissas).toHaveLength(1);
    const passo2 = folha.querySelector('#d1-p2')!;
    expect(passo2.contains(premissas[0])).toBe(true);
  });

  it('na folha a decisão é a mesma dos dois lados e nada fica atrás de clique', () => {
    fingirLargura(false);
    const folha = abrirFolha();
    expect(within(folha).queryByRole('button', { name: 'Por que funciona' })).toBeNull();
    expect(within(folha).queryByTestId('perguntas-botao')).toBeNull();
    expect(within(folha).getAllByTestId('grupo-aberto').length).toBeGreaterThan(0);
    expect(within(folha).queryAllByTestId('secao-sucesso')).toHaveLength(0);
    const avances = within(folha).getAllByTestId('decisao-avance');
    expect(avances.length).toBe(DOC.documentos.flatMap((d) => d.passos).length);
    expect(avances[0]).toHaveTextContent('Quando avançar');
  });

  it('a Preparação fecha a folha, com o checklist da Dani', () => {
    fingirLargura(false);
    const folha = abrirFolha();
    // na folha o cartão nasce sem o id do download: esse id é do nó da tela da Preparação
    const cartao = within(folha).getByTestId('preparacao-cartao');
    expect(folha.querySelector('#script-preparacao-export')).toBeNull();
    expect(within(cartao as HTMLElement).getByTestId('preparacao-checklist')).toHaveTextContent('Deixei o cliente falar mais do que eu?');
  });
});

describe('item 2 do retrabalho · a decisão do Campo vem do Documento 1', () => {
  it('nenhum passo do Documento 2 escreve "Avançar ou voltar" nem "Critério de sucesso"', () => {
    for (const p of D2.passos) {
      expect(montarSecoes(p).avancar).toBeNull();
      expect(montarSecoes(p).sucesso).toBeNull();
    }
  });

  it('sem o bloco no passo de campo, o molde usa o texto do passo correspondente do Documento 1', () => {
    const { corpo } = abrirPasso(C1, { campo: true, passoAlternativo: P1 });
    const avance = within(corpo).getByTestId('decisao-avance');
    expect(avance).toHaveTextContent('Quando avançar');
    expect(avance).toHaveTextContent('avance quando ele responder à sua última pergunta');
    expect(within(corpo).getByTestId('decisao-volte')).toHaveTextContent('refaça a entrega de controle');
    // o critério de sucesso continua fora da vista Campo (CAMPO_ESCONDE)
    expect(within(corpo).queryByTestId('decisao-criterio')).toBeNull();
  });

  it('sem passo do Documento 1 para herdar, o Campo simplesmente não desenha a decisão', () => {
    const { corpo } = abrirPasso(C1, { campo: true });
    expect(within(corpo).queryByTestId('secao-avancar')).toBeNull();
  });

  it('no Treinamento nada é herdado: o passo usa o próprio texto', () => {
    const { corpo } = abrirPasso(P2, { passoAlternativo: P1 });
    expect(within(corpo).getByTestId('decisao-avance')).toHaveTextContent('avance quando você tiver escritos a dor principal');
  });
});

describe('moldes de seção', () => {
  it('cabeçalho: medalha, nome, objetivo em uma linha e a dupla estado + princípio', () => {
    render(
      <CabecalhoPasso
        n={1}
        nome="Conexão (com Abertura)"
        objetivo="fazer o cliente responder sim em segundos"
        estado="ele baixou a guarda"
        principio="a pessoa vem antes da empresa"
      />
    );
    expect(screen.getByText('Passo 1 de 7')).toBeInTheDocument();
    expect(screen.getByText('Conexão (com Abertura)')).toBeInTheDocument();
    expect(screen.getByTestId('passo-objetivo')).toHaveTextContent('fazer o cliente responder sim em segundos');
    const estado = screen.getByTestId('secao-estado');
    expect(within(estado).getByText('Estado do cliente')).toBeInTheDocument();
    expect(estado).toHaveTextContent('ele baixou a guarda');
    expect(screen.getByTestId('secao-principio')).toHaveTextContent('a pessoa vem antes da empresa');
  });

  it('cabeçalho sem estado e sem princípio não desenha a dupla', () => {
    render(<CabecalhoPasso n={3} nome="Apresentação" objetivo="mostrar só o que resolve" estado="" principio="" />);
    expect(screen.queryByTestId('passo-dupla')).toBeNull();
  });

  it('o que observar: um sinal por linha', () => {
    render(<ObservarSecao bloco={blocoFalso({ tipo: 'observar', rotulo: 'O que observar', itens: ['O ritmo da resposta', 'Se ele pergunta preço cedo'] })} />);
    expect(screen.getAllByTestId('sinal')).toHaveLength(2);
    expect(screen.getByTestId('secao-observar')).toHaveTextContent('O ritmo da resposta');
  });

  it('objeções: uma por linha, fechadas; tocar abre a resposta e fecha a anterior', () => {
    const bloco = blocoFalso({ tipo: 'objecoes', rotulo: 'Objeções possíveis e resposta' });
    const itens = [
      { objecao: 'Eu só tenho alguns minutos hoje.', resposta: 'Perfeito, eu me adapto.' },
      { objecao: 'Me manda tudo por WhatsApp.', resposta: 'Material genérico não te ajuda a decidir.' },
    ];
    render(<ObjecoesSecao bloco={bloco} itens={itens} />);
    const linhas = screen.getAllByTestId('objecao');
    expect(linhas).toHaveLength(2);
    expect(screen.queryByTestId('objecao-resposta')).toBeNull();
    fireEvent.click(within(linhas[0]).getByRole('button'));
    expect(screen.getByTestId('objecao-resposta')).toHaveTextContent('Perfeito, eu me adapto.');
    expect(within(linhas[0]).getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(linhas[1]).getByRole('button'));
    expect(screen.getAllByTestId('objecao-resposta')).toHaveLength(1);
    expect(screen.getByTestId('objecao-resposta')).toHaveTextContent('Material genérico não te ajuda a decidir.');
  });

  it('avisos: erro em vermelho, critério em verde, próximo passo em navy', () => {
    render(
      <>
        <CalloutSecao bloco={blocoFalso({ tipo: 'erro', rotulo: 'Erro a evitar', inline: 'abrir falando da estrutura' })} tom="erro" />
        <CalloutSecao bloco={blocoFalso({ tipo: 'sucesso', rotulo: 'Critério de sucesso', inline: 'ele autorizou as perguntas' })} tom="sucesso" />
        <CalloutSecao bloco={blocoFalso({ tipo: 'silencio', rotulo: 'Silêncio e escuta', inline: 'cale e deixe ele reagir' })} tom="silencio" />
        <CalloutSecao bloco={blocoFalso({ tipo: 'proximo', rotulo: 'Próximo passo obrigatório', inline: 'o cliente autorizou' })} tom="proximo" />
      </>
    );
    expect(screen.getByTestId('secao-erro').className).toContain('script-callout-erro');
    expect(screen.getByTestId('secao-sucesso').className).toContain('script-callout-sucesso');
    expect(screen.getByTestId('secao-silencio').className).toContain('script-callout-silencio');
    expect(screen.getByTestId('secao-proximo')).toHaveTextContent('o cliente autorizou');
    expect(screen.getByTestId('secao-erro').querySelector('svg')).not.toBeNull();
  });

  it('o próximo passo obrigatório fica no fim do corpo do passo', () => {
    const { corpo } = abrirPasso(C1, { campo: true });
    const proximo = within(corpo).getByTestId('secao-proximo');
    const falas = within(corpo).getByTestId('secao-falas');
    expect(falas.compareDocumentPosition(proximo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('tabelas responsivas', () => {
  const tabela = {
    colunas: ['Perfil', 'Como reconhecer', 'O que fazer na abertura'],
    linhas: [
      ['Dominante', 'vai direto ao ponto', 'seja curto e diga o objetivo'],
      ['Conforme', 'pede dado e detalhe', 'leve número e critério'],
    ],
  };

  it('no desktop é tabela de verdade', () => {
    fingirLargura(false);
    render(<TabelaSecao tabela={tabela} />);
    const t = screen.getByRole('table');
    expect(within(t).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(tabela.colunas);
    expect(within(t).getAllByRole('row')).toHaveLength(3);
    expect(screen.queryByTestId('tabela-cartoes')).toBeNull();
  });

  it('abaixo de 768 px vira um cartão por linha, com rótulo e texto de cada coluna', () => {
    fingirLargura(true);
    render(<TabelaSecao tabela={tabela} />);
    expect(screen.queryByRole('table')).toBeNull();
    const cartoes = screen.getAllByTestId('tabela-cartao');
    expect(cartoes).toHaveLength(2);
    expect(within(cartoes[0]).getByText('Dominante')).toBeInTheDocument();
    expect(within(cartoes[0]).getByText('Como reconhecer')).toBeInTheDocument();
    expect(within(cartoes[0]).getByText('vai direto ao ponto')).toBeInTheDocument();
    expect(within(cartoes[1]).getByText('leve número e critério')).toBeInTheDocument();
  });

  it('a tabela "Quem está do outro lado" do passo acompanha a largura', () => {
    fingirLargura(true);
    const { corpo } = abrirPasso(P1);
    const secao = within(corpo).getByTestId('perfis-tabela');
    expect(within(secao).queryByRole('table')).toBeNull();
    expect(within(secao).getAllByTestId('tabela-cartao')).toHaveLength(2);
    expect(within(secao).getByText('Dominante')).toBeInTheDocument();
  });
});

describe('copy das seções', () => {
  it('sem travessão, sem jargão e sem a palavra proibida, nas duas vistas e na doutrina', () => {
    for (const [passo, over] of [[P1, {}], [P2, { premissa: DOC.premissa }], [P5, {}], [C1, { campo: true }]] as const) {
      const { corpo, unmount } = abrirPasso(passo as PassoDoc, over as any);
      const texto = corpo.textContent || '';
      expect(texto).not.toContain('—');
      expect(texto).not.toContain('–');
      expect(texto.toLowerCase()).not.toContain(['diagn', 'óstico'].join(''));
      expect(texto.toLowerCase()).not.toContain('a definir');
      expect(texto).not.toMatch(/\bjob\b|cohort/i);
      unmount();
    }
    for (const t of [NOTA_PERFIS, CHECKLIST_PERFORMANCE.titulo, CHECKLIST_PERFORMANCE.atribuicao, ROTULO_ABRIR]) {
      expect(t).not.toContain('—');
      expect(t).not.toContain('–');
      expect(t).not.toContain('!');
    }
  });
});
