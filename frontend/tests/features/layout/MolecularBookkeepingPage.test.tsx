import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MolecularBookkeepingPage } from '../../../src/features/layout/MolecularBookkeepingPage';
import { ExerciseDataProvider } from '../../../src/context/ExerciseDataContext'
import { HistoryProvider } from '../../../src/context/HistoryContext'
import { WarningProvider } from '../../../src/context/WarningContext';
import {
  fetchExerciseSummaries,
  fetchExerciseDetail,
} from '../../../src/api/exercises';
import { mockSummaries, mockExercise1, mockExercise2 } from './MockExercises';

let rdkitMock: {
  get_mol: (input: string) => {
    is_valid: () => boolean;
    get_svg: (w: number, h: number) => string;
    get_svg_with_highlights: (opts: string) => string;
    get_inchi: () => string;
    delete: () => void;
  };
} | null = null;

  const renderPage = () =>
  render(
    <WarningProvider>
      <ExerciseDataProvider>
        <HistoryProvider>
          <MolecularBookkeepingPage />
        </HistoryProvider>
      </ExerciseDataProvider>
    </WarningProvider>
  );

  // Mock fetching data
  vi.mock('../../../src/api/exercises', async () => {
  const actual = await vi.importActual('../../../src/api/exercises');
  return {
    ...actual,
    fetchExerciseSummaries: vi.fn(),
    fetchExerciseDetail: vi.fn(),
  };
});


// Mock fetch for API hooks (relative URLs fail in jsdom)
const mockFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => {
  if (url.includes('/dbe')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ dbe: null }) } as Response);
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
});
vi.stubGlobal('fetch', mockFetch);

// Avoid SpectrumViewer fetching SVGs in Node (invalid URL). The mock reads
// `type` so the page tests that look for "1H-NMR Spectrum" / "13C-NMR
// Spectrum" still pass with the new prop shape (title is no longer passed).
vi.mock('../../../src/features/viewingSpectra/SpectraPrototype', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/features/viewingSpectra/SpectraPrototype')>();
  return {
    ...actual,
    SpectrumViewer: ({ title, type }: { title?: string; type?: 'H' | 'C' }) => (
      <div data-testid="spectrum-mock">
        {title ?? (type === 'H' ? '1H-NMR Spectrum' : '13C-NMR Spectrum')}
      </div>
    ),
    SpectraPrototype: () => <div data-testid="spectra-mock">Spectra</div>,
  };
});

// Mock KetcherEditor to avoid paper.js canvas errors in jsdom.
vi.mock('../../../src/components/KetcherEditor', () => ({
  default: () => (
    <div>
      <h2>Molecule Editor</h2>
      <span>Editor ready</span>
    </div>
  ),
}));

