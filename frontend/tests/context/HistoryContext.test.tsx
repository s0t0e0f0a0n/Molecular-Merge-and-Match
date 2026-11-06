import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useEffect } from 'react';

import { HistoryProvider, useHistory } from '../../src/context/HistoryContext';
import * as logbookApi from '../../src/api/logbook';

const exerciseSelection = vi.hoisted(() => ({ id: 1 }));

vi.mock('../../src/api/logbook');

vi.mock('../../src/context/ExerciseDataContext', () => ({
  useExerciseData: () => ({ selectedExerciseId: exerciseSelection.id }),
}));

const historyHandlers = {
  deleteFragment: vi.fn(async () => {}),
  restoreFragment: vi.fn(async () => {}),
  updateFragment: vi.fn(async () => {}),
  setSolution: vi.fn(async () => {}),
  clearSolution: vi.fn(async () => {}),
  setDbe: vi.fn(async () => {}),
};

function TestComponent() {
  const { entries, cursor, record, clearHistory, undo, redo, registerHandlers } = useHistory();
  useEffect(() => {
    registerHandlers(historyHandlers);
  }, [registerHandlers]);
  return (
    <div>
      <div data-testid="count">{entries.length}</div>
      <div data-testid="cursor">{cursor}</div>
      <button data-testid="add" onClick={() =>
        record({ kind: 'create-fragment', fragmentId: 1, fragLabel: 'A' })
      }>add</button>
      <button data-testid="clear" onClick={clearHistory}>clear</button>
      <button data-testid="undo" onClick={() => void undo()}>undo</button>
      <button data-testid="redo" onClick={() => void redo()}>redo</button>
    </div>
  );
}

const renderProvider = () => render(
  <HistoryProvider><TestComponent /></HistoryProvider>,
);


describe('HistoryProvider talks to logbook api', () => {
  beforeEach(() => {
    exerciseSelection.id = 1;
    vi.mocked(logbookApi.fetchLogbook).mockResolvedValue({
      entries_json: '[]', cursor: 0, links_json: '[]', restarts: '[]',
    });
    vi.mocked(logbookApi.saveLogbook).mockResolvedValue({
      entries_json: '[]', cursor: 0, links_json: '[]', restarts: '[]', timer_checkpointed: false,
    });
    vi.mocked(logbookApi.clearLogbook).mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());


  it('asks the server for logbook when page opens', async () => {
    renderProvider();
    await waitFor(() =>
      expect(logbookApi.fetchLogbook).toHaveBeenCalledWith('exercise-1'),
    );
  });

  it('shows the entries that came back from the server', async () => {
    vi.mocked(logbookApi.fetchLogbook).mockResolvedValue({
      entries_json: JSON.stringify([
        { id: 'a', ts: 1, kind: 'create-fragment', fragmentId: 7, fragLabel: 'OH' },
      ]),
      cursor: 1,
      links_json: '[]',
      restarts: '[]',
    });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('1');
    });
  });

  it('reloads reset histories and does not save cached entries after switching exercises', async () => {
    vi.mocked(logbookApi.fetchLogbook)
      .mockResolvedValueOnce({
        entries_json: JSON.stringify([
          { id: 'old', ts: 1, kind: 'create-fragment', fragmentId: 7, fragLabel: 'old' },
        ]),
        cursor: 1,
        links_json: '[]',
        restarts: '[]',
      })
      .mockResolvedValue({
        entries_json: '[]',
        cursor: 0,
        links_json: '[]',
        restarts: '[]',
      });

    const view = renderProvider();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));

    exerciseSelection.id = 2;
    view.rerender(<HistoryProvider><TestComponent /></HistoryProvider>);
    await waitFor(() => expect(logbookApi.fetchLogbook).toHaveBeenCalledWith('exercise-2'));

    act(() => {
      window.dispatchEvent(new CustomEvent('exercise-reset', {
        detail: { exerciseIds: [1], level: 'progression' },
      }));
    });

    exerciseSelection.id = 1;
    view.rerender(<HistoryProvider><TestComponent /></HistoryProvider>);
    await waitFor(() => expect(logbookApi.fetchLogbook).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'));

    act(() => {
      window.dispatchEvent(new CustomEvent('exercise-reset', {
        detail: { exerciseIds: [1], level: 'logbook' },
      }));
    });
    await waitFor(() => expect(logbookApi.fetchLogbook).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'));
    await new Promise((resolve) => window.setTimeout(resolve, 100));

    expect(logbookApi.saveLogbook).not.toHaveBeenCalled();
  });

  it('saves to the server after the user makes a change', async () => {
    renderProvider();

    // Wait for the initial load (it is needed because the save will not fire otherwise)
    await waitFor(() => expect(logbookApi.fetchLogbook).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('add'));

    await waitFor(() =>
      expect(logbookApi.saveLogbook).toHaveBeenLastCalledWith(
        'exercise-1',
        expect.objectContaining({ cursor: 1 }),
      ),
    );
  });

  it('shows an alert when saving the logbook fails', async () => {
    vi.mocked(logbookApi.saveLogbook).mockRejectedValueOnce(new Error('offline'));
    renderProvider();

    await waitFor(() => expect(logbookApi.fetchLogbook).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('add'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Logbook save failed. Your recent changes may not be saved.',
    );
  });

  it('ignores a re-entrant undo while the first undo is still applying', async () => {
    let finishDelete!: () => void;
    historyHandlers.deleteFragment.mockImplementationOnce(
      () => new Promise<void>((resolve) => { finishDelete = resolve; }),
    );
    renderProvider();
    await waitFor(() => expect(logbookApi.fetchLogbook).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('add'));
    await waitFor(() => expect(screen.getByTestId('cursor')).toHaveTextContent('1'));
    fireEvent.click(screen.getByTestId('undo'));
    fireEvent.click(screen.getByTestId('undo'));

    expect(historyHandlers.deleteFragment).toHaveBeenCalledTimes(1);
    await act(async () => finishDelete());
    await waitFor(() => expect(screen.getByTestId('cursor')).toHaveTextContent('0'));
  });

  it('ignores a re-entrant redo while the first redo is still applying', async () => {
    let finishRestore!: () => void;
    renderProvider();
    await waitFor(() => expect(logbookApi.fetchLogbook).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('add'));
    await waitFor(() => expect(screen.getByTestId('cursor')).toHaveTextContent('1'));
    fireEvent.click(screen.getByTestId('undo'));
    await waitFor(() => expect(screen.getByTestId('cursor')).toHaveTextContent('0'));

    historyHandlers.restoreFragment.mockImplementationOnce(
      () => new Promise<void>((resolve) => { finishRestore = resolve; }),
    );
    fireEvent.click(screen.getByTestId('redo'));
    fireEvent.click(screen.getByTestId('redo'));

    expect(historyHandlers.restoreFragment).toHaveBeenCalledTimes(1);
    await act(async () => finishRestore());
    await waitFor(() => expect(screen.getByTestId('cursor')).toHaveTextContent('1'));
  });

  it('asks the server to clear logbook when user clears it', async () => {
    renderProvider();
    await waitFor(() => expect(logbookApi.fetchLogbook).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('clear'));
    expect(logbookApi.clearLogbook).toHaveBeenCalledWith('exercise-1');
  });
});