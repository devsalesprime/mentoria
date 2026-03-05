import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { MenteeData } from '../../types/diagnostic';
import { TextOrAudioInput } from '../shared/TextOrAudioInput';
import { StepTransition } from '../shared/StepTransition';
import { CelebrationOverlay } from '../shared/CelebrationOverlay';

interface MenteeModuleProps {
  data: MenteeData;
  onUpdate: (data: Partial<MenteeData>) => void;
  token: string;
  onModuleComplete?: () => void;
}

const STEPS = [
  { title: 'Você já tem clientes?', icon: '👥' },
  { title: 'Antes de Te Encontrar', icon: '😰' },
  { title: 'O Momento da Decisão', icon: '🤔' },
  { title: 'Depois de Trabalhar com Você', icon: '🎯' },
  { title: 'Seu Cliente Ideal', icon: '🎯' },
  { title: 'Quem Você Quer Repelir?', icon: '🚫' },
];

const STEP_TRANSITIONS: Record<number, string> = {
  0: 'Vamos percorrer a jornada deles...',
  1: 'Agora o ponto de virada...',
  2: 'E a transformação...',
  3: 'Ótimo mapa de jornada! Agora vamos ampliar a visão...',
  4: 'Quase lá nesse módulo!',
};

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

// ============================================================
// Journey Map — compact 3-phase horizontal overview
// ============================================================
const JOURNEY_PHASES = [
  { label: 'Antes', sublabel: 'Interno / Externo', stepIndex: 1 },
  { label: 'Decisão', sublabel: 'Interno / Externo', stepIndex: 2 },
  { label: 'Depois', sublabel: 'Interno / Externo', stepIndex: 3 },
];

