/**
 * 5.5 "Retorno financeiro": a conta na frente dele em dois mostradores de barra no mesmo quadro,
 * o que ele alcança sozinho ao lado do que alcança com você, mais o prazo.
 *
 * A barra só MEDE o texto do mentor (`moedaNumero`); o que aparece escrito é sempre o que ele
 * digitou ("3,6 milhões", "R$ 14 mil/mês"). Nada é calculado nem arredondado por conta própria.
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { norm, type WidgetTemplate } from './estrutura';
import { moedaNumero } from './numero';
import { Chip, Entrada, Observacao, Rotulo, VazioLido, type DisplayProps, type WidgetProps } from './ui';

interface CampoDef { key: string; label: string; tipo?: string }

/** Prazos de um toque quando o template não traz os dele. */
const PRAZOS_PADRAO = ['30 dias', '90 dias', '6 meses', '12 meses'];

/** Chaves e rótulos: 1a moeda = sozinho, 2a moeda = com você, tipo prazo = prazo. */
function chaves(template: WidgetTemplate): { sozinho: CampoDef; comigo: CampoDef; prazo: CampoDef } {
  const campos: CampoDef[] = Array.isArray(template?.campos) ? template.campos : [];
  const moedas = campos.filter((c) => c && c.tipo === 'moeda');
  return {
    sozinho: moedas[0] || { key: 'sozinho', label: 'Sozinho' },
    comigo: moedas[1] || { key: 'comigo', label: 'Com você' },
    prazo: campos.find((c) => c && c.tipo === 'prazo') || { key: 'prazo', label: 'Prazo' },
  };
}

const txt = (v: any): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
const comMoeda = (v: string): string => (/R\$/i.test(v) ? v : `R$ ${v}`);

/** Altura da barra em % do quadro: 0 sem valor, 8 quando o texto não vira número. */
function altura(v: string, max: number): number {
  if (!v) return 0;
  const n = moedaNumero(v);
  if (n == null || !Number.isFinite(n) || n <= 0 || max <= 0) return 8;
  return Math.max(8, Math.min(100, Math.round((n / max) * 100)));
}

/** Uma barra do quadro: cresce de baixo para cima, com o rótulo e o valor embaixo. */
const Barra: React.FC<{ testId: string; label: string; valor: string; pct: number; ouro?: boolean }> = ({ testId, label, valor, pct, ouro = false }) => {
  const reduzido = useReducedMotion();
  return (
    <div data-testid={testId} data-altura={pct} className="min-w-0 flex flex-col">
      <div className="h-[160px] w-full flex items-end" aria-hidden="true">
        <motion.div
          initial={false}
          animate={{ height: `${pct}%` }}
          transition={{ duration: reduzido ? 0 : 0.5, ease: 'easeOut' }}
          style={{ height: `${pct}%` }}
          className={`w-full rounded-t-md ${ouro ? 'bg-prosperus-gold-dark' : 'bg-white/20'}`}
        />
      </div>
      <Rotulo className="mt-2">{label}</Rotulo>
      <p className="font-serif text-xl text-prosperus-gold-light leading-snug break-words min-w-0">
        {valor ? comMoeda(valor) : <VazioLido />}
      </p>
    </div>
  );
};

/** O quadro com as duas barras lado a lado (mesma peça no modo leitura e no modo edição). */
const Quadro: React.FC<{ template: WidgetTemplate; value: Record<string, any> }> = ({ template, value }) => {
  const k = chaves(template);
  const a = txt(value?.[k.sozinho.key]);
  const b = txt(value?.[k.comigo.key]);
  const max = Math.max(moedaNumero(a) ?? 0, moedaNumero(b) ?? 0);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 grid grid-cols-2 gap-4 sm:gap-8">
      <Barra testId="retorno-sozinho" label={k.sozinho.label} valor={a} pct={altura(a, max)} />
      <Barra testId="retorno-comigo" label={k.comigo.label} valor={b} pct={altura(b, max)} ouro />
    </div>
  );
};

const Prazo: React.FC<{ valor: string }> = ({ valor }) => (
  <span
    data-testid="retorno-prazo"
    className="inline-flex items-center min-h-[28px] rounded-full border border-prosperus-gold-dark/40 bg-prosperus-gold-dark/10 px-3 py-1 text-xs font-sans text-prosperus-gold-light"
  >
    em {valor}
  </span>
);

export const RetornoDisplay: React.FC<DisplayProps> = ({ template, value }) => {
  const k = chaves(template);
  const prazo = txt(value?.[k.prazo.key]);
  const obs = txt(value?.obs);
  return (
    <div className="space-y-2">
      <Quadro template={template} value={value || {}} />
      {prazo && <Prazo valor={prazo} />}
      {obs && <p className="text-sm text-white/70 font-sans leading-relaxed whitespace-pre-line">{obs}</p>}
    </div>
  );
};

export const RetornoWidget: React.FC<WidgetProps> = ({ template, value, onChange }) => {
  const k = chaves(template);
  const prazos: string[] = Array.isArray(template?.prazos) && template.prazos.length ? template.prazos : PRAZOS_PADRAO;
  const prazo = txt(value?.[k.prazo.key]);
  const set = (key: string, v: string) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-3">
      <Quadro template={template} value={value || {}} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <Rotulo>{k.sozinho.label}</Rotulo>
          <Entrada
            value={value?.[k.sozinho.key] || ''}
            onChange={(e) => set(k.sozinho.key, e.target.value)}
            aria-label={k.sozinho.label}
            prefixo="R$"
            inputMode="decimal"
            placeholder="0"
          />
        </label>
        <label className="block space-y-1">
          <Rotulo>{k.comigo.label}</Rotulo>
          <Entrada
            value={value?.[k.comigo.key] || ''}
            onChange={(e) => set(k.comigo.key, e.target.value)}
            aria-label={k.comigo.label}
            prefixo="R$"
            inputMode="decimal"
            placeholder="0"
          />
        </label>
      </div>
      <div className="space-y-2">
        <Rotulo>{k.prazo.label}</Rotulo>
        <div className="flex flex-wrap gap-2">
          {prazos.map((p) => (
            <Chip key={p} selected={!!prazo && norm(prazo) === norm(p)} onClick={() => set(k.prazo.key, p)}>{p}</Chip>
          ))}
        </div>
        <Entrada
          value={value?.[k.prazo.key] || ''}
          onChange={(e) => set(k.prazo.key, e.target.value)}
          aria-label={k.prazo.label}
          placeholder="Ex.: 12 meses"
        />
      </div>
      <Observacao value={value?.obs || ''} onChange={(v) => set('obs', v)} />
    </div>
  );
};
