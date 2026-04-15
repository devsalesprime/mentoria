import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Logo } from './ui/Logo';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useDiagnosticPersistence } from '../hooks/useDiagnosticPersistence';
import {
  isPreModuleComplete,
  isMentorComplete,
  isMenteeComplete,
  isMethodComplete,
  isOfferComplete,
} from '../utils/progress';
import { PreModule } from './modules/PreModule';
import { MentorModule } from './modules/MentorModule';
import { MenteeModule } from './modules/MenteeModule';
import { MethodModule } from './modules/MethodModule';
import { OfferModule } from './modules/OfferModule';
import { OverviewPanel } from './OverviewPanel';
import { BrandBrainViewer } from './brand-brain/BrandBrainViewer';
import { AssetDeliveryHub } from './assets/AssetDeliveryHub';
import { EducationalSuggestionsView } from './suggestions/EducationalSuggestionsView';
import { InsightsHub } from './insights/InsightsHub';
import { PrioritiesScreen } from './modules/PrioritiesScreen';
import { ModuleErrorBoundary } from './shared/ModuleErrorBoundary';
import type { PipelineStatus } from '../types/pipeline';

// ─── URL slug ↔ internal module ID mapping ───────────────────────────────────
const SLUG_TO_ID: Record<string, string> = {
  'overview': 'overview',
  'pre-module': 'pre_module',
  'mentor': 'mentor',
  'mentee': 'mentee',
  'method': 'method',
  'offer': 'offer',
  'complete': 'diagnostic_complete',
  'brand-brain': 'brand_brain_review',
  'assets': 'deliverables',
  'suggestions': 'suggestions',
  'insights': 'insights',
};

const ID_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG_TO_ID).map(([slug, id]) => [id, slug])
);

interface UserDataShape {
  name?: string;
  email?: string;
  description?: string;
}

interface DashboardProps {
  userData?: UserDataShape;
  userName?: string;
  userEmail?: string;
  userDescription?: string;
  token?: string;
  onLogout: () => void;
  onUpdateProfile?: (data: { name: string; description: string }) => void;
  initialModule?: string;
}

type MenuItem = { id: string; label: string; statusDot?: 'green' | 'yellow' | 'gray' | 'gold' };
type MenuSection = { id: string; title: string; items: MenuItem[] };

// ─── Dynamic sidebar menu ──────────────────────────────────────────────────────

const getSidebarMenu = (
  diagnosticStatus: string,
  pipelineStatus: PipelineStatus,
  brandBrainStatus: string,
  assetsStatus: string,
  preModuleComplete: boolean,
  mentorComplete: boolean,
  menteeComplete: boolean,
  methodComplete: boolean,
  offerComplete: boolean,
  currentModule: string,
  feedbackStatus: string,
  showAssetsToUser: boolean,
  hasEducationalSuggestions: boolean,
): MenuSection[] => {
  const moduleStatus = (id: string, complete: boolean): 'green' | 'yellow' | 'gold' => {
    if (complete) return 'green';
    if (currentModule === id) return 'gold';
    return 'yellow';
  };

  const menu: MenuSection[] = [
    {
      id: 'geral',
      title: '',
      items: [{ id: 'overview', label: 'Visão Geral' }],
    },
  ];

  // DIAGNÓSTICO
  menu.push({
    id: 'diagnostic',
    title: 'DIAGNÓSTICO',
    items: [
      { id: 'pre_module', label: 'Materiais Existentes', statusDot: preModuleComplete ? 'green' : 'yellow' },
      { id: 'mentor',     label: 'O Mentor',             statusDot: moduleStatus('mentor', mentorComplete) },
      { id: 'mentee',     label: 'O Mentorado',          statusDot: moduleStatus('mentee', menteeComplete) },
      { id: 'method',     label: 'O Método',             statusDot: moduleStatus('method', methodComplete) },
      { id: 'offer',      label: 'A Oferta',             statusDot: moduleStatus('offer', offerComplete) },
    ],
  });

  // INTELIGÊNCIA — Insights (primary), Sugestões, Brand Brain
  // Also include when admin has explicitly delivered feedback, even if diagnostic is still in_progress
  const hasInsightsAccess = diagnosticStatus === 'submitted' || feedbackStatus === 'delivered';
  if (brandBrainStatus !== 'pending' || hasInsightsAccess) {
    const insightsDot: 'green' | 'yellow' =
      feedbackStatus === 'delivered' ? 'green' : 'yellow';

    const bbDot: 'green' | 'yellow' | 'gray' =
      brandBrainStatus === 'ready' ? 'green' :
      brandBrainStatus === 'generating' ? 'yellow' : 'gray';

    const intItems: MenuItem[] = [];

    // Insights — show when diagnostic submitted or feedback already delivered
    if (hasInsightsAccess) {
      intItems.push({ id: 'insights', label: 'Insights', statusDot: insightsDot });
    }

    // Sugestões — only when admin has populated them
    if (hasEducationalSuggestions) {
      intItems.push({ id: 'suggestions', label: 'Sugestões', statusDot: 'green' });
    }

    // Brand Brain
    if (brandBrainStatus !== 'pending') {
      intItems.push({ id: 'brand_brain_review', label: 'Brand Brain', statusDot: bbDot });
    }

    if (intItems.length > 0) {
      menu.push({
        id: 'inteligencia',
        title: 'INTELIGÊNCIA',
        items: intItems,
      });
    }
  }

  // ENTREGÁVEIS — only when admin has enabled for this user (PV-3.1)
  if (showAssetsToUser && (assetsStatus === 'ready' || assetsStatus === 'delivered' || assetsStatus === 'generating')) {
    const assetDot: 'green' | 'yellow' | 'gray' =
      (assetsStatus === 'ready' || assetsStatus === 'delivered') ? 'green' :
      assetsStatus === 'generating' ? 'yellow' : 'gray';

    menu.push({
      id: 'entregaveis',
      title: 'ENTREGÁVEIS',
      items: [
        { id: 'deliverables', label: 'Meus Ativos', statusDot: assetDot },
      ],
    });
  }

  return menu;
};

