import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { UseScriptFicha } from '../../hooks/useScriptFicha';
import type { ScriptBlockView, ScriptFieldView } from '../../data/script-ficha-fields';
import { campoRefinando } from '../../hooks/useContextoCampo';
import { FichaField } from './FichaField';
import { FichaWizard } from './FichaWizard';
import { BLOCK_INTRO } from './FichaNavegador';
import { ToastStack } from './contexto/ToastStack';
import { emitirToast } from './contexto/toast';
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
    return <span className="text-xs text-red-400 font-sans">Não salvou. Tentamos de novo na próxima alteração.</span>;
  }
  return <span className="text-xs text-white/30 font-sans">Salva sozinha</span>;
};

export const FichaScreen: React.FC<FichaScreenProps> = ({ ficha, onNavigate }) => {
  const { data, loading, loaded, error, saveState, decide, complete, flush, refresh } = ficha;
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

  const handleClose = async () => {
    setClosingFicha(true);
    setCloseError(null);
    const r = await complete();
    setClosingFicha(false);
    if (r.ok) {
      setClosedNow(true);
    } else {
      setCloseError(r.message || 'Não foi possível fechar a ficha agora.');
    }
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
              {[c, outro].map((f) => (
                <div key={f.key} className="space-y-2 min-w-0">
                  <span className="block text-[11px] uppercase tracking-wide text-white/50 font-sans">{f.template?.rotulo || f.nome}</span>
                  <FichaField campo={f} onDecide={decide} contexto={contexto} onRecarregar={recarregar} />
                </div>
              ))}
            </div>
          </div>,
        );
        continue;
      }
      out.push(<FichaField key={c.key} campo={c} onDecide={decide} contexto={contexto} onRecarregar={recarregar} />);
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
    <div className={`space-y-4 sm:space-y-6 mx-auto ${modo === 'passo' ? 'max-w-3xl lg:max-w-5xl' : 'max-w-3xl'}`}>
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
          Revise o que já encontramos sobre a sua mentoria: confirme, edite ou preencha. Cada campo mostra de onde veio.
          Faltou algo? Adicione contexto (áudio, foto, vídeo, link ou nota) e peça uma nova sugestão.
          Com a ficha fechada, a gente monta o script dos 7 passos da sua venda.
        </p>

        {isConfirmed && !closedNow && (
          <p className="text-xs text-green-400 font-sans">
            Ficha fechada em {formatDate(data.reviewed_at)}. Se editar algum campo, ela reabre e o script é refeito.
          </p>
        )}
      </div>

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
            <h3 className="font-serif text-2xl sm:text-3xl text-prosperus-navy">Ficha fechada.</h3>
            <hr className="border-0 h-px bg-prosperus-gold-dark" aria-hidden="true" />
            <p className="text-sm text-prosperus-navy/80 font-sans leading-relaxed">
              Agora a gente monta o script v1 dos 7 passos. Você recebe para ler e ajustar.
            </p>
            <Button variant="outline" size="md" className="min-h-[44px] !border-prosperus-navy/30 !text-prosperus-navy hover:!bg-prosperus-navy/5" onClick={() => setClosedNow(false)}>Entendi</Button>
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
        <FichaWizard ficha={ficha} contexto={contexto} onFecharFicha={handleClose} fechandoFicha={closingFicha} onRecarregar={recarregar} />
      ) : (
        <div className="space-y-3">
          {blocos.map(renderBlock)}
        </div>
      )}

      {/* Rodape */}
      <div className="bg-prosperus-navy-panel border border-white/5 rounded-lg p-4 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white font-sans">
              {progresso.obrigatorios_decididos} de {progresso.obrigatorios} obrigatórios decididos
              <span className="text-white/40"> · {progresso.decididos} de {progresso.total} no total</span>
            </p>
            {!allRequiredDone && (
              <p className="text-xs text-white/50 font-sans mt-1">
                Para fechar, cada campo obrigatório precisa de uma decisão: confirmar, editar ou deixar em branco por enquanto.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {onNavigate && (
              <Button variant="ghost" size="md" onClick={() => onNavigate('script_materiais')}>Materiais</Button>
            )}
            <Button
              variant="primary"
              size="lg"
              onClick={handleClose}
              disabled={!allRequiredDone || isConfirmed}
              loading={closingFicha}
            >
              {isConfirmed ? 'Ficha fechada' : 'Fechar ficha'}
            </Button>
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
