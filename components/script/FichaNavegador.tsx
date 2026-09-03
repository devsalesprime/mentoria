/**
 * Navegação da Ficha do Script no passo a passo: pílulas dos 6 blocos, lista de perguntas
 * (folha de baixo no celular, barra lateral no desktop), mapa dos blocos no fim e o ponto de
 * estado de cada pergunta. Sem emoji: glifos em serifa e SVG.
 */
import React, { useEffect } from 'react';
import type { ScriptBlockView, ScriptFieldStatus, ScriptFieldView } from '../../data/script-ficha-fields';
import { campoRefinando, sugestaoVazia } from '../../hooks/useContextoCampo';
import { IconeCheck } from './contexto/icones';
import { Button } from '../ui/Button';

/** Uma tela do passo a passo: um campo, ou o par antes × depois (3.5 e 3.6). */
export interface PassoNav {
  id: string;
  bloco: number;
  campos: ScriptFieldView[];
}

// Uma frase por M (5 M's) para situar o bloco antes das perguntas
export const BLOCK_INTRO: Record<number, string> = {
  1: 'Meta: onde você quer chegar, com número e prazo.',
  2: 'Mentor: quem você é e o que te legitima a cobrar caro.',
  3: 'Mentorado: para quem, com dor, desejo, setor, bolso e território.',
  4: 'Método: como você leva o cliente de A para B.',
  5: 'A Mentoria: o que vai ao mercado como oferta.',
  6: 'Venda: como a venda acontece hoje.',
};

/** Uma linha de "prévia do seu script" ao fechar cada bloco (o que o bloco já entrega ao script). */
export const PREVIA_SCRIPT: Record<number, string> = {
  1: 'Passos 3 e 5: já sabemos qual oferta o script vende e a meta que ele persegue.',
  2: 'Passo 1 · Conexão: já temos a sua frase de especialista e as suas provas.',
  3: 'Passo 2: a dor e o desejo do cliente, nas palavras dele, já entram no script.',
  4: 'Passo 3: o seu método entra com nome, fio condutor e pilares.',
  5: 'Passo 5: a proposta entra com promessa, formato, preço e condições.',
  6: 'Passos 4 e 6: as objeções que você já ouviu e o próximo passo padrão fecham o script.',
};

export type StatusNav = ScriptFieldStatus | 'refinando';

export const STATUS_NAV: Record<StatusNav, { rotulo: string; classe: string }> = {
  sugerido: { rotulo: 'Sugerido', classe: 'bg-prosperus-gold-dark' },
  confirmado: { rotulo: 'Confirmado', classe: 'bg-green-400' },
  editado: { rotulo: 'Editado por você', classe: 'bg-teal-300' },
  vazio: { rotulo: 'Vazio', classe: 'bg-transparent border border-white/40' },
  aceito_vazio: { rotulo: 'Deixado em branco', classe: 'bg-white/30' },
  refinando: { rotulo: 'Em revisão pela IA', classe: 'bg-prosperus-gold-light animate-pulse' },
};

const ORDEM_LEGENDA: StatusNav[] = ['sugerido', 'confirmado', 'editado', 'vazio', 'aceito_vazio', 'refinando'];

/** Estado visual do campo: em revisão pela IA > estado salvo; sugestão só de marcador conta como vazio. */
export function statusNav(c: ScriptFieldView): StatusNav {
  if (campoRefinando(c as { refinando?: boolean })) return 'refinando';
  if (c.status === 'sugerido' && sugestaoVazia(c.sugerido)) return 'vazio';
  return c.status;
}

export const pendenteNav = (p: PassoNav) => p.campos.some((c) => !c.decidido);

export const PontoStatus: React.FC<{ status: StatusNav; className?: string }> = ({ status, className = '' }) => {
  const s = STATUS_NAV[status] || STATUS_NAV.vazio;
  return <span role="img" aria-label={s.rotulo} title={s.rotulo} className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${s.classe} ${className}`} data-status={status} />;
};

/** Glifo do bloco: numeral em serifa; check quando fechado. */
export const GlifoBloco: React.FC<{ numero: number; fechado?: boolean; className?: string }> = ({ numero, fechado = false, className = '' }) => (
  fechado
    ? <IconeCheck className={className} title="Bloco fechado" />
    : <span className={`font-serif leading-none ${className}`} aria-hidden="true">{numero}</span>
);

export const Legenda: React.FC = () => (
  <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Legenda dos estados">
    {ORDEM_LEGENDA.map((s) => (
      <li key={s} className="inline-flex items-center gap-1.5 text-[10px] text-white/50 font-sans">
        <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${STATUS_NAV[s].classe}`} />
        {STATUS_NAV[s].rotulo}
      </li>
    ))}
  </ul>
);

