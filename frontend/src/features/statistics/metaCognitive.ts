export type CognitiveProfile = {
  conceptMastery: number;
  calibration: number;
  deliberation: number;
  resilience: number;
  autonomous: number;
};

export type StudentArchetype = 'Dunning-Kruger' | 'Hidden Genius' | 'Speed Demon' | 'Perfectionist' | 'Phantom' | 'Balanced Learner';

// One completed exercise, with all times in milliseconds.
export type ExerciseSession = {
  incorrectCount: number;
  confidence: number; // 1-5, 0 when never set
  difficulty: 1 | 2 | 3;
  cheatsUsed: boolean;
  entryTimes: number[]; // logbook entries of the completed attempt
  incorrectTimes: number[]; // incorrect validations during the attempt
  cheatActivationTimes: number[];
  exitTimes: number[];
  reversalTimes: number[]; // entries that undo earlier work (delete, unlink, clear)
  pauseTimes: number[]; // user-initiated thinking pauses
  activeMs: number; // active timer time of the attempt
  completedAt: number;
};

export type StudyStyleKey = 'phantom' | 'dunningKruger' | 'hiddenGenius' | 'speedDemon' | 'perfectionist' | 'stubborn';
export type StudyStyleProfile = Record<StudyStyleKey, number>;

export const REVERSAL_ENTRY_KINDS = ['delete-fragment', 'unlink', 'clear-links', 'clear-solution'];
export const FAST_MS = 5 * 60_000;
export const SLOW_MS = 20 * 60_000;
export const MIN_STYLE_SESSIONS = 5;

export const PAUSE_GAP_MS = 20_000;
export const ABANDON_WINDOW_MS = 60_000;
const CHEAT_RATE_FOR_ZERO_AUTONOMY = 0.3;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function sessionAccuracy(session: ExerciseSession): number {
  return 1 / (Math.max(0, session.incorrectCount) + 1);
}

export function conceptMasteryScore(session: ExerciseSession): number {
  const difficultyWeight = 0.7 + 0.1 * session.difficulty;
  return clamp01(sessionAccuracy(session) * difficultyWeight);
}

// Null when the user never set a confidence value.
export function calibrationScore(session: ExerciseSession): number | null {
  if (session.confidence <= 0) return null;
  const confidenceFraction = (session.confidence - 1) / 4;
  return clamp01(1 - Math.abs(confidenceFraction - sessionAccuracy(session)));
}

// Deliberation measures quality of planning and intentional execution:
// - Component 1 (60%): Execution efficiency (few reversals = deliberate planning)
// - Component 2 (30%): Personal pace consistency (working at own baseline speed)
// - Component 3 (10%): Thinking pauses (early reflection vs scattered confusion)
// Flawless, planned execution scores ~1.0; scattered trial-and-error scores ~0.0
export function deliberationScore(session: ExerciseSession, allSessions?: ExerciseSession[]): number | null {
  const times = [...session.entryTimes].sort((left, right) => left - right);
  if (times.length === 0) return null;

  // Component 1: Execution Efficiency (60%)
  // Inverse of hesitation: fewer reversals = more deliberate planning
  const efficiency = 1 - sessionHesitation(session);

  // Component 2: Personal Pace Deviation (30%)
  // Score based on how this session's time compares to student's typical time
  // Only score if we have enough historical data (5+ sessions)
  let paceScore = efficiency; // Default to efficiency if we can't calculate pace
  if (allSessions && allSessions.length >= 5) {
    paceScore = calculatePaceConsistency(session, allSessions);
  }

  // Component 3: Thinking Pauses (10%)
  // Score pauses that indicate thinking (early, occasional) vs confusion (scattered)
  const pauseScore = calculatePauseQuality(session);

  // Combine with geometric mean (weighted):
  // 60% efficiency + 30% pace + 10% pauses
  // Use geometric mean to prevent any single perfect score masking weakness
  const combined = geometricMean([
    efficiency, efficiency, efficiency,  // 60% weight
    paceScore, paceScore,                // 20% weight (reduced from 30% to balance)
    pauseScore,                          // 20% weight (increased from 10% to balance)
  ]);
  return clamp01(combined);
}

