import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatisticsPanel } from '../../../src/features/statistics/StatisticsPanel';
import { resetExercises } from '../../../src/api/reset';

vi.mock('../../../src/api/reset', () => ({
  resetExercises: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/api/tags', () => ({
  fetchTags: vi.fn().mockResolvedValue([
    { id: 1, tag_name: 'important' },
    { id: 2, tag_name: 'review' },
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
