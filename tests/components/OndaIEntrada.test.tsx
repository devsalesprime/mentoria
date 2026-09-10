import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';

/**
 * Onda I (SPEC-experiencia-pre-script-v1 §3): entrada e expectativa.
 * - I1: a tela "Como funciona" abre na PRIMEIRA entrada e depois vive no menu (decisao D1)
 * - I4: a linha da espera (fila com nome dos clubes + tempo medio) e o lembrete unico do WhatsApp
 * - I5: a espera antes da ficha quando a leitura ainda nao trouxe sugestao nenhuma
 * - Copy: sem travessao, sem "a definir", sem emoji, sem exclamacao
 */

vi.mock('axios');
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_: any, tag: string) => React.forwardRef((props: any, ref: any) => {
      const { children, initial, animate, exit, transition, whileHover, whileTap, variants, custom, ...rest } = props;
      return React.createElement(tag, { ...rest, ref }, children);
    }),
  }),
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

import { rotaInicialDoClube, esperandoPrimeiraSugestao, etapaInicialMateriaisFicha } from '../../hooks/useScriptFicha';
import type { ScriptFichaData, UseScriptFicha } from '../../hooks/useScriptFicha';
import { ComoFuncionaScreen, COPY_COMECAR, COPY_NADA_SE_PERDE, COPY_VER_EXEMPLO, VALE_MAIS } from '../../components/script/ComoFuncionaScreen';
import { EtaEspera, COPY_LEMBRETE_DISPENSAR, COPY_PODE_FECHAR } from '../../components/script/EtaEspera';
import { EsperaLeitura, COPY_RESPONDER_ANTES } from '../../components/script/EsperaLeitura';
import { fraseDaFila, frasePorMediana, linhaDeEspera, listarClubes } from '../../hooks/useEsperaScript';

const VISTO = '2026-09-07T10:00:00.000Z';

function campo(key: string, over: Record<string, unknown> = {}) {
  return {
    key, nome: `Campo ${key}`, bloco: 1, tipo: 'texto', obrigatorio: true, minutos: 1,
    status: 'vazio', valor: '', sugerido: '', classe: '', fonte: '', alternativas: [],
    decidido: false, essencial: true, ...over,
  } as any;
}

function dados(over: Partial<ScriptFichaData> = {}): ScriptFichaData {
  return {
    club: { slug: 'teste', nome: 'Clube de Teste' },
    ficha_status: 'vazia',
    modo: null,
    suficiencia: null,
    materials_status: 'pending', materials_submitted_at: null,
    materials: { links: [], observacoes: '', acessos: [], submitted_at: null },
    config: { prazo_materiais: '' },
    visto_como_funciona: null, visto_whatsapp_lembrete: null,
    prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [], dias: [], blocos: [], job: null,
    script: { versoes: 0, ultima: null, aprovada: null, job: null },
    hoje: { dia: 1, titulo: '', blocos: [], blocos_abertos: [], minutos: 0, em_breve: false },
    progresso: { total: 0, decididos: 0, obrigatorios: 0, obrigatorios_decididos: 0, confirmados: 0, editados: 0, aceitos_vazios: 0 },
    ...over,
  } as ScriptFichaData;
}

function fichaDe(extra: Partial<UseScriptFicha> = {}, data: ScriptFichaData | null = dados()): UseScriptFicha {
  return {
    data, loading: false, loaded: true, enabled: true, error: null, saveState: 'idle', ultimaSincronia: null,
    marcarComoFuncionaVisto: vi.fn().mockResolvedValue(true),
    marcarLembreteWhatsapp: vi.fn(),
    rotaDepoisDaEntrada: vi.fn().mockReturnValue('script_escolha'),
    salvarNotifyPhone: vi.fn().mockResolvedValue({ ok: true }),
    ...extra,
  } as unknown as UseScriptFicha;
}

