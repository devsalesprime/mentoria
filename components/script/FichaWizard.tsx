/**
 * FichaWizard: a Ficha do Script passo a passo, no jeito dos módulos antigos: uma pergunta por tela,
 * título grande, a sugestão no visual do widget (pódio, VS, cartões, escada...), botão grande
 * "Confirmar e avançar", barra de progresso e um mapa dos 6 blocos para pular.
 * Salva pelo mesmo `decide` do hook (fila com debounce).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { UseScriptFicha } from '../../hooks/useScriptFicha';
import type { ScriptBlockView, ScriptFieldView, ScriptHoje } from '../../data/script-ficha-fields';
import { SCRIPT_DAYS } from '../../data/script-ficha-fields';
import { Button } from '../ui/Button';
import { CelebrationOverlay } from '../shared/CelebrationOverlay';
import { FieldEditor, useFieldEditor } from './widgets/editor';
import { FichaDisplay, Fonte, TextoOriginal } from './widgets/FichaDisplay';
import { Alternativas, StatusChip } from './FichaField';

export const BLOCK_ICONS: Record<number, string> = { 1: '🎯', 2: '👤', 3: '🧭', 4: '🧩', 5: '📦', 6: '🤝' };

// Uma frase por M (5 M's) para situar o bloco antes das perguntas
export const BLOCK_INTRO: Record<number, string> = {
  1: 'Meta: onde você quer chegar, com número e prazo.',
  2: 'Mentor: quem você é e o que te legitima a cobrar caro.',
  3: 'Mentorado: para quem, com dor, desejo, setor, bolso e território.',
  4: 'Método: como você leva o cliente de A para B.',
  5: 'A Mentoria: o que vai ao mercado como oferta.',
  6: 'Venda: como a venda acontece hoje.',
};

/** Uma tela do passo a passo: um campo, ou o par antes × depois (3.5 e 3.6). */
export interface Passo {
  id: string;
  bloco: number;
  campos: ScriptFieldView[];
}

type Tela =
  | { tipo: 'passo' }
  | { tipo: 'bloco'; de: number; para: number }
  | { tipo: 'dia'; dia: number; titulo: string; blocos: number[]; proximo: number | null };

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

const pendente = (p: Passo) => p.campos.some((c) => !c.decidido);

/** Primeiro campo sem decisão dos blocos abertos de hoje; senão o primeiro pendente; senão o primeiro. */
export function passoInicial(passos: Passo[], hoje: ScriptHoje | null | undefined): number {
  const abertos = hoje?.blocos_abertos || [];
  let i = abertos.length ? passos.findIndex((p) => abertos.includes(p.bloco) && pendente(p)) : -1;
  if (i < 0) i = passos.findIndex(pendente);
  return i < 0 ? 0 : i;
}

function diaDoBloco(n: number) {
  return SCRIPT_DAYS.find((d) => d.blocos.includes(n));
}

const variants = {
  enter: (d: number) => ({ x: d > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -60 : 60, opacity: 0 }),
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
}

const CampoPasso: React.FC<CampoPassoProps> = ({ campo, contexto, decide, par = false, onAvancar, onVoltar, podeVoltar = true }) => {
  const editor = useFieldEditor(campo, contexto);
  const { editing, canSave } = editor;
  const status = campo.status;
  const temSugestao = !!campo.sugerido.trim();
  const avancar = () => { if (!par) onAvancar?.(); };

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

  // Botões principais por estado
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
      <p className="text-sm text-white/60 font-sans italic">Não encontramos, você preenche.</p>
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
          <span className="text-[11px] text-prosperus-gold-light/80 font-sans">No script vai como "a definir com a gente na mentoria".</span>
        )}
      </div>
    </div>
  );

  if (par) {
    return (
      <div className="space-y-3" data-testid={`wizard-campo-${campo.key}`}>
        {corpo}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">{principais}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid={`wizard-campo-${campo.key}`}>
      {corpo}
      <BarraAcoes onVoltar={onVoltar} podeVoltar={podeVoltar} onPular={editing ? undefined : onAvancar}>{principais}</BarraAcoes>
    </div>
  );
};

/** Barra de ações fixa no rodapé (celular): principais em cima, Voltar e Pular embaixo. */
const BarraAcoes: React.FC<{ children: React.ReactNode; onVoltar?: () => void; podeVoltar?: boolean; onPular?: () => void }> = ({ children, onVoltar, podeVoltar = true, onPular }) => (
  <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-3 bg-prosperus-navy-mid/95 backdrop-blur border-t border-white/10 space-y-2">
    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">{children}</div>
    <div className="flex items-center justify-between gap-2">
      <Button variant="link" size="md" className="min-h-[44px]" onClick={onVoltar} disabled={!podeVoltar}>Voltar</Button>
      {onPular && <Button variant="link" size="md" className="min-h-[44px]" onClick={onPular}>Pular por agora</Button>}
    </div>
  </div>
);

