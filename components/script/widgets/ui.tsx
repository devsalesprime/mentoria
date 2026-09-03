import React, { useRef, useState } from 'react';
import type { ScriptFieldView } from '../../../data/script-ficha-fields';
import type { Estrutura, ParseContext, WidgetTemplate } from './estrutura';
import { IconeMais, IconeMenos, IconeSeta } from '../contexto/icones';

/** Props comuns a todo widget da Ficha do Script. */
export interface WidgetProps {
  campo: ScriptFieldView;
  template: WidgetTemplate;
  value: Estrutura;
  onChange: (e: Estrutura) => void;
  ctx: ParseContext;
}

// Alvo de toque no celular: 44 px
export const TAP = 'min-h-[44px]';
export const INPUT = `w-full ${TAP} bg-prosperus-navy-mid border border-white/10 focus:border-prosperus-gold-dark/60 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 font-sans outline-none transition-colors`;
export const TEXTAREA = `${INPUT} resize-y leading-relaxed`;

export const Rotulo: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`block text-[11px] uppercase tracking-wide text-white/50 font-sans ${className}`}>{children}</span>
);

export const Dica: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] text-white/40 font-sans italic">{children}</p>
);

export const Entrada: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { prefixo?: string }> = ({ prefixo, className = '', ...rest }) => (
  prefixo ? (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-prosperus-gold-dark font-sans pointer-events-none">{prefixo}</span>
      <input {...rest} className={`${INPUT} pl-10 ${className}`} />
    </div>
  ) : (
    <input {...rest} className={`${INPUT} ${className}`} />
  )
);

export const Area: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = '', rows = 3, ...rest }) => (
  <textarea {...rest} rows={rows} className={`${TEXTAREA} ${className}`} />
);

export const Campo: React.FC<{ label: string; children: React.ReactNode; hint?: string; className?: string }> = ({ label, children, hint, className = '' }) => (
  <label className={`block space-y-1 ${className}`}>
    <Rotulo>{label}</Rotulo>
    {children}
    {hint && <Dica>{hint}</Dica>}
  </label>
);

export const Chip: React.FC<{ selected: boolean; onClick: () => void; children: React.ReactNode; role?: string }> = ({ selected, onClick, children, role }) => (
  <button
    type="button"
    role={role}
    aria-pressed={role ? undefined : selected}
    aria-checked={role === 'radio' ? selected : undefined}
    onClick={onClick}
    className={`${TAP} px-3.5 py-2 rounded-full text-sm font-sans border transition ${
      selected
        ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark font-semibold'
        : 'border-white/20 text-white/70 hover:border-prosperus-gold-dark/60 hover:text-white'
    }`}
  >
    {children}
  </button>
);

/** Carta de opcao (radio card): titulo, descricao curta e glifo opcional. */
export const CartaoOpcao: React.FC<{ selected: boolean; onClick: () => void; title: string; sub?: string; icone?: React.ReactNode; className?: string }> = ({ selected, onClick, title, sub, icone, className = '' }) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    aria-label={title}
    onClick={onClick}
    className={`${TAP} w-full text-left rounded-lg border p-3 transition ${
      selected
        ? 'bg-prosperus-gold-dark/10 border-prosperus-gold-dark/60 text-white'
        : 'bg-white/[0.03] border-white/10 text-white/70 hover:border-prosperus-gold-dark/40 hover:text-white'
    } ${className}`}
  >
    <span className="flex items-center gap-2">
      <span className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${selected ? 'border-prosperus-gold-dark' : 'border-white/30'}`}>
        {selected && <span className="w-2 h-2 rounded-full bg-prosperus-gold-dark" />}
      </span>
      {icone && <span className={`shrink-0 ${selected ? 'text-prosperus-gold-light' : 'text-white/50'}`} aria-hidden="true">{icone}</span>}
      <span className="text-sm font-sans font-semibold">{title}</span>
    </span>
    {sub && <span className="block text-[11px] text-white/50 font-sans mt-1 pl-6">{sub}</span>}
  </button>
);

export const Painel: React.FC<{ title?: string; accent?: 'gold' | 'muted' | 'none'; children: React.ReactNode; className?: string }> = ({ title, accent = 'none', children, className = '' }) => {
  const border = accent === 'gold' ? 'border-prosperus-gold-dark/40 bg-prosperus-gold-dark/5' : accent === 'muted' ? 'border-white/10 bg-white/5' : 'border-white/10 bg-white/[0.03]';
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${border} ${className}`}>
      {title && <Rotulo className={accent === 'gold' ? '!text-prosperus-gold-dark' : ''}>{title}</Rotulo>}
      {children}
    </div>
  );
};

