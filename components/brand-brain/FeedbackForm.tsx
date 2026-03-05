import React, { useState } from 'react';
import { Button } from '../ui/Button';

// ─── Structured feedback types ──────────────────────────────────────────────

export interface FeedbackComment {
  id: string;
  type: 'liked' | 'adjust';
  topic: string;
  text: string;
}

export const formatFeedbackForBackend = (comments: FeedbackComment[]): string => {
  if (comments.length === 0) return '';
  const liked = comments.filter(c => c.type === 'liked');
  const adjust = comments.filter(c => c.type === 'adjust');
  let result = '';
  if (liked.length > 0) {
    result += '✅ O QUE GOSTEI:\n';
    liked.forEach(c => {
      result += `- [${c.topic}] ${c.text}\n`;
    });
    result += '\n';
  }
  if (adjust.length > 0) {
    result += '🔄 O QUE AJUSTAR:\n';
    adjust.forEach(c => {
      result += `- [${c.topic}] ${c.text}\n`;
    });
  }
  return result.trim();
};

// ─── Feedback comment form ──────────────────────────────────────────────────

export const FeedbackForm: React.FC<{
  topics: string[];
  onSave: (comment: Omit<FeedbackComment, 'id'>) => void;
  onCancel: () => void;
}> = ({ topics, onSave, onCancel }) => {
  const [type, setType] = useState<'liked' | 'adjust'>('adjust');
  const [topic, setTopic] = useState('Observação Geral');
  const [text, setText] = useState('');
  const [topicOpen, setTopicOpen] = useState(false);

  const allTopics = ['Observação Geral', ...topics];

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
      {/* Type selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setType('liked')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition border ${
            type === 'liked'
              ? 'bg-green-500/15 border-green-500/40 text-green-400'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white/60'
          }`}
        >
          ✅ O que gostei
        </button>
        <button
          onClick={() => setType('adjust')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition border ${
            type === 'adjust'
              ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white/60'
          }`}
        >
          🔄 O que ajustar
        </button>
      </div>
      {/* Topic selector — custom dropdown for dark theme */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setTopicOpen(!topicOpen)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-white/30 transition text-left flex items-center justify-between"
        >
          <span>{topic}</span>
          <span className="text-white/50 text-[10px]">{topicOpen ? '▲' : '▼'}</span>
        </button>
        {topicOpen && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-prosperus-navy-panel border border-white/20 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
            {allTopics.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTopic(t); setTopicOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs transition ${
                  topic === t
                    ? 'bg-prosperus-gold-dark/15 text-prosperus-gold-dark font-semibold'
                    : 'text-white/60 hover:bg-white/10 hover:text-white/70'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Text */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={type === 'liked' ? 'O que te chamou atenção positivamente...' : 'O que gostaria de ver diferente...'}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 resize-none h-20 focus:outline-none focus:border-white/30 transition"
      />
      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-white/50 hover:text-white/60"
        >
          Cancelar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { if (text.trim()) onSave({ type, topic, text: text.trim() }); }}
          disabled={!text.trim()}
          className="bg-prosperus-gold-dark/20 border-prosperus-gold-dark/30 text-prosperus-gold-dark hover:bg-prosperus-gold-dark/30"
        >
          Salvar Observação
        </Button>
      </div>
    </div>
  );
};

// ─── Feedback comment card ──────────────────────────────────────────────────

export const FeedbackCard: React.FC<{
  comment: FeedbackComment;
  onRemove: (id: string) => void;
}> = ({ comment, onRemove }) => (
  <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-xs ${
    comment.type === 'liked'
      ? 'bg-green-500/[0.06] border-green-500/20'
      : 'bg-yellow-500/[0.06] border-yellow-500/20'
  }`}>
    <span className="flex-shrink-0 mt-0.5">{comment.type === 'liked' ? '✅' : '🔄'}</span>
    <div className="flex-1 min-w-0">
      <span className={`text-[10px] font-semibold uppercase tracking-wide ${
        comment.type === 'liked' ? 'text-green-400/60' : 'text-yellow-400/60'
      }`}>
        {comment.topic}
      </span>
      <p className="text-white/60 mt-0.5 leading-relaxed">{comment.text}</p>
    </div>
    <Button
      variant="icon"
      onClick={() => onRemove(comment.id)}
      className="text-white/50 hover:text-red-400 flex-shrink-0 text-sm"
      title="Remover"
    >
      ×
    </Button>
  </div>
);
