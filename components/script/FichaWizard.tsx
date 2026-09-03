/**
 * FichaWizard: a Ficha do Script passo a passo, no jeito dos módulos antigos: uma pergunta por tela,
 * título grande, a sugestão no visual do widget (pódio, VS, cartões, escada...), botão grande
 * "Confirmar e avançar", barra de progresso, pílulas dos 6 blocos, lista de perguntas (folha de
 * baixo no celular, barra lateral no desktop) e contexto por pergunta (áudio, foto, vídeo, link, nota).
 * Salva pelo mesmo `decide` do hook (fila com debounce).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { UseScriptFicha } from '../../hooks/useScriptFicha';
import type { ScriptBlockView, ScriptFieldView } from '../../data/script-ficha-fields';
import { campoRefinando, sugestaoVazia } from '../../hooks/useContextoCampo';
import { Button } from '../ui/Button';
import { FieldEditor, useFieldEditor } from './widgets/editor';
import { FichaDisplay, Fonte, TextoOriginal } from './widgets/FichaDisplay';
import { Alternativas, COPY_EM_BRANCO, COPY_VAZIO, StatusChip, statusDaTela } from './FichaField';
import { BadgeRefinando, ContextoCampo } from './contexto/ContextoCampo';
import {
  BLOCK_INTRO, MapaBlocos, NavegadorLateral, NavegadorSheet, PREVIA_SCRIPT, PilulasBlocos, pendenteNav, type PassoNav,
} from './FichaNavegador';

export { BLOCK_INTRO, PREVIA_SCRIPT } from './FichaNavegador';

/** Uma tela do passo a passo: um campo, ou o par antes × depois (3.5 e 3.6). */
export type Passo = PassoNav;

type Tela =
  | { tipo: 'passo' }
  | { tipo: 'bloco'; de: number; para: number }
  | { tipo: 'fim' };

const TAP = 'min-h-[44px] w-full sm:w-auto';

export function montarPassos(blocos: ScriptBlockView[]): Passo[] {
  const out: Passo[] = [];
  for (const b of blocos) {
    const skip = new Set<string>();
    for (const c of b.campos) {
      if (skip.has(c.key)) continue;
      const par: string | undefined = c.widget === 'antes_depois' ? c.template?.par : undefined;
      const outro = par ? b.campos.find((x) => x.key === par && !skip.has(x.key)) : undefined;
      if (outro) {
        skip.add(outro.key);
        out.push({ id: `${c.key}+${outro.key}`, bloco: b.numero, campos: [c, outro] });
      } else {
        out.push({ id: c.key, bloco: b.numero, campos: [c] });
      }
    }
  }
  return out;
}

const pendente = pendenteNav;

/** Primeiro campo sem decisão da ficha inteira (todos os blocos abertos); -1 quando está tudo decidido. */
export function passoInicial(passos: Passo[]): number {
  return passos.findIndex(pendente);
}

const slide = {
  enter: (d: number) => ({ x: d > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -60 : 60, opacity: 0 }),
};

// Interstício e fim: só um fade de 300 ms
const fade = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

// ── um campo dentro do passo ─────────────────────────────────────────────────

interface CampoPassoProps {
  campo: ScriptFieldView;
  contexto: Record<string, ScriptFieldView>;
  decide: UseScriptFicha['decide'];
  /** No par (antes × depois) cada coluna tem os próprios botões e não avança sozinha. */
  par?: boolean;
  onAvancar?: () => void;
  onVoltar?: () => void;
  podeVoltar?: boolean;
  onPerguntas?: () => void;
  onRecarregar?: () => Promise<void> | void;
  onEditingChange?: (editing: boolean) => void;
}

