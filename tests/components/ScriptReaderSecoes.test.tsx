import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { ScriptReader } from '../../components/script/script/ScriptReader';
import { parseScript } from '../../components/script/script/parseScript';
import {
  montarSecoes, montarPerguntas, separarDecisao, separarObjecao, rotuloCurtoGrupo, gruposDasFalas,
} from '../../components/script/script/secoes/modelo';
import { CabecalhoPasso } from '../../components/script/script/secoes/CabecalhoPasso';
import { ObservarSecao } from '../../components/script/script/secoes/ObservarSecao';
import { AvancarSecao } from '../../components/script/script/secoes/AvancarSecao';
import { ObjecoesSecao } from '../../components/script/script/secoes/ObjecoesSecao';
import { CalloutSecao } from '../../components/script/script/secoes/CalloutSecao';
import { TabelaSecao } from '../../components/script/script/secoes/TabelaSecao';
import { PerguntasSecao } from '../../components/script/script/secoes/PerguntasSecao';

/**
 * Onda E2 (SPEC-workflow-v3-decisoes-07-09 §2, itens 11, 13 e 14): cada rótulo do markdown vira uma seção
 * com molde próprio. O texto gerado não muda; muda como ele aparece.
 * O markdown daqui é o do script de verdade (Passo 1 e Passo 2, os dois documentos), encurtado.
 */