/** Respostas das duas rotas de leitura da onda I. */
function mockRotas({ mediana = null as number | null, fila = null as any } = {}) {
  (axios.get as any).mockImplementation(async (url: string) => {
    if (url === '/api/script/tempos') {
      return { data: { success: true, tempos: {
        prefill: { mediana_min: mediana, n: mediana ? 5 : 0 },
        script: { mediana_min: mediana, n: mediana ? 5 : 0 },
        refinar: { mediana_min: null, n: 0 },
        slides: { mediana_min: null, n: 0 },
      } } };
    }
    if (url.startsWith('/api/script/fila')) {
      return { data: { success: true, ...(fila || { na_frente: 0, clubes: [], status: null, tem_job: false }) } };
    }
    throw new Error(`url inesperada ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRotas();
});

describe('I1: a tela inicial só na primeira entrada (decisão D1)', () => {
  it('rotaInicialDoClube manda para "Como funciona" enquanto a pessoa nunca clicou no botão', () => {
    const base = { ficha_status: 'vazia' as const, suficiencia: null };
    expect(rotaInicialDoClube({ ...base, visto_como_funciona: null })).toBe('script_como_funciona');
    // a tela vence até a ficha confirmada: é a primeira coisa que a pessoa vê
    expect(rotaInicialDoClube({ ficha_status: 'confirmada', suficiencia: null, modo: 'completo', visto_como_funciona: null })).toBe('script_como_funciona');
    // depois de vista, o fluxo normal volta
    expect(rotaInicialDoClube({ ...base, visto_como_funciona: VISTO })).toBe('script_escolha');
    expect(rotaInicialDoClube({ ...base, modo: 'completo', visto_como_funciona: VISTO, materials_status: 'skipped' })).toBe('script_materiais_ficha');
    // quem chamou sem carregar o dado (undefined) segue o fluxo de sempre
    expect(rotaInicialDoClube({ ...base })).toBe('script_escolha');
  });

  it('mostra o que recebe, as 3 etapas, o que vale mais mandar e a linha do "nada se perde"', async () => {
    render(<ComoFuncionaScreen ficha={fichaDe()} token="t" onNavigate={vi.fn()} />);
    expect(screen.getByTestId('como-funciona-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'O que você recebe' })).toBeInTheDocument();
    // onda J (item 4): Materiais e Ficha viraram uma etapa só
    expect(screen.getByRole('heading', { name: 'As 3 etapas' })).toBeInTheDocument();
    for (const nome of ['escolha', 'materiais-ficha', 'script']) {
      expect(screen.getByTestId(`etapa-${nome}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('etapa-materiais-ficha')).toHaveTextContent('Base do script');
    // o cartão de bolso saiu da lista do que a pessoa recebe
    expect(screen.getByTestId('como-funciona-screen').textContent).not.toContain('Cartão de bolso');
    for (const item of VALE_MAIS) expect(screen.getByText(item)).toBeInTheDocument();
    expect(screen.getByText(COPY_NADA_SE_PERDE)).toBeInTheDocument();
    expect(screen.getByTestId('comecar-script')).toHaveTextContent(COPY_COMECAR);
    await waitFor(() => expect(axios.get).toHaveBeenCalledWith('/api/script/tempos', expect.anything()));
  });

  it('o tempo das etapas vem do histórico; sem histórico, a linha sai sem número', async () => {
    const { unmount } = render(<ComoFuncionaScreen ficha={fichaDe()} token="t" onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('etapa-tempo-materiais-ficha')).toHaveTextContent('A leitura começa assim que você envia'));
    expect(screen.getByTestId('etapa-tempo-materiais-ficha').textContent).not.toMatch(/\d/);
    unmount();

    mockRotas({ mediana: 12 });
    render(<ComoFuncionaScreen ficha={fichaDe()} token="t" onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('etapa-tempo-script')).toHaveTextContent('A escrita do seu script costuma levar cerca de 12 min.'));
  });

  it('"Começar o meu script" grava a marca no servidor e leva para a rota calculada', async () => {
    const marcarComoFuncionaVisto = vi.fn().mockResolvedValue(true);
    const rotaDepoisDaEntrada = vi.fn().mockReturnValue('script_materiais_ficha');
    const onNavigate = vi.fn();
    render(<ComoFuncionaScreen ficha={fichaDe({ marcarComoFuncionaVisto, rotaDepoisDaEntrada })} token="t" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('comecar-script'));
    await waitFor(() => expect(marcarComoFuncionaVisto).toHaveBeenCalled());
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('script_materiais_ficha'));
  });

  it('abrir a tela já conta como vista: a marca não espera o clique no botão', async () => {
    const marcarComoFuncionaVisto = vi.fn().mockResolvedValue(true);
    const { unmount } = render(<ComoFuncionaScreen ficha={fichaDe({ marcarComoFuncionaVisto })} token="t" onNavigate={vi.fn()} />);
    await waitFor(() => expect(marcarComoFuncionaVisto).toHaveBeenCalledTimes(1));
    unmount();

    // quem já tem a marca não grava de novo
    const outro = vi.fn().mockResolvedValue(true);
    render(<ComoFuncionaScreen ficha={fichaDe({ marcarComoFuncionaVisto: outro }, dados({ visto_como_funciona: VISTO }))} token="t" onNavigate={vi.fn()} />);
    await screen.findByTestId('como-funciona-screen');
    expect(outro).not.toHaveBeenCalled();
  });

  it('o exemplo só aparece quando o admin configurou uma amostra', () => {
    const { unmount } = render(<ComoFuncionaScreen ficha={fichaDe()} token="t" onNavigate={vi.fn()} />);
    expect(screen.queryByTestId('ver-amostra')).toBeNull();
    unmount();
    const comAmostra = dados({ config: { prazo_materiais: '', amostra_disponivel: true } });
    render(<ComoFuncionaScreen ficha={fichaDe({}, comAmostra)} token="t" onNavigate={vi.fn()} />);
    expect(screen.getByTestId('ver-amostra')).toHaveTextContent(COPY_VER_EXEMPLO);
  });
});

