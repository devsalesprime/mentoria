import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Logo } from './ui/Logo';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { decodeJwtPayload } from './routing/session';
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
import { FichaScreen } from './script/FichaScreen';
import { MateriaisScreen } from './script/MateriaisScreen';
import { ScriptScreen } from './script/ScriptScreen';
import { useScriptFicha, rotaInicialDoClube, fichaEhSecundaria } from '../hooks/useScriptFicha';
import type { PipelineStatus } from '../types/pipeline';
import type { FichaStatus, MaterialsStatus } from '../data/script-ficha-fields';

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
  // Script 7 Passos (cohort Exclusive)
  'materiais': 'script_materiais',
  'ficha': 'script_ficha',
  'script': 'script_script',
};

const ID_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG_TO_ID).map(([slug, id]) => [id, slug])
);

/** Telas da versao anterior (antes do Script 7 Passos). Quem e do clube e nunca concluiu aquela versao nao as ve. */
const TELAS_ANTERIORES = new Set([
  'overview', 'pre_module', 'mentor', 'mentee', 'method', 'offer', 'diagnostic_complete',
  'insights', 'suggestions', 'brand_brain_review', 'deliverables',
]);
/** Item do menu que mostra/oculta a versao anterior (nao e uma tela). */
const ITEM_ALTERNAR_ANTERIOR = 'alternar_anterior';
const chaveVersaoAnterior = (email: string) => `versao-anterior:${email}`;
const lerVersaoAnterior = (email: string): boolean => {
  try { return localStorage.getItem(chaveVersaoAnterior(email)) === '1'; } catch { return false; }
};

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
  /** JWT antigo sem a claim `cohort`: o Dashboard renova o token em silencio e avisa o App. */
  onTokenRefresh?: (token: string) => void;
}

