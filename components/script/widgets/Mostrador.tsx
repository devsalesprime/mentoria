/**
 * 1.2 "Meta e cadência": o painel do carro. Três mostradores redondos (quantos clientes, até quando,
 * reuniões por semana) e, embaixo, a cadência que sai deles.
 *
 * A cadência é conta de padaria sobre os números do próprio mentor (semanas × 4); nada de projeção
 * inventada, e a linha só aparece quando ele mesmo escreveu quantas reuniões faz por semana.
 */
import React from 'react';
import { inteiro } from './numero';
import { Entrada, Observacao, Rotulo, Stepper, VazioLido, type DisplayProps, type WidgetProps } from './ui';

const txt = (v: any): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();

/** Um mostrador: o número dentro do aro dourado e o nome embaixo. */
const Dial: React.FC<{ testId: string; label: string; valor: string; miudo?: boolean }> = ({ testId, label, valor, miudo = false }) => (
  <div data-testid={testId} className="min-w-0 flex flex-col items-center gap-1.5">
    <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-full border-2 border-prosperus-gold-dark/60 bg-white/[0.03] flex items-center justify-center px-2 text-center">
      <span className={`font-serif ${miudo ? 'text-base' : 'text-3xl'} text-prosperus-gold-light leading-tight break-words min-w-0`}>
        {valor || <VazioLido />}
      </span>
    </div>
    <Rotulo className="text-center">{label}</Rotulo>
  </div>
);

/** A cadência lida dos números do mentor: só existe quando ele diz quantas reuniões faz por semana. */
const Cadencia: React.FC<{ reunioes: string }> = ({ reunioes }) => {
  const n = inteiro(reunioes);
  if (n == null || n < 1) return null;
  return (
    <p data-testid="mostrador-cadencia" className="text-sm font-sans text-white/70">
      Cadência: {n} {n === 1 ? 'reunião' : 'reuniões'} por semana, cerca de {n * 4} por mês
    </p>
  );
};

export const MostradorDisplay: React.FC<DisplayProps> = ({ value }) => {
  const clientes = txt(value?.clientes);
  const ate = txt(value?.ate);
  const reunioes = txt(value?.reunioes);
  const obs = txt(value?.obs);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Dial testId="mostrador-clientes" label="Clientes" valor={clientes} />
        <Dial testId="mostrador-ate" label="Até quando" valor={ate} miudo />
        <Dial testId="mostrador-reunioes" label="Reuniões por semana" valor={reunioes} />
      </div>
      <Cadencia reunioes={reunioes} />
      {obs && <p className="text-sm text-white/70 font-sans leading-relaxed whitespace-pre-line">{obs}</p>}
    </div>
  );
};

export const MostradorWidget: React.FC<WidgetProps> = ({ value, onChange }) => {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="min-w-0 space-y-2">
          <Dial testId="mostrador-clientes" label="Clientes" valor={txt(value?.clientes)} />
          <div className="flex justify-center">
            <Stepper value={value?.clientes || ''} onChange={(v) => set('clientes', v)} label="Quantos clientes" min={1} max={999} />
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <Dial testId="mostrador-ate" label="Até quando" valor={txt(value?.ate)} miudo />
          <Entrada value={value?.ate || ''} onChange={(e) => set('ate', e.target.value)} aria-label="Até quando" placeholder="mês ou data" />
        </div>
        <div className="min-w-0 space-y-2">
          <Dial testId="mostrador-reunioes" label="Reuniões por semana" valor={txt(value?.reunioes)} />
          <div className="flex justify-center">
            <Stepper value={value?.reunioes || ''} onChange={(v) => set('reunioes', v)} label="Reuniões por semana" min={1} max={99} />
          </div>
        </div>
      </div>
      <Cadencia reunioes={txt(value?.reunioes)} />
      <Observacao value={value?.obs || ''} onChange={(v) => set('obs', v)} />
    </div>
  );
};