// Mock RDKit context - no WASM in jsdom.
vi.mock('../../../src/context/RDKitContext', () => ({
  useRDKit: () => ({ rdkit: rdkitMock, loading: false, error: null }),
  RDKitProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));




describe('MolecularBookkeepingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    rdkitMock = null;

    vi.mocked(fetchExerciseSummaries).mockResolvedValue(mockSummaries);

    vi.mocked(fetchExerciseDetail).mockImplementation(async (exerciseId: number) => {
      if (exerciseId === 1) return mockExercise1;
      if (exerciseId === 2) return mockExercise2;
      throw new Error(`Unknown mock exercise id: ${exerciseId}`);
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

 // The actual tests

async function selectExerciseViaMenu(user: ReturnType<typeof userEvent.setup>, exerciseName: string) {
  await user.click(await screen.findByTestId('exercise-menu-button'));
  await user.click(await screen.findByRole('button', { name: new RegExp(`^${exerciseName}\\b`) }));
}

it('renders the top bar with title, current exercise display, and editor button', async () => {
  renderPage();

  expect(await screen.findByAltText('Molecular Bookkeeping')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: /Open molecule editor/ })).toBeInTheDocument();
  expect(await screen.findByTestId('exercise-menu-button')).toBeInTheDocument();
});

it('renders both spectrum viewers', async () => {
  renderPage();

  expect(await screen.findByText('1H-NMR Spectrum')).toBeInTheDocument();
  expect(await screen.findByText('13C-NMR Spectrum')).toBeInTheDocument();
});

it('renders peak list headings', async () => {
  renderPage();

  expect(await screen.findByText('¹H peaks (ppm)')).toBeInTheDocument();
  expect(await screen.findByText('¹³C peaks (ppm)')).toBeInTheDocument();
});

it('renders the working fragments strip', async () => {
  renderPage();

  expect(await screen.findByText('Working fragments')).toBeInTheDocument();
});

it('renders the predefined fragments area', async () => {
  renderPage();

  expect(
    await screen.findByText(/Predefined fragments|No predefined fragments|Loading predefined/)
  ).toBeInTheDocument();
});

it('opens the floating editor popup when clicked', async () => {
  const user = userEvent.setup();
  renderPage();

  const openButton = await screen.findByRole('button', { name: /Open molecule editor/ });
  await user.click(openButton);

  expect(await screen.findByRole('dialog', { name: /Molecule editor popup/ })).toBeInTheDocument();
});

it('renders linking controls (clear links button)', async () => {
  renderPage();

  expect(await screen.findByText('Clear links')).toBeInTheDocument();
});


it('loads exercise summaries and selects the first exercise by default', async () => {
  renderPage();

  await waitFor(() => {
    expect(fetchExerciseSummaries).toHaveBeenCalled();
    expect(fetchExerciseDetail).toHaveBeenCalledWith(1);
  });

  await waitFor(() => {
    expect(screen.getByTestId('exercise-menu-button')).toHaveTextContent('Exercise 1');
  });
});

it('renders peaks from the first selected exercise', async () => {
  renderPage();

  expect(await screen.findByText('2.46')).toBeInTheDocument();
  expect(await screen.findByText('2.14')).toBeInTheDocument();
  expect(await screen.findByText('1.06')).toBeInTheDocument();
});

it('shows the second exercise data after selecting it', async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByTestId('exercise-menu-button'));
  await user.click(await screen.findByRole('button', { name: /Exercise 2/ }));

  await waitFor(() => {
    expect(fetchExerciseDetail).toHaveBeenCalledWith(2);
  });

  expect(await screen.findByText('3.80')).toBeInTheDocument();
  expect(await screen.findByText('2.58')).toBeInTheDocument();
  expect(await screen.findByText('1.20')).toBeInTheDocument();
});

it('switches exercise via the Exercises menu', async () => {
  const user = userEvent.setup();
  renderPage();

  await waitFor(() => {
    expect(screen.getByTestId('exercise-menu-button')).toHaveTextContent('Exercise 1');
  });

  await user.click(screen.getByTestId('exercise-menu-button'));
  await user.click(await screen.findByRole('button', { name: /Exercise 2/ }));

  await waitFor(() => {
    expect(fetchExerciseDetail).toHaveBeenCalledWith(2);
    expect(screen.getByTestId('exercise-menu-button').textContent).toContain('Exercise 2');
  });
});

it('shows mocked exercises in the selector', async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByTestId('exercise-menu-button'));

  expect(await screen.findByRole('button', { name: /^Exercise 1$/ })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: /^Exercise 2$/ })).toBeInTheDocument();
});

it('does not show exercise tags in the exercise menu', async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByTestId('exercise-menu-button'));

  expect(screen.queryByText(/OSS, C4, base set, solvent/)).not.toBeInTheDocument();
  expect(
    screen.queryByText(/OSS, C3, base set, solvent, symmetry, exchange/),
  ).not.toBeInTheDocument();
});

it('shows ZIP upload control in the exercise menu', async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByTestId('exercise-menu-button'));

  expect(await screen.findByText('Upload exercise ZIP')).toBeInTheDocument();
  expect(
    document.querySelector('input[type="file"][accept=".zip,application/zip"]'),
  ).not.toBeNull();
});

it('shows an error when loading exercise detail fails', async () => {
  vi.mocked(fetchExerciseDetail).mockRejectedValueOnce(new Error('Server error'));

  renderPage();

  expect(await screen.findByText('Server error')).toBeInTheDocument();
});

it('shows fallback text when no exercises are returned', async () => {
  vi.mocked(fetchExerciseSummaries).mockResolvedValueOnce([]);
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByTestId('exercise-menu-button'));
  expect(await screen.findByText('No exercises found.')).toBeInTheDocument();
});

