import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Captura } from './anchor';
import { AnexosGrifo } from './AnexosGrifo';
import { CORES, COR_DESCRICAO, COR_ROTULO, GRIFO_NOTA_MAX, GRIFO_TEXTO_MAX, GRIFO_TEXTO_MIN, type AnexoPendente, type GrifoCor } from './types';

/**
 * Balao "Grifar" que aparece sobre a selecao: 3 cores (dourado = ajustar, verde = manter, vermelho = tirar) e nota opcional.
 * No celular vira uma folha fixa no rodape. Trabalha com a captura (o texto ja lido da selecao): se a selecao nativa
 * sumir ao tocar num botao, nada se perde.
 *
 * Onda E3: depois da cor aparece a linha "Anexar" (gravar áudio, foto, vídeo, link, nota). O grifo ainda não existe,
 * então os itens ficam numa fila local com chips; ao salvar, o balão grava o grifo e só então manda a fila
 * (`anexar`, que sobe no grifo recém-criado). Sem `anexar`, a linha some e o balão é o de antes.
 */
interface GrifoBubbleProps {
  captura: Captura;
  onSalvar: (cor: GrifoCor, nota: string) => Promise<boolean>;
  onCancelar: () => void;
  erro?: string | null;
  /** Sobe a fila de anexos no grifo que acabou de ser salvo (useGrifos.anexarNoUltimo). */
  anexar?: (pendentes: AnexoPendente[]) => Promise<{ ok: boolean; message?: string }>;
}

const LARGURA = 340;
/** Folga entre a bolha e o trecho marcado, e entre a bolha e a borda da janela. */
const FOLGA = 8;
const MARGEM = 8;
/** Altura minima util: abaixo disso a bolha rola por dentro em vez de encolher ate sumir. */
const ALTURA_MIN = 160;

/**
 * A bolha NUNCA cobre o trecho selecionado: fica embaixo dele quando cabe embaixo, em cima quando
 * nao cabe embaixo e sobra mais espaco em cima. `altura` e a altura medida da propria bolha (0 antes
 * da primeira medicao, o que cai no caso "embaixo", que e o padrao seguro). O que sobrar de altura
 * vira rolagem interna, entao a bolha tambem nao vaza para fora da janela.
 */
export function posicao(rect: Captura['rect'], altura: number, vw: number, vh: number): React.CSSProperties {
  const left = Math.max(MARGEM, Math.min(rect.left, vw - LARGURA - MARGEM));
  const espacoAbaixo = Math.max(0, vh - rect.bottom - FOLGA - MARGEM);
  const espacoAcima = Math.max(0, rect.top - FOLGA - MARGEM);
  const paraCima = altura > espacoAbaixo && espacoAcima > espacoAbaixo;
  if (paraCima) {
    const usada = Math.min(altura || espacoAcima, espacoAcima);
    return {
      top: Math.max(MARGEM, rect.top - FOLGA - usada),
      left,
      maxHeight: Math.max(ALTURA_MIN, espacoAcima),
      overflowY: 'auto',
    };
  }
  return {
    top: rect.bottom + FOLGA,
    left,
    maxHeight: Math.max(ALTURA_MIN, espacoAbaixo),
    overflowY: 'auto',
  };
}

export const GrifoBubble: React.FC<GrifoBubbleProps> = ({ captura, onSalvar, onCancelar, erro, anexar }) => {
  const [cor, setCor] = useState<GrifoCor | null>(null);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<AnexoPendente[]>([]);
  const balaoRef = useRef<HTMLDivElement | null>(null);
  const [altura, setAltura] = useState(0);

  // Zera o formulario so quando a selecao muda de fato (outro trecho ou outra tela), nao a cada leitura da mesma selecao
  useEffect(() => { setCor(null); setNota(''); setFalha(null); setPendentes([]); }, [captura.texto, captura.tela, captura.documento]);

  const folha = typeof window !== 'undefined' && window.innerWidth < 640;
  // A bolha cresce quando a cor e escolhida (aparece a nota); a altura real e medida antes de pintar,
  // senao a conta de "cabe embaixo?" usa um chute e a bolha acaba por cima do trecho marcado.
  useLayoutEffect(() => {
    if (folha) return;
    const h = balaoRef.current?.offsetHeight ?? 0;
    setAltura((prev) => (Math.abs(prev - h) > 1 ? h : prev));
  }, [folha, cor, captura.texto, captura.tela, captura.documento, erro, falha, pendentes.length]);

  const previa = captura.texto.length > 90 ? `${captura.texto.slice(0, 89)}…` : captura.texto;
  const invalido = captura.curto || captura.longo;

  const salvar = async () => {
    if (!cor) return;
    setSalvando(true);
    setFalha(null);
    const ok = await onSalvar(cor, nota.trim());
    if (ok && anexar && pendentes.length) {
      const r = await anexar(pendentes);
      if (!r.ok) {
        setSalvando(false);
        setFalha(r.message || 'O grifo foi salvo, mas não deu para anexar o material.');
        return;
      }
    }
    setSalvando(false);
    if (!ok) setFalha('Não deu para salvar o grifo. Tente de novo.');
  };

  return (
    <div
      ref={balaoRef}
      role="dialog"
      aria-label="Grifar o trecho selecionado"
      data-testid="grifo-balao"
      className={`script-no-print script-grifo-balao ${folha ? 'script-grifo-balao-folha' : ''}`}
      style={folha || typeof window === 'undefined'
        ? undefined
        : posicao(captura.rect, altura, window.innerWidth, window.innerHeight)}
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
              {anexar && (
                <AnexosGrifo
                  id="balao"
                  itens={pendentes}
                  dica="Anexe áudio, foto, vídeo, link ou nota para explicar melhor este trecho."
                  onEnviar={async (novo) => { setPendentes((prev) => [...prev, novo]); return { ok: true }; }}
                  onRemover={(_, i) => setPendentes((prev) => prev.filter((_x, j) => j !== i))}
                />
              )}
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
