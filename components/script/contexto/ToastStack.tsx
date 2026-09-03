import React from 'react';
import { useToasts } from './toast';

/** Pilha de avisos no rodapé da tela. Monta uma vez por tela (FichaScreen). */
export const ToastStack: React.FC = () => {
  const { toasts, fechar } = useToasts();
  if (!toasts.length) return null;
  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] w-[calc(100%-2rem)] max-w-md space-y-2"
      role="status"
      aria-live="polite"
      data-testid="toast-stack"
    >
      {toasts.map((t) => (
        <div key={t.id} className="flex items-start gap-3 rounded-lg border border-prosperus-gold-dark/50 bg-prosperus-navy-panel shadow-2xl px-4 py-3">
          <p className="flex-1 text-sm text-white font-sans leading-relaxed">{t.mensagem}</p>
          <button
            type="button"
            onClick={() => fechar(t.id)}
            aria-label="Fechar aviso"
            className="min-h-[44px] min-w-[44px] -my-2 -mr-2 flex items-center justify-center text-white/50 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
};
