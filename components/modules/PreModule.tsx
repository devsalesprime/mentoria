import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PreModuleData } from '../../types/diagnostic';
import { SectionWarning } from '../shared/SectionWarning';
import { FileUpload } from '../shared/FileUpload';
import { TagInput } from '../shared/TagInput';
import { AccordionSection } from '../shared/AccordionSection';
import { CelebrationOverlay } from '../shared/CelebrationOverlay';
import { Button } from '../ui/Button';

interface PreModuleProps {
  data: PreModuleData;
  onUpdate: (data: Partial<PreModuleData>) => void;
  token: string;
  onModuleComplete?: () => void;
}

// Completion helpers
const isMaterialsComplete = (data: PreModuleData) => (data.materials || []).length > 0;
const isContentLinksComplete = (data: PreModuleData) => (data.contentLinks || []).length > 0;
const isProfilesComplete = (data: PreModuleData) => {
  const p = data.profiles || {};
  return !!(p.website || p.instagram || p.linkedin || p.youtube || p.other);
};
const isCompetitorsComplete = (data: PreModuleData) => (data.competitors || []).length > 0;

const PLATFORM_KEYS = ['website', 'instagram', 'linkedin', 'youtube', 'other'] as const;
type PlatformKey = typeof PLATFORM_KEYS[number];

const PLATFORMS: { key: PlatformKey; label: string; icon: string }[] = [
  { key: 'website',   label: 'Website',   icon: '🌐' },
  { key: 'instagram', label: 'Instagram',  icon: '📸' },
  { key: 'linkedin',  label: 'LinkedIn',   icon: '💼' },
  { key: 'youtube',   label: 'YouTube',    icon: '▶️' },
  { key: 'other',     label: 'Outro',      icon: '🔗' },
];

type SectionId = 'materials' | 'links' | 'profiles' | 'competitors';

