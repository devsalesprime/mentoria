/**
 * Avisos curtos na tela da ficha ("A IA vai revisar este campo...", "Nova sugestão chegou...").
 * Quem emite não precisa conhecer quem mostra: evento no window, a pilha (ToastStack) escuta.
 * Sem pilha montada (ex.: aviso emitido em Materiais logo antes de navegar para a Ficha), o aviso
 * fica guardado e a próxima pilha que montar mostra.
 */
import { useCallback, useEffect, useState } from 'react';

export interface Toast {
  id: number;
  mensagem: string;
}

const EVENTO = 'ficha-script:toast';
let seq = 0;
let ouvintes = 0;
const pendentes: Toast[] = [];

export function emitirToast(mensagem: string) {
  if (typeof window === 'undefined') return;
  const t: Toast = { id: ++seq, mensagem };
  if (ouvintes === 0) { pendentes.push(t); return; }
  window.dispatchEvent(new CustomEvent<Toast>(EVENTO, { detail: t }));
}

export function useToasts(duracaoMs = 8000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const mostrar = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
      timers.push(setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), duracaoMs));
    };
    const h = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      if (t) mostrar(t);
    };
    window.addEventListener(EVENTO, h);
    ouvintes += 1;
    // Avisos emitidos antes de a pilha existir
    while (pendentes.length) mostrar(pendentes.shift() as Toast);
    return () => {
      ouvintes = Math.max(0, ouvintes - 1);
      window.removeEventListener(EVENTO, h);
      timers.forEach(clearTimeout);
    };
  }, [duracaoMs]);
  const fechar = useCallback((id: number) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);
  return { toasts, fechar };
}
