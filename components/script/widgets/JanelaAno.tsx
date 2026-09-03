/**
 * Janela do ano (3.5 e 3.6, "Daqui a 1 ano"): a mesma cena vista por duas janelas. Cinza para o
 * ano que continua igual (sem resolver), dourada para o ano resolvido.
 *
 * Estrutura (base `texto`): { texto }. `template.rotulo` nomeia a janela, `template.tom` força a
 * cor (senão o 3.6 nasce dourado e o resto cinza) e `template.rows` dá a altura do campo.
 */
import React from 'react';
import { Area, Regua12, Rotulo, VazioLido, type DisplayProps, type WidgetProps } from './ui';
import { textoLimpo } from './vazio';
import type { ScriptFieldView } from '../../../data/script-ficha-fields';
import type { WidgetTemplate } from './estrutura';

export type Tom = 'cinza' | 'ouro';

/** O tom vem do template; na falta dele, o 3.6 (o ano resolvido) é o dourado. */
export function tomDaJanela(template: WidgetTemplate, campo: Pick<ScriptFieldView, 'key'>): Tom {
  if (template?.tom === 'cinza' || template?.tom === 'ouro') return template.tom;
  return campo?.key === '3.6' ? 'ouro' : 'cinza';
}

/** O caixilho: moldura de 2 px, o nome da janela, a régua de 12 meses e o peitoril. */
const Caixilho: React.FC<{ tom: Tom; rotulo?: string; testId?: string; children: React.ReactNode }> = ({ tom, rotulo, testId, children }) => {
  const ouro = tom === 'ouro';
  return (
    <div
      data-testid={testId}
      data-tom={tom}
      className={`rounded-xl border-2 p-3 sm:p-4 space-y-3 ${
        ouro ? 'border-prosperus-gold-dark/60 bg-prosperus-gold-dark/[0.06]' : 'border-white/20 bg-white/[0.03]'
      }`}
    >
      <div className="space-y-2 min-w-0">
        {rotulo && <Rotulo className={ouro ? '!text-prosperus-gold-dark' : ''}>{rotulo}</Rotulo>}
        <Regua12 meses={12} label="Hoje a 12 meses" />
      </div>
      {/* peitoril: a linha que separa o parapeito do que se vê pela janela */}
      <div className={`h-[3px] rounded-full ${ouro ? 'bg-prosperus-gold-dark/40' : 'bg-white/15'}`} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
};

/** texto / antes_depois (3.5 e 3.6) em leitura: a cena do ano dentro da janela. */
export const JanelaAnoDisplay: React.FC<DisplayProps> = ({ campo, template, value }) => {
  const tom = tomDaJanela(template || {}, campo);
  const ouro = tom === 'ouro';
  const s = textoLimpo(typeof value?.texto === 'string' ? value.texto : value?.texto == null ? '' : String(value.texto));
  return (
    <Caixilho tom={tom} rotulo={template?.rotulo} testId={`janela-ano-${campo.key}`}>
      {s ? (
        <p className={`font-serif text-base sm:text-lg leading-snug whitespace-pre-line break-words ${ouro ? 'text-prosperus-gold-light/95' : 'text-white/90'}`}>{s}</p>
      ) : (
        <VazioLido />
      )}
    </Caixilho>
  );
};

/** texto / antes_depois (3.5 e 3.6) em edição: a janela com o campo aberto no lugar da cena. */
export const JanelaAnoWidget: React.FC<WidgetProps> = ({ campo, template, value, onChange }) => {
  const tom = tomDaJanela(template || {}, campo);
  return (
    <Caixilho tom={tom} rotulo={template?.rotulo}>
      <Area
        value={value?.texto || ''}
        onChange={(e) => onChange({ texto: e.target.value })}
        rows={template?.rows || 4}
        aria-label={`Editar ${campo.nome}`}
        placeholder="Escreva do seu jeito"
      />
    </Caixilho>
  );
};
