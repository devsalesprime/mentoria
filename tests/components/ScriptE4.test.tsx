import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen } from '../../components/script/ScriptScreen';
import fs from 'node:fs';
import path from 'node:path';
import { COPY_AJUSTES_SOBRANDO, COPY_AJUSTES_USADOS, ScriptReader } from '../../components/script/script/ScriptReader';
import { parseScript } from '../../components/script/script/parseScript';
import { guardarTela, lerTelaLembrada, clampNav, conteudoDaNav, navDoConteudo, nomeNav, rotuloNav, TOTAL_NAV } from '../../components/script/script/telas';

/**
 * Onda E4 de "Seu script" (pedidos do dono em 07/09):
 * 1. rodapé de navegação no FIM de toda tela ("Anterior" e "Próximo: <nome da próxima>"; na última, "Ir para as ações")
 * 2. tela 0 "O seu script está pronto": como usar (escolher como ler, grifar, pedir ajustes), o que vem
 *    depois e, na onda J, o resumo do script na mesma tela (os dois botões de entrada saíram em 09/09)
 * 3. "Gerar apresentação" em duas etapas: o aviso dos ajustes e a confirmação da versão
 * 4. uma rodada de ajustes por clube: gasta, o botão dos grifos trava e explica
 * 5. o leitor perdeu "Pedir nova versão" e "Escrever do zero"; o menu "Baixar" perdeu "Os dois (PDF)"
 * 6. a tela lembrada migrou de coordenada (onda E4: o Início entrou na frente; onda J: Cartão e Sumário saíram)
 */

vi.mock('axios');
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_: any, tag: string) => React.forwardRef((props: any, ref: any) => {
      const { children, initial, animate, exit, transition, whileHover, whileTap, variants, ...rest } = props;
      return React.createElement(tag, { ...rest, ref }, children);
    }),
  }),
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

/** Dois documentos (para a chave Treinamento | Campo), 7 passos, mapa e cartão de bolso. */
const MD = [
  '# Script · Os 7 Passos · Elos Club',
  '',
  '**Para quem eu vendo:** o dono de indústria familiar',
  '',
  '# Documento 1 · Script completo para treinamento',
  '',
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => [
    `## Passo ${n} · Nome do passo ${n}`,
    '',
    `**Objetivo estratégico:** objetivo do passo ${n}.`,
    '',
    '**Fala sugerida:**',
    '',
    `1. "[FALA DO VENDEDOR] Fala de treinamento do passo ${n}, com o tamanho que a âncora do grifo pede."`,
    '',
  ].join('\n')),
  '# Documento 2 · Script de campo',
  '',
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => [
    `## Passo ${n} · Nome do passo ${n}`,
    '',
    `1. "[FALA DO VENDEDOR] Fala de campo do passo ${n}." [Pausa.]`,
    '',
  ].join('\n')),
  '## Mapa de preparação',
  '',
  '| Passo | O que o passo pede |',
  '|--|--|',
  '| 1 | a pessoa antes da empresa |',
  '',
  '## Cartão de bolso',
  '',
  '### Os 7 passos em 7 linhas',
  '',
  '1. Conexão: a pessoa antes da empresa.',
  '',
].join('\n');

const TOKEN = `x.${Buffer.from(JSON.stringify({ userId: 'u1', user: 'ana@x.com', role: 'member' })).toString('base64').replace(/=+$/, '')}.y`;

function fichaMock(scriptOver: Record<string, unknown> = {}) {
  return {
    data: {
      club: { slug: 'elos', nome: 'Elos Club' },
      ficha_status: 'confirmada',
      script: { versoes: 1, ultima: null, aprovada: null, job: null, ajustes_usados: 0, ajustes_limite: 1, ...scriptOver },
    },
    gerarScript: vi.fn(async () => ({ ok: true })),
    pedirRevisao: vi.fn(async () => ({ ok: true, job: { id: 'j3', tipo: 'revisar', status: 'queued' }, existing: false })),
    definirModo: vi.fn(async () => ({ ok: true })),
    refresh: vi.fn(),
  } as any;
}

