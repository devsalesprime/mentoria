/**
 * FichaWizard: a Ficha do Script passo a passo. Cada pergunta é UMA tela, lida de cima para baixo:
 * (a) chip do bloco + número da pergunta · (b) a PERGUNTA em serifa grande · (c) por que isso importa
 * no script · (d) a resposta: o visual do widget com a sugestão dentro ("Sugestão encontrada" e a
 * fonte discreta) ou o editor com o convite · (e) a linha "no seu script" em itálico · (f) o contexto ·
 * (g) a barra de ações fixa com UM botão dourado, "Confirmar e avançar" (ou "Salvar e avançar" ao
 * editar). Ao confirmar, o valor recolhe numa linha verde-dourada por 400 ms e a próxima pergunta
 * desliza (200 ms). Um cartão, largura máxima de 720 px, sem caixa dentro de caixa. Um navegador só,
 * hierárquico (blocos > perguntas): coluna esquerda no desktop, folha "Perguntas" no celular.
 * Salva pelo mesmo `decide` do hook (fila com debounce).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { UseScriptFicha } from '../../hooks/useScriptFicha';
import type { ScriptBlockView, ScriptFieldView } from '../../data/script-ficha-fields';
import { campoRefinando, sugestaoVazia } from '../../hooks/useContextoCampo';
import { Button } from '../ui/Button';
import { FieldEditor, useFieldEditor } from './widgets/editor';
import { FichaDisplay, Fonte, TextoOriginal, textoDoModo } from './widgets/FichaDisplay';
import { NumberTicker } from './widgets/NumberTicker';
import { COPY_SCRIPT_PRONTO, COPY_TUDO_DECIDIDO, META_SCRIPT, faltamParaScript, fraseDosPassos, passosDoBloco } from './widgets/previa';
import { COPY_PREVIA_SCRIPT, PreviaCampo, PreviaCapitulos, PreviaMeta, PreviaPasso } from './widgets/PreviaScript';
import {
  Alternativas, BadgeObrigatorio, COPY_EM_BRANCO, COPY_VAZIO, PorQueImporta, StatusChip, SugestaoEncontrada, statusDaTela,
} from './FichaField';
import { BadgeRefinando, ContextoCampo } from './contexto/ContextoCampo';
import { IconeCheck } from './contexto/icones';
import {
  BLOCK_INTRO, NavegadorLateral, NavegadorSheet, PREVIA_SCRIPT, pendenteNav, useBlocosAbertos, type PassoNav,
} from './FichaNavegador';

export { BLOCK_INTRO, PREVIA_SCRIPT } from './FichaNavegador';

/** Uma tela do passo a passo: um campo, ou o par antes × depois (3.5 e 3.6). */
export type Passo = PassoNav;

type Tela =
  | { tipo: 'passo' }
  | { tipo: 'bloco'; de: number; para: number }
  | { tipo: 'fim' }
  /** A prévia do script inteira: capítulos revelados em creme, trancados só com o nome. */
  | { tipo: 'previa' };

/** Link para a prévia (fim da ficha e navegador). */
export const COPY_VER_PREVIA = 'Ver a prévia do script';

/**
 * Modo "completar o que falta" (suficiência parcial): só os campos em `keys` entram no fluxo; `pendentes` são os que
 * ainda precisam da resposta do mentor (um campo já decidido mas sinalizado conta até ele mexer). Os demais campos
 * ficam recolhidos em "Preenchido pelos seus materiais" no navegador, editáveis sob demanda.
 */
export interface FocoWizard {
  keys: string[];
  pendentes: string[];
}

/** "Faltam N respostas suas para o seu script" (modo completar). */
export function textoFaltamRespostas(n: number): string {
  if (n <= 0) return 'Suas respostas estão completas';
  return n === 1 ? 'Falta 1 resposta sua para o seu script' : `Faltam ${n} respostas suas para o seu script`;
}

/** Tempo do estado "Confirmado" (o valor recolhido numa linha) antes da próxima pergunta entrar. */
export const CONFIRMADO_MS = 400;
/** Duração do deslize entre perguntas. */
export const SLIDE_S = 0.2;

const PRIMARIO = 'w-full min-h-[48px] text-base';
const SECUNDARIO = 'min-h-[44px] px-3';

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
  enter: (d: number) => ({ x: d > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -48 : 48, opacity: 0 }),
};

// Interstício e fim: só um fade
const fade = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

/** "faltam 12 para o seu script" com o contador que roda; em 0, "tudo decidido para o seu script". */
export const ContadorFaltam: React.FC<{ n: number; className?: string; testId?: string }> = ({ n, className = '', testId = 'contador-faltam' }) => (
  <p className={`font-sans ${className}`} data-testid={testId} aria-live="polite">
    {n <= 0 ? (
      <span className="text-prosperus-gold-light">{COPY_TUDO_DECIDIDO}</span>
    ) : (
      <>
        {n === 1 ? 'falta ' : 'faltam '}
        <NumberTicker value={n} className="font-serif text-lg text-prosperus-gold-light" testId={`${testId}-n`} />
        {' para o seu script'}
      </>
    )}
  </p>
);

