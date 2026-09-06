import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * "Não tenho materiais, ir para a ficha" (SPEC-workflow-v2-decisoes-06-09 §1, decisao 1):
 * quem nao tem material de vendas nem conversa com IA pula a etapa, NAO enfileira leitura nenhuma
 * e cai direto na ficha (essencial ou completa, conforme o caminho escolhido).
 */

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

vi.mock('axios', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { success: true, prompt: '' } }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

import { MateriaisScreen, COPY_PULAR_MATERIAIS } from '../../components/script/MateriaisScreen';
import type { ScriptFichaData, UseScriptFicha } from '../../hooks/useScriptFicha';

function dados(over: Partial<ScriptFichaData> = {}): ScriptFichaData {
  return {
    club: { slug: 'teste', nome: 'Clube de Teste' },
    ficha_status: 'vazia',
    modo: 'essencial',
    suficiencia: null,
    materials_status: 'pending', materials_submitted_at: null,
    materials: { links: [], observacoes: '', acessos: [], submitted_at: null },
    config: { prazo_materiais: '' }, prefilled_at: null, reviewed_at: null, last_user_activity_at: null,
    categorias: [], files: [], dias: [], blocos: [], job: null,
    hoje: { dia: 1, titulo: '', blocos: [], blocos_abertos: [], minutos: 0, em_breve: false },
    progresso: { total: 0, decididos: 0, obrigatorios: 0, obrigatorios_decididos: 0, confirmados: 0, editados: 0, aceitos_vazios: 0 },
    ...over,
  } as ScriptFichaData;
}

function fichaDe(extra: Partial<UseScriptFicha> = {}, data: ScriptFichaData = dados()): UseScriptFicha {
  return {
    data, loading: false, loaded: true, enabled: true, error: null, saveState: 'idle',
    saveMaterials: vi.fn().mockResolvedValue(true),
    submitMaterials: vi.fn().mockResolvedValue({ ok: true }),
    pularMateriais: vi.fn().mockResolvedValue({ ok: true }),
    setFiles: vi.fn(), refreshFiles: vi.fn(),
    ...extra,
  } as unknown as UseScriptFicha;
}

const montar = (ficha: UseScriptFicha, onNavigate = vi.fn()) => {
  render(<MemoryRouter><MateriaisScreen ficha={ficha} token="tok" onNavigate={onNavigate} /></MemoryRouter>);
  return onNavigate;
};

describe('Materiais: pular para a ficha', () => {
  it('o botão está na tela com a copy aprovada, sem travessão', () => {
    montar(fichaDe());
    const b = screen.getByTestId('pular-materiais');
    expect(b).toHaveTextContent(COPY_PULAR_MATERIAIS);
    expect(COPY_PULAR_MATERIAIS).toBe('Não tenho materiais, ir para a ficha');
    expect(COPY_PULAR_MATERIAIS).not.toMatch(/—/);
  });

  it('pular marca o skip e leva para a ficha, sem pedir leitura de material nenhuma', async () => {
    const pularMateriais = vi.fn().mockResolvedValue({ ok: true });
    const submitMaterials = vi.fn();
    const onNavigate = montar(fichaDe({ pularMateriais, submitMaterials }));
    fireEvent.click(screen.getByTestId('pular-materiais'));
    await waitFor(() => expect(pularMateriais).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('script_ficha'));
    // nada de pre-preenchimento: quem pulou nao mandou material para ler
    expect(submitMaterials).not.toHaveBeenCalled();
  });

  it('se o servidor recusar, a pessoa fica em Materiais com um aviso', async () => {
    const pularMateriais = vi.fn().mockResolvedValue({ ok: false, message: 'Não deu para seguir agora. Tente de novo.' });
    const onNavigate = montar(fichaDe({ pularMateriais }));
    fireEvent.click(screen.getByTestId('pular-materiais'));
    expect(await screen.findByText('Não deu para seguir agora. Tente de novo.')).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('quem já pulou vê "Ir para a ficha" e não vê mais o botão de pular', () => {
    montar(fichaDe({}, dados({ materials_status: 'skipped' })));
    expect(screen.queryByTestId('pular-materiais')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ir para a ficha' })).toBeInTheDocument();
  });

  it('quem já enviou não vê o botão de pular (enviar vence pular)', () => {
    montar(fichaDe({}, dados({ materials_status: 'submitted', materials_submitted_at: '2026-09-05 10:00:00' })));
    expect(screen.queryByTestId('pular-materiais')).toBeNull();
  });
});
