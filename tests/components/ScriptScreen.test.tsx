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
    refresh: vi.fn(),
    ...over,
  } as any;
}

function mockVersao(md: string) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [{ id: 'v1', versao: 1, status: 'rascunho', resumo: 'primeira', created_at: '2026-09-03 12:00:00', comentarios_count: 0 }], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { id: 'v1', versao: 1, status: 'rascunho', content_md: md, created_at: '2026-09-03 12:00:00' }, comentarios: [{ id: 'c1', versao: 1, passo: 2, texto: 'Trocar a dor', autor_nome: 'Ana', created_at: '2026-09-03 12:10:00' }] } };
    throw new Error('url inesperada ' + url);
  });
  (axios.post as any).mockImplementation(async (url: string, body: any) => {
    if (url.endsWith('/comentarios')) return { data: { success: true, comentario: { id: 'c2', versao: 1, passo: body.passo, texto: body.texto, autor_nome: 'Ana', created_at: '2026-09-03 12:20:00' } } };
    if (url.endsWith('/aprovar')) return { data: { success: true, versao: { versao: 1, status: 'aprovado', aprovado_em: '2026-09-03 12:30:00' } } };
    throw new Error('post inesperado ' + url);
  });
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
  });

  it('markdownToTexto tira marcacao e vira tabela em linhas', () => {
    expect(markdownToTexto('### Titulo\n\n1. **Um** · `dois`\n\n| a | b |\n|--|--|\n| 1 | 2 |')).toBe('Titulo\n\n1. Um · dois\n\na · b\n1 · 2');
  });
});

