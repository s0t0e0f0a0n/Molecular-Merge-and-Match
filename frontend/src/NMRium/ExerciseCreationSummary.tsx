import { useEffect, useMemo, useState } from 'react';
import { fetchExerciseSummaries } from '../api/exercises';
import { findCasNumberByInchi } from '../api/pubchem';
import type { ExerciseDraftAssignment, NMRiumDraftData, NMRiumDraftSpectrum } from '../api/exerciseCreation';
import { useRDKit } from '../context/RDKitContext';
import { formatChemistryText } from '../utils/formatChemistryText';

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

function displayValue(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(4) : '—';
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function formatPpm(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toFixed(value < 10 ? 2 : 1);
}

function getFormula(inchi: string | undefined): string {
  if (!inchi) return '';
  const parts = inchi.trim().split('/');
  if (!parts[0]?.startsWith('InChI=') || !parts[1]) return '';
  return parts[1].split(/[.+-]/, 1)[0] ?? '';
}

function spectrumNucleus(spectrum: NMRiumDraftSpectrum): string {
  return Array.isArray(spectrum.nucleus)
    ? spectrum.nucleus.join(', ')
    : spectrum.nucleus;
}

function formatNucleusHeader(nucleus: string): string {
  const superscriptDigits: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  };
  return nucleus.replace(/\d/g, (digit) => superscriptDigits[digit] ?? digit);
}

function hasNMRData(spectrum: NMRiumDraftSpectrum): boolean {
  return spectrum.peaks.length > 0 || spectrum.multiplets.length > 0;
}

function getPriority(spectrum: NMRiumDraftSpectrum): number {
  const nucleus = Array.isArray(spectrum.nucleus)
    ? spectrum.nucleus
    : [spectrum.nucleus];
  const priority = ['13C', '1H', '19F', '31P'].findIndex((item) =>
    nucleus.includes(item),
  );
  return priority < 0 ? 4 : priority;
}

type CompactPeakRow = {
  key: string;
  ppm: string;
  integral: string;
  multiplicity: string;
  couplings: string;
};

function formatMultiplet(
  multipletValue: unknown,
  signalValue: unknown,
  nucleus: string,
): {
  integral: string;
  multiplicity: string;
  couplings: string;
} {
  const multiplet = asRecord(multipletValue);
  const signal = asRecord(signalValue);
  const couplings = Array.isArray(signal.js)
    ? signal.js
        .map((item) => asRecord(item).coupling)
        .filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
        .map((item) => String(Number(item.toFixed(2))))
    : [];
  const integration =
    typeof multiplet.integration === 'number'
      ? Math.round(multiplet.integration)
      : multiplet.integrationRounded;
  const integralNucleus = nucleus.replace(/^\d+/, '');
  return {
    integral: typeof integration === 'number' ? `${integration}${integralNucleus}` : '',
    multiplicity:
      typeof signal.multiplicity === 'string' ? signal.multiplicity : '',
    couplings: couplings.length > 0 ? `J = ${couplings.join(', ')} Hz` : '',
  };
}

function sortCompactRows(rows: CompactPeakRow[]): CompactPeakRow[] {
  return rows.sort((left, right) => {
    const leftPpm = Number(left.ppm);
    const rightPpm = Number(right.ppm);
    return Number.isFinite(rightPpm) && Number.isFinite(leftPpm)
      ? rightPpm - leftPpm
      : 0;
  });
}

function getMultipletRows(
  spectrum: NMRiumDraftSpectrum,
  nucleusLabel: string,
): CompactPeakRow[] {
  const rows: CompactPeakRow[] = [];
  spectrum.multiplets.forEach((multipletValue, multipletIndex) => {
    const multiplet = asRecord(multipletValue);
    const signals = Array.isArray(multiplet.signals) ? multiplet.signals : [null];
    signals.forEach((signalValue, signalIndex) => {
      const signal = asRecord(signalValue);
      rows.push({
        key: `multiplet-${multipletIndex}-${signalIndex}`,
        ppm: formatPpm(signal.delta),
        ...formatMultiplet(multiplet, signalValue, nucleusLabel),
      });
    });
  });
  return sortCompactRows(rows);
}

