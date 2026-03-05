import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MentorData, Testimonial } from '../../types/diagnostic';
import { TextOrAudioInput } from '../shared/TextOrAudioInput';
import { PodiumInput } from '../shared/PodiumInput';
import { VSCompare } from '../shared/VSCompare';
import { StepTransition } from '../shared/StepTransition';
import { CelebrationOverlay } from '../shared/CelebrationOverlay';
import { Button } from '../ui/Button';

interface MentorModuleProps {
  data: MentorData;
  onUpdate: (data: Partial<MentorData>) => void;
  token: string;
  onModuleComplete?: () => void;
}

const STEPS = [
  { title: 'O Que Você Faz?',              icon: '🎤' },
  { title: 'Linha do Tempo de Autoridade', icon: '📖' },
  { title: 'Pódio de Conquistas',          icon: '🏆' },
  { title: 'Prova Social',                 icon: '💬' },
  { title: 'O Que Te Diferencia',          icon: '⚔️' },
];

const STEP_TRANSITIONS: Record<number, string> = {
  0: 'Ótima introdução! Agora vamos mais fundo...',
  1: 'Que história poderosa. Hora de mostrar suas conquistas!',
  2: 'Belo pódio! Agora deixe outros falarem por você.',
  3: 'Quase lá! Última questão.',
};

const stepVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
};

