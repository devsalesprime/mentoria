import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { OfferData, Deliverable, Bonus } from '../../types/diagnostic';
import { TextOrAudioInput } from '../shared/TextOrAudioInput';
import { FileUpload } from '../shared/FileUpload';
import { StepTransition } from '../shared/StepTransition';
import { CelebrationOverlay } from '../shared/CelebrationOverlay';
import { Button } from '../ui/Button';

interface OfferModuleProps {
  data: OfferData;
  onUpdate: (data: Partial<OfferData>) => void;
  token: string;
  onModuleComplete?: () => void;
}

const STEPS = [
  { title: 'Objetivo e Modelo',    icon: '🎯' },
  { title: 'Descrição da Oferta',  icon: '💎' },
  { title: 'Entregáveis',          icon: '📦' },
  { title: 'Bônus Estratégicos',   icon: '🎁' },
  { title: 'Preço',                icon: '💰' },
  { title: 'Materiais de Venda',   icon: '📄' },
];

const STEP_TRANSITIONS: Record<number, string> = {
  0: 'Ótimo! Agora vamos definir sua oferta...',
  1: 'Boa descrição! Hora de montar o pacote...',
  2: 'Pacote montado! Agora os bônus estratégicos...',
  3: 'Quase lá! Vamos falar de preço...',
  4: 'Último passo desse módulo!',
};

const MLS_MANDATORY_DELIVERABLES: Deliverable[] = [
  { id: 'mls-presential', name: 'Encontros Presenciais', description: '', frequency: '2x/ano',       isMlsRequired: true },
  { id: 'mls-online',     name: 'Encontros Online',      description: '', frequency: 'Mensal',        isMlsRequired: true },
  { id: 'mls-community',  name: 'Comunidade Ativa',      description: '', frequency: 'Sempre ativa',  isMlsRequired: true },
];

const MLS_SUGGESTION_DELIVERABLES: Deliverable[] = [
  { id: 'sug-mls-presential', name: 'Encontros Presenciais', description: '', frequency: '2x/ano',      isMlsRequired: false },
  { id: 'sug-mls-online',     name: 'Encontros Online',      description: '', frequency: 'Mensal',       isMlsRequired: false },
  { id: 'sug-mls-community',  name: 'Comunidade Ativa',      description: '', frequency: 'Sempre ativa', isMlsRequired: false },
];

const GOAL_OPTIONS = [
  {
    value: 'mls'         as const,
    icon:   '🏢',
    label:  'Quero entrar na MLS',
    subtext: 'Vou seguir o modelo da Mentoring League Society',
  },
  {
    value: 'independent' as const,
    icon:   '🚀',
    label:  'Programa independente',
    subtext: 'Estou construindo meu próprio programa de mentoria',
  },
  {
    value: 'unsure'      as const,
    icon:   '🤔',
    label:  'Ainda não sei',
    subtext: 'Quero explorar as opções antes de decidir',
  },
];

const formatBRL = (value: number): string => {
  if (!value) return '';
  return `R$ ${value.toLocaleString('pt-BR')}`;
};

const parseBRL = (raw: string): number => {
  const cleaned = raw.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.').trim();
  const parsed  = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed);
};

