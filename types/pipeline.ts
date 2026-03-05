// === BRAND BRAIN ===
export interface BrandBrain {
  version: number;
  generatedAt: string;

  section1_icp: object;
  section2_offer: object;
  section3_positioning: object;
  section4_copy: object;

  sectionApprovals: {
    s1: 'pending' | 'approved' | 'editing';
    s2: 'pending' | 'approved' | 'editing';
    s3: 'pending' | 'approved' | 'editing';
    s4: 'pending' | 'approved' | 'editing';
  };
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
