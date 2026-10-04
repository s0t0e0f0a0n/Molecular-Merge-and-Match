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
