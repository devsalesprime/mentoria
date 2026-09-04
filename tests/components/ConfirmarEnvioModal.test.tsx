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

import { ConfirmarEnvioModal, phoneError } from '../../components/script/materiais/ConfirmarEnvioModal';

describe('ConfirmarEnvioModal', () => {
  it('confirmou: chama o submit e vai direto para a ficha (existing = false)', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, existing: false, job: { id: 'j1', status: 'queued' } });
    const onGoToFicha = vi.fn();
    render(<ConfirmarEnvioModal isOpen onClose={vi.fn()} onConfirm={onConfirm} onGoToFicha={onGoToFicha} initialPhone="11987654321" />);
    expect(screen.getByText('Vamos começar a montar a sua ficha')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ir para a ficha' }));
    await act(async () => {});
    expect(onConfirm).toHaveBeenCalledWith({ notify_phone: '11987654321', notify: true });
    expect(onGoToFicha).toHaveBeenCalledWith(false);
  });

  it('já havia pré-preenchimento em andamento: também vai para a ficha (existing = true), sem tela intermediária', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, existing: true });
    const onGoToFicha = vi.fn();
    render(<ConfirmarEnvioModal isOpen onClose={vi.fn()} onConfirm={onConfirm} onGoToFicha={onGoToFicha} />);
    fireEvent.click(screen.getByLabelText('Quero receber o aviso no WhatsApp'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ir para a ficha' }));
    await act(async () => {});
    expect(onConfirm).toHaveBeenCalledWith({ notify_phone: '', notify: false });
    expect(onGoToFicha).toHaveBeenCalledWith(true);
    expect(screen.queryByText('Ir para a ficha')).not.toBeInTheDocument();
  });

  it('telefone inválido não envia; erro do servidor aparece e não navega', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: false, message: 'Não deu.' });
    const onGoToFicha = vi.fn();
    render(<ConfirmarEnvioModal isOpen onClose={vi.fn()} onConfirm={onConfirm} onGoToFicha={onGoToFicha} initialPhone="123" />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ir para a ficha' }));
    await act(async () => {});
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(phoneError('123') as string)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Seu WhatsApp para o aviso (com DDD)'), { target: { value: '(11) 98765-4321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ir para a ficha' }));
    await act(async () => {});
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Não deu.')).toBeInTheDocument();
    expect(onGoToFicha).not.toHaveBeenCalled();
  });

  it('texto sem travessão, sem emoji, sem diagnóstico', () => {
    render(<ConfirmarEnvioModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} onGoToFicha={vi.fn()} />);
    const t = document.body.textContent || '';
    expect(t).not.toContain('—');
    expect(t.toLowerCase()).not.toContain('diagnóstico');
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
