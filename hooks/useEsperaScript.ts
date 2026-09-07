import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

/**
 * Tempo real das etapas e posicao na fila (onda I, SPEC-experiencia-pre-script-v1 §3, itens I3 e I4).
 *
 * Duas leituras, as duas so de leitura no servidor:
 *   GET /api/script/tempos          -> { prefill, script, refinar, slides }, cada um { mediana_min, n }
 *   GET /api/script/fila?tipo=...   -> { na_frente, clubes, status, tem_job }
 *
 * Regra de copy: numero na tela SO quando ele existe de verdade. Sem historico (`mediana_min` null),
 * a frase sai sem numero nenhum, nunca com um valor inventado.
 */

export type TempoTipo = 'prefill' | 'script' | 'refinar' | 'slides';
export type FilaTipo = 'prefill' | 'script';

export interface TempoEtapa {
  /** Mediana em minutos dos ultimos trabalhos concluidos, ou null quando ainda nao ha historico. */
  mediana_min: number | null;
  /** Quantos trabalhos entraram no calculo. */
  n: number;
}

export type TemposScript = Partial<Record<TempoTipo, TempoEtapa>>;

export interface FilaScript {
  /** Quantos trabalhos entraram antes do desta pessoa e ainda estao em andamento. */
  na_frente: number;
  /** Nome dos clubes na frente, na ordem de entrada (sem repetir). */
  clubes: string[];
  status: 'queued' | 'running' | null;
  /** false quando esta pessoa nao tem trabalho nenhum em andamento desse tipo. */
  tem_job: boolean;
}

const POLL_FILA_MS = 30000;

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/** "costuma levar cerca de 12 min", ou null quando ainda nao ha historico para prometer nada. */
export function frasePorMediana(minutos: number | null | undefined): string | null {
  if (!minutos || !Number.isFinite(minutos)) return null;
  return `costuma levar cerca de ${Math.round(minutos)} min`;
}

/**
 * De QUEM e o tempo. Sozinho, o numero era lido como esforco da propria pessoa ("37 min preenchendo?");
 * com o sujeito na frente fica claro que o trabalho e da nossa parte e que ninguem precisa esperar na tela.
 */
export const SUJEITO_DO_TEMPO: Record<FilaTipo, string> = {
  prefill: 'a nossa leitura dos seus materiais',
  script: 'a escrita do seu script',
};

/** Na linha da espera a fila ja disse o que esta rolando: ali o sujeito vai curto, para nao repetir. */
export const SUJEITO_CURTO: Record<FilaTipo, string> = {
  prefill: 'a nossa leitura',
  script: 'a escrita',
};

/** "a nossa leitura dos seus materiais costuma levar cerca de 12 min"; null sem historico. */
export function fraseDoTempo(tipo: FilaTipo, minutos: number | null | undefined, curto = false): string | null {
  const base = frasePorMediana(minutos);
  return base ? `${(curto ? SUJEITO_CURTO : SUJEITO_DO_TEMPO)[tipo]} ${base}` : null;
}

/** A mesma frase abrindo a oracao: "A nossa leitura dos seus materiais costuma levar cerca de 12 min". */
export function fraseDoTempoMaiuscula(tipo: FilaTipo, minutos: number | null | undefined): string | null {
  const frase = fraseDoTempo(tipo, minutos);
  return frase ? frase.charAt(0).toUpperCase() + frase.slice(1) : null;
}

/** "Ceramfix, Laser Tech e Elos"; acima de 3 nomes vira "Ceramfix, Laser Tech e mais 4". */
export function listarClubes(nomes: string[], limite = 3): string {
  const lista = (nomes || []).filter(Boolean);
  if (!lista.length) return '';
  if (lista.length <= limite) {
    if (lista.length === 1) return lista[0];
    return `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`;
  }
  return `${lista.slice(0, limite).join(', ')} e mais ${lista.length - limite}`;
}

export const COPY_PROXIMO = 'Você é o próximo';
export const COPY_LENDO_AGORA = 'Lendo os seus materiais agora';
export const COPY_ESCREVENDO_AGORA = 'Sendo escrito agora';

/**
 * A linha da espera: "2 na frente: Ceramfix e Laser Tech" ou, sem ninguem na frente, o estado do momento.
 * Devolve string vazia quando nao ha nada honesto a dizer.
 */
export function fraseDaFila(fila: FilaScript | null, tipo: FilaTipo): string {
  if (!fila || !fila.tem_job) return '';
  if (fila.na_frente > 0) {
    const nomes = listarClubes(fila.clubes);
    return nomes ? `${fila.na_frente} na frente: ${nomes}` : `${fila.na_frente} na frente`;
  }
  if (fila.status === 'running') return tipo === 'script' ? COPY_ESCREVENDO_AGORA : COPY_LENDO_AGORA;
  return COPY_PROXIMO;
}

/** A linha inteira: fila e tempo (com o sujeito do tempo), separados por ponto medio; sem tempo, so a fila. */
export function linhaDeEspera(fila: FilaScript | null, tipo: FilaTipo, medianaMin: number | null): string {
  const partes = [fraseDaFila(fila, tipo), fraseDoTempo(tipo, medianaMin, true)].filter(Boolean);
  return partes.join(' · ');
}

/** Medianas por tipo. Uma leitura por montagem; nada aqui grava. */
export function useTemposScript(token: string, enabled = true) {
  const [tempos, setTempos] = useState<TemposScript>({});
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!token || !enabled) return;
    let vivo = true;
    (async () => {
      try {
        const res = await axios.get('/api/script/tempos', authHeaders(token));
        if (vivo && res.data?.success) setTempos(res.data.tempos || {});
      } catch { /* sem tempo: a copy sai sem numero */ } finally {
        if (vivo) setCarregado(true);
      }
    })();
    return () => { vivo = false; };
  }, [token, enabled]);

  const medianaDe = useCallback(
    (tipo: TempoTipo): number | null => tempos[tipo]?.mediana_min ?? null,
    [tempos],
  );

  return { tempos, medianaDe, carregado };
}

/** Posicao na fila do tipo pedido, com poll de 30 s enquanto a espera esta na tela. */
export function useFilaScript(token: string, tipo: FilaTipo, enabled = true, pollMs = POLL_FILA_MS) {
  const [fila, setFila] = useState<FilaScript | null>(null);

  const ler = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`/api/script/fila?tipo=${tipo}`, authHeaders(token));
      if (res.data?.success) {
        setFila({
          na_frente: Number(res.data.na_frente) || 0,
          clubes: Array.isArray(res.data.clubes) ? res.data.clubes : [],
          status: res.data.status ?? null,
          tem_job: !!res.data.tem_job,
        });
      }
    } catch { /* silencioso: a espera continua sem a linha */ }
  }, [token, tipo]);

  useEffect(() => {
    if (!token || !enabled) return;
    let vivo = true;
    const rodar = () => { if (vivo) void ler(); };
    rodar();
    const t = setInterval(rodar, pollMs);
    return () => { vivo = false; clearInterval(t); };
  }, [token, enabled, ler, pollMs]);

  return { fila, recarregar: ler };
}