const stepVariants = {
  enter:  (dir: number) => ({ x: dir > 0 ?  80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (dir: number) => ({ x: dir > 0 ? -80 :  80, opacity: 0 }),
};

// ============================================================
// Main component
// ============================================================
export const OfferModule: React.FC<OfferModuleProps> = ({ data, onUpdate, token, onModuleComplete }) => {
  const shouldReduceMotion = useReducedMotion();

  const [currentStep,            setCurrentStep]            = useState(0);
  const [direction,              setDirection]              = useState(0);
  const [transitioning,          setTransitioning]          = useState(false);
  const [transitionMsg,          setTransitionMsg]          = useState('');
  const [showModuleCelebration,  setShowModuleCelebration]  = useState(false);
  const [moduleComplete,         setModuleComplete]         = useState(false);

  // Step 4.5 pricing display (formatted vs. raw)
  const [pricingDisplay, setPricingDisplay] = useState(
    data.pricing ? formatBRL(data.pricing) : ''
  );

  // Step 4.6 URL input
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');

  const LAST_STEP = STEPS.length - 1;

  // ── Validation ────────────────────────────────────────────
  const isNextDisabled = (): boolean => {
    if (transitioning || moduleComplete) return true;
    switch (currentStep) {
      case 0: return !data.goal;
      case 1: return !data.description.trim();
      case 2: return data.goal !== 'unsure' && !data.deliverables.some(d => d.name.trim() && d.frequency.trim());
      case 4: return data.goal !== 'unsure' && (!data.pricing || data.pricing === 0);
      default: return false;
    }
  };

  // ── Navigation ────────────────────────────────────────────
  const triggerTransition = (fromStep: number) => {
    const msg = STEP_TRANSITIONS[fromStep];
    if (msg) {
      setTransitionMsg(msg);
      setTransitioning(true);
    } else {
      setDirection(1);
      setCurrentStep(s => s + 1);
    }
  };

  const goNext = () => {
    if (isNextDisabled()) return;
    if (currentStep < LAST_STEP) {
      triggerTransition(currentStep);
    } else if (!moduleComplete) {
      setShowModuleCelebration(true);
      setModuleComplete(true);
    }
  };

  const goPrev = () => {
    if (currentStep > 0 && !transitioning) {
      setDirection(-1);
      setCurrentStep(s => s - 1);
    }
  };

  const jumpToStep = (i: number) => {
    if (i === currentStep || transitioning) return;
    setTransitioning(false);
    setTransitionMsg('');
    setDirection(i > currentStep ? 1 : -1);
    setCurrentStep(i);
  };

  const handleTransitionComplete = () => {
    setTransitioning(false);
    setTransitionMsg('');
    setDirection(1);
    setCurrentStep(s => s + 1);
  };

  // ── Goal selection (step 0) ───────────────────────────────
  const selectGoal = (goal: OfferData['goal']) => {
    const updates: Partial<OfferData> = { goal };

    if (goal === 'mls') {
      const hasMlsItems = data.deliverables.some(d => d.isMlsRequired);
      if (!hasMlsItems) {
        updates.deliverables = [
          ...MLS_MANDATORY_DELIVERABLES,
          ...data.deliverables.filter(d => !d.isMlsRequired && !d.id.startsWith('sug-mls-')),
        ];
      }
    } else if (goal === 'independent') {
      // Clear mandatory MLS and suggestion items — independent starts with user's own list
      updates.deliverables = data.deliverables.filter(d => !d.isMlsRequired && !d.id.startsWith('sug-mls-'));
    } else if (goal === 'unsure') {
      // Pre-fill MLS items as editable suggestions (no lock, no badge)
      const hasSuggestions = data.deliverables.some(d => d.id.startsWith('sug-mls-'));
      if (!hasSuggestions) {
        updates.deliverables = [
          ...MLS_SUGGESTION_DELIVERABLES,
          ...data.deliverables.filter(d => !d.id.startsWith('sug-mls-') && !d.isMlsRequired),
        ];
      }
    }

    onUpdate(updates);

    // Auto-advance after 400 ms, using StepTransition
    setTimeout(() => triggerTransition(0), 400);
  };

  // ── Step renderers ────────────────────────────────────────

  // 4.1 — Goal & Model
  const renderStep0 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <span className="text-5xl block mb-4">🎯</span>
        <h3 className="font-serif text-xl text-white mb-1">
          Qual é o seu objetivo com este programa de mentoria?
        </h3>
        <p className="text-sm text-white/50 font-sans">
          Isso nos ajuda a adaptar a arquitetura da sua oferta.
        </p>
      </div>

      <div role="radiogroup" aria-label="Objetivo do programa de mentoria" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {GOAL_OPTIONS.map((opt) => {
          const selected = data.goal === opt.value;
          return (
            <button
              key={opt.value}
              role="radio"
              aria-checked={selected}
              aria-label={opt.label}
              onClick={() => selectGoal(opt.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectGoal(opt.value); }
              }}
              className={`flex flex-col items-center text-center p-5 rounded-xl border-2 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-prosperus-gold-dark ${
                selected
                  ? 'border-prosperus-gold-dark bg-prosperus-gold-dark/10'
                  : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'
              }`}
            >
              <span className="text-4xl mb-3">{opt.icon}</span>
              <span className="text-sm font-semibold text-white mb-1">{opt.label}</span>
              <span className="text-sm text-white/50 font-sans leading-relaxed">{opt.subtext}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // 4.2 — Offer Description
  const renderStep1 = () => (
    <div className="space-y-5">
      <div className="text-center">
        <span className="text-5xl block mb-4">💎</span>
        <h3 className="font-serif text-xl text-white mb-1">Descreva Sua Oferta</h3>
        <p className="text-sm text-white/50 font-sans">
          Imagine que alguém perguntou: &ldquo;O que exatamente você está vendendo e o que o cliente recebe?&rdquo;
        </p>
      </div>

      <div className="bg-gradient-to-b from-prosperus-gold-dark/5 to-transparent border border-prosperus-gold-dark/20 rounded-xl p-4 sm:p-6 hover:border-prosperus-gold-dark/40 transition-colors">
        <TextOrAudioInput
          label="Sua oferta"
          value={data.description}
          onChange={(value) => onUpdate({ description: value })}
          onInputTypeChange={(type) => { if (type !== 'link') onUpdate({ descriptionInputType: type }); }}
          initialInputType={data.descriptionInputType}
          maxAudioDuration={120}
          required={true}
          questionId="4.2"
          token={token}
          module="offer"
        />
      </div>
    </div>
  );

  // 4.5 — Pricing
  const renderStep4 = () => {
    const handleFocus = () => {
      setPricingDisplay(data.pricing ? String(data.pricing) : '');
    };
    const handleBlur = () => {
      const num = parseBRL(pricingDisplay);
      onUpdate({ pricing: num });
      setPricingDisplay(num ? formatBRL(num) : '');
    };

    return (
      <div className="space-y-6">
        <div className="text-center">
          <span className="text-5xl block mb-4">💰</span>
          <h3 className="font-serif text-xl text-white mb-1">Preço da Sua Oferta</h3>
          <p className="text-sm text-white/50 font-sans">
            Qual é o valor atual ou desejado para essa oferta? (Valor anual em R$)
          </p>
        </div>

        {/* MLS pricing warning */}
        {data.goal === 'mls' && (
          <div className="flex gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <span className="text-xl flex-shrink-0">⚠️</span>
            <p className="text-sm text-amber-200/80 font-sans leading-relaxed">
              O requisito mínimo para o modelo MLS é uma oferta a partir de R$ 60.000/ano. Mesmo que esse não seja seu valor atual, se seu objetivo é entrar na MLS, considere essa faixa de preço como meta.
            </p>
          </div>
        )}

        {/* Unsure soft guidance */}
        {data.goal === 'unsure' && (
          <div className="flex gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <span className="text-xl flex-shrink-0">💡</span>
            <p className="text-sm text-blue-200/80 font-sans leading-relaxed">
              Para referência: programas de mentoria estruturada costumam variar entre R$ 15.000 e R$ 120.000/ano. Programas no modelo MLS partem de R$ 60.000. Coloque sua melhor estimativa ou deixe em branco se ainda não decidiu.
            </p>
          </div>
        )}

        <div className="max-w-xs mx-auto space-y-2">
          <label htmlFor="pricing-input" className="block text-sm font-semibold text-white/70">
            Valor Anual (R$){data.goal !== 'unsure' && <span className="text-red-400 ml-1">*</span>}
            {data.goal === 'unsure' && <span className="text-white/50 text-xs ml-2 font-normal">(opcional)</span>}
          </label>
          <input
            id="pricing-input"
            type="text"
            inputMode="numeric"
            aria-label="Valor anual em reais"
            aria-required={data.goal !== 'unsure' || undefined}
            value={pricingDisplay}
            placeholder="Ex: 60000"
            onChange={(e) => setPricingDisplay(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className="w-full p-3 bg-prosperus-navy border border-white/10 rounded-lg text-white text-lg font-semibold font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50 transition-colors"
          />
          <p className="text-sm text-white/50 font-sans">
            Se não tem certeza, coloque sua melhor estimativa. Isso nos ajuda a comparar com o mercado.
          </p>
        </div>
      </div>
    );
  };

  // 4.6 — Sales Materials
  const renderStep5 = () => {
    const addUrl = () => {
      const trimmed = urlInput.trim();
      if (!trimmed) return;
      if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
        setUrlError('URL deve começar com https:// ou http://');
        return;
      }
      setUrlError('');
      onUpdate({ salesMaterials: [...data.salesMaterials, trimmed] });
      setUrlInput('');
    };

    const removeUrl = (index: number) => {
      onUpdate({ salesMaterials: data.salesMaterials.filter((_, i) => i !== index) });
    };

    const getDomain = (url: string): string => {
      try { return new URL(url).hostname.replace('www.', ''); }
      catch { return url; }
    };

    return (
      <div className="space-y-5">
        <div className="text-center">
          <span className="text-5xl block mb-4">📄</span>
          <div className="flex items-center justify-center gap-2 mb-1">
            <h3 className="font-serif text-xl text-white">Materiais de Venda Existentes</h3>
            <span className="text-xs px-2 py-0.5 bg-white/10 text-white/50 rounded-full font-semibold font-sans">
              Opcional
            </span>
          </div>
          <p className="text-sm text-white/50 font-sans">
            Você já tem materiais de venda para essa oferta específica?
          </p>
        </div>

        {/* URL input */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }}
              placeholder="https://..."
              aria-label="Link de material de venda"
              className="flex-1 bg-prosperus-navy border border-white/10 rounded-lg px-4 py-2 text-white/90 text-sm font-sans placeholder:text-white/50 focus:border-prosperus-gold-dark/50 focus:outline-none transition-colors"
            />
            <Button variant="primary" size="md" onClick={addUrl} aria-label="Adicionar link" className="whitespace-nowrap">
              + Adicionar Link
            </Button>
          </div>
          {urlError && <p className="text-red-400 text-sm">{urlError}</p>}
          <p className="text-sm text-white/50 font-sans">
            Links de páginas de vendas, propostas, posts do Instagram, screenshots. Os links devem ser públicos — teste em uma aba anônima.
          </p>
        </div>

        {data.salesMaterials.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.salesMaterials.map((url, i) => (
              <motion.div
                key={url + i}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-4 py-3"
              >
                <span className="text-lg">🔗</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/70 truncate">{getDomain(url)}</p>
                  <p className="text-xs text-white/50 truncate">{url}</p>
                </div>
                <Button
                  variant="icon"
                  onClick={() => removeUrl(i)}
                  aria-label={`Remover link ${i + 1}`}
                  className="text-red-400/50 hover:text-red-400 text-xs flex-shrink-0"
                >
                  ✕
                </Button>
              </motion.div>
            ))}
          </div>
        )}

        {/* File upload */}
        <div className="border-t border-white/10 pt-4 space-y-2">
          <p className="text-sm text-white/50 font-sans font-semibold">Ou faça upload de arquivos</p>
          <FileUpload
            files={data.salesFiles || []}
            onFilesChange={(files) => onUpdate({ salesFiles: files })}
            category="offer_sales_material"
            token={token}
          />
        </div>
      </div>
    );
  };

  // ── Step array ────────────────────────────────────────────
  const stepRenderers = [
    renderStep0,
    renderStep1,
    () => <DeliverablesStep data={data} onUpdate={onUpdate} />,
    () => <BonusesStep      data={data} onUpdate={onUpdate} />,
    renderStep4,
    renderStep5,
  ];

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl">

      {/* Module celebration */}
      <AnimatePresence>
        {showModuleCelebration && (
          <CelebrationOverlay
            message="Oferta mapeada!"
            subMessage="Agora temos tudo para construir seu Brand Brain."
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
            <div className="flex items-center gap-3" aria-live="polite" aria-atomic="true">
              <span className="text-xs font-semibold text-prosperus-gold-dark bg-prosperus-gold-dark/10 px-3 py-1 rounded-full">
                Passo {currentStep + 1} de {STEPS.length}
              </span>
              <span className="text-sm text-white/60 font-sans hidden sm:inline">
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
                  variants={shouldReduceMotion ? undefined : stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
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
              {currentStep === LAST_STEP ? 'Concluir Módulo' : 'Próximo'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================
// Sub-component: Deliverables Builder (step 4.3)
// ============================================================
const DeliverablesStep: React.FC<{
  data: OfferData;
  onUpdate: (data: Partial<OfferData>) => void;
}> = ({ data, onUpdate }) => {
  const shouldReduceMotion = useReducedMotion();
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState<Partial<Deliverable>>({ name: '', description: '', frequency: '' });

  const deliverables = data.deliverables;

  const updateDeliverable = (id: string, updates: Partial<Deliverable>) => {
    onUpdate({ deliverables: deliverables.map(d => d.id === id ? { ...d, ...updates } : d) });
  };

  const removeDeliverable = (id: string) => {
    onUpdate({ deliverables: deliverables.filter(d => d.id !== id) });
  };

  const saveNewDeliverable = () => {
    if (!draft.name?.trim() || !draft.frequency?.trim()) return;
    const newD: Deliverable = {
      id: `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: draft.name.trim(),
      description: draft.description?.trim() || undefined,
      frequency: draft.frequency.trim(),
      isMlsRequired: false,
    };
    onUpdate({ deliverables: [...deliverables, newD] });
    setAddingNew(false);
    setDraft({ name: '', description: '', frequency: '' });
  };

  const cancelAdd = () => {
    setAddingNew(false);
    setDraft({ name: '', description: '', frequency: '' });
  };

  const inputClass =
    'w-full p-2 bg-prosperus-navy border border-white/10 rounded-lg text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50 transition-colors';

  return (
    <div className="space-y-5">
      <div className="text-center">
        <span className="text-5xl block mb-4">📦</span>
        <h3 className="font-serif text-xl text-white mb-1">O Que Está Incluído na Sua Oferta</h3>
        <p className="text-sm text-white/50 font-sans">
          Liste tudo que o cliente recebe no pacote principal.
        </p>
      </div>

      {/* MLS guide card */}
      {data.goal === 'mls' && (
        <div className="flex gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <span className="text-xl flex-shrink-0">ℹ️</span>
          <div>
            <h4 className="text-sm font-semibold text-blue-300 mb-1">Requisitos MLS</h4>
            <p className="text-sm text-blue-200/70 font-sans leading-relaxed">
              A MLS exige no mínimo: 2 encontros presenciais/ano, encontros online mensais, e comunidade ativa. Esses itens já estão incluídos abaixo.
            </p>
          </div>
        </div>
      )}

      {/* Unsure educational card */}
      {data.goal === 'unsure' && (
        <div className="flex gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <span className="text-xl flex-shrink-0">💡</span>
          <div>
            <h4 className="text-sm font-semibold text-blue-300 mb-1">Tipos comuns de entregáveis em programas de mentoria</h4>
            <p className="text-sm text-blue-200/70 font-sans leading-relaxed">
              Programas estruturados como a MLS geralmente incluem encontros presenciais, sessões online mensais e uma comunidade ativa. Mas cada programa é único — adapte ao seu modelo.
            </p>
          </div>
        </div>
      )}

      {/* Deliverable cards */}
      <div className="space-y-3">
        {deliverables.map((d, i) => (
          <motion.div
            key={d.id}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`relative p-4 border rounded-lg ${
              d.isMlsRequired
                ? 'bg-blue-500/5 border-blue-500/20'
                : 'bg-white/5 border-white/10'
            }`}
          >
            {/* Lock badge (MLS only) */}
            {d.isMlsRequired && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">🔒</span>
                <span
                  className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full font-semibold font-sans"
                  aria-label={`${d.name} — obrigatório pela MLS, não pode ser removido`}
                >
                  MLS obrigatório
                </span>
              </div>
            )}

            {/* Delete button (non-MLS only) */}
            {!d.isMlsRequired && (
              <Button
                variant="icon"
                onClick={() => removeDeliverable(d.id)}
                aria-label={`Remover entregável ${d.name || i + 1}`}
                className="absolute top-2 right-2 text-red-400/40 hover:text-red-400 text-base"
              >
                🗑️
              </Button>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-white/50 mb-1">
                  Nome do entregável <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={d.name}
                  onChange={(e) => updateDeliverable(d.id, { name: e.target.value })}
                  placeholder="Ex: Sessão de Mentoria Individual"
                  aria-label={d.isMlsRequired ? `${d.name} — obrigatório pela MLS, não pode ser removido` : 'Nome do entregável'}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-white/50 mb-1">
                  Frequência / Quantidade <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={d.frequency}
                  onChange={(e) => updateDeliverable(d.id, { frequency: e.target.value })}
                  placeholder="Ex: 2x/semana, mensal, sempre ativo"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm text-white/50 mb-1">Descrição</label>
              <input
                type="text"
                value={d.description || ''}
                onChange={(e) => updateDeliverable(d.id, { description: e.target.value })}
                placeholder="Breve descrição do que inclui"
                className={inputClass}
              />
            </div>
          </motion.div>
        ))}

        {/* Add form */}
        {addingNew && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 bg-white/5 border border-prosperus-gold-dark/30 rounded-lg space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-white/50 mb-1">
                  Nome do entregável <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={draft.name || ''}
                  onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="Ex: Sessão de Mentoria Individual"
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-white/50 mb-1">
                  Frequência / Quantidade <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={draft.frequency || ''}
                  onChange={(e) => setDraft(d => ({ ...d, frequency: e.target.value }))}
                  placeholder="Ex: 2x/semana, mensal, sempre ativo"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/50 mb-1">Descrição</label>
              <input
                type="text"
                value={draft.description || ''}
                onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="Breve descrição do que inclui"
                className={inputClass}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={cancelAdd}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={saveNewDeliverable}
                disabled={!draft.name?.trim() || !draft.frequency?.trim()}
              >
                Salvar
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Add button */}
      {!addingNew && (
        <Button
          variant="ghost"
          fullWidth
          onClick={() => { setAddingNew(true); setDraft({ name: '', description: '', frequency: '' }); }}
          aria-label="Adicionar entregável"
          className="py-3 border-2 border-dashed border-white/20 hover:border-prosperus-gold-dark/50 text-white/50 hover:text-prosperus-gold-dark"
        >
          + Adicionar Entregável
        </Button>
      )}

      {/* Optional notice for unsure */}
      {data.goal === 'unsure' && (
        <p className="text-sm text-white/50 font-sans text-center">
          Os entregáveis são opcionais para este caminho — você pode avançar com a lista vazia ou adicionar os seus.
        </p>
      )}
    </div>
  );
};

// ============================================================
// Sub-component: Bonuses Builder (step 4.4)
// ============================================================
const BonusesStep: React.FC<{
  data: OfferData;
  onUpdate: (data: Partial<OfferData>) => void;
}> = ({ data, onUpdate }) => {
  const shouldReduceMotion = useReducedMotion();
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState<Partial<Bonus>>({ name: '', objectionsItKills: '', description: '' });

  const bonuses = data.bonuses;

  const removeBonus = (id: string) => {
    onUpdate({ bonuses: bonuses.filter(b => b.id !== id) });
  };

  const saveNewBonus = () => {
    if (!draft.name?.trim() || !draft.objectionsItKills?.trim()) return;
    const newB: Bonus = {
      id: `bonus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: draft.name.trim(),
      objectionsItKills: draft.objectionsItKills.trim(),
      description: draft.description?.trim() || undefined,
    };
    onUpdate({ bonuses: [...bonuses, newB] });
    setAddingNew(false);
    setDraft({ name: '', objectionsItKills: '', description: '' });
  };

  const cancelAdd = () => {
    setAddingNew(false);
    setDraft({ name: '', objectionsItKills: '', description: '' });
  };

  const inputClass =
    'w-full p-2 bg-prosperus-navy border border-white/10 rounded-lg text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-purple-400/50 transition-colors';

  return (
    <div className="space-y-5">
      <div className="text-center">
        <span className="text-5xl block mb-4">🎁</span>
        <div className="flex flex-wrap items-center justify-center gap-2 mb-1">
          <h3 className="font-serif text-xl text-white">Bônus Estratégicos</h3>
          <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full font-semibold font-sans">
            Opcional, mas recomendado
          </span>
        </div>
      </div>

      {/* Framing card */}
      <div className="p-4 bg-prosperus-gold-dark/5 border border-prosperus-gold-dark/20 rounded-lg space-y-3">
        <div className="flex gap-3">
          <span className="text-xl flex-shrink-0">🛡️</span>
          <div>
            <p className="text-sm font-bold text-prosperus-gold-dark mb-0.5">Bônus como MATADORES DE OBJEÇÃO:</p>
            <p className="text-sm text-white/60 font-sans">
              Cada bônus resolve um motivo específico pelo qual alguém NÃO compraria.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="text-xl flex-shrink-0">🃏</span>
          <div>
            <p className="text-sm font-bold text-prosperus-gold-dark mb-0.5">Bônus como FICHAS DE NEGOCIAÇÃO:</p>
            <p className="text-sm text-white/60 font-sans">
              Adicione ou remova em vez de dar desconto — evita a percepção de preço inflado.
            </p>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {bonuses.length === 0 && !addingNew && (
        <p className="text-sm text-white/50 font-sans text-center italic py-4">
          Sem bônus? Sem problema. Mas bônus bem posicionados podem dobrar a conversão.
        </p>
      )}

      {/* Bonus cards */}
      <div className="space-y-3">
        {bonuses.map((b, i) => (
          <motion.div
            key={b.id}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="relative p-4 bg-purple-500/5 border border-purple-500/20 rounded-lg"
          >
            <Button
              variant="icon"
              onClick={() => removeBonus(b.id)}
              aria-label={`Remover bônus ${i + 1}`}
              className="absolute top-2 right-2 text-red-400/40 hover:text-red-400 text-base"
            >
              🗑️
            </Button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-8">
              <div>
                <p className="text-xs text-purple-300/70 mb-0.5">Nome do bônus</p>
                <p className="text-sm text-white font-semibold">{b.name}</p>
              </div>
              <div>
                <p className="text-xs text-purple-300/70 mb-0.5">Objeção que mata</p>
                <p className="text-sm text-white/70">{b.objectionsItKills}</p>
              </div>
            </div>
            {b.description && (
              <p className="text-sm text-white/50 font-sans mt-2">{b.description}</p>
            )}
          </motion.div>
        ))}

        {/* Add form */}
        {addingNew && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 bg-purple-500/5 border border-purple-500/30 rounded-lg space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-white/50 mb-1">
                  Nome do bônus <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={draft.name || ''}
                  onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="Ex: Auditoria de Funil Completa"
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-white/50 mb-1">
                  Que objeção ele mata? <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={draft.objectionsItKills || ''}
                  onChange={(e) => setDraft(d => ({ ...d, objectionsItKills: e.target.value }))}
                  placeholder="Ex: 'Não sei se vou conseguir aplicar sozinho'"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/50 mb-1">Descrição</label>
              <input
                type="text"
                value={draft.description || ''}
                onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="O que o mentorado recebe nesse bônus?"
                className={inputClass}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={cancelAdd}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={saveNewBonus}
                disabled={!draft.name?.trim() || !draft.objectionsItKills?.trim()}
                className="bg-purple-500 hover:bg-purple-400 text-white"
              >
                Salvar
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Add button */}
      {!addingNew && (
        <Button
          variant="ghost"
          fullWidth
          onClick={() => { setAddingNew(true); setDraft({ name: '', objectionsItKills: '', description: '' }); }}
          aria-label="Adicionar bônus"
          className="py-3 border-2 border-dashed border-purple-500/20 hover:border-purple-500/40 text-white/50 hover:text-purple-400"
        >
          + Adicionar Bônus
        </Button>
      )}
    </div>
  );
};
