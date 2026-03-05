import React from 'react';
import { SECTIONS } from '../../utils/brand-brain-constants';
import { Button } from '../ui/Button';

interface BBPillarIntroProps {
  hasExpertNotes: boolean;
  onDismiss: () => void;
}

export const BBPillarIntro: React.FC<BBPillarIntroProps> = ({
  hasExpertNotes,
  onDismiss,
}) => (
  <div className="mb-6 bg-gradient-to-br from-prosperus-gold-dark/[0.08] to-prosperus-gold-dark/[0.02] border border-prosperus-gold-dark/20 rounded-xl overflow-hidden">
    <div className="p-5 pb-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-bold text-prosperus-gold-dark mb-1">Seu Brand Brain em 5 pilares</p>
          <p className="text-sm text-white/50 leading-relaxed">
            Todo modelo de negócio se sustenta em <strong className="text-white/70">5 fundamentos estratégicos</strong>. Seu Brand Brain é o mapa completo desses pilares — e a base de todos os seus entregáveis.
          </p>
        </div>
        <Button
          variant="icon"
          onClick={onDismiss}
          className="text-white/50 hover:text-white/50 flex-shrink-0"
          title="Fechar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {SECTIONS.map(s => (
          <div key={s.id} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-center">
            <span className="text-xl block mb-1">{s.icon}</span>
            <p className="text-[11px] font-bold text-prosperus-gold-dark uppercase tracking-wide">{s.pillar}</p>
            <p className="text-[10px] text-white/50 mt-0.5 leading-snug">{s.pillarDesc}</p>
          </div>
        ))}
      </div>
    </div>
    {/* Expert notes hint — tells user to look for the book icon per section */}
    {hasExpertNotes && (
      <div className="mx-5 mb-4 bg-prosperus-gold-dark/[0.08] border border-prosperus-gold-dark/25 rounded-lg p-3.5 flex items-start gap-3">
        <span className="text-lg flex-shrink-0">📋</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-prosperus-gold-dark mb-0.5">Notas do Especialista disponíveis</p>
          <p className="text-[11px] text-white/50 leading-relaxed">
            O especialista deixou notas explicando as decisões tomadas em cada seção. Procure por "Notas do Especialista" ao final de cada seção para consultar.
          </p>
        </div>
      </div>
    )}
    <div className="bg-white/5 border-t border-white/5 px-5 py-3 flex items-center justify-between gap-3">
      <p className="text-[11px] text-white/50">
        Revise, edite diretamente e aprove cada pilar. Suas alterações são salvas automaticamente.
      </p>
      <Button
        variant="ghost"
        size="xs"
        onClick={onDismiss}
        className="bg-prosperus-gold-dark/15 text-prosperus-gold-dark hover:bg-prosperus-gold-dark/25 text-[11px] flex-shrink-0"
      >
        Entendi
      </Button>
    </div>
  </div>
);