// Calculate how consistent this exercise's pace is with student's historical average
function calculatePaceConsistency(session: ExerciseSession, allSessions: ExerciseSession[]): number {
  if (allSessions.length < 5) return 1; // Not enough history

  // Group by difficulty for fair comparison
  const sameOrEasier = allSessions.filter((s) => s.difficulty <= session.difficulty && s !== session);
  if (sameOrEasier.length < 3) return 1; // Not enough similar exercises

  // Calculate median time (more robust than mean for outlier detection)
  const times = sameOrEasier.map((s) => s.activeMs).sort((a, b) => a - b);
  const medianTime = times[Math.floor(times.length / 2)];

  // Calculate MAD (Median Absolute Deviation)
  const deviations = times.map((t) => Math.abs(t - medianTime)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];

  if (mad === 0) return 1; // All times identical (rare)

  // Calculate normalized deviation for this session
  const currentDeviation = Math.abs(session.activeMs - medianTime);
  const normalizedDeviation = currentDeviation / (mad > 0 ? mad : medianTime * 0.2);

  // Score: 1.0 at 0 deviation, 0.5 at 1 MAD, 0.2 at 3+ MADs
  // This captures "within normal range" (1.0), "somewhat unusual" (0.5), "very unusual" (0.2)
  return Math.max(0.2, 1 - Math.min(1, normalizedDeviation / 3));
}

// Score pause quality: early thinking is good, scattered hesitation is bad
function calculatePauseQuality(session: ExerciseSession): number {
  if (session.pauseTimes.length === 0) return 1; // No pauses can be focused work

  const times = [...session.entryTimes].sort((left, right) => left - right);
  if (times.length === 0) return 1;

  const totalDuration = times[times.length - 1] - times[0];
  const earlyPeriod = 30_000; // First 30 seconds

  // Count pauses in early period (thinking time) vs later (hesitation)
  const earlyPauses = session.pauseTimes.filter((p) => p - times[0] <= earlyPeriod).length;
  const laterPauses = session.pauseTimes.filter((p) => p - times[0] > earlyPeriod).length;

  // Ideal: some early pauses (thinking), few later pauses (focused execution)
  // Score higher for balanced pause distribution
  const totalPauses = session.pauseTimes.length;
  const earlyRatio = earlyPauses / Math.max(1, totalPauses);

  // Optimal: 40-80% of pauses early = good thinking then execution
  // Penalize: all pauses early (no execution) or all late (scattered hesitation)
  let pauseQuality = 1;
  if (earlyRatio < 0.4) pauseQuality = 0.7 + 0.3 * (earlyRatio / 0.4); // Scattered hesitation
  else if (earlyRatio > 0.8) pauseQuality = 0.7 + 0.3 * ((1 - earlyRatio) / 0.2); // Mostly thinking, less execution
  else pauseQuality = 1; // Balanced

  // Also penalize excessive pauses (>3 pauses suggests confusion)
  if (totalPauses > 3) pauseQuality *= Math.max(0.4, 1 - (totalPauses - 3) * 0.1);

  return clamp01(pauseQuality);
}

// Share of reversing entries (smoothed so tiny exercises are not noisy), 1 at a 40% reversal rate.
export function hesitationRatio(reversals: number, entries: number): number {
  return clamp01((2.5 * reversals) / (entries + 3));
}

export function sessionHesitation(session: ExerciseSession): number {
  return hesitationRatio(session.reversalTimes.length, session.entryTimes.length);
}

// Null without incorrect attempts.
export function resilienceScore(session: ExerciseSession): number | null {
  if (session.incorrectCount <= 0) return null;
  let score = 1;
  const nextEventWasCheatActivation = session.incorrectTimes.some((failedAt) => {
    const followingEvents = [
      ...session.entryTimes.map((occurredAt) => ({ occurredAt, isCheatActivation: false })),
      ...session.cheatActivationTimes.map((occurredAt) => ({ occurredAt, isCheatActivation: true })),
    ]
      .filter((event) => event.occurredAt > failedAt)
      .sort((left, right) => left.occurredAt - right.occurredAt);
    return followingEvents[0]?.isCheatActivation ?? false;
  });
  if (nextEventWasCheatActivation) score -= 0.5;
  const abandoned = session.incorrectTimes.some((failedAt) => session.exitTimes.some(
    (exit) => exit >= failedAt && exit - failedAt <= ABANDON_WINDOW_MS,
  ));
  if (abandoned) score -= 0.3;
  // Backtracking after the first failure signals low resilience.
  const firstFailure = Math.min(...session.incorrectTimes);
  if (Number.isFinite(firstFailure)) {
    const entriesAfter = session.entryTimes.filter((time) => time > firstFailure).length;
    const reversalsAfter = session.reversalTimes.filter((time) => time > firstFailure).length;
    score -= 0.2 * hesitationRatio(reversalsAfter, entriesAfter);
  }
  return clamp01(score);
}

