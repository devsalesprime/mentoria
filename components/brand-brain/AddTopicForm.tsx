import React, { useState, useRef } from 'react';
import { ParsedSubsection, EMOJI_PALETTE, detectIcon } from '../../utils/brand-brain-parser';
import { RichEditorHandle, RichEditor } from './SubsectionCard';
import { Button } from '../ui/Button';

export const AddTopicForm: React.FC<{
  onAdd: (title: string, body: string, icon?: string) => void;
  onCancel: () => void;
}> = ({ onAdd, onCancel }) => {
  const [title, setTitle] = useState('');
  const [hasBody, setHasBody] = useState(false);
  const editorRef = useRef<RichEditorHandle>(null);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const autoIcon = title ? detectIcon(title) : '📋';
  const finalIcon = selectedEmoji || autoIcon;

  return (
    <div className="bg-white/5 border border-dashed border-prosperus-gold-dark/30 rounded-xl p-4 space-y-3">
      <p className="text-xs text-prosperus-gold-dark font-semibold uppercase tracking-wide">Novo Tópico</p>
      <div className="flex gap-2 items-start">
        {/* Emoji picker button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 hover:border-prosperus-gold-dark/30 flex items-center justify-center text-lg transition flex-shrink-0"
            title="Escolher ícone"
          >
            {finalIcon}
          </button>
          {showEmojiPicker && (
            <div className="absolute z-30 top-full left-0 mt-1 bg-prosperus-navy-panel border border-white/20 rounded-lg shadow-xl p-2 w-[220px]">
              <p className="text-[10px] text-white/50 mb-1.5 px-1">Escolha um ícone:</p>
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJI_PALETTE.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { setSelectedEmoji(emoji); setShowEmojiPicker(false); }}
                    className={`w-6 h-6 rounded flex items-center justify-center text-sm hover:bg-white/10 transition ${
                      finalIcon === emoji ? 'bg-prosperus-gold-dark/20 ring-1 ring-prosperus-gold-dark/40' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (selectedEmoji) setSelectedEmoji(null); }}
          placeholder="Título do tópico (ex: Diferencial Competitivo)"
          className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-prosperus-gold-dark/40 transition"
          autoFocus
        />
      </div>
      <RichEditor
        ref={editorRef}
        initialValue=""
        onContentChange={setHasBody}
        showActions={false}
        height="min-h-[80px]"
        placeholder="Conteúdo do tópico... Use a barra de ferramentas para formatar"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-white/50 hover:text-white/60">Cancelar</Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const md = editorRef.current?.getMarkdown() || '';
            if (title.trim() && md.trim()) onAdd(title.trim(), md.trim(), selectedEmoji || undefined);
          }}
          disabled={!title.trim() || !hasBody}
          className="bg-prosperus-gold-dark/20 border-prosperus-gold-dark/30 text-prosperus-gold-dark hover:bg-prosperus-gold-dark/30"
        >
          Adicionar Tópico
        </Button>
      </div>
    </div>
  );
};
