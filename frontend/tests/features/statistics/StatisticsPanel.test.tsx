import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatisticsPanel } from '../../../src/features/statistics/StatisticsPanel';
import { resetExercises } from '../../../src/api/reset';
import { fetchAllLogbooks } from '../../../src/api/logbook';

vi.mock('../../../src/api/reset', () => ({
  resetExercises: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/api/logbook', () => ({
  fetchAllLogbooks: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../src/api/tags', () => ({
  fetchTags: vi.fn().mockResolvedValue([
    { id: 1, tag_name: 'important', progression_use: true },
    { id: 2, tag_name: 'review', progression_use: true },
    { id: 3, tag_name: 'hidden-tag', progression_use: true },
  ]),
}));

const summaries = [
  { id: 1, name: 'One', exercise_set: 'set-a', tags: ['important'], difficulty: 'E1', started_at: '2026-09-10T00:00:00', completed_at: '2026-09-10T01:00:00' },
  { id: 2, name: 'Two', exercise_set: 'set-b', tags: ['review'], difficulty: 'M2', started_at: '2026-09-11T00:00:00', completed_at: '2026-09-11T01:00:00' },
  { id: 3, name: 'Three', exercise_set: 'set-a', tags: ['important'], difficulty: 'D1', started_at: '2026-09-12T00:00:00', completed_at: '2026-09-12T01:00:00' },
  { id: 4, name: 'Four', exercise_set: 'set-c', tags: [], difficulty: 'E0', started_at: '2026-08-01T00:00:00', completed_at: '2026-08-01T01:00:00' },
  { id: 5, name: 'Five', exercise_set: 'set-b', tags: ['important'], difficulty: 'E2', started_at: '2026-09-09T00:00:00', completed_at: '2026-09-09T01:00:00' },
];

function renderResetPanel() {
  return render(
    <StatisticsPanel
      isOpen
      onClose={() => undefined}
      exerciseSummaries={summaries}
      selectedExerciseId={2}
    />,
  );
}

const levels = ['logbook', 'workspace', 'completion', 'progression', 'exercise'] as const;

type User = ReturnType<typeof userEvent.setup>;

type ResetRow = {
  label: string;
  buttonIndex: number;
  ids: number[];
  setup?: (user: User) => Promise<void>;
};

const rows: ResetRow[] = [
  { label: 'Reset level for current exercise', buttonIndex: 0, ids: [2] },
  { label: 'Reset level for exercise set', buttonIndex: 1, ids: [1, 3], setup: async (user) => { await user.selectOptions(screen.getByLabelText('Exercise set'), 'set-a'); } },
  { label: 'Reset level for tag', buttonIndex: 2, ids: [1, 3, 5], setup: async (user) => { await user.selectOptions(screen.getByLabelText('Tag'), 'important'); } },
  { label: 'Reset level for age range', buttonIndex: 3, ids: [1, 2, 3, 5], setup: async (user) => { await user.type(screen.getByLabelText('Youngest age in days'), '1'); await user.type(screen.getByLabelText('Oldest age in days'), '10'); } },
  { label: 'Reset level for difficulty', buttonIndex: 4, ids: [1, 4, 5], setup: async (user) => { await user.selectOptions(screen.getByLabelText('Difficulty'), 'E'); } },
  { label: 'Reset level for all exercises', buttonIndex: 5, ids: [1, 2, 3, 4, 5] },
];