type MenuItem ={ id: string; label: string; statusDot?: 'green' | 'yellow' | 'gray' | 'gold'; /** item secundario (opcao, nao etapa): menor, sem ponto */ secondary?: boolean; /** legenda de uma linha abaixo do rotulo */ caption?: string };
type MenuSection = { id: string; title: string; items: MenuItem[] };
type ScriptMenuState = {
  enabled: boolean;
  fichaStatus: FichaStatus | null;
  materialsStatus: MaterialsStatus | null;
  /** "Seu script": 'aprovado' | 'rascunho' (versao existe) | 'escrevendo' (job na fila) | null */
  scriptState?: 'aprovado' | 'rascunho' | 'escrevendo' | null;
  /** Os materiais bastaram (suficiente): "Ficha" vira opcao secundaria depois de "Seu script", nao uma etapa. */
  fichaSecundaria?: boolean;
};

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
  script: ScriptMenuState = { enabled: false, fichaStatus: null, materialsStatus: null },
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

  // SCRIPT 7 PASSOS — so para o cohort do Exclusive (users.cohort)
  if (script.enabled) {
    const fichaDot: 'green' | 'yellow' | 'gold' =
      script.fichaStatus === 'confirmada' ? 'green' :
      script.fichaStatus === 'em_revisao' ? 'gold' : 'yellow';
    const scriptDot: 'green' | 'yellow' | 'gold' | 'gray' =
      script.scriptState === 'aprovado' ? 'green' :
      script.scriptState === 'rascunho' ? 'gold' :
      script.scriptState === 'escrevendo' ? 'yellow' : 'gray';
    menu.push({
      id: 'script',
      title: 'SCRIPT 7 PASSOS',
      items: script.fichaSecundaria
        ? [
          { id: 'script_materiais', label: 'Materiais', statusDot: script.materialsStatus === 'submitted' ? 'green' : 'yellow' },
          { id: 'script_script', label: 'Seu script', statusDot: scriptDot },
          { id: 'script_ficha', label: 'Ficha', secondary: true },
        ]
        : [
          { id: 'script_materiais', label: 'Materiais', statusDot: script.materialsStatus === 'submitted' ? 'green' : 'yellow' },
          { id: 'script_ficha', label: 'Ficha do Script', statusDot: fichaDot },
          { id: 'script_script', label: 'Seu script', statusDot: scriptDot },
        ],
    });
  }

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
  const [openSections, setOpenSections] = useState<string[]>(['geral', 'script', 'diagnostic', 'entregaveis', 'inteligencia']);
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
    // Cohort (Script 7 Passos)
    cohort, diagnosticLoaded,
  } = useDiagnosticPersistence(token);

  // Script 7 Passos: uma instancia so, compartilhada entre Materiais e Ficha (nao faz nada sem cohort)
  // O JWT ja carrega cohort/clubSlug desde o login: habilita a area do script no primeiro paint,
  // sem esperar o GET /api/diagnostic (que chegava depois e deixava o menu sem "Script 7 Passos").
  const cohortDoToken = useMemo(() => {
    const payload = decodeJwtPayload(token);
    return typeof payload?.cohort === 'string' && payload.cohort ? payload.cohort : null;
  }, [token]);
  // Fonte efetiva do cohort: o GET /api/diagnostic (banco) manda; o JWT so adianta o primeiro paint.
  const cohortEfetivo = cohort ?? cohortDoToken;
  const scriptFicha = useScriptFicha(token, !!cohortEfetivo, resolvedEmail);
  const scriptMenu = useMemo<ScriptMenuState>(() => {
    const s = scriptFicha.data?.script;
    return {
      enabled: !!cohortEfetivo && scriptFicha.enabled,
      fichaStatus: scriptFicha.data?.ficha_status ?? null,
      materialsStatus: scriptFicha.data?.materials_status ?? null,
      scriptState: s?.aprovada ? 'aprovado'
        : (s?.versoes || 0) > 0 ? 'rascunho'
        : s?.job && (s.job.status === 'queued' || s.job.status === 'running') ? 'escrevendo'
        : null,
      fichaSecundaria: fichaEhSecundaria(scriptFicha.data),
    };
  }, [cohortEfetivo, scriptFicha.enabled, scriptFicha.data]);

  // Primeiro paint deterministico: sem a claim `cohort` no JWT, a secao "Script 7 Passos" depende do
  // GET /api/diagnostic. Segura o shell ate a resposta (o hook tem timeout de 15 s) em vez de pintar
  // o menu sem a secao e encaixa-la depois.
  const aguardandoCohort = !cohortDoToken && !diagnosticLoaded;

  // Versao anterior x Script 7 Passos (pedido do Danilo, 04/09): quem e do clube e ja concluiu a versao anterior
  // (enviou ou foi marcado como concluido pelo admin) ainda a acessa, mas por um item discreto abaixo do script.
  // Quem e do clube e nunca concluiu so ve o Script 7 Passos. Fora do clube nada muda.
  const anteriorConcluido = diagnosticStatus === 'submitted' || isLegacy;
  const soFluxoNovo = !!cohortEfetivo && !anteriorConcluido;
  const [mostrarAnterior, setMostrarAnterior] = useState<boolean>(() => lerVersaoAnterior(resolvedEmail));
  const definirMostrarAnterior = (valor: boolean) => {
    setMostrarAnterior(valor);
    try { localStorage.setItem(chaveVersaoAnterior(resolvedEmail), valor ? '1' : '0'); } catch { /* sem storage */ }
  };

  // JWT emitido antes da claim `cohort` (ate 03/09): o banco diz que a pessoa e do cohort, o token nao.
  // Renova o token em silencio UMA vez por sessao (POST /auth/verify-member por e-mail), sem deslogar;
  // o App troca o token em memoria e os hooks recarregam com ele.
  const onTokenRefresh = props.onTokenRefresh;
  useEffect(() => {
    if (!token || !cohort || cohortDoToken || !resolvedEmail || !onTokenRefresh) return;
    const chave = 'token-renovado-cohort';
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, String(Date.now()));
    } catch { return; }
    let ativo = true;
    (async () => {
      try {
        const res = await fetch('/auth/verify-member', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: resolvedEmail }),
        });
        const body = await res.json().catch(() => null);
        if (!ativo || !res.ok || !body?.allowed || typeof body.token !== 'string' || !body.token) return;
        try { localStorage.setItem('memberToken', body.token); } catch { /* sem storage */ }
        onTokenRefresh(body.token);
      } catch { /* segue com o token atual: o menu ja vem do GET /api/diagnostic */ }
    })();
    return () => { ativo = false; };
  }, [token, cohort, cohortDoToken, resolvedEmail, onTokenRefresh]);

  // PV-1.2/PV-3.1: Default route post-login — redirect to insights when submitted
  // or when admin has delivered feedback for an in_progress user.
  // Cohort do Exclusive: Materiais com a ficha vazia; "Seu script" quando a ficha fechou ou os materiais bastaram
  // (suficiente); a Ficha nos outros casos (parcial abre so o que falta). Regra: hooks/useScriptFicha.ts rotaInicialDoClube.
  const [hasRedirected, setHasRedirected] = useState(false);
  useEffect(() => {
    if (hasRedirected || urlModule) return; // Don't redirect if user navigated via URL
    if (!diagnosticLoaded) return; // cohort vem no mesmo GET /api/diagnostic
    if (cohort) {
      if (!scriptFicha.loaded) return;
      if (scriptFicha.enabled && scriptFicha.data) {
        navigateTo(rotaInicialDoClube(scriptFicha.data));
        setHasRedirected(true);
        return;
      }
    }
    if (diagnosticStatus === 'submitted' || feedbackStatus === 'delivered') {
      navigateTo('insights');
      setHasRedirected(true);
    }
  }, [diagnosticStatus, feedbackStatus, hasRedirected, urlModule, diagnosticLoaded, cohort, scriptFicha.loaded, scriptFicha.enabled, scriptFicha.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clube sem a versao anterior concluida: qualquer tela antiga (URL direta, /dashboard, /brand-brain, /assets)
  // cai na tela inicial do clube. Antes de saber (GET /api/diagnostic e a ficha), a tela mostra o esqueleto.
  useEffect(() => {
    if (!soFluxoNovo || !diagnosticLoaded || !scriptFicha.loaded) return;
    if (!TELAS_ANTERIORES.has(activeItem)) return;
    if (!urlModule && !hasRedirected && scriptFicha.enabled && scriptFicha.data) return; // /dashboard: o efeito acima ja leva ao script
    navigateTo(rotaInicialDoClube(scriptFicha.data));
  }, [soFluxoNovo, diagnosticLoaded, scriptFicha.loaded, scriptFicha.enabled, scriptFicha.data, activeItem, urlModule, hasRedirected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clube com a versao anterior concluida: abrir uma tela antiga por URL revela a versao anterior no menu.
  useEffect(() => {
    if (!cohortEfetivo || !anteriorConcluido || mostrarAnterior) return;
    if (!TELAS_ANTERIORES.has(activeItem)) return;
    if (activeItem === 'overview' && urlModule !== 'overview') return; // /dashboard vai para o script, nao revela
    definirMostrarAnterior(true);
  }, [cohortEfetivo, anteriorConcluido, mostrarAnterior, activeItem, urlModule]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternarAnterior = () => {
    const proximo = !mostrarAnterior;
    definirMostrarAnterior(proximo);
    if (!proximo && TELAS_ANTERIORES.has(activeItem)) navigateTo(rotaInicialDoClube(scriptFicha.data));
  };

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

  const menuCompleto = getSidebarMenu(
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
    scriptMenu,
  );
  const secaoScript = menuCompleto.filter((s) => s.id === 'script');
  const secoesAnteriores = menuCompleto.filter((s) => s.id !== 'script');
  const menuStructure: MenuSection[] = !cohortEfetivo
    ? menuCompleto
    : (soFluxoNovo || !diagnosticLoaded)
      ? secaoScript
      : [
        ...secaoScript,
        {
          id: 'anterior',
          title: '',
          items: [{
            id: ITEM_ALTERNAR_ANTERIOR,
            label: mostrarAnterior ? 'Ocultar versão anterior' : 'Versão anterior',
            caption: 'O que você respondeu antes, com os insights',
            secondary: true,
          }],
        },
        ...(mostrarAnterior ? secoesAnteriores : []),
      ];
  const primeiraSecaoAnterior = cohortEfetivo && anteriorConcluido && mostrarAnterior ? secoesAnteriores[0]?.id : undefined;

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
    return cohortEfetivo ? 'Script 7 Passos' : 'Visão Geral';
  };

  // ─── Content rendering ─────────────────────────────────────────────────────

  const renderContent = () => {
    // Clube: tela antiga nunca pinta enquanto nao se sabe se a versao anterior foi concluida, nem para quem
    // nunca a concluiu (o redirecionamento acima leva para o script); /dashboard tambem espera a ficha.
    const telaAnterior = TELAS_ANTERIORES.has(activeItem);
    const aguardandoHomeDoClube = activeItem === 'overview' && !urlModule && !hasRedirected && !scriptFicha.loaded;
    if (cohortEfetivo && telaAnterior && (!diagnosticLoaded || soFluxoNovo || aguardandoHomeDoClube)) {
      return (
        <div aria-busy="true" className="min-h-[300px] flex items-center justify-center">
          <LoadingSpinner size="lg" label="Abrindo o seu script" />
        </div>
      );
    }

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
          showAssetsToUser={showAssetsToUser}
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

    // ─── Script 7 Passos (cohort Exclusive) ─────────────────────────────────

    if (activeItem === 'script_materiais') {
      return (
        <ModuleErrorBoundary moduleName="Materiais">
          <MateriaisScreen ficha={scriptFicha} token={token} onNavigate={(id) => navigateTo(id)} />
        </ModuleErrorBoundary>
      );
    }

    if (activeItem === 'script_ficha') {
      return (
        <ModuleErrorBoundary moduleName="Ficha do Script">
          <FichaScreen ficha={scriptFicha} onNavigate={(id) => navigateTo(id)} />
        </ModuleErrorBoundary>
      );
    }

    if (activeItem === 'script_script') {
      return (
        <ModuleErrorBoundary moduleName="Seu script">
          <ScriptScreen ficha={scriptFicha} token={token} onNavigate={(id) => navigateTo(id)} />
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

  if (aguardandoCohort) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen bg-prosperus-navy flex items-center justify-center text-white font-sans"
      >
        <LoadingSpinner size="lg" label="Abrindo a plataforma" />
      </div>
    );
  }

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
          {cohortEfetivo ? (
            <button
              type="button"
              aria-label="Início"
              onClick={() => { navigateTo(rotaInicialDoClube(scriptFicha.data)); setIsMobileMenuOpen(false); }}
              className="w-full block"
            >
              <Logo className="w-full h-auto" />
            </button>
          ) : (
            <Logo className="w-full h-auto" />
          )}
        </div>

        {/* Progress in sidebar (versao anterior; o clube nao ve) */}
        {!cohortEfetivo && (
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
        )}

        <nav aria-label="Navegação do diagnóstico">
          {menuStructure.map(section => (
            <div key={section.id} className="mb-4 sm:mb-6">
              {section.id === primeiraSecaoAnterior && (
                <div data-testid="divisor-versao-anterior" className="border-t border-white/10 mb-4 sm:mb-6" />
              )}
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
                          if (item.id === ITEM_ALTERNAR_ANTERIOR) { alternarAnterior(); return; }
                          navigateTo(item.id);
                          setIsMobileMenuOpen(false);
                        }}
                        data-secondary={item.secondary ? 'true' : undefined}
                        data-testid={item.id === ITEM_ALTERNAR_ANTERIOR ? 'versao-anterior' : undefined}
                        aria-pressed={item.id === ITEM_ALTERNAR_ANTERIOR ? mostrarAnterior : undefined}
                        className={`flex items-center gap-2 w-full text-left px-3 sm:px-4 rounded transition
                          ${item.secondary ? 'py-1 text-[11px] sm:text-xs italic pl-6 sm:pl-7' : 'py-1.5 sm:py-2 text-xs sm:text-sm'}
                          ${isCurrent ? 'bg-prosperus-gold-dark text-black font-semibold' : item.secondary ? 'text-gray-500 hover:text-white hover:bg-white/5' : 'text-gray-400 hover:text-white hover:bg-white/5'}
                        `}
                      >
                        {item.caption ? (
                          <span className="flex-1 min-w-0">
                            <span className="block truncate">{item.label}</span>
                            <span className="block truncate text-[10px] not-italic text-gray-600">{item.caption}</span>
                          </span>
                        ) : (
                          <span className="truncate flex-1">{item.label}</span>
                        )}
                        {!isCurrent && !item.secondary && <DotIndicator dot={item.statusDot} />}
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
              onClick={() => { scriptFicha.flushKeepalive(); props.onLogout(); navigate('/'); }}
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
