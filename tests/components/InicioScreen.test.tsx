import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, within } from '@testing-library/react';

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
vi.mock('html2pdf.js', () => ({ default: {} }));

import { InicioScreen } from '../../components/script/InicioScreen';

/**
 * Tela de Início (decisão do Danilo, 10/09): os três cartões dizem o estado real da ficha sem a pessoa
 * abrir nada, e "Continuar de onde parei" leva para onde ela cairia ao entrar no app.
 * Aqui a ficha é um payload de mentira: a tela não faz chamada nenhuma, só lê.
 */
function fichaDe(over: Record<string, unknown> = {}) {
  const data = {
    club: { slug: 'elos', nome: 'Elos Club' },
    ficha_status: 'pre_preenchida',
    modo: 'completo',
    confirmada_por: null,
    suficiencia: null,
    materials_status: 'submitted',
    materials_submitted_at: '2026-09-01 10:00:00',
    materials: { links: [], observacoes: '', acessos: [], submitted_at: '2026-09-01 10:00:00' },
    job: null,
    script: { versoes: 0, ultima: null, aprovada: null, job: null, entregaveis: {} },
    config: { prazo_materiais: '' },
    visto_como_funciona: '2026-09-01T10:00:00.000Z',
    prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [], blocos: [], hoje: {}, dias: [],
    progresso: { total: 34, decididos: 12, obrigatorios: 34, obrigatorios_decididos: 12, confirmados: 12, editados: 0, aceitos_vazios: 0 },
    ...over,
  };
  return { data, loading: false, loaded: true, error: null } as any;
}

const abrir = (over: Record<string, unknown> = {}, props: Record<string, unknown> = {}) => {
  const onNavigate = vi.fn();
  const onVersaoAnterior = vi.fn();
  render(<InicioScreen ficha={fichaDe(over)} nome="Ana" onNavigate={onNavigate} onVersaoAnterior={onVersaoAnterior} {...props} />);
  return { onNavigate, onVersaoAnterior };
};

const cartao = (id: string) => within(screen.getByTestId(id));

describe('Início: cumprimento e o botão de seguir', () => {
  it('cumprimenta pelo nome e mostra o clube', () => {
    abrir();
    expect(screen.getByRole('heading', { name: 'Bem-vindo, Ana' })).toBeInTheDocument();
    expect(screen.getByText(/Elos Club/)).toBeInTheDocument();
  });

  it('"Continuar de onde parei" usa a mesma regra da entrada no app', () => {
    // Ficha em pré-preenchida sem suficiência: a rota de sempre é a Base do script
    const { onNavigate } = abrir();
    fireEvent.click(screen.getByTestId('inicio-continuar'));
    expect(onNavigate).toHaveBeenCalledWith('script_materiais_ficha');
  });

  it('ficha confirmada leva direto para "Seu script"', () => {
    const { onNavigate } = abrir({ ficha_status: 'confirmada' });
    fireEvent.click(screen.getByTestId('inicio-continuar'));
    expect(onNavigate).toHaveBeenCalledWith('script_script');
  });
});

describe('Início: cartão da base do script', () => {
  it('materiais enviados e a contagem de respostas confirmadas', () => {
    abrir();
    const c = cartao('inicio-card-base');
    expect(c.getByText('Materiais enviados.')).toBeInTheDocument();
    expect(c.getByText('Ficha: 12 de 34 confirmados.')).toBeInTheDocument();
  });

  it('materiais ainda não enviados', () => {
    abrir({ materials_status: 'pending' });
    expect(cartao('inicio-card-base').getByText('Materiais ainda não enviados.')).toBeInTheDocument();
  });

  it('quem pulou os materiais lê que seguiu sem eles', () => {
    abrir({ materials_status: 'skipped' });
    expect(cartao('inicio-card-base').getByText('Você seguiu sem enviar materiais.')).toBeInTheDocument();
  });

  it('o botão abre a base do script', () => {
    const { onNavigate } = abrir();
    fireEvent.click(screen.getByTestId('inicio-abrir-base'));
    expect(onNavigate).toHaveBeenCalledWith('script_materiais_ficha');
  });
});