function grifoFake(over: Record<string, unknown> = {}) {
  return {
    id: 'g1', versao: 1, passo: 2, documento: 'treinamento',
    texto: 'Fala de treinamento do passo 1, com o tamanho que a âncora do grifo pede.',
    prefixo: '', sufixo: '', cor: 'dourado', nota: 'deixar mais curta',
    autor_email: 'ana@x.com', autor_nome: 'Ana', created_at: '2026-09-07 10:00:00', resolvido_em: null, ...over,
  };
}

function mockApi({ grifos = [] as any[] } = {}) {
  const base = { id: 'v1', versao: 1, status: 'rascunho', resumo: '', created_at: '2026-09-07 09:00:00', comentarios_count: 0 };
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [base], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { ...base, content_md: MD }, comentarios: [] } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos } };
    if (url === '/api/script/versoes/1/tarefas') return { data: { success: true, versao: 1, tarefas: [] } };
    throw new Error('url inesperada ' + url);
  });
  (axios.post as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes/1/slides') return { data: { success: true, versao: 1, job: { id: 'js1', tipo: 'slides', status: 'queued', existing: false } } };
    throw new Error('post inesperado ' + url);
  });
}

async function abrir(ficha = fichaMock()) {
  const utils = render(<ScriptScreen ficha={ficha} token={TOKEN} pollMs={100000} />);
  const reader = await screen.findByTestId('script-reader');
  const nav = await screen.findByRole('navigation', { name: 'Índice do script' });
  return { ...utils, reader, nav, ficha };
}

/** Vai para uma tela pelo mapa do topo (a coordenada de navegação). */
function irPara(nav: HTMLElement, nome: string | RegExp) {
  fireEvent.click(within(nav).getByRole('button', { name: nome }));
}

const rodape = () => screen.getByTestId('rodape-nav');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('rodapé de navegação no fim de toda tela', () => {
  it('Início e Passo 1: "Anterior" e "Próximo: <nome da próxima tela>"', async () => {
    mockApi();
    const { nav } = await abrir();

    // tela 0 (Início): não há tela anterior
    expect(within(rodape()).getByTestId('rodape-anterior')).toBeDisabled();
    expect(within(rodape()).getByTestId('rodape-proximo')).toHaveTextContent('Próximo: Passo 1 · Nome do passo 1');

    // o rodapé leva para a próxima e o mapa acompanha
    fireEvent.click(within(rodape()).getByTestId('rodape-proximo'));
    await waitFor(() => expect(within(nav).getByRole('button', { name: /^Passo 1:/ })).toHaveAttribute('aria-current', 'page'));
    expect(within(rodape()).getByTestId('rodape-anterior')).not.toBeDisabled();

    // tela de passo: o nome da próxima vem do script
    await screen.findByText('Passo 1 de 7');
    expect(within(rodape()).getByTestId('rodape-proximo')).toHaveTextContent('Próximo: Passo 2 · Nome do passo 2');

    // "Anterior" do rodapé volta uma tela
    fireEvent.click(within(rodape()).getByTestId('rodape-anterior'));
    await waitFor(() => expect(within(nav).getByRole('button', { name: 'Início' })).toHaveAttribute('aria-current', 'page'));
  });

  it('na última tela o "Próximo" vira "Ir para as ações" e o rodapé não sai do lugar', async () => {
    mockApi();
    const { nav } = await abrir();
    irPara(nav, 'Preparação e métricas');
    await screen.findByTestId('acoes-fim');
    const proximo = within(rodape()).getByTestId('rodape-proximo');
    expect(proximo).toHaveTextContent('Ir para as ações');
    expect(proximo.textContent).not.toContain('Próximo:');
    // clicar não muda de tela: rola até o bloco de decisão e pousa o foco nele (09/09, item 6)
    fireEvent.click(proximo);
    expect(within(nav).getByRole('button', { name: 'Preparação e métricas' })).toHaveAttribute('aria-current', 'page');
    expect(document.activeElement).toBe(screen.getByTestId('acoes-fim'));
  });

  it('a barra do topo e as setas do teclado continuam funcionando com o rodapé no ar', async () => {
    mockApi();
    const { nav } = await abrir();
    // barra do topo
    fireEvent.click(within(nav).getByRole('button', { name: 'Próxima tela' }));
    await waitFor(() => expect(within(nav).getByRole('button', { name: /^Passo 1:/ })).toHaveAttribute('aria-current', 'page'));
    // teclado
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(within(nav).getByRole('button', { name: /^Passo 2:/ })).toHaveAttribute('aria-current', 'page'));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() => expect(within(nav).getByRole('button', { name: /^Passo 1:/ })).toHaveAttribute('aria-current', 'page'));
    expect(screen.getByTestId('rodape-nav')).toBeInTheDocument();
  });
});

