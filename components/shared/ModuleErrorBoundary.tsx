import React, { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  moduleName?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
}

export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ModuleErrorBoundary:${this.props.moduleName || 'unknown'}]`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-8 min-h-[400px] shadow-2xl flex items-center justify-center">
          <div className="text-center max-w-sm">
            <span className="text-4xl block mb-4">⚠️</span>
            <h3 className="font-serif text-xl text-white mb-2">
              Erro no módulo
            </h3>
            <p className="text-white/50 text-sm mb-6 font-sans">
              {this.props.moduleName
                ? `O módulo "${this.props.moduleName}" encontrou um problema.`
                : 'Este módulo encontrou um problema.'
              }
              {' '}Use o menu lateral para navegar a outros módulos.
            </p>
            <button
              onClick={this.handleRetry}
              className="px-5 py-2.5 bg-prosperus-gold-dark hover:bg-prosperus-gold-hover text-black font-semibold rounded-lg transition text-sm"
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