// ─── Dot indicator ─────────────────────────────────────────────────────────────

const DotIndicator: React.FC<{ dot?: 'green' | 'yellow' | 'gray' | 'gold' }> = ({ dot }) => {
  if (!dot) return null;
  const classes = {
    green:  'bg-green-400',
    yellow: 'bg-yellow-400',
    gray:   'bg-white/20',
    gold:   'bg-prosperus-gold-dark',
  }[dot];
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${classes}`} />;
};

// ─── Dashboard component ───────────────────────────────────────────────────────

export const Dashboard: React.FC<DashboardProps> = (props) => {
  const { module: urlModule } = useParams<{ module?: string }>();
  const navigate = useNavigate();

  const resolvedName = props.userData?.name ?? props.userName ?? 'Membro';
  const resolvedEmail = props.userData?.email ?? props.userEmail ?? '';
  const resolvedDescription = props.userData?.description ?? props.userDescription ?? '';

  // Resolve initial module: URL param > initialModule prop > 'overview'
  const resolveModule = (slug?: string) => (slug && SLUG_TO_ID[slug]) || 'overview';
  const initialFromUrl = resolveModule(urlModule);
  const [activeItem, setActiveItem] = useState(props.initialModule || initialFromUrl);

  // Sync URL → state when URL param changes
  useEffect(() => {
    const resolved = resolveModule(urlModule);
    if (resolved !== activeItem && urlModule) {
      setActiveItem(resolved);
    }
  }, [urlModule]);

  // Navigate helper that updates both state and URL
  const navigateTo = (moduleId: string) => {
    setActiveItem(moduleId);
    const slug = ID_TO_SLUG[moduleId] || moduleId;
    if (slug === 'overview') {
      navigate('/dashboard', { replace: true });
    } else {
      navigate(`/dashboard/${slug}`, { replace: true });
    }
  };
  const [openSections, setOpenSections] = useState<string[]>(['geral', 'diagnostic', 'entregaveis', 'inteligencia']);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState(resolvedName);
  const [editDescription, setEditDescription] = useState(resolvedDescription);

  const token = props.token ?? '';

  const {
    preModule, mentor, mentee, method, offer, priorities,
    updatePreModule, updateMentor, updateMentee, updateMethod, updateOffer, updatePriorities,
    currentModule, setCurrentModule,
    progressPercentage, diagnosticStatus, isLegacy,
    isSaving, lastSaveError,
    submitDiagnostic,
    // Pipeline status
    pipelineStatus, brandBrainStatus, assetsStatus, researchStatus,
    feedbackStatus, showAssetsToUser, hasEducationalSuggestions,
    refreshPipelineStatus,
  } = useDiagnosticPersistence(token);

  // PV-1.2/PV-3.1: Default route post-login — redirect to insights when submitted
  // or when admin has delivered feedback for an in_progress user
  const [hasRedirected, setHasRedirected] = useState(false);
  useEffect(() => {
    if (hasRedirected || urlModule) return; // Don't redirect if user navigated via URL
    if (diagnosticStatus === 'submitted' || feedbackStatus === 'delivered') {
      navigateTo('insights');
      setHasRedirected(true);
    }
  }, [diagnosticStatus, feedbackStatus, hasRedirected, urlModule]);

  const preModuleComplete = isLegacy || isPreModuleComplete(preModule);
  const mentorComplete    = isLegacy || isMentorComplete(mentor);
  const menteeComplete    = isLegacy || isMenteeComplete(mentee);
  const methodComplete    = isLegacy || isMethodComplete(method);
  const offerComplete     = isLegacy || isOfferComplete(offer);
  const effectiveProgress = (isLegacy || diagnosticStatus === 'submitted') ? 100 : progressPercentage;

  const methodEdges = {
    pointA: { internal: mentee.beforeInternal, external: mentee.beforeExternal },
    pointB: { internal: mentee.afterInternal, external: mentee.afterExternal },
  };

  const menuStructure = getSidebarMenu(
    diagnosticStatus,
    pipelineStatus,
    brandBrainStatus,
    assetsStatus,
    preModuleComplete,
    mentorComplete,
    menteeComplete,
    methodComplete,
    offerComplete,
    currentModule,
    feedbackStatus,
    showAssetsToUser,
    hasEducationalSuggestions,
  );

  // Ensure newly visible sections are open automatically
  useEffect(() => {
    if (brandBrainStatus !== 'pending' || diagnosticStatus === 'submitted' || feedbackStatus === 'delivered') {
      setOpenSections((prev) => prev.includes('inteligencia') ? prev : [...prev, 'inteligencia']);
    }
    if (assetsStatus === 'ready' || assetsStatus === 'delivered' || assetsStatus === 'generating') {
      setOpenSections((prev) => prev.includes('entregaveis') ? prev : [...prev, 'entregaveis']);
    }
  }, [brandBrainStatus, assetsStatus, diagnosticStatus, feedbackStatus]);

  useEffect(() => setEditName(resolvedName), [resolvedName]);
  useEffect(() => setEditDescription(resolvedDescription), [resolvedDescription]);

  const handleSaveProfile = () => {
    if (props.onUpdateProfile) {
      props.onUpdateProfile({ name: editName, description: editDescription });
    }
    setIsProfileModalOpen(false);
  };

  const MODULE_SEQUENCE: Record<string, string> = {
    pre_module: 'mentor',
    mentor: 'mentee',
    mentee: 'method',
    method: 'offer',
    offer: 'diagnostic_complete',
  };

  const allModulesComplete = mentorComplete && menteeComplete && methodComplete && offerComplete;

  const handleModuleComplete = (currentModuleId: string) => {
    // For the offer module: only go to diagnostic_complete if ALL required modules are done
    // Pre-module is optional and does not gate progression to submit
    if (currentModuleId === 'offer' && !allModulesComplete) {
      // Find first incomplete required module and navigate there
      const completionMap: Record<string, boolean> = {
        mentor: mentorComplete,
        mentee: menteeComplete,
        method: methodComplete,
      };
      const firstIncomplete = Object.entries(completionMap).find(([, done]) => !done);
      if (firstIncomplete) {
        navigateTo(firstIncomplete[0]);
        setCurrentModule(firstIncomplete[0]);
        return;
      }
    }

    const next = MODULE_SEQUENCE[currentModuleId];
    if (next) {
      navigateTo(next);
      if (next !== 'overview' && next !== 'diagnostic_complete') setCurrentModule(next);
    }
  };

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const getActiveLabel = () => {
    for (const section of menuStructure) {
      const item = section.items.find(i => i.id === activeItem);
      if (item) return item.label;
    }
    return 'Visão Geral';
  };

  // ─── Content rendering ─────────────────────────────────────────────────────

  const renderContent = () => {
    if (activeItem === 'diagnostic_complete') {
      const alreadySubmitted = diagnosticStatus === 'submitted';
      return (
        <PrioritiesScreen
          mentee={mentee}
          method={method}
          offer={offer}
          priorities={priorities}
          onUpdate={updatePriorities}
          alreadySubmitted={alreadySubmitted}
          onSubmit={async () => {
            if (!alreadySubmitted) {
              await submitDiagnostic();
            }
            navigateTo('insights');
          }}
        />
      );
    }

    if (activeItem === 'overview') {
      return (
        <ModuleErrorBoundary moduleName="Visão Geral">
        <OverviewPanel
          userName={resolvedName}
          userEmail={resolvedEmail}
          progress={isLegacy ? 100 : progressPercentage}
          currentModule={currentModule}
          diagnosticStatus={diagnosticStatus}
          isLegacy={isLegacy}
          preModuleComplete={isLegacy || preModuleComplete}
          mentorComplete={isLegacy || mentorComplete}
          menteeComplete={isLegacy || menteeComplete}
          methodComplete={isLegacy || methodComplete}
          offerComplete={isLegacy || offerComplete}
          onNavigate={(id) => {
            navigateTo(id);
            const DIAGNOSTIC_MODULES = ['pre_module', 'mentor', 'mentee', 'method', 'offer'];
            if (DIAGNOSTIC_MODULES.includes(id)) {
              setCurrentModule(id);
            }
          }}
          pipelineStatus={pipelineStatus}
          brandBrainStatus={brandBrainStatus}
          assetsStatus={assetsStatus}
          researchStatus={researchStatus}
          feedbackStatus={feedbackStatus}
        />
        </ModuleErrorBoundary>
      );
    }

    if (activeItem === 'pre_module') {
      return (
        <ModuleErrorBoundary moduleName="Pré-Módulo">
          <PreModule
            data={preModule}
            onUpdate={updatePreModule}
            token={token}
            onModuleComplete={() => handleModuleComplete('pre_module')}
          />
        </ModuleErrorBoundary>
      );
    }

    if (activeItem === 'mentor') {
      return (
        <ModuleErrorBoundary moduleName="Mentor">
          <MentorModule
            data={mentor}
            onUpdate={updateMentor}
            token={token}
            onModuleComplete={() => handleModuleComplete('mentor')}
          />
        </ModuleErrorBoundary>
      );
    }

    if (activeItem === 'mentee') {
      return (
        <ModuleErrorBoundary moduleName="Mentee">
          <MenteeModule
            data={mentee}
            onUpdate={updateMentee}
            token={token}
            onModuleComplete={() => handleModuleComplete('mentee')}
          />
        </ModuleErrorBoundary>
      );
    }

    if (activeItem === 'method') {
      return (
        <ModuleErrorBoundary moduleName="Método">
          <MethodModule
            data={method}
            onUpdate={updateMethod}
            token={token}
            edges={methodEdges}
            onModuleComplete={() => handleModuleComplete('method')}
          />
        </ModuleErrorBoundary>
      );
    }

    if (activeItem === 'offer') {
      return (
        <ModuleErrorBoundary moduleName="Oferta">
          <OfferModule
            data={offer}
            onUpdate={updateOffer}
            token={token}
            onModuleComplete={() => handleModuleComplete('offer')}
          />
        </ModuleErrorBoundary>
      );
    }

    // ─── Epic 3 components ──────────────────────────────────────────────────

    if (activeItem === 'deliverables') {
      return (
        <ModuleErrorBoundary moduleName="Entregáveis">
          <AssetDeliveryHub
            token={token}
            onNavigate={(id) => navigateTo(id)}
            mentorName={resolvedName}
          />
        </ModuleErrorBoundary>
      );
    }

    if (activeItem === 'brand_brain_review') {
      return (
        <ModuleErrorBoundary moduleName="Brand Brain">
          <BrandBrainViewer token={token} onPipelineRefresh={refreshPipelineStatus} />
        </ModuleErrorBoundary>
      );
    }

    if (activeItem === 'insights') {
      return (
        <ModuleErrorBoundary moduleName="Insights">
          <InsightsHub token={token} onNavigate={(id) => navigateTo(id)} />
        </ModuleErrorBoundary>
      );
    }

    if (activeItem === 'suggestions') {
      return (
        <ModuleErrorBoundary moduleName="Sugestões Educacionais">
          <EducationalSuggestionsView token={token} />
        </ModuleErrorBoundary>
      );
    }

    // Fallback
    return (
      <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-1 min-h-[600px] shadow-2xl relative overflow-hidden flex items-center justify-center">
        <div className="text-center">
          <span className="text-4xl text-prosperus-gold-dark mb-4 block">🚧</span>
          <h3 className="font-serif text-2xl text-white mb-2">{getActiveLabel()}</h3>
          <p className="text-gray-500">Este módulo será implementado em breve.</p>
          <Button
            variant="link"
            onClick={() => navigateTo('overview')}
            className="mt-6 text-prosperus-gold-dark"
          >
            Voltar para Visão Geral
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-prosperus-navy flex text-white font-sans overflow-hidden relative">
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        aria-label="Menu lateral"
        className={`fixed lg:static inset-y-0 left-0 w-64 sm:w-72 lg:w-64 bg-prosperus-navy-panel border-r border-white/5 p-4 sm:p-6 z-50 lg:z-0 lg:translate-x-0 overflow-y-auto transition-transform duration-300 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 sm:mb-8">
          <Logo className="w-full h-auto" />
        </div>

        {/* Progress in sidebar */}
        <div className="mb-4 px-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] sm:text-xs text-gray-400">Progresso</span>
            <span className="text-xs sm:text-sm font-bold text-prosperus-gold-dark">{effectiveProgress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div
              className="h-full bg-gradient-to-r from-prosperus-gold-dark to-yellow-500 rounded-full transition-all"
              style={{ width: `${effectiveProgress}%` }}
            />
          </div>
        </div>

        <nav aria-label="Navegação do diagnóstico">
          {menuStructure.map(section => (
            <div key={section.id} className="mb-4 sm:mb-6">
              {/* Section header — hide for sections with empty title */}
              {section.title ? (
                <button
                  onClick={() => toggleSection(section.id)}
                  className="text-[10px] sm:text-xs font-bold text-gray-400 hover:text-white transition mb-2 sm:mb-3 flex items-center justify-between w-full"
                >
                  {section.title}
                  <span className="text-[10px] sm:text-xs">
                    {openSections.includes(section.id) ? '▼' : '▶'}
                  </span>
                </button>
              ) : null}
              {(!section.title || openSections.includes(section.id)) && (
                <div className="space-y-1 sm:space-y-2">
                  {section.items.map(item => {
                    const isCurrent = activeItem === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          navigateTo(item.id);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-2 w-full text-left px-3 sm:px-4 py-1.5 sm:py-2 rounded transition text-xs sm:text-sm
                          ${isCurrent ? 'bg-prosperus-gold-dark text-black font-semibold' : 'text-gray-400 hover:text-white hover:bg-white/5'}
                        `}
                      >
                        <span className="truncate flex-1">{item.label}</span>
                        {!isCurrent && <DotIndicator dot={item.statusDot} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
      </motion.aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header bar */}
        <header className="bg-prosperus-navy-panel border-b border-white/5 px-3 sm:px-4 md:px-6 py-3 sm:py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <Button
              variant="ghost"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden text-white text-xl sm:text-2xl flex-shrink-0"
            >
              ☰
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg md:text-xl font-bold text-white truncate">
                {getActiveLabel()}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
            {lastSaveError && (
              <div className="hidden sm:flex text-red-400 text-sm font-semibold items-center gap-2 bg-red-500/10 px-2 sm:px-3 py-1 sm:py-1.5 rounded border border-red-500/20">
                <span className="hidden md:inline">Erro ao salvar: {lastSaveError}</span>
                <span className="md:hidden">Erro</span>
              </div>
            )}
            {isSaving && !lastSaveError && (
              <span className="hidden sm:flex text-prosperus-gold-dark text-[10px] sm:text-xs font-semibold animate-pulse items-center gap-1">
                <span className="w-1.5 h-1.5 bg-prosperus-gold-dark rounded-full inline-block" />
                <span className="hidden md:inline">Salvando...</span>
              </span>
            )}
            {!isSaving && !lastSaveError && (
              <span className="hidden sm:flex text-green-400 text-[10px] sm:text-xs font-semibold items-center gap-1">
                <span className="hidden md:inline">Salvo</span>
              </span>
            )}
            <Button
              variant="ghost"
              onClick={() => setIsProfileModalOpen(true)}
              className="text-xs sm:text-sm text-gray-400 hover:text-white hidden sm:block"
            >
              👤 <span className="hidden md:inline">Perfil</span>
            </Button>
            <Button
              variant="danger-soft"
              size="sm"
              onClick={() => { props.onLogout(); navigate('/'); }}
              className="text-xs sm:text-sm"
            >
              Sair
            </Button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeItem}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Profile modal */}
      <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)}>
        <div className="bg-prosperus-navy-mid border border-white/10 rounded-lg p-4 sm:p-6 md:p-8 max-w-md mx-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Editar Perfil</h2>
          <div className="space-y-3 sm:space-y-4">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nome"
              className="w-full bg-white/5 border border-white/10 rounded px-3 sm:px-4 py-2 text-sm sm:text-base text-white placeholder-gray-500"
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Descrição"
              className="w-full bg-white/5 border border-white/10 rounded px-3 sm:px-4 py-2 text-sm sm:text-base text-white placeholder-gray-500 h-20 sm:h-24 resize-none"
            />
          </div>
          <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-6">
            <Button
              variant="primary"
              onClick={handleSaveProfile}
              className="flex-1 text-sm sm:text-base"
            >
              Salvar
            </Button>
            <Button
              variant="secondary"
              onClick={() => setIsProfileModalOpen(false)}
              className="flex-1 text-sm sm:text-base"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
