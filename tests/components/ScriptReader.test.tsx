import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import axios from 'axios';
import { ScriptScreen, emailDoToken } from '../../components/script/ScriptScreen';
import { classificaColchete, extrairPremissa, grifoEncontrado, montarCartao, parseAnatomiaLinha, parseScript, segmentar, textoDaTela } from '../../components/script/script/parseScript';
import { segmentarAnatomia, corDoComponente } from '../../components/script/script/AnatomiaFala';
import { guardarTela, lerTelaLembrada, passoDaTela, telaDoPasso, rotuloCurto, nomeTela } from '../../components/script/script/telas';
import { fraseResumo, grifoParaComentario, resumoGrifos } from '../../components/script/grifos/types';
import { capturarSelecao, criarIndice, encontrarNoTexto, localizarGrifo, normalizarTexto } from '../../components/script/grifos/anchor';

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

/** Fixture da doutrina 04/09: premissa REP, anatomia da fala e campos de personalizacao. */
const MD_DOUTRINA = [
  '# Script · Os 7 Passos da Venda · Elos Club',
  '',
  '**Para quem eu vendo:** o dono de indústria familiar',
  '**Quem conduz:** o closer do time',
  '',
  '## Como usar este script',
  '',
  '- Leia o Documento 1 antes; leve o Documento 2 aberto.',
  '',
  '# Documento 1 · Script completo para treinamento',
  '',
  '> **Premissa REP: Repetir, Elogiar, Perguntar**',
  '> Antes de avançar, repita as palavras-chave que a pessoa usou, elogie algo real que ela disse e faça a próxima pergunta.',
  '> Fonte: tradução do ACA de Alex Hormozi, $100M Leads (2023).',
  '',
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => [
    `## Passo ${n} · Nome do passo ${n}`,
    '',
    `**Objetivo estratégico:** objetivo do passo ${n}.`,
    '',
    '**Fala sugerida:**',
    '',
    `1. "[FALA DO VENDEDOR] Prazer, [nome], eu sou o Rafael, do time da Paloma. [repita a dor que ele acabou de falar] O meu objetivo hoje é entender o seu cenário no passo ${n}." Diga o nome dele antes da empresa.`,
    '> Anatomia da fala',
    '> - [Conexão] «Prazer, [nome], eu sou o Rafael» · por que: a pessoa antes da empresa',
    '> - [Permissão] «O meu objetivo hoje é entender o seu cenário» · por que: entrega o controle',
    '> - linha fora do formato que cai na lista',
    `2. "[FALA DO VENDEDOR] Segunda fala do passo ${n}, com [VALIDAR com a mentora] pendente."`,
    '> Anatomia da fala',
    '> - [Espelhamento] «trecho que não existe na fala» · por que: teste do fallback',
    '',
    '**Perguntas recomendadas:**',
    '',
    `- Pergunta do passo ${n}?`,
    '',
    `**Erro a evitar:** erro ${n}.`,
    '',
  ].join('\n')),
  '## Performance e métricas',
  '',
  '- **Tempo máximo da abertura:** cinco minutos.',
  '',
  '# Documento 2 · Script de campo',
  '',
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => [
    `## Passo ${n} · Nome do passo ${n}`,
    '',
    `1. "[FALA DO VENDEDOR] Fala de campo do passo ${n}, curta e falável." [Pausa.]`,
    '',
    '**Perguntas:**',
    '',
    `- Pergunta de campo ${n}?`,
    '',
    `**Próximo passo obrigatório:** o próximo do passo ${n}.`,
    '',
  ].join('\n')),
  '## Mapa de preparação',
  '',
  '| Passo | O que o passo pede | O que eu preparo antes |',
  '|--|--|--|',
  '| 1 | a pessoa antes da empresa | a frase de apresentação |',
  '',
  '## Cartão de bolso',
  '',
  '### Os 7 passos em 7 linhas',
  '',
  '1. Conexão: a pessoa antes da empresa.',
  '2. Investigação: contexto, desejo, dor.',
  '',
].join('\n');

function fichaMock(over: Partial<any> = {}) {
  return {
    data: {
      club: { slug: 'elos', nome: 'Elos Club' },
      ficha_status: 'confirmada',
      script: { versoes: 1, ultima: null, aprovada: null, job: null },
      blocos: [
        { numero: 1, campos: [{ key: '1.1', valor_efetivo: 'O Elos Club' }] },
        { numero: 5, campos: [{ key: '5.1', valor_efetivo: 'Sucessão organizada em 12 meses' }] },
        { numero: 6, campos: [{ key: '6.2', valor_efetivo: 'O closer; lead por indicação' }] },
      ],
    },
    gerarScript: vi.fn(async () => ({ ok: true, job: { id: 'j2', tipo: 'script', status: 'queued' }, existing: false })),
    pedirRevisao: vi.fn(async () => ({ ok: true, job: { id: 'j3', tipo: 'revisar', status: 'queued' }, existing: false })),
    refresh: vi.fn(),
    ...over,
  } as any;
}

