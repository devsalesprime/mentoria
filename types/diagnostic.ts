import type { UploadedFile } from './audio';

// === PRE-MODULE ===
export interface PreModuleData {
  materials: UploadedFile[];
  contentLinks: string[];
  profiles: {
    website?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    other?: string;
  };
  competitors: string[];
}

// === MODULE 1: MENTOR ===
export interface MentorData {
  step1: { explanation: string; inputType: 'text' | 'audio' };
  step2: { authorityStory: string; inputType: 'text' | 'audio' | 'link'; link?: string };
  step3: { gold: string; silver: string; bronze: string };
  step4: {
    testimonials: Testimonial[];
    videoLinks: string[];
    startingFromZero: boolean;
  };
  step5: { marketStandard: string; myDifference: string; inputType: 'text' | 'audio'; inputTypeA?: 'text' | 'audio'; inputTypeB?: 'text' | 'audio' };
}

// === MODULE 2: MENTEE (Success Interview) ===
export interface MenteeData {
  hasClients: 'yes' | 'no';

  // Hormozi 6-Step (3x2 matrix)
  beforeInternal: string;   // 2.2a
  beforeExternal: string;   // 2.2b
  decisionFears: string;    // 2.3a
  decisionTrigger: string;  // 2.3b
  afterExternal: string;    // 2.4a
  afterInternal: string;    // 2.4b

  // Additional
  idealClientGeneral: string;  // 2.5
  terribleFit?: string;        // 2.6 (optional)

  // Per-question input type tracking
  beforeInternalInputType?: 'text' | 'audio';
  beforeExternalInputType?: 'text' | 'audio';
  decisionFearsInputType?: 'text' | 'audio';
  decisionTriggerInputType?: 'text' | 'audio';
  afterExternalInputType?: 'text' | 'audio';
  afterInternalInputType?: 'text' | 'audio';
  idealClientGeneralInputType?: 'text' | 'audio';
  terribleFitInputType?: 'text' | 'audio';

  // Input tracking
  inputTypes: Record<string, 'text' | 'audio'>;
}

// === MODULE 3: METHOD ===
export interface MethodData {
  maturity: 'not_yet' | 'in_head' | 'structured';

  // Auto-populated from Module 2 (passed as edges prop, NOT stored in method)
  // pointA and pointB are computed at Dashboard level from mentee data

  // Method identity (required for all maturity levels)
  name?: string;               // Required — method name
  promise?: string;            // Required — transformation promise, max 250 chars

  // Structured method fields
  pillars?: Pillar[];          // Min 3, max 8 (if structured)

  // Unstructured method fields
  steps?: MethodStep[];        // Min 3 (if not_yet or in_head)
  stepsAudio?: string;         // Alternative: describe all steps at once via audio

  // Key Obstacles (optional, both flows)
  obstacles?: ObstacleMap[];   // Per step/pillar: obstacle + solution

  // Input tracking
  inputTypes: Record<string, 'text' | 'audio'>;
}

// === MODULE 4: OFFER ===
export interface OfferData {
  goal: 'mls' | 'independent' | 'unsure';
  description: string;
  descriptionInputType?: 'text' | 'audio';
  deliverables: Deliverable[];
  bonuses: Bonus[];
  pricing: number;
  salesMaterials: string[];
  salesFiles: UploadedFile[];
}

// === SUPPORTING TYPES ===
export interface Deliverable {
  id: string;
  name: string;
  description?: string;
  frequency: string;
  isMlsRequired?: boolean;
}

export interface Bonus {
  id: string;
  name: string;
  objectionsItKills: string;
  description?: string;
}

export interface Testimonial {
  id: string;
  clientName: string;
  result: string;
  quote?: string;
  videoUrl?: string;
}

export interface Pillar {
  id: string;
  what: string;
  why: string;
  how: string;
}

export interface MethodStep {
  id: string;
  title: string;
  description: string;
  inputType?: 'text' | 'audio';
}

export interface ObstaclePair {
  obstacle: string;
  solution: string;
}

export interface ObstacleMap {
  referenceId: string;         // pillar.id or step.id
  referenceName: string;       // pillar.what or step.title (for display)
  pairs: ObstaclePair[];       // multiple obstacle/solution pairs
  // Deprecated: single-pair fields kept for backward compat migration
  obstacle?: string;
  solution?: string;
}

// === PRIORITIES (PV-1.1) ===
export interface PriorityArea {
  id: string;
  label: string;
  isCustom: boolean;
}

export interface PrioritiesData {
  mentorLevel: 'starting' | 'growing' | 'scaling';
  selectedAreas: PriorityArea[];
  freeformContext?: string;
}

// Re-export UploadedFile from audio.ts for convenience
export type { UploadedFile };
