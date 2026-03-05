import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { SectionWarning } from '../shared/SectionWarning';
import { Button } from '../ui/Button';
import { AssetViewer } from './AssetViewer';
import { AssetArrivalScreen } from './AssetArrivalScreen';
import { ChatScriptViewer } from './ChatScriptViewer';
import { CadenceTimeline } from './CadenceTimeline';
import { LandingPagePreview } from './LandingPagePreview';
import { TeleprompterStageMap } from './TeleprompterStageMap';
import { OutreachFlowView } from './OutreachFlowView';
import { ToolkitGuide, GuideView } from './ToolkitGuide';
import type { ToolDefinition } from './ToolkitGuide';
import type { AssetPack, GeneratedAsset } from '../../types/pipeline';
import {
  PHASES, ASSET_CATALOG, getAssetsByPhase, resolveAssetContent,
  type JourneyPhase, type AssetCatalogEntry, type ParadigmType,
} from './assetConfig';
import {
  getAssetProgress, markAssetOpened, hasSeenArrival,
  type AssetProgressState,
} from './useInlineEdit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetDeliveryHubProps {
  token: string;
  onNavigate: (activeItem: string) => void;
  initialPack?: 'readyToSell' | 'bonus';
  mentorName?: string;
}

interface SelectedAsset {
  entry: AssetCatalogEntry;
  asset: GeneratedAsset;
}

// ─── Progress badge ──────────────────────────────────────────────────────────

const PROGRESS_CONFIG: Record<AssetProgressState, { label: string; classes: string; icon: string }> = {
  not_reviewed: { label: 'Não revisado', classes: 'bg-yellow-500/20 text-yellow-400', icon: '○' },
  opened:       { label: 'Revisado',     classes: 'bg-green-600/20 text-green-400',   icon: '✓' },
};

const ProgressBadge: React.FC<{ state: AssetProgressState }> = ({ state }) => {
  const cfg = PROGRESS_CONFIG[state];
  return (
    <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.classes}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ─── Skeleton ────────────────────────────────────────────────────────────────

const CardSkeleton: React.FC = () => (
  <div className="bg-white/5 border border-white/10 rounded-xl p-4 animate-pulse">
    <div className="h-4 bg-white/10 rounded w-3/4 mb-3" />
    <div className="h-3 bg-white/10 rounded w-1/2 mb-4" />
    <div className="h-8 bg-white/10 rounded w-full" />
  </div>
);

// ─── Journey asset card ─────────────────────────────────────────────────────

interface JourneyAssetCardProps {
  entry: AssetCatalogEntry;
  asset: GeneratedAsset | undefined;
  onView: (entry: AssetCatalogEntry, asset: GeneratedAsset) => void;
}

const JourneyAssetCard: React.FC<JourneyAssetCardProps> = ({ entry, asset, onView }) => {
  const hasContent = !!asset?.content;
  const progress = getAssetProgress(entry.assetId);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition flex flex-col justify-between gap-3"
    >
      {/* Icon + name + progress */}
      <div>
        <div className="flex items-center gap-2.5 mb-2">
          <span className="text-xl flex-shrink-0">{entry.icon}</span>
          <h4 className="font-semibold text-white text-sm leading-snug">{entry.name}</h4>
        </div>
        {hasContent ? (
          <ProgressBadge state={progress} />
        ) : (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-600/20 text-gray-400">
            Ainda não gerado
          </span>
        )}
      </div>

      {/* Trigger sentence */}
      <p className="text-sm text-prosperus-gold-dark/70 leading-relaxed">{entry.triggerSentence}</p>

      {/* Action */}
      <Button
        variant="primary"
        fullWidth
        onClick={() => hasContent && asset && onView(entry, asset)}
        disabled={!hasContent}
      >
        Ver agora
      </Button>
    </motion.div>
  );
};

// ─── Paradigm viewer router ─────────────────────────────────────────────────

function renderParadigmViewer(
  entry: AssetCatalogEntry,
  asset: GeneratedAsset,
  onBack: () => void
): React.ReactNode {
  const commonProps = {
    assetId: entry.assetId,
    assetName: entry.name,
    content: asset.content,
    generatedAt: asset.generatedAt,
    onBack,
  };

  switch (entry.paradigm) {
    case 'chat':
      return <ChatScriptViewer {...commonProps} />;
    case 'timeline':
      return <CadenceTimeline {...commonProps} />;
    case 'landingPreview':
      return <LandingPagePreview {...commonProps} />;
    case 'teleprompter':
      return <TeleprompterStageMap {...commonProps} />;
    case 'outreachDual':
      return <OutreachFlowView {...commonProps} />;
    default:
      return (
        <AssetViewer
          assetId={entry.assetId}
          assetName={entry.name}
          asset={asset}
          onBack={onBack}
        />
      );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Decode JWT payload to extract user ID (client-side, no verification). */
function extractUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.id || payload.sub || null) as string | null;
  } catch {
    return null;
  }
}

