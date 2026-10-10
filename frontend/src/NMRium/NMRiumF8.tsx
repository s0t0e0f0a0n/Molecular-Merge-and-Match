import { isSpectrum1D, isSpectrum2D } from '@zakodium/nmrium-core';
import initNmriumCore from '@zakodium/nmrium-core-plugins';
import { default1DApodization } from 'nmr-processing';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactDOM from 'react-dom/client';
import { NMRium } from 'nmrium';
import type { NMRiumPlugin } from '@zakodium/nmrium-core';
import { getDefaultFilterOptions } from '../../node_modules/nmrium/lib/component/utility/getDefaultFilterOptions.js';
import { useChartData } from '../../node_modules/nmrium/lib/component/context/ChartContext.js';
import { useDispatch } from '../../node_modules/nmrium/lib/component/context/DispatchContext.js';
import 'normalize.css/normalize.css';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';

import {
  createExerciseCreationDraft,
  fetchExerciseCreationDraft,
  updateExerciseCreationDraft,
  ExerciseCreationDraftError,
  type ExerciseCreationDraft,
  type NMRiumDraftData,
  type NMRiumDraftSpectrum,
} from '../api/exerciseCreation';
import { RDKitProvider } from '../context/RDKitContext';
import { ExerciseCreationKetcherStep } from './ExerciseCreationKetcherStep';
import { ExerciseCreationSummary } from './ExerciseCreationSummary';

const DRAFT_ID_KEY = 'nmriumExerciseCreationDraftId';

type AutomationResult = {
  oneDimensionalCount: number;
  twoDimensionalCount: number;
  phasedCount: number;
  skippedPhaseCount: number;
};

type AutomationBridgeValue = {
  register: (automation: (() => AutomationResult) | null) => void;
};

const AutomationBridgeContext = createContext<AutomationBridgeValue | null>(null);

type SpectrumRecord = {
  id?: string;
  info?: Record<string, unknown> & { dimension?: number; nucleus?: string | string[] };
  customInfo?: Record<string, unknown>;
  solvent?: unknown;
  ranges?: { values?: unknown[] };
  peaks?: { values?: unknown[] };
};

type NMRiumSource = {
  baseURL?: string;
  entries?: Array<{
    relativePath?: string;
    originalRelativePath?: string;
  }>;
};

function getSourcePaths(sources: unknown): string[] {
  if (!Array.isArray(sources)) return [];

  const paths = new Set<string>();
  for (const source of sources as NMRiumSource[]) {
    if (!source || typeof source !== 'object') continue;
    const baseURL = source.baseURL?.replace(/\/+$/, '');
    if (baseURL && !baseURL.startsWith('ium:')) paths.add(baseURL);

    for (const entry of source.entries ?? []) {
      const relativePath = entry.originalRelativePath ?? entry.relativePath;
      if (!relativePath) continue;
      const fullPath =
        baseURL && !baseURL.startsWith('ium:')
          ? `${baseURL}/${relativePath.replace(/^\/+/, '')}`
          : relativePath;
      paths.add(fullPath);
    }
  }
  return [...paths];
}

function getMetadataStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(getMetadataStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(getMetadataStrings);
  }
  return [];
}

type ParsedDataSource = {
  spectrometer: string | null;
  session: string | null;
  experimentNumber: string | null;
  path: string | null;
};