describe('I4: a previsão das duas esperas', () => {
  it('a frase junta a fila com o nome dos clubes e o tempo médio (decisão D8)', () => {
    const fila = { na_frente: 2, clubes: ['Ceramfix', 'Laser Tech'], status: 'queued' as const, tem_job: true };
    expect(fraseDaFila(fila, 'prefill')).toBe('2 na frente: Ceramfix e Laser Tech');
    expect(linhaDeEspera(fila, 'prefill', 12)).toBe('2 na frente: Ceramfix e Laser Tech · a nossa leitura costuma levar cerca de 12 min');
    expect(linhaDeEspera(fila, 'script', 12)).toBe('2 na frente: Ceramfix e Laser Tech · a escrita costuma levar cerca de 12 min');
    // sem histórico a frase sai sem número
    expect(linhaDeEspera(fila, 'prefill', null)).toBe('2 na frente: Ceramfix e Laser Tech');
    expect(frasePorMediana(null)).toBeNull();
    expect(listarClubes(['A', 'B', 'C', 'D'])).toBe('A, B, C e mais 1');
  });

  it('ninguém na frente: "Você é o próximo" na fila, o estado do momento quando já começou', () => {
    const zero = { na_frente: 0, clubes: [], tem_job: true } as any;
    expect(fraseDaFila({ ...zero, status: 'queued' }, 'script')).toBe('Você é o próximo');
    expect(fraseDaFila({ ...zero, status: 'running' }, 'script')).toBe('Sendo escrito agora');
    expect(fraseDaFila({ ...zero, status: 'running' }, 'prefill')).toBe('Lendo os seus materiais agora');
    expect(fraseDaFila({ na_frente: 0, clubes: [], status: null, tem_job: false }, 'prefill')).toBe('');
  });

  it('com permissão do WhatsApp a tela diz que pode fechar; sem ela, um lembrete só', async () => {
    mockRotas({ mediana: 8, fila: { na_frente: 1, clubes: ['Ceramfix'], status: 'queued', tem_job: true } });
    const { unmount } = render(<EtaEspera token="t" tipo="prefill" temWhatsapp onConfirmarWhats={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('eta-espera-linha')).toHaveTextContent('1 na frente: Ceramfix · a nossa leitura costuma levar cerca de 8 min'));
    expect(screen.getByTestId('eta-espera-whatsapp-ok')).toHaveTextContent(COPY_PODE_FECHAR);
    expect(screen.queryByTestId('eta-espera-lembrete')).toBeNull();
    unmount();

    render(<EtaEspera token="t" tipo="prefill" onConfirmarWhats={vi.fn().mockResolvedValue({ ok: true })} />);
    expect(await screen.findByTestId('eta-espera-lembrete')).toBeInTheDocument();
  });

  it('quem dispensa o lembrete não é cobrado de novo (a marca fica no servidor)', async () => {
    const onDispensarLembrete = vi.fn();
    const { unmount } = render(
      <EtaEspera token="t" tipo="script" onConfirmarWhats={vi.fn()} onDispensarLembrete={onDispensarLembrete} />
    );
    fireEvent.click(await screen.findByTestId('eta-espera-dispensar'));
    expect(onDispensarLembrete).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('eta-espera-lembrete')).toBeNull());
    unmount();

    // Numa próxima visita, com a marca já gravada, o lembrete nem monta
    render(<EtaEspera token="t" tipo="script" onConfirmarWhats={vi.fn()} lembreteDispensado />);
    await waitFor(() => expect(screen.queryByTestId('eta-espera-lembrete')).toBeNull());
    expect(screen.queryByText(COPY_LEMBRETE_DISPENSAR)).toBeNull();
  });
});

