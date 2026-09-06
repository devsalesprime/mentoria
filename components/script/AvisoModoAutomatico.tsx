/**
 * "Você está no caminho completo. Prefere o essencial?"
 *
 * Quando o material que a pessoa mandou bastou, o app fecha a ficha e manda escrever o script sozinho,
 * antes de ela ver a tela "Como você quer construir o seu script?". Nesse caso a escolha foi do app, e ela
 * é sempre o caminho completo (o mais fundo, porque havia material). Este aviso conta isso uma vez e
 * oferece o essencial em um toque; some depois de trocar ou de dispensar, e não volta.
 *
 * Fica na Ficha e em Seu script, com a mesma memória: dispensar em uma tela some nas duas.
 */
import React, { useState } from 'react';
import type { ScriptModo } from '../../data/script-ficha-fields';
import { Button } from '../ui/Button';

export const COPY_MODO_AUTOMATICO = 'Você está no caminho completo. Prefere o essencial?';
export const COPY_MODO_EXPLICA = 'O que você mandou bastou, então seguimos pelo caminho mais completo. O essencial são as perguntas essenciais que fecham o cartão de bolso da reunião.';
export const COPY_MUDAR_ESSENCIAL = 'Mudar para o essencial';
export const COPY_SEGUIR_COMPLETO = 'Continuar no completo';

/** Uma marca por clube: quem já leu o aviso não vê de novo. */
export function chaveAvisoModo(clubeSlug: string): string {
  return `script-modo-aviso:${clubeSlug || 'clube'}`;
}

function jaLeu(clubeSlug: string): boolean {
  try {
    return window.localStorage.getItem(chaveAvisoModo(clubeSlug)) === '1';
  } catch {
    return false;
  }
}

function marcarLido(clubeSlug: string) {
  try {
    window.localStorage.setItem(chaveAvisoModo(clubeSlug), '1');
  } catch {
    /* sem storage: o aviso volta na próxima visita, e nada quebra */
  }
}

interface AvisoModoAutomaticoProps {
  clubeSlug: string;
  modo: ScriptModo | null | undefined;
  /** 'automatico' = quem escolheu o caminho foi o app. */
  modoOrigem: 'automatico' | null | undefined;
  onEssencial: () => Promise<{ ok: boolean; message?: string }> | void;
}

export const AvisoModoAutomatico: React.FC<AvisoModoAutomaticoProps> = ({ clubeSlug, modo, modoOrigem, onEssencial }) => {
  const [fechado, setFechado] = useState(() => jaLeu(clubeSlug));
  const [trocando, setTrocando] = useState(false);
  if (fechado || modoOrigem !== 'automatico' || modo !== 'completo') return null;

  const dispensar = () => { marcarLido(clubeSlug); setFechado(true); };
  const trocar = async () => {
    setTrocando(true);
    const r = await onEssencial();
    setTrocando(false);
    if (!r || r.ok !== false) dispensar();
  };

  return (
    <div
      className="rounded-lg border border-prosperus-gold-dark/40 bg-prosperus-gold-dark/[0.07] p-4 space-y-2"
      role="status"
      data-testid="aviso-modo-automatico"
    >
      <p className="font-serif text-lg text-white leading-snug">{COPY_MODO_AUTOMATICO}</p>
      <p className="text-sm text-white/70 font-sans">{COPY_MODO_EXPLICA}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="md" className="min-h-[44px] sm:min-h-0" onClick={trocar} disabled={trocando}>
          {COPY_MUDAR_ESSENCIAL}
        </Button>
        <Button variant="ghost" size="md" className="min-h-[44px] sm:min-h-0" onClick={dispensar}>
          {COPY_SEGUIR_COMPLETO}
        </Button>
      </div>
    </div>
  );
};
