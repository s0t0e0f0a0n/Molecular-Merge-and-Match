import { isSpectrum1D, isSpectrum2D } from '@zakodium/nmrium-core';
import initNmriumCore from '@zakodium/nmrium-core-plugins';
import { default1DApodization } from 'nmr-processing';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { NMRium } from 'nmrium';
import type { NMRiumPlugin } from '@zakodium/nmrium-core';
import { getDefaultFilterOptions } from '../../node_modules/nmrium/lib/component/utility/getDefaultFilterOptions.js';
// NMRium exposes reducer actions to its UI through internal context hooks, not its public plugin API.
import { useChartData } from '../../node_modules/nmrium/lib/component/context/ChartContext.js';
import { useDispatch } from '../../node_modules/nmrium/lib/component/context/DispatchContext.js';

import 'normalize.css/normalize.css';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';

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
              throw new Error('NMRium default apodization settings are missing exponential options.');
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
  const [status, setStatus] = useState('');
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

  return (
    <AutomationBridgeContext.Provider value={bridge}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
        <div
          role="toolbar"
          aria-label="NMRium actions"
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
          <button type="button">Store</button>
          <button type="button">Next</button>
          <span role="status" aria-live="polite" style={{ marginLeft: 8 }}>
            {status}
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <NMRium core={core} />
        </div>
      </div>
    </AutomationBridgeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<NMRiumF8App />);
