import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { MethodData, Pillar, MethodStep, ObstacleMap, ObstaclePair } from '../../types/diagnostic';
import { TextOrAudioInput } from '../shared/TextOrAudioInput';
import { StepTransition } from '../shared/StepTransition';
import { CelebrationOverlay } from '../shared/CelebrationOverlay';
import { Button } from '../ui/Button';

// ─────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────

interface MethodEdges {
  pointA: { internal: string; external: string };
  pointB: { internal: string; external: string };
}

interface MethodModuleProps {
  data: MethodData;
  onUpdate: (data: Partial<MethodData>) => void;
  token: string;
  edges: MethodEdges;
  onModuleComplete?: () => void;
}

// Task 4: Updated from 2 to 3 steps — 'Nível de Maturidade' added as Step 0 (AC 13, 14)
const STEPS = [
  { title: 'Nível de Maturidade', icon: '🌱' },
  { title: 'A Transformação', icon: '🌉' },
  { title: 'Mapa de Obstáculos', icon: '🧱' },
];

const STEP_TRANSITIONS: Record<number, string> = {
  1: 'Ótima estrutura! Agora os obstáculos...',
};

// Animation variants
const stepVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
};

const reducedMotionVariants = {
  enter: () => ({ opacity: 0 }),
  center: { opacity: 1 },
  exit: () => ({ opacity: 0 }),
};

const generateId = () => Math.random().toString(36).substring(2, 9);
const truncate = (str: string, maxLen: number) =>
  str && str.length > maxLen ? str.substring(0, maxLen) + '...' : str || '';

// Helper to get pairs from an ObstacleMap (with migration from legacy single-pair format)
const getPairs = (entry: ObstacleMap | undefined): ObstaclePair[] => {
  if (!entry) return [{ obstacle: '', solution: '' }];
  if (entry.pairs?.length) return entry.pairs;
  // Migrate legacy format
  return [{ obstacle: entry.obstacle || '', solution: entry.solution || '' }];
};