export const Contador: React.FC<{ n: number; min?: number; max?: number; unidade: string }> = ({ n, min, max, unidade }) => {
  const abaixo = typeof min === 'number' && n < min;
  const faixa = typeof min === 'number' && typeof max === 'number' ? `${min} a ${max}` : typeof max === 'number' ? `até ${max}` : typeof min === 'number' ? `mínimo ${min}` : '';
  return (
    <span className={`text-[11px] font-sans ${abaixo ? 'text-prosperus-gold-light/80' : 'text-white/40'}`}>
      {n} {unidade}{faixa ? ` · ${faixa}` : ''}
    </span>
  );
};

export const BotaoAdd: React.FC<{ onClick: () => void; children: React.ReactNode; disabled?: boolean }> = ({ onClick, children, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`${TAP} w-full rounded-lg border-2 border-dashed border-white/15 hover:border-prosperus-gold-dark/50 text-white/60 hover:text-prosperus-gold-light text-sm font-sans font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed`}
  >
    {children}
  </button>
);

export const BotaoIcone: React.FC<{ onClick: () => void; label: string; children: React.ReactNode; disabled?: boolean; className?: string }> = ({ onClick, label, children, disabled, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`${TAP} min-w-[44px] px-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition disabled:opacity-25 disabled:cursor-not-allowed font-sans text-base inline-flex items-center justify-center ${className}`}
  >
    {children}
  </button>
);

export const Numero: React.FC<{ n: number; gold?: boolean }> = ({ n, gold = true }) => (
  <span className={`w-7 h-7 rounded-full text-xs font-bold font-sans flex items-center justify-center flex-shrink-0 ${gold ? 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark' : 'bg-white/10 text-white/60'}`}>{n}</span>
);

/** Observacao livre: so aparece quando ja tem texto (sugestao em texto corrido) ou quando o mentor abre. */
export const Observacao: React.FC<{ value: string; onChange: (v: string) => void; label?: string; rows?: number }> = ({ value, onChange, label = 'Observação', rows = 2 }) => {
  const [open, setOpen] = React.useState(!!value);
  React.useEffect(() => { if (value) setOpen(true); }, [value]);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-white/40 hover:text-white/70 font-sans underline-offset-2 hover:underline">
        + {label.toLowerCase()}
      </button>
    );
  }
  return (
    <Campo label={label}>
      <Area value={value} onChange={(e) => onChange(e.target.value)} rows={rows} aria-label={label} placeholder="Texto livre" />
    </Campo>
  );
};

/** Lacuna dentro de uma frase em serifa: entrada sublinhada em dourado que cresce com o texto. */
export const Lacuna: React.FC<{ value: string; onChange: (v: string) => void; label: string; placeholder?: string; maxLength?: number }> = ({ value, onChange, label, placeholder, maxLength }) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    aria-label={label}
    placeholder={placeholder}
    maxLength={maxLength}
    size={Math.max(6, Math.min(40, (value || placeholder || '').length + 2))}
    className={`inline-block ${TAP} max-w-full bg-transparent border-0 border-b-2 border-prosperus-gold-dark/70 focus:border-prosperus-gold-light outline-none font-serif text-lg sm:text-xl text-prosperus-gold-light placeholder:text-white/30 placeholder:italic px-1 mx-0.5 align-baseline`}
    data-testid="lacuna"
  />
);