export const PreModule: React.FC<PreModuleProps> = ({ data, onUpdate, token, onModuleComplete }) => {
  const [openSection, setOpenSection] = useState<SectionId | null>('materials');
  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey | null>(null);
  const [platformInput, setPlatformInput] = useState('');

  // Celebration state
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationDismissed, setCelebrationDismissed] = useState(false);

  const shouldCelebrate = isCompetitorsComplete(data) && isProfilesComplete(data);
  const prevShouldCelebrate = useRef(shouldCelebrate);

  useEffect(() => {
    if (shouldCelebrate && !prevShouldCelebrate.current && !celebrationDismissed) {
      setShowCelebration(true);
    }
    prevShouldCelebrate.current = shouldCelebrate;
  }, [shouldCelebrate, celebrationDismissed]);

  const toggleSection = (id: SectionId) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  // Content Links handlers
  const handleAddLink = () => {
    const trimmed = linkInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
      setLinkError('A URL deve começar com https:// ou http://');
      return;
    }
    setLinkError('');
    onUpdate({ contentLinks: [...(data.contentLinks || []), trimmed] });
    setLinkInput('');
  };

  const handleRemoveLink = (index: number) => {
    const updated = (data.contentLinks || []).filter((_, i) => i !== index);
    onUpdate({ contentLinks: updated });
  };

  // Profile icon grid handlers
  const handlePlatformCardClick = (key: PlatformKey) => {
    if (selectedPlatform === key) {
      setSelectedPlatform(null);
      setPlatformInput('');
    } else {
      setSelectedPlatform(key);
      setPlatformInput((data.profiles || {})[key] || '');
    }
  };

  const handlePlatformInputSave = () => {
    if (selectedPlatform) {
      onUpdate({ profiles: { ...(data.profiles || {}), [selectedPlatform]: platformInput.trim() } });
    }
  };

  const handlePlatformKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlePlatformInputSave();
      setSelectedPlatform(null);
    }
  };

  const handleConcluir = () => {
    if (!showCelebration && !celebrationDismissed) {
      setShowCelebration(true);
    } else {
      onModuleComplete?.();
    }
  };

  // Section content renderers
  const renderMaterialsContent = () => (
    <div className="space-y-3">
      <p className="text-sm text-white/50">Guia de marca, copy deck, pitch deck, media kit</p>
      <FileUpload
        files={data.materials || []}
        onFilesChange={(files) => onUpdate({ materials: files })}
        category="pre_module_material"
        token={token}
      />
    </div>
  );

  const renderContentLinksContent = () => (
    <div className="space-y-3">
      <SectionWarning
        message="Certifique-se de que todos os links são acessíveis publicamente. Teste em uma aba anônima."
        variant="info"
      />
      <p className="text-sm text-white/50">Gravações de aulas, episódios de podcast, vídeos do YouTube, replays de webinar</p>
      <div className="flex gap-2">
        <input
          type="url"
          value={linkInput}
          onChange={(e) => { setLinkInput(e.target.value); setLinkError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); } }}
          placeholder="https://..."
          className="flex-1 bg-prosperus-navy-mid border border-white/10 rounded-lg px-4 py-2 text-white/90 text-sm font-sans placeholder:text-white/50 focus:border-prosperus-gold-dark/50 focus:outline-none transition-colors"
        />
        <Button variant="primary" size="md" onClick={handleAddLink}>
          + Adicionar
        </Button>
      </div>
      {linkError && <p className="text-red-400 text-xs">{linkError}</p>}
      {(data.contentLinks || []).length > 0 && (
        <ul className="space-y-2">
          {data.contentLinks.map((url, i) => (
            <li key={i} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
              <span className="flex-1 text-white/70 truncate">{url}</span>
              <Button
                variant="link"
                size="xs"
                onClick={() => handleRemoveLink(i)}
                className="text-red-400 hover:text-red-300 font-bold flex-shrink-0"
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const renderProfilesContent = () => {
    const profiles = data.profiles || {};
    return (
      <div className="space-y-4">
        <SectionWarning
          message="Certifique-se de que todos os links são acessíveis publicamente. Teste em uma aba anônima."
          variant="info"
        />
        <p className="text-sm text-white/50">Conecte ao menos um perfil público para que possamos pesquisar sua presença online.</p>

        {/* Platform card grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {PLATFORMS.map(({ key, label, icon }) => {
            const isFilled = !!(profiles[key]);
            const isActive = selectedPlatform === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handlePlatformCardClick(key)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prosperus-gold-dark ${
                  isActive
                    ? 'border-prosperus-gold-dark bg-prosperus-gold-dark/10'
                    : isFilled
                    ? 'border-green-500/40 bg-green-500/5'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <span className="text-2xl">{icon}</span>
                <span className="text-xs text-white/70 font-sans">{label}</span>
                <span className="text-sm">
                  {isFilled ? '✅' : <span className="w-3 h-3 rounded-full border border-white/20 inline-block" />}
                </span>
              </button>
            );
          })}
        </div>

        {/* URL input for selected platform */}
        <AnimatePresence>
          {selectedPlatform && (
            <motion.div
              key="platform-input"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 pt-1">
                <label className="block text-xs text-white/50 font-sans">
                  Editando: {PLATFORMS.find(p => p.key === selectedPlatform)?.label}
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={platformInput}
                    onChange={(e) => setPlatformInput(e.target.value)}
                    onKeyDown={handlePlatformKeyDown}
                    onBlur={handlePlatformInputSave}
                    placeholder="https://..."
                    autoFocus
                    className="flex-1 bg-prosperus-navy-mid border border-white/10 rounded-lg px-4 py-2 text-white/90 text-sm font-sans placeholder:text-white/50 focus:border-prosperus-gold-dark/50 focus:outline-none transition-colors"
                  />
                  <Button variant="primary" size="md" onClick={() => { handlePlatformInputSave(); setSelectedPlatform(null); }}>
                    Salvar
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderCompetitorsContent = () => (
    <div className="space-y-3">
      <p className="text-sm text-white/50">Nomes ou URLs — essencial para a Pesquisa de Mercado</p>
      <TagInput
        value={data.competitors || []}
        onChange={(tags) => onUpdate({ competitors: tags })}
        placeholder="Digite um nome ou URL e pressione Enter..."
      />
    </div>
  );

  const sections: { id: SectionId; title: string; icon: string; badge: 'optional' | 'recommended'; badgeLabel: string; isComplete: boolean; renderContent: () => React.ReactNode }[] = [
    {
      id: 'materials',
      title: 'Materiais de Negócio Existentes',
      icon: '📁',
      badge: 'optional',
      badgeLabel: 'Opcional',
      isComplete: isMaterialsComplete(data),
      renderContent: renderMaterialsContent,
    },
    {
      id: 'links',
      title: 'Links de Conteúdo',
      icon: '🔗',
      badge: 'optional',
      badgeLabel: 'Opcional',
      isComplete: isContentLinksComplete(data),
      renderContent: renderContentLinksContent,
    },
    {
      id: 'profiles',
      title: 'Perfis Públicos',
      icon: '🌐',
      badge: 'optional',
      badgeLabel: 'Opcional',
      isComplete: isProfilesComplete(data),
      renderContent: renderProfilesContent,
    },
    {
      id: 'competitors',
      title: 'Concorrentes e Referências',
      icon: '🎯',
      badge: 'recommended',
      badgeLabel: 'Recomendado',
      isComplete: isCompetitorsComplete(data),
      renderContent: renderCompetitorsContent,
    },
  ];

  return (
    <div className="bg-prosperus-navy-mid border border-white/5 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl space-y-4">

      {/* Celebration overlay */}
      <AnimatePresence>
        {showCelebration && (
          <CelebrationOverlay
            message="Materiais coletados!"
            subMessage="Ótimo contexto para trabalharmos."
            variant="module"
            duration={2000}
            onComplete={() => {
              setShowCelebration(false);
              setCelebrationDismissed(true);
              onModuleComplete?.();
            }}
          />
        )}
      </AnimatePresence>

      {/* Accordion sections */}
      {!showCelebration && sections.map((section) => (
        <AccordionSection
          key={section.id}
          title={section.title}
          icon={section.icon}
          badge={section.badge}
          badgeLabel={section.badgeLabel}
          isComplete={section.isComplete}
          isOpen={openSection === section.id}
          onToggle={() => toggleSection(section.id)}
        >
          {section.renderContent()}
        </AccordionSection>
      ))}

      {/* Concluir Módulo button */}
      {!showCelebration && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="pt-2 flex justify-end"
        >
          <Button variant="primary" size="lg" onClick={handleConcluir}>
            Concluir Módulo →
          </Button>
        </motion.div>
      )}
    </div>
  );
};