function getDataSource(
  metadata: unknown[],
  experiment: string | number | undefined,
): ParsedDataSource {
  const experimentName = experiment === undefined ? undefined : String(experiment);
  const strings = metadata.flatMap(getMetadataStrings);
  const host = strings
    .map((text) => text.match(/[\w.-]+@([^\s/]+)/i)?.[1]?.replace(/[),;]+$/, '') ?? null)
    .find((value): value is string => value !== null)
    ?.replace(/\.+$/, '') ?? null;

  for (const text of strings) {
    const normalizedPath = text.replaceAll('\\', '/');
    const dataMarker = /(?:^|\/)data\//i.exec(normalizedPath);
    if (!dataMarker) continue;

    const afterData = normalizedPath.slice(
      dataMarker.index + dataMarker[0].length,
    );
    const segments = afterData.split('/').filter(Boolean);
    const nmrIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === 'nmr',
    );
    const sessionIndex = nmrIndex >= 0 ? nmrIndex + 1 : -1;
    if (sessionIndex < 0 || sessionIndex >= segments.length) continue;

    const experimentIndex = segments.findIndex(
      (segment, index) =>
        index > sessionIndex &&
        experimentName !== undefined &&
        (segment === experimentName || segment.startsWith(`${experimentName}.`)),
    );
    const dataTailIndex = segments.findIndex(
      (segment, index) =>
        index > sessionIndex &&
        ['acqu', 'pdata', 'fid', 'ser', 'proc', 'procs'].includes(
          segment.toLowerCase(),
        ),
    );
    const folderIndex =
      experimentIndex >= 0
        ? experimentIndex
        : dataTailIndex >= 0
          ? dataTailIndex - 1
          : segments.length - 1;
    if (folderIndex <= sessionIndex) continue;

    const session = segments[sessionIndex];
    const experimentNumber = segments[folderIndex] ?? null;
    const path =
      experimentNumber === null
        ? null
        : segments.slice(0, folderIndex + 1).join('/');
    return {
      spectrometer: host,
      session,
      experimentNumber,
      path,
    };
  }
  return {
    spectrometer: host,
    session: null,
    experimentNumber: experimentName ?? null,
    path: null,
  };
}

function addRoundedIntegrals(ranges: unknown[]): unknown[] {
  return ranges.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const range = value as Record<string, unknown>;
    const integration =
      typeof range.integration === 'number' && Number.isFinite(range.integration)
        ? Math.round(range.integration)
        : range.integration;
    return {
      ...range,
      ...(typeof range.integration === 'number' && Number.isFinite(range.integration)
        ? { integrationRaw: range.integration, integration }
        : {}),
    };
  });
}

function getSpectrumSolvent(spectrum: SpectrumRecord): string | null {
  const customSolvent = Object.entries(spectrum.customInfo ?? {}).find(
    ([key]) => key.trim().toLowerCase() === 'solvent',
  )?.[1];

  for (const value of [spectrum.info?.solvent, customSolvent, spectrum.solvent]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return null;
}

function getNMRiumDraftData(
  spectra: unknown,
  sources: unknown,
  molecules: unknown,
): NMRiumDraftData {
  const sourcePaths = getSourcePaths(sources);
  const sourceMetadata = Array.isArray(sources) ? sources : [];
  const values = Array.isArray(spectra)
    ? spectra
    : spectra && typeof spectra === 'object'
      ? Object.values(spectra)
      : [];

  const oneDimensionalSpectra = values.filter((value): value is SpectrumRecord => {
    if (!value || typeof value !== 'object') return false;
    const spectrum = value as SpectrumRecord;
    return spectrum.info?.dimension === 1;
  });

  const mappedSpectra: NMRiumDraftSpectrum[] = oneDimensionalSpectra.map(
    (spectrum, index) => {
      const experiment =
        typeof spectrum.info?.experimentNumber === 'string' ||
        typeof spectrum.info?.experimentNumber === 'number'
          ? spectrum.info.experimentNumber
          : typeof spectrum.info?.name === 'string'
            ? spectrum.info.name
            : undefined;
      const source = getDataSource(
        [spectrum, sourcePaths, sourceMetadata],
        experiment,
      );
      return {
        id: spectrum.id ?? `spectrum-${index + 1}`,
        dimension: 1,
        nucleus: spectrum.info?.nucleus ?? 'Unknown',
        info: spectrum.info ?? {},
        solvent: getSpectrumSolvent(spectrum),
        peaks: Array.isArray(spectrum.peaks?.values)
          ? spectrum.peaks.values
          : [],
        multiplets: addRoundedIntegrals(
          Array.isArray(spectrum.ranges?.values)
            ? spectrum.ranges.values
            : [],
        ),
        spectrometer: source.spectrometer,
        sourceSession: source.session,
        experimentNumber: source.experimentNumber,
        dataSource: source.path,
      };
    },
  );

  const mappedMolecules = Array.isArray(molecules)
    ? molecules.flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const molfile = (value as { molfile?: unknown }).molfile;
        return typeof molfile === 'string' ? [{ molfile }] : [];
      })
    : [];
  return {
    spectra: mappedSpectra,
    molecules: mappedMolecules,
    sourcePaths,
    sourceMetadata,
  };
}