export const MentorModule: React.FC<MentorModuleProps> = ({ data, onUpdate, token, onModuleComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionMsg, setTransitionMsg] = useState('');
  const [showModuleCelebration, setShowModuleCelebration] = useState(false);
  const [moduleComplete, setModuleComplete] = useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Task 1: Safety timeout — auto-reset if transitioning stays true > 2000ms (AC 2, 5)
  useEffect(() => {
    if (transitioning) {
      transitionTimerRef.current = setTimeout(() => {
        console.warn('[MentorModule] Transition timeout — auto-reset');
        setTransitioning(false);
        setTransitionMsg('');
      }, 2000);
    } else {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    }
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, [transitioning]);

  // Task 2: Fixed — moduleComplete no longer blocks ALL navigation, only blocks at step 4 (AC 4)
  const isNextDisabled = () => {
    if (transitioning) return true;
    if (moduleComplete && currentStep === 4) return true;
    if (currentStep === 2) {
      const { gold, silver, bronze } = data.step3 || {};
      if (!gold?.trim() || !silver?.trim() || !bronze?.trim()) return true;
    }
    return false;
  };

  // Task 3: Added dev-mode logging for transition events (AC 6)
  const goNext = () => {
    if (isNextDisabled()) return;
    if (currentStep < 4 && !transitioning) {
      const msg = STEP_TRANSITIONS[currentStep];
      if (msg) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[MentorModule] goNext: step', currentStep, '→ transitioning');
        }
        setTransitionMsg(msg);
        setTransitioning(true);
      } else {
        setDirection(1);
        setCurrentStep(currentStep + 1);
      }
    } else if (currentStep === 4 && !transitioning && !moduleComplete) {
      setShowModuleCelebration(true);
      setModuleComplete(true);
    }
  };

  const handleTransitionComplete = useCallback(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[MentorModule] handleTransitionComplete: advancing');
    }
    setTransitioning(false);
    setTransitionMsg('');
    setDirection(1);
    setCurrentStep((s) => s + 1);
  }, []);

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

  // === Step 1: O Que Você Faz? ===
  const renderStep1 = () => (
    <div className="space-y-5">
      <div className="text-center">
        <span className="text-5xl block mb-4">🎤</span>
        <h3 className="font-serif text-xl text-white mb-1">
          Imagine que você está em um evento. Alguém pergunta: <em>O que você faz?</em>
        </h3>
        <p className="text-sm text-white/50 font-sans">
          Explique para um empresário que nunca ouviu falar de você.
        </p>
      </div>
      <TextOrAudioInput
        label="Sua resposta"
        value={data.step1?.explanation || ''}
        onChange={(value) => onUpdate({ step1: { ...data.step1, explanation: value } })}
        onInputTypeChange={(type) => {
          if (type !== 'link') onUpdate({ step1: { ...data.step1, inputType: type } });
        }}
        initialInputType={data.step1?.inputType}
        maxAudioDuration={120}
        required={true}
        questionId="1.1"
        token={token}
        module="mentor"
      />
    </div>
  );

  // === Step 2: Linha do Tempo de Autoridade ===
  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="text-center">
        <span className="text-5xl block mb-4">📖</span>
        <h3 className="font-serif text-xl text-white mb-1">Sua Linha do Tempo de Autoridade</h3>
        <p className="text-sm text-white/50 font-sans">
          Me conte os momentos-chave que construíram quem você é hoje.
        </p>
      </div>

      {/* Decorative timeline — desktop only */}
      <div className="hidden sm:flex items-center gap-1 px-4 py-3 border border-dashed border-white/10 rounded-lg">
        <span className="text-white/50 text-xs font-sans flex-shrink-0">Início</span>
        <div className="flex-1 flex items-center gap-1 mx-2">
          {[0,1,2,3,4].map((i) => (
            <React.Fragment key={i}>
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-white/20 flex-shrink-0" />
              {i < 4 && <div className="flex-1 h-px bg-white/10" />}
            </React.Fragment>
          ))}
        </div>
        <span className="text-white/50 text-xs font-sans flex-shrink-0">Hoje</span>
      </div>

      <TextOrAudioInput
        label="Sua história"
        value={data.step2?.authorityStory || ''}
        onChange={(value) => onUpdate({ step2: { ...data.step2, authorityStory: value } })}
        onLinkChange={(value) => onUpdate({ step2: { ...data.step2, link: value } })}
        linkValue={data.step2?.link || ''}
        onInputTypeChange={(type) => onUpdate({ step2: { ...data.step2, inputType: type } })}
        initialInputType={data.step2?.inputType}
        maxAudioDuration={300}
        required={true}
        questionId="1.2"
        allowLink={true}
        token={token}
        module="mentor"
      />
    </div>
  );

  // === Step 3: Pódio de Conquistas ===
  // Task 2: Show per-field red errors on empty podium fields (AC 3)
  const renderStep3 = () => {
    const { gold = '', silver = '', bronze = '' } = data.step3 || {};
    return (
      <div className="space-y-5">
        <div className="text-center">
          <span className="text-5xl block mb-4">🏆</span>
          <h3 className="font-serif text-xl text-white mb-1">Seu Pódio de Conquistas</h3>
          <p className="text-sm text-white/50 font-sans">
            Quais são as 3 conquistas de que mais se orgulha?
          </p>
          <p className="text-sm text-white/50 font-sans mt-1 italic">
            Pense em resultados, não credenciais. &ldquo;Ajudei 200 mentores a escalar&rdquo; &gt; &ldquo;MBA da universidade X&rdquo;
          </p>
        </div>
        <PodiumInput
          gold={gold}
          silver={silver}
          bronze={bronze}
          onGoldChange={(value) => onUpdate({ step3: { ...data.step3, gold: value } })}
          onSilverChange={(value) => onUpdate({ step3: { ...data.step3, silver: value } })}
          onBronzeChange={(value) => onUpdate({ step3: { ...data.step3, bronze: value } })}
          multiline={true}
          placeholder="Descreva essa conquista..."
          goldError={!gold.trim()}
          silverError={!silver.trim()}
          bronzeError={!bronze.trim()}
        />
      </div>
    );
  };

  // === Step 4: Prova Social ===
  const renderStep4 = () => <Step4Content data={data} onUpdate={onUpdate} />;

  // === Step 5: O Que Te Diferencia ===
  const renderStep5 = () => (
    <div className="space-y-5">
      <div className="text-center">
        <span className="text-5xl block mb-4">⚔️</span>
        <h3 className="font-serif text-xl text-white mb-1">O Que Te Diferencia</h3>
        <p className="text-sm text-white/50 font-sans">
          O que é comum no seu mercado vs. o que você faz diferente?
        </p>
      </div>
      <VSCompare
        leftLabel="ELES FAZEM..."
        rightLabel="EU FAÇO..."
        vsIcon="⚡"
        leftContent={
          <TextOrAudioInput
            label="Padrão do Mercado"
            value={data.step5?.marketStandard || ''}
            onChange={(value) => onUpdate({ step5: { ...data.step5, marketStandard: value } })}
            onInputTypeChange={(type) => {
              if (type !== 'link') onUpdate({ step5: { ...data.step5, inputTypeA: type } });
            }}
            initialInputType={data.step5?.inputTypeA || data.step5?.inputType}
            maxAudioDuration={120}
            required={true}
            questionId="1.5a"
            token={token}
            module="mentor"
          />
        }
        rightContent={
          <TextOrAudioInput
            label="Minha Diferença"
            value={data.step5?.myDifference || ''}
            onChange={(value) => onUpdate({ step5: { ...data.step5, myDifference: value } })}
            onInputTypeChange={(type) => {
              if (type !== 'link') onUpdate({ step5: { ...data.step5, inputTypeB: type } });
            }}
            initialInputType={data.step5?.inputTypeB || data.step5?.inputType}
            maxAudioDuration={120}
            required={true}
            questionId="1.5b"
            token={token}
            module="mentor"
          />
        }
      />
    </div>
  );

  const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];

  return (
    <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl">

      {/* Module celebration overlay */}
      <AnimatePresence>
        {showModuleCelebration && (
          <CelebrationOverlay
            message="Módulo completo!"
            subMessage="Seu perfil de mentor está tomando forma."
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
                Passo {currentStep + 1} de 5
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
                  variants={stepVariants}
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
              disabled={isNextDisabled()}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                isNextDisabled()
                  ? 'bg-prosperus-gold-dark/30 text-prosperus-gold-dark/50 cursor-not-allowed'
                  : 'bg-prosperus-gold-dark hover:bg-prosperus-gold-hover text-black'
              }`}
            >
              {currentStep === 4 ? 'Concluir' : 'Próximo'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================
// Step 4 — extracted component to isolate local state
// ============================================================
const Step4Content: React.FC<{ data: MentorData; onUpdate: (data: Partial<MentorData>) => void }> = ({
  data,
  onUpdate,
}) => {
  const testimonials = data.step4?.testimonials || [];
  const videoLinks = data.step4?.videoLinks || [];
  const startingFromZero = data.step4?.startingFromZero || false;

  const [videoInput, setVideoInput] = useState('');
  const [videoError, setVideoError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState<Partial<Testimonial>>({});

  const addTestimonial = () => {
    setAddingNew(true);
    setDraft({ clientName: '', result: '', quote: '', videoUrl: '' });
  };

  const saveDraft = () => {
    if (!draft.clientName?.trim() || !draft.result?.trim()) return;
    const newT: Testimonial = {
      id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      clientName: draft.clientName.trim(),
      result: draft.result.trim(),
      quote: draft.quote?.trim() || undefined,
      videoUrl: draft.videoUrl?.trim() || undefined,
    };
    onUpdate({ step4: { ...data.step4, testimonials: [...testimonials, newT] } });
    setAddingNew(false);
    setDraft({});
  };

  const cancelDraft = () => {
    setAddingNew(false);
    setDraft({});
  };

  const startEdit = (t: Testimonial) => {
    setEditingId(t.id);
    setDraft({ clientName: t.clientName, result: t.result, quote: t.quote || '', videoUrl: t.videoUrl || '' });
  };

  const saveEdit = () => {
    if (!draft.clientName?.trim() || !draft.result?.trim() || !editingId) return;
    const updated = testimonials.map((t) =>
      t.id === editingId
        ? { ...t, clientName: draft.clientName!.trim(), result: draft.result!.trim(), quote: draft.quote?.trim() || undefined, videoUrl: draft.videoUrl?.trim() || undefined }
        : t
    );
    onUpdate({ step4: { ...data.step4, testimonials: updated } });
    setEditingId(null);
    setDraft({});
  };

  const removeTestimonial = (id: string) => {
    const updated = testimonials.filter((t) => t.id !== id);
    onUpdate({ step4: { ...data.step4, testimonials: updated } });
  };

  const addVideoLink = () => {
    const trimmed = videoInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
      setVideoError('A URL deve começar com https:// ou http://');
      return;
    }
    setVideoError('');
    onUpdate({ step4: { ...data.step4, videoLinks: [...videoLinks, trimmed] } });
    setVideoInput('');
  };

  const removeVideoLink = (index: number) => {
    const updated = videoLinks.filter((_, i) => i !== index);
    onUpdate({ step4: { ...data.step4, videoLinks: updated } });
  };

  const draftInputClass = "w-full p-2 bg-prosperus-navy border border-white/10 rounded-lg text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50 transition-colors";

  const renderDraftForm = (onSave: () => void, onCancel: () => void) => (
    <div className="space-y-3 p-4 bg-white/5 border border-white/20 rounded-lg">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-white/50 mb-1">Nome do Cliente <span className="text-red-400">*</span></label>
          <input type="text" value={draft.clientName || ''} onChange={(e) => setDraft(d => ({ ...d, clientName: e.target.value }))} placeholder="Nome do cliente..." className={draftInputClass} />
        </div>
        <div>
          <label className="block text-sm text-white/50 mb-1">Resultado <span className="text-red-400">*</span></label>
          <input type="text" value={draft.result || ''} onChange={(e) => setDraft(d => ({ ...d, result: e.target.value }))} placeholder="Qual resultado ele obteve..." className={draftInputClass} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-white/50 mb-1">Citação (opcional)</label>
          <input type="text" value={draft.quote || ''} onChange={(e) => setDraft(d => ({ ...d, quote: e.target.value }))} placeholder="As palavras dele..." className={draftInputClass} />
        </div>
        <div>
          <label className="block text-sm text-white/50 mb-1">URL do Vídeo (opcional)</label>
          <input type="url" value={draft.videoUrl || ''} onChange={(e) => setDraft(d => ({ ...d, videoUrl: e.target.value }))} placeholder="https://..." className={draftInputClass} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={!draft.clientName?.trim() || !draft.result?.trim()}
        >
          Salvar
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <span className="text-5xl block mb-4">💬</span>
        <h3 className="font-serif text-xl text-white mb-1">Sua Prova Social</h3>
        <p className="text-sm text-white/50 font-sans">
          Qual prova você tem? Compartilhe seus melhores casos e depoimentos.
        </p>
      </div>

      {/* Starting from zero */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={startingFromZero}
          onChange={(e) => onUpdate({ step4: { ...data.step4, startingFromZero: e.target.checked } })}
          className="w-4 h-4 rounded border-white/20 bg-white/5 text-prosperus-gold-dark focus:ring-prosperus-gold-dark/50"
        />
        <span className="text-sm text-white/70 font-sans">
          Estou construindo do zero — sem depoimentos ainda
        </span>
      </label>

      {/* Testimonials card grid */}
      <div className={`space-y-4 transition-opacity duration-300 ${startingFromZero ? 'opacity-30' : 'opacity-100'}`}>
        {startingFromZero && (
          <p className="text-sm text-white/50 italic font-serif text-center">Opcional — mas pode adicionar se tiver algum</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Existing testimonial cards */}
          {testimonials.map((t) => (
            <AnimatePresence key={t.id} mode="wait">
              {editingId === t.id ? (
                <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {renderDraftForm(saveEdit, () => { setEditingId(null); setDraft({}); })}
                </motion.div>
              ) : (
                <motion.div
                  key="display"
                  initial={{ opacity: 0, rotateY: -90 }}
                  animate={{ opacity: 1, rotateY: 0 }}
                  exit={{ opacity: 0, rotateY: 90 }}
                  transition={{ duration: 0.3 }}
                  className="relative group bg-prosperus-navy border border-white/10 rounded-lg p-4 flex flex-col gap-2"
                >
                  {/* Edit/delete hover icons */}
                  <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                    <Button variant="icon" onClick={() => startEdit(t)} aria-label={`Editar depoimento de ${t.clientName}`} className="text-white/50 hover:text-white/70 text-xs">✏️</Button>
                    <Button variant="icon" onClick={() => removeTestimonial(t.id)} aria-label={`Remover depoimento de ${t.clientName}`} className="text-red-400/40 hover:text-red-400 text-xs">🗑️</Button>
                  </div>

                  <span className="text-3xl text-white/10 font-serif leading-none">"</span>
                  <p className="text-sm text-white/70 font-sans italic flex-1">
                    {t.quote || t.result}
                  </p>
                  <div className="mt-1">
                    <span className="text-xs text-white/50 font-sans">— {t.clientName}</span>
                    {t.result && t.quote && (
                      <p className="text-xs text-prosperus-gold-dark font-sans mt-0.5">{t.result}</p>
                    )}
                    {t.videoUrl && <span className="text-xs ml-2">📹</span>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          ))}

          {/* Add new form inline */}
          {addingNew && (
            <motion.div
              key="new-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="md:col-span-2"
            >
              {renderDraftForm(saveDraft, cancelDraft)}
            </motion.div>
          )}

          {/* Add Testimonial placeholder card */}
          {!addingNew && (
            <button
              type="button"
              onClick={addTestimonial}
              className="border-2 border-dashed border-white/20 hover:border-prosperus-gold-dark/50 rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-white/50 hover:text-prosperus-gold-dark transition-colors min-h-[120px]"
            >
              <span className="text-2xl">＋</span>
              <span className="text-xs font-semibold font-sans">Adicionar Depoimento</span>
            </button>
          )}
        </div>
      </div>

      {/* Video Testimonials */}
      <div className={`space-y-3 transition-opacity duration-300 ${startingFromZero ? 'opacity-30' : 'opacity-100'}`}>
        <div className="flex items-center gap-2 border-t border-white/10 pt-4">
          <span className="text-base">🎬</span>
          <h4 className="text-sm font-semibold text-white/70 font-sans">Depoimentos em Vídeo</h4>
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            value={videoInput}
            onChange={(e) => { setVideoInput(e.target.value); setVideoError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVideoLink(); } }}
            placeholder="https://..."
            className="flex-1 bg-prosperus-navy-mid border border-white/10 rounded-lg px-4 py-2 text-white/90 text-sm font-sans placeholder:text-white/50 focus:border-prosperus-gold-dark/50 focus:outline-none transition-colors"
          />
          <Button variant="primary" size="md" onClick={addVideoLink}>
            Adicionar
          </Button>
        </div>
        {videoError && <p className="text-red-400 text-sm">{videoError}</p>}
        {videoLinks.length > 0 && (
          <ul className="space-y-2">
            {videoLinks.map((url, i) => (
              <li key={i} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                <span className="flex-1 text-white/70 truncate">{url}</span>
                <Button variant="link" size="xs" onClick={() => removeVideoLink(i)} aria-label={`Remover link de vídeo ${i + 1}`} className="text-red-400 hover:text-red-300 font-bold flex-shrink-0">✕</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