const CampoPasso: React.FC<CampoPassoProps> = ({
  campo, contexto, decide, par = false, onAvancar, onVoltar, podeVoltar = true, onPerguntas, onRecarregar, onEditingChange,
}) => {
  const editor = useFieldEditor(campo, contexto);
  const { editing, canSave } = editor;
  const status = statusDaTela(campo);
  const temSugestao = !sugestaoVazia(campo.sugerido);
  const avancar = () => { if (!par) onAvancar?.(); };

  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const confirmar = () => { decide(campo.key, { status: 'confirmado' }); avancar(); };
  const salvar = () => {
    const d = editor.decision();
    if (!d) return;
    decide(campo.key, d);
    editor.reset();
    avancar();
  };
  const emBranco = () => { decide(campo.key, { status: 'aceito_vazio' }); avancar(); };
  const desfazer = () => decide(campo.key, { status: temSugestao ? 'sugerido' : 'vazio' });
  const usarAlternativa = (t: string) => decide(campo.key, { status: 'editado', valor: t });
  const editar = () => editor.start(status === 'sugerido' ? 'sugerido' : status === 'aceito_vazio' ? 'vazio' : 'atual');

  const sufixo = par ? '' : ' e avançar';
  const rotuloBranco = campo.obrigatorio ? 'Deixar em branco por enquanto' : 'Não se aplica';

  // Botões principais por estado. Valor vazio nunca ganha "Confirmar": vai direto de "Salvar".
  let principais: React.ReactNode;
  if (editing) {
    principais = (
      <>
        <Button variant="primary" size="lg" className={TAP} onClick={salvar} disabled={!canSave}>{`Salvar${sufixo}`}</Button>
        <Button variant="ghost" size="lg" className={TAP} onClick={editor.reset}>Cancelar</Button>
      </>
    );
  } else if (status === 'sugerido') {
    principais = (
      <>
        <Button variant="primary" size="lg" className={TAP} onClick={confirmar}>{`Confirmar${sufixo}`}</Button>
        <Button variant="secondary" size="lg" className={TAP} onClick={editar}>Editar</Button>
      </>
    );
  } else if (status === 'vazio') {
    principais = (
      <>
        <Button variant="primary" size="lg" className={TAP} onClick={salvar} disabled={!canSave}>{`Salvar${sufixo}`}</Button>
        <Button variant="ghost" size="lg" className={TAP} onClick={emBranco}>{rotuloBranco}</Button>
      </>
    );
  } else {
    principais = (
      <>
        {!par && <Button variant="primary" size="lg" className={TAP} onClick={onAvancar}>Avançar</Button>}
        <Button variant="secondary" size="lg" className={TAP} onClick={editar}>{status === 'aceito_vazio' ? 'Preencher' : 'Editar'}</Button>
        <Button variant="ghost" size="lg" className={TAP} onClick={desfazer}>{status === 'aceito_vazio' && temSugestao ? 'Ver sugestão' : 'Desfazer'}</Button>
      </>
    );
  }

  const corpo = editing ? (
    <FieldEditor campo={campo} editor={editor} testId={`wizard-editor-${campo.key}`} />
  ) : status === 'sugerido' ? (
    <div className="space-y-3">
      <FichaDisplay campo={campo} modo="sugerido" contexto={contexto} />
      <Fonte campo={campo} />
      <TextoOriginal campo={campo} />
      <Alternativas campo={campo} onUse={usarAlternativa} />
    </div>
  ) : status === 'vazio' ? (
    <div className="space-y-3">
      <p className="text-sm text-white/60 font-sans italic">{COPY_VAZIO}</p>
      <FieldEditor campo={campo} editor={editor} testId={`wizard-editor-${campo.key}`} />
    </div>
  ) : (
    <div className="space-y-3">
      {status !== 'aceito_vazio' && (
        <div className="rounded-lg border border-green-500/20 p-2 sm:p-3">
          <FichaDisplay campo={campo} modo="atual" contexto={contexto} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip status={status} />
        {status === 'confirmado' && campo.fonte && <span className="text-[11px] text-white/40 font-sans">Fonte: {campo.fonte}</span>}
        {status === 'aceito_vazio' && campo.obrigatorio && (
          <span className="text-[11px] text-prosperus-gold-light/80 font-sans">{COPY_EM_BRANCO}</span>
        )}
      </div>
    </div>
  );

  const contextoCampo = <ContextoCampo campo={campo} onRecarregar={onRecarregar} compacto={par} />;

  if (par) {
    return (
      <div className="space-y-3" data-testid={`wizard-campo-${campo.key}`}>
        {corpo}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">{principais}</div>
        {contextoCampo}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid={`wizard-campo-${campo.key}`}>
      {corpo}
      {contextoCampo}
      <BarraAcoes onVoltar={onVoltar} podeVoltar={podeVoltar} onPular={editing ? undefined : onAvancar} onPerguntas={onPerguntas}>{principais}</BarraAcoes>
    </div>
  );
};

/** Barra de ações fixa no rodapé (celular): principais em cima; Voltar, Perguntas e Pular embaixo. */
const BarraAcoes: React.FC<{
  children: React.ReactNode;
  onVoltar?: () => void;
  podeVoltar?: boolean;
  onPular?: () => void;
  onPerguntas?: () => void;
}> = ({ children, onVoltar, podeVoltar = true, onPular, onPerguntas }) => (
  <div className="sticky bottom-0 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0 pt-3 pb-3 bg-prosperus-navy-mid/95 backdrop-blur border-t border-white/10 space-y-2">
    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">{children}</div>
    <div className="flex items-center justify-between gap-2">
      <Button variant="link" size="md" className="min-h-[44px]" onClick={onVoltar} disabled={!podeVoltar}>Voltar</Button>
      {onPerguntas && (
        <Button variant="link" size="md" className="min-h-[44px] lg:hidden" onClick={onPerguntas}>Perguntas</Button>
      )}
      {onPular ? <Button variant="link" size="md" className="min-h-[44px]" onClick={onPular}>Pular por agora</Button> : <span />}
    </div>
  </div>
);

// ── o wizard ─────────────────────────────────────────────────────────────────

interface FichaWizardProps {
  ficha: UseScriptFicha;
  contexto: Record<string, ScriptFieldView>;
  onFecharFicha?: () => void;
  fechandoFicha?: boolean;
  /** Recarrega a ficha (flush + GET) depois de pedir uma nova sugestão com contexto. */
  onRecarregar?: () => Promise<void> | void;
}

function editavel(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"]');
}

export const FichaWizard: React.FC<FichaWizardProps> = ({ ficha, contexto, onFecharFicha, fechandoFicha = false, onRecarregar }) => {
  const { data, decide } = ficha;
  const blocos = data?.blocos || [];
  const passos = useMemo(() => montarPassos(blocos), [blocos]);

  // Abre no primeiro campo sem decisão da ficha inteira; tudo decidido abre no fim
  const [idx, setIdx] = useState(() => Math.max(0, passoInicial(passos)));
  const [dir, setDir] = useState(1);
  const [tela, setTela] = useState<Tela>(() => (passos.length && passoInicial(passos) < 0 ? { tipo: 'fim' } : { tipo: 'passo' }));
  const [sheet, setSheet] = useState(false);
  const editingRef = useRef(false);
  const sheetRef = useRef(false);
  sheetRef.current = sheet;
  const acoesRef = useRef<{ proximo: () => void; voltar: () => void }>({ proximo: () => {}, voltar: () => {} });
  const fecharSheet = useCallback(() => setSheet(false), []);

  // Setas do teclado (desktop): esquerda volta, direita avança. Não mexe quando o foco está num campo de texto.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (editavel(e.target) || editingRef.current || sheetRef.current) return;
      if (typeof window.matchMedia === 'function' && !window.matchMedia('(min-width: 1024px)').matches) return;
      e.preventDefault();
      if (e.key === 'ArrowRight') acoesRef.current.proximo(); else acoesRef.current.voltar();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!data || !passos.length) return null;

  const i = Math.min(idx, passos.length - 1);
  const passo = passos[i];
  const bloco = blocos.find((b) => b.numero === passo.bloco) || blocos[0];
  const { progresso } = data;
  const isConfirmed = data.ficha_status === 'confirmada';
  const allRequiredDone = progresso.obrigatorios_decididos >= progresso.obrigatorios;

  const irPara = (n: number, d: number) => {
    setDir(d);
    setIdx(Math.max(0, Math.min(n, passos.length - 1)));
    setTela({ tipo: 'passo' });
  };

  const avancar = () => {
    if (i >= passos.length - 1) { setTela({ tipo: 'fim' }); return; }
    const prox = passos[i + 1];
    if (prox.bloco !== passo.bloco) { setTela({ tipo: 'bloco', de: passo.bloco, para: prox.bloco }); return; }
    irPara(i + 1, 1);
  };

  const voltar = () => {
    if (tela.tipo !== 'passo') { setTela({ tipo: 'passo' }); return; }
    if (i > 0) irPara(i - 1, -1);
  };

  const continuar = () => { if (i < passos.length - 1) irPara(i + 1, 1); };

  const proximo = () => {
    if (tela.tipo === 'passo') avancar();
    else if (tela.tipo === 'bloco') continuar();
  };
  acoesRef.current = { proximo, voltar };

  const irParaPasso = (j: number) => irPara(j, j >= i ? 1 : -1);

  const irParaBloco = (n: number) => {
    const a = passos.findIndex((p) => p.bloco === n && pendente(p));
    const j = a >= 0 ? a : passos.findIndex((p) => p.bloco === n);
    if (j >= 0) irParaPasso(j);
  };

  const irParaObrigatorioPendente = () => {
    const j = passos.findIndex((p) => p.campos.some((c) => c.obrigatorio && !c.decidido));
    if (j >= 0) irParaPasso(j);
  };

  /** Próxima pergunta sem decisão depois da atual (dá a volta); sem nenhuma, vai ao fim. */
  const proximaPendente = () => {
    const n = passos.length;
    for (let k = 1; k <= n; k++) {
      const j = (i + k) % n;
      if (pendente(passos[j])) { irPara(j, j > i ? 1 : -1); return; }
    }
    setTela({ tipo: 'fim' });
  };

  // Posicao dentro do bloco: "Campo 3 de 9" (o par conta as duas chaves)
  const camposDoBloco = bloco.campos;
  const pos = camposDoBloco.findIndex((c) => c.key === passo.campos[0].key) + 1;
  const posLabel = passo.campos.length > 1 ? `Campos ${pos} e ${pos + 1} de ${camposDoBloco.length}` : `Campo ${pos} de ${camposDoBloco.length}`;
  const pct = progresso.total ? Math.round((progresso.decididos / progresso.total) * 100) : 0;

  const cabecalho = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-prosperus-gold-dark bg-prosperus-gold-dark/10 px-3 py-1 rounded-full font-sans">
          Bloco {bloco.numero} de {blocos.length} · {bloco.nome}
        </span>
        <span className="text-xs text-white/50 font-sans" aria-live="polite" aria-atomic="true" data-testid="wizard-posicao">
          {tela.tipo === 'passo' ? posLabel : ''}
        </span>
      </div>
      <PilulasBlocos blocos={blocos} atual={tela.tipo === 'passo' ? passo.bloco : null} onIr={irParaBloco} />
      {BLOCK_INTRO[bloco.numero] && <p className="text-sm text-white/60 font-serif italic">{BLOCK_INTRO[bloco.numero]}</p>}
      <div className="space-y-1">
        <div className="w-full bg-white/10 rounded-full h-1" role="progressbar" aria-valuemin={0} aria-valuemax={progresso.total} aria-valuenow={progresso.decididos} aria-label="Campos decididos">
          <div className="h-full bg-gradient-to-r from-prosperus-gold-dark to-prosperus-gold-light rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-white/40 font-sans">{progresso.decididos} de {progresso.total} decididos · {progresso.obrigatorios_decididos} de {progresso.obrigatorios} obrigatórios</p>
      </div>
    </div>
  );

  const badge = (c: ScriptFieldView) => (c.obrigatorio
    ? <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-light font-sans">obrigatório</span>
    : <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-sans">opcional</span>);

  const abrirPerguntas = () => setSheet(true);
  const marcarEditing = (v: boolean) => { editingRef.current = v; };

  const renderPasso = () => {
    if (passo.campos.length === 1) {
      const c = passo.campos[0];
      return (
        <div className="space-y-4" data-testid={`wizard-step-${c.key}`}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-sans text-xs text-prosperus-gold-dark font-bold">{c.key} · {c.nome}</span>
              {badge(c)}
              {campoRefinando(c as { refinando?: boolean }) && <BadgeRefinando />}
            </div>
            <h3 className="font-serif text-xl sm:text-2xl text-white leading-snug" data-testid="wizard-title">{c.pergunta}</h3>
          </div>
          <CampoPasso
            key={c.key}
            campo={c}
            contexto={contexto}
            decide={decide}
            onAvancar={avancar}
            onVoltar={voltar}
            podeVoltar={i > 0}
            onPerguntas={abrirPerguntas}
            onRecarregar={onRecarregar}
            onEditingChange={marcarEditing}
          />
        </div>
      );
    }
    const sugeridos = passo.campos.filter((c) => statusDaTela(c) === 'sugerido');
    const confirmarTodos = () => { sugeridos.forEach((c) => decide(c.key, { status: 'confirmado' })); avancar(); };
    const algumRefinando = passo.campos.some((c) => campoRefinando(c as { refinando?: boolean }));
    return (
      <div className="space-y-4" data-testid={`wizard-step-${passo.id}`}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-sans text-xs text-prosperus-gold-dark font-bold">{passo.campos.map((c) => c.key).join(' e ')}</span>
            {badge(passo.campos[0])}
            {algumRefinando && <BadgeRefinando />}
          </div>
          <h3 className="font-serif text-xl sm:text-2xl text-white leading-snug" data-testid="wizard-title">Daqui a 1 ano: sem resolver e resolvido</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {passo.campos.map((c) => (
            <div key={c.key} className="rounded-lg border border-prosperus-gold-dark/25 bg-prosperus-gold-dark/[0.03] p-3 space-y-2 min-w-0">
              <span className="block text-[11px] uppercase tracking-wide text-prosperus-gold-light font-sans">{c.template?.rotulo || c.nome}</span>
              <p className="text-sm text-white/70 font-sans">{c.pergunta}</p>
              <CampoPasso key={c.key} campo={c} contexto={contexto} decide={decide} par onRecarregar={onRecarregar} onEditingChange={marcarEditing} />
            </div>
          ))}
        </div>
        <BarraAcoes onVoltar={voltar} podeVoltar={i > 0} onPular={avancar} onPerguntas={abrirPerguntas}>
          {sugeridos.length > 0
            ? <Button variant="primary" size="lg" className={TAP} onClick={confirmarTodos}>{sugeridos.length === 2 ? 'Confirmar os dois e avançar' : 'Confirmar e avançar'}</Button>
            : <Button variant="primary" size="lg" className={TAP} onClick={avancar}>Avançar</Button>}
        </BarraAcoes>
      </div>
    );
  };

  /** Fechamento de bloco: papel creme, sóbrio. Nome, "x de y decididos", prévia do script, um fio dourado, o próximo bloco. */
  const renderBloco = (t: Extract<Tela, { tipo: 'bloco' }>) => {
    const de = blocos.find((b) => b.numero === t.de);
    const para = blocos.find((b) => b.numero === t.para);
    if (!de || !para) return null;
    const faltamObrig = de.obrigatorios - de.obrigatorios_decididos;
    const previa = PREVIA_SCRIPT[de.numero];
    return (
      <div className="rounded-lg bg-prosperus-neutral-white text-prosperus-navy p-5 sm:p-8 space-y-5" data-testid="wizard-interstitial">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Bloco {de.numero} · {de.nome}</p>
          <h3 className="font-serif text-2xl sm:text-3xl text-prosperus-navy leading-tight">
            {de.fechado ? `Bloco ${de.nome} fechado.` : `Bloco ${de.nome}: por enquanto é isso.`}
          </h3>
          <p className="text-sm text-prosperus-navy/70 font-sans">
            {de.decididos} de {de.total} decididos
            {faltamObrig > 0 ? ` · ${faltamObrig} obrigatórios em aberto, dá para voltar quando quiser` : ''}
          </p>
        </div>
        {previa && (
          <p className="text-sm text-prosperus-navy/85 font-serif italic leading-relaxed" data-testid="wizard-previa">
            <span className="not-italic font-sans text-[11px] uppercase tracking-widest text-prosperus-gold-dark mr-2">Prévia do seu script</span>
            {previa}
          </p>
        )}
        <hr className="border-0 h-px bg-prosperus-gold-dark" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Próximo</p>
          <p className="font-serif text-xl text-prosperus-navy">{para.numero}. {para.nome}</p>
          {BLOCK_INTRO[para.numero] && <p className="text-sm text-prosperus-navy/70 font-serif italic">{BLOCK_INTRO[para.numero]}</p>}
          <p className="text-xs text-prosperus-navy/50 font-sans">{para.total} campos · {para.obrigatorios} obrigatórios</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="primary" size="lg" className={TAP} onClick={continuar}>Continuar</Button>
          <Button variant="outline" size="lg" className={`${TAP} !border-prosperus-navy/30 !text-prosperus-navy hover:!bg-prosperus-navy/5`} onClick={voltar}>Voltar</Button>
        </div>
      </div>
    );
  };

  /** Fim da ficha: quantos campos faltam para o script e o mapa dos blocos. */
  const renderFim = () => {
    const faltamObrig = progresso.obrigatorios - progresso.obrigatorios_decididos;
    const faltamTotal = progresso.total - progresso.decididos;
    const titulo = faltamObrig > 0
      ? (faltamObrig === 1 ? 'Falta 1 campo para o seu script' : `Faltam ${faltamObrig} campos para o seu script`)
      : faltamTotal > 0 ? 'Os obrigatórios estão decididos' : 'Você decidiu tudo';
    return (
      <div className="space-y-5 py-2" data-testid="wizard-fim">
        <div className="text-center space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Fim da ficha</p>
          <h3 className="font-serif text-2xl sm:text-3xl text-white" data-testid="wizard-faltam">{titulo}</h3>
          <p className="text-sm text-white/70 font-sans">
            {progresso.obrigatorios_decididos} de {progresso.obrigatorios} obrigatórios decididos
            <span className="text-white/40"> · {progresso.decididos} de {progresso.total} no total</span>
          </p>
          {faltamObrig === 0 && faltamTotal > 0 && (
            <p className="text-xs text-white/50 font-sans">{faltamTotal} opcionais em aberto. Dá para fechar assim e completar depois.</p>
          )}
          {isConfirmed && <p className="text-xs text-green-400 font-sans">Ficha fechada. Se editar algum campo, ela reabre e o script é refeito.</p>}
        </div>
        <MapaBlocos blocos={blocos} onIr={irParaBloco} />
        <div className="flex flex-col sm:flex-row sm:justify-center gap-2">
          {faltamObrig > 0 && <Button variant="secondary" size="lg" className={TAP} onClick={irParaObrigatorioPendente}>Ver o que falta</Button>}
          {allRequiredDone && onFecharFicha && (
            <Button variant="primary" size="lg" className={TAP} onClick={onFecharFicha} disabled={isConfirmed} loading={fechandoFicha}>
              {isConfirmed ? 'Ficha fechada' : 'Fechar ficha'}
            </Button>
          )}
          <Button variant="ghost" size="lg" className={TAP} onClick={voltar}>Voltar</Button>
        </div>
      </div>
    );
  };

  const chave = tela.tipo === 'passo' ? passo.id : tela.tipo === 'bloco' ? `bloco-${tela.de}-${tela.para}` : 'fim';
  const emPasso = tela.tipo === 'passo';

  return (
    <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-4 sm:p-6 shadow-2xl overflow-x-clip" data-testid="ficha-wizard">
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
        <NavegadorLateral
          blocos={blocos}
          passos={passos}
          atual={emPasso ? i : -1}
          blocoAtual={emPasso ? passo.bloco : null}
          onIr={irParaPasso}
          onIrBloco={irParaBloco}
          onProximaPendente={proximaPendente}
        />
        <div className="space-y-5 min-w-0">
          {cabecalho}
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={chave}
              custom={dir}
              variants={emPasso ? slide : fade}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: emPasso ? 0.2 : 0.3, ease: 'easeInOut' }}
            >
              {tela.tipo === 'passo' ? renderPasso() : tela.tipo === 'bloco' ? renderBloco(tela) : renderFim()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <NavegadorSheet
        aberto={sheet}
        onFechar={fecharSheet}
        bloco={bloco}
        totalBlocos={blocos.length}
        passos={passos}
        atual={emPasso ? i : -1}
        onIr={irParaPasso}
      />
    </div>
  );
};
