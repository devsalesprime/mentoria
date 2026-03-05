import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { ApprovalStatus, SectionDef } from '../../utils/brand-brain-constants';
import { extractContentText } from '../../utils/brand-brain-constants';
import { ParsedSubsection, parseSubsections, renderJsonAsHtml, detectIcon } from '../../utils/brand-brain-parser';
import { SubsectionCard } from './SubsectionCard';
import { StatusBadge } from './BBStatusBadge';
import { AddTopicForm } from './AddTopicForm';
import { FeedbackComment, formatFeedbackForBackend, FeedbackForm, FeedbackCard } from './FeedbackForm';
import { Button } from '../ui/Button';

export interface SectionProps {
  sectionDef: SectionDef;
  content: any;
  status: ApprovalStatus;
  readOnly: boolean;
  comments: FeedbackComment[];
  hasEdits: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  expertNote: string | null;
  onApprove: (id: string, notes?: string) => Promise<void>;
  onCommentsChange: (id: string, comments: FeedbackComment[]) => void;
  onSubsectionEdit: (sectionId: string, subsections: ParsedSubsection[]) => void;
}

export const BrandBrainSection: React.FC<SectionProps> = ({
  sectionDef,
  content,
  status,
  readOnly,
  comments,
  hasEdits,
  saveStatus,
  expertNote,
  onApprove,
  onCommentsChange,
  onSubsectionEdit,
}) => {
  // Start expanded for all states — post-approval editing needs sections open (BB-3.2)
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [showExpertNote, setShowExpertNote] = useState(false);
  const hasExpertNote = !!(expertNote && expertNote.trim());
  const expertNoteHtml = useMemo(
    () => hasExpertNote ? DOMPurify.sanitize(marked.parse(expertNote!) as string) : '',
    [expertNote, hasExpertNote]
  );

  const contentText = extractContentText(content);
  const subsections = contentText ? parseSubsections(contentText) : [];
  const isStructuredJson = !contentText && typeof content === 'object' && content !== null;
  const jsonHtml = isStructuredJson ? renderJsonAsHtml(content) : '';

  // Extract topic names from subsections for the feedback dropdown
  const topicNames = subsections.map(s => s.title).filter(Boolean);

  // canEdit: allow inline edits in pending, revised, and approved states.
  // Approved sections (post-approval unified editing — BB-3.2) are also editable.
  const canEdit = !readOnly && (status === 'pending' || status === 'revised' || status === 'approved');

  const borderClass = status === 'approved'
    ? 'border-green-500/30'
    : status === 'revised'
    ? 'border-blue-500/30'
    : status === 'editing'
    ? 'border-yellow-500/30'
    : 'border-white/10';

  const handleApprove = async () => {
    setError(null);
    setLoading(true);
    try {
      // Send observations alongside approval if any exist
      const notes = comments.length > 0 ? formatFeedbackForBackend(comments) : undefined;
      await onApprove(sectionDef.id, notes);
    } catch (e: any) {
      setError(e.message || 'Erro ao aprovar seção');
    } finally {
      setLoading(false);
    }
  };

  const addComment = (data: Omit<FeedbackComment, 'id'>) => {
    const newComment: FeedbackComment = { ...data, id: Math.random().toString(36).substring(2, 9) };
    onCommentsChange(sectionDef.id, [...comments, newComment]);
    setShowFeedbackForm(false);
  };

  const removeComment = (id: string) => {
    onCommentsChange(sectionDef.id, comments.filter(c => c.id !== id));
  };

  // Inline editing handlers
  const handleSubsectionBodyEdit = (idx: number, newBody: string) => {
    const updated = [...subsections];
    updated[idx] = { ...updated[idx], body: newBody };
    onSubsectionEdit(sectionDef.id, updated);
  };

  const handleSubsectionDelete = (idx: number) => {
    if (confirmDelete === idx) {
      const updated = subsections.filter((_, i) => i !== idx);
      onSubsectionEdit(sectionDef.id, updated);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(idx);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const handleAddTopic = (title: string, body: string, icon?: string) => {
    const newSub: ParsedSubsection = {
      title,
      body,
      icon: icon || detectIcon(title),
    };
    onSubsectionEdit(sectionDef.id, [...subsections, newSub]);
    setShowAddTopic(false);
  };

  return (
    <div className={`bg-white/5 border rounded-xl overflow-hidden ${borderClass}`}>
      {/* Section header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } }}
        className="w-full flex items-center justify-between px-6 py-5 hover:bg-white/5 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-3.5">
          <span className={`text-2xl flex-shrink-0 ${status === 'approved' ? 'opacity-60' : ''}`}>
            {status === 'approved' ? '✅' : sectionDef.icon}
          </span>
          <div>
            <h3 className="font-bold text-white text-base leading-tight">{sectionDef.title}</h3>
            <p className="text-[11px] text-white/30 mt-0.5">{sectionDef.subtitle}</p>
          </div>
          <StatusBadge status={status} />
          {hasEdits && status !== 'approved' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-prosperus-gold-dark/15 text-prosperus-gold-dark/80">
              Editado
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="text-[10px] text-white/50 animate-pulse">Salvando...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-[10px] text-green-400/60">Salvo</span>
          )}
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white/50 text-xs flex-shrink-0"
        >
          ▼
        </motion.span>
      </div>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-4">
              {/* Inline editing hint */}
              {canEdit && subsections.length > 0 && (
                <p className="text-[11px] text-white/50 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  Passe o mouse sobre qualquer tópico para editar ou remover
                </p>
              )}

              {/* Dashboard-style subsection cards */}
              {subsections.length > 0 ? (
                <div className="columns-1 lg:columns-2 gap-3">
                  {subsections.map((sub, idx) => (
                    <div
                      key={`${sub.title}-${idx}`}
                      className="pb-3 break-inside-avoid relative"
                      style={sub.fullWidth ? { columnSpan: 'all' } : undefined}
                    >
                      {confirmDelete === idx && (
                        <div className="absolute inset-0 z-10 bg-red-500/10 border-2 border-red-500/30 rounded-xl flex items-center justify-center backdrop-blur-sm">
                          <div className="text-center">
                            <p className="text-red-400 text-xs font-semibold mb-2">Remover "{sub.title}"?</p>
                            <Button
                              variant="danger-soft"
                              size="xs"
                              onClick={() => handleSubsectionDelete(idx)}
                            >
                              Confirmar
                            </Button>
                          </div>
                        </div>
                      )}
                      <SubsectionCard
                        sub={sub}
                        editable={canEdit}
                        onEdit={(newBody) => handleSubsectionBodyEdit(idx, newBody)}
                        onDelete={() => handleSubsectionDelete(idx)}
                      />
                    </div>
                  ))}
                </div>
              ) : isStructuredJson ? (
                <div dangerouslySetInnerHTML={{ __html: jsonHtml }} />
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <p className="text-sm text-white/50 italic">Conteúdo desta seção ainda não disponível.</p>
                </div>
              )}

              {/* Add topic button / form */}
              {canEdit && (
                showAddTopic ? (
                  <AddTopicForm onAdd={handleAddTopic} onCancel={() => setShowAddTopic(false)} />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={() => setShowAddTopic(true)}
                    className="border-dashed border-prosperus-gold-dark/20 text-prosperus-gold-dark/50 hover:text-prosperus-gold-dark hover:border-prosperus-gold-dark/40"
                  >
                    + Adicionar Tópico
                  </Button>
                )
              )}

              {/* Expert note — contextual reference before observations/approve */}
              {hasExpertNote && (
                <div className="border border-prosperus-gold-dark/15 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowExpertNote(v => !v)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-prosperus-gold-dark/[0.04] transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-prosperus-gold-dark/70 flex-shrink-0"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    <span className="text-xs font-semibold text-prosperus-gold-dark/80 flex-1">Notas do Especialista</span>
                    <motion.span
                      animate={{ rotate: showExpertNote ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-prosperus-gold-dark/40 text-[10px]"
                    >
                      ▼
                    </motion.span>
                  </button>
                  <AnimatePresence>
                    {showExpertNote && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 border-t border-prosperus-gold-dark/10">
                          <div
                            className="mt-3 text-sm leading-relaxed prose prose-invert prose-sm max-w-none [&_p]:text-white/60 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-xs [&_h2]:font-bold [&_h2]:text-white/80 [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-prosperus-gold-dark [&_h3]:mt-2 [&_h3]:mb-1 [&_h4]:text-xs [&_h4]:font-bold [&_h4]:text-prosperus-gold-dark/80 [&_h4]:mt-3 [&_h4]:mb-1 [&_ul]:space-y-1.5 [&_ul]:mb-3 [&_ol]:space-y-1.5 [&_ol]:mb-3 [&_li]:text-white/60 [&_strong]:text-white/80 [&_em]:text-white/50 [&_br]:block [&_br]:mb-2"
                            dangerouslySetInnerHTML={{ __html: expertNoteHtml }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Revised banner — admin made edits, user should review */}
              {status === 'revised' && !readOnly && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-blue-400 text-sm font-semibold">Conteúdo atualizado</span>
                  </div>
                  <p className="text-sm text-blue-200/70">
                    Esta seção foi revisada com base nas suas observações. Revise o conteúdo acima e aprove quando estiver satisfeito.
                  </p>
                </div>
              )}

              {/* Editing banner — waiting for admin */}
              {status === 'editing' && !readOnly && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-yellow-400 text-sm font-semibold">Alterações solicitadas</span>
                  </div>
                  <p className="text-sm text-yellow-200/70">
                    Suas observações foram enviadas. Você será notificado quando as alterações forem aplicadas.
                  </p>
                  {comments.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {comments.map(c => (
                        <div key={c.id} className={`flex items-start gap-2 px-2.5 py-2 rounded text-[11px] ${
                          c.type === 'liked' ? 'bg-green-500/[0.05]' : 'bg-yellow-500/[0.05]'
                        }`}>
                          <span className="flex-shrink-0">{c.type === 'liked' ? '✅' : '🔄'}</span>
                          <div>
                            <span className="text-white/50 font-semibold">{c.topic}: </span>
                            <span className="text-white/50">{c.text}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Observations + Approve (for pending and revised states) */}
              {!readOnly && (status === 'pending' || status === 'revised') && (
                <div className="space-y-3 pt-3 border-t border-white/10">
                  {/* Observations label */}
                  <p className="text-[11px] text-white/50 uppercase tracking-wider font-semibold">Observações para o especialista (opcional)</p>

                  {/* Existing comments */}
                  {comments.length > 0 && (
                    <div className="space-y-2">
                      {comments.map(c => (
                        <FeedbackCard key={c.id} comment={c} onRemove={removeComment} />
                      ))}
                    </div>
                  )}

                  {/* Add comment form or button */}
                  {showFeedbackForm ? (
                    <FeedbackForm
                      topics={topicNames}
                      onSave={addComment}
                      onCancel={() => setShowFeedbackForm(false)}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      onClick={() => setShowFeedbackForm(true)}
                      className="border-dashed border-white/20 text-white/50 hover:text-white/60 py-2.5"
                    >
                      + Adicionar Observação
                    </Button>
                  )}

                  {error && (
                    <p className="text-red-400 text-sm">{error}</p>
                  )}

                  {/* Two-step approve flow */}
                  {!confirmApprove ? (
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={() => setConfirmApprove(true)}
                      disabled={loading}
                    >
                      Aprovar Seção
                    </Button>
                  ) : (
                    <div className="bg-prosperus-gold-dark/[0.08] border border-prosperus-gold-dark/25 rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <span className="text-lg flex-shrink-0 mt-0.5">⚠️</span>
                        <div>
                          <p className="text-sm font-semibold text-prosperus-gold-dark">Confirmar aprovação</p>
                          <p className="text-sm text-white/50 leading-relaxed mt-1">
                            Após aprovar, <strong className="text-white/70">esta seção será bloqueada para edição</strong> e usada como matéria-prima para gerar seus entregáveis (scripts, copies, páginas). Tem certeza de que está satisfeito com o conteúdo?
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirmApprove(false)}
                          className="flex-1 text-white/60"
                        >
                          Voltar e Revisar
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => { setConfirmApprove(false); handleApprove(); }}
                          disabled={loading}
                          className="flex-1"
                        >
                          {loading ? 'Salvando...' : 'Sim, Aprovar'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Approved note — inline editing still available (BB-3.2) */}
              {status === 'approved' && (
                <div className="pt-2 border-t border-white/10">
                  <p className="text-green-400/70 text-xs">✓ Seção aprovada — você pode continuar editando os tópicos a qualquer momento</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
