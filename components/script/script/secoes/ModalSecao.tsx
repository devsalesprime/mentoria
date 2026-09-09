import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Folha que abre por cima do leitor (lista de perguntas de um tipo, no Passo 2).
 * Acessivel: `role="dialog"` com `aria-modal`, foco preso dentro, Esc fecha, o foco volta para o botao que
 * abriu e os alvos tem 44 px.
 *
 * ONDE ELA MORA (pedido do dono em 09/09, item 4a). Antes ela ia por portal para o `document.body`, de
 * proposito, para o texto dela ficar fora do indice dos grifos. O efeito colateral era que grifar dentro da
 * folha nao funcionava: `capturarSelecao` (grifos/anchor.ts) so aceita selecao DENTRO da raiz do leitor e so
 * sabe a que passo o grifo pertence pelo `[data-tela]` mais proximo, e a folha nao tinha nenhum dos dois.
 * Agora o portal procura o `[data-tela]` da tela onde ela foi declarada e desce ali dentro: a selecao vira
 * grifo do passo certo, no documento certo, e os grifos que ja existem sao pintados dentro dela como no
 * resto da pagina. Sem `[data-tela]` por perto (teste de unidade, folha impressa), cai no `document.body`
 * como antes.
 */

const FOCAVEIS = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Avisa a tela do script que o texto da folha entrou ou saiu do ar, para ela repintar os grifos (o índice
 * dos grifos é montado a partir do texto que está na tela; sem o aviso, um grifo que mora numa fala da folha
 * só apareceria marcado na próxima vez que a lista de grifos mudasse).
 */
export const EVENTO_FOLHA = 'script-folha-mudou';

export const ModalSecao: React.FC<{
  titulo: string;
  aberto: boolean;
  onFechar: () => void;
  testId?: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}> = ({ titulo, aberto, onFechar, testId, acoes, children }) => {
  const caixaRef = useRef<HTMLDivElement>(null);
  const ancoraRef = useRef<HTMLSpanElement>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const tituloId = useId();

  // A tela do leitor onde esta folha nasceu: é ela que dá o `data-tela` e o `data-documento` do grifo.
  useLayoutEffect(() => {
    if (!aberto || typeof document === 'undefined') { setAlvo(null); return; }
    const tela = ancoraRef.current?.closest<HTMLElement>('[data-tela]') || null;
    setAlvo(tela || document.body);
  }, [aberto]);

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
    if (!aberto || !alvo) return undefined;
    anteriorRef.current = (document.activeElement as HTMLElement) || null;
    const primeiro = caixaRef.current?.querySelector<HTMLElement>(FOCAVEIS);
    if (primeiro && typeof primeiro.focus === 'function') primeiro.focus();
    document.addEventListener('keydown', aoTeclar, true);
    return () => {
      document.removeEventListener('keydown', aoTeclar, true);
      const volta = anteriorRef.current;
      if (volta && typeof volta.focus === 'function' && document.contains(volta)) volta.focus();
    };
  }, [aberto, alvo, aoTeclar]);

  // O texto da folha entra e sai do índice dos grifos junto com ela: quem pinta precisa saber das duas horas.
  useEffect(() => {
    if (!aberto || !alvo || typeof document === 'undefined') return undefined;
    const avisar = () => { document.dispatchEvent(new Event(EVENTO_FOLHA)); };
    avisar();
    return () => avisar();
  }, [aberto, alvo]);

  return (
    <>
      {/* âncora sem tamanho e sem texto: só serve para achar a tela do leitor onde a folha foi declarada */}
      <span ref={ancoraRef} className="script-folha-ancora" aria-hidden="true" />
      {aberto && alvo && createPortal(
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
        alvo
      )}
    </>
  );
};

export default ModalSecao;
