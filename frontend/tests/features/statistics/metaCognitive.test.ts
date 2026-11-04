import { describe, expect, it } from 'vitest';
import {
  calculateAutonomousScore,
  calibrationScore,
  conceptMasteryScore,
  deliberationScore,
  generateGlobalProfile,
  generateStudyStyleProfile,
  hesitationRatio,
  selectSessions,
  studyStyleScores,
  resilienceScore,
  sessionAccuracy,
  type ExerciseSession,
} from '../../../src/features/statistics/metaCognitive';

function session(overrides: Partial<ExerciseSession> = {}): ExerciseSession {
  return {
    incorrectCount: 0,
    confidence: 0,
    difficulty: 1,
    cheatsUsed: false,
    entryTimes: [],
    incorrectTimes: [],
    cheatActivationTimes: [],
    exitTimes: [],
    reversalTimes: [],
    activeMs: 10 * 60_000,
    completedAt: 0,
    ...overrides,
  };
}

describe('metacognitive profile calculations', () => {
  it('uses one over incorrect validations plus one as accuracy', () => {
    expect(sessionAccuracy(session({ incorrectCount: 3 }))).toBe(0.25);
    expect(conceptMasteryScore(session({ incorrectCount: 3, difficulty: 2 }))).toBeCloseTo(0.225);
  });

  it('skips unset confidence and calibrates set confidence against accuracy', () => {
    expect(calibrationScore(session({ incorrectCount: 1, confidence: 0 }))).toBeNull();
    expect(calibrationScore(session({ incorrectCount: 1, confidence: 3 }))).toBe(1);
  });

  it('counts gaps over twenty seconds per logbook entry', () => {
    expect(deliberationScore(session({ entryTimes: [0, 20_000, 40_000, 60_001] }))).toBe(0.25);
    expect(deliberationScore(session())).toBeNull();
  });

  it('deducts resilience when cheat activation is the next event after an error', () => {
    expect(resilienceScore(session({
      incorrectCount: 1,
      incorrectTimes: [1_000],
      cheatActivationTimes: [2_000],
      entryTimes: [3_000],
    }))).toBe(0.5);
    expect(resilienceScore(session({
      incorrectCount: 1,
      incorrectTimes: [1_000],
      entryTimes: [2_000],
      cheatActivationTimes: [3_000],
    }))).toBe(1);
  });

  it('skips exercises without errors and deducts for an exit within sixty seconds', () => {
    expect(resilienceScore(session({ incorrectCount: 0 }))).toBeNull();
    expect(resilienceScore(session({
      incorrectCount: 1,
      incorrectTimes: [1_000],
      exitTimes: [61_000],
    }))).toBe(0.7);
    expect(resilienceScore(session({
      incorrectCount: 1,
      incorrectTimes: [1_000],
      exitTimes: [61_001],
    }))).toBe(1);
  });

  it('maps cheat rates linearly to autonomy, clamped at zero', () => {
    expect(calculateAutonomousScore(0)).toBe(1);
    expect(calculateAutonomousScore(0.15)).toBe(0.5);
    expect(calculateAutonomousScore(0.3)).toBe(0);
    expect(calculateAutonomousScore(0.5)).toBe(0);
  });

  it('averages available metrics across completed sessions', () => {
    const profile = generateGlobalProfile([
      session({ incorrectCount: 0, confidence: 1, entryTimes: [0], cheatsUsed: false }),
      session({ incorrectCount: 1, confidence: 0, entryTimes: [0, 25_001], cheatsUsed: true }),
    ]);
    expect(profile.calibration).toBe(0);
    expect(profile.deliberation).toBe(0.25);
    expect(profile.autonomous).toBe(0);
  });

  it('smooths hesitation and lowers resilience for backtracking after a failure', () => {
    expect(hesitationRatio(0, 10)).toBe(0);
    expect(hesitationRatio(5, 7)).toBe(1);
    const calm = session({ incorrectCount: 1, entryTimes: [1, 2, 3, 4], incorrectTimes: [0] });
    const backtracking = session({ incorrectCount: 1, entryTimes: [1, 2, 3, 4], incorrectTimes: [0], reversalTimes: [1, 2] });
    expect(resilienceScore(calm)).toBe(1);
    expect(resilienceScore(backtracking)).toBeLessThan(1);
  });

  it('scores study styles from accuracy, cheats, time and hesitation', () => {
    expect(studyStyleScores(session({ activeMs: 0 }))).toBeNull();
    const phantom = studyStyleScores(session({ cheatsUsed: true }))!;
    expect(phantom.phantom).toBe(1);
    expect(phantom.perfectionist).toBe(0);
    const rushed = studyStyleScores(session({ incorrectCount: 3, activeMs: 60_000 }))!;
    expect(rushed.speedDemon).toBeCloseTo(Math.sqrt(0.75 * 0.8), 1);
    const slowPerfect = studyStyleScores(session({ activeMs: 40 * 60_000 }))!;
    expect(slowPerfect.perfectionist).toBeCloseTo(Math.pow(0.5, 1 / 3));
    const stubborn = studyStyleScores(session({ incorrectCount: 4, activeMs: 40 * 60_000 }))!;
    expect(stubborn.stubborn).toBeGreaterThan(0.5);
    expect(studyStyleScores(session({ confidence: 0 }))!.dunningKruger).toBeNull();
    const overconfident = studyStyleScores(session({ confidence: 5, difficulty: 3, incorrectCount: 3 }))!;
    expect(overconfident.dunningKruger).toBeCloseTo(Math.pow(0.75, 1 / 3));
    expect(studyStyleScores(session({ confidence: 1 }))!.hiddenGenius).toBe(1);
  });

  it('averages styles and limits to the most recent sessions', () => {
    const sessions = [session({ completedAt: 1, cheatsUsed: true }), session({ completedAt: 2 })];
    expect(selectSessions(sessions, 1)[0].completedAt).toBe(2);
    expect(generateStudyStyleProfile(sessions).phantom).toBe(0.5);
  });
});
