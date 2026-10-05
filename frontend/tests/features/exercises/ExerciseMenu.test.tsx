import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseMenu, type ExerciseMenuProps } from '../../../src/features/exercises/ExerciseMenu';

afterEach(cleanup);

function renderExerciseMenu(enableDelete: boolean) {
  const props: ExerciseMenuProps = {
    srMode: false,
    enableDelete,
    onSetSrMode: vi.fn().mockResolvedValue(undefined),
    selectedExerciseId: null,
    exerciseSummaries: [],
    activeTags: [],
    loadingExerciseSummaries: false,
    exerciseSummariesError: null,
    showCheatTags: false,
    showCreation: false,
    onSelectExercise: vi.fn(),
    onExercisesMutated: vi.fn().mockResolvedValue(undefined),
    onDeleteExercises: vi.fn().mockResolvedValue([]),
    onResetExercise: vi.fn(),
  };

  render(<ExerciseMenu {...props} />);
}

describe('ExerciseMenu delete control', () => {
  it('shows the delete icon when delete is enabled', async () => {
    renderExerciseMenu(true);
    await userEvent.setup().click(screen.getByTestId('exercise-menu-button'));

    expect(screen.getByTitle('Delete exercises')).toBeInTheDocument();
  });

  it('hides the delete icon when delete is disabled', async () => {
    renderExerciseMenu(false);
    await userEvent.setup().click(screen.getByTestId('exercise-menu-button'));

    expect(screen.queryByTitle('Delete exercises')).not.toBeInTheDocument();
  });
});

describe('ExerciseMenu tag filters', () => {
  it('filters using statistics tags when hidden tags are omitted from exercise tags', async () => {
    const user = userEvent.setup();
    const props: ExerciseMenuProps = {
      srMode: false,
      enableDelete: false,
      onSetSrMode: vi.fn().mockResolvedValue(undefined),
      selectedExerciseId: null,
      exerciseSummaries: [
        {
          id: 1,
          name: 'Matching exercise',
          exercise_set: 'Custom tag set',
          tags: [],
          statistics_tags: ['custom-tag'],
        },
        {
          id: 2,
          name: 'Other exercise',
          exercise_set: 'Custom tag set',
          tags: [],
          statistics_tags: [],
        },
      ],
      activeTags: [
        {
          id: 1,
          tag_name: 'custom-tag',
          description: null,
          is_persistent: false,
          is_hideable: true,
          is_hidden: false,
          is_cheat: false,
          tag_count: 1,
          user_tag: true,
          allowed_stats: true,
          progression_use: false,
        },
      ],
      loadingExerciseSummaries: false,
      exerciseSummariesError: null,
      showCheatTags: false,
      showCreation: false,
      onSelectExercise: vi.fn(),
      onExercisesMutated: vi.fn().mockResolvedValue(undefined),
      onDeleteExercises: vi.fn().mockResolvedValue([]),
      onResetExercise: vi.fn(),
    };

    render(<ExerciseMenu {...props} />);
    await user.click(screen.getByTestId('exercise-menu-button'));
    await user.click(screen.getByRole('button', { name: 'Expand Custom tag set' }));
    await user.click(screen.getByRole('checkbox', { name: 'custom-tag' }));

    expect(screen.getByRole('button', { name: 'Matching exercise' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Other exercise' })).not.toBeInTheDocument();
  });
});
