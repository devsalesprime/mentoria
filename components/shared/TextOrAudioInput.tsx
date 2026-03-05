import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioRecorder } from './AudioRecorder';

type TabId = 'type' | 'record' | 'link';

interface TextOrAudioInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxAudioDuration: number;
  required: boolean;
  questionId: string;
  allowLink?: boolean;
  token: string;
  module?: string;
  scenario?: string;
  durationLabel?: string;
  onInputTypeChange?: (type: 'text' | 'audio' | 'link') => void;
  initialInputType?: 'text' | 'audio' | 'link';
  linkValue?: string;
  onLinkChange?: (value: string) => void;
}

export const TextOrAudioInput: React.FC<TextOrAudioInputProps> = ({
  label,
  value,
  onChange,
  maxAudioDuration,
  required,
  questionId,
  allowLink = false,
  token,
  module = 'general',
  scenario,
  durationLabel,
  onInputTypeChange,
  initialInputType,
  linkValue: linkValueProp,
  onLinkChange,
}) => {
  const mapInputTypeToTab = (t?: string): TabId => {
    // Audio tab hidden — always fall back to text (feature dormant, not removed)
    if (t === 'audio') return 'type';
    if (t === 'link') return 'link';
    return 'type';
  };
  const [activeTab, setActiveTab] = useState<TabId>(mapInputTypeToTab(initialInputType));
  const [linkValue, setLinkValue] = useState(linkValueProp || '');

  const tabs: { id: TabId; label: string; show: boolean }[] = [
    { id: 'type', label: 'Escrever', show: true },
    { id: 'record', label: 'Gravar Áudio', show: false },  // Dormant — re-enable when backend ready
    { id: 'link', label: 'Link de Conteúdo', show: allowLink },
  ];

  const visibleTabs = tabs.filter(t => t.show);

  return (
    <div className="space-y-2">
      {/* Scenario framing — italic serif text above tabs */}
      {scenario && (
        <p className="text-white/50 italic font-serif text-sm mb-1">{scenario}</p>
      )}

      {/* Label */}
      <label className="block text-sm font-sans text-white/70">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              const type = tab.id === 'type' ? 'text' : tab.id === 'record' ? 'audio' : 'link';
              onInputTypeChange?.(type);
            }}
            className={`px-4 py-2 text-sm font-sans transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-prosperus-gold-light border-prosperus-gold-dark'
                : 'text-white/50 border-transparent hover:text-white/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === 'type' && (
          <motion.div
            key="type"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            <textarea
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="Digite sua resposta..."
              rows={4}
              className="w-full p-3 bg-prosperus-navy-mid border border-white/10 rounded-lg text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50 resize-y"
            />
          </motion.div>
        )}

        {activeTab === 'record' && (
          <motion.div
            key="record"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            <AudioRecorder
              maxDuration={maxAudioDuration}
              questionId={questionId}
              token={token}
              module={module}
            />
          </motion.div>
        )}

        {activeTab === 'link' && allowLink && (
          <motion.div
            key="link"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            <input
              type="url"
              value={linkValue}
              onChange={e => {
                setLinkValue(e.target.value);
                if (onLinkChange) {
                  onLinkChange(e.target.value);
                } else {
                  onChange(e.target.value);
                }
              }}
              placeholder="https://..."
              className="w-full p-3 bg-prosperus-navy-mid border border-white/10 rounded-lg text-white/90 text-sm font-sans placeholder:text-white/50 focus:outline-none focus:border-prosperus-gold-dark/50"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duration label — below input area */}
      {durationLabel && (
        <p className="text-white/50 text-xs font-sans">{durationLabel}</p>
      )}
    </div>
  );
};
