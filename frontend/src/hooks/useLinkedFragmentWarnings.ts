import { useEffect } from 'react';
import type { BackendFragment } from './useFragments';
import { useWarning, type WarningResponse } from '../context/WarningContext';

const API = `/api/v1/warnings/`;

export function useLinkedFragmentWarnings(
  linksByFragment: Map<string, string[]>,
  linksByPeak: Map<string, string[]>,
  fragments: BackendFragment[],
  molecularFormula?: string,
  formulaDbe?: number | null,
){
  const { setWarningResult } = useWarning();

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
    const assignmentsByPeak = Object.fromEntries(
      Array.from(linksByPeak.entries()).map(([peakId, fragmentIds]) => [
        peakId,
        fragmentIds,
      ]),
    );

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        setWarningResult(data);
      })
      .catch((err) => {
        console.error(
          'Failed to update double peak assignment warning',
          err,
        );
      });
  }, [assignmentsByPeakKey, linksByPeak, setWarningResult]);

  useEffect(() => {
    const linkedFragmentSmiles = linkedFragmentSmilesKey
      ? linkedFragmentSmilesKey.split('|')
      : [];  
  
    if (linkedFragmentSmiles.length === 0 || !molecularFormula) {
      setWarningResult({
        type: 'atom_count_DBE',
        warning: false,
        info: 'No fragments linked',
      });
      return;
    }

    //console.log('warning effect running', {  //for use in debugging
    //    linkedFragmentSmilesKey,
    //    linkedFragmentSmiles,
    //    molecularFormula,
    //  });

  

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        setWarningResult(data);
      })
      .catch((err) => {
        console.error(
          'Failed to send linked fragments to backend or update WarningPanel',
          err,
        );
      });
  }, [linkedFragmentSmilesKey, molecularFormula, formulaDbe, setWarningResult]);
}