// token com payload { user: 'ana@x.com' }
const TOKEN = `x.${Buffer.from(JSON.stringify({ userId: 'u1', user: 'ana@x.com', role: 'member' })).toString('base64').replace(/=+$/, '')}.y`;

function grifoFake(over: Partial<any> = {}) {
  return { id: `g-${Math.random().toString(36).slice(2)}`, versao: 1, passo: 2, documento: 'treinamento', texto: '', prefixo: '', sufixo: '', cor: 'dourado', nota: '', autor_email: 'ana@x.com', autor_nome: 'Ana Souza', created_at: '2026-09-04 10:00:00', resolvido_em: null, ...over };
}

function mockApi(md: string, grifos: any[] = [], comentarios: any[] = []) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/versoes') return { data: { success: true, versoes: [{ id: 'v1', versao: 1, status: 'rascunho', resumo: '', created_at: '2026-09-04 10:00:00', comentarios_count: comentarios.length }], job: { id: 'j1', status: 'done' } } };
    if (url === '/api/script/versoes/1') return { data: { success: true, versao: { id: 'v1', versao: 1, status: 'rascunho', content_md: md, created_at: '2026-09-04 10:00:00' }, comentarios } };
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifos } };
    throw new Error('url inesperada ' + url);
  });
  (axios.post as any).mockImplementation(async (url: string, body: any) => {
    if (url === '/api/script/versoes/1/grifos') return { data: { success: true, grifo: grifoFake({ ...body }) } };
    if (url.endsWith('/comentarios')) return { data: { success: true, comentario: { id: 'c2', versao: 1, passo: body.passo, texto: body.texto, autor_nome: 'Ana', created_at: '2026-09-04 10:20:00' } } };
    throw new Error('post inesperado ' + url);
  });
  (axios.patch as any).mockImplementation(async (url: string, body: any) => ({ data: { success: true, grifo: grifoFake({ id: url.split('/').pop(), ...body }) } }));
  (axios.delete as any).mockImplementation(async () => ({ data: { success: true } }));
}

/** Selecao falsa sobre um trecho de um no de texto dentro de `el`. */
function selecionar(el: Element, inicio: number, tamanho: number) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node && node.data.trim().length < inicio + tamanho) node = walker.nextNode() as Text | null;
  if (!node) throw new Error('sem no de texto grande o bastante');
  const range = document.createRange();
  range.setStart(node, inicio);
  range.setEnd(node, inicio + tamanho);
  const sel = { rangeCount: 1, isCollapsed: false, getRangeAt: () => range, toString: () => range.toString(), removeAllRanges: vi.fn() };
  (window as any).getSelection = () => sel;
  return { range, sel };
}

async function abrirEmPasso1() {
  const utils = render(<ScriptScreen ficha={fichaMock()} token={TOKEN} />);
  await screen.findByText('Script v1');
  const nav = await screen.findByRole('navigation', { name: 'Índice do script' });
  fireEvent.click(within(nav).getByRole('button', { name: /^Passo 1:/ }));
  await screen.findByText('Passo 1 de 7');
  return { ...utils, nav };
}