describe('ScriptScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  });

  it('sem versao: aviso de "está sendo escrito" com o status do job', async () => {
    (axios.get as any).mockResolvedValueOnce({ data: { success: true, versoes: [], job: { id: 'j1', tipo: 'script', status: 'running' } } });
    render(<ScriptScreen ficha={fichaMock()} token="t" />);
    expect(await screen.findByText('Seu script está sendo escrito.')).toBeInTheDocument();
    expect(screen.getByText('Sendo escrito agora.')).toBeInTheDocument();
    expect(screen.queryByText('Baixar (.md)')).toBeNull();
  });

  it('sem versao e ficha aberta: manda para a ficha', async () => {
    (axios.get as any).mockResolvedValueOnce({ data: { success: true, versoes: [], job: null } });
    const onNavigate = vi.fn();
    render(<ScriptScreen ficha={fichaMock({ data: { club: { slug: 'x', nome: 'Clube X' }, ficha_status: 'em_revisao' } })} token="t" onNavigate={onNavigate} />);
    fireEvent.click(await screen.findByText('Ir para a ficha'));
    expect(onNavigate).toHaveBeenCalledWith('script_ficha');
  });

  it('com versao: documento diagramado com titulo, indice, 7 passos por documento, falas com copiar, cartao, sem marcas de fonte', async () => {
    mockVersao(FIXTURE);
    const { container } = render(<ScriptScreen ficha={fichaMock()} token="t" />);
    expect(await screen.findByText('Script dos 7 passos da venda')).toBeInTheDocument();
    expect(screen.getByText('Script v1')).toBeInTheDocument();
    const paper = container.querySelector('#script-print-root')!;
    expect(paper.querySelector('.script-titulo p')?.textContent).toBe('Elos Club');
    expect(paper.querySelector('.script-rule')).not.toBeNull();

    // indice do documento ativo (treinamento): 7 passos
    const nav = screen.getByRole('navigation', { name: 'Índice do script' });
    expect(within(nav).getAllByRole('button', { name: /^Passo \d:/ })).toHaveLength(7);
    expect(within(nav).getByRole('button', { name: 'Passo 2: Investigação (Método CNCS)' })).toBeInTheDocument();

    // 7 secoes em cada documento, medalhao numerado
    const d1 = container.querySelector('section[data-doc="d1"]')!;
    const d2 = container.querySelector('section[data-doc="d2"]')!;
    expect(d1.querySelectorAll('section.script-passo')).toHaveLength(7);
    expect(d2.querySelectorAll('section.script-passo')).toHaveLength(7);
    expect(d1.querySelectorAll('.script-medalha')[6].textContent).toBe('7');
    expect(d1.className).toContain('block');
    expect(d2.className).toContain('hidden');

    // falas em cartoes com botao copiar; texto limpo
    const falas = d1.querySelectorAll('.script-fala');
    expect(falas.length).toBeGreaterThanOrEqual(20);
    const copiar = within(d1 as HTMLElement).getAllByRole('button', { name: /^Copiar fala/ });
    expect(copiar.length).toBe(falas.length);
    fireEvent.click(copiar[0]);
    await waitFor(() => expect((navigator.clipboard.writeText as any)).toHaveBeenCalledWith(expect.stringContaining('Prazer, eu sou o Rafael')));
    expect((navigator.clipboard.writeText as any).mock.calls[0][0]).not.toContain('[ficha');
    expect(await within(d1 as HTMLElement).findByText('copiado')).toBeInTheDocument();

    // etiquetas de voz e instrucao
    expect(within(d1 as HTMLElement).getAllByText('Vendedor').length).toBeGreaterThan(0);
    expect(within(d1 as HTMLElement).getByText('Mentora')).toBeInTheDocument();
    expect(within(d1 as HTMLElement).getByText('ACIONAR MENTORA')).toBeInTheDocument();

    // checklist de perguntas, notas lado a lado, objecoes
    expect(d1.querySelectorAll('.script-check').length).toBeGreaterThan(10);
    expect(d1.querySelectorAll('.script-nota-erro').length).toBe(7);
    expect(within(d1 as HTMLElement).getAllByText('O que observar').length).toBe(7);

    // mapa e cartao de bolso com copiar
    expect(paper.querySelector('.script-table table')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar cartão de bolso' }));
    await waitFor(() => expect((navigator.clipboard.writeText as any)).toHaveBeenLastCalledWith(expect.stringContaining('Os 7 passos em 7 linhas')));

    // limpeza defensiva: nada de marca de fonte, nota editorial ou placeholder no que o leitor ve
    const texto = paper.textContent || '';
    expect(texto).not.toContain('[ficha');
    expect(texto).not.toContain('(fonte');
    expect(texto).not.toContain('a definir');
    expect(texto).not.toContain('Rastreabilidade');
    expect(texto).not.toContain('Gerado só');
    expect(texto).not.toContain('\u2014');

    // acoes
    expect(screen.getByText('Baixar (.md)')).toBeInTheDocument();
    expect(screen.getByText('Imprimir ou salvar em PDF')).toBeInTheDocument();
    expect(screen.getByText('Aprovar')).toBeInTheDocument();
    expect(screen.getByText('Pedir nova versão')).toBeInTheDocument();

    // seletor de documento: Campo passa a ser o visivel
    fireEvent.click(screen.getByRole('tab', { name: 'Campo' }));
    await waitFor(() => expect(container.querySelector('section[data-doc="d2"]')!.className).toContain('block'));
    expect(container.querySelector('section[data-doc="d1"]')!.className).toContain('hidden');
    expect(within(d2 as HTMLElement).getByText(/totalizando R\$140 mil no primeiro ano/)).toBeInTheDocument();
  }, 30000);

  it('comentarios recolhidos por passo, aprovar e pedir nova versao', async () => {
    mockVersao(FIXTURE);
    const ficha = fichaMock();
    render(<ScriptScreen ficha={ficha} token="t" />);
    await screen.findByText('Script dos 7 passos da venda');
    expect((await screen.findAllByText('Trocar a dor')).length).toBeGreaterThan(0);
    const resumos = screen.getAllByText('Comentar este passo');
    expect(resumos.length).toBe(14);
    const caixas = screen.getAllByPlaceholderText('O que mudar, cortar ou reforçar neste passo?');
    fireEvent.change(caixas[0], { target: { value: 'Mais direto' } });
    fireEvent.click(screen.getAllByText('Enviar comentário')[0]);
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/comentarios', { passo: 1, texto: 'Mais direto' }, expect.anything()));
    expect((await screen.findAllByText('Mais direto')).length).toBeGreaterThan(0);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText('Aprovar'));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/aprovar', {}, expect.anything()));
    expect(await screen.findByText('aprovado')).toBeInTheDocument();
    expect(ficha.refresh).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Pedir nova versão'));
    await waitFor(() => expect(ficha.gerarScript).toHaveBeenCalled());
    expect(await screen.findByText(/Pedido feito/)).toBeInTheDocument();
  }, 30000);

  it('versao v1 antiga (um documento, com marcas) tambem renderiza limpa, sem seletor de documento', async () => {
    const v1 = '# Script v1 · Os 7 Passos · Elos Club\n\n> Gerado só a partir da ficha `[ficha X.Y]`.\n\n**Para quem eu vendo:** o dono `[ficha 3.1]`\n\n' +
      [1, 2, 3, 4, 5, 6, 7].map((n) => `## Passo ${n} · Nome ${n}\n\n**Objetivo:** objetivo ${n}.\n\n**Como conduzir:**\n\n1. Direção \`[ficha 2.1]\`: "Fala do passo ${n} (fonte: ficha 2.2)." Anote.\n\n**Erro a evitar:** erro ${n}.\n`).join('\n') +
      '\n## Rastreabilidade dos números\n\n| Número | Campo |\n|--|--|\n| R$14 mil | 5.3 |\n';
    mockVersao(v1);
    const { container } = render(<ScriptScreen ficha={fichaMock()} token="t" />);
    await screen.findByText('Script dos 7 passos da venda');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(container.querySelectorAll('section.script-passo')).toHaveLength(7);
    expect(container.querySelectorAll('.script-fala')).toHaveLength(7);
    const texto = container.querySelector('#script-print-root')!.textContent || '';
    expect(texto).not.toContain('[ficha');
    expect(texto).not.toContain('(fonte');
    expect(texto).not.toContain('Rastreabilidade');
    expect(texto).toContain('Fala do passo 3.');
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