describe('Statistics reset controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-09-13T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps each reset-level dropdown independent', async () => {
    const user = userEvent.setup();
    renderResetPanel();
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    const selectors = rows.map((row) => screen.getByLabelText(row.label));
    await user.selectOptions(selectors[0], 'workspace');
    expect((selectors[0] as HTMLSelectElement).value).toBe('workspace');
    expect(selectors.slice(1).every((selector) => (selector as HTMLSelectElement).value === '')).toBe(true);
  });

  it('covers all five reset levels for every reset target', async () => {
    for (const row of rows) {
      for (const level of levels) {
        const user = userEvent.setup();
        const { unmount } = renderResetPanel();
        await user.click(screen.getByRole('button', { name: 'Reset' }));
        if (row.setup) await row.setup(user);
        const selector = screen.getByLabelText(row.label);
        await user.selectOptions(selector, level);
        await user.click(screen.getAllByRole('button', { name: 'Reset!' })[row.buttonIndex]);
        await user.click(screen.getByRole('button', { name: 'Proceed' }));
        await waitFor(() => expect(resetExercises).toHaveBeenCalledWith(row.ids, level));
        unmount();
        cleanup();
        vi.mocked(resetExercises).mockClear();
      }
    }
  }, 30000);

  it('keeps all Reset! buttons inactive until their own level is selected', async () => {
    const user = userEvent.setup();
    renderResetPanel();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getAllByRole('button', { name: 'Reset!' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);

    await user.selectOptions(screen.getByLabelText('Reset level for tag'), 'logbook');
    expect(screen.getAllByRole('button', { name: 'Reset!' }).filter((button) => !(button as HTMLButtonElement).disabled)).toHaveLength(1);
  });

  it('does not reset when confirmation is cancelled', async () => {
    const user = userEvent.setup();
    renderResetPanel();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await user.selectOptions(screen.getByLabelText('Reset level for current exercise'), 'logbook');
    await user.click(screen.getAllByRole('button', { name: 'Reset!' })[0]);
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(resetExercises).not.toHaveBeenCalled();
  });
});

describe('Statistics tag progression', () => {
  it('counts hidden assigned tags without exposing them in the regular tag list', async () => {
    render(
      <StatisticsPanel
        isOpen
        onClose={() => undefined}
        exerciseSummaries={[
          ...summaries,
          { id: 6, name: 'Six', exercise_set: 'set-c', tags: [], statistics_tags: ['hidden-tag'], completed_at: '2026-09-08T01:00:00' },
        ]}
        selectedExerciseId={2}
      />,
    );

    await waitFor(() => expect(screen.getByText('hidden-tag')).toBeInTheDocument());
    const progressionRow = screen.getByText('hidden-tag').closest('.statistics-progression-row');

    expect(progressionRow).not.toBeNull();
    expect(progressionRow?.querySelector('progress')).toHaveProperty('value', 1);
    expect(progressionRow?.querySelector('.statistics-progression-count.is-black')).toHaveTextContent('1');
  });
});

describe('Statistics cheat status', () => {
  it('counts a recent cheat disable as used and otherwise falls back to cheats_used', async () => {
    render(
      <StatisticsPanel
        isOpen
        onClose={() => undefined}
        exerciseSummaries={[
          {
            id: 71,
            name: 'Recently disabled',
            exercise_set: 'set-a',
            tags: [],
            cheats_used: '000000000000',
            cheats_off: '2026-09-13T11:59:30',
            completed_at: '2026-09-13T12:00:00',
          },
          {
            id: 72,
            name: 'Disabled earlier',
            exercise_set: 'set-a',
            tags: [],
            cheats_used: '000000000000',
            cheats_off: '2026-09-13T11:58:59',
            completed_at: '2026-09-13T12:00:00',
          },
          {
            id: 73,
            name: 'Cheat snapshot fallback',
            exercise_set: 'set-a',
            tags: [],
            cheats_used: '100000000000',
            completed_at: '2026-09-13T12:00:00',
          },
        ]}
        selectedExerciseId={71}
      />,
    );

    await userEvent.setup().click(screen.getByRole('button', { name: /Exercise overview/ }));

    expect(document.body.querySelectorAll('.statistics-contribution-cell.is-yellow')).toHaveLength(2);
    expect(document.body.querySelectorAll('.statistics-contribution-cell.is-green')).toHaveLength(1);
    expect(document.body.querySelectorAll('.statistics-cheat-indicator')).toHaveLength(4);
  });
});

