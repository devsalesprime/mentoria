import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen, splitScript } from '../../components/script/ScriptScreen';
import { cleanScriptMarkdown, parseScript, markdownToTexto } from '../../components/script/script/parseScript';

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

const MD_V1 = '# Script\n\nAbertura do script.\n\n## Passo 1: Entregar o controle\n\nTexto 1.\n\n## Passo 2: Dor\n\nTexto 2.\n\n### Sub\n\nmais\n\n## Fechamento\n\nfim';

function fichaMock(over: Partial<any> = {}) {
  return {
    data: { club: { slug: 'x', nome: 'Elos Club' }, ficha_status: 'confirmada', script: { versoes: 0, ultima: null, aprovada: null, job: null } },
    gerarScript: vi.fn(async () => ({ ok: true, job: { id: 'j2', tipo: 'script', status: 'queued' }, existing: false })),
    pedirRevisao: vi.fn(async () => ({ ok: true, job: { id: 'j3', tipo: 'revisar', status: 'queued' }, existing: false })),
    refresh: vi.fn(),
    ...over,
  } as any;
}

function mockVersao(md: string) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [{ id: 'v1', versao: 1, status: 'rascunho', resumo: 'primeira', created_at: '2026-09-03 12:00:00', comentarios_count: 0 }], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { id: 'v1', versao: 1, status: 'rascunho', content_md: md, created_at: '2026-09-03 12:00:00' }, comentarios: [{ id: 'c1', versao: 1, passo: 2, texto: 'Trocar a dor', autor_nome: 'Ana', created_at: '2026-09-03 12:10:00' }] } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos: [] } };
    throw new Error('url inesperada ' + url);
  });
  (axios.post as any).mockImplementation(async (url: string, body: any) => {
    if (url.endsWith('/comentarios')) return { data: { success: true, comentario: { id: 'c2', versao: 1, passo: body.passo, texto: body.texto, autor_nome: 'Ana', created_at: '2026-09-03 12:20:00' } } };
    if (url.endsWith('/aprovar')) return { data: { success: true, versao: { versao: 1, status: 'aprovado', aprovado_em: '2026-09-03 12:30:00' } } };
    throw new Error('post inesperado ' + url);
  });
}