// ── confirmação: o valor recolhido numa linha ────────────────────────────────

interface Feito {
  status: 'confirmado' | 'editado';
  texto: string;
}

function resumo(texto: string, max = 100): string {
  const t = (texto || '').split('\n').map((l) => l.trim()).filter(Boolean).join(' · ');
  return t.length > max ? `${t.slice(0, max).trimEnd()}...` : t;
}

/** Linha compacta verde-dourada: "Confirmado · valor" (ou "Salvo"), 400 ms antes da próxima pergunta. */
export const ResumoConfirmado: React.FC<{ feito: Feito }> = ({ feito }) => (
  <motion.div
    initial={{ opacity: 0.4, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2 }}
    role="status"
    data-testid="resumo-confirmado"
    className="flex items-center gap-3 rounded-lg border border-green-400/40 bg-gradient-to-r from-green-500/10 to-prosperus-gold-dark/10 px-4 py-3 min-h-[48px]"
  >
    <span className="text-green-400 shrink-0" aria-hidden="true"><IconeCheck /></span>
    <span className="text-sm font-sans font-semibold text-green-400 shrink-0">{feito.status === 'editado' ? 'Salvo' : 'Confirmado'}</span>
    {feito.texto && <span className="font-serif text-base text-white/85 truncate">{resumo(feito.texto)}</span>}
  </motion.div>
);

/** O botão principal depois de confirmar: mesmo lugar, mesmo tamanho, agora verde. */
const PrincipalFeito: React.FC<{ feito: Feito }> = ({ feito }) => (
  <div className={`${PRIMARIO} rounded-lg bg-green-500/15 border border-green-400/40 text-green-400 font-sans font-bold inline-flex items-center justify-center gap-2`} role="status" data-testid="principal-feito">
    <IconeCheck />{feito.status === 'editado' ? 'Salvo' : 'Confirmado'}
  </div>
);

/** Ação secundária: botão de texto, nunca competindo com o principal. */
const Sec: React.FC<React.ComponentProps<typeof Button>> = ({ className = '', ...p }) => (
  <Button variant="link" size="md" className={`${SECUNDARIO} ${className}`} {...p} />
);

/** (g) Barra de ações fixa no rodapé do cartão: UM botão principal em cima; as secundárias em texto embaixo. */
const BarraAcoes: React.FC<{
  principal: React.ReactNode;
  secundarias?: React.ReactNode;
  onVoltar?: () => void;
  podeVoltar?: boolean;
  onPular?: () => void;
  onPerguntas?: () => void;
}> = ({ principal, secundarias, onVoltar, podeVoltar = true, onPular, onPerguntas }) => (
  <div className="sticky bottom-0 z-10 -mx-5 sm:-mx-8 px-5 sm:px-8 pt-3 pb-3 bg-prosperus-navy-mid/95 backdrop-blur border-t border-white/10 rounded-b-lg space-y-1" data-testid="barra-acoes">
    {principal}
    <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0">
      {onVoltar && <Sec onClick={onVoltar} disabled={!podeVoltar}>Voltar</Sec>}
      {secundarias}
      {onPular && <Sec onClick={onPular}>Pular por agora</Sec>}
      {onPerguntas && <Sec className="lg:hidden" onClick={onPerguntas}>Perguntas</Sec>}
    </div>
  </div>
);

// ── um campo dentro do passo ─────────────────────────────────────────────────

interface CampoPassoProps {
  campo: ScriptFieldView;
  contexto: Record<string, ScriptFieldView>;
  decide: UseScriptFicha['decide'];
  /** No par (antes × depois) cada coluna tem os próprios botões e não avança sozinha. */
  par?: boolean;
  /** Valor recolhido na linha "Confirmado" (o wizard segura 400 ms e avança). */
  feito?: Feito | null;
  onConcluir?: (f: Feito) => void;
  onAvancar?: () => void;
  onVoltar?: () => void;
  podeVoltar?: boolean;
  onPerguntas?: () => void;
  onRecarregar?: () => Promise<void> | void;
  onEditingChange?: (editing: boolean) => void;
}