it('validates solution answer and sends a solution hash', async () => {
  const user = userEvent.setup();
  const fakeSolution = { smiles: 'C', mol_file: 'fake-mol' };

  if (!globalThis.crypto?.subtle) {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: async () => new Uint8Array(32).buffer,
      },
    });
  }

  rdkitMock = {
    get_mol: () => ({
      is_valid: () => true,
      get_svg: () => '<svg viewBox="0 0 10 10"></svg>',
      get_svg_with_highlights: () => '<svg viewBox="0 0 10 10"></svg>',
      get_inchi: () => 'InChI=1S/CH4/h1H4',
      delete: () => {},
    }),
  };

  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/dbe')) {
      return Promise.resolve({
        ok: true, json: () => Promise.resolve({ dbe: null }),
      } as Response);
    }
    if (url.includes('/working-solution/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(fakeSolution),
      } as Response);
    }
    if (url.includes('/validate-solution') && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ is_correct: true }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
  });

  renderPage();

  await screen.findByText('2.46');
  await user.click(screen.getByRole('button', { name: /Validate answer/i }));

  await waitFor(() => {
    const validationCalls = mockFetch.mock.calls.filter(
      (args) =>
        args[0].includes('/api/v1/exercises/1/validate-solution') &&
        args[1]?.method === 'POST',
    );
    expect(validationCalls.length).toBe(1);
    const [, init] = validationCalls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { solution_hash: string };
    expect(body.solution_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  expect(await screen.findByText('Your answer is correct.')).toBeInTheDocument();
});

it('shows incorrect solution feedback when validation fails', async () => {
  const user = userEvent.setup();
  const fakeSolution = { smiles: 'C', mol_file: 'fake-mol' };

  if (!globalThis.crypto?.subtle) {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: async () => new Uint8Array(32).buffer,
      },
    });
  }

  rdkitMock = {
    get_mol: () => ({
      is_valid: () => true,
      get_svg: () => '<svg viewBox="0 0 10 10"></svg>',
      get_svg_with_highlights: () => '<svg viewBox="0 0 10 10"></svg>',
      get_inchi: () => 'InChI=1S/CH4/h1H4',
      delete: () => {},
    }),
  };

  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/dbe')) {
      return Promise.resolve({
        ok: true, json: () => Promise.resolve({ dbe: null }),
      } as Response);
    }
    if (url.includes('/working-solution/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(fakeSolution),
      } as Response);
    }
    if (url.includes('/validate-solution') && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ is_correct: false }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
  });

  renderPage();

  await screen.findByText('2.46');
  await user.click(screen.getByRole('button', { name: /Validate answer/i }));

  expect(await screen.findByText('Your answer is incorrect.')).toBeInTheDocument();
});

  describe('Send to fragments (unsolution)', () => {
    const fakeSolution = { smiles: 'CCO', mol_file: 'CCO-mol-block' };

    beforeEach(() => {
      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/dbe')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ dbe: null }),
          } as Response);
        }
        if (url.includes('working-solution')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve(fakeSolution),
          } as Response);
        }
        if (url.includes('/fragments/') && init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 42, exercise_id: 'ex1', label: 'Solution', smiles: fakeSolution.smiles, mol_file: fakeSolution.mol_file }),
          } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
      });
    });

   it('shows the "Send to fragments" button when a solution exists', async () => {
      await act(async () => { renderPage(); });
      expect(screen.getByText('Send to fragments')).toBeInTheDocument();
    });

   it('sends a fragment and clears the solution in a single click', async () => {
      const user = userEvent.setup();
      await act(async () => { renderPage(); });
      await user.click(screen.getByText('Send to fragments'));

      // Should have posted to fragments API
      const postCalls = mockFetch.mock.calls.filter(
        (args) => args[0].includes('/fragments/') && args[1]?.method === 'POST',
      );
      expect(postCalls.length).toBe(1);

      // Should have DELETEd the solution (cleared it)
      const deleteCalls = mockFetch.mock.calls.filter(
        (args) => args[0].includes('working-solution') && args[1]?.method === 'DELETE',
      );
      expect(deleteCalls.length).toBe(1);
    });

   it('does not ask for confirmation before sending', async () => {
      const user = userEvent.setup();
      await act(async () => { renderPage(); });
      await user.click(screen.getByText('Send to fragments'));
      // There should be no keep/clear/cancel prompt
      expect(screen.queryByText('Clear solution?')).not.toBeInTheDocument();
      expect(screen.queryByText('Keep')).not.toBeInTheDocument();
    });
  });

  describe('Logbook (undo / redo)', () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    // Helper function
    function mockSendToFragments(id = 1) {
      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/dbe')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ dbe: null }),
          } as Response);
        }
        if (url.includes('/fragments/') && init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id, exercise_id: 'ex1', label: 'Solution', smiles: 'CCO', mol_file: 'CCO-mol-block',
            }),
          } as Response);
        }
        
        if (url.includes('working-solution')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ smiles: 'CCO', mol_file: 'CCO-mol-block' }),
          } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
      });
    }

    it('start with an empty logbook and disabled Undo and Redo', async () => {
      await act(async () => { renderPage(); });

      expect(await screen.findByRole('button', { name: /Undo/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Redo/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Logbook \(0\/0\)/ })).toBeInTheDocument();
    });

    it('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y both redo', async () => {
      mockSendToFragments();

      const user = userEvent.setup();
      await act(async () => { renderPage(); });
      await user.click(await screen.findByText('Send to fragments'));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Logbook \(1\/1\)/ })).toBeInTheDocument();
      });

      // Ctrl+Z undoes, cursor goes to 0.
      await user.keyboard('{Control>}z{/Control}');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Logbook \(0\/1\)/ })).toBeInTheDocument();
      });

      // Ctrl+Shift+Z redoes, cursor goes back to 1.
      await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Logbook \(1\/1\)/ })).toBeInTheDocument();
      });

      // And Ctrl+Y also should work (it is for Windows).
      await user.keyboard('{Control>}z{/Control}');
      await user.keyboard('{Control>}y{/Control}');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Logbook \(1\/1\)/ })).toBeInTheDocument();
      });
    });
    
    it('disables Undo and Redo when there is no history', async () => {
      await act(async () => { renderPage(); });

      const undoBtn = await screen.findByRole('button', { name: /Undo/ });
      const redoBtn = await screen.findByRole('button', { name: /Redo/ });

      expect(undoBtn).toBeDisabled();
      expect(redoBtn).toBeDisabled();
    });

    it('shows empty-state message when the panel is opened with no actions', async () => {
      const user = userEvent.setup();
      await act(async () => { renderPage(); });

      await user.click(await screen.findByRole('button', { name: /Logbook \(0\/0\)/ }));

      expect(
        await screen.findByText(/No actions yet\. Make a change to start the logbook\./),
      ).toBeInTheDocument();
    });

    it('shows what the user did in the panel after Send to fragments', async () => {
      mockSendToFragments();

      const user = userEvent.setup();
      await act(async () => { renderPage(); });
      await user.click(await screen.findByText('Send to fragments'));
      await user.click(await screen.findByRole('button', { name: /Logbook \(1\/1\)/ }));

      expect(await screen.findByText('Sent working solution to fragments')).toBeInTheDocument();
    });

    it('closes the logbook panel when the user clicks outside it', async () => {
      const user = userEvent.setup();
      await act(async () => { renderPage(); });

      await user.click(await screen.findByRole('button', { name: /Logbook \(0\/0\)/ }));
      expect(await screen.findByText(/No actions yet/)).toBeInTheDocument();

      // Click on the title of the page (so outside the panel).
      await user.click(screen.getByAltText('Molecular Bookkeeping'));

      await waitFor(() => {
        expect(screen.queryByText(/No actions yet/)).not.toBeInTheDocument();
      });
    });

    it('Send to fragments is undone in one click', async () => {
      mockSendToFragments(99);

      const user = userEvent.setup();
      await act(async () => { renderPage(); });
      await user.click(await screen.findByText('Send to fragments'));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Logbook \(1\/1\)/ })).toBeInTheDocument();
      });
      mockFetch.mockClear();

      await user.click(screen.getByRole('button', { name: /Undo/ }));

      // One Undo should remove the new fragment and bring back the old solution.
      await waitFor(() => {
        const deletes = mockFetch.mock.calls.filter(
          (args) => args[0].includes('/fragments/99') && args[1]?.method === 'DELETE',
        );
        const puts = mockFetch.mock.calls.filter(
          (args) => args[0].includes('working-solution') && args[1]?.method === 'PUT',
        );

        expect(deletes.length).toBeGreaterThanOrEqual(1);
        expect(puts.length).toBeGreaterThanOrEqual(1);
      });
    });

  });

  it('does not reuse stale links from the previous exercise after switching exercises', async () => {
    const user = userEvent.setup();

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/dbe')) {
        return Promise.resolve({
          ok: true, json: () => Promise.resolve({ dbe: null }),
        } as Response);
      }
      if (url.includes('/fragments/') && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 7,
                exercise_id: 'exercise',
                label: 'Test fragment',
                smiles: 'C',
                mol_file: 'mol-block',
              },
            ]),
        } as Response);
      }

      if (url.includes('/warnings') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              type: 'atom_count_DBE',
              warning: false,
              info: '',
            }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    });

    renderPage();

    // Exercise 1 loaded
    expect(await screen.findByText('2.46')).toBeInTheDocument();
    expect(await screen.findByTitle('Fragment 1')).toBeInTheDocument();

    // Link fragment to a peak in exercise 1
    await user.click(screen.getByTitle('Fragment 1'));
    await user.click(screen.getByText('2.46'));

    // Switch to exercise 2
    await user.click(await screen.findByTestId('exercise-menu-button'));
    await user.click(await screen.findByRole('button', { name: /Exercise 2/ }));

    await waitFor(() => {
      expect(fetchExerciseDetail).toHaveBeenCalledWith(2);
    });

    // Exercise 2 peak is visible
    expect(await screen.findByText('3.80')).toBeInTheDocument();

    // Try linking in exercise 2
    await user.click(screen.getByTitle('Fragment 1'));
    await user.click(screen.getByText('3.80'));

    // Regression check:
    // old peak ids from exercise 1 should not be rendered against exercise 2 peaks.
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Missing peak for id'),
      expect.anything(),
    );

    consoleWarnSpy.mockRestore();
  });
  
  // DBE warning
  it('shows the atom-count/DBE warning icon when C#C is linked in mock exercise 1', async () => {
    const user = userEvent.setup();

    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/dbe')) {
        return Promise.resolve({
          ok: true, json: () => Promise.resolve({ dbe: null }),
        } as Response);
      }
      if (url.includes('/fragments/') && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 7,
                exercise_id: 'exercise-1',
                label: 'Acetylene',
                smiles: 'C#C',
                mol_file: 'mol-block',
              },
            ]),
        } as Response);
      }

      if (url.includes('/warnings') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);

        if (body.type === 'double_peak_assignment') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                type: 'double_peak_assignment',
                warning: false,
                info: '',
              }),
          } as Response);
        }

        expect(body.type).toBe('atom_count_DBE');
        expect(body.fragments).toContain('C#C');
        expect(body.formulaDbe).toBeNull();

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              type: 'atom_count_DBE',
              warning: true,
              info: 'Warning active: DBE too high',
            }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    });

    renderPage();

    await screen.findByTitle('Fragment 1');

    await user.click(screen.getByTitle('Fragment 1'));
    await user.click(await screen.findByText('2.46'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/warnings'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    expect(
      await screen.findByRole('img', { name: 'Atom count warning' }),
    ).toBeInTheDocument();
  });

  // When there are linked peaks and the atom count exeeds the constraint, then the icon should appear.
  it('shows the atom-count warning icon when backend returns warning true', async () => {
      const user = userEvent.setup();

      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/dbe')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ dbe: null }),
          } as Response);
        }
        if (url.includes('/fragments/') && !init?.method) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  id: 7,
                  exercise_id: 'exercise-1',
                  label: 'Methane',
                  smiles: 'C',
                  mol_file: 'mol-block',
                },
              ]),
          } as Response);
        }

        if (url.includes('/warnings') && init?.method === 'POST') {
          const body = JSON.parse(init.body as string);

          if (body.type === 'double_peak_assignment') {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  type: 'double_peak_assignment',
                  warning: false,
                  info: '',
                }),
            } as Response);
          }

          expect(body.type).toBe('atom_count_DBE');
          expect(body.formulaDbe).toBeNull();

          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                type: 'atom_count_DBE',
                warning: true,
                info: 'Too many atoms',
              }),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response);
      });

      renderPage();

      await screen.findByTitle('Fragment 1');

      await user.click(screen.getByTitle('Fragment 1'));
      await user.click(await screen.findByText('2.46'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/warnings'),
          expect.objectContaining({ method: 'POST' }),
        );
      });

      expect(
        await screen.findByRole('img', { name: 'Atom count warning' }),
      ).toBeInTheDocument();
    });

    it('clears warnings immediately when switching exercises before a new response arrives', async () => {
      const user = userEvent.setup();
      let resolveFirstWarning: ((response: Response) => void) | undefined;
      let warningRequestCount = 0;

      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/dbe')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ dbe: null }),
          } as Response);
        }

        if (url.includes('/fragments/') && !init?.method) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  id: 7,
                  exercise_id: 'exercise-1',
                  label: 'Methane',
                  smiles: 'C',
                  mol_file: 'mol-block',
                },
              ]),
          } as Response);
        }

        if (url.includes('/warnings') && init?.method === 'POST') {
          const body = JSON.parse(init.body as string);

          if (body.type === 'double_peak_assignment') {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  type: 'double_peak_assignment',
                  warning: false,
                  info: '',
                }),
            } as Response);
          }

          warningRequestCount += 1;

          if (warningRequestCount === 1) {
            return new Promise<Response>((resolve) => {
              resolveFirstWarning = resolve;
            });
          }

          return new Promise<Response>(() => undefined);
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response);
      });

      renderPage();

      await screen.findByTitle('Fragment 1');
      await user.click(screen.getByTitle('Fragment 1'));
      await user.click(await screen.findByText('2.46'));

      act(() => {
        resolveFirstWarning?.({
          ok: true,
          json: () => Promise.resolve({
            type: 'atom_count_DBE',
            warning: true,
            info: 'Too many atoms',
          }),
        } as Response);
      });

      expect(await screen.findByRole('img', { name: 'Atom count warning' })).toBeInTheDocument();

      await user.click(await screen.findByTestId('exercise-menu-button'));
      await user.click(await screen.findByRole('button', { name: /Exercise 2/ }));

      expect(screen.queryByRole('img', { name: 'Atom count warning' })).not.toBeInTheDocument();
    });

    it('sends the saved student DBE value to the warning backend', async () => {
    const user = userEvent.setup();

    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/dbe')) {
        return Promise.resolve({
          ok: true, json: () => Promise.resolve({ dbe: null }),
        } as Response);
      }
      if (url.includes('/fragments/') && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 7,
                exercise_id: 'exercise-1',
                label: 'Methane',
                smiles: 'C',
                mol_file: 'mol-block',
              },
            ]),
        } as Response);
      }

      if (url.includes('/warnings') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);

        if (body.type === 'double_peak_assignment') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                type: 'double_peak_assignment',
                warning: false,
                info: '',
              }),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              type: 'atom_count_DBE',
              warning: false,
              info: '',
            }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    });

    renderPage();

    await screen.findByTitle('Fragment 1');

    const dbeInput = screen.getByLabelText('DBE');
    await user.clear(dbeInput);
    await user.type(dbeInput, '2.5');

    await user.keyboard('{Enter}');

    await user.click(await screen.findByTitle('Fragment 1'));
    await user.click(await screen.findByText('2.46'));

    await waitFor(() => {
      const atomCountCalls = mockFetch.mock.calls
        .filter((args) => args[0].includes('/warnings') && args[1]?.method === 'POST')
        .map((args) => JSON.parse(args[1]?.body as string))
        .filter((body) => body.type === 'atom_count_DBE');

      expect(atomCountCalls.some((body) => body.formulaDbe === 2.5)).toBe(true);
    });
  });

  it('does not send invalid DBE value to the warning backend', async () => {
    const user = userEvent.setup();

    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/dbe')) {
        return Promise.resolve({
          ok: true, json: () => Promise.resolve({ dbe: null }),
        } as Response);
      }
      if (url.includes('/fragments/') && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 7, 
                exercise_id: 'exercise-1',
                label: 'Methane',
                smiles: 'C',
                mol_file: 'mol-block'
              },
            ]),
        } as Response);
      }
      if (url.includes('/warnings') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ type: 'atom_count_DBE', warning: false, info: '' }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
    });

    renderPage();
    await screen.findByTitle('Fragment 1');

    const dbeInput = screen.getByLabelText('DBE');
    await user.clear(dbeInput);
    await user.type(dbeInput, 'abc');
    await user.keyboard('{Enter}');

    // Trigger a warning check.
    await user.click(await screen.findByTitle('Fragment 1'));
    await user.click(await screen.findByText('2.46'));

    await waitFor(() => {
      const calls = mockFetch.mock.calls
        .filter((args) => args[0].includes('/warnings') && args[1]?.method === 'POST')
        .map((args) => JSON.parse(args[1]?.body as string))
        .filter((body) => body.type === 'atom_count_DBE');

      // Invalid input must not go into the request, it should stay null.
      expect(calls.every((body) => body.formulaDbe === null)).toBe(true);
    });
  });

  // Double peak assignment warning
  it('shows the double-assignment warning icon when one peak is linked to multiple fragments', async () => {
    const user = userEvent.setup();

    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/dbe')) {
        return Promise.resolve({
          ok: true, json: () => Promise.resolve({ dbe: null }),
        } as Response);
      }
      if (url.includes('/fragments/') && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 7,
                exercise_id: 'exercise-1',
                label: 'Fragment A',
                smiles: 'C',
                mol_file: 'mol-block-a',
              },
              {
                id: 8,
                exercise_id: 'exercise-1',
                label: 'Fragment B',
                smiles: 'O',
                mol_file: 'mol-block-b',
              },
            ]),
        } as Response);
      }

      if (url.includes('/warnings') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);

        if (body.type === 'atom_count_DBE') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                type: 'atom_count_DBE',
                warning: false,
                info: '',
              }),
          } as Response);
        }

        expect(body.type).toBe('double_peak_assignment');

        const hasDoubleAssignment = Object.values(
          body.assignmentsByPeak as Record<string, string[]>,
        ).some((fragmentIds) => fragmentIds.length > 1);

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              type: 'double_peak_assignment',
              warning: hasDoubleAssignment,
              info: hasDoubleAssignment ? 'Double assignment' : '',
            }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    });

    renderPage();

    await screen.findByTitle('Fragment 1');
    await screen.findByTitle('Fragment 2');

    await user.click(await screen.findByTitle('Fragment 1'));
    await user.click(await screen.findByText('2.46'));

    expect(
      screen.queryByRole('img', { name: 'Double assignment warning' }),
    ).not.toBeInTheDocument();

    await user.click(await screen.findByTitle('Fragment 2'));
    await user.click(await screen.findByText('2.46'));

    expect(
      await screen.findByRole('img', { name: 'Double assignment warning' }),
    ).toBeInTheDocument();
  });

  describe('URL-based exercise persistence', () => {
    afterEach(() => {
      window.history.replaceState(null, '', '/');
    });

    it('restores the exercise stored in the URL param on mount', async () => {
      window.history.pushState(null, '', '?exercise=2');
      renderPage();

      await waitFor(() => {
        expect(fetchExerciseDetail).toHaveBeenCalledWith(2);
        expect(fetchExerciseDetail).not.toHaveBeenCalledWith(1);
      });
    });

    it('falls back to the first exercise when no URL param is present', async () => {
      renderPage();

      await waitFor(() => {
        expect(fetchExerciseDetail).toHaveBeenCalledWith(1);
      });
    });

    it('falls back to the first exercise when the URL param is not in the exercise list', async () => {
      window.history.pushState(null, '', '?exercise=99999');
      renderPage();

      await waitFor(() => {
        expect(fetchExerciseDetail).toHaveBeenCalledWith(1);
        expect(fetchExerciseDetail).not.toHaveBeenCalledWith(99999);
      });
    });

    it('updates the URL when the user switches exercises', async () => {
      const user = userEvent.setup();
      renderPage();

      await selectExerciseViaMenu(user, 'Exercise 2');

      await waitFor(() => {
        expect(new URLSearchParams(window.location.search).get('exercise')).toBe('2');
      });
    });
  });

  it('does not show the double-assignment warning when each peak is linked only once', async () => {
    const user = userEvent.setup();

    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/dbe')) {
        return Promise.resolve({
          ok: true, json: () => Promise.resolve({ dbe: null }),
        } as Response);
      }
      if (url.includes('/fragments/') && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 7,
                exercise_id: 'exercise-1',
                label: 'Fragment A',
                smiles: 'C',
                mol_file: 'mol-block-a',
              },
              {
                id: 8,
                exercise_id: 'exercise-1',
                label: 'Fragment B',
                smiles: 'O',
                mol_file: 'mol-block-b',
              },
            ]),
        } as Response);
      }

      if (url.includes('/warnings') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);

        if (body.type === 'atom_count_DBE') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                type: 'atom_count_DBE',
                warning: false,
                info: '',
              }),
          } as Response);
        }

        const hasDoubleAssignment = Object.values(
          body.assignmentsByPeak as Record<string, string[]>,
        ).some((fragmentIds) => fragmentIds.length > 1);

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              type: 'double_peak_assignment',
              warning: hasDoubleAssignment,
              info: '',
            }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    });

    renderPage();

    await screen.findByTitle('Fragment 1');
    await screen.findByTitle('Fragment 2');

    // Fragment A → 2.46
    await user.click(await screen.findByTitle('Fragment 1'));
    await user.click(await screen.findByText('2.46'));

    // Fragment B → 2.14
    await user.click(await screen.findByTitle('Fragment 2'));
    await user.click(await screen.findByText('2.14'));

    await waitFor(() => {
      expect(
        screen.queryByRole('img', { name: 'Double assignment warning' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Link inherit options', () => {
    it('renders the Options button', async () => {
      renderPage();

      expect(
        await screen.findByRole('button', { name: /Options/i }),
      ).toBeInTheDocument();
    });

    it('opens the link inherit popup', async () => {
      const user = userEvent.setup();

      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Options/i }),
      );

      expect(
        await screen.findByRole('dialog', {
          name: /Link inherit options/i,
        }),
      ).toBeInTheDocument();
    });

    it('shows all three link inherit options', async () => {
      const user = userEvent.setup();

      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Options/i }),
      );

      expect(
        await screen.findByLabelText(/Merged product won't inherit links/i),
      ).toBeInTheDocument();

      expect(
        await screen.findByLabelText(/Links will be transfered to merged product/i),
      ).toBeInTheDocument();

      expect(
        await screen.findByLabelText(/Fragments keep their links, merged also inherits links/i),
      ).toBeInTheDocument();
    });

    it('shows the warning explanation for copy mode', async () => {
      const user = userEvent.setup();

      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Options/i }),
      );

      expect(
        await screen.findByText(/Warnings from the working fragments are turned off/i),
      ).toBeInTheDocument();

      expect(
        await screen.findByText(/warnings for the working solution are still active/i),
      ).toBeInTheDocument();
    });

    it('changes the selected inherit mode', async () => {
      const user = userEvent.setup();

      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Options/i }),
      );

      const transferOption = await screen.findByLabelText(
        /links will be transfered to merged product/i,
      );

      await user.click(transferOption);

      expect(transferOption).toBeChecked();
    });

    it('saves the selected inherit mode to the backend', async () => {
      const user = userEvent.setup();

      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Options/i }),
      );

      await user.click(
        await screen.findByLabelText(
          /fragments keep their links, merged also inherits links/i,
        ),
      );

      await waitFor(() => {
        const calls = mockFetch.mock.calls.filter(
          (args) =>
            args[0].includes('/api/v1/settings/') &&
            args[1]?.method === 'PUT',
        );

        expect(calls.length).toBeGreaterThan(0);

        const [, init] = calls[calls.length - 1] as [
          string,
          RequestInit,
        ];

        expect(JSON.parse(String(init.body))).toEqual({
          link_inherit_mode: 'copy',
        });
      });
    });

    it('does not send fragment warnings in copy mode', async () => {
      const user = userEvent.setup();

      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/dbe')) {
          return Promise.resolve({
            ok: true, json: () => Promise.resolve({ dbe: null }),
          } as Response);
        }
        if (url.includes('/warnings') && init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                type: 'atom_count_DBE',
                warning: false,
                info: '',
              }),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response);
      });

      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Options/i }),
      );

      await user.click(
        await screen.findByLabelText(
          /fragments keep their links, merged also inherits links/i,
        ),
      );

      await waitFor(() => {
        const warningCalls = mockFetch.mock.calls
          .filter(
            (args) =>
              args[0].includes('/warnings') &&
              args[1]?.method === 'POST',
          )
          .map((args) => JSON.parse(args[1]?.body as string));

        const atomWarnings = warningCalls.filter(
          (body) => body.type === 'atom_count_DBE',
        );

        expect(
          atomWarnings.every(
            (body) => body.fragments.length === 0,
          ),
        ).toBe(true);
      });
    });
  });
  });