/** As 6 pílulas dos blocos (grade de 6 colunas). */
export const PilulasBlocos: React.FC<{ blocos: ScriptBlockView[]; atual: number | null; onIr: (numero: number) => void }> = ({ blocos, atual, onIr }) => (
  <nav aria-label="Blocos da ficha" className="grid grid-cols-6 gap-1.5">
    {blocos.map((b) => {
      const ativo = b.numero === atual;
      return (
        <button
          key={b.numero}
          type="button"
          onClick={() => onIr(b.numero)}
          aria-current={ativo ? 'step' : undefined}
          aria-label={`Bloco ${b.numero}: ${b.nome}, ${b.decididos} de ${b.total} decididos`}
          title={`${b.numero}. ${b.nome}`}
          data-testid={`bloco-pill-${b.numero}`}
          className={`min-h-[44px] rounded-lg border flex flex-col items-center justify-center gap-0.5 px-1 transition ${
            ativo
              ? 'bg-prosperus-gold-dark/15 border-prosperus-gold-dark text-white'
              : b.fechado
              ? 'bg-green-500/5 border-green-500/30 text-white/80 hover:border-green-500/60'
              : 'bg-white/[0.03] border-white/15 text-white/70 hover:border-prosperus-gold-dark/60'
          }`}
        >
          <GlifoBloco numero={b.numero} fechado={b.fechado} className={b.fechado ? 'text-green-400' : 'text-base text-prosperus-gold-light'} />
          <span className="text-[10px] font-sans leading-none">{b.decididos}/{b.total}</span>
        </button>
      );
    })}
  </nav>
);

function tituloDoPasso(p: PassoNav): string {
  return p.campos.length > 1 ? 'Daqui a 1 ano' : p.campos[0].nome;
}