const CampoPasso: React.FC<CampoPassoProps> = ({
  campo, contexto, decide, par = false, feito = null, onConcluir, onAvancar, onVoltar, podeVoltar = true, onPerguntas, onRecarregar, onEditingChange,
}) => {
  const editor = useFieldEditor(campo, contexto);
  const { editing, canSave } = editor;
  const status = statusDaTela(campo);
  const temSugestao = !sugestaoVazia(campo.sugerido);
  const [feitoLocal, setFeitoLocal] = useState<Feito | null>(null);
  const feitoAtual = feito || feitoLocal;

  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // No par, a coluna guarda a linha "Confirmado" até o estado salvo chegar
  useEffect(() => { setFeitoLocal(null); }, [campo.status, campo.valor]);

  const concluir = (f: Feito) => {
    if (par) setFeitoLocal(f);
    onConcluir?.(f);
  };
  const confirmar = () => { decide(campo.key, { status: 'confirmado' }); concluir({ status: 'confirmado', texto: textoDoModo(campo, 'sugerido') }); };
  const salvar = () => {
    const d = editor.decision();
    if (!d) return;
    decide(campo.key, d);
    editor.reset();
    concluir({ status: 'editado', texto: d.valor || '' });
  };
  const emBranco = () => { decide(campo.key, { status: 'aceito_vazio' }); if (!par) onAvancar?.(); };
  const desfazer = () => decide(campo.key, { status: temSugestao ? 'sugerido' : 'vazio' });
  const usarAlternativa = (t: string) => decide(campo.key, { status: 'editado', valor: t });
  const editar = () => editor.start(status === 'sugerido' ? 'sugerido' : status === 'aceito_vazio' ? 'vazio' : 'atual');

  const sufixo = par ? '' : ' e avançar';
  const rotuloBranco = campo.obrigatorio ? 'Deixar em branco por enquanto' : 'Não se aplica';
  const classePrincipal = par ? 'min-h-[44px] w-full sm:w-auto' : PRIMARIO;

  // (e) A linha "no seu script": ao vivo no editor, da sugestão, ou do valor decidido
  const previaViva = <PreviaCampo campo={campo} estrutura={editor.est} texto={editor.draft} contexto={contexto} editing />;

  // (d) + (e): a resposta e a linha "no seu script"
  let corpo: React.ReactNode;
  if (feitoAtual) {
    corpo = <ResumoConfirmado feito={feitoAtual} />;
  } else if (editing) {
    corpo = (
      <div className="space-y-4">
        <FieldEditor campo={campo} editor={editor} testId={`wizard-editor-${campo.key}`} />
        {previaViva}
      </div>
    );
  } else if (status === 'sugerido') {
    corpo = (
      <div className="space-y-4">
        <SugestaoEncontrada campo={campo} />
        <FichaDisplay campo={campo} modo="sugerido" contexto={contexto} />
        <PreviaCampo campo={campo} modo="sugerido" contexto={contexto} />
        <TextoOriginal campo={campo} />
        <Alternativas campo={campo} onUse={usarAlternativa} />
      </div>
    );
  } else if (status === 'vazio') {
    corpo = (
      <div className="space-y-4">
        <p className="text-sm text-white/60 font-sans italic" data-testid={`convite-${campo.key}`}>{COPY_VAZIO}</p>
        <FieldEditor campo={campo} editor={editor} testId={`wizard-editor-${campo.key}`} />
        {previaViva}
      </div>
    );
  } else {
    corpo = (
      <div className="space-y-4">
        {status !== 'aceito_vazio' && <FichaDisplay campo={campo} modo="atual" contexto={contexto} />}
        {status !== 'aceito_vazio' && <PreviaCampo campo={campo} modo="atual" contexto={contexto} />}
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip status={status} campo={campo} />
          {status === 'confirmado' && campo.fonte && <Fonte campo={campo} />}
          {status === 'aceito_vazio' && campo.obrigatorio && (
            <span className="text-xs text-prosperus-gold-light/80 font-sans">{COPY_EM_BRANCO}</span>
          )}
        </div>
      </div>
    );
  }

  // (g) UM botão principal por estado; as secundárias em texto. Valor vazio nunca ganha "Confirmar": vai direto de "Salvar".
  let principal: React.ReactNode = null;
  let secundarias: React.ReactNode = null;
  if (feitoAtual) {
    principal = <PrincipalFeito feito={feitoAtual} />;
  } else if (editing) {
    principal = <Button variant="primary" size="lg" className={classePrincipal} onClick={salvar} disabled={!canSave}><IconeCheck />{`Salvar${sufixo}`}</Button>;
    secundarias = <Sec onClick={editor.reset}>Cancelar</Sec>;
  } else if (status === 'sugerido') {
    principal = <Button variant="primary" size="lg" className={classePrincipal} onClick={confirmar}><IconeCheck />{`Confirmar${sufixo}`}</Button>;
    secundarias = (
      <>
        <Sec onClick={editar}>Editar</Sec>
        <Sec onClick={emBranco}>{rotuloBranco}</Sec>
      </>
    );
  } else if (status === 'vazio') {
    principal = <Button variant="primary" size="lg" className={classePrincipal} onClick={salvar} disabled={!canSave}><IconeCheck />{`Salvar${sufixo}`}</Button>;
    secundarias = <Sec onClick={emBranco}>{rotuloBranco}</Sec>;
  } else {
    principal = par ? null : <Button variant="primary" size="lg" className={classePrincipal} onClick={onAvancar}>Avançar</Button>;
    secundarias = (
      <>
        <Sec onClick={editar}>{status === 'aceito_vazio' ? 'Preencher' : 'Editar'}</Sec>
        <Sec onClick={desfazer}>{status === 'aceito_vazio' && temSugestao ? 'Ver sugestão' : 'Desfazer'}</Sec>
      </>
    );
  }

  // (f) contexto por pergunta; a transcrição ou a nota pode virar a resposta
  const contextoCampo = <ContextoCampo campo={campo} onRecarregar={onRecarregar} compacto={par} onUsarTexto={(t: string) => editor.startTexto(t)} />;

  if (par) {
    return (
      <div className="space-y-3" data-testid={`wizard-campo-${campo.key}`}>
        {corpo}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          {principal}
          {secundarias}
        </div>
        {contextoCampo}
      </div>
    );
  }

  const podePular = !editing && !feitoAtual && !campo.decidido;
  return (
    <div className="space-y-6" data-testid={`wizard-campo-${campo.key}`}>
      {corpo}
      {contextoCampo}
      <BarraAcoes
        principal={principal}
        secundarias={secundarias}
        onVoltar={onVoltar}
        podeVoltar={podeVoltar}
        onPular={podePular ? onAvancar : undefined}
        onPerguntas={onPerguntas}
      />
    </div>
  );
};

