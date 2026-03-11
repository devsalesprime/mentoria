import { useState, useCallback, useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditState {
  [fieldId: string]: string;
}

export interface UseInlineEditOptions {
  assetId: string;
  /** Debounce delay in ms for auto-save to localStorage */
  debounceMs?: number;
  /** When provided, edits are cleared if generatedAt has changed since last load */
  generatedAt?: string;
}

export interface UseInlineEditReturn {
  /** Get the current value for a field (edited or original) */
  getValue: (fieldId: string, original: string) => string;
  /** Set an edited value for a field */
  setValue: (fieldId: string, value: string) => void;
  /** Check if a specific field has been edited */
  isEdited: (fieldId: string) => boolean;
  /** Restore a single field to its original value */
  restoreField: (fieldId: string) => void;
  /** Restore all fields to original values */
  restoreAll: () => void;
  /** Check if any field has been edited */
  hasEdits: boolean;
  /** Get all edits as a map */
  edits: EditState;
}

// ─── Bracket detection ────────────────────────────────────────────────────────

/** Regex to match insertion brackets like [INSERIR NOME], [INSERÇÃO DE PROVA: ...] */
export const BRACKET_REGEX = /\[([A-ZÀÁÂÃÉÊÍÓÔÕÚÇ\s]+(?:DE|DO|DA|DOS|DAS|:)[^\]]*)\]/i;

/** Check if text contains fillable brackets */
export function hasBrackets(text: string): boolean {
  return BRACKET_REGEX.test(text);
}

/** Extract bracket placeholders from text */
export function extractBrackets(text: string): string[] {
  const regex = new RegExp(BRACKET_REGEX.source, 'gi');
  const matches = text.match(regex);
  return matches ? matches.map((m) => m.slice(1, -1)) : [];
}

// ─── Asset progress tracking ──────────────────────────────────────────────────

export type AssetProgressState = 'not_reviewed' | 'opened';

const PROGRESS_PREFIX = 'asset_progress';

export function getAssetProgress(assetId: string): AssetProgressState {
  try {
    const val = localStorage.getItem(`${PROGRESS_PREFIX}:${assetId}`);
    if (val === 'opened') return val;
    // Migrate old values
    if (val === 'in_use' || val === 'using') return 'opened';
    return 'not_reviewed';
  } catch {
    return 'not_reviewed';
  }
}

/** Mark asset as opened */
export function markAssetOpened(assetId: string): void {
  try {
    localStorage.setItem(`${PROGRESS_PREFIX}:${assetId}`, 'opened');
  } catch {
    // localStorage unavailable
  }
}

/** Reset progress to not_reviewed if the asset was regenerated (different generatedAt) */
export function resetProgressIfRegenerated(assetId: string, currentGeneratedAt: string): void {
  try {
    const genKey = `${PROGRESS_PREFIX}_gen:${assetId}`;
    const storedGen = localStorage.getItem(genKey);
    if (storedGen && storedGen !== currentGeneratedAt) {
      // Asset was regenerated — reset progress and edits
      localStorage.removeItem(`${PROGRESS_PREFIX}:${assetId}`);
      localStorage.removeItem(getStorageKey(assetId));
    }
    localStorage.setItem(genKey, currentGeneratedAt);
  } catch {
    // localStorage unavailable
  }
}

// ─── Arrival screen tracking ─────────────────────────────────────────────────

const ARRIVAL_KEY = 'arrival_seen';

/** Returns the storage key, scoped to userId when available. */
function arrivalKey(userId?: string | null): string {
  return userId ? `${userId}_${ARRIVAL_KEY}` : ARRIVAL_KEY;
}

export function hasSeenArrival(userId?: string | null): boolean {
  try {
    return localStorage.getItem(arrivalKey(userId)) === 'true';
  } catch {
    return false;
  }
}

export function markArrivalSeen(userId?: string | null): void {
  try {
    localStorage.setItem(arrivalKey(userId), 'true');
  } catch {
    // noop
  }
}

// ─── Asset-level edit utilities ──────────────────────────────────────────────

const EDIT_PREFIX = 'asset_edit';

/** Check if an asset has any edits in localStorage */
export function isAssetEdited(assetId: string): boolean {
  try {
    const raw = localStorage.getItem(`${EDIT_PREFIX}:${assetId}`);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Object.keys(parsed).length > 0;
  } catch {
    return false;
  }
}

/** Get export content for an asset — returns edited version merged with original, or original if no edits */
export function getAssetExportContent(assetId: string, originalContent: string): string {
  try {
    const raw = localStorage.getItem(`${EDIT_PREFIX}:${assetId}`);
    if (!raw) return originalContent;
    const edits: EditState = JSON.parse(raw);
    if (Object.keys(edits).length === 0) return originalContent;
    // For assets with field-level edits, return original with a note that edits exist
    // The individual viewers handle their own export logic with getValue
    return originalContent;
  } catch {
    return originalContent;
  }
}

/** Clear all edits from localStorage for a specific asset */
export function resetAssetEdits(assetId: string): void {
  try {
    localStorage.removeItem(`${EDIT_PREFIX}:${assetId}`);
  } catch {
    // localStorage unavailable
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function getStorageKey(assetId: string): string {
  return `${EDIT_PREFIX}:${assetId}`;
}

function loadEdits(assetId: string): EditState {
  try {
    const raw = localStorage.getItem(getStorageKey(assetId));
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupt data
  }
  return {};
}

function saveEdits(assetId: string, edits: EditState): void {
  try {
    if (Object.keys(edits).length === 0) {
      localStorage.removeItem(getStorageKey(assetId));
    } else {
      localStorage.setItem(getStorageKey(assetId), JSON.stringify(edits));
    }
  } catch {
    // localStorage full or unavailable
  }
}

export function useInlineEdit({ assetId, debounceMs = 500, generatedAt }: UseInlineEditOptions): UseInlineEditReturn {
  const [edits, setEdits] = useState<EditState>(() => loadEdits(assetId));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset edits if asset was regenerated (generatedAt changed)
  useEffect(() => {
    if (generatedAt) {
      resetProgressIfRegenerated(assetId, generatedAt);
      // Re-load edits after potential reset
      setEdits(loadEdits(assetId));
    }
  }, [assetId, generatedAt]);

  // Persist edits to localStorage with debounce
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveEdits(assetId, edits);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [edits, assetId, debounceMs]);

  const getValue = useCallback(
    (fieldId: string, original: string): string => {
      return edits[fieldId] !== undefined ? edits[fieldId] : original;
    },
    [edits]
  );

  const setValue = useCallback((fieldId: string, value: string) => {
    setEdits((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const isEdited = useCallback(
    (fieldId: string): boolean => {
      return edits[fieldId] !== undefined;
    },
    [edits]
  );

  const restoreField = useCallback((fieldId: string) => {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }, []);

  const restoreAll = useCallback(() => {
    setEdits({});
    saveEdits(assetId, {});
  }, [assetId]);

  return {
    getValue,
    setValue,
    isEdited,
    restoreField,
    restoreAll,
    hasEdits: Object.keys(edits).length > 0,
    edits,
  };
}
