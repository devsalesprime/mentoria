import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

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

import { ConfirmarEnvioModal } from '../../components/script/materiais/ConfirmarEnvioModal';
import {
  COPY_CONSENTIMENTO, COPY_WHATS_BOTAO, COPY_WHATS_ERRO, COPY_WHATS_LABEL, COPY_WHATS_SALVO, COPY_WHATS_SEM_PERMISSAO,
} from '../../components/script/materiais/ConsentimentoWhatsApp';

const props = () => ({
  isOpen: true as const,
  onClose: vi.fn(),
  onConfirm: vi.fn().mockResolvedValue({ ok: true, existing: false, job: { id: 'j1', status: 'queued' } }),
  onGoToFicha: vi.fn(),
  onConfirmarWhats: vi.fn().mockResolvedValue({ ok: true }),
});

describe('ConfirmarEnvioModal', () => {
  it('confirmou: chama o submit e vai direto para a ficha (existing = false)', async () => {
    const p = props();
    render(<ConfirmarEnvioModal {...p} />);
    expect(screen.getByText('Vamos começar a montar a sua ficha')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ir para a ficha' }));
    await act(async () => {});
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
    expect(p.onGoToFicha).toHaveBeenCalledWith(false);
  });

  it('já havia pré-preenchimento em andamento: também vai para a ficha (existing = true), sem tela intermediária', async () => {
    const p = { ...props(), onConfirm: vi.fn().mockResolvedValue({ ok: true, existing: true }) };
    render(<ConfirmarEnvioModal {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ir para a ficha' }));
    await act(async () => {});
    expect(p.onGoToFicha).toHaveBeenCalledWith(true);
    expect(screen.queryByText('Ir para a ficha')).not.toBeInTheDocument();
  });

  it('erro do servidor no envio aparece e não navega', async () => {
    const p = { ...props(), onConfirm: vi.fn().mockResolvedValue({ ok: false, message: 'Não deu.' }) };
    render(<ConfirmarEnvioModal {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ir para a ficha' }));
    await act(async () => {});
    expect(screen.getByText('Não deu.')).toBeInTheDocument();
    expect(p.onGoToFicha).not.toHaveBeenCalled();
  });

  it('o WhatsApp é independente do envio: sem a permissão marcada nada é guardado', async () => {
    const p = props();
    render(<ConfirmarEnvioModal {...p} />);
    fireEvent.change(screen.getByLabelText(COPY_WHATS_LABEL), { target: { value: '(11) 98765-4321' } });
    fireEvent.click(screen.getByRole('button', { name: COPY_WHATS_BOTAO }));
    await act(async () => {});
    expect(p.onConfirmarWhats).not.toHaveBeenCalled();
    expect(screen.getByText(COPY_WHATS_SEM_PERMISSAO)).toBeInTheDocument();
  });

  it('com a permissão marcada, guarda o número com a frase que a pessoa viu', async () => {
    const p = props();
    render(<ConfirmarEnvioModal {...p} sugerido="5511911112222" />);
    // o campo já vem com o número do cadastro
    expect((screen.getByLabelText(COPY_WHATS_LABEL) as HTMLInputElement).value).toBe('(11) 91111-2222');
    fireEvent.click(screen.getByLabelText(COPY_CONSENTIMENTO));
    fireEvent.click(screen.getByRole('button', { name: COPY_WHATS_BOTAO }));
    await act(async () => {});
    expect(p.onConfirmarWhats).toHaveBeenCalledWith({
      notify_phone: '(11) 91111-2222', consentimento: true, consent_texto: COPY_CONSENTIMENTO,
    });
    expect(screen.getByText(COPY_WHATS_SALVO)).toBeInTheDocument();
  });

  it('número incompleto com permissão marcada: erro na tela, sem chamar o servidor', async () => {
    const p = props();
    render(<ConfirmarEnvioModal {...p} />);
    fireEvent.change(screen.getByLabelText(COPY_WHATS_LABEL), { target: { value: '123' } });
    fireEvent.click(screen.getByLabelText(COPY_CONSENTIMENTO));
    fireEvent.click(screen.getByRole('button', { name: COPY_WHATS_BOTAO }));
    await act(async () => {});
    expect(p.onConfirmarWhats).not.toHaveBeenCalled();
    expect(screen.getByText(COPY_WHATS_ERRO)).toBeInTheDocument();
  });

  it('quem já confirmou o número não é perguntado de novo', () => {
    render(<ConfirmarEnvioModal {...props()} pedirWhats={false} />);
    expect(screen.queryByLabelText(COPY_WHATS_LABEL)).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar e ir para a ficha' })).toBeInTheDocument();
  });

  it('texto sem travessão, sem emoji, sem diagnóstico', () => {
    render(<ConfirmarEnvioModal {...props()} />);
    const t = document.body.textContent || '';
    expect(t).not.toContain('—');
    expect(t.toLowerCase()).not.toContain('diagnóstico');
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
