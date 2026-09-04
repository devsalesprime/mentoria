import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { UseScriptFicha } from '../../hooks/useScriptFicha';
import type { ScriptBlockView, ScriptFieldView } from '../../data/script-ficha-fields';
import { campoRefinando } from '../../hooks/useContextoCampo';
import { FichaField } from './FichaField';
import { FichaWizard, textoFaltamRespostas, type FocoWizard } from './FichaWizard';
import { BLOCK_INTRO } from './FichaNavegador';
import { ToastStack } from './contexto/ToastStack';
import { emitirToast } from './contexto/toast';
import { ProgressoPreenchimento } from './ProgressoPreenchimento';
import { ComplementoCampo } from './ComplementoCampo';
import { AccordionSection } from '../shared/AccordionSection';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Button } from '../ui/Button';

interface FichaScreenProps {
  ficha: UseScriptFicha;
  onNavigate?: (id: string) => void;
}

// Modo de preenchimento lembrado no navegador: 'passo' (uma pergunta por tela, padrao) ou 'tudo' (acordeoes)
const MODO_KEY = 'ficha-script-modo';
type Modo = 'passo' | 'tudo';

const POLL_REFINANDO_MS = 30000;
// Pre-preenchimento em marcos: enquanto o job da pessoa esta na fila/rodando, sincroniza a cada 20 s
const POLL_PREFILL_MS = 20000;
// "Pronto: N sugestões chegaram" some sozinho depois de 60 s (ou quando o mentor interage)
const PRONTO_MS = 60000;
const INDISPONIVEL = { ok: false, message: 'Indisponível agora.' };

function formatDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const SaveIndicator: React.FC<{ state: UseScriptFicha['saveState'] }> = ({ state }) => {
  if (state === 'pending' || state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-prosperus-gold-dark font-sans animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-prosperus-gold-dark inline-block" />
        Salvando
      </span>
    );
  }
  if (state === 'saved') {
    return <span className="text-xs text-green-400 font-sans">Salvo</span>;
  }
  if (state === 'error') {
    return <span className="text-xs text-red-400 font-sans">Não salvou. Vamos tentar de novo na próxima alteração.</span>;
  }
  return <span className="text-xs text-white/30 font-sans">Salva sozinha</span>;
};

/** Copy dos três resultados dos gates de suficiência (GATES-suficiencia.md), na voz do app. */
export const COPY_INSUFICIENTE = 'Precisamos de mais material ou das suas respostas';
export const COPY_AUTOMATICA = 'Preenchida pelos seus materiais. Seu script já está sendo escrito. Se editar algum campo, a ficha reabre e você pode pedir uma nova versão.';
export const COPY_SCRIPT_GERANDO = 'Tudo respondido. Seu script está sendo escrito.';

