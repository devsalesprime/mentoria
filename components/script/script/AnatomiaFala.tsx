import React from 'react';
import type { AnatomiaItem, Fala } from './parseScript';

/**
 * "Anatomia da fala" (Documento 1): os trechos citados no bloco `> Anatomia da fala` ficam sublinhados na propria fala,
 * cada componente com uma cor suave; embaixo, uma fileira de etiquetas `[Componente] · por que`. Tocar numa etiqueta
 * destaca o trecho dela. Quando nenhum trecho e encontrado na fala, cai na lista simples.
 */

/** Vocabulario fixo do runner: a mesma cor para o mesmo componente em todas as falas. */
const VOCABULARIO = [
  'conexao', 'permissao', 'pergunta aberta', 'pergunta fechada', 'espelhamento', 'silencio', 'recapitulacao', 'prova',
  'diferencial', 'ancoragem', 'desarme de preco', 'validacao', 'antecipacao de objecao', 'investimento total',
  'compromisso', 'recomendacao', 'proposito',
];
const CORES = 6;

function chave(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Indice de cor (0..5) do componente: pelo vocabulario; fora dele, pela soma dos caracteres. */
export function corDoComponente(componente: string): number {
  const k = chave(componente);
  const i = VOCABULARIO.indexOf(k);
  if (i >= 0) return i % CORES;
  let h = 0;
  for (const ch of k) h = (h + ch.charCodeAt(0)) % 9973;
  return h % CORES;
}

export interface SegmentoAnatomia { texto: string; item: number | null; }

/** Divide o texto da fala nos trechos citados (sem sobreposicao; o primeiro encontro de cada trecho). */
export function segmentarAnatomia(texto: string, itens: AnatomiaItem[]): { segmentos: SegmentoAnatomia[]; encontrados: number } {
  const marcas: { ini: number; fim: number; item: number }[] = [];
  const baixo = texto.toLowerCase();
  itens.forEach((it, idx) => {
    const t = it.trecho.trim();
    if (!t) return;
    let ini = texto.indexOf(t);
    if (ini < 0) ini = baixo.indexOf(t.toLowerCase());
    if (ini < 0) return;
    const fim = ini + t.length;
    if (marcas.some((m) => ini < m.fim && fim > m.ini)) return;
    marcas.push({ ini, fim, item: idx });
  });
  marcas.sort((a, b) => a.ini - b.ini);
  const segmentos: SegmentoAnatomia[] = [];
  let pos = 0;
  for (const m of marcas) {
    if (m.ini > pos) segmentos.push({ texto: texto.slice(pos, m.ini), item: null });
    segmentos.push({ texto: texto.slice(m.ini, m.fim), item: m.item });
    pos = m.fim;
  }
  if (pos < texto.length) segmentos.push({ texto: texto.slice(pos), item: null });
  return { segmentos, encontrados: marcas.length };
}

/** A fala com os trechos sublinhados. `render` transforma cada pedaco de texto (etiquetas, campos). */
export function textoComAnatomia(fala: Fala, ativo: number | null, render: (s: string) => React.ReactNode): React.ReactNode {
  const { segmentos, encontrados } = segmentarAnatomia(fala.texto, fala.anatomia);
  if (!encontrados) return render(fala.texto);
  return segmentos.map((s, i) => {
    if (s.item == null) return <React.Fragment key={i}>{render(s.texto)}</React.Fragment>;
    const it = fala.anatomia[s.item];
    const cor = corDoComponente(it.componente);
    const estado = ativo == null ? '' : ativo === s.item ? ' script-anatomia-trecho-ativa' : ' script-anatomia-trecho-apagada';
    return (
      <mark key={i} className={`script-anatomia-trecho script-anatomia-cor-${cor}${estado}`} data-anatomia={s.item} title={`${it.componente}: ${it.porque}`}>
        {render(s.texto)}
      </mark>
    );
  });
}

export const AnatomiaLegenda: React.FC<{
  fala: Fala;
  ativo: number | null;
  onAtivo: (i: number | null) => void;
}> = ({ fala, ativo, onAtivo }) => {
  const { encontrados } = segmentarAnatomia(fala.texto, fala.anatomia);
  if (fala.anatomia.length === 0 && fala.anatomiaBruta.length === 0) return null;
  const simples = fala.anatomia.length === 0 || encontrados === 0;
  return (
    <div className="script-anatomia" data-testid="anatomia">
      <p className="script-nota-rotulo !mb-1">Anatomia da fala</p>
      {simples ? (
        <ul className="script-anatomia-lista">
          {fala.anatomia.map((it, i) => (
            <li key={`a${i}`}><span className="font-semibold">{it.componente}</span> «{it.trecho}»{it.porque ? ` · ${it.porque}` : ''}</li>
          ))}
          {fala.anatomiaBruta.map((l, i) => <li key={`b${i}`}>{l}</li>)}
        </ul>
      ) : (
        <div className="script-anatomia-chips" role="group" aria-label="Componentes da fala">
          {fala.anatomia.map((it, i) => {
            const cor = corDoComponente(it.componente);
            return (
              <button
                key={i}
                type="button"
                aria-pressed={ativo === i}
                onClick={() => onAtivo(ativo === i ? null : i)}
                className={`script-anatomia-chip script-anatomia-cor-${cor} ${ativo === i ? 'script-anatomia-chip-ativa' : ''}`}
              >
                <span className="script-anatomia-chip-nome">{it.componente}</span>
                {it.porque && <span className="script-anatomia-chip-porque"> · {it.porque}</span>}
              </button>
            );
          })}
          {fala.anatomiaBruta.map((l, i) => <span key={`b${i}`} className="script-anatomia-chip">{l}</span>)}
        </div>
      )}
    </div>
  );
};

export default AnatomiaLegenda;
