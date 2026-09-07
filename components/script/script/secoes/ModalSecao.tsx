import React, { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Folha que abre por cima do leitor (lista de perguntas de um tipo, no Passo 2).
 * Acessivel: `role="dialog"` com `aria-modal`, foco preso dentro, Esc fecha, o foco volta para o botao que
 * abriu e os alvos tem 44 px. Vai para o `document.body` por portal: assim o texto dela nao entra no indice
 * dos grifos (que le so o que esta dentro da tela do leitor).
 */

const FOCAVEIS = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export const ModalSecao: React.FC<{
  titulo: string;
  aberto: boolean;
  onFechar: () => void;
  testId?: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}> = ({ titulo, aberto, onFechar, testId, acoes, children }) => {
  const caixaRef = useRef<HTMLDivElement>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);
  const tituloId = useId();

  const aoTeclar = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onFechar(); return; }
    if (e.key !== 'Tab') return;
    const caixa = caixaRef.current;
    if (!caixa) return;
    const alvos = Array.from(caixa.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!alvos.length) { e.preventDefault(); return; }
    const primeiro = alvos[0];
    const ultimo = alvos[alvos.length - 1];
    const foco = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (foco === primeiro || !caixa.contains(foco))) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && foco === ultimo) { e.preventDefault(); primeiro.focus(); }
  }, [onFechar]);

  useEffect(() => {
    if (!aberto) return undefined;
    anteriorRef.current = (document.activeElement as HTMLElement) || null;
    const primeiro = caixaRef.current?.querySelector<HTMLElement>(FOCAVEIS);
    if (primeiro && typeof primeiro.focus === 'function') primeiro.focus();
    document.addEventListener('keydown', aoTeclar, true);
    return () => {
      document.removeEventListener('keydown', aoTeclar, true);
      const volta = anteriorRef.current;
      if (volta && typeof volta.focus === 'function' && document.contains(volta)) volta.focus();
    };
  }, [aberto, aoTeclar]);

  if (!aberto || typeof document === 'undefined') return null;

  return createPortal(
    <div className="script-folha-fundo script-no-print" data-testid={testId ? `${testId}-fundo` : undefined}>
      <button type="button" className="script-folha-cortina" aria-label="Fechar" tabIndex={-1} onClick={onFechar} />
      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="script-folha"
        data-testid={testId}
      >
        <header className="script-folha-topo">
          <h3 id={tituloId} className="script-folha-titulo">{titulo}</h3>
          <button type="button" className="script-folha-fechar" onClick={onFechar} aria-label={`Fechar ${titulo}`}>Fechar</button>
        </header>
        <div className="script-folha-corpo">{children}</div>
        {acoes && <footer className="script-folha-rodape">{acoes}</footer>}
      </div>
    </div>,
    document.body
  );
};

export default ModalSecao;
