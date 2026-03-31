import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../ui/Button';
import type { PrioritiesData, PriorityArea, MenteeData, MethodData, OfferData } from '../../types/diagnostic';

const PRIORITY_AREAS: Record<string, { title: string; areas: { id: string; label: string; icon: string }[] }> = {
  marketing: {
    title: 'Marketing',
    areas: [
      { id: 'positioning', label: 'Definir meu posicionamento e diferenciação', icon: '🎯' },
      { id: 'content_strategy', label: 'Criar estratégia de conteúdo', icon: '📝' },
      { id: 'brand_authority', label: 'Construir autoridade no mercado', icon: '👑' },
    ],
  },
  vendas: {
    title: 'Vendas',
    areas: [
      { id: 'first_clients', label: 'Conquistar meus primeiros clientes', icon: '🤝' },
      { id: 'scale_acquisition', label: 'Escalar a captação de clientes', icon: '📈' },
      { id: 'increase_ticket', label: 'Aumentar meu ticket médio', icon: '💰' },
      { id: 'improve_conversion', label: 'Melhorar minha taxa de conversão', icon: '🔄' },
    ],
  },
  modelo_de_negocios: {
    title: 'Modelo de Negócios',
    areas: [
      { id: 'structure_method', label: 'Estruturar ou refinar meu método', icon: '🔧' },
      { id: 'define_offer', label: 'Definir ou melhorar minha oferta', icon: '💎' },
      { id: 'systemize_delivery', label: 'Sistematizar a entrega da mentoria', icon: '⚙️' },
      { id: 'scale_programs', label: 'Escalar com programas em grupo ou equipe', icon: '🚀' },
    ],
  },
};

const LEVEL_LABELS: Record<string, string> = {
  starting: 'Começando',
  growing: 'Crescendo',
  scaling: 'Escalando',
};

function inferMentorLevel(mentee: MenteeData, method: MethodData, offer: OfferData): 'starting' | 'growing' | 'scaling' {
  if (mentee?.hasClients !== 'yes') return 'starting';
  if (method?.maturity === 'structured' && offer?.pricing >= 3000) return 'scaling';
  return 'growing';
}

interface PrioritiesScreenProps {
  mentee: MenteeData;
  method: MethodData;
  offer: OfferData;
  priorities: PrioritiesData | null;
  onUpdate: (data: PrioritiesData) => void;
  onSubmit: () => Promise<void>;
  alreadySubmitted?: boolean;
}

