import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { UseScriptFicha } from '../../hooks/useScriptFicha';
import type { ScriptBlockView, ScriptFieldView } from '../../data/script-ficha-fields';
import { FichaField } from './FichaField';
import { AccordionSection } from '../shared/AccordionSection';
import { CelebrationOverlay } from '../shared/CelebrationOverlay';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { Button } from '../ui/Button';

interface FichaScreenProps {
  ficha: UseScriptFicha;
  onNavigate?: (id: string) => void;
}

const BLOCK_ICONS: Record<number, string> = { 1: '🎯', 2: '👤', 3: '🧭', 4: '🧩', 5: '📦', 6: '🤝' };

// Uma frase por M (5 M's) para situar o bloco antes das perguntas
const BLOCK_INTRO: Record<number, string> = {
  1: 'Meta: onde você quer chegar, com número e prazo.',
  2: 'Mentor: quem você é e o que te legitima a cobrar caro.',
  3: 'Mentorado: para quem, com dor, desejo, setor, bolso e território.',
  4: 'Método: como você leva o cliente de A para B.',
  5: 'A Mentoria: o que vai ao mercado como oferta.',
  6: 'Venda: como a venda acontece hoje.',
};

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
  const { data, loading, loaded, error, saveState, decide, complete } = ficha;
  const [openBlock, setOpenBlock] = useState<number | null>(null);
  const [celebrating, setCelebrating] = useState<number | null>(null);
  const [closingFicha, setClosingFicha] = useState(false);
  const [closedNow, setClosedNow] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const prevClosedRef = useRef<Record<number, boolean>>({});
  const initializedRef = useRef(false);

  // Mapa chave -> campo: widgets que leem outro campo (4.3 e 4.4 leem os pilares do 4.2)
  const contexto = useMemo<Record<string, ScriptFieldView>>(
    () => Object.fromEntries((data?.blocos || []).flatMap((b) => b.campos.map((c) => [c.key, c]))),
    [data],
  );

  // Abre o primeiro bloco em aberto do dia de hoje na primeira carga
  useEffect(() => {
    if (!data || initializedRef.current) return;
    initializedRef.current = true;
    const first = data.hoje.blocos_abertos[0] ?? data.blocos.find((b) => !b.fechado)?.numero ?? 1;
    setOpenBlock(first);
    prevClosedRef.current = Object.fromEntries(data.blocos.map((b) => [b.numero, b.fechado]));
  }, [data]);

  // Celebra bloco que acabou de fechar (so por acao do mentor)
  useEffect(() => {
    if (!data || !initializedRef.current) return;
    for (const b of data.blocos) {
      const was = prevClosedRef.current[b.numero];
      if (was === false && b.fechado) {
        setCelebrating(b.numero);
      }
      prevClosedRef.current[b.numero] = b.fechado;
    }
  }, [data]);

  const handleCelebrationDone = useCallback(() => setCelebrating(null), []);

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

  const { hoje, progresso, blocos } = data;
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
                  <FichaField campo={f} onDecide={decide} contexto={contexto} />
                </div>
              ))}
            </div>
          </div>,
        );
        continue;
      }
      out.push(<FichaField key={c.key} campo={c} onDecide={decide} contexto={contexto} />);
    }
    return out;
  };

  const renderBlock = (b: ScriptBlockView) => {
    const isToday = hoje.blocos.includes(b.numero);
    return (
      <AccordionSection
        key={b.numero}
        title={`${b.numero}. ${b.nome}`}
        icon={BLOCK_ICONS[b.numero] || '•'}
        badge={isToday ? 'recommended' : 'optional'}
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
              {b.obrigatorios_decididos} de {b.obrigatorios} obrigatórios · ≈ {b.minutos_pendentes || b.minutos} min
            </p>
          </div>

          <AnimatePresence>
            {celebrating === b.numero && (
              <CelebrationOverlay
                key={`cel-${b.numero}`}
                variant="step"
                message={`Bloco ${b.nome} fechado.`}
                duration={1500}
                onComplete={handleCelebrationDone}
              />
            )}
          </AnimatePresence>

          {renderFields(b.campos)}
        </div>
      </AccordionSection>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto">
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
          Com a ficha fechada, a gente monta o script dos 7 passos da sua venda.
        </p>

        {/* Hoje */}
        <div className="bg-prosperus-navy-mid border border-prosperus-gold-dark/30 rounded-lg p-3 sm:p-4">
          {hoje.em_breve ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-serif text-lg text-prosperus-gold-light">Dia 3: revisar o script</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60 font-sans">em breve</span>
              <span className="text-xs text-white/50 font-sans">≈ {hoje.minutos} min · você recebe o script v1 para ler e ajustar</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-serif text-lg text-prosperus-gold-light">Hoje: {hoje.titulo}</span>
                <span className="text-sm text-white/70 font-sans">· ≈ {hoje.minutos} min</span>
              </div>
              <p className="text-xs text-white/50 font-sans">
                Dia {hoje.dia} de 3 · blocos {hoje.blocos.join(', ')} · {progresso.obrigatorios_decididos} de {progresso.obrigatorios} obrigatórios decididos
              </p>
            </div>
          )}
        </div>

        {isConfirmed && !closedNow && (
          <p className="text-xs text-green-400 font-sans">
            Ficha fechada em {formatDate(data.reviewed_at)}. Se editar algum campo, ela reabre e o script é refeito.
          </p>
        )}
      </div>

      {/* Fechamento */}
      <AnimatePresence>
        {closedNow && (
          <div className="bg-prosperus-navy-panel border border-prosperus-gold-dark/40 rounded-lg overflow-hidden">
            <CelebrationOverlay
              key="ficha-closed"
              variant="module"
              message="Ficha fechada."
              subMessage="Agora a gente monta o script v1 dos 7 passos. Você recebe para revisar no Dia 3."
              duration={4000}
              onComplete={() => setClosedNow(false)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Blocos */}
      <div className="space-y-3">
        {blocos.map(renderBlock)}
      </div>

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
    </div>
  );
};