/** Lista de perguntas (de um bloco ou de todos) com ponto de estado, toque para pular. */
export const ListaPerguntas: React.FC<{
  passos: PassoNav[];
  atual: number;
  onIr: (indice: number) => void;
  bloco?: number;
  idPrefixo?: string;
}> = ({ passos, atual, onIr, bloco, idPrefixo = '' }) => (
  <ul className="space-y-0.5">
    {passos.map((p, j) => {
      if (bloco != null && p.bloco !== bloco) return null;
      const ativo = j === atual;
      return (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onIr(j)}
            aria-current={ativo ? 'step' : undefined}
            data-testid={`${idPrefixo}nav-passo-${p.id}`}
            className={`w-full min-h-[44px] flex items-center gap-2 px-2 rounded-lg text-left transition ${
              ativo ? 'bg-prosperus-gold-dark/15 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="inline-flex items-center gap-1 shrink-0">
              {p.campos.map((c) => <PontoStatus key={c.key} status={statusNav(c)} />)}
            </span>
            <span className="text-[11px] text-prosperus-gold-dark font-bold font-sans shrink-0">{p.campos.map((c) => c.key).join(' e ')}</span>
            <span className="text-sm font-sans truncate">{tituloDoPasso(p)}</span>
          </button>
        </li>
      );
    })}
  </ul>
);

/** Folha de baixo (celular): perguntas do bloco atual. */
export const NavegadorSheet: React.FC<{
  aberto: boolean;
  onFechar: () => void;
  bloco: ScriptBlockView;
  totalBlocos: number;
  passos: PassoNav[];
  atual: number;
  onIr: (indice: number) => void;
}> = ({ aberto, onFechar, bloco, totalBlocos, passos, atual, onIr }) => {
  useEffect(() => {
    if (!aberto) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-[110] lg:hidden" data-testid="navegador-sheet">
      <div className="absolute inset-0 bg-prosperus-navy-dark/80" onClick={onFechar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Perguntas do bloco ${bloco.numero}`}
        className="absolute inset-x-0 bottom-0 max-h-[75vh] rounded-t-2xl bg-prosperus-navy-panel border-t border-prosperus-gold-dark/40 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-white/10">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Bloco {bloco.numero} de {totalBlocos}</p>
            <p className="font-serif text-lg text-white">{bloco.nome}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar perguntas" className="min-h-[44px] min-w-[44px] flex items-center justify-center text-white/60 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-2 py-2">
          <ListaPerguntas passos={passos} atual={atual} onIr={(j) => { onIr(j); onFechar(); }} bloco={bloco.numero} idPrefixo="sheet-" />
        </div>
        <div className="px-4 py-2 border-t border-white/10"><Legenda /></div>
      </div>
    </div>
  );
};

/** Barra lateral (desktop, a partir de 1024 px): blocos como seções, perguntas como itens. */
export const NavegadorLateral: React.FC<{
  blocos: ScriptBlockView[];
  passos: PassoNav[];
  atual: number;
  blocoAtual: number | null;
  onIr: (indice: number) => void;
  onIrBloco: (numero: number) => void;
  onProximaPendente: () => void;
}> = ({ blocos, passos, atual, blocoAtual, onIr, onIrBloco, onProximaPendente }) => {
  const temPendente = passos.some(pendenteNav);
  return (
    <aside className="hidden lg:block" aria-label="Navegação da ficha" data-testid="navegador-lateral">
      <div className="sticky top-4 space-y-3 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
        <Button variant="secondary" size="md" className="w-full min-h-[44px]" onClick={onProximaPendente} disabled={!temPendente}>Próxima pendente</Button>
        {blocos.map((b) => (
          <section key={b.numero} aria-label={`Bloco ${b.numero}: ${b.nome}`} className="space-y-0.5">
            <button
              type="button"
              onClick={() => onIrBloco(b.numero)}
              aria-current={b.numero === blocoAtual ? 'true' : undefined}
              className={`w-full min-h-[44px] flex items-center gap-2 px-2 rounded-lg text-left transition ${b.numero === blocoAtual ? 'bg-white/5' : 'hover:bg-white/5'}`}
            >
              <span className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${b.fechado ? 'border-green-500/50 text-green-400' : 'border-prosperus-gold-dark/50 text-prosperus-gold-light'}`}>
                <GlifoBloco numero={b.numero} fechado={b.fechado} className="text-sm" />
              </span>
              <span className="flex-1 font-serif text-base text-white truncate">{b.nome}</span>
              <span className="text-[11px] text-white/40 font-sans">{b.decididos}/{b.total}</span>
            </button>
            <ListaPerguntas passos={passos} atual={atual} onIr={onIr} bloco={b.numero} idPrefixo="lateral-" />
          </section>
        ))}
        <Legenda />
      </div>
    </aside>
  );
};

/** Mapa dos blocos no fim da ficha: decididos, obrigatórios em aberto, toque para ir ao bloco. */
export const MapaBlocos: React.FC<{ blocos: ScriptBlockView[]; onIr: (numero: number) => void }> = ({ blocos, onIr }) => (
  <ul className="space-y-1.5 text-left" aria-label="Mapa dos blocos" data-testid="mapa-blocos">
    {blocos.map((b) => {
      const pend = b.total - b.decididos;
      const pendObrig = b.obrigatorios - b.obrigatorios_decididos;
      return (
        <li key={b.numero}>
          <button
            type="button"
            onClick={() => onIr(b.numero)}
            className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-lg border border-white/10 hover:border-prosperus-gold-dark/50 text-left transition"
          >
            <span className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${b.fechado ? 'border-green-500/50 text-green-400' : 'border-prosperus-gold-dark/50 text-prosperus-gold-light'}`}>
              <GlifoBloco numero={b.numero} fechado={b.fechado} className="text-base" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-serif text-base text-white">{b.numero}. {b.nome}</span>
              <span className="block text-[11px] text-white/45 font-sans">
                {b.decididos} de {b.total} decididos{pendObrig > 0 ? ` · ${pendObrig} obrigatórios em aberto` : ''}
              </span>
            </span>
            <span className="text-xs text-white/60 font-sans shrink-0">{pend === 0 ? <IconeCheck className="text-green-400" title="Tudo decidido" /> : `${pend} em aberto`}</span>
          </button>
        </li>
      );
    })}
  </ul>
);
