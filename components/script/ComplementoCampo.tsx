/**
 * "Encontramos mais nos seus materiais": achado do worker em cima de um campo que o mentor JÁ decidiu.
 * O texto dele pesa mais e não muda sozinho; aqui ele incorpora (o servidor anexa ao texto atual e o mentor
 * lapida o resultado em seguida) ou dispensa. Renderizado pela FichaScreen: sob o campo em "Ver tudo" e
 * numa lista no topo em "Passo a passo".
 */
import React, { useState } from 'react';
import type { ScriptFieldView } from '../../data/script-ficha-fields';
import { Button } from '../ui/Button';

export interface ComplementoResultado {
  ok: boolean;
  campo?: ScriptFieldView;
  message?: string;
}

interface ComplementoCampoProps {
  campo: ScriptFieldView;
  /** POST .../complemento { acao: 'incorporar' }: devolve o campo com o texto já anexado. */
  onIncorporar: (key: string) => Promise<ComplementoResultado>;
  /** POST .../complemento { acao: 'dispensar' }. */
  onDispensar: (key: string) => Promise<ComplementoResultado>;
  /** Depois de incorporar, o mentor lapida o texto anexado; salva como decisão `editado`. */
  onSalvarAjuste: (key: string, valor: string) => void;
  /** Mostra "2.1 · Mentor" no topo (lista fora do campo). */
  mostrarNome?: boolean;
}

const TAP = 'min-h-[44px]';

export const ComplementoCampo: React.FC<ComplementoCampoProps> = ({ campo, onIncorporar, onDispensar, onSalvarAjuste, mostrarNome = false }) => {
  const [ocupado, setOcupado] = useState<'incorporar' | 'dispensar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<string | null>(null);
  const comp = campo.complemento;

  if (ajuste !== null) {
    return (
      <div className="rounded-lg border border-prosperus-gold-dark/40 bg-prosperus-gold-dark/[0.06] p-4 space-y-3" data-testid={`complemento-${campo.key}`}>
        {mostrarNome && <span className="font-sans text-xs text-prosperus-gold-dark font-bold">{campo.key} · {campo.nome}</span>}
        <p className="font-serif text-base text-prosperus-gold-light">Incorporado. Ajuste o texto se quiser.</p>
        <textarea
          value={ajuste}
          onChange={(e) => setAjuste(e.target.value)}
          rows={6}
          aria-label={`Texto do campo ${campo.key}`}
          data-testid={`complemento-ajuste-${campo.key}`}
          className="w-full bg-prosperus-navy-mid border border-white/10 focus:border-prosperus-gold-dark/60 rounded-lg px-3 py-2.5 text-sm text-white font-sans outline-none leading-relaxed"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="md" className={TAP} disabled={!ajuste.trim()} onClick={() => { onSalvarAjuste(campo.key, ajuste.trim()); setAjuste(null); }}>
            Salvar ajustes
          </Button>
          <Button variant="ghost" size="md" className={TAP} onClick={() => setAjuste(null)}>Manter como está</Button>
        </div>
      </div>
    );
  }

  if (!comp) return null;

  const incorporar = async () => {
    setOcupado('incorporar');
    setErro(null);
    const r = await onIncorporar(campo.key);
    setOcupado(null);
    if (!r.ok) { setErro(r.message || 'Não deu para incorporar agora. Tente de novo.'); return; }
    setAjuste(r.campo?.valor_efetivo || r.campo?.valor || comp.sugerido);
  };

  const dispensar = async () => {
    setOcupado('dispensar');
    setErro(null);
    const r = await onDispensar(campo.key);
    setOcupado(null);
    if (!r.ok) setErro(r.message || 'Não deu para dispensar agora. Tente de novo.');
  };

  return (
    <div className="rounded-lg border border-prosperus-gold-dark/40 bg-prosperus-gold-dark/[0.06] p-4 space-y-3" data-testid={`complemento-${campo.key}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Encontramos mais nos seus materiais</span>
        {mostrarNome && <span className="font-sans text-xs text-white/70">{campo.key} · {campo.nome}</span>}
      </div>
      <p className="text-sm text-white/85 font-sans leading-relaxed whitespace-pre-line" data-testid={`complemento-texto-${campo.key}`}>{comp.sugerido}</p>
      {comp.fonte && (
        <p className="text-xs text-white/50 font-sans">Fonte: {comp.fonte}</p>
      )}
      {comp.alternativas && comp.alternativas.length > 0 && (
        <ul className="space-y-1">
          {comp.alternativas.map((a, i) => (
            <li key={i} className="text-xs text-white/60 font-sans whitespace-pre-line">Também achamos: {a.sugerido}{a.fonte ? ` (${a.fonte})` : ''}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-white/50 font-sans">O que você escreveu continua valendo. Este trecho só aprofunda. Se incorporar, ele entra no fim do seu texto e você ajusta como quiser.</p>
      {erro && <p className="text-xs text-red-400 font-sans">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="md" className={TAP} onClick={incorporar} loading={ocupado === 'incorporar'} disabled={ocupado !== null}>
          Incorporar ao meu texto
        </Button>
        <Button variant="ghost" size="md" className={TAP} onClick={dispensar} loading={ocupado === 'dispensar'} disabled={ocupado !== null}>
          Dispensar
        </Button>
      </div>
    </div>
  );
};
