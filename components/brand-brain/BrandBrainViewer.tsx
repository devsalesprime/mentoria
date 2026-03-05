import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

import type { BrandBrainApiData, BrandBrainViewerProps, SectionApprovals } from '../../utils/brand-brain-constants';
import { SECTIONS, getSectionContent } from '../../utils/brand-brain-constants';
import { ParsedSubsection, reconstructMarkdown } from '../../utils/brand-brain-parser';
import { FeedbackComment } from './FeedbackForm';
import { BrandBrainSection } from './BrandBrainSection';
import { BBPillarIntro } from './BBPillarIntro';
import { BBApprovedState } from './BBApprovedState';
import { generatePdfFromBrandBrain, downloadAsMarkdown } from './BBExportUtils';
import { Button } from '../ui/Button';

// ─── Skeleton ───────────────────────────────────────────────────────────────

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-6">
        <div className="h-5 bg-white/10 rounded w-1/3 mb-4" />
        <div className="space-y-2">
          <div className="h-3 bg-white/10 rounded w-full" />
          <div className="h-3 bg-white/10 rounded w-5/6" />
          <div className="h-3 bg-white/10 rounded w-4/6" />
        </div>
      </div>
    ))}
  </div>
);

// ─── Main component ─────────────────────────────────────────────────────────