const JourneyMap: React.FC<{ currentStepIndex: number }> = ({ currentStepIndex }) => (
  <div
    className="hidden sm:flex items-center gap-1 px-3 py-2.5 mb-2 border border-white/5 rounded-lg bg-white/5"
    aria-hidden="true"
  >
    {JOURNEY_PHASES.map((phase, i) => {
      const isActive = phase.stepIndex === currentStepIndex;
      const isCompleted = phase.stepIndex < currentStepIndex;
      return (
        <React.Fragment key={phase.label}>
          <div
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
              isActive
                ? 'bg-prosperus-gold-dark/15 border border-prosperus-gold-dark/30'
                : isCompleted
                ? 'bg-green-500/10 border border-green-500/20'
                : 'bg-white/5 border border-white/5'
            }`}
          >
            <span
              className={`text-xs font-semibold font-sans ${
                isActive
                  ? 'text-prosperus-gold-dark'
                  : isCompleted
                  ? 'text-green-400'
                  : 'text-white/50'
              }`}
            >
              {isCompleted ? '✓ ' : ''}
              {phase.label}
            </span>
            <span
              className={`text-[10px] font-sans ${
                isActive
                  ? 'text-prosperus-gold-dark/70'
                  : isCompleted
                  ? 'text-green-400/60'
                  : 'text-white/50'
              }`}
            >
              {phase.sublabel}
            </span>
          </div>
          {i < JOURNEY_PHASES.length - 1 && (
            <div className="flex-1 h-px bg-white/10" />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ============================================================
// Flow indicator badge
// ============================================================
const FlowBadge: React.FC<{ isFlowA: boolean }> = ({ isFlowA }) => (
  <div className="flex items-center gap-2 mb-1">
    <span
      className={`text-xs px-2.5 py-1 rounded-full font-semibold font-sans ${
        isFlowA
          ? 'bg-green-500/15 text-green-400 border border-green-500/20'
          : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
      }`}
    >
      {isFlowA ? '🟢 Baseado em clientes reais' : '🟡 Construindo seu cenário ideal'}
    </span>
  </div>
);

// ============================================================
// Main module
// ============================================================
export const MenteeModule: React.FC<MenteeModuleProps> = ({ data, onUpdate, token, onModuleComplete }) => {
  const prefersReduced = useReducedMotion();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionMsg, setTransitionMsg] = useState('');
  const [showModuleCelebration, setShowModuleCelebration] = useState(false);
  const [moduleComplete, setModuleComplete] = useState(false);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, []);

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

  const handleClientSelect = (value: 'yes' | 'no') => {
    onUpdate({ hasClients: value });
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    autoAdvanceRef.current = setTimeout(() => {
      triggerTransitionAndAdvance(0);
    }, 400);
  };

  const isStep4Blocked = currentStep === 4 && !data.idealClientGeneral?.trim();

  const goNext = () => {
    // Clear pending auto-advance when user manually navigates step 0
    if (currentStep === 0 && autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    if (currentStep < 5 && !transitioning) {
      if (isStep4Blocked) return;
      triggerTransitionAndAdvance(currentStep);
    } else if (currentStep === 5 && !transitioning && !moduleComplete) {
      setShowModuleCelebration(true);
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

  const isFlowA = data.hasClients !== 'no';

  // ==========================================
  // Step 2.1 — Client Branching Toggle
  // ==========================================
  const renderStep1 = () => {
    const options = [
      {
        value: 'yes' as const,
        icon: '✅',
        title: 'Sim, já tenho clientes',
        subtitle: 'Vamos perguntar sobre a jornada real deles',
      },
      {
        value: 'no' as const,
        icon: '🚀',
        title: 'Ainda não',
        subtitle: 'Vamos trabalhar com o cenário ideal',
      },
    ];

    return (
      <div className="space-y-6">
        <div className="text-center">
          <span className="text-5xl block mb-4">👥</span>
          <h3 className="font-serif text-xl text-white mb-1">
            Você já tem clientes pagantes?
          </h3>
          <p className="text-sm text-white/50 font-sans">
            Isso vai definir como vamos perguntar sobre a jornada do seu cliente.
          </p>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          role="radiogroup"
          aria-label="Você já tem clientes pagantes?"
        >
          {options.map((opt) => {
            const isSelected = data.hasClients === opt.value;
            return (
              <button
                key={opt.value}
                role="radio"
                aria-checked={isSelected}
                aria-label={opt.title}
                tabIndex={0}
                onClick={() => handleClientSelect(opt.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClientSelect(opt.value);
                  }
                }}
                className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 cursor-pointer transition-all text-center focus:outline-none focus:ring-2 focus:ring-prosperus-gold-dark/50 ${
                  isSelected
                    ? 'border-prosperus-gold-dark bg-prosperus-gold-dark/10 shadow-lg shadow-prosperus-gold-dark/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                }`}
              >
                <span className="text-3xl">{opt.icon}</span>
                <div>
                  <p
                    className={`font-semibold text-sm font-sans ${
                      isSelected ? 'text-prosperus-gold-dark' : 'text-white/70'
                    }`}
                  >
                    {opt.title}
                  </p>
                  <p
                    className={`text-sm mt-1 font-sans ${
                      isSelected ? 'text-prosperus-gold-dark/70' : 'text-white/50'
                    }`}
                  >
                    {opt.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ==========================================
  // Step 2.2 — Before State
  // ==========================================
  const renderStep2 = () => (
    <div className="space-y-5">
      <JourneyMap currentStepIndex={1} />
      <FlowBadge isFlowA={isFlowA} />

      <div className="text-center">
        <span className="text-5xl block mb-4">😰</span>
        <h3 className="font-serif text-xl text-white mb-1">Antes de Te Encontrar</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 2.2a Internal */}
        <div className="space-y-2 p-4 rounded-lg border border-white/5 bg-white/5">
          <div className="flex items-center gap-2">
            <span className="text-base">❤️</span>
            <span className="text-xs font-semibold text-white/60 font-sans uppercase tracking-wide">
              Interno (emoções)
            </span>
          </div>
          <TextOrAudioInput
            label={
              isFlowA
                ? 'Como era a vida/trabalho deles ANTES de te encontrar? O que sentiam — estresse, frustração, medo?'
                : 'O que você imagina que seu cliente ideal está sentindo agora? Qual é o estado emocional dele?'
            }
            value={data.beforeInternal || ''}
            onChange={(value) => onUpdate({ beforeInternal: value })}
            onInputTypeChange={(type) => { if (type !== 'link') onUpdate({ beforeInternalInputType: type }); }}
            initialInputType={data.beforeInternalInputType}
            maxAudioDuration={120}
            required={false}
            questionId="2.2a"
            token={token}
            module="mentee"
          />
        </div>

        {/* 2.2b External */}
        <div className="space-y-2 p-4 rounded-lg border border-white/5 bg-white/5">
          <div className="flex items-center gap-2">
            <span className="text-base">📊</span>
            <span className="text-xs font-semibold text-white/60 font-sans uppercase tracking-wide">
              Externo (fatos)
            </span>
          </div>
          <TextOrAudioInput
            label={
              isFlowA
                ? 'Quais eram os fatos e números reais da situação deles naquela época?'
                : 'Qual situação real e mensurável você imagina que eles estão?'
            }
            value={data.beforeExternal || ''}
            onChange={(value) => onUpdate({ beforeExternal: value })}
            onInputTypeChange={(type) => { if (type !== 'link') onUpdate({ beforeExternalInputType: type }); }}
            initialInputType={data.beforeExternalInputType}
            maxAudioDuration={60}
            required={false}
            questionId="2.2b"
            token={token}
            module="mentee"
          />
        </div>
      </div>
    </div>
  );

  // ==========================================
  // Step 2.3 — Decision Moment
  // ==========================================
  const renderStep3 = () => (
    <div className="space-y-5">
      <JourneyMap currentStepIndex={2} />
      <FlowBadge isFlowA={isFlowA} />

      <div className="text-center">
        <span className="text-5xl block mb-4">🤔</span>
        <h3 className="font-serif text-xl text-white mb-1">O Momento da Decisão</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 2.3a Fears */}
        <div className="space-y-2 p-4 rounded-lg border border-white/5 bg-white/5">
          <div className="flex items-center gap-2">
            <span className="text-base">❤️</span>
            <span className="text-xs font-semibold text-white/60 font-sans uppercase tracking-wide">
              Medos / Hesitações
            </span>
          </div>
          <TextOrAudioInput
            label={
              isFlowA
                ? 'Quando pensaram em te contratar, o que mais preocupava? O que quase os impediu?'
                : 'Que medos podem impedir alguém de te contratar? Que objeções você ouve?'
            }
            value={data.decisionFears || ''}
            onChange={(value) => onUpdate({ decisionFears: value })}
            onInputTypeChange={(type) => { if (type !== 'link') onUpdate({ decisionFearsInputType: type }); }}
            initialInputType={data.decisionFearsInputType}
            maxAudioDuration={120}
            required={false}
            questionId="2.3a"
            token={token}
            module="mentee"
          />
        </div>

        {/* 2.3b Trigger */}
        <div className="space-y-2 p-4 rounded-lg border border-white/5 bg-white/5">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <span className="text-xs font-semibold text-white/60 font-sans uppercase tracking-wide">
              O Gatilho
            </span>
          </div>
          <TextOrAudioInput
            label={
              isFlowA
                ? 'Que coisa específica os fez superar esses medos e decidir trabalhar com você?'
                : "O que faria alguém finalmente dizer 'eu preciso disso'? Qual é o ponto de virada?"
            }
            value={data.decisionTrigger || ''}
            onChange={(value) => onUpdate({ decisionTrigger: value })}
            onInputTypeChange={(type) => { if (type !== 'link') onUpdate({ decisionTriggerInputType: type }); }}
            initialInputType={data.decisionTriggerInputType}
            maxAudioDuration={60}
            required={false}
            questionId="2.3b"
            token={token}
            module="mentee"
          />
        </div>
      </div>
    </div>
  );

  // ==========================================
  // Step 2.4 — After State
  // ==========================================
  const renderStep4 = () => (
    <div className="space-y-5">
      <JourneyMap currentStepIndex={3} />
      <FlowBadge isFlowA={isFlowA} />

      <div className="text-center">
        <span className="text-5xl block mb-4">🎯</span>
        <h3 className="font-serif text-xl text-white mb-1">Depois de Trabalhar com Você</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 2.4a External Results */}
        <div className="space-y-2 p-4 rounded-lg border border-white/5 bg-white/5">
          <div className="flex items-center gap-2">
            <span className="text-base">📊</span>
            <span className="text-xs font-semibold text-white/60 font-sans uppercase tracking-wide">
              Resultados Mensuráveis
            </span>
          </div>
          <TextOrAudioInput
            label={
              isFlowA
                ? 'Quais são os resultados reais e mensuráveis deles AGORA?'
                : 'Que resultados mensuráveis você quer entregar?'
            }
            value={data.afterExternal || ''}
            onChange={(value) => onUpdate({ afterExternal: value })}
            onInputTypeChange={(type) => { if (type !== 'link') onUpdate({ afterExternalInputType: type }); }}
            initialInputType={data.afterExternalInputType}
            maxAudioDuration={60}
            required={false}
            questionId="2.4a"
            token={token}
            module="mentee"
          />
        </div>

        {/* 2.4b Internal Feelings */}
        <div className="space-y-2 p-4 rounded-lg border border-white/5 bg-white/5">
          <div className="flex items-center gap-2">
            <span className="text-base">❤️</span>
            <span className="text-xs font-semibold text-white/60 font-sans uppercase tracking-wide">
              Como Se Sentem
            </span>
          </div>
          <TextOrAudioInput
            label={
              isFlowA
                ? 'Como eles se sentem sobre a vida e sobre si mesmos agora?'
                : 'Como você quer que seus clientes se sintam após trabalhar com você?'
            }
            value={data.afterInternal || ''}
            onChange={(value) => onUpdate({ afterInternal: value })}
            onInputTypeChange={(type) => { if (type !== 'link') onUpdate({ afterInternalInputType: type }); }}
            initialInputType={data.afterInternalInputType}
            maxAudioDuration={60}
            required={false}
            questionId="2.4b"
            token={token}
            module="mentee"
          />
        </div>
      </div>
    </div>
  );

  // ==========================================
  // Step 2.5 — Ideal Client General
  // ==========================================
  const renderStep5 = () => (
    <div className="space-y-5">
      <div className="text-center">
        <span className="text-5xl block mb-4">🎯</span>
        <h3 className="font-serif text-xl text-white mb-1">Seu Cliente Ideal</h3>
        <p className="text-sm text-white/50 font-sans">
          Além desse cliente específico, quem são seus clientes ideais em geral?
        </p>
      </div>
      <TextOrAudioInput
        label="Além desse cliente — descreva quem são seus clientes ideais em geral. O que eles têm em comum?"
        value={data.idealClientGeneral || ''}
        onChange={(value) => onUpdate({ idealClientGeneral: value })}
        onInputTypeChange={(type) => { if (type !== 'link') onUpdate({ idealClientGeneralInputType: type }); }}
        initialInputType={data.idealClientGeneralInputType}
        maxAudioDuration={120}
        required={true}
        questionId="2.5"
        token={token}
        module="mentee"
      />
    </div>
  );

  // ==========================================
  // Step 2.6 — Anti-Avatar (Optional)
  // ==========================================
  const renderStep6 = () => (
    <div className="space-y-5">
      <div className="text-center">
        <span className="text-5xl block mb-4">🚫</span>
        <h3 className="font-serif text-xl text-white mb-1">Quem Você Quer Repelir?</h3>
        <div className="flex justify-center mt-2">
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold font-sans bg-white/10 text-white/50 border border-white/10">
            Opcional
          </span>
        </div>
        <p className="text-sm text-white/50 font-sans mt-3">
          Definir seu anti-avatar ajuda a atrair apenas os clientes certos.
        </p>
      </div>
      <TextOrAudioInput
        label="Quem seria um PÉSSIMO cliente? Quem você quer repelir?"
        value={data.terribleFit || ''}
        onChange={(value) => onUpdate({ terribleFit: value })}
        onInputTypeChange={(type) => { if (type !== 'link') onUpdate({ terribleFitInputType: type }); }}
        initialInputType={data.terribleFitInputType}
        maxAudioDuration={60}
        required={false}
        questionId="2.6"
        token={token}
        module="mentee"
      />
    </div>
  );

  const stepRenderers = [
    renderStep1,
    renderStep2,
    renderStep3,
    renderStep4,
    renderStep5,
    renderStep6,
  ];

  const activeVariants = prefersReduced ? reducedMotionVariants : stepVariants;

  return (
    <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl">

      {/* Module celebration overlay */}
      <AnimatePresence>
        {showModuleCelebration && (
          <CelebrationOverlay
            message="Jornada do cliente mapeada!"
            subMessage="Esses dados alimentam diretamente o seu Brand Brain."
            variant="module"
            duration={2000}
            onComplete={() => {
              setShowModuleCelebration(false);
              onModuleComplete?.();
            }}
          />
        )}
      </AnimatePresence>

      {!showModuleCelebration && (
        <>
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-6">
            <div
              className="flex items-center gap-3"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="text-xs font-semibold text-prosperus-gold-dark bg-prosperus-gold-dark/10 px-3 py-1 rounded-full">
                Passo {currentStep + 1} de 6
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

          {/* Step content or transition message */}
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

          {/* Navigation buttons */}
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
              disabled={transitioning || (currentStep === 5 && moduleComplete) || isStep4Blocked}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                transitioning || (currentStep === 5 && moduleComplete) || isStep4Blocked
                  ? 'bg-prosperus-gold-dark/30 text-prosperus-gold-dark/50 cursor-not-allowed'
                  : 'bg-prosperus-gold-dark hover:bg-prosperus-gold-hover text-black'
              }`}
            >
              {currentStep === 5 ? 'Concluir' : 'Próximo'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
