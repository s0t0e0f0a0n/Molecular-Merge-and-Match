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
    pauseTimes: [],
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

  it('measures execution efficiency and thinking pauses', () => {
    // Flawless work: no reversals, normal time, some pauses = high deliberation
    const flawless = deliberationScore(session({
      entryTimes: [0, 1_000, 2_000, 3_000],
      reversalTimes: [],
      pauseTimes: [500], // Some early thinking
    }));
    expect(flawless).not.toBeNull();
    expect(flawless).toBeGreaterThan(0.9);

    // No entries returns null
    expect(deliberationScore(session())).toBeNull();

    // With reversals: lower deliberation (trial-and-error)
    const withReversals = deliberationScore(session({
      entryTimes: [0, 1_000, 2_000, 3_000],
      reversalTimes: [500, 1_500], // Multiple reversals
    }));
    expect(withReversals).not.toBeNull();
    expect(withReversals).toBeLessThan(0.7);
  });

  it('scores flawless execution with high deliberation', () => {
    // Perfect execution: correct answer, no errors, no reversals, thinking pauses
    const flawless = deliberationScore(session({
      incorrectCount: 0,
      entryTimes: [0, 2_000, 4_000, 6_000],
      reversalTimes: [], // No trial-and-error
      pauseTimes: [1_000], // Early thinking
      activeMs: 6_000,
      difficulty: 1,
    }));
    expect(flawless).not.toBeNull();
    expect(flawless).toBeGreaterThan(0.9); // Should score very high
  });

  it('scores scattered work with low deliberation', () => {
    // Scattered execution: many reversals, excessive pauses, lots of edits
    const scattered = deliberationScore(session({
      entryTimes: [0, 1_000, 2_000, 3_000, 4_000, 5_000],
      reversalTimes: [500, 1_500, 2_500, 3_500], // 4 out of 6 are reversals
      pauseTimes: [100, 200, 300, 400, 500], // Many pauses scattered throughout
      activeMs: 5_000,
      difficulty: 1,
    }));
    expect(scattered).not.toBeNull();
    expect(scattered).toBeLessThan(0.6); // Should score lower for wasted motion
  });

  it('scores rushed execution with varying deliberation based on correctness', () => {
    // Quick but correct: no reversals, efficient
    const quickAndCorrect = deliberationScore(session({
      incorrectCount: 0, // Correct answer
      entryTimes: [0, 500, 1_000],
      reversalTimes: [],
      pauseTimes: [], // No pauses = no thinking time
      activeMs: 1_000, // Very fast
      difficulty: 1,
    }));
    expect(quickAndCorrect).not.toBeNull();
    expect(quickAndCorrect).toBeCloseTo(1.0); // Perfect - knew exactly what to do

    // Quick but wrong: reversals needed
    const quickAndWrong = deliberationScore(session({
      incorrectCount: 1, // Got it wrong initially
      entryTimes: [0, 500, 1_000],
      reversalTimes: [250], // Had to undo
      pauseTimes: [], // No pauses
      activeMs: 1_000,
      difficulty: 1,
    }));
    expect(quickAndWrong).not.toBeNull();
    expect(quickAndCorrect).not.toBeNull();
    expect(quickAndWrong).toBeLessThan(quickAndCorrect!); // Worse because of reversal
  });

  it('personal pace consistency affects deliberation score', () => {
    // When provided with historical sessions, considers personal baseline
    const historical = [
      session({ activeMs: 30_000, entryTimes: [0, 10_000, 20_000] }), // Normal: 30s
      session({ activeMs: 32_000, entryTimes: [0, 10_000, 20_000] }), // Normal: 32s
      session({ activeMs: 31_000, entryTimes: [0, 10_000, 20_000] }), // Normal: 31s
      session({ activeMs: 29_000, entryTimes: [0, 10_000, 20_000] }), // Normal: 29s
      session({ activeMs: 30_500, entryTimes: [0, 10_000, 20_000] }), // Normal: 30.5s
    ];

    // Session within normal range
    const normal = deliberationScore(
      session({ activeMs: 30_000, entryTimes: [0, 10_000, 20_000], reversalTimes: [] }),
      historical
    );

    // Session way outside normal range
    const outlier = deliberationScore(
      session({ activeMs: 120_000, entryTimes: [0, 10_000, 20_000], reversalTimes: [] }), // 4x longer
      historical
    );

    expect(normal).not.toBeNull();
    expect(outlier).not.toBeNull();
    if (normal !== null && outlier !== null) {
      expect(normal).toBeGreaterThan(outlier); // Normal should score higher
    }
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
      session({ incorrectCount: 0, confidence: 1, entryTimes: [0], cheatsUsed: false, reversalTimes: [], pauseTimes: [] }),
      session({ incorrectCount: 1, confidence: 0, entryTimes: [0, 25_001], cheatsUsed: true, reversalTimes: [], pauseTimes: [] }),
    ]);
    expect(profile.calibration).toBe(0);
    // Flawless session: high deliberation; session with reversals: lower
    // First has no reversals (efficiency=1), second has none too (0 reversals out of 2 entries)
    // So both should have high efficiency scores
    expect(profile.deliberation).toBeGreaterThan(0.5);
    expect(profile.autonomous).toBe(0);
  });

  it('defaults resilience to 100% only when all included exercises are error-free', () => {
    expect(generateGlobalProfile([]).resilience).toBe(0);
    expect(generateGlobalProfile([session(), session()]).resilience).toBe(1);
    expect(generateGlobalProfile([
      session(),
      session({ incorrectCount: 1, incorrectTimes: [1_000], cheatActivationTimes: [2_000] }),
    ]).resilience).toBe(0.5);
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