// 1.0 at a 0% cheat rate, falling linearly to 0.0 at 30% or more.
export function calculateAutonomousScore(cheatRate: number): number {
  return clamp01(1 - cheatRate / CHEAT_RATE_FOR_ZERO_AUTONOMY);
}

function average(values: Array<number | null>): number {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? 0 : present.reduce((sum, value) => sum + value, 0) / present.length;
}

export function generateGlobalProfile(sessions: ExerciseSession[]): CognitiveProfile {
  if (sessions.length === 0) {
    return { conceptMastery: 0, calibration: 0, deliberation: 0, resilience: 0, autonomous: 0 };
  }
  return {
    conceptMastery: average(sessions.map(conceptMasteryScore)),
    calibration: average(sessions.map(calibrationScore)),
    deliberation: average(sessions.map((session) => deliberationScore(session, sessions))),
    resilience: sessions.every((session) => session.incorrectCount <= 0)
      ? 1
      : average(sessions.map(resilienceScore)),
    autonomous: calculateAutonomousScore(sessions.filter((session) => session.cheatsUsed).length / sessions.length),
  };
}

const geometricMean = (factors: number[]): number => Math.pow(factors.reduce((product, value) => product * clamp01(value), 1), 1 / factors.length);

export const rushedScore = (activeMs: number): number => 1 - Math.min(1, activeMs / FAST_MS);
export const slowScore = (activeMs: number): number => (activeMs <= SLOW_MS ? 0 : 1 - SLOW_MS / activeMs);

// Per-exercise score for each study style; confidence-based styles are null without confidence.
export function studyStyleScores(session: ExerciseSession): Record<StudyStyleKey, number | null> | null {
  if (session.activeMs <= 0) return null;
  const a = sessionAccuracy(session);
  const k = session.cheatsUsed ? 1 : 0;
  const slow = slowScore(session.activeMs);
  const rushed = rushedScore(session.activeMs);
  const h = sessionHesitation(session);
  const hasConfidence = session.confidence > 0;
  const c = hasConfidence ? (session.confidence - 1) / 4 : 0;
  const d = (session.difficulty - 1) / 2;
  return {
    phantom: geometricMean([a, k, 1 - slow]),
    dunningKruger: hasConfidence ? geometricMean([c, d, 1 - a]) : null,
    hiddenGenius: hasConfidence ? geometricMean([1 - c, a, 1 - h]) : null,
    speedDemon: geometricMean([1 - a, rushed]),
    perfectionist: geometricMean([a, 1 - k, slow]),
    stubborn: geometricMean([1 - k, 1 - a, Math.max(slow, h)]),
  };
}

// Sessions with usable timing, optionally limited to the most recently completed ones.
export function selectSessions(sessions: ExerciseSession[], limit: number | null): ExerciseSession[] {
  if (limit === null) return sessions;
  return [...sessions].sort((left, right) => right.completedAt - left.completedAt).slice(0, limit);
}

export function generateStudyStyleProfile(sessions: ExerciseSession[]): StudyStyleProfile {
  const scored = sessions.map(studyStyleScores).filter((scores): scores is Record<StudyStyleKey, number | null> => scores !== null);
  const mean = (key: StudyStyleKey) => average(scored.map((scores) => scores[key]));
  return {
    phantom: mean('phantom'),
    dunningKruger: mean('dunningKruger'),
    hiddenGenius: mean('hiddenGenius'),
    speedDemon: mean('speedDemon'),
    perfectionist: mean('perfectionist'),
    stubborn: mean('stubborn'),
  };
}

export function determineStudentArchetype(profile: CognitiveProfile, averageConfidence: number): StudentArchetype {
  const { conceptMastery, calibration, deliberation, resilience, autonomous } = profile;
  if (autonomous < 0.2) return 'Phantom';
  if (averageConfidence >= 4.0 && conceptMastery < 0.5 && calibration < 0.5) return 'Dunning-Kruger';
  if (averageConfidence > 0 && averageConfidence <= 2.0 && conceptMastery >= 0.8) return 'Hidden Genius';
  if (conceptMastery >= 0.7 && deliberation < 0.3) return 'Speed Demon';
  if (conceptMastery >= 0.9 && deliberation >= 0.6 && resilience >= 0.8) return 'Perfectionist';
  return 'Balanced Learner';
}