describe('I5: a espera antes da ficha', () => {
  const jobLendo = { id: 'j1', tipo: 'prefill', status: 'running' as const, attempts: 1, created_at: '2026-09-07 10:00:00', started_at: '2026-09-07 10:00:10', finished_at: null };

  it('materiais enviados, leitura rodando e nenhuma sugestão: a rota é a espera, não a ficha crua', () => {
    const comum = { ficha_status: 'pre_preenchida' as const, suficiencia: null, modo: 'completo' as const, visto_como_funciona: VISTO };
    const semSugestao = { ...comum, materials_status: 'submitted' as const, job: jobLendo, blocos: [{ campos: [campo('1.1'), campo('1.2')] }] as any };
    expect(esperandoPrimeiraSugestao(semSugestao)).toBe(true);
    // onda J (item 4): a rota é a tela única; a espera é a etapa 2 dela
    expect(rotaInicialDoClube(semSugestao)).toBe('script_materiais_ficha');
    expect(etapaInicialMateriaisFicha(semSugestao)).toBe('espera');

    // chegou a primeira sugestão: a ficha volta a ser o destino
    const comSugestao = { ...semSugestao, blocos: [{ campos: [campo('1.1', { status: 'sugerido', sugerido: 'achado' })] }] as any };
    expect(esperandoPrimeiraSugestao(comSugestao)).toBe(false);
    expect(rotaInicialDoClube(comSugestao)).toBe('script_materiais_ficha');
    expect(etapaInicialMateriaisFicha(comSugestao)).toBe('ficha');

    // sem job, com job de outro tipo ou com a leitura terminada: nada de espera
    expect(esperandoPrimeiraSugestao({ ...semSugestao, job: null })).toBe(false);
    expect(esperandoPrimeiraSugestao({ ...semSugestao, job: { ...jobLendo, status: 'done' } })).toBe(false);
    expect(esperandoPrimeiraSugestao({ ...semSugestao, job: { ...jobLendo, tipo: 'script' } })).toBe(false);
    // quem pulou os materiais nunca espera leitura nenhuma
    expect(esperandoPrimeiraSugestao({ ...semSugestao, materials_status: 'skipped' })).toBe(false);
  });

  it('a tela de espera abre a ficha por escolha, nunca por padrão', async () => {
    mockRotas({ mediana: 9, fila: { na_frente: 0, clubes: [], status: 'running', tem_job: true } });
    const onNavigate = vi.fn();
    const d = dados({ visto_como_funciona: VISTO, modo: 'completo', materials_status: 'submitted', job: jobLendo as any });
    render(<EsperaLeitura ficha={fichaDe({}, d)} token="t" onNavigate={onNavigate} />);
    expect(screen.getByTestId('espera-leitura')).toBeInTheDocument();
    expect(screen.getByTestId('progresso-preenchimento')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('eta-prefill-linha')).toHaveTextContent('Lendo os seus materiais agora · a nossa leitura costuma levar cerca de 9 min'));
    fireEvent.click(screen.getByTestId('responder-enquanto-le'));
    expect(onNavigate).toHaveBeenCalledWith('script_ficha');
    expect(screen.getByTestId('responder-enquanto-le')).toHaveTextContent(COPY_RESPONDER_ANTES);
  });
});

describe('a copy das telas novas segue as regras da casa', () => {
  const ARQUIVOS = [
    'components/script/ComoFuncionaScreen.tsx',
    'components/script/InicioScreen.tsx',
    'components/script/MateriaisFichaScreen.tsx',
    'components/script/EtaEspera.tsx',
    'components/script/EsperaLeitura.tsx',
    'components/script/AmostraScript.tsx',
    'components/script/materiais/PrazoMateriais.tsx',
    'components/script/EscolhaCaminho.tsx',
    'components/script/materiais/categorias.ts',
    'hooks/useEsperaScript.ts',
  ];

  it.each(ARQUIVOS)('%s: sem travessão, sem "a definir", sem "diagnóstico" e sem emoji', (arquivo) => {
    const texto = fs.readFileSync(path.resolve(process.cwd(), arquivo), 'utf8');
    expect(texto).not.toMatch(/—/);
    expect(texto).not.toMatch(/–/);
    expect(texto).not.toMatch(/a definir/i);
    expect(texto).not.toMatch(/diagn[oó]stico/i);
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('o título da aba do navegador leva o nome novo da ferramenta', () => {
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    const titulo = /<title>([^<]*)<\/title>/.exec(html)?.[1] || '';
    expect(titulo).toBe('Prosperus · Script 7 Passos');
    expect(titulo).not.toMatch(/diagn[oó]stico/i);
    expect(titulo).not.toMatch(/[—–]/);
  });

  it('as telas montadas não trazem travessão nem exclamação', () => {
    const d = dados({ visto_como_funciona: VISTO, modo: 'completo', materials_status: 'submitted' });
    const { container } = render(
      <ComoFuncionaScreen ficha={fichaDe({}, d)} token="" onNavigate={vi.fn()} />
    );
    const texto = container.textContent || '';
    expect(texto).not.toMatch(/[—–]/);
    expect(texto).not.toMatch(/!/);
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
