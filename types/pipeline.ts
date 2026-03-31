// === BRAND BRAIN ===
export interface BrandBrain {
  version: number;
  generatedAt: string;

  section1_icp: object;
  section2_offer: object;
  section3_positioning: object;
  section4_copy: object;
}

// === ASSETS ===
export interface AssetPack {
  readyToSell: {
    outreachScript?: GeneratedAsset;
    followUpSequences?: GeneratedAsset;
    salesScript?: GeneratedAsset;
  };
  bonus: {
    landingPageCopy?: GeneratedAsset;
    vslScript?: GeneratedAsset;
  };
}

export interface GeneratedAsset {
  content: string;
  generatedAt: string;
  version: number;
}

// === PIPELINE STATUS ===
export type PipelineStatus =
  | 'diagnostic'
  | 'research'
  | 'brand_brain'
  | 'review'
  | 'assets'
  | 'delivered';

// === FEEDBACK STATUS (PV-1.1) ===
export type FeedbackStatus = 'pending' | 'in_analysis' | 'delivered';

// === PIPELINE EXTENDED FIELDS (PV-1.1) ===
export interface PipelineInsightsFields {
  showAssetsToUser: boolean;
  feedbackStatus: FeedbackStatus;
  personalizedFeedback: string | null;
  feedbackDeliveredAt: string | null;
}
