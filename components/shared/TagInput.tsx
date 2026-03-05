import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  label?: string;
}

export const TagInput: React.FC<TagInputProps> = ({ value, onChange, placeholder = 'Type and press Enter...', label }) => {
  const [inputValue, setInputValue] = useState('');

  const addTag = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputValue('');
  }, [value, onChange]);

  const removeTag = useCallback((index: number) => {
    onChange(value.filter((_, i) => i !== index));
  }, [value, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      addTag(trimmed);
    }
    if (e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    }
    if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes(',')) {
      e.preventDefault();
      const tags = pasted.split(',').map(t => t.trim()).filter(Boolean);
      const newTags = tags.filter(t => !value.includes(t));
      if (newTags.length) onChange([...value, ...newTags]);
    }
  };

  return (
    <div>
      {label && <label className="block text-sm font-sans text-white/70 mb-1.5">{label}</label>}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-prosperus-navy-mid border border-white/10 rounded-lg focus-within:border-prosperus-gold-dark/50 transition-colors">
        <AnimatePresence>
          {value.map((tag, index) => (
            <motion.span
              key={tag}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-prosperus-gold-dark/20 text-prosperus-gold-light text-sm rounded-full border border-prosperus-gold-dark/30 font-sans"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(index)}
                className="ml-0.5 hover:text-white transition-colors"
                aria-label={`Remover ${tag}`}
              >
                ×
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-white/90 text-sm font-sans placeholder:text-white/50"
        />
      </div>
    </div>
  );
};
