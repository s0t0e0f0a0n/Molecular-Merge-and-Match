import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseMenu, type ExerciseMenuProps } from '../../../src/features/exercises/ExerciseMenu';

vi.mock('../../../src/api/spacedrep', () => ({
  deferExerciseAfterSkip: vi.fn().mockResolvedValue(undefined),
}));

afterEach(cleanup);

function renderExerciseMenu(enableDelete: boolean) {
  const props: ExerciseMenuProps = {
    srMode: false,
    enableDelete,
    onSetSrMode: vi.fn().mockResolvedValue(undefined),
    selectedExerciseId: null,
    validationAttempted: false,
    validatedCorrectExerciseId: null,
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
      validationAttempted: false,
      validatedCorrectExerciseId: null,
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

describe('ExerciseMenu spaced repetition queue', () => {
  it('shows the reset-style confirmation when there are no eligible exercises', async () => {
    const props: ExerciseMenuProps = {
      srMode: true,
      enableDelete: false,
      onSetSrMode: vi.fn().mockResolvedValue(undefined),
      selectedExerciseId: null,
      validationAttempted: false,
      validatedCorrectExerciseId: null,
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
    await userEvent.setup().click(screen.getByTestId('exercise-menu-button'));

    expect(screen.getByRole('dialog', { name: 'Done for today' })).toBeInTheDocument();
    expect(screen.getByText(/no spaced repetition exercises available right now/i)).toHaveClass(
      'statistics-reset-confirmation-detail',
    );
    expect(screen.getByRole('button', { name: 'Switch to normal mode' })).toHaveClass(
      'statistics-reset-proceed',
    );
    expect(screen.getByRole('button', { name: 'Stay in spaced repetition' })).toHaveClass(
      'statistics-reset-cancel',
    );
  });

  it('requires a validation attempt before Next and auto-advances after a correct result', async () => {
    const user = userEvent.setup();
    const onSelectExercise = vi.fn();
    const props: ExerciseMenuProps = {
      srMode: true,
      enableDelete: false,
      onSetSrMode: vi.fn().mockResolvedValue(undefined),
      selectedExerciseId: 1,
      validationAttempted: false,
      validatedCorrectExerciseId: null,
      exerciseSummaries: [
        {
          id: 1,
          name: 'Current',
          exercise_set: 'Organic set',
          in_SR: 1,
          completed: false,
          due_time: new Date(Date.now() - 60_000).toISOString(),
          tags: [],
        },
        {
          id: 2,
          name: 'Next',
          exercise_set: 'Organic set',
          in_SR: 1,
          completed: false,
          due_time: new Date(Date.now() - 30_000).toISOString(),
          tags: [],
        },
      ],
      activeTags: [],
      loadingExerciseSummaries: false,
      exerciseSummariesError: null,
      showCheatTags: false,
      showCreation: false,
      onSelectExercise,
      onExercisesMutated: vi.fn().mockResolvedValue(undefined),
      onDeleteExercises: vi.fn().mockResolvedValue([]),
      onResetExercise: vi.fn(),
    };

    const { rerender } = render(<ExerciseMenu {...props} />);
    await user.click(screen.getByTestId('exercise-menu-button'));
    expect(screen.getByRole('button', { name: 'Go to next exercise' })).toBeDisabled();

    rerender(
      <ExerciseMenu
        {...props}
        validationAttempted
        validatedCorrectExerciseId={1}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Go to next exercise' })).toBeEnabled();
    expect(onSelectExercise).toHaveBeenCalledWith(2);
  });

  it('shows set and SR status in history and interleaves new exercises after two due reviews', async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const onSelectExercise = vi.fn();
    const props: ExerciseMenuProps = {
      srMode: true,
      enableDelete: false,
      onSetSrMode: vi.fn().mockResolvedValue(undefined),
      selectedExerciseId: 1,
      validationAttempted: true,
      validatedCorrectExerciseId: null,
      exerciseSummaries: [
        {
          id: 1,
          name: 'Review one',
          exercise_set: 'Organic set',
          in_SR: 1,
          completed: false,
          due_time: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
          SR_status: 'learning',
          tags: [],
        },
        {
          id: 2,
          name: 'Review two',
          exercise_set: 'Organic set',
          in_SR: 1,
          completed: false,
          due_time: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
          SR_status: 'mature',
          tags: [],
        },
        {
          id: 3,
          name: 'Review three',
          exercise_set: 'Organic set',
          in_SR: 1,
          completed: false,
          due_time: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
          SR_status: 'young',
          tags: [],
        },
        {
          id: 4,
          name: 'New one',
          exercise_set: 'Organic set',
          in_SR: 1,
          completed: false,
          due_time: null,
          SR_status: 'new',
          tags: [],
        },
        {
          id: 5,
          name: 'New two',
          exercise_set: 'Organic set',
          in_SR: 1,
          completed: false,
          due_time: null,
          SR_status: 'new',
          tags: [],
        },
        {
          id: 6,
          name: 'Flag-completed review',
          exercise_set: 'Organic set',
          in_SR: 1,
          completed: true,
          due_time: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
          tags: [],
        },
        {
          id: 7,
          name: 'Timestamp-completed review',
          exercise_set: 'Organic set',
          in_SR: 1,
          completed: false,
          completed_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
          due_time: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
          tags: [],
        },
      ],
      activeTags: [],
      loadingExerciseSummaries: false,
      exerciseSummariesError: null,
      showCheatTags: false,
      showCreation: false,
      onSelectExercise,
      onExercisesMutated: vi.fn().mockResolvedValue(undefined),
      onDeleteExercises: vi.fn().mockResolvedValue([]),
      onResetExercise: vi.fn(),
    };

    const { rerender } = render(<ExerciseMenu {...props} />);
    await user.click(screen.getByTestId('exercise-menu-button'));

    expect(screen.getByText('Organic set — Review one (learning)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go to next exercise' }));
    expect(onSelectExercise).toHaveBeenLastCalledWith(2);

    rerender(<ExerciseMenu {...props} selectedExerciseId={2} />);
    await user.click(screen.getByRole('button', { name: 'Go to next exercise' }));
    expect(onSelectExercise).toHaveBeenLastCalledWith(4);
  });
});
