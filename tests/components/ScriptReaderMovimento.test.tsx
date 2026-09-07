import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { ScriptReader } from '../../components/script/script/ScriptReader';
import { ScriptScreen } from '../../components/script/ScriptScreen';
import { parseScript } from '../../components/script/script/parseScript';
import { TELA_SUMARIO, navDoConteudo } from '../../components/script/script/telas';
import { chaveTarefa, tarefasDoPasso } from '../../components/script/script/tarefas';
import { extrairPerfis } from '../../components/script/script/PerfisTabela';
import { duracaoLegivel, treinamentosDoPasso } from '../../data/treinamentos-por-passo';

/**
 * O movimento de cada Passo no leitor "Seu script", já na ordem da onda E1:
 * objetivo -> o script -> a tabela "Quem está do outro lado" -> "Tarefas" -> "Treinamentos deste passo".
 * - o bloco de treinamentos aparece nos 7 passos, com título, a linha de palestrante/tipo/duração, o
 *   "Por que ver agora" logo abaixo do título e a thumbnail; o player só é montado quando a pessoa toca
 *   (nada de iframe carregado sozinho, em nenhuma tela)
 * - a tabela de perfis vira `<table>` de verdade e sai do corpo do passo, sem repetir
 * - os checkboxes marcam na hora e gravam no servidor (PUT), com o estado vindo do GET
 * - o Sumário mostra a contagem de cada passo num chip
 * As contagens saem do catálogo (`treinamentosDoPasso`, `tarefasDoPasso`): quando ele muda, o teste acompanha.
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

const FIXTURE = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/script-exemplo.md'), 'utf8');
const DOC = parseScript(FIXTURE);

/** Passo 1 com a seção de perfis em tabela de canos, do jeito que o worker escreve. */
const MD_PERFIS = `# Script · Os 7 Passos · Elos Club

# Documento 1 · Script completo para treinamento

## Passo 1 · Conexão (com Abertura)

**Objetivo estratégico:** abrir a conversa com a pessoa antes da empresa.

**Quem está do outro lado:**

| Perfil | Como reconhecer | O que fazer na abertura |
|--|--|--|
| Dominante | vai direto ao ponto e pergunta preço | seja curto, diga o objetivo e o tempo da conversa |
| Influente | conta história e fala de gente | acolha a história e traga a pergunta de volta |
| Estável | responde devagar e evita conflito | dê tempo, confirme cada passo antes de seguir |
| Analítico | pede dado e detalhe | leve número e critério, não venda entusiasmo |

**Erro a evitar:** colocar a empresa na frente da pessoa.

## Passo 2 · Investigação

**Objetivo estratégico:** ouvir.
`;

/** `tela` vem na coordenada de CONTEUDO (0 cartao, 1 sumario, 2..8 passos, 9 preparacao). */
function abrirReader(tela: number, over: Partial<React.ComponentProps<typeof ScriptReader>> = {}) {
  const rootRef = React.createRef<HTMLDivElement>();
  const utils = render(
    <ScriptReader
      doc={DOC}
      clubNome="Elos Club"
      tela={navDoConteudo(tela)}
      onTela={vi.fn()}
      documento="treinamento"
      marcadas={new Set()}
      comentariosDo={() => null}
      totalGrifos={0}
      onAbrirGrifos={vi.fn()}
      rootRef={rootRef}
      {...over}
    />
  );
  return { ...utils, reader: screen.getByTestId('script-reader') };
}

/** "x/y" de cada um dos 7 passos, direto do catálogo, com o que já foi marcado. */
function chipsEsperados(feitas: ReadonlySet<string>): string[] {
  return [1, 2, 3, 4, 5, 6, 7].map((p) => {
    const total = tarefasDoPasso(p).length;
    const marcadas = tarefasDoPasso(p).filter((t) => feitas.has(chaveTarefa(p, t.id))).length;
    return `${marcadas}/${total}`;
  });
}