function AutomationDispatchBridge() {
  const bridge = useContext(AutomationBridgeContext);
  const state = useChartData();
  const dispatch = useDispatch();
  const stateRef = useRef(state);
  const dispatchRef = useRef(dispatch);
  stateRef.current = state;
  dispatchRef.current = dispatch;

  if (!bridge) {
    throw new Error('NMRium automation bridge is not available.');
  }

  useEffect(() => {
    bridge.register(() => {
      const currentState = stateRef.current;
      const dispatchAction = dispatchRef.current;
      const spectraByNucleus = new Map<string, typeof state.data>();

      for (const spectrum of currentState.data) {
        const nucleus = Array.isArray(spectrum.info.nucleus)
          ? spectrum.info.nucleus.join(',')
          : spectrum.info.nucleus;
        const spectra = spectraByNucleus.get(nucleus) ?? [];
        spectra.push(spectrum);
        spectraByNucleus.set(nucleus, spectra);
      }

      const previousTab = currentState.view.spectra.activeTab;
      const previousSelections = new Map(
        Array.from(spectraByNucleus.keys(), (nucleus) => [
          nucleus,
          (currentState.view.spectra.activeSpectra[nucleus] ?? []).map(({ id }) => id),
        ]),
      );

      let oneDimensionalCount = 0;
      let twoDimensionalCount = 0;
      let phasedCount = 0;
      let skippedPhaseCount = 0;

      for (const [nucleus, spectra] of spectraByNucleus) {
        dispatchAction({ type: 'SET_ACTIVE_TAB', payload: { tab: nucleus } });
        let activeSelection = previousSelections.get(nucleus) ?? [];

        for (const spectrum of spectra) {
          if (activeSelection.length !== 1 || activeSelection[0] !== spectrum.id) {
            dispatchAction({
              type: 'CHANGE_ACTIVE_SPECTRUM',
              payload: { id: spectrum.id },
            });
            activeSelection = [spectrum.id];
          }

          if (isSpectrum1D(spectrum)) {
            oneDimensionalCount += 1;
            const apodizationFilter = spectrum.filters.find(
              (filter) => filter.name === 'apodization',
            );
            const defaultApodization = structuredClone(default1DApodization);
            const defaultExponential = defaultApodization.exponential;
            if (!defaultExponential) {
              throw new Error(
                'NMRium default apodization settings are missing exponential options.',
              );
            }
            const currentApodization = apodizationFilter?.value;
            const apodizationOptions = {
              ...defaultApodization,
              ...currentApodization,
              exponential: {
                ...defaultExponential,
                ...currentApodization?.exponential,
                options: {
                  ...defaultExponential.options,
                  ...currentApodization?.exponential?.options,
                },
                apply: false,
              },
              sineBell: {
                ...defaultApodization.sineBell,
                ...currentApodization?.sineBell,
                apply:
                  currentApodization?.sineBell?.apply ??
                  defaultApodization.sineBell?.apply ??
                  false,
                options: {
                  offset:
                    currentApodization?.sineBell?.options?.offset ??
                    defaultApodization.sineBell?.options?.offset ??
                    0,
                },
              },
              sineSquare: {
                ...defaultApodization.sineSquare,
                ...currentApodization?.sineSquare,
                apply:
                  currentApodization?.sineSquare?.apply ??
                  defaultApodization.sineSquare?.apply ??
                  false,
                options: {
                  offset:
                    currentApodization?.sineSquare?.options?.offset ??
                    defaultApodization.sineSquare?.options?.offset ??
                    0,
                },
              },
              traf: {
                ...defaultApodization.traf,
                ...currentApodization?.traf,
                apply:
                  currentApodization?.traf?.apply ??
                  defaultApodization.traf?.apply ??
                  false,
                options: {
                  lineBroadening:
                    currentApodization?.traf?.options?.lineBroadening ??
                    defaultApodization.traf?.options?.lineBroadening ??
                    0.3,
                },
              },
              gaussian: {
                ...defaultApodization.gaussian,
                ...currentApodization?.gaussian,
                apply:
                  currentApodization?.gaussian?.apply ??
                  defaultApodization.gaussian?.apply ??
                  false,
                options: {
                  lineBroadening:
                    currentApodization?.gaussian?.options?.lineBroadening ??
                    defaultApodization.gaussian?.options?.lineBroadening ??
                    -0.4,
                  lineBroadeningCenter:
                    currentApodization?.gaussian?.options?.lineBroadeningCenter ??
                    defaultApodization.gaussian?.options?.lineBroadeningCenter ??
                    0.5,
                },
              },
            };

            dispatchAction({
              type: 'SET_FILTER_SNAPSHOT',
              payload: {
                filter: apodizationFilter ?? getDefaultFilterOptions('apodization'),
                tempRollback: false,
              },
            });
            dispatchAction({
              type: 'APPLY_APODIZATION_FILTER',
              payload: { options: apodizationOptions },
            });

            if (spectrum.info.isFt) {
              const phaseCorrectionFilter = spectrum.filters.find(
                (filter) => filter.name === 'phaseCorrection',
              );
              dispatchAction({
                type: 'SET_FILTER_SNAPSHOT',
                payload: {
                  filter:
                    phaseCorrectionFilter ?? getDefaultFilterOptions('phaseCorrection'),
                  tempRollback: false,
                },
              });
              dispatchAction({ type: 'APPLY_AUTO_PHASE_CORRECTION_FILTER' });
              phasedCount += 1;
            } else {
              skippedPhaseCount += 1;
            }
          } else if (isSpectrum2D(spectrum)) {
            twoDimensionalCount += 1;
            if (spectrum.info.isFt) {
              const phaseCorrectionFilter = spectrum.filters.find(
                (filter) => filter.name === 'phaseCorrectionTwoDimensions',
              );
              dispatchAction({
                type: 'SET_FILTER_SNAPSHOT',
                payload: {
                  filter:
                    phaseCorrectionFilter ??
                    getDefaultFilterOptions('phaseCorrectionTwoDimensions'),
                  tempRollback: false,
                },
              });
              dispatchAction({ type: 'APPLY_AUTO_PHASE_CORRECTION_TOW_DIMENSION_FILTER' });
              phasedCount += 1;
            } else {
              skippedPhaseCount += 1;
            }
          }
        }

        if (spectra.some(isSpectrum2D)) {
          dispatchAction({
            type: 'DELETE_SPECTRA_FILTER',
            payload: { filterName: 'shift2DX' },
          });
          dispatchAction({
            type: 'DELETE_SPECTRA_FILTER',
            payload: { filterName: 'shift2DY' },
          });
        }

        const previousSelection = previousSelections.get(nucleus) ?? [];
        if (previousSelection.length === 0 && activeSelection.length === 1) {
          dispatchAction({
            type: 'CHANGE_ACTIVE_SPECTRUM',
            payload: {
              id: activeSelection[0],
              modifier: 'shift[false]_ctrl[true]',
            },
          });
        } else if (previousSelection.length > 0) {
          const [firstId, ...remainingIds] = previousSelection;
          if (activeSelection.length !== 1 || activeSelection[0] !== firstId) {
            dispatchAction({
              type: 'CHANGE_ACTIVE_SPECTRUM',
              payload: { id: firstId },
            });
            activeSelection = [firstId];
          }
          for (const id of remainingIds) {
            dispatchAction({
              type: 'CHANGE_ACTIVE_SPECTRUM',
              payload: { id, modifier: 'shift[false]_ctrl[true]' },
            });
          }
        }
      }

      if (previousTab) {
        dispatchAction({ type: 'SET_ACTIVE_TAB', payload: { tab: previousTab } });
      }

      return {
        oneDimensionalCount,
        twoDimensionalCount,
        phasedCount,
        skippedPhaseCount,
      };
    });

    return () => bridge.register(null);
  }, [bridge]);

  return null;
}