export const BrandBrainViewer: React.FC<BrandBrainViewerProps> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BrandBrainApiData | null>(null);
  const [approvals, setApprovals] = useState<SectionApprovals>({
    s1: 'pending', s2: 'pending', s3: 'pending', s4: 'pending', s5: 'pending',
  });
  const [sectionComments, setSectionComments] = useState<Record<string, FeedbackComment[]>>({
    s1: [], s2: [], s3: [], s4: [], s5: [],
  });
  const [approveAllLoading, setApproveAllLoading] = useState(false);
  const [approveAllError, setApproveAllError] = useState<string | null>(null);
  const [approveAllSuccess, setApproveAllSuccess] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Enhanced UX state
  const [introDismissed, setIntroDismissed] = useState(false);
  const [editedSections, setEditedSections] = useState<Record<string, boolean>>({});
  const [savingStatus, setSavingStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  const saveTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const isApproved = data?.brandBrainStatus === 'approved';
  const allApproved = approvals.s1 === 'approved' && approvals.s2 === 'approved'
    && approvals.s3 === 'approved' && approvals.s4 === 'approved' && approvals.s5 === 'approved';
  const approvedCount = [approvals.s1, approvals.s2, approvals.s3, approvals.s4, approvals.s5].filter(s => s === 'approved').length;
  const autoApproveTriggered = useRef(false);

  const hasExpertNotes = !!(data?.expertNotes && Object.values(data.expertNotes).some(v => v && v.trim()));

  const dismissIntro = () => setIntroDismissed(true);


  // Auto-approve all when every section is individually approved
  useEffect(() => {
    if (allApproved && !approveAllLoading && !autoApproveTriggered.current) {
      autoApproveTriggered.current = true;
      handleApproveAll();
    }
  }, [allApproved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup save timers on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach(clearTimeout);
    };
  }, []);

  const fetchBrandBrain = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/brand-brain', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        if (res.data.data) {
          const d = res.data.data;
          setData(d);
          setApprovals({ s1: 'pending', s2: 'pending', s3: 'pending', s4: 'pending', s5: 'pending', ...d.sectionApprovals });
        } else {
          setData(null);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar Brand Brain');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchBrandBrain();
  }, [fetchBrandBrain]);

  // Save section content to backend (debounced)
  const saveContentToBackend = useCallback((sectionId: string, content: string) => {
    if (saveTimers.current[sectionId]) clearTimeout(saveTimers.current[sectionId]);
    setSavingStatus(prev => ({ ...prev, [sectionId]: 'saving' }));

    saveTimers.current[sectionId] = setTimeout(async () => {
      try {
        await axios.post(`/api/brand-brain/section/${sectionId}/update-content`, { content }, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSavingStatus(prev => ({ ...prev, [sectionId]: 'saved' }));
        setTimeout(() => {
          setSavingStatus(prev => prev[sectionId] === 'saved' ? { ...prev, [sectionId]: 'idle' } : prev);
        }, 2000);
      } catch {
        setSavingStatus(prev => ({ ...prev, [sectionId]: 'error' }));
      }
    }, 800);
  }, [token]);

  // Handle subsection edits from inline editing
  const handleSubsectionEdit = useCallback((sectionId: string, subsections: ParsedSubsection[]) => {
    if (!data) return;
    const newMarkdown = reconstructMarkdown(subsections);
    setEditedSections(prev => ({ ...prev, [sectionId]: true }));

    const section = SECTIONS.find(s => s.id === sectionId);
    if (!section) return;

    setData(prev => {
      if (!prev) return prev;
      const bb = { ...prev.brandBrain };
      const key = (section.key in bb) ? section.key : (section.altKey && section.altKey in bb) ? section.altKey : section.key;
      if (typeof bb[key] === 'object' && bb[key] !== null) {
        bb[key] = { ...bb[key], content: newMarkdown };
      } else {
        bb[key] = { content: newMarkdown };
      }
      return { ...prev, brandBrain: bb };
    });

    saveContentToBackend(sectionId, newMarkdown);
  }, [data, saveContentToBackend]);

  const handleApproveSection = async (id: string, notes?: string) => {
    await axios.post(`/api/brand-brain/section/${id}/approve`, { notes }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setApprovals((prev) => ({ ...prev, [id]: 'approved' }));
  };

  const handleCommentsChange = (id: string, comments: FeedbackComment[]) => {
    setSectionComments((prev) => ({ ...prev, [id]: comments }));
  };

  const handleApproveAll = async () => {
    setApproveAllError(null);
    setApproveAllLoading(true);
    try {
      await axios.post('/api/brand-brain/approve-all', {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setApproveAllSuccess(true);
      setData((prev) => prev ? { ...prev, brandBrainStatus: 'approved' } : prev);
    } catch (e: any) {
      const msg = e.response?.data?.message || e.message || 'Erro ao aprovar Brand Brain';
      setApproveAllError(msg);
    } finally {
      setApproveAllLoading(false);
    }
  };

  const mentorName = () => data?.brandBrain?.mentorName || 'Mentor';

  const handleDownloadPdf = async () => {
    if (!data?.brandBrain) return;
    setDownloadingPdf(true);
    try { await generatePdfFromBrandBrain(data.brandBrain, mentorName()); }
    catch (e) { console.error('PDF download failed:', e); }
    finally { setDownloadingPdf(false); }
  };

  const handleDownloadMd = () => {
    if (!data?.brandBrain) return;
    downloadAsMarkdown(data.brandBrain, mentorName());
  };

  // ─── Render states ────────────────────────────────────────────────────────

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6"><div className="h-8 bg-white/10 rounded w-56 animate-pulse" /></div>
      <LoadingSkeleton />
    </div>
  );

  if (error) return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <Button variant="secondary" onClick={fetchBrandBrain}>Tentar novamente</Button>
      </div>
    </div>
  );

  if (!data) return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h2 className="text-2xl font-bold text-white mb-6">Revisão do Brand Brain</h2>
      <div className="bg-white/5 border border-white/10 rounded-xl p-10 text-center">
        <span className="text-5xl block mb-4">🧠</span>
        <h3 className="text-xl font-semibold text-white mb-2">Brand Brain em preparação</h3>
        <p className="text-white/50 text-sm max-w-sm mx-auto">Seu Brand Brain está sendo preparado. Você será notificado quando estiver pronto para revisão.</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-prosperus-gold-dark/20 to-prosperus-gold-dark/5 border border-prosperus-gold-dark/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🧠</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Brand Brain</h2>
              <p className="text-white/30 text-sm mt-0.5">
                {data.brandBrain?.mentorName && <span className="text-prosperus-gold-dark/70">{data.brandBrain.mentorName}</span>}
                {data.brandBrain?.mentorName && data.brandBrain?.generatedAt && <span className="mx-1.5 text-white/50">·</span>}
                {data.brandBrain?.generatedAt && (
                  <span>Gerado em {new Date(data.brandBrain.generatedAt).toLocaleDateString('pt-BR')}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {isApproved && (
              <>
                <Button variant="primary" size="sm" onClick={handleDownloadPdf} loading={downloadingPdf}>
                  {downloadingPdf ? 'Gerando...' : 'Baixar PDF'}
                </Button>
                <Button variant="secondary" size="sm" onClick={handleDownloadMd} className="text-white/70">
                  Baixar Texto
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Progress indicator — only during review phase */}
      {!isApproved && (
        <div className="mb-6 flex items-center gap-3">
          <div className="flex gap-1.5">
            {SECTIONS.map((section) => {
              const status = approvals[section.id];
              return (
                <div
                  key={section.id}
                  className={`w-8 h-1.5 rounded-full transition-colors ${
                    status === 'approved' ? 'bg-green-500' :
                    status === 'revised' ? 'bg-blue-500' :
                    status === 'editing' ? 'bg-yellow-500' :
                    'bg-white/10'
                  }`}
                  title={section.title}
                />
              );
            })}
          </div>
          <span className="text-xs text-white/50 font-semibold">{approvedCount} de {SECTIONS.length} seções aprovadas</span>
        </div>
      )}

      {/* Educational 4-Pillar Header — only during review phase */}
      {!isApproved && !introDismissed && (
        <BBPillarIntro
          hasExpertNotes={hasExpertNotes}
          onDismiss={dismissIntro}
        />
      )}

      {/* Compact context banner (shown after intro dismissed, review phase only) */}
      {!isApproved && introDismissed && (
        <div className="mb-6 flex items-center gap-3 px-1">
          <span className="text-sm text-white/20">💡</span>
          <p className="text-[11px] text-white/30">
            Edite os tópicos diretamente, adicione ou remova conteúdo, e aprove cada seção quando estiver pronta.
          </p>
          <Button variant="link" size="xs" onClick={() => setIntroDismissed(false)} className="text-[10px] text-prosperus-gold-dark/50 hover:text-prosperus-gold-dark flex-shrink-0">
            Ver pilares
          </Button>
        </div>
      )}

      {/* Approved status banner — shown above sections in approved state */}
      {isApproved && !approveAllSuccess && (
        <BBApprovedState
          brandBrain={data.brandBrain}
          token={token}
          downloadingPdf={downloadingPdf}
          onDownloadPdf={handleDownloadPdf}
          onDownloadMd={handleDownloadMd}
          onRefresh={fetchBrandBrain}
        />
      )}

      {/* 4 sections — editable in both mentor_review and approved states */}
      <div className="space-y-4 mb-8">
        {SECTIONS.map((section) => (
          <BrandBrainSection
            key={section.id}
            sectionDef={section}
            content={getSectionContent(data.brandBrain, section)}
            status={approvals[section.id]}
            readOnly={false}
            comments={sectionComments[section.id] || []}
            hasEdits={!!editedSections[section.id]}
            saveStatus={savingStatus[section.id] || 'idle'}
            expertNote={data?.expertNotes?.[section.id] || null}
            onApprove={handleApproveSection}
            onCommentsChange={handleCommentsChange}
            onSubsectionEdit={handleSubsectionEdit}
          />
        ))}
      </div>

      {/* Success state after approve-all */}
      <AnimatePresence>
        {approveAllSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center"
          >
            <span className="text-4xl block mb-3">🎉</span>
            <h3 className="text-white font-semibold text-lg">
              Brand Brain aprovado! Seus entregáveis estão sendo preparados.
            </h3>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auto-approve feedback — review phase only */}
      {!isApproved && (approveAllLoading || approveAllError) && (
        <div className="flex flex-col items-center gap-3">
          {approveAllError && (
            <div className="w-full bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <p className="text-red-400 text-sm text-center">{approveAllError}</p>
              <Button variant="secondary" onClick={handleApproveAll} className="mt-2">
                Tentar novamente
              </Button>
            </div>
          )}
          {approveAllLoading && (
            <div className="flex items-center gap-2 text-prosperus-gold-dark animate-pulse">
              <span className="text-sm font-semibold">Finalizando aprovação...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
