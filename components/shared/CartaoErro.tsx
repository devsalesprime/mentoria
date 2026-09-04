import React from 'react';
import { sairEEntrarDeNovo } from './clientError';

interface CartaoErroProps {
  titulo?: string;
  texto: string;
  /** Mensagem tecnica curta (opcional), em tom apagado. */
  detalhe?: string;
  onRecarregar: () => void;
  onTentarNovamente?: () => void;
  /** true = ocupa a tela toda (ErrorBoundary da raiz); false = cartao dentro do conteudo (modulo). */
  telaCheia?: boolean;
}

/**
 * Cartao navy de erro. Sem dependencia de framer-motion nem do design system:
 * se a queda veio de uma dessas bibliotecas, o fallback ainda renderiza.
 */
export const CartaoErro: React.FC<CartaoErroProps> = ({
  titulo = 'Algo travou ao abrir a página',
  texto,
  detalhe,
  onRecarregar,
  onTentarNovamente,
  telaCheia = false,
}) => {
  const cartao = (
    <div
      role="alert"
      className="w-full max-w-md mx-auto bg-prosperus-navy-mid border border-white/10 rounded-lg p-6 sm:p-8 shadow-2xl text-center text-white font-sans"
    >
      <h2 className="font-serif text-2xl text-white mb-3">{titulo}</h2>
      <p className="text-white/60 text-sm mb-4">{texto}</p>
      {detalhe ? (
        <p className="text-white/30 text-[11px] mb-4 break-words font-mono">{detalhe.slice(0, 200)}</p>
      ) : null}
      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-2">
        {onTentarNovamente ? (
          <button
            type="button"
            onClick={onTentarNovamente}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold rounded-lg text-sm transition"
          >
            Tentar novamente
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRecarregar}
          className="px-5 py-2.5 bg-prosperus-gold-dark hover:bg-prosperus-gold-hover text-black font-semibold rounded-lg text-sm transition"
        >
          Recarregar
        </button>
        <button
          type="button"
          onClick={sairEEntrarDeNovo}
          className="px-5 py-2.5 border border-white/20 bg-transparent text-white/80 hover:text-white hover:bg-white/5 font-semibold rounded-lg text-sm transition"
        >
          Sair e entrar de novo
        </button>
      </div>
    </div>
  );

  if (!telaCheia) return cartao;
  return (
    <div className="min-h-screen bg-prosperus-navy flex items-center justify-center p-6">
      {cartao}
    </div>
  );
};
