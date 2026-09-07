import React from 'react';

/**
 * A linha do prazo dos materiais, sozinha no topo da tela Materiais.
 *
 * O acordeão "Como funciona" que morava aqui saiu na onda I (decisão D6): a explicação do processo virou
 * a tela inicial do módulo (ComoFuncionaScreen), que abre na primeira entrada e depois vive no menu.
 * O que ficou foi o prazo, porque ele é do envio dos materiais e de mais nada.
 *
 * Palavras de tempo relativo: no texto do admin elas envelhecem sozinhas ("amanhã" salvo na quinta vira
 * mentira no sábado). Sem `\b`, que não funciona depois de letra acentuada; a borda vai na mão.
 */
const RELATIVOS = /(^|[^\p{L}])(depois\s+de\s+amanh[ãa]|anteontem|amanh[ãa]|hoje|ontem)(?![\p{L}])/giu;

/** Data no texto: DD/MM, DD/MM/AA ou DD/MM/AAAA. */
const DATA_BR = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/;

/**
 * O prazo é texto livre do admin, então ele estraga com o tempo. Duas regras:
 *   1. tem data e a data já passou -> a linha inteira some (nada de cobrar prazo vencido);
 *   2. palavra de tempo relativo ("amanhã", "hoje") nunca vai para a tela, porque foi escrita
 *      em outro dia e não é recalculada.
 * Sem data legível a linha continua aparecendo, só sem os relativos. Devolve null quando não há o que mostrar.
 */
export function prazoParaExibir(prazo: string | null | undefined, hoje: Date = new Date()): string | null {
  const bruto = (prazo || '').trim();
  if (!bruto) return null;

  const m = DATA_BR.exec(bruto);
  if (m) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let ano = m[3] ? Number(m[3]) : hoje.getFullYear();
    if (m[3] && m[3].length === 2) ano += 2000;
    const alvo = new Date(ano, mes - 1, dia);
    const valida = alvo.getFullYear() === ano && alvo.getMonth() === mes - 1 && alvo.getDate() === dia;
    const inicioDeHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    if (valida && alvo.getTime() < inicioDeHoje.getTime()) return null;
  }

  const limpo = bruto
    .replace(RELATIVOS, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;.:·-]+/, '')
    .replace(/\s+([,;.:])/g, '$1')
    .replace(/[\s,;:·-]+$/, '')
    .trim();

  return limpo || null;
}

interface PrazoMateriaisProps {
  /** Texto livre configurado pelo admin (cohort_config.prazo_materiais). Vazio ou vencido = nada na tela. */
  prazo?: string;
}

export const PrazoMateriais: React.FC<PrazoMateriaisProps> = ({ prazo }) => {
  const prazoVisivel = prazoParaExibir(prazo);
  if (!prazoVisivel) return null;
  return (
    <p className="text-sm font-sans text-prosperus-gold-light" data-testid="prazo-materiais">
      <span className="font-semibold">Prazo:</span> {prazoVisivel}
    </p>
  );
};

export default PrazoMateriais;
