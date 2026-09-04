/**
 * Navegação da Ficha do Script no passo a passo: UM navegador, hierárquico, na mesma linguagem do
 * menu lateral do app (seção em caixa alta, itens com o estado ativo dourado, painel navy). Os 6
 * blocos são seções; as perguntas são itens do bloco aberto, com o ponto de estado. Coluna esquerda
 * fixa no desktop; folha de baixo ("Perguntas") no celular. Sem emoji: glifos em SVG.
 */
import React, { useEffect, useState } from 'react';
import type { ScriptBlockView, ScriptFieldStatus, ScriptFieldView } from '../../data/script-ficha-fields';
import { campoRefinando, sugestaoVazia } from '../../hooks/useContextoCampo';
import { IconeCheck, IconeLivro, IconeSeta, IconeX } from './contexto/icones';
import { Button } from '../ui/Button';
import { capitulosDoScript, textoCapitulos } from './widgets/previa';
import { COPY_PREVIA_SCRIPT } from './widgets/PreviaScript';

/** Uma tela do passo a passo: um campo, ou o par antes × depois (3.5 e 3.6). */
export interface PassoNav {
  id: string;
  bloco: number;
  campos: ScriptFieldView[];
}

// Uma frase por M (5 M's) para situar o bloco na primeira pergunta dele
export const BLOCK_INTRO: Record<number, string> = {
  1: 'Meta: onde você quer chegar, com número e prazo. É o que o script persegue.',
  2: 'Mentor: quem você é e o que te autoriza a cobrar caro. É o que abre a conversa.',
  3: 'Mentorado: para quem você vende, com dor, desejo, setor, bolso e território. É com ele que o script fala.',
  4: 'Método: como você leva o cliente de A para B. É o que o script apresenta.',
  5: 'A Mentoria: o que você oferece, com promessa, formato e preço. É a proposta do script.',
  6: 'Venda: como a venda acontece hoje. Define a voz e o ritmo do script.',
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

/** Vocabulário único de estado em toda a ficha: sugerido, confirmado, editado, em branco, aceito em branco, em revisão pela IA. */
export const STATUS_NAV: Record<StatusNav, { rotulo: string; classe: string }> = {
  sugerido: { rotulo: 'Sugerido', classe: 'bg-prosperus-gold-dark' },
  confirmado: { rotulo: 'Confirmado', classe: 'bg-green-400' },
  editado: { rotulo: 'Editado', classe: 'bg-teal-300' },
  vazio: { rotulo: 'Em branco', classe: 'bg-transparent border border-white/40' },
  aceito_vazio: { rotulo: 'Aceito em branco', classe: 'bg-white/30' },
  refinando: { rotulo: 'Nova sugestão a caminho', classe: 'bg-prosperus-gold-light animate-pulse' },
};

const ORDEM_LEGENDA: StatusNav[] = ['sugerido', 'confirmado', 'editado', 'vazio', 'aceito_vazio', 'refinando'];

export const rotuloStatus = (s: StatusNav): string => (STATUS_NAV[s] || STATUS_NAV.vazio).rotulo;

/** Estado visual do campo: em revisão pela IA > estado salvo; sugestão só de marcador conta como em branco. */
export function statusNav(c: ScriptFieldView): StatusNav {
  if (campoRefinando(c as { refinando?: boolean })) return 'refinando';
  if (c.status === 'sugerido' && sugestaoVazia(c.sugerido)) return 'vazio';
  return c.status;
}

export const pendenteNav = (p: PassoNav) => p.campos.some((c) => !c.decidido);

export const PontoStatus: React.FC<{ status: StatusNav; className?: string }> = ({ status, className = '' }) => {
  const s = STATUS_NAV[status] || STATUS_NAV.vazio;
  return <span role="img" aria-label={s.rotulo} title={s.rotulo} className={`inline-block w-2 h-2 rounded-full shrink-0 ${s.classe} ${className}`} data-status={status} />;
};

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

function tituloDoPasso(p: PassoNav): string {
  return p.campos.length > 1 ? 'Daqui a 1 ano' : p.campos[0].nome;
}

/** Blocos abertos no navegador: ao trocar de bloco, só o atual fica aberto; toque no cabeçalho abre ou fecha. */
export function useBlocosAbertos(blocoAtual: number | null): [number[], (n: number) => void] {
  const [abertos, setAbertos] = useState<number[]>(blocoAtual != null ? [blocoAtual] : []);
  useEffect(() => { if (blocoAtual != null) setAbertos([blocoAtual]); }, [blocoAtual]);
  const toggle = (n: number) => setAbertos((a) => (a.includes(n) ? a.filter((x) => x !== n) : [...a, n]));
  return [abertos, toggle];
}

/** Título do grupo recolhido com o que os materiais já responderam (modo "completar o que falta"). */
export const COPY_GRUPO_MATERIAIS = 'Preenchido pelos seus materiais';

interface NavegadorFichaProps {
  blocos: ScriptBlockView[];
  passos: PassoNav[];
  atual: number;
  blocoAtual: number | null;
  abertos: number[];
  onToggle: (numero: number) => void;
  onIr: (indice: number) => void;
  idPrefixo?: string;
  /**
   * Modo "completar o que falta": ids dos passos que precisam da resposta do mentor. Só eles aparecem nos blocos;
   * os demais ficam recolhidos em "Preenchido pelos seus materiais" (editáveis sob demanda). null = ficha inteira.
   */
  focoIds?: string[] | null;
}

/** Seções (blocos) e itens (perguntas), com as classes do menu lateral do app. */
export const NavegadorFicha: React.FC<NavegadorFichaProps> = ({ blocos, passos, atual, blocoAtual, abertos, onToggle, onIr, idPrefixo = '', focoIds = null }) => {
  const foco = focoIds ? new Set(focoIds) : null;
  const noFoco = (p: PassoNav) => !foco || foco.has(p.id);
  const outros = foco ? passos.map((p, j) => ({ p, j })).filter(({ p }) => !foco.has(p.id)) : [];
  const [outrosAberto, setOutrosAberto] = useState(false);
  const blocosVisiveis = foco ? blocos.filter((b) => passos.some((p) => p.bloco === b.numero && foco.has(p.id))) : blocos;
  return (
  <nav aria-label="Perguntas da ficha" className="space-y-2">
    {blocosVisiveis.map((b) => {
      const aberto = abertos.includes(b.numero);
      const ativo = b.numero === blocoAtual;
      const passosDoBloco = passos.filter((p) => p.bloco === b.numero && noFoco(p));
      const decididosBloco = foco ? passosDoBloco.filter((p) => !pendenteNav(p)).length : b.decididos;
      const totalBloco = foco ? passosDoBloco.reduce((s, p) => s + p.campos.length, 0) : b.total;
      return (
        <section key={b.numero} aria-label={`Bloco ${b.numero}: ${b.nome}`}>
          <button
            type="button"
            onClick={() => onToggle(b.numero)}
            aria-expanded={aberto}
            aria-current={ativo ? 'true' : undefined}
            data-testid={`${idPrefixo}nav-bloco-${b.numero}`}
            className={`min-h-[44px] w-full flex items-center justify-between gap-2 px-2 rounded text-[10px] sm:text-xs font-bold uppercase tracking-wide transition ${
              ativo ? 'text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              {b.fechado
                ? <IconeCheck className="text-green-400 shrink-0" title="Bloco fechado" />
                : <span className="font-serif text-sm normal-case text-prosperus-gold-light shrink-0 w-4 text-center" aria-hidden="true">{b.numero}</span>}
              <span className="truncate">{b.nome}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="font-sans normal-case tracking-normal text-[11px] text-white/50" data-testid={`${idPrefixo}nav-bloco-${b.numero}-contagem`}>{decididosBloco}/{totalBloco}</span>
              <IconeSeta direcao={aberto ? 'baixo' : 'dir'} className="text-white/40" />
            </span>
          </button>
          {aberto && (
            <ul className="mt-1 ml-3 pl-2 border-l border-white/10 space-y-1">
              {passos.map((p, j) => {
                if (p.bloco !== b.numero || !noFoco(p)) return null;
                const atualItem = j === atual;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onIr(j)}
                      aria-current={atualItem ? 'step' : undefined}
                      data-testid={`${idPrefixo}nav-passo-${p.id}`}
                      className={`min-h-[44px] flex items-center gap-2 w-full text-left px-3 py-1.5 rounded transition text-xs sm:text-sm ${
                        atualItem ? 'bg-prosperus-gold-dark text-black font-semibold' : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className={`text-[11px] font-bold font-sans shrink-0 ${atualItem ? 'text-black/70' : 'text-prosperus-gold-dark'}`}>{p.campos.map((c) => c.key).join(' e ')}</span>
                      <span className="truncate flex-1">{tituloDoPasso(p)}</span>
                      <span className={`inline-flex items-center gap-1 shrink-0 ${atualItem ? 'rounded-full bg-black/25 px-1 py-0.5' : ''}`}>
                        {p.campos.map((c) => <PontoStatus key={c.key} status={statusNav(c)} />)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      );
    })}
    {foco && outros.length > 0 && (
      <section aria-label={COPY_GRUPO_MATERIAIS} data-testid={`${idPrefixo}nav-outros`}>
        <button
          type="button"
          onClick={() => setOutrosAberto((v) => !v)}
          aria-expanded={outrosAberto}
          data-testid={`${idPrefixo}nav-outros-toggle`}
          className="min-h-[44px] w-full flex items-center justify-between gap-2 px-2 rounded text-[10px] sm:text-xs font-bold uppercase tracking-wide text-gray-400 hover:text-white transition"
        >
          <span className="flex items-center gap-2 min-w-0">
            <IconeCheck className="text-prosperus-gold-light shrink-0" title={COPY_GRUPO_MATERIAIS} />
            <span className="truncate">{COPY_GRUPO_MATERIAIS}</span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <span className="font-sans normal-case tracking-normal text-[11px] text-white/50" data-testid={`${idPrefixo}nav-outros-contagem`}>{outros.reduce((s, { p }) => s + p.campos.length, 0)}</span>
            <IconeSeta direcao={outrosAberto ? 'baixo' : 'dir'} className="text-white/40" />
          </span>
        </button>
        {outrosAberto && (
          <ul className="mt-1 ml-3 pl-2 border-l border-white/10 space-y-1">
            {outros.map(({ p, j }) => {
              const atualItem = j === atual;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onIr(j)}
                    aria-current={atualItem ? 'step' : undefined}
                    data-testid={`${idPrefixo}nav-passo-${p.id}`}
                    className={`min-h-[44px] flex items-center gap-2 w-full text-left px-3 py-1.5 rounded transition text-xs sm:text-sm ${
                      atualItem ? 'bg-prosperus-gold-dark text-black font-semibold' : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className={`text-[11px] font-bold font-sans shrink-0 ${atualItem ? 'text-black/70' : 'text-prosperus-gold-dark'}`}>{p.campos.map((c) => c.key).join(' e ')}</span>
                    <span className="truncate flex-1">{tituloDoPasso(p)}</span>
                    <span className={`text-[10px] font-sans shrink-0 ${atualItem ? 'text-black/60' : 'text-white/40'}`}>Editar</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    )}
  </nav>
  );
};

/** O fim do navegador: "Prévia do script" com quantos capítulos já abriram (os outros ficam trancados). */
export const BotaoPrevia: React.FC<{ blocos: ScriptBlockView[]; onClick: () => void; ativo?: boolean; testId?: string }> = ({ blocos, onClick, ativo = false, testId = 'nav-previa' }) => {
  const caps = capitulosDoScript(blocos);
  const revelados = caps.filter((c) => c.revelado).length;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={ativo ? 'true' : undefined}
      data-testid={testId}
      className={`min-h-[48px] w-full flex items-center gap-2 px-2 rounded border transition text-left ${
        ativo ? 'border-prosperus-gold-dark/60 bg-prosperus-gold-dark/10 text-white' : 'border-prosperus-gold-dark/30 text-gray-300 hover:text-white hover:border-prosperus-gold-dark/60'
      }`}
    >
      <span className="text-prosperus-gold-light shrink-0" aria-hidden="true"><IconeLivro /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] sm:text-xs font-bold uppercase tracking-wide">Prévia do script</span>
        <span className="block text-[11px] font-sans normal-case tracking-normal text-white/50" data-testid={`${testId}-capitulos`}>{textoCapitulos(revelados, caps.length)}</span>
      </span>
      <IconeSeta direcao="dir" className="text-white/40 shrink-0" />
    </button>
  );
};

interface NavegadorLateralProps extends NavegadorFichaProps {
  onProximaPendente: () => void;
  /** Abre a prévia do script (capítulos revelados e trancados). */
  onPrevia?: () => void;
  previaAtiva?: boolean;
  /** Sobrescreve a leitura padrão (modo "completar o que falta": só as respostas do mentor contam). */
  temPendente?: boolean;
}

/** Coluna esquerda (desktop, a partir de 1024 px): painel navy fixo com a hierarquia blocos > perguntas e, no fim, a prévia. */
export const NavegadorLateral: React.FC<NavegadorLateralProps> = ({ onProximaPendente, onPrevia, previaAtiva = false, temPendente: temPendenteProp, ...nav }) => {
  const temPendente = temPendenteProp ?? nav.passos.some(pendenteNav);
  return (
    <aside className="hidden lg:block" aria-label="Navegação da ficha" data-testid="navegador-lateral">
      <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto ficha-scroll rounded-lg bg-prosperus-navy-panel border border-white/5 p-3 space-y-3">
        <Button variant="secondary" size="md" className="w-full min-h-[44px]" onClick={onProximaPendente} disabled={!temPendente}>Próxima pendente</Button>
        <NavegadorFicha {...nav} idPrefixo="lateral-" />
        {onPrevia && <BotaoPrevia blocos={nav.blocos} onClick={onPrevia} ativo={previaAtiva} testId="lateral-previa" />}
        <Legenda />
      </div>
    </aside>
  );
};

interface NavegadorSheetProps extends NavegadorFichaProps {
  aberto: boolean;
  onFechar: () => void;
  onPrevia?: () => void;
  previaAtiva?: boolean;
  temPendente?: boolean;
}

/** Folha de baixo (celular): a mesma hierarquia, rolando por dentro com a barra discreta. */
export const NavegadorSheet: React.FC<NavegadorSheetProps> = ({ aberto, onFechar, onPrevia, previaAtiva = false, temPendente: _temPendente, ...nav }) => {
  useEffect(() => {
    if (!aberto) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [aberto, onFechar]);

  if (!aberto) return null;
  const total = nav.blocos.reduce((s, b) => s + b.total, 0);
  const decididos = nav.blocos.reduce((s, b) => s + b.decididos, 0);
  return (
    <div className="fixed inset-0 z-[110] lg:hidden" data-testid="navegador-sheet">
      <div className="absolute inset-0 bg-prosperus-navy-dark/80" onClick={onFechar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Perguntas da ficha"
        className="absolute inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl bg-prosperus-navy-panel border-t border-prosperus-gold-dark/40 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-white/10 shrink-0">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Perguntas</p>
            <p className="text-sm text-white/70 font-sans">{decididos} de {total} decididos</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar perguntas" className="min-h-[44px] min-w-[44px] flex items-center justify-center text-white/60 hover:text-white">
            <IconeX />
          </button>
        </div>
        <div className="overflow-y-auto ficha-scroll min-h-0 px-2 py-2 space-y-3" data-testid="navegador-sheet-lista">
          <NavegadorFicha {...nav} onIr={(j) => { nav.onIr(j); onFechar(); }} idPrefixo="sheet-" />
          {onPrevia && <BotaoPrevia blocos={nav.blocos} onClick={() => { onPrevia(); onFechar(); }} ativo={previaAtiva} testId="sheet-previa" />}
        </div>
        <div className="px-4 py-2 border-t border-white/10 shrink-0"><Legenda /></div>
      </div>
    </div>
  );
};