const automationPlugin: NMRiumPlugin = {
  id: 'molecular-merge-and-match#F8AutomationBridge',
  version: 1,
  migrations: [],
  shouldSerialize: false,
  ui: {
    'topbar.right': AutomationDispatchBridge,
  },
};

function NMRiumF8App() {
  const automationRef = useRef<(() => AutomationResult) | null>(null);
  const bridge = useMemo<AutomationBridgeValue>(
    () => ({
      register: (automation) => {
        automationRef.current = automation;
      },
    }),
    [],
  );
  const core = useMemo(() => {
    const nmriumCore = initNmriumCore();
    nmriumCore.registerPlugin(automationPlugin);
    return nmriumCore;
  }, []);
  const [status, setStatus] = useState('');
  const [spectra, setSpectra] = useState<unknown>([]);
  const [sources, setSources] = useState<unknown>([]);
  const [molecules, setMolecules] = useState<unknown>([]);
  const [draft, setDraft] = useState<ExerciseCreationDraft | null>(null);
  const [step, setStep] = useState<'nmrium' | 'ketcher' | 'summary'>('nmrium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function runAutomaticFormatting() {
    if (!automationRef.current) {
      setStatus('NMRium is still initializing. Try again in a moment.');
      return;
    }

    const result = automationRef.current();
    if (result.oneDimensionalCount + result.twoDimensionalCount === 0) {
      setStatus('Load spectra before running automatic formatting.');
      return;
    }

    setStatus(
      `Formatted ${result.oneDimensionalCount} 1D and ${result.twoDimensionalCount} 2D spectra. ` +
        `Auto-phased ${result.phasedCount}; skipped ${result.skippedPhaseCount} spectrum/spectra not yet Fourier transformed.`,
    );
  }

  const handleNMRiumChange = useCallback(
    (
      state: { data: { spectra: unknown; sources?: unknown; molecules?: unknown } },
      source: string,
    ) => {
      if (source === 'data') {
        setSpectra(state.data.spectra);
        setSources(state.data.sources ?? []);
        setMolecules(state.data.molecules ?? []);
      }
    },
    [],
  );

  const handleStore = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = getNMRiumDraftData(spectra, sources, molecules);
      const storedId = window.localStorage.getItem(DRAFT_ID_KEY);
      let savedDraft: ExerciseCreationDraft;
      if (storedId) {
        try {
          savedDraft = await updateExerciseCreationDraft(storedId, data);
        } catch (caught) {
          if (!(caught instanceof ExerciseCreationDraftError) || caught.status !== 404) {
            throw caught;
          }
          savedDraft = await createExerciseCreationDraft(data);
        }
      } else {
        savedDraft = await createExerciseCreationDraft(data);
      }
      window.localStorage.setItem(DRAFT_ID_KEY, savedDraft.id);
      setDraft(savedDraft);
      setNotice(`Stored ${data.spectra.length} spectrum/spectra in the exercise draft.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not store the NMRium data.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleNext = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const draftId = draft?.id ?? window.localStorage.getItem(DRAFT_ID_KEY);
      if (!draftId) {
        throw new Error('Store the NMRium data before continuing.');
      }
      const savedDraft = await fetchExerciseCreationDraft(draftId);
      setDraft(savedDraft);
      setStep('ketcher');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not load the saved exercise draft.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePeakMultipletChange = async (data: NMRiumDraftData) => {
    if (!draft) {
      throw new Error('The exercise draft is not loaded.');
    }
    const savedDraft = await updateExerciseCreationDraft(draft.id, data);
    setDraft(savedDraft);
  };

  if (step === 'summary' && draft) {
    return (
      <ExerciseCreationSummary
        data={draft.nmrium_data}
        onPrevious={() => setStep('ketcher')}
        onDataChange={handlePeakMultipletChange}
      />
    );
  }

  if (step === 'ketcher' && draft) {
    return (
      <ExerciseCreationKetcherStep
        data={draft.nmrium_data}
        onPrevious={() => setStep('nmrium')}
        onNext={() => setStep('summary')}
        onDataChange={handlePeakMultipletChange}
      />
    );
  }

  return (
    <AutomationBridgeContext.Provider value={bridge}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
        <div
          role="toolbar"
          aria-label="Exercise creation steps"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderBottom: '1px solid #d8dee4',
            background: '#f6f8fa',
          }}
        >
          <button type="button" onClick={runAutomaticFormatting}>
            Automatic formatting
          </button>
          <strong style={{ marginRight: 'auto' }}>Step 1: Prepare NMRium data</strong>
          <button type="button" onClick={handleStore} disabled={busy}>
            {busy ? 'Working…' : 'Store'}
          </button>
          <button type="button" onClick={handleNext} disabled={busy}>
            Next
          </button>
          {notice && <span role="status" aria-live="polite">{notice}</span>}
          {error && <span role="alert">{error}</span>}
          {status && <span role="status" aria-live="polite">{status}</span>}
        </div>
        <div
          style={{
            display: 'flex',
            flex: 1,
            height: '100%',
            minHeight: 0,
            width: '100%',
          }}
        >
          <NMRium core={core} onChange={handleNMRiumChange} />
        </div>
      </div>
    </AutomationBridgeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RDKitProvider>
    <NMRiumF8App />
  </RDKitProvider>,
);