/** Returns a localStorage key scoped to the user when userId is available. */
function scopedKey(userId: string | null, key: string): string {
  return userId ? `${userId}_${key}` : key;
}

// ─── Main component ─────────────────────────────────────────────────────────

export const AssetDeliveryHub: React.FC<AssetDeliveryHubProps> = ({
  token,
  onNavigate,
  mentorName = 'Mentor',
}) => {
  const userId = extractUserIdFromToken(token);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetPack | null>(null);
  const [selected, setSelected] = useState<SelectedAsset | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);
  const [showArrival, setShowArrival] = useState(false);
  const [activePhase, setActivePhase] = useState<JourneyPhase | 'all' | 'toolkit'>('all');
  const [warningDismissed, setWarningDismissed] = useState(() => localStorage.getItem(scopedKey(userId, 'hub_warning_dismissed')) === 'true');

  // ─── Fetch assets ─────────────────────────────────────────────────────────

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/assets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        const data = res.data.data?.assets ?? null;
        setAssets(data);
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar entregáveis');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // Check before fetch — show arrival immediately on first visit (no loading flash)
    if (!hasSeenArrival(userId)) {
      setShowArrival(true);
    }
    fetchAssets();
  }, [fetchAssets]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleView = (entry: AssetCatalogEntry, asset: GeneratedAsset) => {
    markAssetOpened(entry.assetId);
    setSelected({ entry, asset });
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleBack = () => setSelected(null);

  const handleSelectTool = (tool: ToolDefinition) => {
    setSelectedTool(tool);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  // ─── Progress counter ────────────────────────────────────────────────────

  const getProgressCount = (): { reviewed: number; total: number } => {
    let reviewed = 0;
    const total = ASSET_CATALOG.length;
    for (const entry of ASSET_CATALOG) {
      const content = resolveAssetContent(assets, entry);
      if (content && getAssetProgress(entry.assetId) !== 'not_reviewed') {
        reviewed++;
      }
    }
    return { reviewed, total };
  };

  // ─── Arrival screen ───────────────────────────────────────────────────────

  if (showArrival) {
    return (
      <AssetArrivalScreen
        mentorName={mentorName}
        userId={userId}
        onComplete={() => setShowArrival(false)}
      />
    );
  }

  // ─── Paradigm viewer ─────────────────────────────────────────────────────

  if (selected) {
    return renderParadigmViewer(selected.entry, selected.asset, handleBack) as React.JSX.Element;
  }

  // ─── Toolkit guide view ───────────────────────────────────────────────────

  if (selectedTool) {
    return (
      <GuideView
        tool={selectedTool}
        token={token}
        onBack={() => setSelectedTool(null)}
      />
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="h-8 bg-white/10 rounded w-48 mb-8 animate-pulse" />
        {/* Desktop kanban skeleton */}
        <div className="hidden md:flex flex-row gap-6">
          {[1, 2, 3].map((col) => (
            <div key={col} className="flex-1 flex flex-col gap-3">
              <div className="h-5 bg-white/10 rounded w-24 mb-2 animate-pulse" />
              <CardSkeleton />
              {col < 3 && <CardSkeleton />}
            </div>
          ))}
        </div>
        {/* Mobile skeleton */}
        <div className="md:hidden space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-5 bg-white/10 rounded w-24 mb-3 animate-pulse" />
              <CardSkeleton />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Button
            variant="secondary"
            onClick={fetchAssets}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  // ─── No assets yet ────────────────────────────────────────────────────────

  if (!assets) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h2 className="text-2xl font-bold text-white mb-6">Sua Jornada de Lançamento</h2>
        <div className="bg-white/5 border border-white/10 rounded-xl p-10 text-center">
          <span className="text-5xl block mb-4">🚀</span>
          <h3 className="text-xl font-semibold text-white mb-2">Entregáveis em preparação</h3>
          <p className="text-white/50 text-sm max-w-sm mx-auto">
            Seus entregáveis estão sendo preparados com base no seu Brand Brain aprovado.
            Você será notificado quando estiverem prontos.
          </p>
        </div>
      </div>
    );
  }

  // ─── Main hub — Journey layout ────────────────────────────────────────────

  const { reviewed, total } = getProgressCount();

  const TAB_ACTIVE = 'bg-prosperus-gold-dark text-black';
  const TAB_INACTIVE = 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10';

  const showPhase = (phase: JourneyPhase) => activePhase === phase || activePhase === 'all';
  const showToolkit = activePhase === 'toolkit' || activePhase === 'all';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-prosperus-gold-dark/20 to-prosperus-gold-dark/5 border border-prosperus-gold-dark/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xl">🚀</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Sua Jornada de Lançamento</h2>
            <p className="text-white/30 text-sm">
              Suas ferramentas exclusivas, de atrair leads a fechar vendas
            </p>
          </div>
        </div>
        {/* Progress counter */}
        {reviewed > 0 && (
          <div className="text-sm text-white/50">
            Você revisou <span className="text-prosperus-gold-dark font-semibold">{reviewed}</span> de{' '}
            <span className="text-white/70 font-semibold">{total}</span> ferramentas
          </div>
        )}
      </div>

      {/* ─── Warning banner ──────────────────────────────────────────────────── */}
      {!warningDismissed && (
        <div className="mb-6 relative">
          <SectionWarning
            message="Estes materiais são um ponto de partida sólido, construídos com nossos frameworks e metodologia. Revise e adapte ao seu tom de voz e à sua experiência real."
            variant="warning"
          />
          <Button
            variant="icon"
            size="sm"
            onClick={() => {
              localStorage.setItem(scopedKey(userId, 'hub_warning_dismissed'), 'true');
              setWarningDismissed(true);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            ✕
          </Button>
        </div>
      )}

      {/* ─── Phase tabs ──────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setActivePhase('all')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activePhase === 'all' ? TAB_ACTIVE : TAB_INACTIVE}`}
        >
          Ver Tudo
        </button>
        {PHASES.map((phase) => (
          <button
            key={phase.id}
            onClick={() => setActivePhase(phase.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activePhase === phase.id ? TAB_ACTIVE : TAB_INACTIVE}`}
          >
            {phase.icon} {phase.label}
          </button>
        ))}
        <button
          onClick={() => setActivePhase('toolkit')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${activePhase === 'toolkit' ? TAB_ACTIVE : TAB_INACTIVE}`}
        >
          🧪 Kit de Escala
        </button>
      </div>

      {/* ─── Phase content ───────────────────────────────────────────────────── */}

      {/* Desktop kanban: horizontal columns per phase */}
      {(() => {
        const visiblePhases = PHASES.filter((p) => showPhase(p.id) && getAssetsByPhase(p.id).length > 0);
        const isSinglePhase = activePhase !== 'all' && activePhase !== 'toolkit';

        return visiblePhases.length > 0 ? (
          <>
            {/* ── Desktop: kanban columns (md+) ──────────────────────────────── */}
            <div className={`hidden md:flex flex-row gap-6 ${isSinglePhase ? 'max-w-md' : ''}`}>
              {visiblePhases.map((phase) => {
                const phaseAssets = getAssetsByPhase(phase.id);
                return (
                  <motion.div
                    key={phase.id}
                    className={`flex-1 min-w-0 flex flex-col gap-3 bg-white/[0.02] border border-white/10 border-l-2 ${phase.accentClass} rounded-xl p-4`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {/* Column header */}
                    <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
                      <span className="text-lg">{phase.icon}</span>
                      <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                          {phase.label}
                        </h3>
                        <p className="text-xs text-white/30">{phase.description}</p>
                      </div>
                    </div>

                    {/* Stacked asset cards */}
                    {phaseAssets.map((entry) => (
                      <JourneyAssetCard
                        key={entry.assetId}
                        entry={entry}
                        asset={resolveAssetContent(assets, entry)}
                        onView={handleView}
                      />
                    ))}
                  </motion.div>
                );
              })}
            </div>

            {/* ── Mobile: vertical sections with horizontal scroll (<md) ──── */}
            <div className="md:hidden space-y-8">
              {visiblePhases.map((phase) => {
                const phaseAssets = getAssetsByPhase(phase.id);
                return (
                  <motion.div
                    key={phase.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {/* Section header */}
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="text-lg">{phase.icon}</span>
                      <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                          {phase.label}
                        </h3>
                        <p className="text-xs text-white/30">{phase.description}</p>
                      </div>
                    </div>

                    {/* Horizontal scrollable cards */}
                    <div
                      className="flex flex-row gap-3 overflow-x-auto pb-2 -mx-4 px-4"
                      style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
                    >
                      {phaseAssets.map((entry) => (
                        <div
                          key={entry.assetId}
                          className="min-w-[75vw] max-w-[85vw] flex-shrink-0"
                          style={{ scrollSnapAlign: 'start' }}
                        >
                          <JourneyAssetCard
                            entry={entry}
                            asset={resolveAssetContent(assets, entry)}
                            onView={handleView}
                          />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        ) : null;
      })()}

      {/* ─── Kit de Escala (toolkit) ───────────────────────────────────────── */}
      {showToolkit && (
        <motion.div
          className="mt-10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activePhase === 'all' && (
            <div className="flex items-center gap-3 mb-4">
              <span className="text-lg">🧪</span>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Kit de Escala
                </h3>
                <p className="text-sm text-white/30">
                  Você já tem suas primeiras ferramentas. Quando quiser ir mais longe:
                </p>
              </div>
            </div>
          )}
          <ToolkitGuide token={token} hideTitle={activePhase === 'all'} onSelectTool={handleSelectTool} />
        </motion.div>
      )}
    </div>
  );
};