describe('ScriptReader · treinamentos do passo', () => {
  it('os 7 passos trazem o bloco com os treinamentos do catálogo, sem player carregado', () => {
    for (let tela = 2; tela <= 8; tela++) {
      const passo = tela - 1;
      const { reader, unmount } = abrirReader(tela);
      const bloco = within(reader).getByTestId('treinamentos-passo');
      expect(within(bloco).getByText('Treinamentos deste passo')).toBeInTheDocument();
      const cartoes = within(bloco).getAllByTestId('treinamento-card');
      const esperados = treinamentosDoPasso(passo);
      expect(cartoes).toHaveLength(esperados.length);
      esperados.forEach((t, i) => {
        expect(cartoes[i]).toHaveAttribute('data-treinamento', t.id);
        expect(within(cartoes[i]).getByText(t.titulo)).toBeInTheDocument();
        expect(within(cartoes[i]).getByTestId('treinamento-meta')).toHaveTextContent(t.palestrante);
        expect(within(cartoes[i]).getByTestId('treinamento-meta')).toHaveTextContent(t.tipo);
        expect(within(cartoes[i]).getByTestId('treinamento-meta')).toHaveTextContent(duracaoLegivel(t.duracaoMin));
        // "Por que ver agora" é a descrição, logo abaixo do título e antes do vídeo
        const porque = within(cartoes[i]).getByText(t.porQueAgora);
        const meta = within(cartoes[i]).getByTestId('treinamento-meta');
        const player = cartoes[i].querySelector('.script-treino-player')!;
        expect(meta.compareDocumentPosition(porque) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(porque.compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // thumbnail com o botão de tocar, sem player carregado
        expect(within(cartoes[i]).getByTestId('treinamento-thumb').getAttribute('src')).toContain(t.bunnyGuid);
        expect(within(cartoes[i]).getByRole('button', { name: `Assistir: ${t.titulo}` })).toBeInTheDocument();
      });
      expect(reader.querySelector('iframe')).toBeNull();
      unmount();
    }
  });

  it('o Passo 1 abre com o perfil de quem vende e só depois o perfil do cliente, na ordem do catálogo', () => {
    const { reader } = abrirReader(2);
    const cartoes = within(reader).getAllByTestId('treinamento-card');
    expect(cartoes.map((c) => c.getAttribute('data-treinamento'))).toEqual(treinamentosDoPasso(1).map((t) => t.id));
    expect(treinamentosDoPasso(1)[0].id).toContain('dani-martins');
  });

  it('a thumbnail que não carrega vira uma placa com o título', () => {
    const { reader } = abrirReader(2);
    const cartao = within(reader).getAllByTestId('treinamento-card')[0];
    const t1 = treinamentosDoPasso(1)[0];
    fireEvent.error(within(cartao).getByTestId('treinamento-thumb'));
    expect(within(cartao).queryByTestId('treinamento-thumb')).toBeNull();
    expect(within(cartao).getByTestId('treinamento-placa')).toHaveTextContent(t1.titulo);
    expect(within(cartao).getByRole('button', { name: `Assistir: ${t1.titulo}` })).toBeInTheDocument();
  });

  it('o player só entra no toque; abrir o segundo desmonta o primeiro', () => {
    const { reader } = abrirReader(2);
    const [t1, t2] = treinamentosDoPasso(1);
    fireEvent.click(within(reader).getByRole('button', { name: `Assistir: ${t1.titulo}` }));
    const iframes = reader.querySelectorAll('iframe');
    expect(iframes).toHaveLength(1);
    expect(iframes[0].getAttribute('src')).toBe(`${t1.embedUrl}?autoplay=true`);
    expect(iframes[0].getAttribute('src')).toContain('iframe.mediadelivery.net/embed/716048/');
    expect(iframes[0].getAttribute('allow')).toContain('autoplay');

    if (!t2) return;
    fireEvent.click(within(reader).getByRole('button', { name: `Assistir: ${t2.titulo}` }));
    const depois = reader.querySelectorAll('iframe');
    expect(depois).toHaveLength(1);
    expect(depois[0].getAttribute('src')).toBe(`${t2.embedUrl}?autoplay=true`);
  });

  it('a ordem do movimento: os treinamentos vão para o fim, depois das tarefas', () => {
    const { reader } = abrirReader(2);
    const treinos = within(reader).getByTestId('treinamentos-passo');
    const tarefas = within(reader).getByTestId('tarefas-passo');
    expect(tarefas.compareDocumentPosition(treinos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(reader.querySelector('[role="tablist"]')).toBeNull();
  });

  it('na vista Campo o bloco de treinamentos some e as tarefas ficam', () => {
    const { reader } = abrirReader(2, { documento: 'campo' });
    expect(within(reader).queryByTestId('treinamentos-passo')).toBeNull();
    expect(within(reader).getByTestId('tarefas-passo')).toBeInTheDocument();
  });

  it('as telas de cartão, sumário e preparação não têm bloco de treinamento nem tarefas', () => {
    for (const tela of [0, 1, 9]) {
      const { reader, unmount } = abrirReader(tela);
      expect(within(reader).queryByTestId('treinamentos-passo')).toBeNull();
      expect(within(reader).queryByTestId('tarefas-passo')).toBeNull();
      unmount();
    }
  });
});

describe('ScriptReader · tabela "Quem está do outro lado"', () => {
  it('sem a seção no markdown, nada é desenhado', () => {
    const { reader } = abrirReader(2);
    expect(within(reader).queryByTestId('perfis-tabela')).toBeNull();
    expect(extrairPerfis(DOC.documentos[0].passos[0])).toBeNull();
  });

  it('com a seção, vira tabela de verdade depois das abas e some do corpo do passo', () => {
    const docPerfis = parseScript(MD_PERFIS);
    const rootRef = React.createRef<HTMLDivElement>();
    render(
      <ScriptReader
        doc={docPerfis}
        clubNome="Elos Club"
        tela={navDoConteudo(2)}
        onTela={vi.fn()}
        documento="treinamento"
        onDocumento={vi.fn()}
        marcadas={new Set()}
        comentariosDo={() => null}
        totalGrifos={0}
        rootRef={rootRef}
      />
    );
    const reader = screen.getByTestId('script-reader');
    const secao = within(reader).getByTestId('perfis-tabela');
    const tabela = within(secao).getByRole('table');
    expect(within(secao).getAllByText('Quem está do outro lado').length).toBeGreaterThan(0);
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Perfil', 'Como reconhecer', 'O que fazer na abertura',
    ]);
    expect(within(tabela).getAllByRole('row')).toHaveLength(5); // cabeçalho + 4 perfis
    expect(within(tabela).getByText('Dominante')).toBeInTheDocument();
    expect(within(tabela).getByText('leve número e critério, não venda entusiasmo')).toBeInTheDocument();
    // rolagem horizontal no celular
    expect(secao.querySelector('.script-perfis-rolagem')).not.toBeNull();
    // o markdown cru da tabela não aparece mais no corpo do passo
    expect(reader.textContent).not.toContain('|--|');
    expect(reader.querySelectorAll('table')).toHaveLength(1);
    // a tabela vem depois do corpo do script e antes das tarefas
    const tarefas = within(reader).getByTestId('tarefas-passo');
    expect(secao.compareDocumentPosition(tarefas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('extrairPerfis também lê a seção como subtítulo e a lista de itens', () => {
    const comTitulo = parseScript(`# S\n\n## Passo 1 · Conexão\n\n**O que dizer:**\n\n### Quem está do outro lado\n\n| Perfil | O que fazer |\n|--|--|\n| Dominante | seja curto |\n| Analítico | leve dado |\n\n### Outra coisa\n\n| X | Y |\n|--|--|\n| 1 | 2 |\n`);
    const achado = extrairPerfis(comTitulo.documentos[0].passos[0]);
    expect(achado!.tabela.colunas).toEqual(['Perfil', 'O que fazer']);
    expect(achado!.tabela.linhas).toEqual([['Dominante', 'seja curto'], ['Analítico', 'leve dado']]);

    const comItens = parseScript('# S\n\n## Passo 1 · Conexão\n\n**Quem está do outro lado:**\n\n- **Dominante:** seja curto e diga o objetivo\n- **Analítico:** leve número e critério\n');
    const dosItens = extrairPerfis(comItens.documentos[0].passos[0]);
    expect(dosItens!.tabela.colunas).toEqual(['Perfil', 'O que fazer']);
    expect(dosItens!.tabela.linhas).toEqual([
      ['Dominante', 'seja curto e diga o objetivo'],
      ['Analítico', 'leve número e critério'],
    ]);
  });
});

describe('ScriptReader · tarefas e contagem', () => {
  it('cada passo lista as tarefas do catálogo com a linha "x de y tarefas"', () => {
    const { reader } = abrirReader(2);
    const bloco = within(reader).getByTestId('tarefas-passo');
    const itens = within(bloco).getAllByTestId('tarefa-item');
    expect(itens.map((i) => i.getAttribute('data-tarefa'))).toEqual(tarefasDoPasso(1).map((t) => t.id));
    expect(within(bloco).getByTestId('tarefas-contagem')).toHaveTextContent(`0 de ${tarefasDoPasso(1).length} tarefas`);
    expect(within(bloco).getByText('Treinar as falas deste passo em voz alta')).toBeInTheDocument();
    expect(within(bloco).getByText('Aplicar na próxima reunião e anotar o que aconteceu')).toBeInTheDocument();
    expect(within(bloco).getByText('Marcar o que funcionou e o que ajustar')).toBeInTheDocument();
    // a última tarefa abre a dica dos grifos
    expect(within(bloco).getByText(/dourado para ajustar, verde para manter, vermelho para tirar/)).toBeInTheDocument();
    for (const item of itens) expect(item).toHaveAttribute('aria-checked', 'false');
  });

  it('o que já foi concluído vem marcado e conta na linha', () => {
    const feitas = new Set([chaveTarefa(1, 'treinar-falas'), chaveTarefa(1, 'aplicar-reuniao')]);
    const { reader } = abrirReader(2, { tarefasConcluidas: feitas });
    const bloco = within(reader).getByTestId('tarefas-passo');
    expect(within(bloco).getByTestId('tarefas-contagem')).toHaveTextContent(`2 de ${tarefasDoPasso(1).length} tarefas`);
    expect(within(bloco).getByRole('checkbox', { name: /Treinar as falas/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(bloco).getByRole('checkbox', { name: /Aplicar na próxima reunião/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(bloco).getByRole('checkbox', { name: /Marcar o que funcionou/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('tocar num checkbox chama onTarefa com passo, id e o valor novo', () => {
    const onTarefa = vi.fn();
    const feitas = new Set([chaveTarefa(3, 'treinar-falas')]);
    const { reader } = abrirReader(4, { tarefasConcluidas: feitas, onTarefa });
    const bloco = within(reader).getByTestId('tarefas-passo');
    fireEvent.click(within(bloco).getByRole('checkbox', { name: /Aplicar na próxima reunião/ }));
    expect(onTarefa).toHaveBeenCalledWith(3, 'aplicar-reuniao', true);
    fireEvent.click(within(bloco).getByRole('checkbox', { name: /Treinar as falas/ }));
    expect(onTarefa).toHaveBeenLastCalledWith(3, 'treinar-falas', false);
  });

  it('o Sumário mostra o chip de contagem em cada um dos 7 passos', () => {
    const feitas = new Set([
      chaveTarefa(1, 'treinar-falas'),
      chaveTarefa(1, 'aplicar-reuniao'),
      ...tarefasDoPasso(6).map((t) => chaveTarefa(6, t.id)),
    ]);
    const { reader } = abrirReader(TELA_SUMARIO, { tarefasConcluidas: feitas });
    const chips = within(reader).getAllByTestId('chip-tarefas');
    expect(chips).toHaveLength(7);
    // o total de cada passo sai do catálogo (um passo com um treinamento só tem uma tarefa a menos)
    expect(chips.map((c) => c.textContent)).toEqual(chipsEsperados(feitas));
    expect(chips[0]).toHaveAttribute('aria-label', `Passo 1: 2 de ${tarefasDoPasso(1).length} tarefas`);
    expect(chips[5].className).toContain('script-chip-tarefas-cheio');
    expect(chips[0].className).not.toContain('script-chip-tarefas-cheio');
  });
});

// ─── Persistência de verdade, com a rede simulada ──────────────────────────────

function fichaMock() {
  return {
    data: { club: { slug: 'x', nome: 'Elos Club' }, ficha_status: 'confirmada', script: { versoes: 0, ultima: null, aprovada: null, job: null } },
    gerarScript: vi.fn(async () => ({ ok: true, job: null, existing: false })),
    pedirRevisao: vi.fn(async () => ({ ok: true, job: null, existing: false })),
    refresh: vi.fn(),
  } as any;
}

let puts: Array<{ url: string; body: any }>;

function mockRede(tarefas: any[] = []) {
  puts = [];
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [{ id: 'v1', versao: 1, status: 'rascunho', resumo: 'primeira', created_at: '2026-09-06 12:00:00', comentarios_count: 0 }], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { id: 'v1', versao: 1, status: 'rascunho', content_md: FIXTURE, created_at: '2026-09-06 12:00:00' }, comentarios: [] } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos: [] } };
    if (url === '/api/script/versoes/1/tarefas') return { data: { success: true, versao: 1, tarefas } };
    throw new Error('url inesperada ' + url);
  });
  (axios.put as any).mockImplementation(async (url: string, body: any) => {
    puts.push({ url, body });
    const m = /\/api\/script\/versoes\/1\/tarefas\/(\d)\/(.+)$/.exec(url)!;
    return { data: { success: true, versao: 1, tarefa: { passo: Number(m[1]), tarefa_id: decodeURIComponent(m[2]), concluida: body.concluida, concluida_em: body.concluida ? '2026-09-06 13:00:00' : null, updated_at: '2026-09-06 13:00:00' } } };
  });
  (axios.post as any).mockImplementation(async () => { throw new Error('post inesperado'); });
}

async function irParaPasso(n: number) {
  const nav = await screen.findByRole('navigation', { name: 'Índice do script' });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^Passo ${n}:`) }));
  await screen.findByText(`Passo ${n} de 7`);
}

describe('ScriptScreen · tarefas gravadas no servidor', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('lê o que a pessoa já marcou e mostra marcado', async () => {
    mockRede([{ passo: 1, tarefa_id: 'treinar-falas', concluida: true, concluida_em: '2026-09-05 10:00:00', updated_at: '2026-09-05 10:00:00' }]);
    render(<ScriptScreen ficha={fichaMock()} token="t" />);
    await screen.findByTestId('script-reader');
    await irParaPasso(1);
    const bloco = screen.getByTestId('tarefas-passo');
    await waitFor(() => expect(within(bloco).getByTestId('tarefas-contagem')).toHaveTextContent(`1 de ${tarefasDoPasso(1).length} tarefas`));
    expect(within(bloco).getByRole('checkbox', { name: /Treinar as falas/ })).toHaveAttribute('aria-checked', 'true');
    expect(axios.get).toHaveBeenCalledWith('/api/script/versoes/1/tarefas', expect.anything());
  });

  it('marcar atualiza na hora e manda o PUT; desmarcar manda false', async () => {
    mockRede([]);
    render(<ScriptScreen ficha={fichaMock()} token="t" />);
    await screen.findByTestId('script-reader');
    await irParaPasso(2);
    const bloco = screen.getByTestId('tarefas-passo');
    const caixa = within(bloco).getByRole('checkbox', { name: /Aplicar na próxima reunião/ });

    const totalP2 = tarefasDoPasso(2).length;
    fireEvent.click(caixa);
    await waitFor(() => expect(caixa).toHaveAttribute('aria-checked', 'true'));
    expect(within(bloco).getByTestId('tarefas-contagem')).toHaveTextContent(`1 de ${totalP2} tarefas`);
    expect(puts).toHaveLength(1);
    expect(puts[0]).toEqual({ url: '/api/script/versoes/1/tarefas/2/aplicar-reuniao', body: { concluida: true } });

    fireEvent.click(caixa);
    await waitFor(() => expect(caixa).toHaveAttribute('aria-checked', 'false'));
    expect(puts[1].body).toEqual({ concluida: false });
    expect(within(bloco).getByTestId('tarefas-contagem')).toHaveTextContent(`0 de ${totalP2} tarefas`);
  });

  it('o Sumário conta o que foi marcado na tela do passo', async () => {
    mockRede([]);
    render(<ScriptScreen ficha={fichaMock()} token="t" />);
    await screen.findByTestId('script-reader');
    await irParaPasso(4);
    fireEvent.click(within(screen.getByTestId('tarefas-passo')).getByRole('checkbox', { name: /Treinar as falas/ }));
    await waitFor(() => expect(puts).toHaveLength(1));

    const nav = await screen.findByRole('navigation', { name: 'Índice do script' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Sumário' }));
    const chips = await screen.findAllByTestId('chip-tarefas');
    expect(chips.map((c) => c.textContent)).toEqual(chipsEsperados(new Set([chaveTarefa(4, 'treinar-falas')])));
  });

  it('quando o servidor recusa, o checkbox volta como estava e a pessoa é avisada', async () => {
    mockRede([]);
    (axios.put as any).mockImplementation(async () => { throw { response: { data: { message: 'Não deu para salvar a tarefa. Tente de novo.' } } }; });
    render(<ScriptScreen ficha={fichaMock()} token="t" />);
    await screen.findByTestId('script-reader');
    await irParaPasso(3);
    const caixa = within(screen.getByTestId('tarefas-passo')).getByRole('checkbox', { name: /Treinar as falas/ });
    fireEvent.click(caixa);
    await waitFor(() => expect(caixa).toHaveAttribute('aria-checked', 'false'));
    expect(await screen.findByText('Não deu para salvar a tarefa. Tente de novo.')).toBeInTheDocument();
  });

  it('copy do movimento: sem travessão escrito por nós, sem "diagnóstico" e sem jargão', async () => {
    mockRede([]);
    render(<ScriptScreen ficha={fichaMock()} token="t" />);
    await screen.findByTestId('script-reader');
    await irParaPasso(6);
    const treinos = screen.getByTestId('treinamentos-passo');
    const tarefas = screen.getByTestId('tarefas-passo');
    const texto = `${treinos.textContent}${tarefas.textContent}`;
    expect(texto).toContain('Treinamentos deste passo');
    expect(texto).toContain('Por que ver agora');
    expect(texto).not.toContain('—');
    expect(texto).not.toMatch(/diagn[óo]stic/i);
    expect(texto).not.toMatch(/\bjob\b|\bcohort\b/i);
  });
});
