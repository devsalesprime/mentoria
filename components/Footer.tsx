import React from 'react';
import { Logo } from './ui/Logo';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-prosperus-navy-dark py-5 border-t border-white/5">
      <div className="container mx-auto px-6 flex flex-col items-center">
        <div>
          <Logo className="w-36 h-24" color="#CA9A43" variant="footer" />
        </div>
        <p className="font-sans text-xs text-prosperus-neutral-grey/40 uppercase tracking-widest">
          &copy; {new Date().getFullYear()} Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
};