function getPeakRows(
  spectrum: NMRiumDraftSpectrum,
  includeCarbonCount: boolean,
): CompactPeakRow[] {
  const rows = spectrum.peaks.map((peakValue, peakIndex) => {
    const peak = asRecord(peakValue);
    const carbonCount = typeof peak.carbonCount === 'number' ? peak.carbonCount : 1;
    return {
      key: `peak-${peakIndex}`,
      ppm: formatPpm(peak.x),
      integral: includeCarbonCount ? `${carbonCount}C` : '',
      multiplicity: '',
      couplings: '',
    };
  });
  return sortCompactRows(rows);
}

function getCompactRows(spectrum: NMRiumDraftSpectrum): CompactPeakRow[] {
  const nucleusLabel = spectrumNucleus(spectrum).split(',')[0].trim();
  if (spectrum.multiplets.length > 0) {
    return getMultipletRows(spectrum, nucleusLabel);
  }
  return getPeakRows(spectrum, false);
}

function CompactPeakList({ rows }: { rows: CompactPeakRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {rows.map((row) => (
        <div
          key={row.key}
          style={{
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: '3px 5px',
            background: 'white',
            color: 'black',
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <b>{row.ppm}</b>
            {row.integral && <span style={{ fontSize: 11, opacity: 0.7 }}>{row.integral}</span>}
            {row.multiplicity && <span style={{ fontSize: 11, opacity: 0.7 }}>{row.multiplicity}</span>}
            {row.couplings && <span style={{ fontSize: 11, opacity: 0.7 }}>{row.couplings}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SpectrumTables({ spectrum }: { spectrum: NMRiumDraftSpectrum }) {
  const isCarbon13 = (Array.isArray(spectrum.nucleus)
    ? spectrum.nucleus
    : [spectrum.nucleus]
  ).includes('13C');
  const nucleusLabel = spectrumNucleus(spectrum).split(',')[0].trim();
  const rows = isCarbon13 ? [] : getCompactRows(spectrum);
  const carbonMultipletRows = isCarbon13
    ? getMultipletRows(spectrum, nucleusLabel)
    : [];
  const carbonPeakRows = isCarbon13 ? getPeakRows(spectrum, true) : [];

  return (
    <section style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
        {formatNucleusHeader(spectrumNucleus(spectrum))} peaks (ppm)
        {spectrum.info.name ? ` — ${String(spectrum.info.name)}` : ''}
      </div>
      <div style={{ fontSize: 11, marginBottom: 6, color: '#555' }}>
        Solvent: {spectrum.solvent || '—'}
      </div>
      {(spectrum.spectrometer || spectrum.dataSource) && (
        <div style={{ fontSize: 11, marginBottom: 6, color: '#555' }}>
          {[spectrum.spectrometer, spectrum.dataSource].filter(Boolean).join(' · ')}
        </div>
      )}
      {isCarbon13 ? (
        <>
          {carbonMultipletRows.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Multiplets
              </div>
              <CompactPeakList rows={carbonMultipletRows} />
            </div>
          )}
          {carbonPeakRows.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Peak-picked data
              </div>
              <CompactPeakList rows={carbonPeakRows} />
            </div>
          )}
        </>
      ) : (
        <CompactPeakList rows={rows} />
      )}
    </section>
  );
}

export function ExerciseCreationSummary({
  data,
  onPrevious,
  onDataChange,
}: {
  data: NMRiumDraftData;
  onPrevious: () => void;
  onDataChange: (data: NMRiumDraftData) => Promise<void>;
}) {
  const { rdkit, loading, error: rdkitError } = useRDKit();
  const [structureSvg, setStructureSvg] = useState('');
  const [structureError, setStructureError] = useState('');
  const [assignment, setAssignment] = useState<ExerciseDraftAssignment>(
    () => ({
      exerciseSet: data.assignment?.exerciseSet ?? 'Custom NMRium',
      exerciseName: data.assignment?.exerciseName ?? 'Exercise',
      exerciseNumber: data.assignment?.exerciseNumber ?? 1,
      casNumber: data.assignment?.casNumber ?? '',
      tags: Array.from(
        { length: 6 },
        (_unused, index) => data.assignment?.tags[index] ?? '',
      ),
      spacedRepetitionPriority: data.assignment?.spacedRepetitionPriority ?? 0,
    }),
  );
  const [autoNumberAllowed, setAutoNumberAllowed] = useState(
    () => !data.assignment?.exerciseNumber,
  );
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [casLookupBusy, setCasLookupBusy] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const formula = getFormula(data.structure?.inchi);
  const spectra = useMemo(
    () =>
      data.spectra
        .filter(hasNMRData)
        .map((spectrum, index) => ({ spectrum, index }))
        .sort(
          (left, right) =>
            getPriority(left.spectrum) - getPriority(right.spectrum) ||
            left.index - right.index,
        )
        .map(({ spectrum }) => spectrum),
    [data.spectra],
  );

  useEffect(() => {
    if (
      !autoNumberAllowed ||
      !assignment.exerciseSet.trim() ||
      !assignment.exerciseName.trim()
    ) {
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      void fetchExerciseSummaries()
        .then((summaries) => {
          const setName = assignment.exerciseSet.trim().toLocaleLowerCase();
          const baseName = assignment.exerciseName.trim();
          const escapedName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const numberedName = new RegExp(`^${escapedName}\\s+(\\d+)$`, 'i');
          const matchingNumbers = summaries.flatMap((summary) => {
            if ((summary.exercise_set ?? '').trim().toLocaleLowerCase() !== setName) {
              return [];
            }
            const match = summary.name?.trim().match(numberedName);
            return match ? [Number(match[1])] : [];
          });
          const nextNumber =
            matchingNumbers.length > 0 ? Math.max(...matchingNumbers) + 1 : 1;
          if (active) {
            setAssignment((current) =>
              current.exerciseNumber === nextNumber
                ? current
                : { ...current, exerciseNumber: nextNumber },
            );
          }
        })
        .catch((caught: unknown) => {
          if (active) {
            setAssignmentMessage(
              caught instanceof Error
                ? `Could not find the next exercise number: ${caught.message}`
                : 'Could not find the next exercise number.',
            );
          }
        });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [assignment.exerciseName, assignment.exerciseSet, autoNumberAllowed]);

  const saveAssignment = async () => {
    setAssignmentSaving(true);
    setAssignmentMessage('');
    try {
      const saved = {
        ...assignment,
        exerciseSet: assignment.exerciseSet.trim(),
        exerciseName: assignment.exerciseName.trim(),
        casNumber: assignment.casNumber.trim(),
        tags: assignment.tags.map((tag) => tag.trim()),
      };
      await onDataChange({ ...data, assignment: saved });
      setAssignment(saved);
      setAssignmentMessage('Exercise details saved.');
    } catch (caught) {
      setAssignmentMessage(
        caught instanceof Error
          ? `Could not save exercise details: ${caught.message}`
          : 'Could not save exercise details.',
      );
    } finally {
      setAssignmentSaving(false);
    }
  };

  const lookupCasNumber = async () => {
    const inchi = data.structure?.inchi;
    if (!inchi) {
      setAssignmentMessage('A saved InChI is required for PubChem lookup.');
      return;
    }
    setCasLookupBusy(true);
    setAssignmentMessage('');
    try {
      const casNumber = await findCasNumberByInchi(inchi);
      if (!casNumber) {
        setAssignmentMessage('PubChem returned no CAS number for this InChI.');
        return;
      }
      setAssignment((current) => ({ ...current, casNumber }));
      setAssignmentMessage(`CAS number found: ${casNumber}. Save exercise details to store it.`);
    } catch (caught) {
      setAssignmentMessage(
        caught instanceof Error ? caught.message : 'PubChem CAS lookup failed.',
      );
    } finally {
      setCasLookupBusy(false);
    }
  };

  useEffect(() => {
    if (!rdkit || !data.structure?.smiles) {
      setStructureSvg('');
      setStructureError('');
      return;
    }
    const molecule = rdkit.get_mol(data.structure.smiles);
    try {
      if (!molecule?.is_valid()) {
        setStructureSvg('');
        setStructureError('RDKit could not render the saved SMILES.');
        return;
      }
      setStructureError('');
      setStructureSvg(molecule.get_svg(158, 113));
    } catch (caught) {
      setStructureSvg('');
      setStructureError(
        caught instanceof Error
          ? caught.message
          : 'Could not render the saved SMILES.',
      );
    } finally {
      molecule?.delete();
    }
  }, [rdkit, data.structure?.smiles]);

  return (
    <main style={{ height: '100vh', overflow: 'auto', padding: 16, boxSizing: 'border-box' }}>
      <div role="toolbar" aria-label="Exercise creation steps">
        <button type="button" onClick={onPrevious}>
          Previous
        </button>
        <strong style={{ marginLeft: 12 }}>Step 3: Continue exercise creation</strong>
      </div>
      <h2>Exercise assignment</h2>
      <p>
        Exercise name to be created:{' '}
        <strong>
          {assignment.exerciseName} {assignment.exerciseNumber}
        </strong>
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
          maxWidth: 1000,
        }}
      >
        <label>
          Exercise set name
          <input
            value={assignment.exerciseSet}
            onChange={(event) => {
              const exerciseSet = event.currentTarget.value;
              setAutoNumberAllowed(true);
              setAssignment((current) => ({
                ...current,
                exerciseSet,
              }));
            }}
          />
        </label>
        <label>
          Exercise name
          <input
            value={assignment.exerciseName}
            onChange={(event) => {
              const exerciseName = event.currentTarget.value;
              setAutoNumberAllowed(true);
              setAssignment((current) => ({
                ...current,
                exerciseName,
              }));
            }}
          />
        </label>
        <label>
          Exercise number
          <input
            type="number"
            min={1}
            step={1}
            value={assignment.exerciseNumber}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              setAutoNumberAllowed(false);
              setAssignment((current) => ({
                ...current,
                exerciseNumber:
                  Number.isInteger(value) && value >= 1
                    ? value
                    : current.exerciseNumber,
              }));
            }}
          />
        </label>
        <label>
          CAS number
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={assignment.casNumber}
                onChange={(event) => {
                  const casNumber = event.currentTarget.value;
                  setAssignment((current) => ({
                    ...current,
                    casNumber,
                  }));
                }}
            />
            <button type="button" onClick={lookupCasNumber} disabled={casLookupBusy}>
              {casLookupBusy ? 'Looking up…' : 'Find CAS'}
            </button>
          </div>
        </label>
        <label>
          Spaced Repetition mode priority
          <select
            value={assignment.spacedRepetitionPriority}
            onChange={(event) =>
              setAssignment((current) => ({
                ...current,
                spacedRepetitionPriority: Number(event.currentTarget.value),
              }))
            }
          >
            {Array.from({ length: 11 }, (_unused, value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset
        style={{
          border: 0,
          padding: 0,
          margin: '12px 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 8,
          maxWidth: 1000,
        }}
      >
        <legend>Tags</legend>
        {assignment.tags.map((tag, index) => (
          <label key={index}>
            Tag {index + 1}
            <input
              value={tag}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setAssignment((current) => ({
                  ...current,
                  tags: current.tags.map((tagValue, tagIndex) =>
                    tagIndex === index ? value : tagValue,
                  ),
                }));
              }}
            />
          </label>
        ))}
      </fieldset>
      <button type="button" onClick={saveAssignment} disabled={assignmentSaving}>
        {assignmentSaving ? 'Saving…' : 'Save exercise details'}
      </button>
      {assignmentMessage && <p role="status">{assignmentMessage}</p>}
      <h2>Structure and NMR data saved</h2>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3>Molecular formula</h3>
          <p>{formula ? formatChemistryText(formula) : 'Not available from the saved InChI.'}</p>
          <h3>Molecular structure</h3>
          {loading && <p role="status">Loading structure renderer…</p>}
          {rdkitError && <p role="alert">{rdkitError}</p>}
          {structureError && <p role="alert">{structureError}</p>}
          {structureSvg && (
            <div
              aria-label="Structure rendered from saved SMILES"
              style={{ width: 158, maxWidth: '100%' }}
              dangerouslySetInnerHTML={{ __html: structureSvg }}
            />
          )}
        </div>
        <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <p>SMILES: {data.structure?.smiles ?? '—'}</p>
          <p>InChI: {data.structure?.inchi ?? '—'}</p>
        </div>
      </div>
      <h2>Stored NMRium data</h2>
      {spectra.length === 0 ? (
        <p>No analyzed spectra were stored.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            columnGap: 30,
            rowGap: 12,
            alignItems: 'start',
          }}
        >
        {spectra.map((spectrum, index) => (
          <div
            key={spectrum.id}
            style={{
              minWidth: 0,
              borderLeft:
                index > 0 &&
                spectrumNucleus(spectra[index - 1]) !== spectrumNucleus(spectrum)
                  ? '3px solid #57606a'
                  : undefined,
              paddingLeft:
                index > 0 &&
                spectrumNucleus(spectra[index - 1]) !== spectrumNucleus(spectrum)
                  ? 10
                  : 0,
            }}
          >
            <SpectrumTables spectrum={spectrum} />
          </div>
        ))
        }
        </div>
      )}
      <details>
        <summary>View saved exercise data</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </main>
  );
}
