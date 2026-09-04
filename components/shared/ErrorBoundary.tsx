import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { CartaoErro } from './CartaoErro';
import { CHAVE_RECARGA_ERRO, deveRecarregarUmaVez, recarregarPagina, reportClientError } from './clientError';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Testes: substitui window.location.reload. */
  reload?: () => void;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Boundary da raiz. Ao capturar um erro de render:
 * 1. relata ao servidor (POST /api/client-error -> data/client-errors.log);
 * 2. recarrega a pagina UMA vez por sessao (chunk antigo ou estado podre somem no F5);
 * 3. se ja recarregou nesta sessao, mostra o cartao com "Recarregar" e "Sair e entrar de novo".
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: (error && error.message) || '' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    reportClientError({
      origem: 'ErrorBoundary',
      message: (error && error.message) || String(error),
      stack: error && error.stack,
      componentStack: info.componentStack,
    });
    if (deveRecarregarUmaVez(CHAVE_RECARGA_ERRO)) this.recarregar();
  }

  recarregar = () => {
    (this.props.reload || recarregarPagina)();
  };

  handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <CartaoErro
          telaCheia
          texto="Já registramos o problema. Recarregar costuma resolver; se não resolver, saia e entre de novo."
          detalhe={this.state.message}
          onRecarregar={this.recarregar}
        />
      );
    }

    return this.props.children;
  }
}
