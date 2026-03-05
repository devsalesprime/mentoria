import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from '../ui/Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-prosperus-navy flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <span className="text-5xl block mb-4">⚠️</span>
            <h1 className="font-serif text-2xl text-white mb-3">
              Algo deu errado
            </h1>
            <p className="text-white/50 text-sm mb-6 font-sans">
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="primary" size="lg" onClick={this.handleRetry}>
                Tentar Novamente
              </Button>
              <Button variant="outline" size="lg" onClick={() => window.location.reload()}>
                Recarregar Página
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
