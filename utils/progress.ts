import type { PreModuleData, MentorData, MenteeData, MethodData, OfferData } from '../types/diagnostic';

// Weighted stage-based progress model
// Pre-Module: 10%, Mentor: 25%, Mentee: 25%, Method: 20%, Offer: 20%
export const calculateProgress = (
  preModule: PreModuleData,
  mentor: MentorData,
  mentee: MenteeData,
  method: MethodData,
  offer: OfferData
): number => {
  const stages = [
    { weight: 10, complete: isPreModuleComplete(preModule) },
    { weight: 25, complete: isMentorComplete(mentor) },
    { weight: 25, complete: isMenteeComplete(mentee) },
    { weight: 20, complete: isMethodComplete(method) },
    { weight: 20, complete: isOfferComplete(offer) },
  ];
  return stages.reduce((sum, s) => sum + (s.complete ? s.weight : 0), 0);
};

// At least 1 competitor OR 1 profile link
export const isPreModuleComplete = (data: PreModuleData): boolean => {
  if (!data) return false;
  const hasCompetitor = data.competitors && data.competitors.length > 0;
  const hasProfile = data.profiles && Object.values(data.profiles).some(v => v && v.trim().length > 0);
  return hasCompetitor || hasProfile;
};

// All 5 steps have required fields filled
export const isMentorComplete = (data: MentorData): boolean => {
  if (!data) return false;
  return Boolean(
    data.step1?.explanation &&
    data.step2?.authorityStory &&
    data.step3?.gold && data.step3?.silver && data.step3?.bronze &&
    (data.step4?.testimonials?.length > 0 || data.step4?.startingFromZero) &&
    data.step5?.marketStandard && data.step5?.myDifference
  );
};

// hasClients set + all 6 Hormozi steps + idealClientGeneral
export const isMenteeComplete = (data: MenteeData): boolean => {
  if (!data) return false;
  return Boolean(
    data.hasClients &&
    data.beforeInternal &&
    data.beforeExternal &&
    data.decisionFears &&
    data.decisionTrigger &&
    data.afterExternal &&
    data.afterInternal &&
    data.idealClientGeneral
  );
};

// Unified: maturity + name + promise + 3 items (pillars for structured, steps otherwise)
export const isMethodComplete = (data: MethodData): boolean => {
  if (!data) return false;
  if (!data.maturity || !data.name?.trim() || !data.promise?.trim()) return false;

  if (data.maturity === 'structured') {
    return !!(data.pillars && data.pillars.filter(p => p.what?.trim()).length >= 3);
  }

  // not_yet or in_head
  return !!(data.steps && data.steps.filter(s => s.title?.trim()).length >= 3);
};

// goal + description + at least 1 deliverable + pricing
export const isOfferComplete = (data: OfferData): boolean => {
  if (!data) return false;
  return Boolean(
    data.goal &&
    data.description &&
    data.deliverables && data.deliverables.length > 0 &&
    data.pricing && data.pricing > 0
  );
};