// ── o wizard ─────────────────────────────────────────────────────────────────

interface FichaWizardProps {
  ficha: UseScriptFicha;
  contexto: Record<string, ScriptFieldView>;
  onFecharFicha?: () => void;
  fechandoFicha?: boolean;
}

export const FichaWizard: React.FC<FichaWizardProps> = ({ ficha, contexto, onFecharFicha, fechandoFicha = false }) => {
  const { data, decide } = ficha;
  const blocos = data?.blocos || [];
  const passos = useMemo(() => montarPassos(blocos), [blocos]);

  const [idx, setIdx] = useState(() => passoInicial(passos, data?.hoje));
  const [dir, setDir] = useState(1);
  const [tela, setTela] = useState<Tela>(() => {
    if (!data?.hoje.em_breve) return { tipo: 'passo' };
    const ultimo = [...SCRIPT_DAYS].reverse().find((d) => d.blocos.length);
    return ultimo ? { tipo: 'dia', dia: ultimo.dia, titulo: ultimo.titulo, blocos: ultimo.blocos, proximo: null } : { tipo: 'passo' };
  });
  const noop = useCallback(() => {}, []);

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

  const telaDia = (deBloco: number, proximo: number | null): Tela => {
    const d = diaDoBloco(deBloco);
    return d ? { tipo: 'dia', dia: d.dia, titulo: d.titulo, blocos: d.blocos, proximo } : { tipo: 'bloco', de: deBloco, para: proximo ?? deBloco };
  };

  const avancar = () => {
    if (i >= passos.length - 1) { setTela(telaDia(passo.bloco, null)); return; }
    const prox = passos[i + 1];
    if (prox.bloco !== passo.bloco) {
      const dAtual = diaDoBloco(passo.bloco);
      const dProx = diaDoBloco(prox.bloco);
      if (dAtual && dProx && dAtual.dia !== dProx.dia) setTela(telaDia(passo.bloco, prox.bloco));
      else setTela({ tipo: 'bloco', de: passo.bloco, para: prox.bloco });
      return;
    }
    irPara(i + 1, 1);
  };

  const voltar = () => {
    if (tela.tipo !== 'passo') { setTela({ tipo: 'passo' }); return; }
    if (i > 0) irPara(i - 1, -1);
  };

  const continuar = () => { if (i < passos.length - 1) irPara(i + 1, 1); };

  const irParaBloco = (n: number) => {
    const a = passos.findIndex((p) => p.bloco === n && pendente(p));
    const j = a >= 0 ? a : passos.findIndex((p) => p.bloco === n);
    if (j >= 0) irPara(j, j >= i ? 1 : -1);
  };

  const irParaObrigatorioPendente = (dentro?: number[]) => {
    const j = passos.findIndex((p) => (!dentro || dentro.includes(p.bloco)) && p.campos.some((c) => c.obrigatorio && !c.decidido));
    if (j >= 0) irPara(j, j >= i ? 1 : -1);
  };

  // Posicao dentro do bloco: "Campo 3 de 9" (o par conta as duas chaves)
  const camposDoBloco = bloco.campos;
  const pos = camposDoBloco.findIndex((c) => c.key === passo.campos[0].key) + 1;
  const posLabel = passo.campos.length > 1 ? `Campos ${pos} e ${pos + 1} de ${camposDoBloco.length}` : `Campo ${pos} de ${camposDoBloco.length}`;
  const pct = progresso.total ? Math.round((progresso.decididos / progresso.total) * 100) : 0;

  const mapa = (
    <nav aria-label="Blocos da ficha" className="grid grid-cols-6 gap-1.5">
      {blocos.map((b) => {
        const atual = b.numero === passo.bloco && tela.tipo === 'passo';
        const hojeTem = data.hoje.blocos.includes(b.numero);
        return (
          <button
            key={b.numero}
            type="button"
            onClick={() => irParaBloco(b.numero)}
            aria-current={atual ? 'step' : undefined}
            aria-label={`Bloco ${b.numero}: ${b.nome}, ${b.decididos} de ${b.total} decididos`}
            title={`${b.numero}. ${b.nome}`}
            data-testid={`bloco-pill-${b.numero}`}
            className={`min-h-[44px] rounded-lg border flex flex-col items-center justify-center gap-0.5 px-1 transition ${
              atual
                ? 'bg-prosperus-gold-dark/15 border-prosperus-gold-dark text-white'
                : b.fechado
                ? 'bg-green-500/5 border-green-500/30 text-white/80 hover:border-green-500/60'
                : hojeTem
                ? 'bg-white/[0.03] border-white/20 text-white/70 hover:border-prosperus-gold-dark/60'
                : 'bg-transparent border-white/10 text-white/40 hover:border-white/30'
            }`}
          >
            <span className="text-sm leading-none" aria-hidden="true">{b.fechado ? '✓' : BLOCK_ICONS[b.numero] || b.numero}</span>
            <span className="text-[10px] font-sans leading-none">{b.decididos}/{b.total}</span>
          </button>
        );
      })}
    </nav>
  );

  const cabecalho = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-prosperus-gold-dark bg-prosperus-gold-dark/10 px-3 py-1 rounded-full font-sans">
          <span aria-hidden="true">{BLOCK_ICONS[bloco.numero] || ''} </span>Bloco {bloco.numero} de {blocos.length} · {bloco.nome}
        </span>
        <span className="text-xs text-white/50 font-sans" aria-live="polite" aria-atomic="true" data-testid="wizard-posicao">
          {tela.tipo === 'passo' ? posLabel : ''}
        </span>
      </div>
      {mapa}
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

  const renderPasso = () => {
    if (passo.campos.length === 1) {
      const c = passo.campos[0];
      return (
        <div className="space-y-4" data-testid={`wizard-step-${c.key}`}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-sans text-xs text-prosperus-gold-dark font-bold">{c.key} · {c.nome}</span>
              {badge(c)}
            </div>
            <h3 className="font-serif text-xl sm:text-2xl text-white leading-snug" data-testid="wizard-title">{c.pergunta}</h3>
          </div>
          <CampoPasso key={c.key} campo={c} contexto={contexto} decide={decide} onAvancar={avancar} onVoltar={voltar} podeVoltar={i > 0} />
        </div>
      );
    }
    const sugeridos = passo.campos.filter((c) => c.status === 'sugerido');
    const confirmarTodos = () => { sugeridos.forEach((c) => decide(c.key, { status: 'confirmado' })); avancar(); };
    return (
      <div className="space-y-4" data-testid={`wizard-step-${passo.id}`}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-sans text-xs text-prosperus-gold-dark font-bold">{passo.campos.map((c) => c.key).join(' e ')}</span>
            {badge(passo.campos[0])}
          </div>
          <h3 className="font-serif text-xl sm:text-2xl text-white leading-snug" data-testid="wizard-title">Daqui a 1 ano: sem resolver e resolvido</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {passo.campos.map((c) => (
            <div key={c.key} className="rounded-lg border border-prosperus-gold-dark/25 bg-prosperus-gold-dark/[0.03] p-3 space-y-2 min-w-0">
              <span className="block text-[11px] uppercase tracking-wide text-prosperus-gold-light font-sans">{c.template?.rotulo || c.nome}</span>
              <p className="text-sm text-white/70 font-sans">{c.pergunta}</p>
              <CampoPasso key={c.key} campo={c} contexto={contexto} decide={decide} par />
            </div>
          ))}
        </div>
        <BarraAcoes onVoltar={voltar} podeVoltar={i > 0} onPular={avancar}>
          {sugeridos.length > 0
            ? <Button variant="primary" size="lg" className={TAP} onClick={confirmarTodos}>{sugeridos.length === 2 ? 'Confirmar os dois e avançar' : 'Confirmar e avançar'}</Button>
            : <Button variant="primary" size="lg" className={TAP} onClick={avancar}>Avançar</Button>}
        </BarraAcoes>
      </div>
    );
  };

  const renderBloco = (t: Extract<Tela, { tipo: 'bloco' }>) => {
    const de = blocos.find((b) => b.numero === t.de);
    const para = blocos.find((b) => b.numero === t.para);
    if (!de || !para) return null;
    return (
      <div className="space-y-5 py-2" data-testid="wizard-interstitial">
        <div className="text-center space-y-1">
          {de.fechado
            ? <CelebrationOverlay variant="step" message={`Bloco ${de.nome} fechado.`} duration={1500} onComplete={noop} />
            : <p className="text-white/70 italic font-serif text-lg py-6">Bloco {de.nome}: por enquanto é isso.</p>}
          <p className="font-serif text-2xl text-white">{de.decididos} de {de.total} decididos</p>
          {de.obrigatorios_decididos < de.obrigatorios && (
            <p className="text-xs text-white/50 font-sans">{de.obrigatorios - de.obrigatorios_decididos} obrigatórios ainda sem decisão neste bloco. Dá para voltar quando quiser.</p>
          )}
        </div>
        <div className="rounded-lg border border-prosperus-gold-dark/30 bg-prosperus-gold-dark/5 p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Próximo</p>
          <p className="font-serif text-xl text-white"><span aria-hidden="true">{BLOCK_ICONS[para.numero] || ''} </span>{para.numero}. {para.nome}</p>
          {BLOCK_INTRO[para.numero] && <p className="text-sm text-white/60 font-serif italic">{BLOCK_INTRO[para.numero]}</p>}
          <p className="text-xs text-white/40 font-sans">{para.total} campos · {para.obrigatorios} obrigatórios</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="primary" size="lg" className={TAP} onClick={continuar}>Continuar</Button>
          <Button variant="ghost" size="lg" className={TAP} onClick={voltar}>Voltar</Button>
        </div>
      </div>
    );
  };

  const renderDia = (t: Extract<Tela, { tipo: 'dia' }>) => {
    const doDia = blocos.filter((b) => t.blocos.includes(b.numero));
    const campos = doDia.flatMap((b) => b.campos);
    const obrig = campos.filter((c) => c.obrigatorio);
    const obrigOk = obrig.filter((c) => c.decidido).length;
    const faltamHoje = obrig.length - obrigOk;
    const faltamTotal = progresso.obrigatorios - progresso.obrigatorios_decididos;
    return (
      <div className="space-y-5 py-2 text-center" data-testid="wizard-fim">
        {faltamHoje === 0
          ? <CelebrationOverlay variant="step" message={t.proximo == null ? 'Você decidiu tudo.' : 'Hoje terminou.'} duration={1500} onComplete={noop} />
          : <p className="text-white/70 italic font-serif text-lg py-6">Você passou por todos os campos de hoje.</p>}
        <div className="space-y-1">
          <h3 className="font-serif text-2xl text-white">Dia {t.dia}: {t.titulo}</h3>
          <p className="text-sm text-white/70 font-sans">
            {obrigOk} de {obrig.length} obrigatórios decididos
            <span className="text-white/40"> · {campos.filter((c) => c.decidido).length} de {campos.length} no total</span>
          </p>
          {faltamHoje > 0 && <p className="text-xs text-prosperus-gold-light/80 font-sans">Ainda faltam {faltamHoje} obrigatórios de hoje.</p>}
          {isConfirmed && <p className="text-xs text-green-400 font-sans">Ficha fechada. Se editar algum campo, ela reabre e o script é refeito.</p>}
          {!isConfirmed && !allRequiredDone && faltamHoje === 0 && faltamTotal > 0 && (
            <p className="text-xs text-white/50 font-sans">Para fechar a ficha faltam {faltamTotal} obrigatórios nos outros blocos.</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-center gap-2">
          {faltamHoje > 0 && <Button variant="secondary" size="lg" className={TAP} onClick={() => irParaObrigatorioPendente(t.blocos)}>Ver o que falta</Button>}
          {allRequiredDone && onFecharFicha && (
            <Button variant="primary" size="lg" className={TAP} onClick={onFecharFicha} disabled={isConfirmed} loading={fechandoFicha}>
              {isConfirmed ? 'Ficha fechada' : 'Fechar ficha'}
            </Button>
          )}
          {!allRequiredDone && faltamHoje === 0 && faltamTotal > 0 && (
            <Button variant="secondary" size="lg" className={TAP} onClick={() => irParaObrigatorioPendente()}>Ver o que falta</Button>
          )}
          {t.proximo != null && (
            <Button variant={allRequiredDone || faltamHoje > 0 ? 'ghost' : 'primary'} size="lg" className={TAP} onClick={continuar}>Continuar para o bloco {t.proximo}</Button>
          )}
          <Button variant="ghost" size="lg" className={TAP} onClick={voltar}>Voltar</Button>
        </div>
      </div>
    );
  };

  const chave = tela.tipo === 'passo' ? passo.id : tela.tipo === 'bloco' ? `bloco-${tela.de}-${tela.para}` : `dia-${tela.dia}`;

  return (
    <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-4 sm:p-6 shadow-2xl space-y-5 overflow-x-clip" data-testid="ficha-wizard">
      {cabecalho}
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={chave}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          {tela.tipo === 'passo' ? renderPasso() : tela.tipo === 'bloco' ? renderBloco(tela) : renderDia(tela)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
