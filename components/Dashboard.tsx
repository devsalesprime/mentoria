import React, { useState, useEffect } from 'react';
import { Logo } from './ui/Logo';
import { motion, AnimatePresence } from 'framer-motion';
import { MentorModule, MentorData, INITIAL_MENTOR_DATA } from './modules/MentorModule';
import { MethodModule, MethodData, INITIAL_METHOD_DATA } from './modules/MethodModule';
import { MenteeModule, MenteeData, INITIAL_MENTEE_DATA } from './modules/MenteeModule';
import { DeliveryModule, DeliveryData, INITIAL_DELIVERY_DATA } from './modules/DeliveryModule';
import { Modal } from './ui/Modal';
import { useUserPersistence } from '../hooks/useUserPersistence';

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

type MenuItem = { id: string; label: string };
type MenuSection = { id: string; title: string; items: MenuItem[] };

const menuStructure: MenuSection[] = [
  { id: 'geral', title: 'PRINCIPAL', items: [{ id: 'overview', label: 'Dashboard - Visão Geral' }] },
  {
    id: 'fundacao', title: 'FUNDAÇÃO', items: [
      { id: 'mentor', label: 'O Mentor' },
      { id: 'mentorado', label: 'O Mentorado' },
      { id: 'metodo', label: 'O Método' },
      { id: 'entrega_fundacao', label: 'A Oferta' },
    ]
  },
  {
    id: 'preparacao', title: 'PREPARAÇÃO', items: [
      { id: 'marketing', label: 'Marketing' },
      { id: 'vendas', label: 'Vendas' },
      { id: 'entrega_preparacao', label: 'Entrega' },
    ]
  },
  { id: 'acao', title: 'AÇÃO', items: [{ id: 'plano_acao', label: 'Plano de Execução' }] }
];

type ModuleStatus = 'todo' | 'in_progress' | 'completed' | 'under_review';