// ── o wizard ─────────────────────────────────────────────────────────────────

interface FichaWizardProps {
  ficha: UseScriptFicha;
  contexto: Record<string, ScriptFieldView>;
  onFecharFicha?: () => void;
  fechandoFicha?: boolean;
  /** Recarrega a ficha (flush + GET) depois de pedir uma nova sugestão com contexto. */
  onRecarregar?: () => Promise<void> | void;
  /** Modo "completar o que falta": só estes campos entram no fluxo; o resto fica recolhido e editável sob demanda. */
  foco?: FocoWizard | null;
}

function editavel(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"]');
}

const CARTAO = 'bg-prosperus-navy-mid border border-white/5 rounded-lg px-5 sm:px-8 pt-6 shadow-2xl space-y-6 overflow-x-clip';

export const FichaWizard: React.FC<FichaWizardProps> = ({ ficha, contexto, onFecharFicha, fechandoFicha = false, onRecarregar, foco = null }) => {
  const { data, decide } = ficha;
  const blocos = data?.blocos || [];
  const focoKeys = useMemo(() => (foco ? new Set(foco.keys) : null), [foco]);
  const focoPendentes = useMemo(() => new Set(foco ? foco.pendentes : []), [foco]);
  // Modo completar: os passos do foco vêm primeiro (é o fluxo); os outros ficam depois, só alcançáveis pelo navegador
  const { passos, limite } = useMemo(() => {
    const todos = montarPassos(blocos);
    if (!focoKeys) return { passos: todos, limite: todos.length };
    const dentro = todos.filter((p) => p.campos.some((c) => focoKeys.has(c.key)));
    const fora = todos.filter((p) => !p.campos.some((c) => focoKeys.has(c.key)));
    return { passos: [...dentro, ...fora], limite: dentro.length };
  }, [blocos, focoKeys]);
  const focoIds = useMemo(() => (focoKeys ? passos.slice(0, limite).map((p) => p.id) : null), [focoKeys, passos, limite]);
  /** Pendente: sem decisão (ficha inteira) ou, no modo completar, ainda esperando a resposta do mentor. */
  const pendente = (p: Passo) => (focoKeys ? p.campos.some((c) => focoPendentes.has(c.key)) : pendenteNav(p));
  const primeiroPendente = () => passos.slice(0, limite).findIndex(pendente);

  // Abre no primeiro campo sem decisão da ficha inteira; tudo decidido abre no fim
  const [idx, setIdx] = useState(() => Math.max(0, primeiroPendente()));
  const [dir, setDir] = useState(1);
  const [tela, setTela] = useState<Tela>(() => (passos.length && primeiroPendente() < 0 ? { tipo: 'fim' } : { tipo: 'passo' }));
  const [sheet, setSheet] = useState(false);
  const [feito, setFeito] = useState<Feito | null>(null);
  const feitoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingRef = useRef(false);
  const sheetRef = useRef(false);
  sheetRef.current = sheet;
  const acoesRef = useRef<{ proximo: () => void; voltar: () => void }>({ proximo: () => {}, voltar: () => {} });
  const fecharSheet = useCallback(() => setSheet(false), []);

  const i = Math.min(idx, Math.max(0, passos.length - 1));
  const emPasso = tela.tipo === 'passo';
  const blocoAtual = emPasso && passos.length ? passos[i].bloco : null;
  const [abertos, toggleBloco] = useBlocosAbertos(blocoAtual);

  useEffect(() => () => { if (feitoTimer.current) clearTimeout(feitoTimer.current); }, []);

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

  const passo = passos[i];
  const bloco = blocos.find((b) => b.numero === passo.bloco) || blocos[0];
  const { progresso } = data;
  const isConfirmed = data.ficha_status === 'confirmada';
  const faltam = faltamParaScript(progresso);
  const allRequiredDone = faltam === 0;

  const limparFeito = () => {
    if (feitoTimer.current) { clearTimeout(feitoTimer.current); feitoTimer.current = null; }
    setFeito(null);
  };

  const irPara = (n: number, d: number) => {
    limparFeito();
    setDir(d);
    setIdx(Math.max(0, Math.min(n, passos.length - 1)));
    setTela({ tipo: 'passo' });
  };

  const avancar = () => {
    limparFeito();
    // Fim do fluxo (ou de um campo fora do foco, aberto pelo navegador): volta ao fim
    if (i >= limite - 1 || i >= limite) { setTela({ tipo: 'fim' }); return; }
    const prox = passos[i + 1];
    if (prox.bloco !== passo.bloco) { setDir(1); setTela({ tipo: 'bloco', de: passo.bloco, para: prox.bloco }); return; }
    irPara(i + 1, 1);
  };

  /** Confirmar / salvar: segura a linha "Confirmado" por 400 ms e só então a próxima pergunta desliza. */
  const concluir = (f: Feito) => {
    if (feitoTimer.current) clearTimeout(feitoTimer.current);
    setFeito(f);
    feitoTimer.current = setTimeout(() => {
      feitoTimer.current = null;
      setFeito(null);
      avancar();
    }, CONFIRMADO_MS);
  };

  const voltar = () => {
    limparFeito();
    if (tela.tipo !== 'passo') { setTela({ tipo: 'passo' }); return; }
    if (i > 0) irPara(i - 1, -1);
  };

  const continuar = () => { if (i < limite - 1) irPara(i + 1, 1); };

  const proximo = () => {
    if (feito) return;
    if (tela.tipo === 'passo') avancar();
    else if (tela.tipo === 'bloco') continuar();
  };
  acoesRef.current = { proximo, voltar };

  const irParaPasso = (j: number) => irPara(j, j >= i ? 1 : -1);

  const irParaObrigatorioPendente = () => {
    const j = focoKeys
      ? primeiroPendente()
      : passos.findIndex((p) => p.campos.some((c) => c.obrigatorio && !c.decidido));
    if (j >= 0) irParaPasso(j);
  };

  /** A prévia do script (capítulos revelados e trancados), a partir do navegador ou do fim. */
  const abrirPrevia = () => { limparFeito(); setDir(1); setTela({ tipo: 'previa' }); };

  /** De um capítulo trancado ao bloco que o abre: a primeira pergunta pendente do bloco (ou a primeira dele). */
  const irParaBloco = (n: number) => {
    const pend = passos.findIndex((p) => p.bloco === n && pendente(p));
    const j = pend >= 0 ? pend : passos.findIndex((p) => p.bloco === n);
    if (j >= 0) irParaPasso(j);
  };

  /** Próxima pergunta sem decisão depois da atual (dá a volta dentro do fluxo); sem nenhuma, vai ao fim. */
  const proximaPendente = () => {
    const n = limite;
    const base = Math.min(i, Math.max(0, n - 1));
    for (let k = 1; k <= n; k++) {
      const j = (base + k) % n;
      if (pendente(passos[j])) { irPara(j, j > i ? 1 : -1); return; }
    }
    limparFeito();
    setTela({ tipo: 'fim' });
  };
  const pendentesNoFoco = focoKeys ? passos.slice(0, limite).filter(pendente).length : 0;
  const foraDoFoco = !!focoKeys && i >= limite;

  // Posição dentro do bloco: "Pergunta 3 de 9" (o par conta as duas chaves)
  const camposDoBloco = bloco.campos;
  const pos = camposDoBloco.findIndex((c) => c.key === passo.campos[0].key) + 1;
  const posLabel = passo.campos.length > 1 ? `Perguntas ${pos} e ${pos + 1} de ${camposDoBloco.length}` : `Pergunta ${pos} de ${camposDoBloco.length}`;
  const pctBloco = bloco.total ? Math.round((bloco.decididos / bloco.total) * 100) : 0;
  const algumRefinando = passo.campos.some((c) => campoRefinando(c as { refinando?: boolean }));

  /** (a) Cabeçalho fixo: chip "Bloco 3 · Mentorado", "Pergunta 4 de 9", o filete do bloco e "faltam N para o seu script". */
  const cabecalho = (
    <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0 pt-2 pb-2 bg-prosperus-navy/95 backdrop-blur space-y-2" data-testid="wizard-cabecalho">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="inline-flex items-center rounded-full border border-prosperus-gold-dark/40 bg-prosperus-gold-dark/10 px-2.5 py-1 text-[11px] uppercase tracking-wide text-prosperus-gold-light font-sans" data-testid="chip-bloco">
            Bloco {bloco.numero} · {bloco.nome}
          </span>
          <span className="text-xs text-white/60 font-sans" aria-live="polite" aria-atomic="true" data-testid="wizard-posicao">{emPasso ? posLabel : ''}</span>
          {emPasso && <BadgeObrigatorio campo={passo.campos[0]} />}
          {emPasso && algumRefinando && <BadgeRefinando />}
          {emPasso && foraDoFoco && <span className="text-[11px] text-prosperus-gold-light/80 font-sans" data-testid="chip-fora-do-foco">Preenchido pelos seus materiais</span>}
        </div>
        {focoKeys
          ? <p className="text-xs text-white/70 font-sans" data-testid="contador-faltam" aria-live="polite">{textoFaltamRespostas(pendentesNoFoco)}</p>
          : <ContadorFaltam n={faltam} className="text-xs text-white/70" />}
      </div>
      <div
        className="w-full bg-white/10 rounded-full h-0.5"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={bloco.total}
        aria-valuenow={bloco.decididos}
        aria-label={`Bloco ${bloco.numero}: ${bloco.decididos} de ${bloco.total} decididos`}
      >
        <div className="h-full bg-gradient-to-r from-prosperus-gold-dark to-prosperus-gold-light rounded-full transition-all" style={{ width: `${pctBloco}%` }} />
      </div>
    </div>
  );

  const abrirPerguntas = () => setSheet(true);
  const marcarEditing = (v: boolean) => { editingRef.current = v; };

  /** (b) + (c): a pergunta em serifa grande e a linha "por que isso importa no script". */
  const topo = (pergunta: string, campo: ScriptFieldView) => (
    <div className="space-y-3">
      {pos === 1 && BLOCK_INTRO[bloco.numero] && <p className="text-sm text-white/50 font-serif italic">{BLOCK_INTRO[bloco.numero]}</p>}
      <h3 className="font-serif text-2xl sm:text-[32px] text-white leading-snug" data-testid="wizard-title">{pergunta}</h3>
      <PorQueImporta campo={campo} />
    </div>
  );

  const renderPasso = () => {
    if (passo.campos.length === 1) {
      const c = passo.campos[0];
      return (
        <div className={CARTAO} data-testid={`wizard-step-${c.key}`}>
          {topo(c.pergunta, c)}
          <CampoPasso
            key={c.key}
            campo={c}
            contexto={contexto}
            decide={decide}
            feito={feito}
            onConcluir={concluir}
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
    const confirmarTodos = () => {
      sugeridos.forEach((c) => decide(c.key, { status: 'confirmado' }));
      concluir({ status: 'confirmado', texto: sugeridos.map((c) => resumo(textoDoModo(c, 'sugerido'), 48)).join(' · ') });
    };
    const principal = feito
      ? <PrincipalFeito feito={feito} />
      : sugeridos.length > 0
      ? <Button variant="primary" size="lg" className={PRIMARIO} onClick={confirmarTodos}><IconeCheck />{sugeridos.length === 2 ? 'Confirmar os dois e avançar' : 'Confirmar e avançar'}</Button>
      : <Button variant="primary" size="lg" className={PRIMARIO} onClick={avancar}>Avançar</Button>;
    return (
      <div className={CARTAO} data-testid={`wizard-step-${passo.id}`}>
        {topo('Daqui a 1 ano: sem resolver e resolvido', passo.campos[0])}
        {feito ? <ResumoConfirmado feito={feito} /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* cada lado é uma janela (3.5 cinza, 3.6 dourada) que já carrega o próprio rótulo */}
            {passo.campos.map((c, k) => (
              <div key={c.key} className={`min-w-0 space-y-3 border-l-2 pl-4 ${k === 1 ? 'border-prosperus-gold-dark/60' : 'border-white/15'}`} data-testid={`janela-${c.key}`}>
                <p className="text-sm text-white/70 font-sans">{c.pergunta}</p>
                <CampoPasso key={c.key} campo={c} contexto={contexto} decide={decide} par onRecarregar={onRecarregar} onEditingChange={marcarEditing} />
              </div>
            ))}
          </div>
        )}
        <BarraAcoes principal={principal} onVoltar={voltar} podeVoltar={i > 0} onPular={feito ? undefined : avancar} onPerguntas={abrirPerguntas} />
      </div>
    );
  };

  /**
   * Fechamento de bloco: papel creme, sóbrio, sem confete. "Bloco Mentor fechado. O Passo 1 já tem a sua voz.",
   * o passo rascunhado linha a linha (selo "rascunho v0"), um fio dourado e o próximo bloco. O mapa dos blocos
   * fica só no navegador.
   */
  const renderBloco = (t: Extract<Tela, { tipo: 'bloco' }>) => {
    const de = blocos.find((b) => b.numero === t.de);
    const para = blocos.find((b) => b.numero === t.para);
    if (!de || !para) return null;
    const faltamObrig = de.obrigatorios - de.obrigatorios_decididos;
    const passosRevelados = passosDoBloco(de.numero);
    const titulo = de.fechado ? `Bloco ${de.nome} fechado. ${fraseDosPassos(de.numero)}` : `Bloco ${de.nome}: por enquanto é isso.`;
    return (
      <div className="rounded-lg bg-prosperus-neutral-white text-prosperus-navy px-5 sm:px-8 py-6 sm:py-8 space-y-6" data-testid="wizard-interstitial">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Bloco {de.numero} · {de.nome}</p>
          <h3 className="font-serif text-2xl sm:text-3xl text-prosperus-navy leading-tight">{titulo}</h3>
          <p className="text-sm text-prosperus-navy/70 font-sans">
            {de.decididos} de {de.total} decididos
            {faltamObrig > 0 ? ` · ${faltamObrig} obrigatórios em aberto, dá para voltar quando quiser` : ''}
          </p>
        </div>

        <div className="space-y-3" data-testid="wizard-previa">
          <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Prévia do seu script</p>
          {de.numero === META_SCRIPT.bloco ? (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-prosperus-navy/50 font-sans">No alto do script</p>
              <PreviaMeta contexto={contexto} />
              {!de.decididos && <p className="text-sm text-prosperus-navy/60 font-sans">A meta entra no alto do script quando você decidir a oferta e a cadência.</p>}
            </div>
          ) : (
            passosRevelados.map((p) => <PreviaPasso key={p.n} passo={p} contexto={contexto} fechado={de.fechado} />)
          )}
          {PREVIA_SCRIPT[de.numero] && <p className="text-sm text-prosperus-navy/60 font-serif italic">{PREVIA_SCRIPT[de.numero]}</p>}
        </div>

        <hr className="border-0 h-px bg-prosperus-gold-dark" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Próximo</p>
          <p className="font-serif text-xl text-prosperus-navy">{para.numero}. {para.nome}</p>
          {BLOCK_INTRO[para.numero] && <p className="text-sm text-prosperus-navy/70 font-serif italic">{BLOCK_INTRO[para.numero]}</p>}
          <p className="text-xs text-prosperus-navy/50 font-sans">{para.total} campos · {para.obrigatorios} obrigatórios</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="primary" size="lg" className="min-h-[48px] w-full sm:w-auto sm:min-w-[220px]" onClick={continuar}>Continuar</Button>
          <Button variant="link" size="lg" className="min-h-[44px] !text-prosperus-navy/70 hover:!text-prosperus-navy" onClick={voltar}>Voltar</Button>
        </div>
      </div>
    );
  };

  /** Fim da ficha: quantos campos faltam para o script e um único link "Ver o que falta"; o mapa fica no navegador. */
  const renderFim = () => {
    if (focoKeys) {
      // Modo completar: sem botão de fechar (ao decidir a última resposta, o script é gerado sozinho)
      return (
        <div className={`${CARTAO} pb-6 text-center`} data-testid="wizard-fim">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Suas respostas</p>
            <h3 className="font-serif text-2xl sm:text-3xl text-white leading-snug" data-testid="wizard-faltam">
              {pendentesNoFoco > 0 ? textoFaltamRespostas(pendentesNoFoco) : (isConfirmed ? 'Suas respostas completaram a ficha.' : 'Tudo respondido. Gerando o seu script.')}
            </h3>
            <p className="text-sm text-white/70 font-sans">
              {pendentesNoFoco > 0
                ? 'O resto a gente preencheu com os seus materiais. Ao responder a última, o script é gerado sozinho.'
                : 'O script chega em alguns minutos, com aviso no WhatsApp. O que veio dos seus materiais continua editável.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-1">
            {pendentesNoFoco > 0 && <Sec onClick={irParaObrigatorioPendente}>Ver o que falta</Sec>}
            <Sec onClick={abrirPrevia}>{COPY_VER_PREVIA}</Sec>
            <Sec onClick={voltar}>Voltar</Sec>
            <Sec className="lg:hidden" onClick={abrirPerguntas}>Perguntas</Sec>
          </div>
        </div>
      );
    }
    const faltamObrig = faltam;
    const faltamTotal = progresso.total - progresso.decididos;
    const titulo = faltamObrig > 0
      ? (faltamObrig === 1 ? 'Falta 1 campo para o seu script' : `Faltam ${faltamObrig} campos para o seu script`)
      : COPY_SCRIPT_PRONTO;
    return (
      <div className={`${CARTAO} pb-6 text-center`} data-testid="wizard-fim">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Fim da ficha</p>
          <h3 className="font-serif text-2xl sm:text-3xl text-white leading-snug" data-testid="wizard-faltam">{titulo}</h3>
          <p className="text-sm text-white/70 font-sans">
            {progresso.obrigatorios_decididos} de {progresso.obrigatorios} obrigatórios decididos
            <span className="text-white/40"> · {progresso.decididos} de {progresso.total} no total</span>
          </p>
          {faltamObrig === 0 && faltamTotal > 0 && (
            <p className="text-xs text-white/50 font-sans">{faltamTotal} opcionais em aberto. Dá para fechar assim e completar depois.</p>
          )}
          {isConfirmed && <p className="text-xs text-green-400 font-sans">Ficha fechada. Se editar algum campo, ela reabre e o script é refeito.</p>}
        </div>
        <div className="flex flex-col items-center gap-1">
          {allRequiredDone && onFecharFicha && (
            <Button variant="primary" size="lg" className={PRIMARIO} onClick={onFecharFicha} disabled={isConfirmed} loading={fechandoFicha}>
              <IconeCheck />{isConfirmed ? 'Ficha fechada' : 'Fechar ficha'}
            </Button>
          )}
          <div className="flex flex-wrap items-center justify-center gap-x-1">
            {faltamObrig > 0 && <Sec onClick={irParaObrigatorioPendente}>Ver o que falta</Sec>}
            <Sec onClick={abrirPrevia}>{COPY_VER_PREVIA}</Sec>
            <Sec onClick={voltar}>Voltar</Sec>
            <Sec className="lg:hidden" onClick={abrirPerguntas}>Perguntas</Sec>
          </div>
        </div>
      </div>
    );
  };

  /**
   * A prévia com capítulos trancados: papel creme com a meta no alto, os passos já revelados (bloco fechado)
   * rascunhados linha a linha e os trancados só com o nome e "abre com o bloco X". Toque no trancado leva ao bloco.
   */
  const renderPrevia = () => (
    <div className="rounded-lg bg-prosperus-neutral-white text-prosperus-navy px-5 sm:px-8 py-6 sm:py-8 space-y-5" data-testid="wizard-previa-script">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">{COPY_PREVIA_SCRIPT}</p>
        <h3 className="font-serif text-2xl sm:text-3xl text-prosperus-navy leading-tight">O que já dá para ler</h3>
        <p className="text-sm text-prosperus-navy/70 font-sans">Cada bloco fechado abre um capítulo. O que ainda está trancado abre quando você decidir o bloco dele.</p>
      </div>
      <PreviaCapitulos blocos={blocos} contexto={contexto} onIrParaBloco={irParaBloco} />
      <hr className="border-0 h-px bg-prosperus-gold-dark" aria-hidden="true" />
      <div className="flex flex-col sm:flex-row gap-2">
        <Button variant="primary" size="lg" className="min-h-[48px] w-full sm:w-auto sm:min-w-[220px]" onClick={proximaPendente}>Próxima pendente</Button>
        <Button variant="link" size="lg" className="min-h-[44px] !text-prosperus-navy/70 hover:!text-prosperus-navy" onClick={voltar}>Voltar</Button>
      </div>
    </div>
  );

  const chave = tela.tipo === 'passo' ? passo.id : tela.tipo === 'bloco' ? `bloco-${tela.de}-${tela.para}` : tela.tipo;
  const emPrevia = tela.tipo === 'previa';
  const nav = { blocos, passos, atual: emPasso ? i : -1, blocoAtual, abertos, onToggle: toggleBloco, onIr: irParaPasso, onPrevia: abrirPrevia, previaAtiva: emPrevia, focoIds };
  const temPendente = focoKeys ? pendentesNoFoco > 0 : undefined;

  return (
    <div className="ficha-scroll" data-testid="ficha-wizard" data-modo={focoKeys ? 'completar' : 'inteira'}>
      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6 lg:items-start">
        <NavegadorLateral {...nav} onProximaPendente={proximaPendente} temPendente={temPendente} />
        <div className="w-full max-w-[720px] mx-auto min-w-0 space-y-4">
          {cabecalho}
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={chave}
              custom={dir}
              variants={emPasso ? slide : fade}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: emPasso ? SLIDE_S : 0.3, ease: 'easeInOut' }}
            >
              {tela.tipo === 'passo' ? renderPasso() : tela.tipo === 'bloco' ? renderBloco(tela) : tela.tipo === 'previa' ? renderPrevia() : renderFim()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <NavegadorSheet {...nav} aberto={sheet} onFechar={fecharSheet} />
    </div>
  );
};
