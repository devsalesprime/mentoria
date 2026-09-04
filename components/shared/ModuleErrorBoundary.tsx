import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { CartaoErro } from './CartaoErro';
import { CHAVE_RECARGA_ERRO, deveRecarregarUmaVez, recarregarPagina, reportClientError } from './clientError';

interface Props {
  children: ReactNode;
  moduleName?: string;
  onRetry?: () => void;
  /** Testes: substitui window.location.reload. */
  reload?: () => void;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Boundary por modulo (conteudo do Dashboard). Mesma politica do ErrorBoundary da raiz:
 * relata ao servidor, recarrega uma vez por sessao, depois mostra o cartao com saida.
 */
export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: (error && error.message) || '' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const modulo = this.props.moduleName || 'unknown';
    console.error(`[ModuleErrorBoundary:${modulo}]`, error, info.componentStack);
    reportClientError({
      origem: `ModuleErrorBoundary:${modulo}`,
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
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      const nome = this.props.moduleName;
      return (
        <div className="min-h-[400px] flex items-center justify-center p-4">
          <CartaoErro
            texto={
              nome
                ? `O módulo "${nome}" encontrou um problema. Já registramos. Use o menu lateral para ir a outro módulo ou tente de novo.`
                : 'Este módulo encontrou um problema. Já registramos. Use o menu lateral para ir a outro módulo ou tente de novo.'
            }
            detalhe={this.state.message}
            onTentarNovamente={this.handleRetry}
            onRecarregar={this.recarregar}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
