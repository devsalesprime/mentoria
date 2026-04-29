import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import type { PreModuleData, MentorData, MenteeData, MethodData, OfferData, PrioritiesData } from '../types/diagnostic';
import type { PipelineStatus, FeedbackStatus } from '../types/pipeline';
import { calculateProgress } from '../utils/progress';

// Initial data constants
const INITIAL_PRE_MODULE: PreModuleData = {
  materials: [],
  contentLinks: [],
  profiles: {},
  competitors: [],
};

const INITIAL_MENTOR: MentorData = {
  step1: { explanation: '', inputType: 'text' },
  step2: { authorityStory: '', inputType: 'text' },
  step3: { gold: '', silver: '', bronze: '' },
  step4: { testimonials: [], videoLinks: [], startingFromZero: false },
  step5: { marketStandard: '', myDifference: '', inputType: 'text' },
};

const INITIAL_MENTEE: MenteeData = {
  hasClients: 'yes',
  beforeInternal: '',
  beforeExternal: '',
  decisionFears: '',
  decisionTrigger: '',
  afterExternal: '',
  afterInternal: '',
  idealClientGeneral: '',
  inputTypes: {},
};

const INITIAL_METHOD: MethodData = {
  maturity: 'not_yet',
  pillars: [],
  steps: [],
  obstacles: [],
  inputTypes: {},
};

const INITIAL_OFFER: OfferData = {
  goal: 'unsure',
  description: '',
  deliverables: [],
  bonuses: [],
  pricing: 0,
  salesMaterials: [],
  salesFiles: [],
};

interface DiagnosticState {
  preModule: PreModuleData;
  mentor: MentorData;
  mentee: MenteeData;
  method: MethodData;
  offer: OfferData;
  priorities: PrioritiesData | null;
  currentModule: string;
  currentStep: number;
  diagnosticStatus: string;
  isLegacy: boolean;
}

// ─── Pipeline status state ────────────────────────────────────────────────────

interface PipelineState {
  brandBrainStatus: string;
  assetsStatus: string;
  researchStatus: string;
  pipelineStatus: PipelineStatus;
  feedbackStatus: FeedbackStatus;
  showAssetsToUser: boolean;
  hasEducationalSuggestions: boolean;
}

function derivePipelineStatus(
  diagnosticStatus: string,
  researchStatus: string,
  brandBrainStatus: string,
  assetsStatus: string,
  feedbackStatus: FeedbackStatus
): PipelineStatus {
  // Personalized feedback is the primary user-facing deliverable in the
  // simplified 3-stage view ("Entregue — Feedback personalizado disponível").
  // Once feedback ships, mark pipeline as delivered regardless of asset state.
  if (feedbackStatus === 'delivered') return 'delivered';
  if (assetsStatus === 'delivered') return 'delivered';
  if (assetsStatus === 'ready' || assetsStatus === 'generating') return 'assets';
  if (brandBrainStatus === 'ready') return 'assets';
  if (brandBrainStatus === 'generating') return 'brand_brain';
  if (researchStatus === 'complete') return 'brand_brain';
  if (diagnosticStatus === 'submitted') return 'research';
  return 'diagnostic';
}

function shouldPoll(pipelineStatus: PipelineStatus, brandBrainStatus: string): boolean {
  if (pipelineStatus === 'research') return true;
  if (pipelineStatus === 'brand_brain') return true;
  if (pipelineStatus === 'assets' && brandBrainStatus !== 'ready') return true;
  return false;
}

const INITIAL_STATE: DiagnosticState = {
  preModule: INITIAL_PRE_MODULE,
  mentor: INITIAL_MENTOR,
  mentee: INITIAL_MENTEE,
  method: INITIAL_METHOD,
  offer: INITIAL_OFFER,
  priorities: null,
  currentModule: 'pre_module',
  currentStep: 0,
  diagnosticStatus: 'in_progress',
  isLegacy: false,
};

const INITIAL_PIPELINE: PipelineState = {
  brandBrainStatus: 'pending',
  assetsStatus: 'pending',
  researchStatus: 'pending',
  pipelineStatus: 'diagnostic',
  feedbackStatus: 'pending',
  showAssetsToUser: false,
  hasEducationalSuggestions: false,
};

