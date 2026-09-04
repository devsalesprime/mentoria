/**
 * Painel compacto no topo da Ficha: o pré-preenchimento chega em marcos (leitura dos materiais, depois
 * blocos 1 a 6) e o mentor acompanha enquanto já vai preenchendo. Estados: na fila, em andamento (trilha
 * de 7 etapas + rótulo do worker), pronto, em conferência pela equipe, erro.
 */
import React, { useEffect, useState } from 'react';
import type { ScriptJobInfo, ScriptJobProgresso } from '../../hooks/useScriptFicha';

export const ETAPAS = ['Leitura dos materiais', 'Meta', 'Mentor', 'Mentorado', 'Método', 'A Mentoria', 'Venda'] as const;
export type EstadoEtapa = 'pendente' | 'andamento' | 'concluido' | 'erro';

/** Timestamp do servidor ('YYYY-MM-DD HH:MM:SS' em UTC) ou ISO -> ms; NaN quando não dá para ler. */
export function tsMs(s?: string | null): number {
  if (!s) return NaN;
  const str = String(s);
  return Date.parse(/T|Z|[+-]\d\d:?\d\d$/.test(str) ? str : `${str.replace(' ', 'T')}Z`);
}

export function formatarDuracao(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

/**
 * Estado de cada uma das 7 etapas a partir do job. Índice 0 = leitura; índice n (1 a 6) = bloco n.
 * `etapa_atual` do worker é 1-based sobre as 7 (1 = leitura, 2 a 7 = blocos 1 a 6).
 */
export function estadosDasEtapas(job: ScriptJobInfo | null | undefined): EstadoEtapa[] {
  const out: EstadoEtapa[] = ETAPAS.map(() => 'pendente');
  if (!job) return out;
  const p: ScriptJobProgresso | null = job.progresso || null;
  const erro = new Set((p?.blocos_com_erro || []).map(Number));
  if (job.status === 'done') return ETAPAS.map((_, i) => (i > 0 && erro.has(i) ? 'erro' : 'concluido'));
  if (job.status === 'queued' || !p) return out;
  const concluidos = new Set((p.blocos_concluidos || []).map(Number));
  for (let i = 1; i <= 6; i += 1) {
    if (erro.has(i)) out[i] = 'erro';
    else if (concluidos.has(i)) out[i] = 'concluido';
  }
  if (p.fase === 'extracao') {
    out[0] = 'andamento';
    return out;
  }
  out[0] = 'concluido';
  if (p.fase === 'finalizando') {
    for (let i = 1; i <= 6; i += 1) if (out[i] === 'pendente') out[i] = 'concluido';
    return out;
  }
  const etapa = Number(p.etapa_atual);
  const idx = Number.isInteger(etapa) && etapa >= 2 && etapa <= 7 ? etapa - 1 : concluidos.size + 1;
  if (idx >= 1 && idx <= 6 && out[idx] === 'pendente') out[idx] = 'andamento';
  return out;
}

const COR: Record<EstadoEtapa, string> = {
  pendente: 'bg-white/15',
  andamento: 'bg-prosperus-gold-dark animate-pulse',
  concluido: 'bg-prosperus-gold-light',
  erro: 'bg-red-400',
};

const ROTULO_ESTADO: Record<EstadoEtapa, string> = {
  pendente: 'pendente',
  andamento: 'em andamento',
  concluido: 'concluído',
  erro: 'com erro',
};

/** Etiqueta discreta ao lado do nome do campo: chegou sugestão ou complemento novo desde a última sincronização. */
export const BadgeNovaSugestao: React.FC = () => (
  <span
    className="inline-flex items-center rounded-full border border-prosperus-gold-dark/60 bg-prosperus-gold-dark/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-prosperus-gold-light font-sans"
    data-testid="badge-nova-sugestao"
  >
    Nova sugestão
  </span>
);

interface ProgressoPreenchimentoProps {
  job: ScriptJobInfo | null | undefined;
  /** Quantas sugestões a ficha tem agora (o "Pronto: N sugestões chegaram"). */
  sugestoes?: number;
  /** Campos com sugestão ou complemento novo desde a última sincronização ("2.1 · Mentor"). */
  novas?: string[];
  /** Momento (ms) da última sincronização bem-sucedida com o servidor. */
  atualizadoEm?: number | null;
  /** "Entendi" no estado pronto. */
  onDispensar?: () => void;
}

export const ProgressoPreenchimento: React.FC<ProgressoPreenchimentoProps> = ({ job, sugestoes = 0, novas = [], atualizadoEm = null, onDispensar }) => {
  const ativo = job?.status === 'queued' || job?.status === 'running';
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ativo]);

  if (!job) return null;

  const p = job.progresso || null;
  const estados = estadosDasEtapas(job);
  const inicio = tsMs(job.started_at) || tsMs(job.created_at);
  const decorrido = Number.isNaN(inicio) ? null : formatarDuracao(agora - inicio);
  const ultimaMs = atualizadoEm ?? (p?.atualizado_em ? tsMs(p.atualizado_em) : NaN);
  const atualizadoHa = ultimaMs != null && !Number.isNaN(ultimaMs) ? formatarDuracao(agora - ultimaMs) : null;

  // Palavras simples para o mentor (nada de job, worker, prefill): leitura dos materiais e sugestões
  let titulo = 'Estamos lendo os seus materiais';
  let mensagem: string | null = null;
  if (job.status === 'queued') mensagem = 'Na fila. Começamos em instantes; você já pode ir preenchendo.';
  else if (job.status === 'running') mensagem = p?.rotulo || 'Lendo os seus materiais e montando as sugestões, bloco a bloco.';
  else if (job.status === 'done') {
    titulo = sugestoes === 1 ? 'Pronto: 1 sugestão chegou' : `Pronto: ${sugestoes} sugestões chegaram`;
    mensagem = 'Confira campo a campo: cada sugestão mostra de onde veio e você confirma ou edita.';
  } else if (job.status === 'needs_human') {
    titulo = 'Em conferência pela nossa equipe';
    mensagem = 'Nossa equipe está conferindo o seu material; você pode continuar preenchendo.';
  } else if (job.status === 'error') {
    titulo = 'Não deu para ler os materiais';
    mensagem = 'Tivemos um problema ao ler os materiais; nossa equipe foi avisada. Você pode continuar preenchendo.';
  }

  const mostrarTrilha = job.status === 'running' || job.status === 'done';
  const emExtracao = job.status === 'running' && p?.fase === 'extracao';

  return (
    <section
      className="bg-prosperus-navy-panel border border-prosperus-gold-dark/30 rounded-lg p-4 sm:p-5 space-y-3"
      role="status"
      aria-live="polite"
      data-testid="progresso-preenchimento"
      data-status={job.status}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Sugestões dos seus materiais</p>
          <h3 className="font-serif text-xl sm:text-2xl text-white mt-0.5 leading-snug" data-testid="progresso-titulo">{titulo}</h3>
        </div>
        {ativo && decorrido && (
          <span className="text-xs text-white/50 font-sans whitespace-nowrap" data-testid="progresso-decorrido">
            {job.status === 'running' ? `Em andamento há ${decorrido}` : `Na fila há ${decorrido}`}
          </span>
        )}
      </div>

      {mensagem && <p className="text-sm text-white/80 font-sans leading-relaxed" data-testid="progresso-mensagem">{mensagem}</p>}

      {mostrarTrilha && (
        <ol className="grid grid-cols-7 gap-1" aria-label="Etapas da leitura dos materiais">
          {ETAPAS.map((nome, i) => (
            <li key={nome} className="min-w-0 space-y-1" data-testid={`etapa-${i}`} data-estado={estados[i]}>
              <div className={`h-1.5 rounded-full ${COR[estados[i]]}`} aria-hidden="true" />
              <p className={`text-[10px] sm:text-[11px] leading-tight font-sans truncate ${estados[i] === 'pendente' ? 'text-white/35' : estados[i] === 'erro' ? 'text-red-300' : 'text-white/80'}`} title={`${nome}: ${ROTULO_ESTADO[estados[i]]}`}>
                {nome}
              </p>
              <span className="sr-only">{ROTULO_ESTADO[estados[i]]}</span>
            </li>
          ))}
        </ol>
      )}

      {emExtracao && p?.arquivos_total != null && (
        <p className="text-xs text-white/60 font-sans" data-testid="progresso-arquivos">
          Arquivos lidos: {p.arquivos_lidos ?? 0} de {p.arquivos_total}
        </p>
      )}

      {novas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="progresso-novas">
          <span className="text-xs text-white/60 font-sans">{novas.length === 1 ? 'Nova sugestão em:' : 'Novas sugestões em:'}</span>
          {novas.map((n) => (
            <span key={n} className="rounded-full border border-prosperus-gold-dark/40 px-2 py-1 text-[11px] text-prosperus-gold-light font-sans">{n}</span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {ativo && atualizadoHa ? (
          <span className="text-[11px] text-white/40 font-sans" data-testid="progresso-atualizado">Atualizado há {atualizadoHa}</span>
        ) : <span />}
        {job.status === 'done' && onDispensar && (
          <button
            type="button"
            onClick={onDispensar}
            className="min-h-[44px] px-4 rounded-lg text-sm font-sans border border-white/15 text-white/70 hover:text-white hover:border-white/30 transition"
          >
            Entendi
          </button>
        )}
      </div>
    </section>
  );
};