describe('Exercise overview DBE input totals', () => {
  it('shows total DBE submissions and the average per completed exercise', async () => {
    const user = userEvent.setup();
    render(
      <StatisticsPanel
        isOpen
        onClose={() => undefined}
        exerciseSummaries={[
          { id: 81, name: 'Completed one', exercise_set: 'set-a', tags: [], completed_at: '2026-09-01T00:00:00Z', dbe_set: 2 },
          { id: 82, name: 'Completed two', exercise_set: 'set-a', tags: [], completed_at: '2026-09-02T00:00:00Z', dbe_set: 3 },
          { id: 83, name: 'Incomplete', exercise_set: 'set-a', tags: [], dbe_set: 20 },
        ]}
        selectedExerciseId={81}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Exercise overview/ }));

    expect(await screen.findByRole('heading', { name: 'Number of DBE inputs' })).toBeInTheDocument();
    expect(screen.getByText('total: 25 inputs')).toBeInTheDocument();
    expect(screen.getByText('average: 12.5 per completed exercise')).toBeInTheDocument();
  });
});

describe('Advanced logbook distribution', () => {
  it('normalizes event positions across active intervals and excludes multi-day pauses', async () => {
    vi.mocked(fetchAllLogbooks).mockResolvedValue({
      '71': {
        entries_json: JSON.stringify([
          { kind: 'link', ts: Date.parse('2026-08-01T00:00:30Z') },
          { kind: 'set-dbe', before: null, after: 2.5, ts: Date.parse('2026-08-01T00:00:30Z') },
          { kind: 'merge-fragments', ts: Date.parse('2026-08-03T00:00:30Z') },
        ]),
        cursor: 2,
        links_json: '[]',
        restarts: JSON.stringify([
          { start: '2026-08-01T00:00:00Z', stop: '2026-08-01T00:01:00Z' },
          { start: '2026-08-03T00:00:00Z', stop: '2026-08-03T00:01:00Z' },
        ]),
      },
    });
    const user = userEvent.setup();
    render(
      <StatisticsPanel
        isOpen
        onClose={() => undefined}
        exerciseSummaries={[
          {
            id: 71,
            name: 'Long pause',
            exercise_set: 'set-a',
            tags: [],
            started_at: '2026-08-01T00:00:00Z',
            completed_at: '2026-08-03T00:01:00Z',
          },
        ]}
        selectedExerciseId={71}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Advanced/ }));

    expect(await screen.findByTitle('25-30%: 2 events')).toBeInTheDocument();
    expect(screen.getByTitle('75-80%: 1 event')).toBeInTheDocument();
    expect(screen.getByTitle('95-100%: 0 events')).toBeInTheDocument();
    expect(screen.getByTitle('25-30%: 2 events').querySelector('.statistics-logbook-dbe'))
      .toHaveStyle({ height: '50%' });
  });
});

describe('Temporary statistics', () => {
  it('counts perfect completed exercises until the first exercise with mistakes', async () => {
    const user = userEvent.setup();
    render(
      <StatisticsPanel
        isOpen
        onClose={() => undefined}
        exerciseSummaries={[
          { id: 91, name: 'Older perfect', exercise_set: 'set-a', tags: [], completed_at: '2026-09-01T00:00:00Z', incorrect_count: 0 },
          { id: 92, name: 'Most recent perfect', exercise_set: 'set-a', tags: [], completed_at: '2026-09-04T00:00:00Z', incorrect_count: 0 },
          { id: 93, name: 'First with mistakes', exercise_set: 'set-a', tags: [], completed_at: '2026-09-02T00:00:00Z', incorrect_count: 1 },
          { id: 94, name: 'Second most recent perfect', exercise_set: 'set-a', tags: [], completed_at: '2026-09-03T00:00:00Z', incorrect_count: 0 },
          { id: 95, name: 'Incomplete perfect', exercise_set: 'set-a', tags: [], incorrect_count: 0 },
        ]}
        selectedExerciseId={91}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Temp' }));

    expect(screen.getByRole('heading', { name: 'Perfect streak' })).toBeInTheDocument();
    expect(screen.getByText('2 exercises')).toBeInTheDocument();
  });
});