// ─────────────────────────────────────────
// Bridge Visual component
// ─────────────────────────────────────────
const BridgeVisual: React.FC<{ edges: MethodEdges }> = ({ edges }) => {
  const hasData =
    edges.pointA.internal || edges.pointA.external ||
    edges.pointB.internal || edges.pointB.external;

  if (!hasData) {
    return (
      <div className="p-4 bg-white/5 border border-white/10 rounded-lg text-center" aria-hidden="true">
        <p className="text-white/50 text-sm font-sans italic">
          Complete o módulo 'O Mentorado' para ver a transformação do seu cliente aqui.
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-stretch mb-6"
      aria-hidden="true"
    >
      {/* Point A */}
      <div className="p-4 rounded-xl border bg-red-500/10 border-red-500/30 space-y-2">
        <p className="text-xs font-bold font-sans text-red-400 uppercase tracking-wide">
          Ponto A — Antes
        </p>
        {edges.pointA.internal && (
          <div className="space-y-0.5">
            <p className="text-[11px] text-white/50 font-sans">❤️ Interno:</p>
            <p className="text-xs text-white/70 font-sans leading-relaxed">
              {truncate(edges.pointA.internal, 100)}
            </p>
          </div>
        )}
        {edges.pointA.external && (
          <div className="space-y-0.5">
            <p className="text-[11px] text-white/50 font-sans">📊 Externo:</p>
            <p className="text-xs text-white/70 font-sans leading-relaxed">
              {truncate(edges.pointA.external, 100)}
            </p>
          </div>
        )}
      </div>

      {/* Bridge center */}
      <div className="hidden sm:flex flex-col items-center justify-center gap-1 px-3">
        <div className="w-px flex-1 bg-gradient-to-b from-red-500/30 via-prosperus-gold-dark/40 to-emerald-500/30" />
        <span className="text-[10px] font-bold text-prosperus-gold-dark/60 font-sans uppercase tracking-wider whitespace-nowrap rotate-0">
          Seu Método
        </span>
        <div className="w-px flex-1 bg-gradient-to-b from-prosperus-gold-dark/40 via-emerald-500/30 to-emerald-500/20" />
      </div>

      {/* Mobile connector */}
      <div className="sm:hidden flex items-center justify-center gap-2 py-1">
        <div className="flex-1 h-px bg-gradient-to-r from-red-500/30 to-prosperus-gold-dark/40" />
        <span className="text-[10px] font-bold text-prosperus-gold-dark/60 font-sans uppercase tracking-wider">
          Seu Método
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-prosperus-gold-dark/40 to-emerald-500/30" />
      </div>

      {/* Point B */}
      <div className="p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/30 space-y-2">
        <p className="text-xs font-bold font-sans text-emerald-400 uppercase tracking-wide">
          Ponto B — Depois
        </p>
        {edges.pointB.internal && (
          <div className="space-y-0.5">
            <p className="text-[11px] text-white/50 font-sans">❤️ Interno:</p>
            <p className="text-xs text-white/70 font-sans leading-relaxed">
              {truncate(edges.pointB.internal, 100)}
            </p>
          </div>
        )}
        {edges.pointB.external && (
          <div className="space-y-0.5">
            <p className="text-[11px] text-white/50 font-sans">📊 Externo:</p>
            <p className="text-xs text-white/70 font-sans leading-relaxed">
              {truncate(edges.pointB.external, 100)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// Main component
// ─────────────────────────────────────────
export const MethodModule: React.FC<MethodModuleProps> = ({ data, onUpdate, token, edges, onModuleComplete }) => {
  const prefersReduced = useReducedMotion();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionMsg, setTransitionMsg] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);
  const [moduleComplete, setModuleComplete] = useState(false);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Horizontal builder selected item
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedPillarId, setSelectedPillarId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, []);

  // ── Navigation ──
  const triggerTransitionAndAdvance = (fromStep: number) => {
    const msg = STEP_TRANSITIONS[fromStep];
    if (msg) {
      setTransitionMsg(msg);
      setTransitioning(true);
    } else {
      setDirection(1);
      setCurrentStep(fromStep + 1);
    }
  };

  const handleTransitionComplete = () => {
    setTransitioning(false);
    setTransitionMsg('');
    setDirection(1);
    setCurrentStep((s) => s + 1);
  };

  // Task 4: Updated for 3-step flow (step 2 is now the last step)
  const goNext = () => {
    if (currentStep < 2 && !transitioning) {
      triggerTransitionAndAdvance(currentStep);
    } else if (currentStep === 2 && !transitioning && !moduleComplete) {
      setShowCelebration(true);
      setModuleComplete(true);
    }
  };

  const goPrev = () => {
    if (currentStep > 0 && !transitioning) {
      setDirection(-1);
      setCurrentStep(currentStep - 1);
    }
  };

  const jumpToStep = (i: number) => {
    if (i === currentStep || transitioning) return;
    setTransitioning(false);
    setTransitionMsg('');
    setDirection(i > currentStep ? 1 : -1);
    setCurrentStep(i);
  };

  // ── Derived data ──
  const pillars: Pillar[] = data.pillars || [];
  const steps: MethodStep[] = data.steps || [];
  const obstacles: ObstacleMap[] = data.obstacles || [];
  // Task 8: Fixed — removed overly strict guard; now simply checks maturity === 'structured' (AC 16)
  const isStructured = data.maturity === 'structured';

  // Next button disabled logic — updated for 3-step flow
  const isNextDisabled = (): boolean => {
    if (transitioning) return true;
    if (currentStep === 2 && moduleComplete) return true;
    if (currentStep === 0) {
      // Task 4: Maturity selection required to advance past Step 0 (AC 8)
      return !data.maturity;
    }
    if (currentStep === 1) {
      // Unified: both paths require name + promise + 3 items (pillars or steps)
      if (!data.name?.trim() || !data.promise?.trim()) return true;
      if (isStructured) return pillars.filter(p => p.what?.trim()).length < 3;
      return steps.filter(s => s.title?.trim()).length < 3;
    }
    return false;
  };

  // ── Pillar helpers ──
  const addPillar = useCallback(() => {
    if (pillars.length >= 8) return;
    onUpdate({ pillars: [...pillars, { id: generateId(), what: '', why: '', how: '' }] });
  }, [pillars, onUpdate]);

  const updatePillar = useCallback((id: string, field: keyof Omit<Pillar, 'id'>, value: string) => {
    onUpdate({ pillars: pillars.map(p => p.id === id ? { ...p, [field]: value } : p) });
  }, [pillars, onUpdate]);

  const deletePillar = useCallback((id: string) => {
    if (pillars.length <= 3) return;
    onUpdate({ pillars: pillars.filter(p => p.id !== id) });
    if (selectedPillarId === id) setSelectedPillarId(null);
  }, [pillars, onUpdate, selectedPillarId]);

  // ── Step helpers ──
  const addStep = useCallback(() => {
    onUpdate({ steps: [...steps, { id: generateId(), title: '', description: '' }] });
  }, [steps, onUpdate]);

  const updateStep = useCallback((id: string, field: keyof Omit<MethodStep, 'id'>, value: string) => {
    onUpdate({ steps: steps.map(s => s.id === id ? { ...s, [field]: value } : s) });
  }, [steps, onUpdate]);

  const deleteStep = useCallback((id: string) => {
    if (steps.length <= 3) return;
    onUpdate({
      steps: steps.filter(s => s.id !== id),
      obstacles: obstacles.filter(o => o.referenceId !== id),
    });
    if (selectedStepId === id) setSelectedStepId(null);
  }, [steps, obstacles, onUpdate, selectedStepId]);

  // ── Obstacle helpers (multi-pair) ──
  const updateObstaclePair = useCallback(
    (referenceId: string, pairIndex: number, field: 'obstacle' | 'solution', value: string) => {
      const existing = obstacles.find(o => o.referenceId === referenceId);
      if (existing) {
        const currentPairs = getPairs(existing);
        const newPairs = currentPairs.map((p, i) => i === pairIndex ? { ...p, [field]: value } : p);
        onUpdate({ obstacles: obstacles.map(o => o.referenceId === referenceId ? { ...o, pairs: newPairs } : o) });
      } else {
        const referenceName = isStructured
          ? (pillars.find(p => p.id === referenceId)?.what || '')
          : (steps.find(s => s.id === referenceId)?.title || '');
        const newPairs: ObstaclePair[] = [{ obstacle: field === 'obstacle' ? value : '', solution: field === 'solution' ? value : '' }];
        onUpdate({ obstacles: [...obstacles, { referenceId, referenceName, pairs: newPairs }] });
      }
    },
    [obstacles, pillars, steps, isStructured, onUpdate]
  );

  const addObstaclePair = useCallback(
    (referenceId: string) => {
      const existing = obstacles.find(o => o.referenceId === referenceId);
      const newPair: ObstaclePair = { obstacle: '', solution: '' };
      if (existing) {
        const currentPairs = getPairs(existing);
        onUpdate({ obstacles: obstacles.map(o => o.referenceId === referenceId ? { ...o, pairs: [...currentPairs, newPair] } : o) });
      } else {
        const referenceName = isStructured
          ? (pillars.find(p => p.id === referenceId)?.what || '')
          : (steps.find(s => s.id === referenceId)?.title || '');
        onUpdate({ obstacles: [...obstacles, { referenceId, referenceName, pairs: [newPair] }] });
      }
    },
    [obstacles, pillars, steps, isStructured, onUpdate]
  );

  const removeObstaclePair = useCallback(
    (referenceId: string, pairIndex: number) => {
      const existing = obstacles.find(o => o.referenceId === referenceId);
      if (!existing) return;
      const currentPairs = getPairs(existing);
      if (currentPairs.length <= 1) return;
      onUpdate({ obstacles: obstacles.map(o => o.referenceId === referenceId ? { ...o, pairs: currentPairs.filter((_, i) => i !== pairIndex) } : o) });
    },
    [obstacles, onUpdate]
  );

  // ── Initialize on mount ──
  // Task 4: Removed auto-maturity — user must explicitly choose in Step 0 (AC 8)
  // Existing users who already have maturity set retain their value (backward compat)
  // Steps initialized for non-structured flow; pillars initialized for structured
  useEffect(() => {
    const updates: Partial<MethodData> = {};
    if (data.maturity === 'structured') {
      if (pillars.length < 3) {
        const existing = [...pillars];
        while (existing.length < 3) {
          existing.push({ id: generateId(), what: '', why: '', how: '' });
        }
        updates.pillars = existing;
      }
    } else if (data.maturity && steps.length === 0) {
      updates.steps = [
        { id: generateId(), title: '', description: '' },
        { id: generateId(), title: '', description: '' },
        { id: generateId(), title: '', description: '' },
      ];
    } else if (!data.maturity && steps.length === 0) {
      // Pre-initialize steps for when user picks a non-structured maturity
      updates.steps = [
        { id: generateId(), title: '', description: '' },
        { id: generateId(), title: '', description: '' },
        { id: generateId(), title: '', description: '' },
      ];
    }
    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Task 7: Maturity switch with confirmation dialog when data already exists (AC 12)
  const handleMaturityChange = useCallback((newMaturity: 'not_yet' | 'in_head' | 'structured') => {
    if (data.maturity === newMaturity) return;
    const hasData = steps.some(s => s.title) || pillars.some(p => p.what);
    if (data.maturity && hasData) {
      const confirmed = window.confirm('Trocar o nível de maturidade irá reiniciar as etapas. Deseja continuar?');
      if (!confirmed) return;
      if (newMaturity === 'structured') {
        onUpdate({ maturity: newMaturity, steps: [], pillars: [
          { id: generateId(), what: '', why: '', how: '' },
          { id: generateId(), what: '', why: '', how: '' },
          { id: generateId(), what: '', why: '', how: '' },
        ], obstacles: [] });
      } else {
        onUpdate({
          maturity: newMaturity,
          pillars: [],
          steps: [
            { id: generateId(), title: '', description: '' },
            { id: generateId(), title: '', description: '' },
            { id: generateId(), title: '', description: '' },
          ],
          obstacles: [],
        });
      }
    } else {
      if (newMaturity === 'structured' && pillars.length < 3) {
        const existing = [...pillars];
        while (existing.length < 3) {
          existing.push({ id: generateId(), what: '', why: '', how: '' });
        }
        onUpdate({ maturity: newMaturity, pillars: existing });
      } else if (newMaturity !== 'structured' && steps.length === 0) {
        onUpdate({
          maturity: newMaturity,
          steps: [
            { id: generateId(), title: '', description: '' },
            { id: generateId(), title: '', description: '' },
            { id: generateId(), title: '', description: '' },
          ],
        });
      } else {
        onUpdate({ maturity: newMaturity });
      }
    }
  }, [data.maturity, steps, pillars, onUpdate]);

  // ─────────────────────────────────────
  // STEP 0 — Maturity Selector (Task 4)
  // ─────────────────────────────────────
  const renderStepMaturity = () => {
    const maturityOptions = [
      { value: 'not_yet' as const, icon: '🌱', label: 'Ainda não tenho um método' },
      { value: 'in_head' as const, icon: '💭', label: 'Tenho na cabeça, mas não está escrito' },
      { value: 'structured' as const, icon: '📋', label: 'Já tenho um método estruturado' },
    ];
    return (
      <div className="space-y-6">
        <div className="text-center">
          <span className="text-5xl block mb-4">🌱</span>
          <h3 className="font-serif text-xl text-white mb-1">Nível de Maturidade do Método</h3>
          <p className="text-sm text-white/50 font-sans">
            Qual é o estado atual do seu método? Isso define como vamos estruturá-lo.
          </p>
        </div>
        <div className="space-y-3">
          {maturityOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleMaturityChange(opt.value)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                data.maturity === opt.value
                  ? 'border-prosperus-gold-dark bg-prosperus-gold-dark/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
              }`}
            >
              <span className="text-3xl flex-shrink-0">{opt.icon}</span>
              <span className={`text-sm font-semibold font-sans ${data.maturity === opt.value ? 'text-white' : 'text-white/70'}`}>
                {opt.label}
              </span>
              {data.maturity === opt.value && (
                <span className="ml-auto text-prosperus-gold-dark text-xs font-bold font-sans flex-shrink-0">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────
  // STEP 1 — Method Structure (steps or pillars builder)
  // ─────────────────────────────────────
  const renderStepTransformation = () => {
    const subtitle = isStructured
      ? 'Defina o nome, a promessa e os pilares do seu método estruturado.'
      : data.maturity === 'not_yet'
      ? 'Vamos construir juntos o passo a passo da transformação que você entrega.'
      : 'Hora de tirar da cabeça! Descreva o caminho que seus mentorados percorrem.';

    const namePlaceholder = isStructured
      ? 'Ex: Método SCALE, Framework 3P...'
      : 'Ex: Jornada Clarity, Caminho da Transformação...';

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <span className="text-5xl block mb-4">🌉</span>
          <h3 className="font-serif text-xl text-white mb-1">A Transformação</h3>
          <p className="text-sm text-white/50 font-sans">{subtitle}</p>
        </div>

        {/* Bridge Visual — always shown */}
        <BridgeVisual edges={edges} />

        {/* Method Name — required for all paths */}
        <div className="space-y-1.5">
          <label className="block text-sm font-sans text-white/60" htmlFor="method-name">
            Nome do seu método <span className="text-red-400">*</span>
          </label>
          <input
            id="method-name"
            type="text"
            value={data.name || ''}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={namePlaceholder}
            className="w-full p-2.5 bg-prosperus-navy-mid border border-white/10 rounded text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50"
          />
        </div>

        {/* Method Promise — required for all paths */}
        <div className="space-y-1.5">
          <label className="block text-sm font-sans text-white/60" htmlFor="method-promise">
            Promessa do método — que transformação ele entrega? <span className="text-red-400">*</span>
          </label>
          <input
            id="method-promise"
            type="text"
            value={data.promise || ''}
            onChange={(e) => onUpdate({ promise: e.target.value })}
            placeholder="Ex: Escalar mentoria de 10k para 100k em 6 meses"
            maxLength={250}
            className="w-full p-2.5 bg-prosperus-navy-mid border border-white/10 rounded text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50"
          />
          <p className="text-[11px] text-white/50 font-sans text-right">
            {(data.promise || '').length}/250
          </p>
        </div>

        {/* ── Path-specific "meat" ── */}
        <div className="border-t border-white/10 pt-6">
          {isStructured ? (
            /* ── Structured: Pillars builder ── */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white font-sans">Pilares do Método</h4>
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold font-sans bg-white/10 text-white/50 border border-white/10">
                  Mín. 3 · Máx. 8
                </span>
              </div>

              {/* Horizontal scrollable pillar cards */}
              <div className="overflow-x-auto pb-2 -mx-1 px-1">
                <div className="flex items-start gap-0 min-w-max">
                  {pillars.map((pillar, index) => (
                    <React.Fragment key={pillar.id}>
                      {index > 0 && (
                        <div className="flex items-center flex-shrink-0 h-16 px-1">
                          <span className="text-white/50 text-sm">+</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedPillarId(selectedPillarId === pillar.id ? null : pillar.id)}
                        className={`snap-start flex-shrink-0 w-40 p-3 rounded-lg border transition-all text-left ${
                          selectedPillarId === pillar.id
                            ? 'border-prosperus-gold-dark bg-prosperus-gold-dark/10'
                            : pillar.what
                            ? 'border-green-500/30 bg-green-500/5'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <span className="w-6 h-6 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-dark text-xs font-bold font-sans flex items-center justify-center mb-2">
                          {index + 1}
                        </span>
                        <p className="text-xs text-white/70 font-sans truncate">
                          {pillar.what || <span className="text-white/50 italic">Sem nome</span>}
                        </p>
                      </button>
                    </React.Fragment>
                  ))}
                  {/* Add pillar */}
                  {pillars.length < 8 && (
                    <>
                      <div className="flex items-center flex-shrink-0 h-16 px-1">
                        <span className="text-white/50 text-sm">+</span>
                      </div>
                      <button
                        type="button"
                        onClick={addPillar}
                        aria-label="Adicionar pilar"
                        className="snap-start flex-shrink-0 w-40 h-16 rounded-lg border-2 border-dashed border-white/20 hover:border-prosperus-gold-dark/40 text-white/50 hover:text-prosperus-gold-dark transition-colors flex items-center justify-center text-sm font-semibold"
                      >
                        + Pilar
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Edit panel for selected pillar */}
              <AnimatePresence>
                {selectedPillarId && (() => {
                  const pillar = pillars.find(p => p.id === selectedPillarId);
                  const index = pillars.findIndex(p => p.id === selectedPillarId);
                  if (!pillar) return null;
                  return (
                    <motion.div
                      key={selectedPillarId}
                      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="p-4 bg-white/5 border border-prosperus-gold-dark/30 rounded-lg space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="w-6 h-6 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-dark text-xs font-bold font-sans flex items-center justify-center">
                          {index + 1}
                        </span>
                        <Button
                          variant="icon"
                          onClick={() => deletePillar(pillar.id)}
                          disabled={pillars.length <= 3}
                          aria-label={`Remover pilar ${index + 1}`}
                          className={`text-base ${pillars.length <= 3 ? 'text-white/20' : 'text-white/50 hover:text-red-400'}`}
                        >
                          🗑️
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-sm font-sans text-white/60" htmlFor={`pillar-what-${pillar.id}`}>
                          Nome do pilar <span className="text-red-400">*</span>
                        </label>
                        <input
                          id={`pillar-what-${pillar.id}`}
                          type="text"
                          value={pillar.what}
                          onChange={(e) => updatePillar(pillar.id, 'what', e.target.value)}
                          placeholder="Ex: Diagnóstico, Posicionamento, Escala..."
                          className="w-full p-2.5 bg-prosperus-navy-mid border border-white/10 rounded text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-sm font-sans text-white/60" htmlFor={`pillar-why-${pillar.id}`}>
                          Por que importa
                        </label>
                        <textarea
                          id={`pillar-why-${pillar.id}`}
                          value={pillar.why}
                          onChange={(e) => updatePillar(pillar.id, 'why', e.target.value)}
                          placeholder="Por que este pilar é essencial no método?"
                          rows={2}
                          className="w-full p-2.5 bg-prosperus-navy-mid border border-white/10 rounded text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50 resize-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-sm font-sans text-white/60" htmlFor={`pillar-how-${pillar.id}`}>
                          Como funciona
                        </label>
                        <textarea
                          id={`pillar-how-${pillar.id}`}
                          value={pillar.how}
                          onChange={(e) => updatePillar(pillar.id, 'how', e.target.value)}
                          placeholder="Como você aplica este pilar na prática?"
                          rows={2}
                          className="w-full p-2.5 bg-prosperus-navy-mid border border-white/10 rounded text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50 resize-none"
                        />
                      </div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>
          ) : (
            /* ── Non-structured: Steps builder ── */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white font-sans">Etapas da Transformação</h4>
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold font-sans bg-white/10 text-white/50 border border-white/10">
                  Mín. 3
                </span>
              </div>

              {/* Horizontal scrollable row */}
              <div className="overflow-x-auto pb-2 -mx-1 px-1">
                <div className="flex items-start gap-0 min-w-max">
                  {steps.map((step, index) => (
                    <React.Fragment key={step.id}>
                      {index > 0 && (
                        <div className="flex items-center flex-shrink-0 h-16 px-1">
                          <span className="text-white/50 text-sm">→</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedStepId(selectedStepId === step.id ? null : step.id)}
                        className={`snap-start flex-shrink-0 w-40 p-3 rounded-lg border transition-all text-left ${
                          selectedStepId === step.id
                            ? 'border-prosperus-gold-dark bg-prosperus-gold-dark/10'
                            : step.title
                            ? 'border-green-500/30 bg-green-500/5'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <span className="w-6 h-6 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-dark text-xs font-bold font-sans flex items-center justify-center mb-2">
                          {index + 1}
                        </span>
                        <p className="text-xs text-white/70 font-sans truncate">
                          {step.title || <span className="text-white/50 italic">Sem título</span>}
                        </p>
                      </button>
                    </React.Fragment>
                  ))}
                  {/* Add step */}
                  <>
                    <div className="flex items-center flex-shrink-0 h-16 px-1">
                      <span className="text-white/50 text-sm">→</span>
                    </div>
                    <button
                      type="button"
                      onClick={addStep}
                      aria-label="Adicionar etapa"
                      className="snap-start flex-shrink-0 w-40 h-16 rounded-lg border-2 border-dashed border-white/20 hover:border-prosperus-gold-dark/40 text-white/50 hover:text-prosperus-gold-dark transition-colors flex items-center justify-center text-sm font-semibold"
                    >
                      + Etapa
                    </button>
                  </>
                </div>
              </div>

              {/* Edit panel for selected step */}
              <AnimatePresence>
                {selectedStepId && (() => {
                  const step = steps.find(s => s.id === selectedStepId);
                  const index = steps.findIndex(s => s.id === selectedStepId);
                  if (!step) return null;
                  return (
                    <motion.div
                      key={selectedStepId}
                      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="p-4 bg-white/5 border border-prosperus-gold-dark/30 rounded-lg space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="w-6 h-6 rounded-full bg-prosperus-gold-dark/20 text-prosperus-gold-dark text-xs font-bold font-sans flex items-center justify-center">
                          {index + 1}
                        </span>
                        <Button
                          variant="icon"
                          onClick={() => deleteStep(step.id)}
                          disabled={steps.length <= 3}
                          aria-label={`Remover etapa ${index + 1}`}
                          className={`text-base ${steps.length <= 3 ? 'text-white/20' : 'text-white/50 hover:text-red-400'}`}
                        >
                          🗑️
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-sm font-sans text-white/60" htmlFor={`step-title-${step.id}`}>
                          Nome da etapa <span className="text-red-400">*</span>
                        </label>
                        <input
                          id={`step-title-${step.id}`}
                          type="text"
                          value={step.title}
                          onChange={(e) => updateStep(step.id, 'title', e.target.value)}
                          placeholder="Ex: Diagnóstico Inicial"
                          className="w-full p-2.5 bg-prosperus-navy-mid border border-white/10 rounded text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50"
                        />
                      </div>

                      <TextOrAudioInput
                        label="Descreva o que acontece nessa etapa"
                        value={step.description}
                        onChange={(value) => updateStep(step.id, 'description', value)}
                        onInputTypeChange={(type) => { if (type !== 'link') updateStep(step.id, 'inputType', type); }}
                        initialInputType={step.inputType}
                        maxAudioDuration={180}
                        required={false}
                        questionId={`method-step-${step.id}`}
                        token={token}
                        module="method"
                      />
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────
  // STEP 2 — Key Obstacles Map (multi-pair)
  // Task 6: obstacles mapped to pillars when isStructured, to steps otherwise (AC 9, 10)
  // ─────────────────────────────────────
  const renderStepObstacles = () => {
    const rows = isStructured
      ? pillars.filter(p => p.what).map(p => ({ id: p.id, name: p.what }))
      : steps.filter(s => s.title).map((s, i) => ({ id: s.id, name: s.title || `Etapa ${i + 1}` }));

    const emptyMessage = isStructured
      ? 'Complete os pilares no passo anterior para ver o mapa de obstáculos.'
      : 'Complete o passo anterior para ver o mapa de obstáculos.';

    const descriptionText = isStructured
      ? 'Para cada pilar do seu método, qual é o principal obstáculo? E qual é a SUA solução?'
      : 'Para cada etapa do seu método, qual é o principal obstáculo que trava as pessoas? E qual é a SUA solução?';

    return (
      <div className="space-y-6">
        <div className="text-center">
          <span className="text-5xl block mb-4">🧱</span>
          <div className="flex justify-center mb-3">
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold font-sans bg-white/10 text-white/50 border border-white/10">
              Opcional
            </span>
          </div>
          <h3 className="font-serif text-xl text-white mb-1">Mapa de Obstáculos</h3>
          <p className="text-sm text-white/50 font-sans">
            {descriptionText}
          </p>
        </div>

        <div className="space-y-4">
          {rows.length === 0 ? (
            <p className="text-white/50 text-sm font-sans text-center py-4 italic">
              {emptyMessage}
            </p>
          ) : (
            rows.map((row, index) => {
              const entry = obstacles.find(o => o.referenceId === row.id);
              const pairs = getPairs(entry);

              return (
                <div
                  key={row.id}
                  className="p-4 bg-white/5 border border-white/10 rounded-lg space-y-4"
                >
                  <p className="text-xs font-bold text-prosperus-gold-dark/80 font-sans">
                    {index + 1}. {row.name}
                  </p>

                  {pairs.map((pair, pairIndex) => (
                    <div key={pairIndex} className="space-y-3 pl-3 border-l-2 border-white/10">
                      {pairs.length > 1 && (
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] text-white/50 font-sans">Par {pairIndex + 1}</span>
                          <Button
                            variant="icon"
                            onClick={() => removeObstaclePair(row.id, pairIndex)}
                            aria-label={`Remover par ${pairIndex + 1}`}
                            className="text-red-400/40 hover:text-red-400 text-xs"
                          >
                            🗑️
                          </Button>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="block text-sm font-sans text-white/60" htmlFor={`obstacle-${row.id}-${pairIndex}`}>
                          🧱 Obstáculo:
                        </label>
                        <input
                          id={`obstacle-${row.id}-${pairIndex}`}
                          type="text"
                          value={pair.obstacle}
                          onChange={(e) => updateObstaclePair(row.id, pairIndex, 'obstacle', e.target.value)}
                          placeholder="O que trava as pessoas nessa etapa?"
                          aria-label={`Obstáculo para ${row.name} par ${pairIndex + 1}`}
                          className="w-full p-2.5 bg-prosperus-navy-mid border border-white/10 rounded text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-sm font-sans text-white/60" htmlFor={`solution-${row.id}-${pairIndex}`}>
                          🪜 Solução:
                        </label>
                        <input
                          id={`solution-${row.id}-${pairIndex}`}
                          type="text"
                          value={pair.solution}
                          onChange={(e) => updateObstaclePair(row.id, pairIndex, 'solution', e.target.value)}
                          placeholder="Como você resolve isso?"
                          aria-label={`Solução para ${row.name} par ${pairIndex + 1}`}
                          className="w-full p-2.5 bg-prosperus-navy-mid border border-white/10 rounded text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50"
                        />
                      </div>
                    </div>
                  ))}

                  <Button
                    variant="ghost"
                    fullWidth
                    onClick={() => addObstaclePair(row.id)}
                    className="py-2 border border-dashed border-white/20 hover:border-prosperus-gold-dark/30 text-white/50 hover:text-prosperus-gold-dark text-xs"
                  >
                    + Adicionar Obstáculo
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <p className="text-sm text-white/50 font-sans text-center">
          Esses obstáculos e soluções alimentam diretamente a arquitetura da sua oferta.
        </p>
      </div>
    );
  };

  // Task 4: Added renderStepMaturity at index 0 (AC 13)
  const stepRenderers = [renderStepMaturity, renderStepTransformation, renderStepObstacles];
  const activeVariants = prefersReduced ? reducedMotionVariants : stepVariants;

  return (
    <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl">

      {/* Module celebration overlay */}
      <AnimatePresence>
        {showCelebration && (
          <CelebrationOverlay
            message="Método mapeado!"
            subMessage="Agora a Brand Brain sabe COMO você transforma seus clientes."
            variant="module"
            duration={2000}
            onComplete={() => {
              setShowCelebration(false);
              onModuleComplete?.();
            }}
          />
        )}
      </AnimatePresence>

      {!showCelebration && (
        <>
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-6">
            <div
              className="flex items-center gap-3"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="text-xs font-semibold text-prosperus-gold-dark bg-prosperus-gold-dark/10 px-3 py-1 rounded-full">
                Passo {currentStep + 1} de 3
              </span>
              <span className="text-sm text-white/60 font-sans">
                {STEPS[currentStep].title}
              </span>
            </div>
            <div className="flex gap-0">
              {STEPS.map((step, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => jumpToStep(i)}
                  title={step.title}
                  aria-label={`Ir para: ${step.title}`}
                  aria-current={i === currentStep ? 'step' : undefined}
                  className={`flex items-center justify-center w-11 h-11 rounded-full transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-prosperus-gold-dark ${
                    i === currentStep
                      ? 'cursor-default'
                      : 'cursor-pointer'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full transition-all ${
                    i === currentStep
                      ? 'bg-prosperus-gold-dark scale-125'
                      : i < currentStep
                      ? 'bg-prosperus-gold-dark/40 hover:bg-prosperus-gold-dark/70'
                      : 'bg-white/10 hover:bg-white/20'
                  }`} />
                </button>
              ))}
            </div>
          </div>

          {/* Step content */}
          <div className="min-h-[400px]">
            <AnimatePresence mode="wait" custom={direction}>
              {transitioning ? (
                <motion.div
                  key="transition"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <StepTransition
                    message={transitionMsg}
                    duration={900}
                    onComplete={handleTransitionComplete}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={currentStep}
                  custom={direction}
                  variants={activeVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    duration: prefersReduced ? 0 : 0.25,
                    ease: 'easeInOut',
                  }}
                >
                  {stepRenderers[currentStep]()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-8 pt-4 border-t border-white/10">
            <button
              onClick={goPrev}
              disabled={currentStep === 0 || transitioning}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                currentStep === 0 || transitioning
                  ? 'bg-white/5 text-white/50 cursor-not-allowed'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              Anterior
            </button>
            <button
              onClick={goNext}
              disabled={isNextDisabled()}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                isNextDisabled()
                  ? 'bg-prosperus-gold-dark/30 text-prosperus-gold-dark/50 cursor-not-allowed'
                  : 'bg-prosperus-gold-dark hover:bg-prosperus-gold-hover text-black'
              }`}
            >
              {currentStep === 2 ? 'Concluir' : 'Próximo'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