describe('parseScript · doutrina 04/09', () => {
  it('anatomia da fala: componentes, trecho literal e por que; linha fora do formato vai para a lista bruta', () => {
    expect(parseAnatomiaLinha('> - [Conexão] «Prazer, eu sou o Rafael» · por que: a pessoa antes da empresa')).toEqual({ componente: 'Conexão', trecho: 'Prazer, eu sou o Rafael', porque: 'a pessoa antes da empresa' });
    expect(parseAnatomiaLinha('> - [Prova] "trecho com aspas" por quê: liga ao método')).toEqual({ componente: 'Prova', trecho: 'trecho com aspas', porque: 'liga ao método' });
    expect(parseAnatomiaLinha('> - sem componente')).toBeNull();
    const doc = parseScript(MD_DOUTRINA);
    const p1 = doc.documentos[0].passos[0];
    const falas = p1.blocos.find((b) => b.tipo === 'dizer')!.dizer.filter((n) => n.kind === 'fala') as any[];
    expect(falas).toHaveLength(2);
    expect(falas[0].texto).toBe('Prazer, [nome], eu sou o Rafael, do time da Paloma. [repita a dor que ele acabou de falar] O meu objetivo hoje é entender o seu cenário no passo 1.');
    expect(falas[0].texto).not.toContain('Anatomia');
    expect(falas[0].direcao).toBe('Diga o nome dele antes da empresa.');
    expect(falas[0].anatomia).toEqual([
      { componente: 'Conexão', trecho: 'Prazer, [nome], eu sou o Rafael', porque: 'a pessoa antes da empresa' },
      { componente: 'Permissão', trecho: 'O meu objetivo hoje é entender o seu cenário', porque: 'entrega o controle' },
    ]);
    expect(falas[0].anatomiaBruta).toEqual(['linha fora do formato que cai na lista']);
    expect(falas[1].anatomia).toHaveLength(1);
    // o campo (documento 2) nao tem anatomia
    const campo = doc.documentos[1].passos[0].blocos.find((b) => b.tipo === 'dizer')!.dizer[0] as any;
    expect(campo.anatomia).toEqual([]);
    expect(campo.direcao).toBe('[Pausa.]');
    // fixture antiga continua sem anatomia
    const antigo = parseScript(FIXTURE);
    const f = antigo.documentos[0].passos[0].blocos.find((b) => b.tipo === 'dizer')!.dizer[0] as any;
    expect(f.anatomia).toEqual([]);
  });

  it('segmentarAnatomia sublinha os trechos encontrados, sem sobreposicao; cor fixa por componente', () => {
    const r = segmentarAnatomia('Prazer, eu sou o Rafael. O meu objetivo hoje é entender.', [
      { componente: 'Conexão', trecho: 'Prazer, eu sou o Rafael', porque: '' },
      { componente: 'Permissão', trecho: 'O meu objetivo hoje', porque: '' },
      { componente: 'Prova', trecho: 'não existe', porque: '' },
      { componente: 'Silêncio', trecho: 'eu sou', porque: 'sobrepõe' },
    ]);
    expect(r.encontrados).toBe(2);
    expect(r.segmentos.map((s) => [s.texto, s.item])).toEqual([
      ['Prazer, eu sou o Rafael', 0], ['. ', null], ['O meu objetivo hoje', 1], [' é entender.', null],
    ]);
    expect(corDoComponente('Conexão')).toBe(corDoComponente('conexao'));
    expect(corDoComponente('Permissão')).not.toBe(corDoComponente('Conexão'));
    expect(corDoComponente('Componente inventado')).toBeGreaterThanOrEqual(0);
  });

  it('colchetes: instrucao, campo de personalizacao (minuscula) e marca proibida', () => {
    expect(classificaColchete('Pausa.')).toBe('tag');
    expect(classificaColchete('FALA DO VENDEDOR')).toBe('tag');
    expect(classificaColchete('ACIONAR MENTORA')).toBe('tag');
    expect(classificaColchete('nome')).toBe('slot');
    expect(classificaColchete('repita a dor que ele acabou de falar')).toBe('slot');
    expect(classificaColchete('VALIDAR com a mentora')).toBe('proibido');
    expect(classificaColchete('DEFINIR VENDEDOR')).toBe('proibido');
    expect(segmentar('Oi [nome], [Pausa.] tudo [VALIDAR x]')).toEqual([
      { tipo: 'texto', valor: 'Oi ' }, { tipo: 'slot', valor: 'nome' }, { tipo: 'texto', valor: ', ' }, { tipo: 'tag', valor: 'Pausa.' },
      { tipo: 'texto', valor: ' tudo ' }, { tipo: 'proibido', valor: 'VALIDAR x' },
    ]);
  });

  it('premissa REP: caixa em blockquote (ou heading) antes do Passo 1, com a citacao separada', () => {
    const doc = parseScript(MD_DOUTRINA);
    expect(doc.premissa).not.toBeNull();
    expect(doc.premissa!.titulo).toBe('Premissa REP: Repetir, Elogiar, Perguntar');
    expect(doc.premissa!.citacao).toMatch(/Alex Hormozi/);
    expect(doc.premissa!.html).toMatch(/repita as palavras-chave/);
    expect(doc.premissa!.html).not.toMatch(/Hormozi/);
    expect(doc.documentos[0].extras.map((e) => e.titulo)).toEqual(['Performance e métricas']);
    const h = extrairPremissa(['', '### Premissa REP: Repetir, Elogiar, Perguntar', 'Repita. Elogie. Pergunte.', 'Alex Hormozi, $100M Leads, 2023.']);
    expect(h.premissa!.titulo).toBe('Premissa REP: Repetir, Elogiar, Perguntar');
    expect(h.premissa!.citacao).toBe('Alex Hormozi, $100M Leads, 2023.');
    expect(h.resto).toEqual(['']);
    expect(extrairPremissa(['sem premissa']).premissa).toBeNull();
    expect(parseScript(FIXTURE).premissa).toBeNull();
  });

  it('script sem cartao de bolso ganha um montado a partir do campo; textoDaTela e grifoEncontrado', () => {
    const semCartao = MD_DOUTRINA.split('## Cartão de bolso')[0];
    const doc = parseScript(semCartao);
    expect(doc.cartaoMontado).toBe(true);
    expect(doc.cartao!.texto).toContain('Os 7 passos em 7 linhas');
    expect(doc.cartao!.texto).toContain('1. Nome do passo 1: Fala de campo do passo 1, curta e falável.');
    expect(doc.cartao!.texto).toContain('Próximo passo obrigatório');
    expect(montarCartao(parseScript('# x\n\nnada'))).toBeNull();
    const com = parseScript(MD_DOUTRINA);
    expect(com.cartaoMontado).toBe(false);
    expect(textoDaTela(com, 0, 'campo')).toContain('Conexão: a pessoa antes da empresa.');
    expect(textoDaTela(com, 1, 'treinamento')).toContain('Premissa REP');
    expect(textoDaTela(com, 2, 'treinamento')).toContain('Prazer, nome , eu sou o Rafael');
    expect(textoDaTela(com, 2, 'campo')).toContain('Fala de campo do passo 1');
    expect(textoDaTela(com, 9, 'treinamento')).toContain('Tempo máximo da abertura');
    expect(grifoEncontrado(com, 2, 'treinamento', 'Prazer, [nome], eu sou o Rafael')).toBe(true);
    expect(grifoEncontrado(com, 2, 'campo', 'Prazer, [nome], eu sou o Rafael')).toBe(false);
    expect(grifoEncontrado(com, 3, 'treinamento', 'trecho que sumiu desta versão')).toBe(false);
  });
});

