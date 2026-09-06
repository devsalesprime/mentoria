import React from 'react';
import type { Bloco, PassoDoc } from './parseScript';

/**
 * Tabela "Quem está do outro lado": o guia prático de perfis que o script traz no passo (no Passo 1 são o
 * perfil de quem vende e o perfil do cliente, SPEC-workflow-v2-decisoes-06-09 §1 decisão 4).
 *
 * A seção nasce no texto escrito pelo worker, então este módulo só reconhece o que chegou: acha o bloco
 * pelo rótulo "Quem está do outro lado" (ou pelo título dentro do markdown) e devolve a tabela em linhas
 * e colunas para virar uma `<table>` de verdade, que rola na horizontal no celular. Sem a seção, ou com
 * ela em formato que não dá para ler, devolve `null` e o passo segue como sempre foi (o bloco continua
 * sendo renderizado como markdown pelo `PassoCorpo`).
 */

export interface TabelaPerfis {
  titulo: string;
  colunas: string[];
  linhas: string[][];
}

export const TITULO_PERFIS = 'Quem está do outro lado';

function semAcento(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const ALVO = semAcento(TITULO_PERFIS);
const TITULO_RE = /^\s*(?:#{2,6}\s*|\*\*)?\s*quem esta do outro lado\b/;

function ehTituloDePerfis(linha: string): boolean {
  return TITULO_RE.test(semAcento(linha.replace(/\*\*/g, '').replace(/:\s*$/, '')));
}

function celulas(linha: string): string[] {
  return linha.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

function ehSeparador(linha: string): boolean {
  const c = celulas(linha);
  return c.length > 1 && c.every((x) => /^:?-{2,}:?$/.test(x.replace(/\s/g, '')));
}

/** Tabela de canos (`| a | b |`) dentro de um trecho de markdown. */
export function tabelaDeCanos(md: string): { colunas: string[]; linhas: string[][] } | null {
  const linhas = (md || '').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  if (linhas.length < 3) return null;
  if (!ehSeparador(linhas[1])) return null;
  const colunas = celulas(linhas[0]);
  const corpo = linhas.slice(2).map(celulas).filter((r) => r.some((c) => c));
  if (!colunas.length || !corpo.length) return null;
  const largura = colunas.length;
  return {
    colunas,
    linhas: corpo.map((r) => (r.length >= largura ? r.slice(0, largura) : [...r, ...Array(largura - r.length).fill('')])),
  };
}

/** Sem tabela: linhas `- **Perfil:** o que fazer` viram duas colunas. */
function tabelaDeItens(md: string): { colunas: string[]; linhas: string[][] } | null {
  const linhas: string[][] = [];
  for (const bruta of (md || '').split('\n')) {
    const m = /^\s*[-*•]\s*\*\*([^*]{1,80}?)\s*:?\s*\*\*\s*:?\s*(.+)$/.exec(bruta);
    if (m) linhas.push([m[1].trim(), m[2].trim()]);
  }
  return linhas.length >= 2 ? { colunas: ['Perfil', 'O que fazer'], linhas } : null;
}

/** Do título da seção até o próximo título de mesmo nível (ou o fim). */
function trechoDaSecao(md: string): string | null {
  const linhas = (md || '').split('\n');
  const i = linhas.findIndex(ehTituloDePerfis);
  if (i < 0) return null;
  const resto = linhas.slice(i + 1);
  const fim = resto.findIndex((l) => /^\s*#{2,6}\s/.test(l));
  return (fim < 0 ? resto : resto.slice(0, fim)).join('\n');
}

/**
 * A seção de perfis do passo: o bloco que a origina (para o `PassoCorpo` não repetir) e a tabela pronta.
 * `null` quando o passo não tem a seção ou quando ela não vira tabela.
 */
export function extrairPerfis(passo: PassoDoc | null | undefined): { bloco: Bloco; tabela: TabelaPerfis } | null {
  if (!passo) return null;
  for (const bloco of passo.blocos) {
    const peloRotulo = semAcento(bloco.rotulo).startsWith(ALVO);
    const trecho = peloRotulo ? bloco.md : trechoDaSecao(bloco.md);
    if (trecho == null) continue;
    const tabela = tabelaDeCanos(trecho) || tabelaDeItens(trecho);
    if (!tabela) continue;
    return { bloco, tabela: { titulo: TITULO_PERFIS, ...tabela } };
  }
  return null;
}

/** A tabela de verdade: cabeçalho em maiúsculas, zebra e rolagem horizontal no celular. */
export const PerfisTabela: React.FC<{ tabela: TabelaPerfis }> = ({ tabela }) => (
  <section className="min-w-0 mt-6" aria-label={tabela.titulo} data-testid="perfis-tabela">
    <p className="script-nota-rotulo">{tabela.titulo}</p>
    <div className="script-perfis-rolagem">
      <table className="script-perfis">
        <thead>
          <tr>{tabela.colunas.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {tabela.linhas.map((linha, i) => (
            <tr key={i}>
              {linha.map((celula, j) => (
                <td key={j} className={j === 0 ? 'script-perfis-chave' : undefined}>{celula}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

export default PerfisTabela;
