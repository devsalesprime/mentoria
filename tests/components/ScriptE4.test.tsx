import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen } from '../../components/script/ScriptScreen';
import { COPY_AJUSTES_SOBRANDO, COPY_AJUSTES_USADOS } from '../../components/script/script/ScriptReader';
import { guardarTela, lerTelaLembrada, clampNav, conteudoDaNav, navDoConteudo, nomeNav, rotuloNav, TOTAL_NAV } from '../../components/script/script/telas';

/**
 * Onda E4 de "Seu script" (pedidos do dono em 07/09):
 * 1. rodapé de navegação no FIM de toda tela ("Anterior" e "Próximo: <nome da próxima>"; na última, "Ir para as ações")
 * 2. tela 0 "O seu script está pronto": como usar (navegar, grifar, pedir ajustes), o que vem depois e os dois botões
 * 3. "Gerar apresentação" em duas etapas: o aviso dos ajustes e a confirmação da versão
 * 4. uma rodada de ajustes por clube: gasta, o botão dos grifos trava e explica
 * 5. o leitor perdeu "Pedir nova versão" e "Escrever do zero"; o menu "Baixar" perdeu "Os dois (PDF)"
 * 6. a tela lembrada migrou de coordenada uma vez (o Início entrou na frente)
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
  it('Início, Cartão e Passo 1: "Anterior" e "Próximo: <nome da próxima tela>"', async () => {
    mockApi();
    const { nav } = await abrir();

    // tela 0 (Início): não há tela anterior
    expect(within(rodape()).getByTestId('rodape-anterior')).toBeDisabled();
    expect(within(rodape()).getByTestId('rodape-proximo')).toHaveTextContent('Próximo: Cartão de bolso');

    // o rodapé leva para a próxima e o mapa acompanha
    fireEvent.click(within(rodape()).getByTestId('rodape-proximo'));
    await waitFor(() => expect(within(nav).getByRole('button', { name: 'Cartão de bolso' })).toHaveAttribute('aria-current', 'page'));
    expect(within(rodape()).getByTestId('rodape-anterior')).not.toBeDisabled();
    expect(within(rodape()).getByTestId('rodape-proximo')).toHaveTextContent('Próximo: Sumário');

    // tela de passo: o nome da próxima vem do script
    irPara(nav, /^Passo 1:/);
    await screen.findByText('Passo 1 de 7');
    expect(within(rodape()).getByTestId('rodape-proximo')).toHaveTextContent('Próximo: Passo 2 · Nome do passo 2');

    // "Anterior" do rodapé volta uma tela
    fireEvent.click(within(rodape()).getByTestId('rodape-anterior'));
    await waitFor(() => expect(within(nav).getByRole('button', { name: 'Sumário' })).toHaveAttribute('aria-current', 'page'));
  });

  it('na última tela o "Próximo" vira "Ir para as ações" e o rodapé não sai do lugar', async () => {
    mockApi();
    const { nav } = await abrir();
    irPara(nav, 'Preparação e métricas');
    await screen.findByTestId('acoes-fim');
    const proximo = within(rodape()).getByTestId('rodape-proximo');
    expect(proximo).toHaveTextContent('Ir para as ações');
    expect(proximo.textContent).not.toContain('Próximo:');
    // clicar não muda de tela: rola até o bloco de decisão, que está na mesma tela
    fireEvent.click(proximo);
    expect(within(nav).getByRole('button', { name: 'Preparação e métricas' })).toHaveAttribute('aria-current', 'page');
  });

  it('a barra do topo e as setas do teclado continuam funcionando com o rodapé no ar', async () => {
    mockApi();
    const { nav } = await abrir();
    // barra do topo
    fireEvent.click(within(nav).getByRole('button', { name: 'Próxima tela' }));
    await waitFor(() => expect(within(nav).getByRole('button', { name: 'Cartão de bolso' })).toHaveAttribute('aria-current', 'page'));
    // teclado
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(within(nav).getByRole('button', { name: 'Sumário' })).toHaveAttribute('aria-current', 'page'));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() => expect(within(nav).getByRole('button', { name: 'Cartão de bolso' })).toHaveAttribute('aria-current', 'page'));
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

    // 3 cartões: Navegue, Grife, Peça ajustes
    for (const titulo of ['Navegue', 'Grife', 'Peça ajustes']) {
      expect(within(inicio).getByRole('heading', { name: titulo })).toBeInTheDocument();
    }
    expect(within(inicio).getByRole('heading', { name: 'Navegue' }).parentElement?.textContent).toMatch(/Anterior e Próximo/);
    expect(within(inicio).getByRole('heading', { name: 'Navegue' }).parentElement?.textContent).toMatch(/Treinamento e Campo/);
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

  it('os dois botões levam ao cartão de bolso e ao sumário', async () => {
    mockApi();
    const { reader, nav } = await abrir();
    fireEvent.click(within(reader).getByTestId('inicio-sumario'));
    expect(await within(reader).findByText('Script dos 7 passos da venda')).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Sumário' })).toHaveAttribute('aria-current', 'page');

    irPara(nav, 'Início');
    fireEvent.click(await within(reader).findByTestId('inicio-cartao'));
    expect(await within(reader).findByText('Cartão de bolso')).toBeInTheDocument();
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
    for (const tela of ['Início', 'Cartão de bolso', 'Sumário', /^Passo 1:/, 'Preparação e métricas'] as Array<string | RegExp>) {
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
    expect(within(menu).getByTestId('baixar-cartao')).toHaveTextContent('Cartão de bolso (imagem)');
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
  it('navegação 0..10; o Início não tem conteúdo; rótulos e nomes', () => {
    expect(TOTAL_NAV).toBe(11);
    expect(Array.from({ length: TOTAL_NAV }, (_, t) => rotuloNav(t)))
      .toEqual(['Início', 'Cartão', 'Sumário', '1', '2', '3', '4', '5', '6', '7', 'Preparação']);
    expect(nomeNav(0)).toBe('Início');
    expect(nomeNav(1)).toBe('Cartão de bolso');
    expect(nomeNav(2)).toBe('Sumário');
    expect(nomeNav(4, 'Investigação')).toBe('Passo 2 · Investigação');
    expect(nomeNav(10)).toBe('Preparação e métricas');
    expect(conteudoDaNav(0)).toBe(-1);
    expect([1, 2, 3, 10].map(conteudoDaNav)).toEqual([0, 1, 2, 9]);
    expect([0, 1, 2, 9].map(navDoConteudo)).toEqual([1, 2, 3, 10]);
    expect(clampNav(99)).toBe(10);
    expect(clampNav(-4)).toBe(0);
    expect(clampNav(NaN)).toBe(0);
  });

  it('a tela lembrada de antes da onda E4 ganha +1 uma vez e a chave antiga sai', () => {
    // quem parou no Passo 2 (conteúdo 3) volta no Passo 2 (navegação 4)
    localStorage.setItem('script-tela:elos:v1', '3');
    expect(lerTelaLembrada('elos', 1)).toBe(4);
    expect(localStorage.getItem('script-tela:elos:v1')).toBeNull();
    expect(localStorage.getItem('script-tela-nav:elos:v1')).toBe('4');
    // ler de novo não soma outra vez
    expect(lerTelaLembrada('elos', 1)).toBe(4);
  });

  it('o índice novo é lido como está; sem nada, null; lixo também vira null', () => {
    expect(lerTelaLembrada('elos', 2)).toBeNull();
    guardarTela('elos', 2, 10);
    expect(lerTelaLembrada('elos', 2)).toBe(10);
    localStorage.setItem('script-tela-nav:elos:v3', 'abc');
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
    expect(localStorage.getItem('script-tela-nav:elos:v1')).toBe('2');
  });
});
