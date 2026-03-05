import React from 'react';
import { Logo } from './ui/Logo';
import { Button } from './ui/Button';

interface HeaderProps {
  onOpenLogin: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenLogin }) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-prosperus-navy-panel backdrop-blur-md border-b border-white/5">
      <div className="container mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo className="w-28 h-28 sm:w-32 sm:h-32 md:w-40 md:h-40" />
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
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