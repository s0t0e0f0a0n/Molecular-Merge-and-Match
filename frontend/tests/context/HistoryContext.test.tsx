import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { HistoryProvider, useHistory } from '../../src/context/HistoryContext';
import * as logbookApi from '../../src/api/logbook';


vi.mock('../../src/api/logbook');

vi.mock('../../src/context/ExerciseDataContext', () => ({
  useExerciseData: () => ({ selectedExerciseId: 1 }),
}));


function TestComponent() {
  const { entries, record, clearHistory } = useHistory();
  return (
    <div>
      <div data-testid="count">{entries.length}</div>
      <button data-testid="add" onClick={() =>
        record({ kind: 'create-fragment', fragmentId: 1, fragLabel: 'A' })
      }>add</button>
      <button data-testid="clear" onClick={clearHistory}>clear</button>
    </div>
  );
}

const renderProvider = () => render(
  <HistoryProvider><TestComponent /></HistoryProvider>,
);


describe('HistoryProvider talks to logbook api', () => {
  beforeEach(() => {
    vi.mocked(logbookApi.fetchLogbook).mockResolvedValue({
      entries_json: '[]', cursor: 0, links_json: '[]',
    });
    vi.mocked(logbookApi.saveLogbook).mockResolvedValue(undefined);
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
    });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('1');
    });
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

  it('asks the server to clear logbook when user clears it', async () => {
    renderProvider();
    await waitFor(() => expect(logbookApi.fetchLogbook).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('clear'));
    expect(logbookApi.clearLogbook).toHaveBeenCalledWith('exercise-1');
  });
});