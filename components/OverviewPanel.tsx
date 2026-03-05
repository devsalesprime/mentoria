import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PipelineStatus } from '../types/pipeline';

// ─── Pipeline stage definitions ────────────────────────────────────────────────

interface Stage {
  key: string;
  label: string;
  description: string;
}

const PIPELINE_STAGES: Stage[] = [
  { key: 'diagnostic',  label: 'Diagnóstico',      description: 'Preenchimento do diagnóstico completo' },
  { key: 'research',    label: 'Pesquisa de Mercado', description: 'Pesquisa de mercado e análise competitiva' },
  { key: 'brand_brain', label: 'Brand Brain',       description: 'Geração do documento estratégico' },
  { key: 'review',      label: 'Revisão',           description: 'Sua revisão e aprovação do Brand Brain' },
  { key: 'assets',      label: 'Entregáveis',       description: 'Geração dos materiais de vendas' },
  { key: 'delivered',   label: 'Entregue',          description: 'Materiais prontos para uso' },
];

const PIPELINE_ORDER: PipelineStatus[] = [
  'diagnostic', 'research', 'brand_brain', 'review', 'assets', 'delivered',
];

function getStageState(stageKey: string, currentStatus: PipelineStatus): 'completed' | 'active' | 'pending' {
  const currentIdx = PIPELINE_ORDER.indexOf(currentStatus);
  const stageIdx = PIPELINE_ORDER.indexOf(stageKey as PipelineStatus);
  // When pipeline reaches 'delivered' (last stage), everything is completed
  if (currentStatus === 'delivered') return 'completed';
  if (stageIdx < currentIdx) return 'completed';
  if (stageIdx === currentIdx) return 'active';
  return 'pending';
}

// ─── Contextual message ────────────────────────────────────────────────────────