export const PrioritiesScreen: React.FC<PrioritiesScreenProps> = ({
  mentee, method, offer, priorities, onUpdate, onSubmit, alreadySubmitted,
}) => {
  const inferred = inferMentorLevel(mentee, method, offer);
  const [level, setLevel] = useState<'starting' | 'growing' | 'scaling'>(priorities?.mentorLevel || inferred);
  const [selected, setSelected] = useState<PriorityArea[]>(priorities?.selectedAreas || []);
  const [customText, setCustomText] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [freeform, setFreeform] = useState(priorities?.freeformContext || '');
  const [submitting, setSubmitting] = useState(false);

  // Sync to parent on change
  useEffect(() => {
    onUpdate({
      mentorLevel: level,
      selectedAreas: selected,
      freeformContext: freeform || undefined,
    });
  }, [level, selected, freeform]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleArea = (id: string, label: string) => {
    setSelected(prev => {
      const exists = prev.find(a => a.id === id);
      if (exists) return prev.filter(a => a.id !== id);
      if (prev.length >= 3) return prev;
      return [...prev, { id, label, isCustom: false }];
    });
  };

  const addCustomArea = () => {
    if (!customText.trim() || selected.length >= 3) return;
    const customId = `custom_${Date.now()}`;
    setSelected(prev => [...prev, { id: customId, label: customText.trim(), isCustom: true }]);
    setCustomText('');
    setShowCustom(false);
  };

  const removeArea = (id: string) => {
    setSelected(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmit = async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setSubmitting(false);
    }
  };

  const isSelected = (id: string) => selected.some(a => a.id === id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto px-4 py-8"
    >
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          Onde você mais precisa da nossa ajuda?
        </h2>
        <p className="text-white/60">
          Selecione de 1 a 3 áreas para que possamos direcionar nossas recomendações e feedback personalizado.
        </p>
      </div>

      {/* Level selector */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <span className="text-white/50 text-sm">Seu momento:</span>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {(['starting', 'growing', 'scaling'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                level === l
                  ? 'bg-brand-primary text-white'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              {LEVEL_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      {/* Selected count */}
      <div className="text-center mb-6">
        <span className={`text-sm font-medium ${selected.length > 0 ? 'text-brand-primary' : 'text-white/40'}`}>
          {selected.length} de 3 selecionados
        </span>
      </div>

      {/* Area groups */}
      {Object.entries(PRIORITY_AREAS).map(([key, group]) => (
        <div key={key} className="mb-6">
          <h3 className="text-white/70 text-sm font-semibold uppercase tracking-wider mb-3">
            {group.title}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {group.areas.map(area => {
              const sel = isSelected(area.id);
              const disabled = !sel && selected.length >= 3;
              return (
                <button
                  key={area.id}
                  onClick={() => !disabled && toggleArea(area.id, area.label)}
                  disabled={disabled}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    sel
                      ? 'border-brand-primary bg-brand-primary/10 text-white'
                      : disabled
                        ? 'border-white/5 bg-white/5 text-white/30 cursor-not-allowed'
                        : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <span className="text-xl flex-shrink-0">{area.icon}</span>
                  <span className="text-sm">{area.label}</span>
                  {sel && <span className="ml-auto text-brand-primary">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Selected custom areas display */}
      {selected.filter(a => a.isCustom).map(area => (
        <div key={area.id} className="flex items-center gap-2 mb-2 p-2 rounded-lg border border-brand-primary/50 bg-brand-primary/10">
          <span className="text-sm text-white flex-1">{area.label}</span>
          <button onClick={() => removeArea(area.id)} className="text-white/50 hover:text-red-400 text-xs">✕</button>
        </div>
      ))}

      {/* Custom area input */}
      {selected.length < 3 && (
        <div className="mb-6">
          {!showCustom ? (
            <button
              onClick={() => setShowCustom(true)}
              className="text-sm text-brand-primary hover:text-brand-primary/80 transition-colors"
            >
              + Outro: descreva sua necessidade
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                placeholder="Descreva sua necessidade..."
                maxLength={200}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-brand-primary focus:outline-none"
                onKeyDown={e => e.key === 'Enter' && addCustomArea()}
              />
              <Button variant="primary" size="sm" onClick={addCustomArea} disabled={!customText.trim()}>
                Adicionar
              </Button>
              <button onClick={() => { setShowCustom(false); setCustomText(''); }} className="text-white/40 hover:text-white/60 text-sm">
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Optional elaboration */}
      <div className="mb-8">
        <label className="block text-white/50 text-sm mb-2">
          Quer elaborar? (opcional)
        </label>
        <textarea
          value={freeform}
          onChange={e => setFreeform(e.target.value)}
          placeholder="Conte um pouco mais sobre sua situação atual nessas áreas..."
          maxLength={500}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-brand-primary focus:outline-none resize-none"
        />
        <div className="text-right text-white/30 text-xs mt-1">{freeform.length}/500</div>
      </div>

      {/* Submit */}
      <div className="text-center">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleSubmit}
          disabled={selected.length === 0 || submitting}
          loading={submitting}
        >
          {alreadySubmitted ? 'Atualizar Prioridades' : 'Enviar Diagnóstico'}
        </Button>
        {selected.length === 0 && (
          <p className="text-white/40 text-xs mt-2">Selecione pelo menos 1 área para continuar</p>
        )}
      </div>
    </motion.div>
  );
};