/** Régua: range nativo em dourado com marcas tocáveis embaixo. */
export const Slider: React.FC<{
  value: number | null;
  min: number;
  max: number;
  step?: number;
  marcas?: number[];
  onChange: (n: number) => void;
  label: string;
  sufixo?: string;
}> = ({ value, min, max, step = 1, marcas, onChange, label, sufixo = '' }) => (
  <div className="space-y-0.5" data-testid="regua">
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value == null || Number.isNaN(value) ? min : Math.max(min, Math.min(max, value))}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={label}
      aria-valuetext={value != null ? `${value}${sufixo}` : undefined}
      className="w-full h-11 accent-[#CA9A43] cursor-pointer"
    />
    {marcas && marcas.length > 0 && (
      <div className="flex justify-between" aria-hidden="true">
        {marcas.map((m) => (
          <button
            key={m}
            type="button"
            tabIndex={-1}
            onClick={() => onChange(m)}
            className={`min-h-[44px] min-w-[28px] text-[11px] font-sans transition ${value === m ? 'text-prosperus-gold-light font-semibold' : 'text-white/40 hover:text-white/80'}`}
          >
            {m}
          </button>
        ))}
      </div>
    )}
  </div>
);

/** Passo a passo numérico: menos · número · mais. */
export const Stepper: React.FC<{ value: string; onChange: (v: string) => void; label: string; min?: number; max?: number; className?: string; placeholder?: string }> = ({ value, onChange, label, min = 0, max = 999, className = '', placeholder = 'N' }) => {
  const n = parseInt(value, 10);
  const dec = () => onChange(String(Math.max(min, (Number.isNaN(n) ? min + 1 : n) - 1)));
  const inc = () => onChange(String(Math.min(max, (Number.isNaN(n) ? min - 1 : n) + 1)));
  return (
    <div className={`inline-flex items-stretch rounded-lg border border-white/10 bg-prosperus-navy-mid overflow-hidden ${className}`} data-testid="stepper">
      <button type="button" onClick={dec} aria-label={`${label}: menos`} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"><IconeMenos /></button>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        aria-label={label}
        placeholder={placeholder}
        className="w-16 min-h-[44px] text-center bg-transparent border-x border-white/10 text-white font-serif text-xl outline-none placeholder-white/30"
      />
      <button type="button" onClick={inc} aria-label={`${label}: mais`} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"><IconeMais /></button>
    </div>
  );
};

/** Carrossel por rolagem com encaixe (scroll-snap), sem dependência: desliza no celular, setas no desktop. */
export const Carrossel: React.FC<{ itens: React.ReactNode[]; label: string; nomeItem?: string; largura?: string; testId?: string }> = ({ itens, label, nomeItem = 'item', largura = 'w-[86%] sm:w-[62%] lg:w-[48%]', testId }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const irPara = (k: number) => {
    const el = ref.current;
    const alvo = Math.max(0, Math.min(itens.length - 1, k));
    setI(alvo);
    if (!el) return;
    const filho = el.children[alvo] as HTMLElement | undefined;
    if (filho && typeof el.scrollTo === 'function') el.scrollTo({ left: filho.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el || !el.children.length) return;
    const w = (el.children[0] as HTMLElement).offsetWidth || 1;
    const k = Math.round(el.scrollLeft / (w + 12));
    if (k !== i && k >= 0 && k < itens.length) setI(k);
  };
  return (
    <div className="space-y-1" data-testid={testId}>
      <div
        ref={ref}
        role="group"
        aria-label={label}
        onScroll={onScroll}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {itens.map((it, k) => (
          <div key={k} className={`snap-start shrink-0 ${itens.length === 1 ? 'w-full' : largura}`} data-testid={testId ? `${testId}-item-${k}` : undefined}>
            {it}
          </div>
        ))}
      </div>
      {itens.length > 1 && (
        <div className="flex items-center justify-between">
          <BotaoIcone onClick={() => irPara(i - 1)} label={`${nomeItem} anterior`} disabled={i <= 0}><IconeSeta direcao="esq" /></BotaoIcone>
          <span className="text-[11px] text-white/50 font-sans" aria-live="polite">{i + 1} de {itens.length}</span>
          <BotaoIcone onClick={() => irPara(i + 1)} label={`Próximo ${nomeItem}`} disabled={i >= itens.length - 1}><IconeSeta direcao="dir" /></BotaoIcone>
        </div>
      )}
    </div>
  );
};

export function lista<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