const MD = [
  '# Documento 1 · Script completo para treinamento',
  '',
  '## Passo 1 · Conexão (com Abertura)',
  '',
  '**Objetivo estratégico:** fazer o cliente responder sim, em segundos, às duas perguntas que o cérebro dele faz sozinho.',
  '',
  '**Estado do cliente:** ele baixou a guarda, entendeu para que serve a conversa e sabe que pode sair dela sem comprar nada.',
  '',
  '**Princípio de condução:** a pessoa vem antes da empresa, e o vendedor se posiciona por domínio, não por cargo.',
  '',
  '**Fala sugerida:**',
  '',
  '1. "[FALA DO VENDEDOR] Oi, [nome], tudo bem? Eu faço parte do time comercial do Prosperus Club." Diga o nome dele antes da empresa.',
  '',
  '> Anatomia da fala',
  '> - [Conexão] «Eu faço parte do time comercial do Prosperus Club» · por que: apresenta a pessoa antes da estrutura.',
  '',
  '2. "[FALA DO VENDEDOR] O nosso objetivo nestes 40 minutos é simples: entender onde o seu negócio está hoje."',
  '',
  '### Quem está do outro lado',
  '',
  '| Perfil | Como reconhecer | O que fazer na abertura |',
  '|--|--|--|',
  '| Dominante | vai direto ao ponto e pergunta preço | seja curto, diga o objetivo e o tempo da conversa |',
  '| Analítico | pede dado e detalhe | leve número e critério, não venda entusiasmo |',
  '',
  '**Perguntas recomendadas:**',
  '',
  '- Antes de a gente começar, me conta: você está em qual cidade?',
  '- Você já conhecia o trabalho da Dani e do Joel ou chegou até a gente por indicação?',
  '',
  '**O que observar:**',
  '',
  '- O ritmo da resposta: quem responde curto e direto pede objetividade.',
  '- Se ele já chega perguntando preço nos primeiros minutos, veio comparar.',
  '',
  '**Avançar ou voltar:** avance quando ele responder à sua última pergunta com um sim relaxado. Volte, e refaça a entrega de controle, se ele estiver monossilábico ou defensivo.',
  '',
  '**Silêncio e escuta:** depois de declarar o objetivo da conversa, cale e deixe ele reagir.',
  '',
  '**Objeções possíveis e resposta:**',
  '',
  '- Objeção: "Eu só tenho alguns minutos hoje." Resposta: "Perfeito, eu me adapto. Nesse tempo eu prefiro entender o seu cenário a falar de mim."',
  '- Objeção: "Me manda tudo por WhatsApp que eu leio depois." Resposta: "Eu mando o que você pedir, mas material genérico não te ajuda a decidir nada."',
  '',
  '**Erro a evitar:** abrir falando do Prosperus e do tamanho da MLS antes de o cliente comprar você.',
  '',
  '**Critério de sucesso:** o cliente autorizou as perguntas em voz alta e começou a falar da própria operação.',
  '',
  '## Passo 2 · Investigação (Método CNCS)',
  '',
  '**Objetivo estratégico:** fazer o cliente ouvir a própria voz descrevendo onde ele está preso.',
  '',
  '**Estado do cliente:** ele articulou em voz alta coisas que talvez nunca tenha dito para ninguém.',
  '',
  '**Princípio de condução:** este é o passo mais longo da reunião e o cliente fala mais do que você.',
  '',
  '**Fala sugerida:**',
  '',
  '### C · Contexto',
  '',
  '1. "[FALA DO VENDEDOR] Então me conta com as suas palavras: o que te fez estar aqui hoje?" Pergunta ampla de propósito.',
  '2. "[FALA DO VENDEDOR] Me descreve a sua empresa hoje: o que vocês vendem e onde fechou o faturamento no último ano."',
  '',
  '### N · Necessidade (desejo antes da dor)',
  '',
  '3. "[FALA DO VENDEDOR] Se daqui a 12 meses tudo tivesse dado certo, como estaria a sua vida?"',
  '',
  '### C · Consequência (dos dois lados)',
  '',
  '4. "[FALA DO VENDEDOR] Agora imagina que daqui a um ano está tudo igual. Como você vai estar?"',
  '',
  '### S · Soluções que você já tentou',
  '',
  '5. "[FALA DO VENDEDOR] Quais caminhos você já avaliou para resolver isso?"',
  '',
  '**Perguntas recomendadas:**',
  '',
  '- O que te fez estar aqui hoje?',
  '- O que hoje só anda quando você está presente?',
  '',
  '### Como usar estas perguntas',
  '',
  '- As perguntas do CNCS são repertório, não roteiro: você escolhe as que cabem no que o cliente acabou de dizer.',
  '- Uma por vez, sempre encadeada na resposta anterior.',
  '',
  '**O que observar:**',
  '',
  '- As palavras que ele repete voltam literalmente no Passo 3.',
  '',
  '**Avançar ou voltar:** avance quando você tiver, escritos, a dor principal, o desejo e a urgência.',
  '',
  '**Erro a evitar:** transformar as informações que você precisa levantar em formulário.',
  '',
  '# Documento 2 · Script de campo',
  '',
  '## Passo 1 · Conexão (com Abertura)',
  '',
  '1. "[FALA DO VENDEDOR] Oi, [nome], tudo bem? Eu sou do time comercial do Prosperus Club." [Pausa.]',
  '',
  '**Perguntas:**',
  '',
  '- Você já conhecia o trabalho da Dani e do Joel ou chegou por indicação?',
  '',
  '**Transição:** "[FALA DO VENDEDOR] Então me conta com as suas palavras: o que te fez estar aqui hoje?"',
  '',
  '**Alerta:** abertura de um minuto, pessoa antes da empresa.',
  '',
  '**Próximo passo obrigatório:** o cliente autorizou as perguntas em voz alta.',
  '',
  '## Passo 2 · Investigação (Método CNCS)',
  '',
  '### C · Contexto',
  '',
  '1. "[FALA DO VENDEDOR] O que te fez estar aqui hoje?" [Silêncio até ele falar.]',
  '',
  '### N · Necessidade (desejo antes da dor)',
  '',
  '2. "[FALA DO VENDEDOR] Se daqui a 12 meses tudo tivesse dado certo, como estaria a sua vida?" [Anote as palavras dele.]',
  '',
  '**Perguntas:**',
  '',
  '- Além de você, mais alguém senta na mesa nessa decisão?',
  '',
  '**Objeções possíveis e resposta:**',
  '',
  '- Objeção: "Quanto custa isso?" Resposta: "O preço a gente conversa depois que eu entender o seu cenário."',
  '',
  '**Próximo passo obrigatório:** dor, desejo, urgência e decisor anotados.',
  '',
].join('\n');