describe('Início: cartão do script', () => {
  it('sem versão nenhuma, o cartão não promete número nem fala em ajustes', () => {
    abrir();
    const c = cartao('inicio-card-script');
    expect(c.getByText('Nenhuma versão escrita ainda.')).toBeInTheDocument();
    expect(c.queryByText(/ajuste/)).toBeNull();
  });

  it('script na fila: a tela diz que ele está sendo escrito', () => {
    abrir({ script: { versoes: 0, ultima: null, aprovada: null, job: { id: 'j1', tipo: 'script', status: 'running' }, entregaveis: {} } });
    expect(cartao('inicio-card-script').getByText('O seu script está sendo escrito.')).toBeInTheDocument();
  });

  it('rascunho: versão atual e quantos pedidos de ajuste sobram', () => {
    abrir({ script: { versoes: 2, ultima: { versao: 2, status: 'rascunho', created_at: '2026-09-05 10:00:00' }, aprovada: null, job: null, entregaveis: {}, ajustes_usados: 0, ajustes_limite: 1 } });
    const c = cartao('inicio-card-script');
    expect(c.getByText('Versão 2 em rascunho.')).toBeInTheDocument();
    expect(c.getByText('Resta 1 pedido de ajuste.')).toBeInTheDocument();
  });

  it('rodada de ajustes gasta: o cartão diz que não sobrou nenhum', () => {
    abrir({ script: { versoes: 2, ultima: { versao: 2, status: 'rascunho', created_at: '2026-09-05 10:00:00' }, aprovada: null, job: null, entregaveis: {}, ajustes_usados: 1, ajustes_limite: 1 } });
    expect(cartao('inicio-card-script').getByText('Sem pedidos de ajuste restantes.')).toBeInTheDocument();
  });

  it('aprovada: o número da versão aprovada vence o rascunho', () => {
    abrir({ script: { versoes: 3, ultima: { versao: 3, status: 'aprovado', created_at: '2026-09-06 10:00:00' }, aprovada: 3, job: null, entregaveis: {}, ajustes_usados: 0, ajustes_limite: 2 } });
    const c = cartao('inicio-card-script');
    expect(c.getByText('Versão 3 aprovada.')).toBeInTheDocument();
    expect(c.getByText('Restam 2 pedidos de ajuste.')).toBeInTheDocument();
  });

  it('o botão abre o script', () => {
    const { onNavigate } = abrir();
    fireEvent.click(screen.getByTestId('inicio-abrir-script'));
    expect(onNavigate).toHaveBeenCalledWith('script_script');
  });
});

describe('Início: cartão da apresentação', () => {
  it('sem entregável publicado, a tela diz de onde ela sai e não oferece botão', () => {
    abrir();
    const c = cartao('inicio-card-apresentacao');
    expect(c.getByText('Apresentação ainda não gerada.')).toBeInTheDocument();
    expect(c.getByText('Ela é montada a partir de uma versão do seu script.')).toBeInTheDocument();
    expect(screen.queryByTestId('inicio-abrir-apresentacao')).toBeNull();
  });

  it('com slides publicados, mostra a versão e abre o script', () => {
    const { onNavigate } = abrir({
      script: {
        versoes: 2, ultima: { versao: 2, status: 'rascunho', created_at: '2026-09-05 10:00:00' }, aprovada: null, job: null,
        entregaveis: { '2': [{ tipo: 'slides', versao: 2, created_at: '2026-09-06 10:00:00', arquivos: [{ campo: 'pptx', nome: 'a.pptx', bytes: 10, url: '/x' }] }] },
      },
    });
    expect(cartao('inicio-card-apresentacao').getByText('Apresentação pronta na versão 2.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('inicio-abrir-apresentacao'));
    expect(onNavigate).toHaveBeenCalledWith('script_script');
  });

  it('entregável de outro tipo, sem slides, não conta como apresentação pronta', () => {
    abrir({
      script: {
        versoes: 1, ultima: null, aprovada: null, job: null,
        entregaveis: { '1': [{ tipo: 'outro', versao: 1, created_at: '2026-09-06 10:00:00', arquivos: [{ campo: 'x', nome: 'x', bytes: 1, url: '/x' }] }] },
      },
    });
    expect(cartao('inicio-card-apresentacao').getByText('Apresentação ainda não gerada.')).toBeInTheDocument();
  });
});

describe('Início: quarto cartão da versão anterior', () => {
  it('quem não tem versão anterior não vê o cartão', () => {
    abrir();
    expect(screen.queryByTestId('inicio-card-anterior')).toBeNull();
  });

  it('quem tem vê o cartão e o botão devolve o comando para o Dashboard', () => {
    const { onVersaoAnterior } = abrir({}, { temVersaoAnterior: true });
    expect(screen.getByTestId('inicio-card-anterior')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('inicio-abrir-anterior'));
    expect(onVersaoAnterior).toHaveBeenCalledTimes(1);
  });
});

describe('Início: a copy segue as regras da casa', () => {
  it('o arquivo não traz travessão, "a definir", "diagnóstico" nem emoji', () => {
    const texto = fs.readFileSync(path.resolve(process.cwd(), 'components/script/InicioScreen.tsx'), 'utf8');
    expect(texto).not.toMatch(/—/);
    expect(texto).not.toMatch(/–/);
    expect(texto).not.toMatch(/a definir/i);
    expect(texto).not.toMatch(/diagn[oó]stico/i);
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('a tela montada não traz travessão nem exclamação', () => {
    abrir({}, { temVersaoAnterior: true });
    const texto = document.body.textContent || '';
    expect(texto).not.toMatch(/[—–]/);
    expect(texto).not.toMatch(/!/);
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
