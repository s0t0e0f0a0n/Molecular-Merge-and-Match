import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseSummary } from '../../../src/api/exercises';
import type { ApiLogbookState } from '../../../src/api/logbook';
import {
  buildAverageTimeDays,
  buildDueDistribution,
  buildExerciseSessions,
  buildLevelPoints,
  buildLogbookDistribution,
  buildRestDurationDistribution,
  buildSRChartDays,
  buildTimeDistribution,
  buildTimeOfDayDistribution,
  buildTimeline,
} from '../../../src/features/statistics/statisticsData';

const dayMs = 24 * 60 * 60 * 1000;

function exercise(overrides: Partial<ExerciseSummary> = {}): ExerciseSummary {
  return {
    id: 1,
    name: 'Exercise',
    exercise_set: 'Set',
    tags: [],
    ...overrides,
  };
}

function logbook(entries: Array<{ kind: string; ts: number | string }>, overrides: Partial<ApiLogbookState> = {}): ApiLogbookState {
  return {
    entries_json: JSON.stringify(entries),
    cursor: 0,
    links_json: '[]',
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('statistics data builders', () => {
  it('builds daily timeline counts through today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 10, 12));
    const days = buildTimeline([
      exercise({ id: 1, difficulty: 'E2', completed_at: new Date(2026, 8, 9, 10).toISOString() }),
      exercise({ id: 2, difficulty: 'M1', started_at: new Date(2026, 8, 10, 9).toISOString(), incorrect_count: 1 }),
    ]);

    expect(days).toHaveLength(7);
    expect(days[5].counts['is-black']).toBe(1);
    expect(days[6].counts['is-red']).toBe(1);
  });

  it('places due exercises in bins spanning overdue and upcoming dates', () => {
    const now = new Date(2026, 8, 10).getTime();
    const bins = buildDueDistribution([
      exercise({ id: 1, due_time: new Date(now - 2 * dayMs).toISOString() }),
      exercise({ id: 2, due_time: new Date(now + 5 * dayMs).toISOString() }),
    ], now);

    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(2);
    expect(bins.some((bin) => bin.count > 0 && bin.startDay < 0)).toBe(true);
    expect(bins.some((bin) => bin.count > 0 && bin.startDay >= 0)).toBe(true);
  });

  it('distributes logbook events across normalized exercise duration', () => {
    const started = Date.UTC(2026, 8, 10);
    const summaries = [exercise({
      started_at: new Date(started).toISOString(),
      completed_at: new Date(started + 60_000).toISOString(),
    })];
    const buckets = buildLogbookDistribution(summaries, {
      '1': [logbook([
        { kind: 'create-fragment', ts: started },
        { kind: 'set-dbe', ts: started + 30_000 },
      ])],
    });

    expect(buckets).toHaveLength(20);
    expect(buckets.reduce((sum, bucket) => sum + bucket.createFragment + bucket.dbe, 0)).toBe(2);
  });

  it('builds cumulative spaced-repetition history for each date in the range', () => {
    const today = new Date(2026, 8, 10, 12);
    const days = buildSRChartDays([
      { date: '2026-09-09', new: 1, learning: 2, relearning: 0, young: 1, mature: 0, total: 4 },
      { date: '2026-09-10', new: 0, learning: 1, relearning: 0, young: 2, mature: 1, total: 4 },
    ], 2, today);

    expect(days).toHaveLength(3);
    expect(days[1].total).toBe(4);
    expect(days[2].cumulativeTotal).toBe(8);
  });

  it('bins completed exercise time by difficulty', () => {
    const buckets = buildTimeDistribution([
      exercise({ difficulty: 'E1', timer_total: 600, completed_at: '2026-09-10' }),
      exercise({ id: 2, difficulty: 'M1', timer_total: 900, completed_at: '2026-09-10' }),
      exercise({ id: 3, difficulty: 'D1', timer_total: 1_000 }),
    ]);

    expect(buckets).toHaveLength(30);
    expect(buckets[19].easy).toBe(1);
    expect(buckets[29].medium).toBe(1);
    expect(buckets.reduce((sum, bucket) => sum + bucket.difficult, 0)).toBe(0);
  });

  it('extracts rest-duration bins from gaps between logbook entries', () => {
    const started = Date.UTC(2026, 8, 10);
    const buckets = buildRestDurationDistribution([
      exercise({
        difficulty: 'D1',
        started_at: new Date(started).toISOString(),
        completed_at: new Date(started + 180_000).toISOString(),
      }),
    ], {
      '1': [logbook([
        { kind: 'create-fragment', ts: started },
        { kind: 'link', ts: started + 90_000 },
      ])],
    });

    expect(buckets[2].difficult).toBe(1);
    expect(buckets.reduce((sum, bucket) => sum + bucket.easy + bucket.medium + bucket.difficult, 0)).toBe(1);
  });

  it('builds behavior sessions from completed attempts and logbook events', () => {
    const started = Date.UTC(2026, 8, 10);
    const summary = exercise({
      difficulty: 'M2',
      has_statistics: true,
      started_at: new Date(started).toISOString(),
      completed_at: new Date(started + 120_000).toISOString(),
      incorrect_count: 1,
    });
    const sessions = buildExerciseSessions(
      [summary],
      { '1': [logbook([{ kind: 'create-fragment', ts: started + 10_000 }])] },
      [{ exercise_id: '1', occurred_at: new Date(started + 20_000).toISOString(), event_type: 'incorrect-validation' }],
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ difficulty: 2, incorrectCount: 1, activeMs: 120_000 });
    expect(sessions[0].incorrectTimes).toEqual([started + 20_000]);
  });

  it('bins active logbook time by local time of day', () => {
    const start = new Date(2026, 8, 10, 12).getTime();
    const buckets = buildTimeOfDayDistribution(
      [exercise({ difficulty: 'E1' })],
      { '1': [logbook([], { restarts: JSON.stringify([{ start, stop: start + 30 * 60_000 }]) })] },
    );

    expect(buckets).toHaveLength(96);
    expect(buckets[48].easy).toBe(900);
    expect(buckets[49].easy).toBe(900);
  });

  it('calculates daily average exercise times', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 10, 12));
    const days = buildAverageTimeDays([
      exercise({ timer_total: 60, completed_at: new Date(2026, 8, 10, 8).toISOString() }),
      exercise({ id: 2, timer_total: 120, completed_at: new Date(2026, 8, 10, 9).toISOString() }),
    ]);

    expect(days.at(-1)).toMatchObject({ averageSeconds: 90, exerciseCount: 2 });
  });

  it('builds timed exercise points for matching levels', () => {
    const levels = buildLevelPoints([
      exercise({ difficulty: 'E2', timer_total: 120, tags: ['level 2'] }),
      exercise({ id: 2, difficulty: 'M1', timer_total: 90, statistics_tags: ['Level 2'] }),
      exercise({ id: 3, difficulty: 'D1', timer_total: 60, tags: ['level 7'] }),
    ]);

    expect(levels[2]).toHaveLength(2);
    expect(levels[2].map(({ difficulty }) => difficulty)).toEqual(['easy', 'medium']);
    expect(levels[0]).toEqual([]);
  });
});