describe('tela 0 · "O seu script está pronto"', () => {
  it('abre no Início, com o clube e a versão, os 3 cartões de "Como usar" e o que vem depois', async () => {
    mockApi();
    const { reader } = await abrir();
    const inicio = within(reader).getByTestId('tela-inicio');
    expect(within(inicio).getByRole('heading', { name: 'O seu script está pronto' })).toBeInTheDocument();
    expect(inicio.textContent).toContain('Elos Club');
    expect(inicio.textContent).toContain('v1');

    // 3 cartões: Escolha como ler, Grife, Peça ajustes
    for (const titulo of ['Escolha como ler', 'Grife', 'Peça ajustes']) {
      expect(within(inicio).getByRole('heading', { name: titulo })).toBeInTheDocument();
    }
    // 09/09 (item 3b): o cartão explica Treinamento e Campo e as aspas e colchetes das falas
    const comoLer = within(inicio).getByTestId('inicio-navegue').textContent || '';
    expect(comoLer).toMatch(/Treinamento e Campo/);
    expect(comoLer).toMatch(/ler antes da reunião/);
    expect(comoLer).toMatch(/aberto durante a conversa/);
    expect(comoLer).toMatch(/colchetes/);
    // e não explica mais quantas telas existem nem como andar entre elas
    expect(comoLer).not.toMatch(/nove telas/);
    expect(comoLer).not.toMatch(/Anterior e Próximo/);
    expect(comoLer).not.toMatch(/número do passo na barra/);
    expect(within(inicio).getByRole('heading', { name: 'Grife' }).parentElement?.textContent).toMatch(/áudio, uma foto, um link ou uma nota/);

    // os 3 chips do grifo, com a cor e para que serve
    const chips = within(inicio).getByTestId('chips-grifo').textContent || '';
    expect(chips).toContain('Dourado para ajustar');
    expect(chips).toContain('Verde para manter');
    expect(chips).toContain('Vermelho para tirar');

    // a rodada de ajustes e a apresentação que vem depois
    expect(within(inicio).getByTestId('inicio-ajustes')).toHaveTextContent(COPY_AJUSTES_SOBRANDO);
    const depois = within(inicio).getByLabelText('O que vem depois').textContent || '';
    expect(depois).toMatch(/apresentação comercial/);
    expect(depois).toMatch(/notas do apresentador/);

    // copy da casa
    expect(inicio.textContent).not.toContain('—');
    expect(inicio.textContent).not.toMatch(/diagn[oó]stic/i);
    expect(inicio.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('o resumo vem na mesma tela, sem os botões de entrada e sem o bloco "Como usar este script"', async () => {
    mockApi();
    const { reader, nav } = await abrir();
    const inicio = within(reader).getByTestId('tela-inicio');
    // onda J (item 9): o sumário mora aqui, depois de "O que vem depois"
    expect(within(inicio).getByText('Script dos 7 passos da venda')).toBeInTheDocument();
    expect(within(inicio).getByLabelText('Os 3 blocos da conversa')).toBeInTheDocument();
    expect(within(inicio).getByLabelText('Os 7 passos')).toBeInTheDocument();
    // 09/09 (itens 3a e 3c): os dois botões de entrada e o bloco recolhido saíram
    expect(within(inicio).queryByTestId('inicio-passo-1')).toBeNull();
    expect(within(inicio).queryByTestId('inicio-preparacao')).toBeNull();
    expect(within(inicio).queryByTestId('como-usar')).toBeNull();
    expect(inicio.textContent).not.toContain('Como usar este script');

    // o sumário continua levando às telas: o bloco da conversa e a linha do passo
    fireEvent.click(within(inicio).getByRole('button', { name: /Ir para o passo 1:/ }));
    await waitFor(() => expect(within(nav).getByRole('button', { name: /^Passo 1:/ })).toHaveAttribute('aria-current', 'page'));

    irPara(nav, 'Início');
    fireEvent.click(await within(reader).findByRole('button', { name: /Ir para o passo 3:/ }));
    await waitFor(() => expect(within(nav).getByRole('button', { name: /^Passo 3:/ })).toHaveAttribute('aria-current', 'page'));
  });

  it('o cartão de bolso não é mais tela nem download', async () => {
    mockApi();
    const { container, nav } = await abrir();
    expect(within(nav).queryByRole('button', { name: 'Cartão de bolso' })).toBeNull();
    expect(within(nav).queryByRole('button', { name: 'Sumário' })).toBeNull();
    (container.querySelector('details.script-mais') as HTMLDetailsElement).open = true;
    const menu = screen.getByRole('group', { name: 'Baixar' });
    expect(menu.textContent).not.toContain('Cartão de bolso');
  });

  it('com a rodada gasta, o Início já avisa', async () => {
    mockApi();
    const { reader } = await abrir(fichaMock({ ajustes_usados: 1 }));
    expect(within(reader).getByTestId('inicio-ajustes')).toHaveTextContent(COPY_AJUSTES_USADOS);
  });
});

describe('"Gerar apresentação" em duas etapas', () => {
  async function abrirAcoes() {
    const r = await abrir();
    irPara(r.nav, 'Preparação e métricas');
    await screen.findByTestId('acoes-fim');
    fireEvent.click(screen.getByTestId('cartao-pptx-gerar'));
    return r;
  }

  it('etapa 1: o aviso dos ajustes, com "Quero ajustar antes" e "Gerar com esta versão"', async () => {
    mockApi();
    await abrirAcoes();
    const aviso = await screen.findByTestId('modal-apresentacao-aviso');
    expect(within(aviso).getByRole('heading', { name: 'Antes de gerar a apresentação' })).toBeInTheDocument();
    expect(within(aviso).getByTestId('apres-texto-aviso')).toHaveTextContent('Você tem uma rodada de ajustes incluída.');
    expect(within(aviso).getByTestId('apres-ajustar')).toHaveTextContent('Quero ajustar antes');
    expect(within(aviso).getByTestId('apres-avancar')).toHaveTextContent('Gerar com esta versão');
    // nada foi pedido ainda
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('fechar o aviso não gera nada (o pedido só sai depois do Confirmar)', async () => {
    mockApi();
    await abrirAcoes();
    await screen.findByTestId('modal-apresentacao-aviso');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByTestId('modal-apresentacao-aviso')).toBeNull());
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('"Quero ajustar antes" fecha o aviso, abre os grifos e leva até a caixa de comentário', async () => {
    mockApi({ grifos: [grifoFake()] });
    await abrirAcoes();
    fireEvent.click(await screen.findByTestId('apres-ajustar'));
    await waitFor(() => expect(screen.queryByTestId('modal-apresentacao-aviso')).toBeNull());
    // painel dos grifos aberto (a folha do celular)
    expect(screen.getAllByTestId('grifos-painel').length).toBeGreaterThan(0);
    // e a caixa de comentário do sumário, aberta
    const caixa = await screen.findByText('Comentar o script como um todo');
    expect(caixa.closest('details')?.open).toBe(true);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('etapa 2: confirma a versão, avisa que a apresentação não se atualiza sozinha e "Voltar" volta para o aviso', async () => {
    mockApi();
    await abrirAcoes();
    fireEvent.click(await screen.findByTestId('apres-avancar'));
    const passo2 = await screen.findByTestId('modal-apresentacao-confirmar');
    const texto = within(passo2).getByTestId('apres-texto-confirmar').textContent || '';
    expect(texto).toContain('Confirmar: gerar a apresentação a partir da versão v1.');
    expect(texto).toContain('Depois de gerada, novos ajustes no script não mudam a apresentação automaticamente.');
    expect(axios.post).not.toHaveBeenCalled();

    fireEvent.click(within(passo2).getByTestId('apres-voltar'));
    expect(await screen.findByTestId('modal-apresentacao-aviso')).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('"Confirmar" chama o endpoint uma vez só e fecha as duas etapas', async () => {
    mockApi();
    await abrirAcoes();
    fireEvent.click(await screen.findByTestId('apres-avancar'));
    fireEvent.click(await screen.findByTestId('apres-confirmar'));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/slides', {}, expect.anything()));
    expect((axios.post as any).mock.calls.filter((c: any[]) => c[0] === '/api/script/versoes/1/slides')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId('modal-apresentacao-confirmar')).toBeNull());
    expect(screen.queryByTestId('modal-apresentacao-aviso')).toBeNull();
    expect(await screen.findByTestId('cartao-pptx-montando')).toBeInTheDocument();
  });
});

describe('uma rodada de ajustes', () => {
  it('com a rodada sobrando, "Pedir nova versão com os grifos" funciona', async () => {
    mockApi({ grifos: [grifoFake()] });
    const { nav, ficha } = await abrir();
    irPara(nav, 'Preparação e métricas');
    const botao = await screen.findByTestId('pedir-com-grifos');
    expect(botao).toHaveTextContent('Pedir nova versão com os grifos (1)');
    expect(botao).not.toBeDisabled();
    expect(screen.queryByTestId('ajustes-esgotados')).toBeNull();

    fireEvent.click(botao);
    fireEvent.click(within(await screen.findByTestId('modal-grifos')).getByRole('button', { name: 'Pedir nova versão' }));
    await waitFor(() => expect(ficha.pedirRevisao).toHaveBeenCalled());
    // gastou: o botão trava na hora, sem esperar a ficha recarregar
    await waitFor(() => expect(screen.getByTestId('pedir-com-grifos')).toBeDisabled());
    // com a versão nova a caminho, o botão diz isso; a nota da rodada gasta entra quando a fila esvazia
    expect(screen.getByTestId('pedir-com-grifos')).toHaveTextContent('Nova versão a caminho');
  });

  it('com a rodada gasta, o botão nasce travado e explica', async () => {
    mockApi({ grifos: [grifoFake()] });
    const { nav, ficha } = await abrir(fichaMock({ ajustes_usados: 1 }));
    irPara(nav, 'Preparação e métricas');
    expect(await screen.findByTestId('pedir-com-grifos')).toBeDisabled();
    expect(screen.getByTestId('ajustes-esgotados')).toHaveTextContent('A sua rodada de ajustes já foi usada. Precisa de mais? Fale com a equipe.');
    expect(ficha.pedirRevisao).not.toHaveBeenCalled();
  });

  it('teto maior no cohort_config libera a segunda rodada', async () => {
    mockApi({ grifos: [grifoFake()] });
    const { nav } = await abrir(fichaMock({ ajustes_usados: 1, ajustes_limite: 2 }));
    irPara(nav, 'Preparação e métricas');
    expect(await screen.findByTestId('pedir-com-grifos')).not.toBeDisabled();
    expect(screen.queryByTestId('ajustes-esgotados')).toBeNull();
  });
});

describe('o que saiu do leitor do mentor', () => {
  it('nem "Pedir nova versão" sozinho nem "Escrever do zero" em nenhuma tela', async () => {
    mockApi({ grifos: [grifoFake()] });
    const { container, nav } = await abrir();
    for (const tela of ['Início', /^Passo 1:/, 'Preparação e métricas'] as Array<string | RegExp>) {
      irPara(nav, tela);
      await waitFor(() => expect(screen.getByTestId('script-reader')).toBeInTheDocument());
      expect(container.textContent).not.toContain('Escrever do zero');
      expect(screen.queryByTestId('escrever-do-zero')).toBeNull();
    }
    // o único caminho para uma versão nova é o dos grifos
    const acoes = within(await screen.findByTestId('acoes-fim'));
    expect(acoes.queryByText('Pedir nova versão')).toBeNull();
    expect(acoes.getByTestId('pedir-com-grifos')).toBeInTheDocument();
    expect(acoes.getByText('Aprovar o script')).toBeInTheDocument();
    expect(acoes.getByTestId('cartao-pptx-gerar')).toBeInTheDocument();
  });

  it('o menu "Baixar" não tem mais "Os dois (PDF)"', async () => {
    mockApi();
    const { container } = await abrir();
    (container.querySelector('details.script-mais') as HTMLDetailsElement).open = true;
    const menu = screen.getByRole('group', { name: 'Baixar' });
    expect(within(menu).getByTestId('baixar-preparacao')).toHaveTextContent('Preparação (imagem)');
    expect(within(menu).getByTestId('pdf-campo')).toHaveTextContent('Script de campo (PDF)');
    expect(within(menu).getByTestId('pdf-treinamento')).toHaveTextContent('Treinamento (PDF)');
    expect(within(menu).getByTestId('baixar-md')).toHaveTextContent('Texto (.md)');
    expect(within(menu).queryByTestId('pdf-ambos')).toBeNull();
    expect(menu.textContent).not.toContain('Os dois');
    // sem apresentação publicada, o PPTX não aparece
    expect(within(menu).queryByTestId('slides-pptx')).toBeNull();
  });
});

describe('telas.ts · as duas coordenadas e a tela lembrada', () => {
  it('navegação 0..8; o Início carrega o sumário; rótulos e nomes', () => {
    expect(TOTAL_NAV).toBe(9);
    expect(Array.from({ length: TOTAL_NAV }, (_, t) => rotuloNav(t)))
      .toEqual(['Início', '1', '2', '3', '4', '5', '6', '7', 'Preparação']);
    expect(nomeNav(0)).toBe('Início');
    expect(nomeNav(1, 'Conexão')).toBe('Passo 1 · Conexão');
    expect(nomeNav(2, 'Investigação')).toBe('Passo 2 · Investigação');
    expect(nomeNav(8)).toBe('Preparação e métricas');
    // o Início aponta para o conteúdo do sumário: é ali que o grifo desta tela nasce
    expect(conteudoDaNav(0)).toBe(1);
    expect([1, 2, 8].map(conteudoDaNav)).toEqual([2, 3, 9]);
    // o conteúdo do antigo cartão (0) e o do sumário (1) caem os dois no Início
    expect([0, 1, 2, 9].map(navDoConteudo)).toEqual([0, 0, 1, 8]);
    expect(clampNav(99)).toBe(8);
    expect(clampNav(-4)).toBe(0);
    expect(clampNav(NaN)).toBe(0);
  });

  it('a tela lembrada de antes da onda E4 migra pelo conteúdo e a chave antiga sai', () => {
    // quem parou no Passo 2 (conteúdo 3) volta no Passo 2 (navegação 2)
    localStorage.setItem('script-tela:elos:v1', '3');
    expect(lerTelaLembrada('elos', 1)).toBe(2);
    expect(localStorage.getItem('script-tela:elos:v1')).toBeNull();
    expect(localStorage.getItem('script-tela-nav2:elos:v1')).toBe('2');
    // ler de novo não migra outra vez
    expect(lerTelaLembrada('elos', 1)).toBe(2);
  });

  it('a tela lembrada da onda E4 perde as duas casas do Cartão e do Sumário', () => {
    // Passo 2 na coordenada de 11 telas (4) vira Passo 2 na de 9 (2)
    localStorage.setItem('script-tela-nav:elos:v7', '4');
    expect(lerTelaLembrada('elos', 7)).toBe(2);
    expect(localStorage.getItem('script-tela-nav:elos:v7')).toBeNull();
    expect(localStorage.getItem('script-tela-nav2:elos:v7')).toBe('2');
    // quem parou no Cartão ou no Sumário volta no Início
    localStorage.setItem('script-tela-nav:elos:v8', '2');
    expect(lerTelaLembrada('elos', 8)).toBe(0);
    // e a última tela antiga (10) vira a última de agora (8)
    localStorage.setItem('script-tela-nav:elos:v9', '10');
    expect(lerTelaLembrada('elos', 9)).toBe(8);
  });

  it('o índice novo é lido como está; sem nada, null; lixo também vira null', () => {
    expect(lerTelaLembrada('elos', 2)).toBeNull();
    guardarTela('elos', 2, 8);
    expect(lerTelaLembrada('elos', 2)).toBe(8);
    localStorage.setItem('script-tela-nav2:elos:v3', 'abc');
    expect(lerTelaLembrada('elos', 3)).toBeNull();
    // o teto antigo (9) não passa pela chave nova sem migrar
    localStorage.setItem('script-tela:elos:v4', '99');
    expect(lerTelaLembrada('elos', 4)).toBeNull();
  });

  it('o leitor abre na tela lembrada já migrada', async () => {
    localStorage.setItem('script-tela:elos:v1', '1'); // sumário na coordenada antiga
    mockApi();
    const { reader } = await abrir();
    expect(await within(reader).findByText('Script dos 7 passos da venda')).toBeInTheDocument();
    expect(localStorage.getItem('script-tela-nav2:elos:v1')).toBe('0');
  });
});

/**
 * Item 6 do pedido de 09/09: "Ir para as ações" só existe quando existe bloco de ações naquela tela. Aqui o
 * leitor é montado direto, com e sem ações, porque é a prop que decide.
 */
describe('rodapé da última tela · "Ir para as ações"', () => {
  const FIXTURE = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/script-exemplo.md'), 'utf8');
  const DOC = parseScript(FIXTURE);

  function abrirPreparacao(props: Record<string, unknown> = {}) {
    const rootRef = React.createRef<HTMLDivElement>();
    return render(
      <ScriptReader
        doc={DOC}
        clubNome="Elos Club"
        tela={TOTAL_NAV - 1}
        onTela={vi.fn()}
        documento="treinamento"
        marcadas={new Set()}
        comentariosDo={() => null}
        totalGrifos={0}
        rootRef={rootRef}
        {...props}
      />
    );
  }

  it('com bloco de ações: o botão aparece, rola até o bloco e pousa o foco nele', () => {
    abrirPreparacao({ acoes: <button type="button">Aprovar o script</button> });
    const acoes = screen.getByTestId('acoes-fim');
    const proximo = screen.getByTestId('rodape-proximo');
    expect(proximo).toHaveTextContent('Ir para as ações');
    fireEvent.click(proximo);
    expect(document.activeElement).toBe(acoes);
  });

  it('sem bloco de ações na tela: o botão não é desenhado, e o "Anterior" continua', () => {
    abrirPreparacao();
    expect(screen.queryByTestId('acoes-fim')).toBeNull();
    expect(screen.queryByTestId('rodape-proximo')).toBeNull();
    expect(screen.getByTestId('rodape-anterior')).toBeInTheDocument();
  });

  it('só com a apresentação comercial o bloco existe, e o botão volta', () => {
    abrirPreparacao({ apresentacao: { estado: 'ausente', onGerar: vi.fn() } });
    expect(screen.getByTestId('acoes-fim')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('rodape-proximo'));
    expect(document.activeElement).toBe(screen.getByTestId('acoes-fim'));
  });
});
