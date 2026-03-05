import {
  calculateProgress,
  isPreModuleComplete,
  isMentorComplete,
  isMenteeComplete,
  isMethodComplete,
  isOfferComplete,
} from '../../utils/progress';

describe('progress utilities', () => {
  // ─── isPreModuleComplete ───────────────────────────────────────────

  describe('isPreModuleComplete', () => {
    it('returns false for null/undefined input', () => {
      expect(isPreModuleComplete(null as any)).toBe(false);
      expect(isPreModuleComplete(undefined as any)).toBe(false);
    });

    it('returns falsy for empty object', () => {
      expect(isPreModuleComplete({} as any)).toBeFalsy();
    });

    it('returns true if competitors array has entries', () => {
      const data = { competitors: ['CompetitorA'], profiles: {} } as any;
      expect(isPreModuleComplete(data)).toBe(true);
    });

    it('returns true if any profiles field has a value', () => {
      const data = { competitors: [], profiles: { instagram: '@test' } } as any;
      expect(isPreModuleComplete(data)).toBe(true);
    });

    it('returns false if competitors is empty and profiles are empty', () => {
      const data = { competitors: [], profiles: {} } as any;
      expect(isPreModuleComplete(data)).toBe(false);
    });

    it('returns false if profiles has only empty strings', () => {
      const data = { competitors: [], profiles: { website: '', instagram: '  ' } } as any;
      expect(isPreModuleComplete(data)).toBe(false);
    });
  });

  // ─── isMentorComplete ─────────────────────────────────────────────

  describe('isMentorComplete', () => {
    const completeMentor = {
      step1: { explanation: 'I help people' },
      step2: { authorityStory: 'My story' },
      step3: { gold: 'gold', silver: 'silver', bronze: 'bronze' },
      step4: { testimonials: [{ id: '1', clientName: 'Test', result: 'Good' }] },
      step5: { marketStandard: 'standard', myDifference: 'difference' },
    };

    it('returns false for null/undefined', () => {
      expect(isMentorComplete(null as any)).toBe(false);
      expect(isMentorComplete(undefined as any)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isMentorComplete({} as any)).toBe(false);
    });

    it('returns false if only step1 is filled', () => {
      expect(isMentorComplete({ step1: { explanation: 'text' } } as any)).toBe(false);
    });

    it('returns false if step3 packages missing', () => {
      expect(isMentorComplete({ ...completeMentor, step3: {} } as any)).toBe(false);
    });

    it('returns false if step4 has no testimonials and no startingFromZero', () => {
      expect(isMentorComplete({ ...completeMentor, step4: {} } as any)).toBe(false);
    });

    it('returns true when all steps filled with testimonials', () => {
      expect(isMentorComplete(completeMentor as any)).toBe(true);
    });

    it('returns true when step4 uses startingFromZero', () => {
      expect(isMentorComplete({
        ...completeMentor,
        step4: { startingFromZero: true, testimonials: [] },
      } as any)).toBe(true);
    });

    it('returns false if step5 missing myDifference', () => {
      expect(isMentorComplete({
        ...completeMentor,
        step5: { marketStandard: 'standard' },
      } as any)).toBe(false);
    });
  });

  // ─── isMenteeComplete ─────────────────────────────────────────────

  describe('isMenteeComplete', () => {
    const completeMentee = {
      hasClients: 'yes',
      beforeInternal: 'frustrated',
      beforeExternal: 'struggling',
      decisionFears: 'fear',
      decisionTrigger: 'crisis',
      afterExternal: 'successful',
      afterInternal: 'confident',
      idealClientGeneral: 'entrepreneurs',
    };

    it('returns false for null/undefined', () => {
      expect(isMenteeComplete(null as any)).toBe(false);
      expect(isMenteeComplete(undefined as any)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isMenteeComplete({} as any)).toBe(false);
    });

    it('returns false when only some fields filled', () => {
      expect(isMenteeComplete({ hasClients: 'yes', beforeInternal: 'x' } as any)).toBe(false);
    });

    it('returns true when ALL required fields filled', () => {
      expect(isMenteeComplete(completeMentee as any)).toBe(true);
    });

    it('returns false if idealClientGeneral is empty', () => {
      expect(isMenteeComplete({ ...completeMentee, idealClientGeneral: '' } as any)).toBe(false);
    });
  });

  // ─── isMethodComplete ─────────────────────────────────────────────

  describe('isMethodComplete', () => {
    it('returns false for null/undefined', () => {
      expect(isMethodComplete(null as any)).toBe(false);
      expect(isMethodComplete(undefined as any)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isMethodComplete({} as any)).toBe(false);
    });

    it('returns false if maturity/name/promise missing', () => {
      expect(isMethodComplete({ maturity: 'structured' } as any)).toBe(false);
      expect(isMethodComplete({ name: 'Method' } as any)).toBe(false);
    });

    it('returns true for structured method with 3+ pillars (what field)', () => {
      expect(isMethodComplete({
        maturity: 'structured',
        name: 'My Method',
        promise: 'Transform your life',
        pillars: [
          { id: '1', what: 'Pillar 1', why: 'w', how: 'h' },
          { id: '2', what: 'Pillar 2', why: 'w', how: 'h' },
          { id: '3', what: 'Pillar 3', why: 'w', how: 'h' },
        ],
      } as any)).toBe(true);
    });

    it('returns false for structured with <3 pillars', () => {
      expect(isMethodComplete({
        maturity: 'structured',
        name: 'Method',
        promise: 'Transform',
        pillars: [{ id: '1', what: 'P1', why: 'w', how: 'h' }],
      } as any)).toBe(false);
    });

    it('returns true for not_yet with 3+ steps (title field)', () => {
      expect(isMethodComplete({
        maturity: 'not_yet',
        name: 'Approach',
        promise: 'Help',
        steps: [
          { id: '1', title: 'Step 1', description: 'd' },
          { id: '2', title: 'Step 2', description: 'd' },
          { id: '3', title: 'Step 3', description: 'd' },
        ],
      } as any)).toBe(true);
    });

    it('returns false for not_yet with <3 steps', () => {
      expect(isMethodComplete({
        maturity: 'not_yet',
        name: 'Approach',
        promise: 'Help',
        steps: [{ id: '1', title: 'S1', description: 'd' }],
      } as any)).toBe(false);
    });
  });

  // ─── isOfferComplete ──────────────────────────────────────────────

  describe('isOfferComplete', () => {
    it('returns false for null/undefined', () => {
      expect(isOfferComplete(null as any)).toBe(false);
      expect(isOfferComplete(undefined as any)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isOfferComplete({} as any)).toBe(false);
    });

    it('returns false if deliverables empty', () => {
      expect(isOfferComplete({
        goal: 'mls', description: 'great', deliverables: [], pricing: 1000,
      } as any)).toBe(false);
    });

    it('returns false if pricing is 0', () => {
      expect(isOfferComplete({
        goal: 'mls', description: 'great', deliverables: [{ id: '1', name: 'x', frequency: 'w' }], pricing: 0,
      } as any)).toBe(false);
    });

    it('returns true when all fields set', () => {
      expect(isOfferComplete({
        goal: 'mls', description: 'great',
        deliverables: [{ id: '1', name: 'x', frequency: 'weekly' }],
        pricing: 2500,
      } as any)).toBe(true);
    });

    it('returns false if goal is empty string', () => {
      expect(isOfferComplete({
        goal: '', description: 'great',
        deliverables: [{ id: '1', name: 'x', frequency: 'w' }], pricing: 100,
      } as any)).toBe(false);
    });
  });

  // ─── calculateProgress (5 separate arguments) ─────────────────────

  describe('calculateProgress', () => {
    const emptyPre = {} as any;
    const emptyMentor = {} as any;
    const emptyMentee = {} as any;
    const emptyMethod = {} as any;
    const emptyOffer = {} as any;

    const completePre = { competitors: ['A'], profiles: {} } as any;
    const completeMentor = {
      step1: { explanation: 'text' },
      step2: { authorityStory: 'story' },
      step3: { gold: 'g', silver: 's', bronze: 'b' },
      step4: { testimonials: [{ id: '1', clientName: 'c', result: 'r' }] },
      step5: { marketStandard: 'std', myDifference: 'diff' },
    } as any;
    const completeMentee = {
      hasClients: 'yes', beforeInternal: 'a', beforeExternal: 'b',
      decisionFears: 'c', decisionTrigger: 'd',
      afterExternal: 'e', afterInternal: 'f', idealClientGeneral: 'g',
    } as any;
    const completeMethod = {
      maturity: 'structured', name: 'M', promise: 'P',
      pillars: [
        { id: '1', what: 'A', why: 'w', how: 'h' },
        { id: '2', what: 'B', why: 'w', how: 'h' },
        { id: '3', what: 'C', why: 'w', how: 'h' },
      ],
    } as any;
    const completeOffer = {
      goal: 'mls', description: 'x',
      deliverables: [{ id: '1', name: 'x', frequency: 'w' }],
      pricing: 1000,
    } as any;

    it('returns 0 for all null', () => {
      expect(calculateProgress(null as any, null as any, null as any, null as any, null as any)).toBe(0);
    });

    it('returns 0 for all empty', () => {
      expect(calculateProgress(emptyPre, emptyMentor, emptyMentee, emptyMethod, emptyOffer)).toBe(0);
    });

    it('returns 10 when only preModule complete', () => {
      expect(calculateProgress(completePre, emptyMentor, emptyMentee, emptyMethod, emptyOffer)).toBe(10);
    });

    it('returns 35 when preModule + mentor complete', () => {
      expect(calculateProgress(completePre, completeMentor, emptyMentee, emptyMethod, emptyOffer)).toBe(35);
    });

    it('returns 100 when all complete', () => {
      expect(calculateProgress(completePre, completeMentor, completeMentee, completeMethod, completeOffer)).toBe(100);
    });

    it('returns 35 for preModule + mentee only', () => {
      expect(calculateProgress(completePre, emptyMentor, completeMentee, emptyMethod, emptyOffer)).toBe(35);
    });
  });
});