/** Abre o script e vai para a tela do passo N pelo mapa. */
async function irParaPasso(n: number) {
  const nav = await screen.findByRole('navigation', { name: 'Índice do script' });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^Passo ${n}:`) }));
  await screen.findByText(`Passo ${n} de 7`);
  return nav;
}

describe('splitScript', () => {
  it('divide por "## Passo N" (numero do passo) e trata outros "## " como geral (0)', () => {
    const s = splitScript(MD_V1);
    expect(s.map((x) => x.passo)).toEqual([0, 1, 2, 0]);
    expect(s[1].titulo).toBe('Passo 1: Entregar o controle');
    expect(s[2].md).toContain('### Sub');
    expect(s[2].html).toMatch(/<h3>/);
    expect(splitScript('')).toEqual([]);
  });
});

describe('cleanScriptMarkdown', () => {
  it('tira marcas de fonte, "(fonte: ...)", "a definir", front matter, blockquote editorial e a secao de rastreabilidade', () => {
    const v1 = '---\nstatus: rascunho v1\n---\n\n# Script v1 · Os 7 Passos · Elos Club\n\n> Gerado só a partir da ficha. Todo número traz a marca `[ficha X.Y]`.\n\n**Para quem eu vendo:** o dono `[ficha 3.1]`\n\n## Passo 1 · Conexão\n\n1. Frase `[ficha 2.1]`: "Eu sou a Paloma (fonte: ficha 2.2)."\n8. Prova parecida [ficha 6.6]: a definir com a gente na mentoria. A prova que eu tenho é a minha.\n\n## Rastreabilidade dos números\n\n| Número | Campo |\n|--|--|\n| R$14 mil | 5.3 |\n\n## Adaptação por perfil\n\nAdapte o ritmo.\n';
    const limpo = cleanScriptMarkdown(v1);
    expect(limpo).not.toContain('[ficha');
    expect(limpo).not.toContain('(fonte');
    expect(limpo).not.toContain('a definir');
    expect(limpo).not.toContain('Rastreabilidade');
    expect(limpo).not.toContain('Adaptação por perfil');
    expect(limpo).not.toContain('Gerado só');
    expect(limpo).not.toContain('status: rascunho');
    expect(limpo).toContain('"Eu sou a Paloma."');
    expect(limpo).toContain('Prova parecida. A prova que eu tenho é a minha.');
    expect(limpo).toContain('## Passo 1 · Conexão');
  });
});

describe('parseScript', () => {
  it('le os dois documentos, os 7 passos de cada um, as falas com voz, o mapa e o cartao', () => {
    const doc = parseScript(FIXTURE);
    expect(doc.oferta).toBe('Elos Club');
    expect(doc.cabecalho.map((c) => c.rotulo)).toEqual(['Para quem eu vendo', 'O que eu vendo', 'Onde a venda acontece', 'Quem conduz']);
    expect(doc.cabecalho[0].valor).not.toContain('[ficha');
    expect(doc.comoUsar).toHaveLength(3);
    expect(doc.documentos.map((d) => d.rotulo)).toEqual(['Treinamento', 'Campo']);
    for (const d of doc.documentos) expect(d.passos.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const p1 = doc.documentos[0].passos[0];
    expect(p1.nome).toBe('Conexão (com Abertura)');
    expect(p1.blocos.map((b) => b.tipo)).toEqual(['objetivo', 'estado', 'principio', 'dizer', 'perguntas', 'observar', 'avancar', 'silencio', 'objecoes', 'erro', 'sucesso']);
    const dizer = p1.blocos.find((b) => b.tipo === 'dizer')!;
    const falas = dizer.dizer.filter((n) => n.kind === 'fala') as any[];
    expect(falas).toHaveLength(3);
    expect(falas[0].n).toBe(1);
    expect(falas[0].voz).toBe('vendedor');
    expect(falas[0].vozRotulo).toBe('Vendedor');
    expect(falas[0].texto).toMatch(/^Prazer, eu sou o Rafael/);
    expect(falas[0].texto).not.toContain('[ficha');
    expect(falas[0].direcao).toBe('Diga o nome dele antes do nome da empresa.');
    expect(falas[2].voz).toBe('mentor');
    expect(falas[2].vozRotulo).toBe('Mentora');
    expect(falas[2].direcao).toContain('[ACIONAR MENTORA]');
    const p2 = doc.documentos[0].passos[1];
    const subs = p2.blocos.find((b) => b.tipo === 'dizer')!.dizer.filter((n) => n.kind === 'sub').map((n: any) => n.titulo);
    expect(subs).toEqual(['C · Contexto', 'N · Necessidade (desejo antes da dor)', 'C · Consequência (dos dois lados)', 'S · Soluções que você já tentou']);
    expect(p1.blocos.find((b) => b.tipo === 'perguntas')!.itens).toHaveLength(2);
    expect(p1.blocos.find((b) => b.tipo === 'erro')!.inline).toBe('colocar o moinho ou o Elos Club na frente da pessoa.');
    const campo5 = doc.documentos[1].passos[4];
    const f5 = campo5.blocos.find((b) => b.tipo === 'dizer')!.dizer[0] as any;
    expect(f5.texto).toContain('totalizando R$140 mil no primeiro ano');
    expect(f5.texto).not.toContain('fonte');
    expect(f5.direcao).toBe('[Silêncio.]');
    expect(campo5.blocos.map((b) => b.tipo)).toEqual(['dizer', 'perguntas', 'transicao', 'alerta', 'proximo']);
    expect(doc.documentos[0].extras.map((e) => e.titulo)).toEqual(['Performance e métricas']);
    expect(doc.mapa?.html).toMatch(/<table>/);
    expect(doc.cartao?.texto).toContain('Os 7 passos em 7 linhas');
    expect(doc.cartao?.texto).not.toContain('###');
    expect(doc.cartaoMontado).toBe(false);
    expect(doc.premissa).toBeNull();
    expect(JSON.stringify(doc)).not.toMatch(/\[ficha|\(fonte|a definir|Rastreabilidade/);
  });

  it('script v1 (um documento, "Como conduzir") vira um documento sem rotulo com falas nos cartoes', () => {
    const v1 = '# Script · Os 7 Passos · Elos Club\n\n**Para quem eu vendo:** o dono\n\n## Passo 1 · Conexão (com Abertura)\n\n**Objetivo:** abrir.\n\n**Como conduzir (falas e perguntas):**\n\n1. A minha frase `[ficha 2.1]`: "Prazer, sou a Paloma."\n2. "Segunda fala." Deixe o cliente responder.\n\n**Erro a evitar:** falar demais.\n\n## Passo 2 · Investigação (Método CNCS)\n\n**Objetivo:** ouvir.\n\n### C · Contexto\n\n1. Geração: "Em que geração a empresa está?"\n\n**Erro a evitar:** interrogar.\n';
    const doc = parseScript(v1);
    expect(doc.documentos).toHaveLength(1);
    expect(doc.documentos[0].id).toBe('d0');
    expect(doc.documentos[0].rotulo).toBe('');
    const p1 = doc.documentos[0].passos[0];
    expect(p1.blocos.map((b) => b.tipo)).toEqual(['objetivo', 'dizer', 'erro']);
    const falas = p1.blocos[1].dizer as any[];
    expect(falas[0].texto).toBe('Prazer, sou a Paloma.');
    expect(falas[0].direcao).toBe('A minha frase');
    expect(falas[1].direcao).toBe('Deixe o cliente responder.');
    const p2 = doc.documentos[0].passos[1];
    expect(p2.blocos.map((b) => b.tipo)).toEqual(['objetivo', 'dizer', 'erro']);
    expect(p2.blocos[1].dizer[0]).toEqual({ kind: 'sub', titulo: 'C · Contexto' });
    // sem "## Cartao de bolso": o leitor monta um a partir das falas
    expect(doc.cartaoMontado).toBe(true);
    expect(doc.cartao?.texto).toContain('1. Conexão (com Abertura): Prazer, sou a Paloma.');
  });

  it('markdownToTexto tira marcacao e vira tabela em linhas', () => {
    expect(markdownToTexto('### Titulo\n\n1. **Um** · `dois`\n\n| a | b |\n|--|--|\n| 1 | 2 |')).toBe('Titulo\n\n1. Um · dois\n\na · b\n1 · 2');
  });
});

describe('ScriptScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear(); sessionStorage.clear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  });

  it('sem versao: aviso de "está sendo escrito" com o status do job', async () => {
    (axios.get as any).mockResolvedValueOnce({ data: { success: true, versoes: [], job: { id: 'j1', tipo: 'script', status: 'running' } } });
    render(<ScriptScreen ficha={fichaMock()} token="t" />);
    expect(await screen.findByText('Seu script está sendo escrito.')).toBeInTheDocument();
    expect(screen.getByText('Sendo escrito agora.')).toBeInTheDocument();
    expect(screen.queryByText('Baixar o texto')).toBeNull();
  });

  it('sem versao e ficha aberta: manda para a ficha', async () => {
    (axios.get as any).mockResolvedValueOnce({ data: { success: true, versoes: [], job: null } });
    const onNavigate = vi.fn();
    render(<ScriptScreen ficha={fichaMock({ data: { club: { slug: 'x', nome: 'Clube X' }, ficha_status: 'em_revisao' } })} token="t" onNavigate={onNavigate} />);
    fireEvent.click(await screen.findByText('Ir para a ficha'));
    expect(onNavigate).toHaveBeenCalledWith('script_ficha');
  });

  it('com versao: abre no cartao, mapa com os 7 passos, um passo por tela com Treinamento e Campo, falas com copiar, folha de impressao inteira, sem marcas de fonte', async () => {
    mockVersao(FIXTURE);
    const { container } = render(<ScriptScreen ficha={fichaMock()} token="t" />);
    expect(await screen.findByText('Script v1')).toBeInTheDocument();
    const reader = await screen.findByTestId('script-reader');

    // primeira tela: cartao de bolso, com copiar
    expect(within(reader).getByText('Cartão de bolso')).toBeInTheDocument();
    fireEvent.click(within(reader).getByRole('button', { name: 'Copiar cartão de bolso' }));
    await waitFor(() => expect((navigator.clipboard.writeText as any)).toHaveBeenLastCalledWith(expect.stringContaining('Os 7 passos em 7 linhas')));

    // mapa: cartao, sumario, 7 passos, preparacao
    const nav = screen.getByRole('navigation', { name: 'Índice do script' });
    expect(within(nav).getAllByRole('button', { name: /^Passo \d:/ })).toHaveLength(7);
    expect(within(nav).getByRole('button', { name: 'Passo 2: Investigação (Método CNCS)' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Cartão de bolso' })).toHaveAttribute('aria-current', 'page');
    // o passo 2 tem comentario: ponto no mapa
    expect(within(nav).getByRole('button', { name: /^Passo 2:/ })).toHaveAttribute('data-marcada', 'sim');

    // sumario: titulo, cabecalho, os 7 passos em uma linha
    fireEvent.click(within(nav).getByRole('button', { name: 'Sumário' }));
    expect(await within(reader).findByText('Script dos 7 passos da venda')).toBeInTheDocument();
    expect(within(reader).getByText('Para quem eu vendo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir para o passo 3: Apresentação (da Solução)' })).toBeInTheDocument();

    // passo 1: treinamento com medalhao, falas em cartoes com copiar, etiquetas, checklist, notas
    await irParaPasso(1);
    expect(within(reader).getByText('Conexão (com Abertura)')).toBeInTheDocument();
    expect(reader.querySelector('.script-medalha')?.textContent).toBe('1');
    const falas = reader.querySelectorAll('.script-fala');
    expect(falas.length).toBe(3);
    const copiar = within(reader).getAllByRole('button', { name: /^Copiar fala/ });
    expect(copiar.length).toBe(3);
    fireEvent.click(copiar[0]);
    await waitFor(() => expect((navigator.clipboard.writeText as any)).toHaveBeenLastCalledWith(expect.stringContaining('Prazer, eu sou o Rafael')));
    expect((navigator.clipboard.writeText as any).mock.calls.at(-1)[0]).not.toContain('[ficha');
    expect(await within(reader).findByText('copiado')).toBeInTheDocument();
    expect(within(reader).getAllByText('Vendedor').length).toBeGreaterThan(0);
    expect(within(reader).getByText('Mentora')).toBeInTheDocument();
    expect(within(reader).getByText('ACIONAR MENTORA')).toBeInTheDocument();
    expect(reader.querySelectorAll('.script-check').length).toBe(2);
    expect(reader.querySelectorAll('.script-nota-erro').length).toBe(1);
    expect(within(reader).getByText('O que observar')).toBeInTheDocument();

    // aba Campo do mesmo passo
    fireEvent.click(screen.getByRole('tab', { name: 'Campo' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Campo' })).toHaveAttribute('aria-selected', 'true'));
    expect(within(reader).getByText(/Deixa eu entender o seu cenário/)).toBeInTheDocument();
    await irParaPasso(5);
    expect(within(reader).getByText(/totalizando R\$140 mil no primeiro ano/)).toBeInTheDocument();

    // preparacao e metricas: mapa em tabela + performance
    fireEvent.click(within(nav).getByRole('button', { name: 'Preparação e métricas' }));
    expect(await within(reader).findByText('Mapa de preparação')).toBeInTheDocument();
    expect(reader.querySelector('.script-table table')).not.toBeNull();
    expect(within(reader).getByText('Performance e métricas')).toBeInTheDocument();

    // a folha de impressao inteira (Ctrl+P): os dois documentos, 7 passos cada, cartao
    const paper = container.querySelector('#script-print-root')!;
    expect(paper.querySelector('.script-titulo p')?.textContent).toBe('Elos Club');
    const d1 = paper.querySelector('section[data-doc="d1"]')!;
    const d2 = paper.querySelector('section[data-doc="d2"]')!;
    expect(d1.querySelectorAll('section.script-passo')).toHaveLength(7);
    expect(d2.querySelectorAll('section.script-passo')).toHaveLength(7);
    expect(d1.querySelectorAll('.script-medalha')[6].textContent).toBe('7');
    expect(paper.querySelectorAll('.script-fala').length).toBeGreaterThanOrEqual(20);
    expect(paper.querySelector('#script-cartao')).not.toBeNull();

    // limpeza defensiva: nada de marca de fonte, nota editorial ou placeholder no que o leitor ve
    const texto = container.textContent || '';
    expect(texto).not.toContain('[ficha');
    expect(texto).not.toContain('(fonte');
    expect(texto).not.toContain('a definir');
    expect(texto).not.toContain('Rastreabilidade');
    expect(texto).not.toContain('Gerado só');
    expect(texto).not.toContain('\u2014');

    // acoes; o PDF abre a pagina de impressao (fora do Dashboard) com o documento escolhido
    fireEvent.click(screen.getByText('Mais'));
    expect(screen.getByText('Baixar o texto')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Imprimir ou salvar em PDF' })).toBeInTheDocument();
    const open = vi.fn().mockReturnValue({});
    Object.defineProperty(window, 'open', { value: open, configurable: true, writable: true });
    fireEvent.click(screen.getByTestId('pdf-campo'));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/dashboard\/script\/imprimir\?doc=campo&versao=1$/), '_blank', 'noopener');
    fireEvent.click(screen.getByTestId('pdf-treinamento'));
    expect(open).toHaveBeenLastCalledWith(expect.stringMatching(/doc=treinamento&versao=1$/), '_blank', 'noopener');
    fireEvent.click(screen.getByTestId('pdf-ambos'));
    expect(open).toHaveBeenLastCalledWith(expect.stringMatching(/doc=ambos&versao=1$/), '_blank', 'noopener');
    expect(screen.getByText('Aprovar o script')).toBeInTheDocument();
    expect(screen.getByText('Pedir nova versão')).toBeInTheDocument();
    expect(screen.queryByTestId('pedir-com-grifos')).toBeNull();
  }, 30000);

  it('comentarios recolhidos por passo (na tela do passo) e geral (no sumario), aprovar e pedir nova versao', async () => {
    mockVersao(FIXTURE);
    const ficha = fichaMock();
    render(<ScriptScreen ficha={ficha} token="t" />);
    await screen.findByText('Script v1');
    const nav = await irParaPasso(2);
    expect((await screen.findAllByText('Trocar a dor')).length).toBe(1);
    expect(screen.getAllByText('Comentar este passo')).toHaveLength(1);
    await irParaPasso(1);
    fireEvent.change(screen.getByPlaceholderText('O que mudar, cortar ou reforçar neste passo?'), { target: { value: 'Mais direto' } });
    fireEvent.click(screen.getByText('Enviar comentário'));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/comentarios', { passo: 1, texto: 'Mais direto' }, expect.anything()));
    expect((await screen.findAllByText('Mais direto')).length).toBeGreaterThan(0);
    expect(within(nav).getByRole('button', { name: /^Passo 1:/ })).toHaveAttribute('data-marcada', 'sim');
    fireEvent.click(within(nav).getByRole('button', { name: 'Sumário' }));
    expect(await screen.findByText('Comentar o script como um todo')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('O que achou do script como um todo?')).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText('Aprovar o script'));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/aprovar', {}, expect.anything()));
    expect(await screen.findByText('aprovado')).toBeInTheDocument();
    expect(ficha.refresh).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Pedir nova versão'));
    await waitFor(() => expect(ficha.pedirRevisao).toHaveBeenCalledWith(1));
    expect(ficha.gerarScript).not.toHaveBeenCalled();
    expect(await screen.findByText(/Pedido feito: a próxima versão parte desta e dos seus comentários/)).toBeInTheDocument();
    expect(screen.getByText('Nova versão a caminho')).toBeInTheDocument();
  }, 30000);

  it('"Escrever do zero" chama gerarScript (job script), separado de "Pedir nova versão"; com job ativo os dois travam', async () => {
    mockVersao(MD_V1);
    const ficha = fichaMock();
    render(<ScriptScreen ficha={ficha} token="t" />);
    // espera a versao carregar antes de clicar: o mock do framer-motion remonta o <button> a cada render
    await screen.findByTestId('script-reader');
    expect(screen.getByText(/Marque um trecho para grifar/)).toBeInTheDocument();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText('Escrever do zero'));
    await waitFor(() => expect(ficha.gerarScript).toHaveBeenCalled());
    expect(ficha.pedirRevisao).not.toHaveBeenCalled();
    expect(await screen.findByText(/^Pedido feito\. Você recebe/)).toBeInTheDocument();
    expect(screen.getByText('Nova versão a caminho')).toBeInTheDocument();
    expect(screen.getByText('Escrever do zero').closest('button')).toBeDisabled();
  });

  it('com job revisar na fila: estado do job aparece e os botoes ficam travados', async () => {
    mockVersao(MD_V1);
    (axios.get as any).mockImplementation(async (url: string) => {
      if (url === '/api/script/versoes') return { data: { success: true, versoes: [{ id: 'v1', versao: 1, status: 'rascunho', resumo: '', created_at: '2026-09-03 12:00:00', comentarios_count: 0 }], job: { id: 'j3', tipo: 'revisar', status: 'running' } } };
      if (url === '/api/script/versoes/1') return { data: { success: true, versao: { id: 'v1', versao: 1, status: 'rascunho', content_md: MD_V1, created_at: '2026-09-03 12:00:00' }, comentarios: [] } };
      if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos: [] } };
      throw new Error('url inesperada ' + url);
    });
    render(<ScriptScreen ficha={fichaMock()} token="t" />);
    await screen.findByTestId('script-reader');
    expect(await screen.findByText(/Uma nova versão está sendo escrita a partir dos seus comentários e grifos\./)).toBeInTheDocument();
    expect(screen.getByText('Nova versão a caminho').closest('button')).toBeDisabled();
    expect(screen.getByText('Escrever do zero').closest('button')).toBeDisabled();
  });

  it('versao v1 antiga (um documento, com marcas) tambem renderiza limpa, sem abas de documento', async () => {
    const v1 = '# Script v1 · Os 7 Passos · Elos Club\n\n> Gerado só a partir da ficha `[ficha X.Y]`.\n\n**Para quem eu vendo:** o dono `[ficha 3.1]`\n\n' +
      [1, 2, 3, 4, 5, 6, 7].map((n) => `## Passo ${n} · Nome ${n}\n\n**Objetivo:** objetivo ${n}.\n\n**Como conduzir:**\n\n1. Direção \`[ficha 2.1]\`: "Fala do passo ${n} (fonte: ficha 2.2)." Anote.\n\n**Erro a evitar:** erro ${n}.\n`).join('\n') +
      '\n## Rastreabilidade dos números\n\n| Número | Campo |\n|--|--|\n| R$14 mil | 5.3 |\n';
    mockVersao(v1);
    const { container } = render(<ScriptScreen ficha={fichaMock()} token="t" />);
    const reader = await screen.findByTestId('script-reader');
    // cartao montado a partir das falas
    expect(within(reader).getByText('Cartão de bolso')).toBeInTheDocument();
    expect(within(reader).getByText(/Montado a partir do script de campo/)).toBeInTheDocument();
    await irParaPasso(3);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(within(reader).getByText('Fala do passo 3.')).toBeInTheDocument();
    expect(container.querySelector('#script-print-root')!.querySelectorAll('section.script-passo')).toHaveLength(7);
    const texto = container.textContent || '';
    expect(texto).not.toContain('[ficha');
    expect(texto).not.toContain('(fonte');
    expect(texto).not.toContain('Rastreabilidade');
  }, 30000);

  it('nenhum texto visível usa travessão nem a palavra vetada', async () => {
    (axios.get as any).mockResolvedValueOnce({ data: { success: true, versoes: [], job: { id: 'j1', status: 'queued' } } });
    const { container } = render(<ScriptScreen ficha={fichaMock()} token="t" />);
    await screen.findByText('Seu script está sendo escrito.');
    const texto = container.textContent || '';
    expect(texto).not.toContain('\u2014');
    expect(texto.toLowerCase()).not.toContain(['diagn', 'óstico'].join(''));
  });
});
