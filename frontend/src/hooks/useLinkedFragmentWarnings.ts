import { useEffect, useRef } from 'react';
import type { BackendFragment } from './useFragments';
import { useExerciseData } from '../context/ExerciseDataContext';
import { useWarning, type WarningResponse } from '../context/WarningContext';

const API = `/api/v1/warnings/`;

export function useLinkedFragmentWarnings(
  linksByFragment: Map<string, string[]>,
  linksByPeak: Map<string, string[]>,
  fragments: BackendFragment[],
  molecularFormula?: string,
  formulaDbe?: number | null,
  exerciseId?: number | null,
) {
  const { setWarningResult } = useWarning();
  const { loadingSelectedExercise } = useExerciseData();
  const doubleAssignmentRequestIdRef = useRef(0);
  const atomCountRequestIdRef = useRef(0);

  const linkedFragmentSmilesKey = Array.from(linksByFragment.entries())
    .filter(([, peakIds]) => peakIds.length > 0)
    .map(([fragmentId]) => {
      const fragment = fragments.find((f) => String(f.id) === fragmentId);
      return fragment?.smiles;
    })
    .filter((smiles): smiles is string => Boolean(smiles))
    .sort()
    .join('|');

  const assignmentsByPeakKey = Array.from(linksByPeak.entries())
    .map(([peakId, fragmentIds]) => [
      peakId,
      [...fragmentIds].sort(),
    ] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([peakId, fragmentIds]) => `${peakId}:${fragmentIds.join(',')}`)
    .join('|');

  useEffect(() => {
    if (loadingSelectedExercise) {
      setWarningResult({
        type: 'double_peak_assignment',
        warning: false,
        info: '',
      });
      return;
    }

    const assignmentsByPeak = Object.fromEntries(
      Array.from(linksByPeak.entries()).map(([peakId, fragmentIds]) => [
        peakId,
        fragmentIds,
      ]),
    );

    const requestId = ++doubleAssignmentRequestIdRef.current;
    const controller = new AbortController();

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        type: 'double_peak_assignment',
        assignmentsByPeak,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Double assignment warning request failed with status ${res.status}`);
        }

        const data: WarningResponse = await res.json();
        if (requestId !== doubleAssignmentRequestIdRef.current || controller.signal.aborted) {
          return;
        }

        setWarningResult(data);
      })
      .catch((err) => {
        if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          return;
        }

        console.error(
          'Failed to update double peak assignment warning',
          err,
        );
      });

    return () => {
      controller.abort();
    };
  }, [assignmentsByPeakKey, linksByPeak, loadingSelectedExercise, setWarningResult, exerciseId]);

  useEffect(() => {
    if (loadingSelectedExercise) {
      setWarningResult({
        type: 'atom_count_DBE',
        warning: false,
        info: 'Loading exercise',
      });
      return;
    }

    const linkedFragmentSmiles = linkedFragmentSmilesKey
      ? linkedFragmentSmilesKey.split('|')
      : [];

    const requestId = ++atomCountRequestIdRef.current;
    const controller = new AbortController();

    if (linkedFragmentSmiles.length === 0 || !molecularFormula) {
      setWarningResult({
        type: 'atom_count_DBE',
        warning: false,
        info: 'No fragments linked',
      });
      return () => {
        controller.abort();
      };
    }

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        type: 'atom_count_DBE',
        fragments: linkedFragmentSmiles,
        molecularFormula,
        formulaDbe,
        hydrogenInWarning: false,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Warning request failed with status ${res.status}`);
        }

        const data: WarningResponse = await res.json();
        if (requestId !== atomCountRequestIdRef.current || controller.signal.aborted) {
          return;
        }

        setWarningResult(data);
      })
      .catch((err) => {
        if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          return;
        }

        console.error(
          'Failed to send linked fragments to backend or update WarningPanel',
          err,
        );
      });

    return () => {
      controller.abort();
    };
  }, [linkedFragmentSmilesKey, molecularFormula, formulaDbe, loadingSelectedExercise, setWarningResult, exerciseId]);
}