describe('telas e grifos (helpers)', () => {
  it('mapa tela <-> passo do comentario; rotulos; tela lembrada', () => {
    expect([0, 1, 2, 5, 8, 9].map(passoDaTela)).toEqual([0, 0, 1, 4, 7, 9]);
    expect([0, 1, 4, 7, 9].map(telaDoPasso)).toEqual([1, 2, 5, 8, 9]);
    expect(Array.from({ length: 10 }, (_, t) => rotuloCurto(t))).toEqual(['Cartão', 'Sumário', '1', '2', '3', '4', '5', '6', '7', 'Preparação']);
    expect(nomeTela(3, 'Investigação')).toBe('Passo 2 · Investigação');
    expect(lerTelaLembrada('elos', 1)).toBeNull();
    guardarTela('elos', 1, 4);
    expect(lerTelaLembrada('elos', 1)).toBe(4);
    localStorage.clear(); sessionStorage.clear();
  });

  it('grifo -> comentario nos 3 formatos; resumo; e-mail do token', () => {
    expect(grifoParaComentario({ cor: 'verde', texto: 'a pessoa antes da empresa', nota: '', passo: 1 })).toEqual({ passo: 0, texto: '[GRIFO manter] «a pessoa antes da empresa»' });
    expect(grifoParaComentario({ cor: 'vermelho', texto: 'colocar o moinho', nota: 'soa forçado', passo: 4 })).toEqual({ passo: 3, texto: '[GRIFO tirar] «colocar o moinho» → soa forçado' });
    expect(grifoParaComentario({ cor: 'dourado', texto: 'do time da Paloma', nota: 'o nome dele antes', passo: 9 })).toEqual({ passo: 9, texto: '[GRIFO ajustar] «do time da Paloma» → o nome dele antes' });
    expect(fraseResumo(resumoGrifos([{ cor: 'dourado' }, { cor: 'verde' }, { cor: 'vermelho' }, { cor: 'dourado' }] as any))).toBe('4 grifos: 2 para ajustar, 1 para manter, 1 para tirar');
    expect(fraseResumo(resumoGrifos([{ cor: 'verde' }] as any))).toBe('1 grifo: 1 para manter');
    expect(emailDoToken(TOKEN)).toBe('ana@x.com');
    expect(emailDoToken('lixo')).toBeNull();
  });

  it('ancora: indice colapsa espacos, acha o trecho entre nos, desempata pelo prefixo; captura le tela e documento', () => {
    const raiz = document.createElement('div');
    raiz.innerHTML = '<section data-tela="3" data-documento="campo"><p>Uma   pergunta <b>por vez</b>;\n desejo antes da dor.</p><p>Repita: uma pergunta por vez, sempre.</p></section>';
    document.body.appendChild(raiz);
    try {
      const idx = criarIndice(raiz);
      expect(idx.texto).toBe('Uma pergunta por vez; desejo antes da dor.Repita: uma pergunta por vez, sempre.');
      expect(normalizarTexto('  a \n b  ')).toBe('a b');
      const r = localizarGrifo(raiz, { texto: 'pergunta por vez; desejo' })!;
      expect(r).not.toBeNull();
      expect(r.toString().replace(/\s+/g, ' ')).toBe('pergunta por vez; desejo');
      // duas ocorrencias de "pergunta por vez": o prefixo escolhe a segunda
      expect(encontrarNoTexto(idx.texto, 'pergunta por vez', 'Repita: uma', ', sempre')).toBe(idx.texto.indexOf('pergunta por vez', 10));
      expect(encontrarNoTexto(idx.texto, 'pergunta por vez', 'Uma', '; desejo')).toBe(idx.texto.indexOf('pergunta por vez'));
      expect(localizarGrifo(raiz, { texto: 'não existe aqui' })).toBeNull();
      // "Uma   pergunta" (3 espacos no DOM) -> "Uma pergunta" na captura
      const { sel } = selecionar(raiz.querySelector('p')!, 0, 14);
      const cap = capturarSelecao(raiz, sel as any)!;
      expect(cap).toMatchObject({ tela: 3, documento: 'campo', curto: true });
      expect(cap.texto).toBe('Uma pergunta');
      expect(cap.sufixo.startsWith('por vez')).toBe(true);
      expect(capturarSelecao(raiz, { rangeCount: 0, isCollapsed: true } as any)).toBeNull();
    } finally {
      raiz.remove();
      delete (window as any).getSelection;
    }
  });
});

