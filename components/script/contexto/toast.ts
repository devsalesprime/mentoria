/**
 * Avisos curtos na tela da ficha ("A IA vai revisar este campo...", "Nova sugestão chegou...").
 * Quem emite não precisa conhecer quem mostra: evento no window, a pilha (ToastStack) escuta.
 */
import { useCallback, useEffect, useState } from 'react';

export interface Toast {
  id: number;
  mensagem: string;
}

const EVENTO = 'ficha-script:toast';
let seq = 0;

export function emitirToast(mensagem: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<Toast>(EVENTO, { detail: { id: ++seq, mensagem } }));
}

export function useToasts(duracaoMs = 8000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const h = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      if (!t) return;
      setToasts((prev) => [...prev, t]);
      timers.push(setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), duracaoMs));
    };
    window.addEventListener(EVENTO, h);
    return () => { window.removeEventListener(EVENTO, h); timers.forEach(clearTimeout); };
  }, [duracaoMs]);
  const fechar = useCallback((id: number) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);
  return { toasts, fechar };
}