export const useDiagnosticPersistence = (token: string) => {
  const [state, setState] = useState<DiagnosticState>(INITIAL_STATE);
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL_PIPELINE);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);

  // Refs to avoid stale closures in debounced save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef<DiagnosticState>(state);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep ref in sync
  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  // Load on mount
  useEffect(() => {
    if (token) {
      loadDiagnostic();
      loadPipelineStatus();
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling: check pipeline status every 60s when in a waiting state
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (!token) return;
    if (!shouldPoll(pipeline.pipelineStatus, pipeline.brandBrainStatus)) return;

    pollIntervalRef.current = setInterval(() => {
      loadPipelineStatus();
    }, 60000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [token, pipeline.pipelineStatus, pipeline.brandBrainStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const loadDiagnostic = async () => {
    try {
      const response = await axios.get('/api/diagnostic', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success && response.data.data) {
        const d = response.data.data;
        setState({
          preModule: d.pre_module && Object.keys(d.pre_module).length > 0 ? { ...INITIAL_PRE_MODULE, ...d.pre_module } : INITIAL_PRE_MODULE,
          mentor: d.mentor && Object.keys(d.mentor).length > 0 ? { ...INITIAL_MENTOR, ...d.mentor } : INITIAL_MENTOR,
          mentee: d.mentee && Object.keys(d.mentee).length > 0 ? { ...INITIAL_MENTEE, ...d.mentee } : INITIAL_MENTEE,
          method: d.method && Object.keys(d.method).length > 0 ? { ...INITIAL_METHOD, ...d.method } : INITIAL_METHOD,
          offer: d.offer && Object.keys(d.offer).length > 0 ? { ...INITIAL_OFFER, ...d.offer } : INITIAL_OFFER,
          priorities: d.priorities || null,
          currentModule: d.current_module || 'pre_module',
          currentStep: d.current_step || 0,
          diagnosticStatus: d.status || 'in_progress',
          isLegacy: d.is_legacy === true,
        });
      }
    } catch (error: any) {
      console.error('Error loading diagnostic:', error.message);
    }
  };

  const loadPipelineStatus = useCallback(async () => {
    if (!token) return;
    try {
      // Fetch brand brain status
      const [bbRes, assetsRes, insightsRes] = await Promise.allSettled([
        axios.get('/api/brand-brain', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/assets', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/insights', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      let brandBrainStatus = 'pending';
      let assetsStatus = 'pending';
      let researchStatus = 'pending';
      let feedbackStatus: FeedbackStatus = 'pending';
      let showAssetsToUser = false;
      let hasEducationalSuggestions = false;

      if (bbRes.status === 'fulfilled' && bbRes.value.data.success) {
        const d = bbRes.value.data.data;
        if (d) {
          brandBrainStatus = d.brandBrainStatus || 'pending';
          researchStatus = d.researchStatus || 'pending';
        }
      }

      if (assetsRes.status === 'fulfilled' && assetsRes.value.data.success) {
        const d = assetsRes.value.data;
        // If data is not null, assets are delivered
        if (d.data !== null && d.data !== undefined) {
          assetsStatus = 'delivered';
        }
      }

      if (insightsRes.status === 'fulfilled' && insightsRes.value.data.success) {
        const d = insightsRes.value.data.data;
        if (d) {
          feedbackStatus = d.feedbackStatus || 'pending';
          showAssetsToUser = d.showAssetsToUser === true;
          hasEducationalSuggestions = d.hasEducationalSuggestions === true;
        }
      }

      const diagnosticStatus = latestStateRef.current.diagnosticStatus;
      const ps = derivePipelineStatus(diagnosticStatus, researchStatus, brandBrainStatus, assetsStatus, feedbackStatus);

      setPipeline({ brandBrainStatus, assetsStatus, researchStatus, pipelineStatus: ps, feedbackStatus, showAssetsToUser, hasEducationalSuggestions });
    } catch (error: any) {
      console.error('Error loading pipeline status:', error.message);
    }
  }, [token]);

  // Persist to backend
  const persistData = useCallback(async (s: DiagnosticState) => {
    try {
      setLastSaveError(null);
      const calculatedProgress = calculateProgress(s.preModule, s.mentor, s.mentee, s.method, s.offer);
      // Legacy users keep 100% unless they actually fill new data (progress > 0 from real input)
      const progress = s.isLegacy && calculatedProgress === 0 ? 100 : calculatedProgress;

      await axios.post('/api/diagnostic', {
        pre_module: s.preModule,
        mentor: s.mentor,
        mentee: s.mentee,
        method: s.method,
        offer: s.offer,
        priorities: s.priorities,
        current_module: s.currentModule,
        current_step: s.currentStep,
        progress_percentage: progress,
      }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
      });
    } catch (error: any) {
      console.error('Error saving diagnostic:', error.message);
      setLastSaveError(error.message || 'Erro ao salvar dados');
    } finally {
      setIsSaving(false);
    }
  }, [token]);

  // Debounced save (1s)
  const scheduleSave = useCallback(() => {
    if (!token) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setIsSaving(true);
    saveTimeoutRef.current = setTimeout(() => {
      persistData(latestStateRef.current);
    }, 1000);
  }, [token, persistData]);

  // Per-module update functions
  const updatePreModule = useCallback((data: Partial<PreModuleData>) => {
    setState(prev => {
      const updated = { ...prev, preModule: { ...prev.preModule, ...data } };
      latestStateRef.current = updated;
      return updated;
    });
    scheduleSave();
  }, [scheduleSave]);

  const updateMentor = useCallback((data: Partial<MentorData>) => {
    setState(prev => {
      const updated = { ...prev, mentor: { ...prev.mentor, ...data } };
      latestStateRef.current = updated;
      return updated;
    });
    scheduleSave();
  }, [scheduleSave]);

  const updateMentee = useCallback((data: Partial<MenteeData>) => {
    setState(prev => {
      const updated = { ...prev, mentee: { ...prev.mentee, ...data } };
      latestStateRef.current = updated;
      return updated;
    });
    scheduleSave();
  }, [scheduleSave]);

  const updateMethod = useCallback((data: Partial<MethodData>) => {
    setState(prev => {
      const updated = { ...prev, method: { ...prev.method, ...data } };
      latestStateRef.current = updated;
      return updated;
    });
    scheduleSave();
  }, [scheduleSave]);

  const updateOffer = useCallback((data: Partial<OfferData>) => {
    setState(prev => {
      const updated = { ...prev, offer: { ...prev.offer, ...data } };
      latestStateRef.current = updated;
      return updated;
    });
    scheduleSave();
  }, [scheduleSave]);

  const updatePriorities = useCallback((data: PrioritiesData) => {
    setState(prev => {
      const updated = { ...prev, priorities: data };
      latestStateRef.current = updated;
      return updated;
    });
    scheduleSave();
  }, [scheduleSave]);

  // Navigation helpers
  const setCurrentModule = useCallback((module: string) => {
    setState(prev => {
      const updated = { ...prev, currentModule: module };
      latestStateRef.current = updated;
      return updated;
    });
    scheduleSave();
  }, [scheduleSave]);

  const setCurrentStep = useCallback((step: number) => {
    setState(prev => {
      const updated = { ...prev, currentStep: step };
      latestStateRef.current = updated;
      return updated;
    });
    scheduleSave();
  }, [scheduleSave]);

  // Submit diagnostic
  const submitDiagnostic = useCallback(async () => {
    try {
      // Flush any pending save first
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        await persistData(latestStateRef.current);
      }

      await axios.post('/api/diagnostic/submit', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setState(prev => ({ ...prev, diagnosticStatus: 'submitted' }));
      // After submitting, trigger a pipeline status check
      setTimeout(() => loadPipelineStatus(), 500);
    } catch (error: any) {
      console.error('Error submitting diagnostic:', error.message);
      setLastSaveError(error.message || 'Erro ao submeter diagnóstico');
    }
  }, [token, persistData, loadPipelineStatus]);

  // Computed progress
  const progressPercentage = calculateProgress(
    state.preModule, state.mentor, state.mentee, state.method, state.offer
  );

  return {
    // Module data
    preModule: state.preModule,
    mentor: state.mentor,
    mentee: state.mentee,
    method: state.method,
    offer: state.offer,
    priorities: state.priorities,

    // Update functions
    updatePreModule,
    updateMentor,
    updateMentee,
    updateMethod,
    updateOffer,
    updatePriorities,

    // Navigation
    currentModule: state.currentModule,
    currentStep: state.currentStep,
    setCurrentModule,
    setCurrentStep,

    // Progress
    progressPercentage,
    diagnosticStatus: state.diagnosticStatus,
    isLegacy: state.isLegacy,

    // Actions
    submitDiagnostic,

    // Pipeline status
    brandBrainStatus: pipeline.brandBrainStatus,
    assetsStatus: pipeline.assetsStatus,
    researchStatus: pipeline.researchStatus,
    pipelineStatus: pipeline.pipelineStatus,
    feedbackStatus: pipeline.feedbackStatus,
    showAssetsToUser: pipeline.showAssetsToUser,
    hasEducationalSuggestions: pipeline.hasEducationalSuggestions,
    refreshPipelineStatus: loadPipelineStatus,

    // Save status
    isSaving,
    lastSaveError,
  };
};