export const FichaScreen: React.FC<FichaScreenProps> = ({ ficha, onNavigate }) => {
  const { data, loading, loaded, error, saveState, decide, complete, flush, refresh, refreshMerge, ultimaSincronia, complemento, pedirRevisao } = ficha;
  const [openBlock, setOpenBlock] = useState<number | null>(null);
  const [modo, setModo] = useState<Modo>(() => {
    try { return window.localStorage.getItem(MODO_KEY) === 'tudo' ? 'tudo' : 'passo'; } catch { return 'passo'; }
  });
  const trocarModo = (m: Modo) => { setModo(m); try { window.localStorage.setItem(MODO_KEY, m); } catch { /* sem storage */ } };
  const [fechadoAgora, setFechadoAgora] = useState<number | null>(null);
  const [closingFicha, setClosingFicha] = useState(false);
  const [closedNow, setClosedNow] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const prevClosedRef = useRef<Record<number, boolean>>({});
  const prevRefinandoRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Barra de rolagem discreta enquanto a ficha está montada: html, body e o contêiner que rola (o <main> do app)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const alvos: Element[] = [document.documentElement, document.body];
    let el: HTMLElement | null = rootRef.current?.parentElement || null;
    while (el && el !== document.body) {
      const ov = window.getComputedStyle(el).overflowY;
      if (ov === 'auto' || ov === 'scroll') { alvos.push(el); break; }
      el = el.parentElement;
    }
    alvos.forEach((a) => a.classList.add('ficha-scroll'));
    return () => alvos.forEach((a) => a.classList.remove('ficha-scroll'));
  }, [data]);

  // Mapa chave -> campo: widgets que leem outro campo (4.3 e 4.4 leem os pilares do 4.2)
  const contexto = useMemo<Record<string, ScriptFieldView>>(
    () => Object.fromEntries((data?.blocos || []).flatMap((b) => b.campos.map((c) => [c.key, c]))),
    [data],
  );

  // Abre o primeiro bloco em aberto na primeira carga (todos os blocos ficam disponíveis)
  useEffect(() => {
    if (!data || initializedRef.current) return;
    initializedRef.current = true;
    const first = data.blocos.find((b) => !b.fechado)?.numero ?? data.blocos[0]?.numero ?? 1;
    setOpenBlock(first);
    prevClosedRef.current = Object.fromEntries(data.blocos.map((b) => [b.numero, b.fechado]));
  }, [data]);

  // Bloco que acabou de fechar (so por acao do mentor): aviso sobrio por alguns segundos
  useEffect(() => {
    if (!data || !initializedRef.current) return;
    for (const b of data.blocos) {
      const was = prevClosedRef.current[b.numero];
      if (was === false && b.fechado) setFechadoAgora(b.numero);
      prevClosedRef.current[b.numero] = b.fechado;
    }
  }, [data]);
  useEffect(() => {
    if (fechadoAgora == null) return;
    const t = setTimeout(() => setFechadoAgora(null), 4000);
    return () => clearTimeout(t);
  }, [fechadoAgora]);

  // Recarga da ficha (fila salva antes, depois GET): usada apos pedir sugestao com contexto e no poll
  const recarregar = useCallback(async () => {
    try { await flush?.(); } catch { /* fila fica para a proxima */ }
    try { await refresh?.(); } catch { /* proximo ciclo */ }
  }, [flush, refresh]);

  // Campos em revisao pela IA: poll a cada 30 s enquanto houver algum; quando um sai da revisao, avisa na tela
  const refinandoAgora = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of data?.blocos || []) for (const c of b.campos) if (campoRefinando(c as { refinando?: boolean })) m.set(c.key, c.nome);
    return m;
  }, [data]);
  useEffect(() => {
    const prev = prevRefinandoRef.current;
    prev.forEach((nome, key) => {
      if (!refinandoAgora.has(key)) emitirToast(`Nova sugestão pronta em ${key} · ${nome}. Dá uma olhada no campo.`);
    });
    prevRefinandoRef.current = refinandoAgora;
  }, [refinandoAgora]);
  const algumRefinando = refinandoAgora.size > 0;
  useEffect(() => {
    if (!algumRefinando) return;
    const t = setInterval(() => { void recarregar(); }, POLL_REFINANDO_MS);
    return () => clearInterval(t);
  }, [algumRefinando, recarregar]);

  // Pre-preenchimento em marcos: job da pessoa na fila/rodando -> sincroniza a cada 20 s (fila salva antes, depois
  // GET + merge no hook: nao reseta o passo atual nem um editor aberto). O painel no topo mostra os marcos.
  const job = data?.job ?? null;
  const jobAtivo = job?.status === 'queued' || job?.status === 'running';
  const [painelDispensado, setPainelDispensado] = useState<string | null>(null);
  const prevJobStatusRef = useRef<string | null>(null);
  const sincronizar = useCallback(async () => {
    try { await flush?.(); } catch { /* fila fica para a proxima */ }
    try { await refreshMerge?.(); } catch { /* proximo ciclo */ }
  }, [flush, refreshMerge]);
  useEffect(() => {
    if (!jobAtivo) return;
    const t = setInterval(() => { void sincronizar(); }, POLL_PREFILL_MS);
    return () => clearInterval(t);
  }, [jobAtivo, sincronizar]);
  useEffect(() => {
    const antes = prevJobStatusRef.current;
    if ((antes === 'queued' || antes === 'running') && job?.status === 'done') emitirToast('Terminamos de ler os seus materiais. As sugestões estão na ficha.');
    prevJobStatusRef.current = job?.status ?? null;
  }, [job?.status]);
  useEffect(() => {
    if (job?.status !== 'done' || painelDispensado === job.id) return;
    const t = setTimeout(() => setPainelDispensado(job.id), PRONTO_MS);
    return () => clearTimeout(t);
  }, [job?.status, job?.id, painelDispensado]);
  const dispensarSePronto = useCallback(() => { if (job?.status === 'done') setPainelDispensado(job.id); }, [job?.status, job?.id]);
  const mostrarPainel = !!job && !(job.status === 'done' && painelDispensado === job.id);
  const camposTodos = useMemo(() => (data?.blocos || []).flatMap((b) => b.campos), [data]);
  const sugestoesTotal = useMemo(() => camposTodos.filter((c) => c.sugerido && c.sugerido.trim()).length, [camposTodos]);
  const novas = useMemo(() => camposTodos.filter((c) => c.nova_sugestao).map((c) => `${c.key} · ${c.nome}`), [camposTodos]);
  // Campos decididos com achado do worker por cima ("Encontramos mais nos seus materiais")
  const comComplemento = useMemo(() => camposTodos.filter((c) => !!c.complemento), [camposTodos]);
  const incorporar = useCallback((key: string) => (complemento ? complemento(key, 'incorporar') : Promise.resolve(INDISPONIVEL)), [complemento]);
  const dispensar = useCallback((key: string) => (complemento ? complemento(key, 'dispensar') : Promise.resolve(INDISPONIVEL)), [complemento]);
  const salvarAjuste = useCallback((key: string, valor: string) => decide(key, { status: 'editado', valor }), [decide]);

  const handleClose = async () => {
    setClosingFicha(true);
    setCloseError(null);
    const r = await complete();
    setClosingFicha(false);
    if (r.ok) {
      setClosedNow(true);
    } else {
      setCloseError(r.message || 'Não deu para fechar a ficha agora. Tente de novo.');
    }
  };

  // ── Gates de suficiência (GATES-suficiencia.md): o que a tela mostra depois do pré-preenchimento ──
  const suf = data?.suficiencia ?? null;
  const fichaStatus = data?.ficha_status ?? null;
  /** parcial com `faltam`: o wizard abre só no que falta; ao decidir a última, o script é gerado sozinho */
  const modoCompletar = !jobAtivo && !!suf && suf.resultado === 'parcial' && (suf.faltam?.length ?? 0) > 0 && fichaStatus !== 'confirmada';
  const modoInsuficiente = !jobAtivo && !!suf && suf.resultado === 'insuficiente' && fichaStatus !== 'confirmada';
  const fechadaPelosMateriais = fichaStatus === 'confirmada' && data?.confirmada_por === 'automatica';
  const focoKeys = useMemo(() => (modoCompletar ? (suf!.faltam || []).filter((k) => !!contexto[k]) : []), [modoCompletar, suf, contexto]);
  // Campo em `faltam` que já estava decidido quando a tela abriu (sinalizado pelo servidor): conta como pendente até o mentor mexer
  const sinalizadosRef = useRef<Set<string> | null>(null);
  if (modoCompletar && sinalizadosRef.current === null) sinalizadosRef.current = new Set(focoKeys.filter((k) => contexto[k]?.decidido));
  const [tocados, setTocados] = useState<Set<string>>(() => new Set());
  const pendentesFoco = useMemo(
    () => focoKeys.filter((k) => !contexto[k]?.decidido || (sinalizadosRef.current?.has(k) && !tocados.has(k))),
    [focoKeys, contexto, tocados],
  );
  const decideFoco = useCallback<UseScriptFicha['decide']>((key, decision) => {
    setTocados((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    decide(key, decision);
  }, [decide]);
  const fichaDoWizard = useMemo<UseScriptFicha>(() => (modoCompletar ? { ...ficha, decide: decideFoco } : ficha), [modoCompletar, ficha, decideFoco]);
  const foco = useMemo<FocoWizard | null>(() => (modoCompletar ? { keys: focoKeys, pendentes: pendentesFoco } : null), [modoCompletar, focoKeys, pendentesFoco]);
  // Última resposta decidida: fecha a ficha sozinha (sem botão) e mostra o estado do script
  const autoFechouRef = useRef(false);
  useEffect(() => {
    if (!modoCompletar || autoFechouRef.current || closingFicha || pendentesFoco.length > 0) return;
    if (!sinalizadosRef.current) return;
    autoFechouRef.current = true;
    void handleClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoCompletar, pendentesFoco.length, closingFicha]);

  // Ficha reaberta depois de o script existir: sugere pedir a nova versão (mesmo fluxo da tela "Seu script")
  const ultimaVersao = data?.script?.ultima?.versao ?? null;
  const sugerirNovaVersao = fichaStatus === 'em_revisao' && (data?.script?.versoes || 0) > 0 && ultimaVersao != null;
  const [pedindoVersao, setPedindoVersao] = useState(false);
  const pedirNovaVersao = async () => {
    if (ultimaVersao == null || !pedirRevisao) return;
    setPedindoVersao(true);
    const r = await pedirRevisao(ultimaVersao);
    setPedindoVersao(false);
    emitirToast(r.ok
      ? (r.existing ? 'Já tem uma versão nova sendo escrita. Você recebe um aviso no WhatsApp.' : 'Pedido feito: a nova versão parte da ficha atualizada. Você recebe um aviso no WhatsApp.')
      : (r.message || 'Não deu para pedir agora. Tente de novo.'));
  };

  if (loading && !data) {
    return (
      <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-8 min-h-[300px] flex items-center justify-center">
        <LoadingSpinner size="lg" label="Carregando a ficha" />
      </div>
    );
  }

  if (loaded && !data) {
    return (
      <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-8 text-center space-y-3">
        <h3 className="font-serif text-2xl text-white">Ficha do Script</h3>
        <p className="text-sm text-white/60 font-sans">{error || 'Esta área ainda não está liberada para o seu acesso. Fale com o Caio.'}</p>
      </div>
    );
  }

  if (!data) return null;

  const { progresso, blocos } = data;
  const allRequiredDone = progresso.obrigatorios_decididos >= progresso.obrigatorios;
  const isConfirmed = data.ficha_status === 'confirmada';

  /**
   * Campos do bloco. Pares antes/depois (3.5 × 3.6) viram um painel unico com as duas colunas,
   * cada coluna salvando a propria chave.
   */
  const renderFields = (campos: ScriptFieldView[]) => {
    const out: React.ReactNode[] = [];
    const skip = new Set<string>();
    for (const c of campos) {
      if (skip.has(c.key)) continue;
      const par: string | undefined = c.widget === 'antes_depois' ? c.template?.par : undefined;
      const outro = par ? campos.find((x) => x.key === par && !skip.has(x.key)) : undefined;
      if (outro) {
        skip.add(outro.key);
        out.push(
          <div key={`${c.key}-${outro.key}`} className="rounded-lg border border-prosperus-gold-dark/25 bg-prosperus-gold-dark/[0.03] p-3 space-y-3" data-testid={`painel-${c.key}-${outro.key}`}>
            <p className="font-serif text-base text-prosperus-gold-light">Daqui a 1 ano</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* a janela de cada lado (3.5 cinza, 3.6 dourada) já carrega o próprio rótulo */}
              {[c, outro].map((f) => (
                <div key={f.key} className="space-y-2 min-w-0">
                  <FichaField campo={f} onDecide={decide} contexto={contexto} onRecarregar={recarregar} />
                  {f.complemento && <ComplementoCampo campo={f} onIncorporar={incorporar} onDispensar={dispensar} onSalvarAjuste={salvarAjuste} />}
                </div>
              ))}
            </div>
          </div>,
        );
        continue;
      }
      out.push(
        <React.Fragment key={c.key}>
          <FichaField campo={c} onDecide={decide} contexto={contexto} onRecarregar={recarregar} />
          {c.complemento && <ComplementoCampo campo={c} onIncorporar={incorporar} onDispensar={dispensar} onSalvarAjuste={salvarAjuste} />}
        </React.Fragment>,
      );
    }
    return out;
  };

  const renderBlock = (b: ScriptBlockView) => (
    <AccordionSection
      key={b.numero}
      title={`${b.numero}. ${b.nome}`}
      icon={String(b.numero)}
      badge={b.fechado ? 'optional' : 'recommended'}
      badgeLabel={`${b.decididos} de ${b.total}`}
      isComplete={b.fechado}
      isOpen={openBlock === b.numero}
      onToggle={() => setOpenBlock((prev) => (prev === b.numero ? null : b.numero))}
    >
      <div className="space-y-4">
        {BLOCK_INTRO[b.numero] && (
          <p className="text-sm text-white/60 font-serif italic">{BLOCK_INTRO[b.numero]}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-white/50 font-sans">{b.descricao}</p>
          <p className="text-[11px] text-white/40 font-sans">
            {b.obrigatorios_decididos} de {b.obrigatorios} obrigatórios
          </p>
        </div>

        <AnimatePresence>
          {fechadoAgora === b.numero && (
            <motion.p
              key={`fechado-${b.numero}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-lg bg-prosperus-neutral-white text-prosperus-navy px-3 py-2 text-sm font-serif"
              data-testid={`bloco-fechado-${b.numero}`}
            >
              Bloco {b.nome} fechado.
            </motion.p>
          )}
        </AnimatePresence>

        {renderFields(b.campos)}
      </div>
    </AccordionSection>
  );

  return (
    <div
      ref={rootRef}
      className={`ficha-scroll space-y-4 sm:space-y-6 mx-auto ${modo === 'passo' ? 'max-w-3xl lg:max-w-[1040px]' : 'max-w-3xl'}`}
      onPointerDownCapture={dispensarSePronto}
    >
      {/* Cabecalho */}
      <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Script 7 Passos · {data.club.nome}</p>
            <h2 className="font-serif text-2xl sm:text-3xl text-white mt-1">Ficha do Script</h2>
          </div>
          <SaveIndicator state={saveState} />
        </div>
        <p className="text-sm text-white/70 font-sans leading-relaxed">
          Revise o que já encontramos sobre a sua mentoria. Confirme, edite ou preencha. Cada resposta mostra de onde veio.
          Faltou algo? Grave um áudio, mande uma foto ou escreva uma nota e peça uma nova sugestão.
          Com a ficha fechada, a gente escreve o seu script dos 7 passos, na sua voz.
        </p>

        {isConfirmed && !closedNow && (
          fechadaPelosMateriais
            ? <p className="text-xs text-prosperus-gold-light font-sans" data-testid="nota-automatica">{COPY_AUTOMATICA}</p>
            : <p className="text-xs text-green-400 font-sans">
                Ficha fechada em {formatDate(data.reviewed_at)}. Se editar algum campo, ela reabre e o script é refeito.
              </p>
        )}
        {sugerirNovaVersao && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-prosperus-gold-dark/30 bg-prosperus-gold-dark/[0.06] px-3 py-2" data-testid="sugestao-nova-versao">
            <p className="text-xs text-white/80 font-sans">Você mudou a ficha depois do script. Quer uma versão nova com o que mudou?</p>
            <Button variant="secondary" size="sm" onClick={pedirNovaVersao} loading={pedindoVersao} disabled={pedindoVersao}>Pedir nova versão</Button>
            {onNavigate && <Button variant="link" size="sm" onClick={() => onNavigate('script_script')}>Ver o script</Button>}
          </div>
        )}
      </div>

      {/* Suficiência parcial: só o que falta (o resto está guardado em "Preenchido pelos seus materiais") */}
      {modoCompletar && (
        <div className="rounded-lg bg-prosperus-neutral-white text-prosperus-navy p-4 sm:p-6 space-y-2" data-testid="banner-completar">
          <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Quase lá</p>
          <h3 className="font-serif text-xl sm:text-2xl text-prosperus-navy leading-snug">{textoFaltamRespostas(pendentesFoco.length)}</h3>
          <p className="text-sm text-prosperus-navy/75 font-sans leading-relaxed">
            O resto a gente preencheu com os seus materiais: está recolhido em "Preenchido pelos seus materiais" e você pode ajustar quando quiser.
            Ao responder a última, a gente já começa a escrever o seu script.
          </p>
        </div>
      )}

      {/* Suficiência insuficiente: ficha inteira + pedido de mais material */}
      {modoInsuficiente && (
        <div className="rounded-lg border border-prosperus-gold-dark/40 bg-prosperus-gold-dark/[0.08] p-4 sm:p-5 space-y-2" data-testid="banner-insuficiente">
          <h3 className="font-serif text-xl text-white leading-snug">{COPY_INSUFICIENTE}</h3>
          <p className="text-sm text-white/70 font-sans leading-relaxed">
            Os materiais que chegaram não bastaram para escrever o seu script. Você pode enviar mais (transcrição de uma venda, proposta, apostila) ou responder a ficha com a sua voz.
          </p>
          {onNavigate && <Button variant="secondary" size="md" onClick={() => onNavigate('script_materiais')}>Enviar mais materiais</Button>}
        </div>
      )}

      {/* Pre-preenchimento em marcos: na fila, em andamento (trilha de 7 etapas), pronto, em conferencia, erro */}
      {mostrarPainel && (
        <ProgressoPreenchimento
          job={job}
          sugestoes={sugestoesTotal}
          novas={novas}
          atualizadoEm={ultimaSincronia ?? null}
          onDispensar={dispensarSePronto}
        />
      )}

      {/* Achados em cima de campos decididos: no passo a passo ficam listados aqui (no "Ver tudo", sob cada campo) */}
      {modo === 'passo' && comComplemento.length > 0 && (
        <section className="space-y-2" data-testid="complementos-topo" aria-label="Encontramos mais nos seus materiais">
          {comComplemento.map((c) => (
            <ComplementoCampo key={c.key} campo={c} mostrarNome onIncorporar={incorporar} onDispensar={dispensar} onSalvarAjuste={salvarAjuste} />
          ))}
        </section>
      )}

      {/* Fechamento: papel creme, sem confete */}
      <AnimatePresence>
        {closedNow && (
          <motion.div
            key="ficha-closed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-lg bg-prosperus-neutral-white text-prosperus-navy p-5 sm:p-8 space-y-3"
            data-testid="ficha-fechada"
          >
            <p className="text-[11px] uppercase tracking-widest text-prosperus-gold-dark font-sans">Ficha do Script</p>
            <h3 className="font-serif text-2xl sm:text-3xl text-prosperus-navy">{autoFechouRef.current ? COPY_SCRIPT_GERANDO : 'Ficha fechada.'}</h3>
            <hr className="border-0 h-px bg-prosperus-gold-dark" aria-hidden="true" />
            <p className="text-sm text-prosperus-navy/80 font-sans leading-relaxed">
              {autoFechouRef.current
                ? 'Suas respostas completaram a ficha. O script chega em alguns minutos, com aviso no WhatsApp; ele aparece em "Seu script".'
                : 'Agora a gente escreve a primeira versão do seu script dos 7 passos. Você recebe para ler e ajustar.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {autoFechouRef.current && onNavigate && (
                <Button variant="primary" size="md" className="min-h-[44px]" onClick={() => onNavigate('script_script')}>Ver o script</Button>
              )}
              <Button variant="outline" size="md" className="min-h-[44px] !border-prosperus-navy/30 !text-prosperus-navy hover:!bg-prosperus-navy/5" onClick={() => setClosedNow(false)}>Entendi</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modo: passo a passo (padrao) ou ver tudo */}
      <div className="flex gap-2" role="group" aria-label="Modo de preenchimento">
        {(['passo', 'tudo'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => trocarModo(m)}
            aria-pressed={modo === m}
            className={`min-h-[44px] flex-1 sm:flex-none px-4 rounded-lg text-sm font-sans border transition ${
              modo === m ? 'bg-prosperus-gold-dark text-black border-prosperus-gold-dark font-semibold' : 'border-white/15 text-white/60 hover:text-white hover:border-white/30'
            }`}
          >
            {m === 'passo' ? 'Passo a passo' : 'Ver tudo'}
          </button>
        ))}
      </div>

      {/* Blocos: uma pergunta por tela (wizard) ou acordeoes */}
      {modo === 'passo' ? (
        <FichaWizard ficha={fichaDoWizard} contexto={contexto} onFecharFicha={handleClose} fechandoFicha={closingFicha} onRecarregar={recarregar} foco={foco} />
      ) : (
        <div className="space-y-3">
          {blocos.map(renderBlock)}
        </div>
      )}

      {/* Rodape */}
      <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {modoCompletar ? (
              <p className="text-sm text-white font-sans" data-testid="rodape-completar">
                {textoFaltamRespostas(pendentesFoco.length)}
                <span className="text-white/40"> · o resto veio dos seus materiais</span>
              </p>
            ) : (
              <p className="text-sm text-white font-sans">
                {progresso.obrigatorios_decididos} de {progresso.obrigatorios} obrigatórios decididos
                <span className="text-white/40"> · {progresso.decididos} de {progresso.total} no total</span>
              </p>
            )}
            {modoCompletar ? (
              <p className="text-xs text-white/50 font-sans mt-1">Ao responder a última, a gente já começa a escrever o seu script. Não precisa fechar a ficha.</p>
            ) : !allRequiredDone && (
              <p className="text-xs text-white/50 font-sans mt-1">
                Para fechar, cada campo obrigatório precisa de uma decisão: confirmar, editar ou deixar em branco por enquanto.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {onNavigate && (
              <Button variant="ghost" size="md" onClick={() => onNavigate('script_materiais')}>Materiais</Button>
            )}
            {!modoCompletar && (
              <Button
                variant="primary"
                size="lg"
                onClick={handleClose}
                disabled={!allRequiredDone || isConfirmed}
                loading={closingFicha}
              >
                {isConfirmed ? 'Ficha fechada' : 'Fechar ficha'}
              </Button>
            )}
          </div>
        </div>
        {closeError && <p className="text-xs text-red-400 font-sans">{closeError}</p>}
        <div className="w-full bg-white/10 rounded-full h-1.5">
          <div
            className="h-full bg-gradient-to-r from-prosperus-gold-dark to-prosperus-gold-light rounded-full transition-all"
            style={{ width: `${progresso.obrigatorios ? Math.round((progresso.obrigatorios_decididos / progresso.obrigatorios) * 100) : 0}%` }}
          />
        </div>
      </div>

      <ToastStack />
    </div>
  );
};
