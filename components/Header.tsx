import React from 'react';
import { Logo } from './ui/Logo';
import { Button } from './ui/Button';

interface HeaderProps {
  onOpenLogin: () => void;
  onOpenAdmin?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenLogin, onOpenAdmin }) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0B1426] backdrop-blur-md border-b border-white/5">
      <div className="container mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo className="w-28 h-28 sm:w-32 sm:h-32 md:w-40 md:h-40" />
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          {onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="text-[9px] sm:text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-[#CA9A43] transition-colors"
            >
              <span className="hidden sm:inline">Área do Admin</span>
              <span className="sm:hidden">Admin</span>
            </button>
          )}
          <Button
            variant="outline"
            className="!py-1.5 !px-3 sm:!py-2 sm:!px-6 !text-[10px] sm:!text-xs"
            onClick={onOpenLogin}
          >
            <span className="hidden sm:inline">Área do Membro</span>
            <span className="sm:hidden">Membro</span>
          </Button>
        </div>
      </div>
    </header>
  );
};