import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

import { EscolhaCaminho, NADA_SE_PERDE, TITULO_ESCOLHA } from '../../components/script/EscolhaCaminho';
import type { ScriptFichaData, UseScriptFicha } from '../../hooks/useScriptFicha';

function dados(over: Partial<ScriptFichaData> = {}): ScriptFichaData {
  return {
    club: { slug: 'teste', nome: 'Clube de Teste' },
    ficha_status: 'vazia',
    modo: null,
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

function fichaDe(extra: Partial<UseScriptFicha> = {}, data: ScriptFichaData | null = dados()): UseScriptFicha {
  return {
    data, loading: false, loaded: true, enabled: true, error: null, saveState: 'idle',
    definirModo: vi.fn().mockResolvedValue({ ok: true }),
    ...extra,
  } as unknown as UseScriptFicha;
}

// Onda I, item I3: o "em minutos" saiu da copy fixa; o tempo agora vem do histórico real (linha própria)
const TEXTO_ESSENCIAL = 'O cartão de bolso: as falas-chave dos 7 passos, o investimento total e a pergunta de recomendação, para levar para a reunião de amanhã.';
const TEXTO_COMPLETO = 'O script inteiro: treinamento com a anatomia de cada fala, roteiro de campo, apresentação comercial e as aulas da Dani em cada passo.';

describe('EscolhaCaminho: a pergunta da entrada', () => {
  it('mostra o título, os dois caminhos com a copy aprovada e a linha "nada se perde"', () => {
    render(<EscolhaCaminho ficha={fichaDe()} onNavigate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: TITULO_ESCOLHA })).toBeInTheDocument();
    expect(screen.getByText(NADA_SE_PERDE)).toBeInTheDocument();
    expect(NADA_SE_PERDE).toBe('Você pode começar pelo essencial e aprofundar depois: nada se perde.');

    const essencial = screen.getByTestId('caminho-essencial');
    expect(essencial).toHaveTextContent('Essencial');
    expect(essencial).toHaveTextContent(TEXTO_ESSENCIAL);
    const completo = screen.getByTestId('caminho-completo');
    expect(completo).toHaveTextContent('Completo');
    expect(completo).toHaveTextContent(TEXTO_COMPLETO);

    // verbo + objeto nos botões
    expect(screen.getByTestId('escolher-essencial')).toHaveTextContent('Começar pelo essencial');
    expect(screen.getByTestId('escolher-completo')).toHaveTextContent('Construir o completo');
  });

  it('a copy segue as regras da casa: sem travessão, sem "diagnóstico", sem emoji', () => {
    const { container } = render(<EscolhaCaminho ficha={fichaDe()} onNavigate={vi.fn()} />);
    const texto = container.textContent || '';
    expect(texto).not.toMatch(/—/);
    expect(texto).not.toMatch(/diagn[oó]stico/i);
    expect(texto).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('"Começar pelo essencial" grava o modo e leva para Materiais', async () => {
    const definirModo = vi.fn().mockResolvedValue({ ok: true });
    const onNavigate = vi.fn();
    render(<EscolhaCaminho ficha={fichaDe({ definirModo })} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('escolher-essencial'));
    await waitFor(() => expect(definirModo).toHaveBeenCalledWith('essencial'));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('script_materiais'));
  });

  it('"Construir o completo" grava o modo completo', async () => {
    const definirModo = vi.fn().mockResolvedValue({ ok: true });
    const onNavigate = vi.fn();
    render(<EscolhaCaminho ficha={fichaDe({ definirModo })} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('escolher-completo'));
    await waitFor(() => expect(definirModo).toHaveBeenCalledWith('completo'));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('script_materiais'));
  });

  it('se o servidor recusar, a pessoa fica na tela com um aviso em português', async () => {
    const definirModo = vi.fn().mockResolvedValue({ ok: false, message: 'Não deu para salvar a escolha agora. Tente de novo.' });
    const onNavigate = vi.fn();
    render(<EscolhaCaminho ficha={fichaDe({ definirModo })} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('escolher-essencial'));
    expect(await screen.findByTestId('escolha-erro')).toHaveTextContent('Não deu para salvar a escolha agora.');
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