const DOC = parseScript(MD);
const P1 = DOC.documentos[0].passos[0];
const P2 = DOC.documentos[0].passos[1];

function blocoFalso(over: Partial<any> = {}): any {
  return { tipo: 'outro', rotulo: 'Rótulo', inline: '', itens: [], grupos: [], dizer: [], md: '', ...over };
}

function abrirReader(tela: number, over: Partial<React.ComponentProps<typeof ScriptReader>> = {}) {
  const rootRef = React.createRef<HTMLDivElement>();
  const utils = render(
    <ScriptReader
      doc={DOC}
      clubNome="Prosperus Club"
      tela={tela}
      onTela={vi.fn()}
      documento="treinamento"
      marcadas={new Set()}
      comentariosDo={() => null}
      totalGrifos={0}
      rootRef={rootRef}
      {...over}
    />
  );
  return { ...utils, reader: screen.getByTestId('script-reader') };
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
    expect(s.perguntas!.itens).toHaveLength(2);
    expect(s.observar!.itens).toHaveLength(2);
    expect(s.decisao).not.toBeNull();
    expect(s.silencio!.inline).toContain('cale e deixe ele reagir');
    expect(s.objecoesItens).toHaveLength(2);
    expect(s.erro!.inline).toContain('abrir falando do Prosperus');
    expect(s.sucesso!.inline).toContain('autorizou as perguntas em voz alta');
    expect(s.transicao).toBeNull();
    expect(s.proximo).toBeNull();

    const campo1 = DOC.documentos[1].passos[0];
    const c = montarSecoes(campo1, s.objetivo);
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

  it('perguntas: a nota "Como usar estas perguntas" sai da lista e os tipos viram grupos', () => {
    const bloco = P2.blocos.find((b) => b.tipo === 'perguntas')!;
    expect(bloco.itens).toEqual([
      'O que te fez estar aqui hoje?',
      'O que hoje só anda quando você está presente?',
    ]);
    expect(bloco.grupos.map((g) => g.titulo)).toEqual(['Como usar estas perguntas']);

    const s = montarSecoes(P2);
    expect(s.perguntas!.nota).toHaveLength(2);
    expect(s.perguntas!.nota[0]).toContain('repertório, não roteiro');
    expect(s.perguntas!.grupos.map((g) => g.curto)).toEqual(['Contexto', 'Necessidade', 'Consequência', 'Soluções que você já tentou']);
    expect(s.perguntas!.grupos[0].itens[0]).toContain('o que te fez estar aqui hoje?');
    expect(s.perguntas!.grupos.every((g) => g.deFalas)).toBe(true);

    // no Passo 1 não há tipos: fica a lista simples
    expect(montarSecoes(P1).perguntas!.grupos).toHaveLength(0);
  });

  it('grupos escritos dentro do próprio bloco de perguntas vencem os das falas', () => {
    const doc = parseScript([
      '## Passo 2 · Investigação',
      '',
      '**Perguntas recomendadas:**',
      '',
      '### C · Contexto',
      '',
      '- Me descreve a sua empresa hoje?',
      '',
      '### N · Necessidade',
      '',
      '- Onde você quer chegar?',
      '',
    ].join('\n'));
    const s = montarSecoes(doc.documentos[0].passos[0]);
    expect(s.perguntas!.grupos.map((g) => g.curto)).toEqual(['Contexto', 'Necessidade']);
    expect(s.perguntas!.grupos.every((g) => g.deFalas)).toBe(false);
    expect(s.perguntas!.itens).toHaveLength(0);
  });

  it('separarDecisao, separarObjecao e o rótulo curto do grupo', () => {
    expect(separarDecisao('avance quando ele responder sobre si; volte se ele só falar de números.')).toEqual({
      avance: 'avance quando ele responder sobre si',
      volte: 'volte se ele só falar de números.',
    });
    expect(separarDecisao('avance quando você tiver a dor principal escrita.')).toBeNull();
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
    expect(montarPerguntas(null, null)).toBeNull();
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

  it('avançar ou voltar: duas colunas quando existe o "volte"; um cartão só quando não existe', () => {
    const bloco = blocoFalso({ tipo: 'avancar', rotulo: 'Avançar ou voltar', inline: 'avance quando ele responder sobre si; volte se ele só falar de números.' });
    const { unmount } = render(<AvancarSecao bloco={bloco} decisao={separarDecisao(bloco.inline)} />);
    expect(screen.getByTestId('decisao-avance')).toHaveTextContent('Quando avançar');
    expect(screen.getByTestId('decisao-volte')).toHaveTextContent('volte se ele só falar de números');
    expect(screen.queryByTestId('decisao-unico')).toBeNull();
    unmount();

    const so = blocoFalso({ tipo: 'avancar', rotulo: 'Avançar ou voltar', inline: 'avance quando a dor estiver escrita.' });
    render(<AvancarSecao bloco={so} decisao={separarDecisao(so.inline)} />);
    expect(screen.getByTestId('decisao-unico')).toHaveTextContent('avance quando a dor estiver escrita.');
    expect(screen.queryByTestId('decisao-avance')).toBeNull();
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
});

describe('tabelas responsivas', () => {
  const tabela = {
    colunas: ['Perfil', 'Como reconhecer', 'O que fazer na abertura'],
    linhas: [
      ['Dominante', 'vai direto ao ponto', 'seja curto e diga o objetivo'],
      ['Analítico', 'pede dado e detalhe', 'leve número e critério'],
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
    const { reader } = abrirReader(2);
    const secao = within(reader).getByTestId('perfis-tabela');
    expect(within(secao).queryByRole('table')).toBeNull();
    expect(within(secao).getAllByTestId('tabela-cartao')).toHaveLength(2);
    expect(within(secao).getByText('Dominante')).toBeInTheDocument();
  });
});

describe('perguntas por tipo (Passo 2)', () => {
  it('quatro botões, um por tipo, com a contagem de cada um', () => {
    const { reader } = abrirReader(3);
    const botoes = within(reader).getAllByTestId('perguntas-botao');
    expect(botoes.map((b) => b.querySelector('.script-perguntas-botao-nome')?.textContent)).toEqual([
      'Contexto', 'Necessidade', 'Consequência', 'Soluções que você já tentou',
    ]);
    expect(botoes[0]).toHaveAttribute('aria-haspopup', 'dialog');
    expect(botoes[0]).toHaveTextContent('2');
    // a lista solta continua como checklist
    expect(within(reader).getByTestId('perguntas-checklist')).toHaveTextContent('O que hoje só anda quando você está presente?');
  });

  it('o botão abre a folha com as perguntas daquele tipo, a nota no alto e copiar todas', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    const { reader } = abrirReader(3);
    expect(screen.queryByTestId('perguntas-folha')).toBeNull();
    fireEvent.click(within(reader).getAllByTestId('perguntas-botao')[0]);

    const folha = await screen.findByTestId('perguntas-folha');
    expect(folha).toHaveAttribute('role', 'dialog');
    expect(folha).toHaveAttribute('aria-modal', 'true');
    expect(within(folha).getByText('C · Contexto')).toBeInTheDocument();
    expect(within(folha).getByTestId('perguntas-nota')).toHaveTextContent('repertório, não roteiro');
    const lista = within(folha).getByTestId('perguntas-lista');
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    expect(lista).toHaveTextContent('o que te fez estar aqui hoje?');
    expect(lista).toHaveTextContent('Me descreve a sua empresa hoje');
    // a folha vai para fora do leitor: o texto dela não entra no índice dos grifos
    expect(reader.contains(folha)).toBe(false);

    fireEvent.click(within(folha).getByRole('button', { name: /Copiar as perguntas de Contexto/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('o que te fez estar aqui hoje?')));
  });

  it('a folha fecha no Esc e no botão, e o foco volta para quem abriu', async () => {
    const { reader } = abrirReader(3);
    const botao = within(reader).getAllByTestId('perguntas-botao')[1];
    botao.focus();
    fireEvent.click(botao);
    const folha = await screen.findByTestId('perguntas-folha');
    // o foco entra na folha
    expect(folha.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('perguntas-folha')).toBeNull());
    expect(document.activeElement).toBe(botao);

    fireEvent.click(botao);
    const outra = await screen.findByTestId('perguntas-folha');
    fireEvent.click(within(outra).getByRole('button', { name: /^Fechar / }));
    await waitFor(() => expect(screen.queryByTestId('perguntas-folha')).toBeNull());
  });

  it('nos passos sem tipos de pergunta fica só o checklist', () => {
    const { reader } = abrirReader(2);
    expect(within(reader).queryByTestId('perguntas-botoes')).toBeNull();
    expect(within(reader).getByTestId('perguntas-checklist')).toHaveTextContent('você está em qual cidade?');
  });
});

describe('vistas Treinamento e Campo', () => {
  it('Treinamento mostra tudo: dupla, observar, silêncio, erro e critério', () => {
    const { reader } = abrirReader(2);
    for (const id of ['secao-estado', 'secao-principio', 'secao-observar', 'secao-silencio', 'secao-erro', 'secao-sucesso', 'secao-avancar', 'secao-objecoes', 'secao-falas', 'secao-perguntas']) {
      expect(within(reader).getByTestId(id)).toBeInTheDocument();
    }
    expect(within(reader).getAllByTestId('anatomia').length).toBeGreaterThan(0);
  });

  it('Campo esconde estado, princípio, observar, silêncio, erro, critério e a anatomia', () => {
    const { reader } = abrirReader(2, { documento: 'campo' });
    for (const id of ['secao-estado', 'secao-principio', 'secao-observar', 'secao-silencio', 'secao-erro', 'secao-sucesso']) {
      expect(within(reader).queryByTestId(id)).toBeNull();
    }
    expect(within(reader).queryByTestId('anatomia')).toBeNull();
    // o que fica: objetivo, falas, perguntas, transição, alerta e o próximo passo
    expect(within(reader).getByTestId('passo-objetivo')).toHaveTextContent('fazer o cliente responder sim');
    expect(within(reader).getByTestId('secao-falas')).toHaveTextContent('Eu sou do time comercial do Prosperus Club');
    expect(within(reader).getByTestId('secao-perguntas')).toBeInTheDocument();
    expect(within(reader).getByTestId('secao-transicao')).toBeInTheDocument();
    expect(within(reader).getByTestId('secao-alerta')).toBeInTheDocument();
    expect(within(reader).getByTestId('secao-proximo')).toHaveTextContent('autorizou as perguntas em voz alta');
  });

  it('Campo mantém os botões por tipo e as objeções', () => {
    const { reader } = abrirReader(3, { documento: 'campo' });
    expect(within(reader).getAllByTestId('perguntas-botao')).toHaveLength(2);
    const objecoes = within(reader).getByTestId('secao-objecoes');
    expect(within(objecoes).getAllByTestId('objecao')).toHaveLength(1);
  });

  it('o próximo passo obrigatório fica no fim do corpo do passo', () => {
    const { reader } = abrirReader(2, { documento: 'campo' });
    const proximo = within(reader).getByTestId('secao-proximo');
    const falas = within(reader).getByTestId('secao-falas');
    expect(falas.compareDocumentPosition(proximo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const tarefas = within(reader).getByTestId('tarefas-passo');
    expect(proximo.compareDocumentPosition(tarefas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('copy das seções: sem travessão, sem jargão e sem a palavra proibida', () => {
    const { reader } = abrirReader(2);
    const texto = reader.textContent || '';
    expect(texto).not.toContain('—');
    expect(texto.toLowerCase()).not.toContain(['diagn', 'óstico'].join(''));
    expect(texto).not.toMatch(/\bjob\b|cohort/i);
  });
});
