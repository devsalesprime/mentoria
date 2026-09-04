import React, { useEffect, useState } from 'react';
import type { Captura } from './anchor';
import { CORES, COR_DESCRICAO, COR_ROTULO, GRIFO_NOTA_MAX, GRIFO_TEXTO_MAX, GRIFO_TEXTO_MIN, type GrifoCor } from './types';

/**
 * Balao "Grifar" que aparece sobre a selecao: 3 cores (dourado = ajustar, verde = manter, vermelho = tirar) e nota opcional.
 * No celular vira uma folha fixa no rodape. Trabalha com a captura (o texto ja lido da selecao): se a selecao nativa
 * sumir ao tocar num botao, nada se perde.
 */
interface GrifoBubbleProps {
  captura: Captura;
  onSalvar: (cor: GrifoCor, nota: string) => Promise<boolean>;
  onCancelar: () => void;
  erro?: string | null;
}

const LARGURA = 340;

function posicao(rect: Captura['rect'], acima: boolean): React.CSSProperties {
  if (typeof window === 'undefined') return {};
  const vw = window.innerWidth;
  const left = Math.max(8, Math.min(rect.left, vw - LARGURA - 8));
  if (acima) return { top: Math.max(8, rect.top - 8), left, transform: 'translateY(-100%)' };
  return { top: rect.bottom + 8, left };
}

export const GrifoBubble: React.FC<GrifoBubbleProps> = ({ captura, onSalvar, onCancelar, erro }) => {
  const [cor, setCor] = useState<GrifoCor | null>(null);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  // Zera o formulario so quando a selecao muda de fato (outro trecho ou outra tela), nao a cada leitura da mesma selecao
  useEffect(() => { setCor(null); setNota(''); setFalha(null); }, [captura.texto, captura.tela, captura.documento]);

  const folha = typeof window !== 'undefined' && window.innerWidth < 640;
  const acima = typeof window !== 'undefined' && captura.rect.bottom + 260 > window.innerHeight;
  const previa = captura.texto.length > 90 ? `${captura.texto.slice(0, 89)}…` : captura.texto;
  const invalido = captura.curto || captura.longo;

  const salvar = async () => {
    if (!cor) return;
    setSalvando(true);
    setFalha(null);
    const ok = await onSalvar(cor, nota.trim());
    setSalvando(false);
    if (!ok) setFalha('Não deu para salvar o grifo. Tente de novo.');
  };

  return (
    <div
      role="dialog"
      aria-label="Grifar o trecho selecionado"
      data-testid="grifo-balao"
      className={`script-no-print script-grifo-balao ${folha ? 'script-grifo-balao-folha' : ''}`}
      style={folha ? undefined : posicao(captura.rect, acima)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-prosperus-gold-dark">Grifar</p>
        <button type="button" onClick={onCancelar} aria-label="Fechar o balão de grifo" className="script-grifo-fechar">fechar</button>
      </div>
      <p className="script-grifo-previa">«{previa}»</p>
      {captura.curto && <p className="text-xs text-red-700">Selecione um trecho maior (pelo menos {GRIFO_TEXTO_MIN} caracteres).</p>}
      {captura.longo && <p className="text-xs text-red-700">Selecione um trecho menor (até {GRIFO_TEXTO_MAX} caracteres).</p>}
      {!invalido && (
        <>
          <div className="flex gap-2 mt-2" role="group" aria-label="Cor do grifo">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cor === c}
                title={COR_DESCRICAO[c]}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setCor(c)}
                className={`script-grifo-cor script-grifo-cor-${c} ${cor === c ? 'script-grifo-cor-ativa' : ''}`}
              >
                <span className="script-grifo-bolinha" aria-hidden="true" />
                {COR_ROTULO[c]}
              </button>
            ))}
          </div>
          {cor && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-prosperus-navy-panel/70">{COR_DESCRICAO[cor]}.</p>
              <label className="block">
                <span className="sr-only">Nota (opcional)</span>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value.slice(0, GRIFO_NOTA_MAX))}
                  maxLength={GRIFO_NOTA_MAX}
                  rows={2}
                  placeholder={cor === 'verde' ? 'Nota (opcional): por que manter?' : cor === 'vermelho' ? 'Nota (opcional): por que tirar?' : 'Nota (opcional): o que mudar?'}
                  className="w-full bg-white border border-prosperus-navy-panel/20 rounded-lg px-3 py-2 text-sm text-prosperus-neutral-black placeholder-prosperus-navy-panel/40 outline-none focus:border-prosperus-gold-dark min-h-[56px]"
                />
              </label>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-prosperus-navy-panel/50">{nota.length}/{GRIFO_NOTA_MAX}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={onCancelar} className="script-grifo-btn script-grifo-btn-secundario">Cancelar</button>
                  <button type="button" onClick={salvar} disabled={salvando} className="script-grifo-btn script-grifo-btn-primario">
                    {salvando ? 'Salvando...' : 'Salvar grifo'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {(falha || erro) && <p className="text-xs text-red-700 mt-1">{falha || erro}</p>}
    </div>
  );
};

export default GrifoBubble;