describe('ScriptScreen · leitor em telas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear(); sessionStorage.clear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  });

  it('script novo abre no cartao de bolso; Proximo leva ao sumario (premissa, ficha) e depois ao Passo 1 com as abas; a tela fica lembrada', async () => {
    mockApi(MD_DOUTRINA);
    const { container } = render(<ScriptScreen ficha={fichaMock()} token={TOKEN} />);
    await screen.findByText('Script v1');
    const reader = await screen.findByTestId('script-reader');
    expect(within(reader as HTMLElement).getByText('Cartão de bolso')).toBeInTheDocument();
    expect(within(reader as HTMLElement).getByText(/Conexão: a pessoa antes da empresa/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimir cartão de bolso' })).toBeInTheDocument();
    fireEvent.click(within(reader as HTMLElement).getByRole('button', { name: 'Copiar cartão de bolso' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Os 7 passos em 7 linhas')));
    const nav = screen.getByRole('navigation', { name: 'Índice do script' });
    expect(within(nav).getByRole('button', { name: 'Cartão de bolso' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getAllByRole('button', { name: /^Passo \d:/ })).toHaveLength(7);
    expect(within(nav).getByRole('button', { name: 'Tela anterior' })).toBeDisabled();

    fireEvent.click(within(nav).getByRole('button', { name: 'Próxima tela' }));
    // (a folha de impressao escondida tambem tem o titulo: consultar dentro do leitor)
    expect(await within(reader).findByText('Script dos 7 passos da venda')).toBeInTheDocument();
    expect(within(reader).getByText('Para quem eu vendo')).toBeInTheDocument();
    expect(within(reader).getByText('Promessa')).toBeInTheDocument();
    expect(within(reader).getByText('Sucessão organizada em 12 meses')).toBeInTheDocument();
    expect(within(reader).getByText('Os 3 blocos da conversa')).toBeInTheDocument();
    expect(within(reader).getByText('Os 7 passos, um por tela')).toBeInTheDocument();
    const premissa = within(reader).getByTestId('premissa');
    expect(within(premissa).getByText('Premissa REP: Repetir, Elogiar, Perguntar')).toBeInTheDocument();
    expect(within(premissa).getByText(/Alex Hormozi/)).toBeInTheDocument();
    expect(within(reader).getByText('Treinamento')).toBeInTheDocument();
    expect(within(reader).getByText('Comentar o script como um todo')).toBeInTheDocument();
    expect(lerTelaLembrada('elos', 1)).toBe(1);

    fireEvent.click(within(nav).getByRole('button', { name: 'Próxima tela' }));
    expect(await screen.findByText('Passo 1 de 7')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Treinamento' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Comentar este passo')).toBeInTheDocument();
    // campos de personalizacao e marca proibida
    const slots = within(reader).getAllByTestId('slot');
    expect(slots.map((s) => s.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('nome'), expect.stringContaining('repita a dor que ele acabou de falar')]));
    expect(slots[0]).toHaveAttribute('title', 'personalize com o que este cliente disse');
    expect(within(reader).getByTestId('proibido').textContent).toBe('VALIDAR com a mentora');
    // copiar mantem os colchetes
    fireEvent.click(within(reader).getAllByRole('button', { name: /^Copiar fala 1/ })[0]);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(expect.stringContaining('[repita a dor que ele acabou de falar]')));
    // anatomia: trechos sublinhados + etiquetas; tocar na etiqueta destaca o trecho; fallback em lista
    const anatomias = within(reader).getAllByTestId('anatomia');
    expect(anatomias.length).toBe(2);
    // fechada por padrao ("Por que funciona"); abre nas duas
    expect(reader.querySelectorAll('mark.script-anatomia-trecho')).toHaveLength(0);
    fireEvent.click(within(anatomias[0]).getByRole('button', { name: 'Por que funciona' }));
    fireEvent.click(within(anatomias[1]).getByRole('button', { name: 'Por que funciona' }));
    const chips = within(anatomias[0]).getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
    expect(chips.map((c) => c.textContent)).toEqual(['Conexão · a pessoa antes da empresa', 'Permissão · entrega o controle']);
    expect(reader.querySelectorAll('mark.script-anatomia-trecho')).toHaveLength(2);
    fireEvent.click(chips[1]);
    expect(chips[1]).toHaveAttribute('aria-pressed', 'true');
    expect(reader.querySelector('mark.script-anatomia-trecho-ativa')!.textContent).toBe('O meu objetivo hoje é entender o seu cenário');
    expect(within(anatomias[1]).getByText(/trecho que não existe na fala/)).toBeInTheDocument();
    expect(anatomias[1].querySelector('ul')).not.toBeNull();

    // aba Campo
    fireEvent.click(screen.getByRole('tab', { name: 'Campo' }));
    expect(await within(reader).findByText(/Fala de campo do passo 1/)).toBeInTheDocument();
    expect(within(reader).getByText('Pausa.')).toBeInTheDocument();
    expect(lerTelaLembrada('elos', 1)).toBe(2);

    // setas do teclado
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByText('Passo 2 de 7')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(await screen.findByText('Passo 1 de 7')).toBeInTheDocument();

    // ultima tela
    fireEvent.click(within(nav).getByRole('button', { name: 'Preparação e métricas' }));
    expect(await within(reader).findByText(/Tempo máximo da abertura/)).toBeInTheDocument();
    expect(reader.querySelector('.script-table table')).not.toBeNull();
    expect(within(nav).getByRole('button', { name: 'Próxima tela' })).toBeDisabled();

    // a folha de impressao inteira continua no DOM (Ctrl+P imprime os dois documentos)
    const paper = container.querySelector('#script-print-root')!;
    expect(paper.querySelectorAll('section[data-doc="d1"] section.script-passo')).toHaveLength(7);
    expect(paper.querySelectorAll('section[data-doc="d2"] section.script-passo')).toHaveLength(7);
    expect(container.querySelector('#script-cartao-print')).not.toBeNull();

    const texto = container.textContent || '';
    expect(texto).not.toContain('\u2014');
    expect(texto.toLowerCase()).not.toContain(['diagn', 'óstico'].join(''));
    expect(texto).not.toMatch(/\bjob\b|cohort|gate/i);
  }, 30000);

  it('tela lembrada por versao: abre direto no Passo 2', async () => {
    guardarTela('elos', 1, 3);
    mockApi(MD_DOUTRINA);
    render(<ScriptScreen ficha={fichaMock()} token={TOKEN} />);
    expect(await screen.findByText('Passo 2 de 7')).toBeInTheDocument();
  });

  it('grifar: selecao -> balao -> cor + nota -> POST; painel lista, mapa marca a tela; apagar; editar nota', async () => {
    mockApi(MD_DOUTRINA);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container, nav } = await abrirEmPasso1();
    const fala = container.querySelector('[data-testid="script-reader"] .script-fala-texto')!;
    const { range } = selecionar(fala, 0, 24);
    const selecionado = normalizarTexto(range.toString());
    expect(selecionado.length).toBe(24);
    expect(screen.queryByTestId('grifo-balao')).toBeNull();
    await act(async () => { document.dispatchEvent(new Event('selectionchange')); });
    const balao = await screen.findByTestId('grifo-balao', {}, { timeout: 3000 });
    expect(within(balao).getByText(`«${selecionado}»`)).toBeInTheDocument();
    fireEvent.click(within(balao).getByRole('button', { name: 'Ajustar' }));
    await waitFor(() => expect(within(screen.getByTestId('grifo-balao')).getByRole('button', { name: 'Ajustar' })).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.change(within(screen.getByTestId('grifo-balao')).getByPlaceholderText(/Nota \(opcional\): o que mudar/), { target: { value: 'dizer o nome dele antes' } });
    fireEvent.click(within(screen.getByTestId('grifo-balao')).getByRole('button', { name: 'Salvar grifo' }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/api/script/versoes/1/grifos', expect.objectContaining({
      passo: 2, documento: 'treinamento', cor: 'dourado', nota: 'dizer o nome dele antes', texto: selecionado,
    }), expect.anything()));
    const enviado = (axios.post as any).mock.calls.find((c: any[]) => c[0] === '/api/script/versoes/1/grifos')[1];
    expect(enviado.texto.length).toBeGreaterThanOrEqual(20);
    expect(typeof enviado.prefixo).toBe('string');
    expect(enviado.sufixo.length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByTestId('grifo-balao')).toBeNull());

    // painel "Seus grifos" (desktop): item com cor, trecho, nota, autor; tela marcada no mapa; botao de pedir com grifos
    const painel = screen.getAllByTestId('grifos-painel')[0];
    const item = within(painel).getByTestId('grifo-item');
    expect(within(item).getByText('Ajustar')).toBeInTheDocument();
    expect(within(item).getByText(/por Ana$/)).toBeInTheDocument();
    expect(within(item).getByText('dizer o nome dele antes')).toBeInTheDocument();
    // reancorado no texto da tela (o painel so marca "nao encontrado" quando a ancora falha)
    await waitFor(() => expect(within(screen.getAllByTestId('grifos-painel')[0]).queryByText('trecho não encontrado nesta versão')).toBeNull());
    expect(within(nav).getByRole('button', { name: /^Passo 1:/ })).toHaveAttribute('data-marcada', 'sim');
    expect(screen.getByTestId('pedir-com-grifos').textContent).toContain('(1)');

    // editar nota (autor)
    fireEvent.click(within(item).getByRole('button', { name: 'Editar nota' }));
    fireEvent.change(within(item).getByLabelText('Nota do grifo'), { target: { value: 'nome antes da empresa' } });
    fireEvent.click(within(item).getByRole('button', { name: 'Salvar nota' }));
    await waitFor(() => expect(axios.patch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/script\/grifos\/g-/), { nota: 'nome antes da empresa' }, expect.anything()));
    expect(await within(item).findByText('nome antes da empresa')).toBeInTheDocument();

    // apagar (autor)
    fireEvent.click(within(item).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/script\/grifos\/g-/), expect.anything()));
    await waitFor(() => expect(within(painel).queryByTestId('grifo-item')).toBeNull());
    expect(screen.queryByTestId('pedir-com-grifos')).toBeNull();
  }, 30000);

  it('selecao curta avisa em vez de salvar; grifo de outra pessoa nao tem apagar; trecho que sumiu aparece marcado', async () => {
    const deOutro = grifoFake({ id: 'g-beto', passo: 3, texto: 'trecho que não existe mais nesta versão do script', cor: 'verde', autor_email: 'beto@x.com', autor_nome: 'Beto Lima' });
    mockApi(MD_DOUTRINA, [deOutro]);
    const { container } = await abrirEmPasso1();
    const painel = screen.getAllByTestId('grifos-painel')[0];
    const item = await within(painel).findByTestId('grifo-item');
    expect(within(item).getByText('por Beto')).toBeInTheDocument();
    expect(within(item).getByText('trecho não encontrado nesta versão')).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: 'Apagar' })).toBeNull();
    expect(within(item).queryByRole('button', { name: 'Editar nota' })).toBeNull();
    fireEvent.click(within(item).getByRole('button', { name: 'Ir para' }));
    expect(await screen.findByText('Passo 2 de 7')).toBeInTheDocument();

    const fala = container.querySelector('[data-testid="script-reader"] .script-fala-texto')!;
    selecionar(fala, 0, 8);
    await act(async () => { document.dispatchEvent(new Event('selectionchange')); });
    const balao = await screen.findByTestId('grifo-balao', {}, { timeout: 3000 });
    expect(within(balao).getByText(/pelo menos 20 caracteres/)).toBeInTheDocument();
    expect(within(balao).queryByRole('button', { name: 'Ajustar' })).toBeNull();
    fireEvent.click(within(balao).getByRole('button', { name: 'Fechar o balão de grifo' }));
    await waitFor(() => expect(screen.queryByTestId('grifo-balao')).toBeNull());
  }, 30000);

  it('"Pedir nova versão com os grifos": resumo, orientacao geral e os 3 formatos de comentario (passo 0, 1..7 e 9)', async () => {
    const grifos = [
      grifoFake({ id: 'g1', passo: 0, documento: 'campo', texto: 'Conexão: a pessoa antes da empresa.', cor: 'verde' }),
      grifoFake({ id: 'g2', passo: 2, texto: 'do time da Paloma', cor: 'dourado', nota: 'dizer o nome dele antes' }),
      grifoFake({ id: 'g3', passo: 9, texto: 'a frase de apresentação', cor: 'vermelho', nota: 'não cabe no mapa' }),
      grifoFake({ id: 'g4', passo: 3, texto: 'resolvido não entra', cor: 'vermelho', resolvido_em: '2026-09-03 10:00:00' }),
    ];
    mockApi(MD_DOUTRINA, grifos);
    const ficha = fichaMock();
    render(<ScriptScreen ficha={ficha} token={TOKEN} />);
    await screen.findByText('Script v1');
    const botao = await screen.findByTestId('pedir-com-grifos');
    expect(botao.textContent).toContain('(3)');
    fireEvent.click(botao);
    const modal = await screen.findByTestId('modal-grifos');
    expect(within(modal).getByTestId('resumo-grifos').textContent).toBe('3 grifos: 1 para ajustar, 1 para manter, 1 para tirar');
    fireEvent.change(within(modal).getByPlaceholderText(/falas mais curtas/i), { target: { value: 'Tom mais direto no passo 2' } });
    // o mock do framer-motion remonta o conteudo do Modal a cada render: consultar de novo antes de clicar
    fireEvent.click(within(screen.getByTestId('modal-grifos')).getByRole('button', { name: 'Pedir nova versão' }));
    await waitFor(() => expect(ficha.pedirRevisao).toHaveBeenCalledWith(1, 'Tom mais direto no passo 2', {
      comentarios: [
        { passo: 0, texto: '[GRIFO manter] «Conexão: a pessoa antes da empresa.»' },
        { passo: 1, texto: '[GRIFO ajustar] «do time da Paloma» → dizer o nome dele antes' },
        { passo: 9, texto: '[GRIFO tirar] «a frase de apresentação» → não cabe no mapa' },
      ],
    }));
    expect(await screen.findByText(/Pedido feito com 3 grifos/)).toBeInTheDocument();
    expect(screen.getAllByText('Nova versão a caminho').length).toBeGreaterThan(0);
  }, 30000);

  it('nova versao publicada enquanto a tela esta aberta: seleciona a v2 e mantem a mesma tela', async () => {
    let chamadas = 0;
    (axios.get as any).mockImplementation(async (url: string) => {
      if (url === '/api/script/versoes') {
        chamadas += 1;
        const v1 = { id: 'v1', versao: 1, status: 'rascunho', resumo: '', created_at: '2026-09-04 10:00:00', comentarios_count: 0 };
        if (chamadas === 1) return { data: { success: true, versoes: [v1], job: { id: 'j3', tipo: 'revisar', status: 'running' } } };
        return { data: { success: true, versoes: [{ ...v1, id: 'v2', versao: 2 }, v1], job: { id: 'j3', tipo: 'revisar', status: 'done' } } };
      }
      if (url === '/api/script/versoes/1') return { data: { success: true, versao: { id: 'v1', versao: 1, status: 'rascunho', content_md: MD_DOUTRINA, created_at: '2026-09-04 10:00:00' }, comentarios: [] } };
      if (url === '/api/script/versoes/2') return { data: { success: true, versao: { id: 'v2', versao: 2, status: 'rascunho', content_md: MD_DOUTRINA.replace(/Nome do passo/g, 'Passo novo'), created_at: '2026-09-04 11:00:00' }, comentarios: [] } };
      if (url.endsWith('/grifos')) return { data: { success: true, grifos: [] } };
      throw new Error('url inesperada ' + url);
    });
    // a consulta roda a cada 20 s em producao; aqui a cada 60 ms
    render(<ScriptScreen ficha={fichaMock()} token={TOKEN} pollMs={60} />);
    await screen.findByText('Script v1');
    const nav = await screen.findByRole('navigation', { name: 'Índice do script' });
    fireEvent.click(within(nav).getByRole('button', { name: /^Passo 3:/ }));
    await screen.findByText('Passo 3 de 7');
    expect(await screen.findByText('Script v2', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(await screen.findByText(/Nova versão pronta: v2/)).toBeInTheDocument();
    const reader = await screen.findByTestId('script-reader');
    await waitFor(() => expect(within(reader).getAllByText('Passo novo 3').length).toBeGreaterThan(0));
    expect(within(reader).getByText('Passo 3 de 7')).toBeInTheDocument();
    expect(lerTelaLembrada('elos', 2)).toBe(4);
  }, 30000);
});