function getContextualMessage(
  diagnosticStatus: string,
  researchStatus: string,
  brandBrainStatus: string,
  assetsStatus: string,
  pipelineStatus: PipelineStatus
): { text: string; icon: string } | null {
  if (assetsStatus === 'delivered') {
    return null;
  }
  if (pipelineStatus === 'assets') {
    return { text: 'Brand Brain aprovado! Seus entregáveis estão sendo preparados.', icon: '⚙️' };
  }
  if (brandBrainStatus === 'mentor_review') {
    return { text: 'Seu Brand Brain está pronto para revisão. Acesse a seção Brand Brain no menu.', icon: '🧠' };
  }
  if (pipelineStatus === 'brand_brain' || researchStatus === 'complete') {
    return { text: 'A pesquisa foi concluída. Seu Brand Brain está sendo preparado.', icon: '🔬' };
  }
  if (diagnosticStatus === 'submitted') {
    return { text: 'Seu diagnóstico foi recebido! A pesquisa de mercado está sendo realizada.', icon: '✅' };
  }
  return { text: 'Complete seu diagnóstico para dar início ao processo.', icon: '📋' };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DiagnosticModuleStatus {
  id: string;
  label: string;
  icon: string;
  complete: boolean;
}

interface OverviewPanelProps {
  userName: string;
  userEmail: string;
  progress: number;
  currentModule: string;
  diagnosticStatus: string;
  isLegacy?: boolean;
  preModuleComplete: boolean;
  mentorComplete: boolean;
  menteeComplete: boolean;
  methodComplete: boolean;
  offerComplete: boolean;
  onNavigate: (moduleId: string) => void;
  // Pipeline
  pipelineStatus: PipelineStatus;
  brandBrainStatus: string;
  assetsStatus: string;
  researchStatus: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export const OverviewPanel: React.FC<OverviewPanelProps> = ({
  userName,
  userEmail,
  progress,
  currentModule,
  diagnosticStatus,
  isLegacy = false,
  preModuleComplete,
  mentorComplete,
  menteeComplete,
  methodComplete,
  offerComplete,
  onNavigate,
  pipelineStatus,
  brandBrainStatus,
  assetsStatus,
  researchStatus,
}) => {
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationShown, setCelebrationShown] = useState(false);

  // Show celebration ONCE ever when assets are delivered
  useEffect(() => {
    if (assetsStatus === 'delivered' && !celebrationShown) {
      const key = 'delivery-celebration-shown';
      if (!localStorage.getItem(key)) {
        setShowCelebration(true);
        localStorage.setItem(key, '1');
        setTimeout(() => setShowCelebration(false), 4000);
      }
      setCelebrationShown(true);
    }
  }, [assetsStatus, celebrationShown]);

  const contextualMsg = getContextualMessage(
    diagnosticStatus, researchStatus, brandBrainStatus, assetsStatus, pipelineStatus
  );

  const journeyModules: DiagnosticModuleStatus[] = [
    { id: 'mentor',  label: 'O Mentor',    icon: '🧑‍💼', complete: mentorComplete },
    { id: 'mentee',  label: 'O Mentorado', icon: '👤',    complete: menteeComplete },
    { id: 'method',  label: 'O Método',    icon: '🔧',    complete: methodComplete },
    { id: 'offer',   label: 'A Oferta',    icon: '📦',    complete: offerComplete },
  ];

  const showPipelineSection = pipelineStatus !== 'diagnostic' || diagnosticStatus === 'submitted';

  return (
    <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-4 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[600px] shadow-2xl">
      {/* Celebration overlay */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div className="bg-prosperus-navy-mid border border-prosperus-gold-dark/30 rounded-2xl p-10 text-center max-w-md mx-4">
              <span className="text-6xl block mb-4">🎉</span>
              <h3 className="text-2xl font-serif text-white mb-2">Parabéns!</h3>
              <p className="text-white/60 text-sm">Todos os seus materiais estão prontos!</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <h2 className="text-2xl sm:text-3xl font-serif text-white mb-1 sm:mb-2">Bem-vindo, {userName}!</h2>
      <p className="text-sm sm:text-base text-gray-500 mb-6 sm:mb-8">{userEmail || 'Sem e-mail cadastrado'}</p>

      {/* Legacy user banner */}
      {isLegacy && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0 mt-0.5">📋</span>
            <div>
              <h3 className="text-sm font-bold text-amber-300 mb-1">
                Temos seus dados do diagnóstico anterior
              </h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Você já preencheu nosso diagnóstico completo anteriormente e seus dados estão armazenados com segurança.
                Agora temos uma versão mais curta e objetiva. Se quiser, pode respondê-la nos módulos abaixo — mas <strong className="text-white/80">não é obrigatório</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Cards — visible after diagnostic submission (above pipeline for mobile) */}
      {diagnosticStatus === 'submitted' && (
        <div className="mb-8">
          <h3 className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-4">
            Ações Disponíveis
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Brand Brain shortcut */}
            {(brandBrainStatus === 'mentor_review' || brandBrainStatus === 'approved' || brandBrainStatus === 'generated' || brandBrainStatus === 'danilo_review') && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="border-2 border-prosperus-gold-dark/60 bg-prosperus-gold-dark/10 rounded-xl p-5 cursor-pointer hover:bg-prosperus-gold-dark/15 hover:border-prosperus-gold-dark transition-all"
                onClick={() => onNavigate('brand_brain_review')}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">🧠</span>
                  <div>
                    <h4 className="text-lg font-bold text-white">Brand Brain</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      brandBrainStatus === 'approved'
                        ? 'bg-green-500/20 text-green-400'
                        : brandBrainStatus === 'mentor_review'
                        ? 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark'
                        : 'bg-white/10 text-white/50'
                    }`}>
                      {brandBrainStatus === 'approved' ? 'Aprovado ✓' :
                       brandBrainStatus === 'mentor_review' ? 'Aguardando Revisão' :
                       'Em preparação'}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-white/50">
                  {brandBrainStatus === 'mentor_review'
                    ? 'Revise e aprove seu documento estratégico.'
                    : brandBrainStatus === 'approved'
                    ? 'Visualize e baixe seu Brand Brain completo.'
                    : 'Seu documento estratégico está sendo preparado.'}
                </p>
              </motion.div>
            )}

            {/* Assets shortcut */}
            {(assetsStatus === 'ready' || assetsStatus === 'delivered' || assetsStatus === 'generating') && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="border-2 border-prosperus-gold-dark/60 bg-prosperus-gold-dark/10 rounded-xl p-5 cursor-pointer hover:bg-prosperus-gold-dark/15 hover:border-prosperus-gold-dark transition-all"
                onClick={() => onNavigate('deliverables')}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">📦</span>
                  <div>
                    <h4 className="text-lg font-bold text-white">Ativos</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      assetsStatus === 'delivered' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {assetsStatus === 'delivered' ? 'Prontos ✓' : assetsStatus === 'generating' ? 'Gerando...' : 'Disponíveis'}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-white/50">
                  Scripts, páginas e materiais de vendas gerados da sua estratégia.
                </p>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Pipeline progress section */}
      {showPipelineSection && (
        <div className="mb-8">
          <h3 className="text-xs uppercase tracking-wider text-white/50 font-semibold mb-4">
            Progresso do Pipeline
          </h3>

          {/* Stage stepper */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-0 mb-4">
            {PIPELINE_STAGES.map((stage, idx) => {
              const effectivePipelineStatus = (diagnosticStatus === 'submitted' && pipelineStatus === 'diagnostic') ? 'research' : pipelineStatus;
              const stageState = getStageState(stage.key, effectivePipelineStatus);
              const isLast = idx === PIPELINE_STAGES.length - 1;

              return (
                <React.Fragment key={stage.key}>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.06 }}
                    className="flex flex-col items-center text-center min-w-0 flex-1"
                  >
                    {/* Stage dot */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 text-sm font-bold flex-shrink-0 ${
                      stageState === 'completed'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                        : stageState === 'active'
                        ? 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark border-2 border-prosperus-gold-dark animate-pulse'
                        : 'bg-white/5 text-white/50 border border-white/10'
                    }`}>
                      {stageState === 'completed' ? '✓' : idx + 1}
                    </div>
                    <p className={`text-xs font-semibold leading-tight ${
                      stageState === 'active' ? 'text-prosperus-gold-dark' :
                      stageState === 'completed' ? 'text-green-400' : 'text-white/50'
                    }`}>
                      {stage.label}
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-white/20 leading-tight mt-0.5 max-w-[72px] text-center">
                      {stage.description}
                    </p>
                  </motion.div>

                  {/* Connector line */}
                  {!isLast && (
                    <div className="hidden sm:flex items-start pt-4 flex-shrink-0">
                      <div className={`w-6 h-px mt-0 ${
                        getStageState(PIPELINE_STAGES[idx + 1].key, pipelineStatus) !== 'pending' ||
                        getStageState(stage.key, pipelineStatus) === 'completed'
                          ? 'bg-green-500/30'
                          : 'bg-white/10'
                      }`} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Contextual message — hidden after delivery */}
          {contextualMsg && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-start gap-3">
              <span className="text-lg flex-shrink-0">{contextualMsg.icon}</span>
              <p className="text-sm text-white/70">{contextualMsg.text}</p>
            </div>
          )}
        </div>
      )}

      {/* Diagnostic progress bar */}
      <div className={`mb-8 ${diagnosticStatus === 'submitted' ? 'sm:mb-6' : 'sm:mb-12'}`}>
        <div className="flex justify-between items-center mb-2 sm:mb-3">
          <h3 className={`font-semibold text-white ${diagnosticStatus === 'submitted' ? 'text-sm' : 'text-base sm:text-lg'}`}>
            {diagnosticStatus === 'submitted' ? 'Diagnóstico Completo' : 'Progresso do Diagnóstico'}
          </h3>
          <span className={`font-bold text-prosperus-gold-dark ${diagnosticStatus === 'submitted' ? 'text-base' : 'text-xl sm:text-2xl'}`}>
            {diagnosticStatus === 'submitted' ? '✓ 100%' : `${progress}%`}
          </span>
        </div>
        {diagnosticStatus !== 'submitted' && (
          <div className="w-full bg-gray-700 rounded-full h-2 sm:h-3">
            <div
              className="h-full bg-gradient-to-r from-prosperus-gold-dark to-yellow-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Current stage indicator (only when not submitted) */}
      {diagnosticStatus !== 'submitted' && (
        <div className="mb-6 p-3 sm:p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs sm:text-sm text-blue-300">
          📍 Módulo atual:{' '}
          <strong>
            {currentModule === 'pre_module' ? 'Materiais Existentes' :
             currentModule === 'mentor'     ? 'O Mentor' :
             currentModule === 'mentee'     ? 'O Mentorado' :
             currentModule === 'method'     ? 'O Método' :
             currentModule === 'offer'      ? 'A Oferta' :
             currentModule}
          </strong>
        </div>
      )}

      {/* Pre-Module card — subdued when submitted */}
      <div className="mb-6">
        <p className="text-[10px] sm:text-xs font-bold text-white/50 uppercase tracking-widest mb-2">
          {diagnosticStatus === 'submitted' ? 'Suas Respostas' : 'Antes de começar'}
        </p>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`border rounded-lg p-4 sm:p-5 transition-all cursor-pointer ${
            diagnosticStatus === 'submitted'
              ? 'bg-white/5 border-white/10 opacity-60 hover:opacity-80'
              : preModuleComplete
              ? 'bg-prosperus-gold-dark/10 border-prosperus-gold-dark/50'
              : currentModule === 'pre_module'
              ? 'bg-prosperus-gold-dark/10 border-prosperus-gold-dark/30'
              : 'bg-white/5 border-white/10 hover:border-white/20'
          }`}
          onClick={() => onNavigate('pre_module')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📁</span>
              <div>
                <h3 className={`font-bold text-white ${diagnosticStatus === 'submitted' ? 'text-sm' : 'text-base sm:text-lg'}`}>Materiais Existentes</h3>
                {diagnosticStatus !== 'submitted' && (
                  <p className="text-sm text-white/50 font-sans">Importe o que você já tem. Zero esforço cognitivo.</p>
                )}
              </div>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
              preModuleComplete ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'
            }`}>
              {preModuleComplete ? 'Completo' : 'Opcional'}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-[10px] sm:text-xs font-bold text-white/50 uppercase tracking-widest">
          {diagnosticStatus === 'submitted' ? 'Módulos do Diagnóstico' : 'Sua Jornada'}
        </span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Journey modules — compact when submitted */}
      <div className={`grid gap-4 sm:gap-5 ${
        diagnosticStatus === 'submitted'
          ? 'grid-cols-2 sm:grid-cols-4'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      }`}>
        {journeyModules.map((module, index) => {
          const isActive = currentModule === module.id;
          const isSubmitted = diagnosticStatus === 'submitted';
          return (
            <motion.div
              key={module.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`border rounded-lg transition-all cursor-pointer ${
                isSubmitted
                  ? 'p-3 bg-white/5 border-white/10 opacity-60 hover:opacity-80'
                  : module.complete
                  ? 'p-4 sm:p-5 bg-prosperus-gold-dark/10 border-prosperus-gold-dark/50'
                  : isActive
                  ? 'p-4 sm:p-5 bg-prosperus-gold-dark/10 border-prosperus-gold-dark/30'
                  : 'p-4 sm:p-5 bg-white/5 border-white/10 hover:border-white/20'
              }`}
              onClick={() => onNavigate(module.id)}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`${isSubmitted ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs'} rounded-full font-bold flex items-center justify-center ${
                  module.complete ? 'bg-green-500/20 text-green-400' : 'bg-prosperus-gold-dark/20 text-prosperus-gold-dark'
                }`}>
                  {module.complete ? '✓' : index + 1}
                </span>
                <span className={isSubmitted ? 'text-base' : 'text-lg'}>{module.icon}</span>
              </div>
              <h3 className={`font-bold text-white mb-1 ${isSubmitted ? 'text-xs' : 'text-base sm:text-lg'}`}>{module.label}</h3>
              {!isSubmitted && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  module.complete ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {module.complete ? 'Completo' : 'Pendente'}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
