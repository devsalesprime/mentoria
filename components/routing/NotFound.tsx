import React from 'react';
import { Link } from 'react-router-dom';

export const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen bg-prosperus-navy flex items-center justify-center text-white font-sans px-4">
      <div className="text-center max-w-md">
        <span className="text-7xl block mb-6">🔍</span>
        <h1 className="font-serif text-4xl mb-3">Página não encontrada</h1>
        <p className="text-white/50 mb-8 text-lg">
          A página que você está procurando não existe ou foi movida.
        </p>
        <Link
          to="/"
          className="inline-block px-6 py-3 bg-prosperus-gold-dark hover:bg-prosperus-gold-hover text-black font-semibold rounded-lg transition text-sm"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
};