export const Dashboard: React.FC<DashboardProps> = (props) => {
  const resolvedName = props.userData?.name ?? props.userName ?? 'Membro';
  const resolvedEmail = props.userData?.email ?? props.userEmail ?? '';
  const resolvedDescription = props.userData?.description ?? props.userDescription ?? '';

  const [activeItem, setActiveItem] = useState(props.initialModule || 'overview');
  const [openSections, setOpenSections] = useState<string[]>(['geral', 'fundacao']);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState(resolvedName);
  const [editDescription, setEditDescription] = useState(resolvedDescription);

  const token = props.token ?? '';

  // Integração do Hook de Persistência
  const { formData, saveProgress, saveImmediately, isSaving, lastSaveError, saveModuleStep, getModuleStep, markModuleCompleted } = useUserPersistence(token);

  // Derivando dados dos módulos com fallback para estado inicial
  const mentorData = (Object.keys(formData.mentor).length > 0 ? formData.mentor : INITIAL_MENTOR_DATA) as MentorData;
  const menteeData = (Object.keys(formData.mentee).length > 0 ? formData.mentee : INITIAL_MENTEE_DATA) as MenteeData;
  const methodData = (Object.keys(formData.method).length > 0 ? formData.method : INITIAL_METHOD_DATA) as MethodData;
  const deliveryData = (Object.keys(formData.delivery).length > 0 ? formData.delivery : INITIAL_DELIVERY_DATA) as DeliveryData;

  useEffect(() => setEditName(resolvedName), [resolvedName]);
  useEffect(() => setEditDescription(resolvedDescription), [resolvedDescription]);

  // Handlers de atualização usando o hook
  const handleUpdateMentor = (newData: MentorData) => saveProgress({ mentor: newData });
  const handleUpdateMentee = (newData: MenteeData) => saveProgress({ mentee: newData });
  const handleUpdateMethod = (newData: MethodData) => saveProgress({ method: newData });
  const handleUpdateDelivery = (newData: DeliveryData) => saveProgress({ delivery: newData });

  const handleSaveProfile = () => {
    if (props.onUpdateProfile) {
      props.onUpdateProfile({ name: editName, description: editDescription });
    }
    setIsProfileModalOpen(false);
  };

  const handleLogout = async () => {
    // Forçar salvamento antes de sair
    console.log('🚪 Logout: Salvando dados antes de sair...');
    try {
      await saveImmediately();
      // Pequeno delay para garantir que o salvamento foi concluído
      await new Promise(resolve => setTimeout(resolve, 300));
      console.log('✅ Logout: Dados salvos, saindo...');
    } catch (error) {
      console.error('❌ Erro ao salvar antes de logout:', error);
    }
    props.onLogout();
  };

  const handleSaveAndExit = (module: string) => {
    console.log(`✅ Módulo ${module} salvo!`);
    setActiveItem('overview');
  };

  const handleSendToEvaluation = (module: string) => {
    // Map module ID to persistence key
    const moduleKeyMap: Record<string, 'mentor' | 'mentee' | 'method' | 'delivery'> = {
      'mentor': 'mentor',
      'mentorado': 'mentee',
      'metodo': 'method',
      'entrega_fundacao': 'delivery'
    };

    const key = moduleKeyMap[module];
    if (key) {
      console.log(`✅ Marcando módulo ${module} (${key}) como concluído!`);
      markModuleCompleted(key);
    }

    setActiveItem('overview');
  };

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev => prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]);
  };

  const getActiveLabel = () => {
    for (const section of menuStructure) {
      const item = section.items.find(i => i.id === activeItem);
      if (item) return item.label;
    }
    return 'Módulo';
  };

  // ---------- UTILIDADES DE COMPLETION ----------
  const isPrimitive = (v: any) => (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');

  const countTotalLeaves = (obj: any): number => {
    if (obj === null || obj === undefined) return 0;
    if (Array.isArray(obj)) {
      if (obj.length === 0) return 1;
      if (obj.every(isPrimitive)) return 1;
      return obj.reduce((acc, it) => acc + countTotalLeaves(it), 0);
    }
    if (isPrimitive(obj)) return 1;
    return Object.keys(obj).reduce((acc, k) => acc + countTotalLeaves(obj[k]), 0);
  };

  const countFilledLeaves = (data: any, initial: any): number => {
    if ((data === null || data === undefined) && (initial === null || initial === undefined)) return 0;

    if (Array.isArray(initial)) {
      if (!Array.isArray(data)) {
        return 0;
      }
      if (data.length === 0) return 0;
      if (initial.length === 0 || initial.every(isPrimitive)) {
        return 1;
      }
      const maxLen = Math.max(initial.length, data.length);
      let sum = 0;
      for (let i = 0; i < maxLen; i++) {
        sum += countFilledLeaves(data[i], initial[i]);
      }
      return sum;
    }

    if (isPrimitive(initial)) {
      if (data === undefined || data === null) return 0;
      if (typeof data === 'string') {
        if (data.trim().length === 0) return 0;
        if (typeof initial === 'string' && initial.trim() === data.trim()) return 0;
        return 1;
      }
      if (typeof data === 'number') {
        if (data === 0 && initial === 0) return 0;
        if (data === initial) return 0;
        return 1;
      }
      if (typeof data === 'boolean') {
        if (data === initial) return 0;
        return data ? 1 : 0;
      }
      return 0;
    }

    if (typeof initial === 'object') {
      if (typeof data !== 'object' || data === null) {
        return 0;
      }
      let sum = 0;
      const keys = new Set([...Object.keys(initial || {}), ...Object.keys(data || {})]);
      keys.forEach(k => {
        sum += countFilledLeaves(data[k], initial[k]);
      });
      return sum;
    }

    return 0;
  };

  const computeModulePercent = (data: any, initial: any) => {
    const total = countTotalLeaves(initial);
    if (total === 0) {
      const fallback = data && typeof data === 'object' ? (Object.keys(data).length > 0 ? 100 : 0) : 0;
      return Math.min(100, fallback);
    }
    const filled = countFilledLeaves(data, initial);
    return Math.min(100, Math.round((filled / total) * 100)); // Capped at 100
  };

  // ---------- FIM UTILIDADES ----------

  // Centralizando cálculo de porcentagem
  const mentorPct = computeModulePercent(
    (() => {
      const { step6, ...rest } = mentorData;
      if (step6.hasNoTestimonials) {
        const { testimonials, hasNoTestimonials, ...cleanedStep6 } = step6;
        return { ...rest, step6: cleanedStep6 };
      }
      const { hasNoTestimonials, ...step6Rest } = step6;
      return { ...rest, step6: step6Rest };
    })(),
    (() => {
      const { step6, ...rest } = INITIAL_MENTOR_DATA;
      if (mentorData.step6.hasNoTestimonials) {
        const { testimonials, hasNoTestimonials, ...cleanedStep6 } = step6;
        return { ...rest, step6: cleanedStep6 };
      }
      const { hasNoTestimonials, ...step6Rest } = step6;
      return { ...rest, step6: step6Rest };
    })()
  );

  /* 
    CORREÇÃO DE PORCENTAGEM (MENTORADO):
    1. Para 'No Clients': 
       - defaults de ageRange (25/45) e hoursPerDay (2) devem contar como preenchidos.
       - 'behavior' e 'role.area' são opcionais, então removemos da conta.
    2. Para 'Yes Clients': fanHaterMap (null) não conta no total.
       Solução: Override no initial para estrutura vazia completa.
  */
  const menteePct = computeModulePercent(
    (() => {
      if (!menteeData.hasClients) return menteeData;
      const { hasClients, ...rest } = menteeData;

      if (menteeData.hasClients === 'no') {
        const { personas, fanHaterMap, communityImpact, icpSynthesis, ...pathData } = rest;

        // Remove opcionais (behavior, role.area)
        const { demographics, ...demoRest } = pathData;
        const { digitalPresence, role, ...demoFields } = demographics;
        const { behavior, ...digPresRest } = digitalPresence;
        const { area, ...roleRest } = role;

        return {
          ...demoRest,
          demographics: {
            ...demoFields,
            digitalPresence: digPresRest,
            role: roleRest
          }
        };
      } else {
        const { demographics, transformation, decisionMountain, consumptionJourney, icpTarget, ...pathData } = rest;
        const { personas, ...pathDataNoPersonas } = pathData; // Exclude personas
        const { community, impact } = pathData.communityImpact;
        const { definition: def1, ...communityRest } = community;
        const { definition: def2, ...impactRest } = impact;
        return { ...pathDataNoPersonas, communityImpact: { community: communityRest, impact: impactRest } };
      }
    })(),
    (() => {
      // OVERRIDE INITIAL DATA PARA CORREÇÃO DE CÁLCULO
      if (!menteeData.hasClients) return INITIAL_MENTEE_DATA;

      const baseInitial = { ...INITIAL_MENTEE_DATA };

      if (menteeData.hasClients === 'no') {
        const { hasClients, personas, fanHaterMap, communityImpact, icpSynthesis, ...pathData } = baseInitial;

        // Remove opcionais (behavior, role.area)
        const { demographics, ...demoRest } = pathData;
        const { digitalPresence, role, ...demoFields } = demographics;
        const { behavior, ...digPresRest } = digitalPresence;
        const { area, ...roleRest } = role;

        // Override nested defaults to ensure 'filled' counting matches logic
        return {
          ...demoRest,
          demographics: {
            ...demoFields,
            role: roleRest,
            digitalPresence: {
              ...digPresRest,
              hoursPerDay: -1 // Default 2 counts as filled
            },
            ageRange: { min: -1, max: -1 }, // Default 25/45 counts as filled
          }
        };
      } else {
        const { hasClients, demographics, transformation, decisionMountain, consumptionJourney, icpTarget, ...pathData } = baseInitial;
        const { personas, ...pathDataNoPersonas } = pathData; // Exclude personas

        // Override fanHaterMap from null to empty structure to count in denominator
        const emptyEmpathyMap = { whoIs: '', feelings: '', saysDoes: '', sees: '', hears: '', thinks: '', weaknesses: '', gains: '' };

        const { community, impact } = pathData.communityImpact;
        const { definition: def1, ...communityRest } = community;
        const { definition: def2, ...impactRest } = impact;

        return {
          ...pathDataNoPersonas,
          fanHaterMap: { fan: emptyEmpathyMap, hater: emptyEmpathyMap },
          communityImpact: {
            community: communityRest,
            impact: impactRest
          }
        };
      }
    })()
  );

  console.log('Mentee Debug:', {
    pct: menteePct,
    filled: countFilledLeaves(
      (() => {
        if (!menteeData.hasClients) return menteeData;
        const { hasClients, ...rest } = menteeData;
        if (menteeData.hasClients === 'no') {
          const { personas, fanHaterMap, communityImpact, icpSynthesis, ...pathData } = rest;
          return { ...pathData }; // Updated to match logic above
        } else {
          const { demographics, transformation, decisionMountain, consumptionJourney, icpTarget, ...pathData } = rest;
          const { personas, ...pathDataNoP } = pathData;
          const { community, impact } = pathData.communityImpact;
          const { definition: def1, ...communityRest } = community;
          const { definition: def2, ...impactRest } = impact;
          return { ...pathDataNoP, communityImpact: { community: communityRest, impact: impactRest } };
        }
      })(),
      (() => {
        if (!menteeData.hasClients) return INITIAL_MENTEE_DATA;
        return INITIAL_MENTEE_DATA; // Simplified log, logic is in main block
      })()),
    total: 22
  });

  const methodPct = computeModulePercent(
    (() => {
      if (!methodData.stage) return methodData;
      const { stage, ...rest } = methodData;

      if (methodData.stage === 'structured') {
        // Structured: Name, Transformation, Pillars (exclude ID for clean count)
        const { purpose, journeyMap, ...pathData } = rest;
        const cleanPillars = pathData.pillars.map(({ id, ...p }) => p);
        const { pillars, ...pathRest } = pathData;
        return { stage, ...pathRest, pillars: cleanPillars };
      } else {
        // None/Idea: Purpose, JourneyMap (exclude ID, problems, solutions)
        const { name, transformation, pillars, ...pathData } = rest;
        const cleanJourney = pathData.journeyMap.map(({ id, problems, solutions, ...j }) => j);
        const { journeyMap, ...pathRest } = pathData;
        return { stage, ...pathRest, journeyMap: cleanJourney };
      }
    })(),
    (() => {
      if (!methodData.stage) return INITIAL_METHOD_DATA;
      const { stage, ...rest } = INITIAL_METHOD_DATA;

      if (methodData.stage === 'structured') {
        const { purpose, journeyMap, ...pathData } = rest;
        const cleanPillars = pathData.pillars.map(({ id, ...p }) => p);
        const { pillars, ...pathRest } = pathData;
        return { stage, ...pathRest, pillars: cleanPillars };
      } else {
        const { name, transformation, pillars, ...pathData } = rest;
        const cleanJourney = pathData.journeyMap.map(({ id, problems, solutions, ...j }) => j);
        const { journeyMap, ...pathRest } = pathData;
        return { stage, ...pathRest, journeyMap: cleanJourney };
      }
    })()
  );

  console.log('Method Debug:', { pct: methodPct });
  const deliveryPct = computeModulePercent(
    (() => {
      // Filter Delivery Data
      const { mandatory, overdelivery, ...rest } = deliveryData;

      // 1. Mandatory: Handle 'otherEngagementText'
      const hasOther = mandatory.onlineEngagement.includes("OUTRO: Descreva");
      const { otherEngagementText, ...mandatoryRest } = mandatory;
      const finalMandatory = hasOther ? mandatory : mandatoryRest;

      // 2. Overdelivery: Handle 'hasIndividual' and clean accelerators
      const { hasIndividual, individualDetails, frequency, accelerators } = overdelivery;
      const cleanAccelerators = accelerators.map(({ id, ...acc }) => acc);

      let finalOverdelivery;
      if (hasIndividual === 'no') {
        // Exclude details/frequency if no individual
        finalOverdelivery = { hasIndividual, accelerators: cleanAccelerators };
      } else {
        finalOverdelivery = { ...overdelivery, accelerators: cleanAccelerators };
      }

      return { ...rest, mandatory: finalMandatory, overdelivery: finalOverdelivery };
    })(),
    (() => {
      // Filter Initial Data (denominator)
      const { mandatory, overdelivery, ...rest } = INITIAL_DELIVERY_DATA;

      // 1. Mandatory
      const hasOther = deliveryData.mandatory?.onlineEngagement?.includes("OUTRO: Descreva");
      const { otherEngagementText, ...mandatoryRest } = mandatory;
      const finalMandatory = hasOther ? mandatory : mandatoryRest;

      // 2. Overdelivery
      const { hasIndividual, individualDetails, frequency, accelerators } = overdelivery;
      const cleanAccelerators = accelerators.map(({ id, ...acc }) => acc);

      let finalOverdelivery;
      if (deliveryData.overdelivery?.hasIndividual === 'no') {
        finalOverdelivery = { hasIndividual, accelerators: cleanAccelerators };
      } else {
        finalOverdelivery = { ...overdelivery, accelerators: cleanAccelerators };
      }

      return { ...rest, mandatory: finalMandatory, overdelivery: finalOverdelivery };
    })()
  );

  const isModuleLocked = (moduleId: string): boolean => {
    switch (moduleId) {
      case 'mentor':
        return false; // Primeiro módulo sempre liberado
      case 'mentorado':
        return mentorPct < 100;
      case 'metodo':
        return menteePct < 100;
      case 'entrega_fundacao':
        return methodPct < 100;
      // Adicionar outros módulos conforme necessário
      case 'marketing':
      case 'vendas':
      case 'entrega_preparacao':
      case 'plano_acao':
        return deliveryPct < 100; // Exemplo: bloqueia Preparação até Fundacao (Oferta) estar completa
      default:
        return false;
    }
  };

  const renderModulesGrid = () => {
    const modules = [
      { name: 'O Mentor', key: 'mentor', description: 'Sua autoridade, história e diferenciais', pct: mentorPct },
      { name: 'O Mentorado', key: 'mentorado', description: 'Quem é seu cliente ideal', pct: menteePct },
      { name: 'O Método', key: 'metodo', description: 'Seu processo e transformação', pct: methodPct },
      { name: 'A Entrega', key: 'entrega_fundacao', description: 'Estrutura de seu programa', pct: deliveryPct }
    ];

    const overall = Math.round((mentorPct + menteePct + methodPct + deliveryPct) / modules.length);

    return (
      <div className="bg-[#051522] border border-white/5 rounded-lg p-4 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[600px] shadow-2xl">
        <h2 className="text-2xl sm:text-3xl font-serif text-white mb-1 sm:mb-2">Bem-vindo, {resolvedName}!</h2>
        <p className="text-sm sm:text-base text-gray-500 mb-6 sm:mb-8">{resolvedEmail || 'Sem e-mail cadastrado'}</p>

        <div className="mb-8 sm:mb-12">
          <div className="flex justify-between items-center mb-2 sm:mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-white">Progresso Geral do Diagnóstico</h3>
            <span className="text-xl sm:text-2xl font-bold text-[#CA9A43]">{overall}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 sm:h-3">
            <div className="h-full bg-gradient-to-r from-[#CA9A43] to-yellow-500 rounded-full transition-all"
              style={{ width: `${overall}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {modules.map((module) => {
            const locked = isModuleLocked(module.key);
            const statusLabel = locked
              ? 'Bloqueado'
              : (module.pct === 100 ? 'Preenchido' : (module.pct === 0 ? 'Não iniciado' : 'Em andamento'));

            const badgeColor = locked
              ? 'bg-gray-700 text-gray-400'
              : (module.pct === 100 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400');

            return (
              <motion.div key={module.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`border rounded-lg p-4 sm:p-6 transition-all relative ${locked
                  ? 'bg-white/5 border-white/5 opacity-50 cursor-not-allowed'
                  : (module.pct === 100 ? 'bg-[#CA9A43]/10 border-[#CA9A43]/50 cursor-pointer' : 'bg-white/5 border-white/10 hover:border-white/20 cursor-pointer')}`}
                onClick={() => !locked && setActiveItem(module.key)}>

                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <i className="bi bi-lock-fill text-3xl sm:text-4xl text-gray-500/50"></i>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-start justify-between mb-3 sm:mb-4 gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                      <h3 className="text-base sm:text-lg font-bold text-white">
                        {module.pct === 100 ? '✅ ' : ''}{module.name}
                      </h3>
                      <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-semibold ${badgeColor} flex items-center gap-1`}>
                        {locked && <i className="bi bi-lock-fill text-[8px] sm:text-[10px]"></i>}
                        {statusLabel}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-400">{module.description}</p>
                  </div>
                  <div className="text-left sm:text-right w-full sm:w-auto">
                    {!locked && (
                      <>
                        <div className="text-xl sm:text-2xl font-bold text-[#CA9A43]">{module.pct}%</div>
                        <div className="w-full sm:w-28 h-2 bg-gray-700 rounded-full mt-2">
                          <div className="h-full rounded-full transition-all" style={{ width: `${module.pct}%`, backgroundColor: module.pct === 100 ? '#10b981' : (module.pct === 0 ? '#374151' : '#f59e0b') }} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 sm:mt-8 p-3 sm:p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs sm:text-sm text-blue-300">
          ℹ️ Os módulos devem ser completados em ordem sequencial. Complete um módulo 100% para desbloquear o próximo.
        </div>
      </div>
    );
  };

  const renderContent = () => {
    // Verificar se tenta acessar módulo bloqueado (segurança extra)
    if (activeItem !== 'overview' && isModuleLocked(activeItem)) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center h-full">
          <i className="bi bi-lock-fill text-6xl text-gray-600 mb-6"></i>
          <h2 className="text-2xl font-bold text-white mb-2">Módulo Bloqueado</h2>
          <p className="text-gray-400 mb-6 max-w-md">
            Você precisa completar 100% do módulo anterior para desbloquear este conteúdo.
          </p>
          <button
            onClick={() => setActiveItem('overview')}
            className="bg-[#CA9A43] text-black px-6 py-2 rounded font-bold hover:bg-[#b88b3b] transition"
          >
            Voltar para Visão Geral
          </button>
        </div>
      );
    }

    if (activeItem === 'overview') return renderModulesGrid();
    if (activeItem === 'mentor') {
      return <MentorModule data={mentorData} onUpdate={handleUpdateMentor} onSaveAndExit={() => handleSaveAndExit('mentor')} onComplete={() => handleSendToEvaluation('mentor')} isReadOnly={false} savedStep={getModuleStep('mentor')} onStepChange={(step) => saveModuleStep('mentor', step)} />;
    }
    if (activeItem === 'mentorado') {
      return <MenteeModule data={menteeData} onUpdate={handleUpdateMentee} onSaveAndExit={() => handleSaveAndExit('mentorado')} onComplete={() => handleSendToEvaluation('mentorado')} isReadOnly={false} savedStep={getModuleStep('mentee')} onStepChange={(step) => saveModuleStep('mentee', step)} />;
    }
    if (activeItem === 'metodo') {
      return <MethodModule data={methodData} onUpdate={handleUpdateMethod} onSaveAndExit={() => handleSaveAndExit('metodo')} onComplete={() => handleSendToEvaluation('metodo')} isReadOnly={false} savedStep={getModuleStep('method')} onStepChange={(step) => saveModuleStep('method', step)} />;
    }
    if (activeItem === 'entrega_fundacao') {
      return <DeliveryModule data={deliveryData} onUpdate={handleUpdateDelivery} onSaveAndExit={() => handleSaveAndExit('entrega_fundacao')} onComplete={() => handleSendToEvaluation('entrega_fundacao')} isReadOnly={false} savedStep={getModuleStep('delivery')} onStepChange={(step) => saveModuleStep('delivery', step)} />;
    }

    return (
      <div className="bg-[#051522] border border-white/5 rounded-lg p-1 min-h-[600px] shadow-2xl relative overflow-hidden flex items-center justify-center">
        <div className="text-center">
          <i className="bi bi-cone-striped text-4xl text-[#CA9A43] mb-4 block"></i>
          <h3 className="font-serif text-2xl text-white mb-2">Em Construção</h3>
          <p className="text-gray-500">O módulo {getActiveLabel()} estará disponível em breve.</p>
          <button onClick={() => setActiveItem('overview')} className="mt-6 text-[#CA9A43] text-sm hover:underline">Voltar para Visão Geral</button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#031A2B] flex text-white font-sans overflow-hidden relative">
      <AnimatePresence>
        {isMobileMenuOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" />}
      </AnimatePresence>

      <motion.aside className={`fixed lg:static inset-y-0 left-0 w-64 sm:w-72 lg:w-64 bg-[#0A2540] border-r border-white/5 p-4 sm:p-6 z-50 lg:z-0 lg:translate-x-0 overflow-y-auto transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-6 sm:mb-8 flex items-center gap-2 sm:gap-3">
          <Logo className="w-8 h-8 sm:w-10 sm:h-10" />
          <span className="text-base sm:text-lg font-bold text-[#CA9A43]">Menu</span>
        </div>
        {menuStructure.map(section => (
          <div key={section.id} className="mb-4 sm:mb-6">
            <button onClick={() => toggleSection(section.id)} className="text-[10px] sm:text-xs font-bold text-gray-400 hover:text-white transition mb-2 sm:mb-3 flex items-center justify-between w-full">
              {section.title}
              <span className="text-[10px] sm:text-xs">{openSections.includes(section.id) ? '▼' : '▶'}</span>
            </button>
            {openSections.includes(section.id) && (
              <div className="space-y-1 sm:space-y-2">
                {section.items.map(item => {
                  const locked = isModuleLocked(item.id);
                  const isCurrent = activeItem === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (!locked) {
                          setActiveItem(item.id);
                          setIsMobileMenuOpen(false);
                        }
                      }}
                      className={`block w-full text-left px-3 sm:px-4 py-1.5 sm:py-2 rounded transition text-xs sm:text-sm flex items-center justify-between
                        ${isCurrent ? 'bg-[#CA9A43] text-black font-semibold' : ''}
                        ${!isCurrent && !locked ? 'text-gray-400 hover:text-white hover:bg-white/5' : ''}
                        ${locked ? 'text-gray-600 cursor-not-allowed opacity-50' : ''}
                      `}
                    >
                      <span className="truncate">{item.label}</span>
                      {locked && <i className="bi bi-lock-fill text-[10px] sm:text-xs ml-2 flex-shrink-0"></i>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </motion.aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-[#0A2540] border-b border-white/5 px-3 sm:px-4 md:px-6 py-3 sm:py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden text-white text-xl sm:text-2xl flex-shrink-0">☰</button>
            <div className="min-w-0 flex-1"><h1 className="text-base sm:text-lg md:text-xl font-bold text-white truncate">{getActiveLabel()}</h1></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
            {lastSaveError && (
              <div className="hidden sm:flex text-red-400 text-xs font-semibold items-center gap-2 bg-red-500/10 px-2 sm:px-3 py-1 sm:py-1.5 rounded border border-red-500/20">
                <i className="bi bi-exclamation-triangle"></i>
                <span className="hidden md:inline">Erro ao salvar: {lastSaveError}</span>
                <span className="md:hidden">Erro</span>
              </div>
            )}
            {isSaving && !lastSaveError && (
              <span className="hidden sm:flex text-[#CA9A43] text-[10px] sm:text-xs font-semibold animate-pulse items-center gap-1">
                <span className="w-1.5 h-1.5 bg-[#CA9A43] rounded-full inline-block" />
                <span className="hidden md:inline">Salvando...</span>
              </span>
            )}
            {!isSaving && !lastSaveError && (
              <span className="hidden sm:flex text-green-400 text-[10px] sm:text-xs font-semibold items-center gap-1">
                <i className="bi bi-check-circle-fill"></i>
                <span className="hidden md:inline">Salvo</span>
              </span>
            )}
            <button onClick={() => setIsProfileModalOpen(true)} className="text-xs sm:text-sm text-gray-400 hover:text-white transition hidden sm:block">👤 <span className="hidden md:inline">Perfil</span></button>
            <button onClick={handleLogout} className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded transition text-xs sm:text-sm font-semibold">Sair</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <AnimatePresence mode="wait">
            <motion.div key={activeItem} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)}>
        <div className="bg-[#051522] border border-white/10 rounded-lg p-4 sm:p-6 md:p-8 max-w-md mx-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Editar Perfil</h2>
          <div className="space-y-3 sm:space-y-4">
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome" className="w-full bg-white/5 border border-white/10 rounded px-3 sm:px-4 py-2 text-sm sm:text-base text-white placeholder-gray-500" />
            <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Descrição" className="w-full bg-white/5 border border-white/10 rounded px-3 sm:px-4 py-2 text-sm sm:text-base text-white placeholder-gray-500 h-20 sm:h-24 resize-none" />
          </div>
          <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-6">
            <button onClick={handleSaveProfile} className="flex-1 bg-[#CA9A43] hover:bg-[#D4B050] text-black font-semibold py-2 rounded transition text-sm sm:text-base">Salvar</button>
            <button onClick={() => setIsProfileModalOpen(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-semibold py-2 rounded transition text-sm sm:text-base">Cancelar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};