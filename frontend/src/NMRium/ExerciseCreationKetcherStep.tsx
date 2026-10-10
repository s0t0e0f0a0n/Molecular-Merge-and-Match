import { useMemo, useRef, useState } from 'react';
import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import type { Ketcher, StructServiceProvider } from 'ketcher-core';
import 'ketcher-react/dist/index.css';

import type { NMRiumDraftData } from '../api/exerciseCreation';

type DataRecord = Record<string, unknown>;

function asRecord(value: unknown): DataRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as DataRecord)
    : {};
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(4) : '—';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'object') return '—';
  return String(value);
}

function formatCouplings(value: unknown): string {
  if (!Array.isArray(value)) return '—';
  const couplings = value
    .map((item) => asRecord(item).coupling)
    .filter(
      (coupling): coupling is number =>
        typeof coupling === 'number' && Number.isFinite(coupling),
    );
  return couplings.length > 0
    ? couplings.map((coupling) => coupling.toFixed(2)).join(', ')
    : '—';
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  if (rows.length === 0) return <p>None captured.</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 12 }}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                style={{ borderBottom: '1px solid #d8dee4', padding: 6, textAlign: 'left' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{ borderBottom: '1px solid #eaeef2', padding: 6 }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ExerciseCreationKetcherStepProps = {
  data: NMRiumDraftData;
  onPrevious: () => void;
  onNext: () => void;
  onDataChange: (data: NMRiumDraftData) => Promise<void>;
};

export function ExerciseCreationKetcherStep({
  data,
  onPrevious,
  onNext,
  onDataChange,
}: ExerciseCreationKetcherStepProps) {
  const [ketcherReady, setKetcherReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingPeakAssignment, setSavingPeakAssignment] = useState(false);
  const [carbonCountValues, setCarbonCountValues] = useState<Record<string, string>>({});
  const [smilesInput, setSmilesInput] = useState(data.structure?.smiles ?? '');
  const [inchiInput, setInchiInput] = useState(data.structure?.inchi ?? '');
  const [structureInputSource, setStructureInputSource] = useState<
    'editor' | 'smiles' | 'inchi'
  >('editor');
  const [savingStructure, setSavingStructure] = useState(false);
  const ketcherRef = useRef<Ketcher | null>(null);
  const structServiceProvider = useMemo(
    () => new StandaloneStructServiceProvider() as StructServiceProvider,
    [],
  );
  const nucleusPriority = (spectrum: NMRiumDraftData['spectra'][number]) => {
    const nuclei = Array.isArray(spectrum.nucleus)
      ? spectrum.nucleus
      : [spectrum.nucleus];
    const priorities = ['13C', '1H', '19F', '31P'];
    const matchingPriority = priorities.findIndex((nucleus) =>
      nuclei.includes(nucleus),
    );
    return matchingPriority < 0 ? priorities.length : matchingPriority;
  };
  const hasAnalysis = (spectrum: NMRiumDraftData['spectra'][number]) =>
    spectrum.peaks.length > 0 || spectrum.multiplets.length > 0;
  const analyzedSpectra = data.spectra
    .filter(hasAnalysis)
    .map((spectrum, index) => ({ spectrum, index }))
    .sort(
      (left, right) =>
        nucleusPriority(left.spectrum) - nucleusPriority(right.spectrum) ||
        left.index - right.index,
    )
    .map(({ spectrum }) => spectrum);
  const emptySpectra = data.spectra.filter((spectrum) => !hasAnalysis(spectrum));
  const spectrumLabel = (spectrum: NMRiumDraftData['spectra'][number]) => {
    const nucleus = Array.isArray(spectrum.nucleus)
      ? spectrum.nucleus.join(', ')
      : spectrum.nucleus;
    return spectrum.info.name ? `${nucleus} - ${String(spectrum.info.name)}` : nucleus;
  };
  const spectrumNucleus = (spectrum: NMRiumDraftData['spectra'][number]) =>
    Array.isArray(spectrum.nucleus)
      ? spectrum.nucleus.join(', ')
      : spectrum.nucleus;

  const handleNext = async () => {
    const ketcher = ketcherRef.current;
    if (!ketcher) {
      setError('The structure editor is still loading.');
      return;
    }

    setSavingStructure(true);
    setError('');
    try {
      const smilesText = smilesInput.trim();
      const inchiText = inchiInput.trim();
      let smiles = (await ketcher.getSmiles()).trim();

      if (structureInputSource === 'smiles' && smilesText) {
        await ketcher.setMolecule(smilesText);
        smiles = (await ketcher.getSmiles()).trim();
      } else if (structureInputSource === 'inchi' && inchiText) {
        const normalizedInchi = inchiText.startsWith('InChI=')
          ? inchiText
          : `InChI=${inchiText}`;
        await ketcher.setMolecule(normalizedInchi);
        smiles = (await ketcher.getSmiles()).trim();
      }

      if (!smiles) {
        throw new Error('Draw a structure or provide a SMILES or InChI string before continuing.');
      }
      if (smiles.includes('.')) {
        throw new Error('The structure must be a single connected molecule.');
      }

      const [inchi, molfile] = await Promise.all([
        ketcher.getInchi(),
        ketcher.getMolfile('v2000'),
      ]);
      const updatedData: NMRiumDraftData = {
        ...data,
        structure: { smiles, inchi, molfile },
        spectra: data.spectra.map((spectrum) => {
          const isCarbon13 = (
            Array.isArray(spectrum.nucleus) ? spectrum.nucleus : [spectrum.nucleus]
          ).includes('13C');
          if (!isCarbon13) return spectrum;
          return {
            ...spectrum,
            peaks: spectrum.peaks.map((value) => {
              const peak = asRecord(value);
              return {
                ...peak,
                carbonCount:
                  typeof peak.carbonCount === 'number' &&
                  Number.isInteger(peak.carbonCount) &&
                  peak.carbonCount > 0
                    ? peak.carbonCount
                    : 1,
              };
            }),
          };
        }),
      };
      await onDataChange(updatedData);
      onNext();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not save the exercise structure.',
      );
    } finally {
      setSavingStructure(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
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
        <button type="button" onClick={onPrevious}>
          Previous
        </button>
        <strong>Step 2: Draw the exercise structure</strong>
        <button
          type="button"
          onClick={handleNext}
          disabled={!ketcherReady || savingStructure || savingPeakAssignment}
        >
          {savingStructure || savingPeakAssignment ? 'Saving…' : 'Next'}
        </button>
        {notice && <span role="status">{notice}</span>}
        {error && <span role="alert">{error}</span>}
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside
          aria-label="Stored NMRium data"
          style={{
            width: '35%',
            minWidth: 280,
            overflow: 'auto',
            padding: 12,
            borderRight: '1px solid #d8dee4',
            boxSizing: 'border-box',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Please provide the molecular structure</h2>
          <p>
            Either draw the structure or paste an SMILES- or InChI-string below.
          </p>
          <label style={{ display: 'block', marginBottom: 8 }}>
            SMILES
            <input
              type="text"
              value={smilesInput}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSmilesInput(value);
                if (value) {
                  setInchiInput('');
                  setStructureInputSource('smiles');
                } else {
                  setStructureInputSource('editor');
                }
              }}
              style={{ display: 'block', boxSizing: 'border-box', width: '100%' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            InChI
            <input
              type="text"
              value={inchiInput}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setInchiInput(value);
                if (value) {
                  setSmilesInput('');
                  setStructureInputSource('inchi');
                } else {
                  setStructureInputSource('editor');
                }
              }}
              style={{ display: 'block', boxSizing: 'border-box', width: '100%' }}
            />
          </label>
          <p>
            Also fill in the carbon count data and carbon multiplets if applicable.
          </p>
          <h2 style={{ marginTop: 0 }}>Stored NMRium data</h2>
          {analyzedSpectra.length === 0 && emptySpectra.length === 0 && (
            <p>No one-dimensional spectra were saved.</p>
          )}
          {analyzedSpectra.map((spectrum, spectrumIndex) => (
            <section key={spectrum.id}>
              {spectrumIndex > 0 &&
                spectrumNucleus(analyzedSpectra[spectrumIndex - 1]) !==
                  spectrumNucleus(spectrum) && (
                  <hr
                    aria-label={`End of ${spectrumNucleus(analyzedSpectra[spectrumIndex - 1])} spectra`}
                    style={{
                      border: 0,
                      borderTop: '3px solid #57606a',
                      margin: '20px 0',
                    }}
                  />
                )}
              <h3>{spectrumLabel(spectrum)}</h3>
              <p>
                {spectrum.multiplets.length} multiplets; {spectrum.peaks.length} picked peaks
              </p>
              <table
                style={{
                  borderCollapse: 'collapse',
                  width: '100%',
                  marginBottom: 12,
                }}
              >
                <tbody>
                  <tr>
                    <th
                      scope="row"
                      style={{ padding: 6, textAlign: 'left', verticalAlign: 'top' }}
                    >
                      Spectrometer
                    </th>
                    <td style={{ padding: 6, overflowWrap: 'anywhere' }}>
                      {spectrum.spectrometer ?? 'Not available in NMRium source metadata'}
                    </td>
                  </tr>
                  <tr>
                    <th
                      scope="row"
                      style={{ padding: 6, textAlign: 'left', verticalAlign: 'top' }}
                    >
                      Data source
                    </th>
                    <td style={{ padding: 6, overflowWrap: 'anywhere' }}>
                      {spectrum.dataSource ?? 'Not available in NMRium source metadata'}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr)',
                  gap: 12,
                  alignItems: 'start',
                }}
              >
                {spectrum.multiplets.length > 0 && (
                  <div>
                    <h4>Multiplets</h4>
                    <Table
                      headers={['ID', 'Approx. center (ppm)', 'Range (ppm)', 'Multiplicity', 'J (Hz)', 'Integral']}
                      rows={spectrum.multiplets.flatMap((value, multipletIndex) => {
                        const range = asRecord(value);
                        const signals = Array.isArray(range.signals)
                          ? range.signals
                          : [null];
                        return signals.map((value) => {
                          const signal = asRecord(value);
                          const from = range.from ?? range.to;
                          const to = range.to ?? range.from;
                          return [
                            String(multipletIndex + 1),
                            formatValue(signal.delta),
                            from === undefined
                              ? '—'
                              : `${formatValue(from)}–${formatValue(to)}`,
                            formatValue(signal.multiplicity),
                            formatCouplings(signal.js),
                            typeof range.integrationRounded === 'number'
                              ? String(range.integrationRounded)
                              : typeof range.integration === 'number' &&
                                  Number.isFinite(range.integration)
                                ? String(Math.round(range.integration))
                                : '—',
                          ];
                        });
                      })}
                    />
                  </div>
                )}
                {(() => {
                const isCarbon13 =
                  (Array.isArray(spectrum.nucleus)
                    ? spectrum.nucleus
                    : [spectrum.nucleus]
                  ).includes('13C');
                const showMultipletLink =
                  isCarbon13 &&
                  spectrum.peaks.length > 0 &&
                  spectrum.multiplets.length > 0;
                if (spectrum.peaks.length === 0) return null;
                return (
                  <div>
                    <h4>Picked peaks</h4>
                    <div style={{ overflowX: 'auto' }}>
                    <table
                      style={{
                        borderCollapse: 'collapse',
                        width: '100%',
                        marginBottom: 12,
                      }}
                    >
                      <thead>
                        <tr>
                          {[
                            'Position (ppm)',
                          ]
                            .concat(isCarbon13 ? ['Number of C atoms'] : [])
                            .concat(showMultipletLink ? ['Multiplet ID'] : [])
                            .map((header) => (
                              <th
                                key={header}
                                scope="col"
                                style={{
                                  borderBottom: '1px solid #d8dee4',
                                  padding: 6,
                                  textAlign: 'left',
                                }}
                              >
                                {header}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {spectrum.peaks.map((value, peakIndex) => {
                            const peak = asRecord(value);
                            return (
                              <tr key={peakIndex}>
                                <td style={{ borderBottom: '1px solid #eaeef2', padding: 6 }}>
                                  {formatValue(peak.x)}
                                </td>
                                {isCarbon13 && (
                                  <td style={{ borderBottom: '1px solid #eaeef2', padding: 6 }}>
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      style={{ width: '4em' }}
                                      aria-label={`Number of carbon atoms for ${String(peak.x ?? `peak ${peakIndex + 1}`)} ppm`}
                                      value={
                                        carbonCountValues[`${spectrum.id}:${peakIndex}`] ??
                                        (typeof peak.carbonCount === 'number'
                                          ? String(peak.carbonCount)
                                          : '1')
                                      }
                                      disabled={savingPeakAssignment}
                                      onChange={(event) => {
                                        const valueKey = `${spectrum.id}:${peakIndex}`;
                                        const value = event.currentTarget.value;
                                        setCarbonCountValues((values) => ({
                                          ...values,
                                          [valueKey]: value,
                                        }));
                                      }}
                                      onBlur={async (event) => {
                                        const rawValue = event.currentTarget.value;
                                        const carbonCount =
                                          rawValue === '' ? null : Number(rawValue);
                                        if (
                                          carbonCount !== null &&
                                          (!Number.isInteger(carbonCount) || carbonCount < 1)
                                        ) {
                                          setError('The number of carbon atoms must be a positive whole number.');
                                          return;
                                        }
                                        const updatedPeaks = spectrum.peaks.map(
                                          (peakValue, index) =>
                                            index === peakIndex
                                              ? {
                                                  ...asRecord(peakValue),
                                                  carbonCount,
                                                }
                                              : peakValue,
                                        );
                                        const updatedData: NMRiumDraftData = {
                                          ...data,
                                          spectra: data.spectra.map((item) =>
                                            item.id === spectrum.id
                                              ? { ...item, peaks: updatedPeaks }
                                              : item,
                                          ),
                                        };
                                        setSavingPeakAssignment(true);
                                        setError('');
                                        try {
                                          await onDataChange(updatedData);
                                        } catch (caught) {
                                          setError(
                                            caught instanceof Error
                                              ? caught.message
                                              : 'Could not save the carbon atom count.',
                                          );
                                        } finally {
                                          setSavingPeakAssignment(false);
                                        }
                                      }}
                                    />
                                  </td>
                                )}
                                {showMultipletLink && (
                                  <td style={{ borderBottom: '1px solid #eaeef2', padding: 6 }}>
                                    <select
                                      aria-label={`Multiplet ID for ${String(peak.x ?? `peak ${peakIndex + 1}`)} ppm`}
                                      value={
                                        typeof peak.multipletId === 'number' &&
                                        spectrum.multiplets.some(
                                          (_multiplet, index) =>
                                            index + 1 === peak.multipletId,
                                        )
                                          ? peak.multipletId
                                          : ''
                                      }
                                      disabled={savingPeakAssignment}
                                      onChange={async (event) => {
                                        const selectedId = event.currentTarget.value
                                          ? Number(event.currentTarget.value)
                                          : null;
                                        const updatedPeaks = spectrum.peaks.map(
                                          (peakValue, index) =>
                                            index === peakIndex
                                              ? {
                                                  ...asRecord(peakValue),
                                                  multipletId: selectedId,
                                                }
                                              : peakValue,
                                        );
                                        const updatedData: NMRiumDraftData = {
                                          ...data,
                                          spectra: data.spectra.map((item) =>
                                            item.id === spectrum.id
                                              ? { ...item, peaks: updatedPeaks }
                                              : item,
                                          ),
                                        };
                                        setSavingPeakAssignment(true);
                                        setError('');
                                        try {
                                          await onDataChange(updatedData);
                                        } catch (caught) {
                                          setError(
                                            caught instanceof Error
                                              ? caught.message
                                              : 'Could not save the peak-to-multiplet link.',
                                          );
                                        } finally {
                                          setSavingPeakAssignment(false);
                                        }
                                      }}
                                    >
                                      <option value="">—</option>
                                      {spectrum.multiplets.map((_multiplet, index) => (
                                        <option key={index + 1} value={index + 1}>
                                          {index + 1}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                );
                })()}
              </div>
              <details>
                <summary>View captured NMRium JSON</summary>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {JSON.stringify(
                    {
                      ...spectrum,
                      sourcePaths: data.sourcePaths ?? [],
                      sourceMetadata: data.sourceMetadata ?? [],
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </section>
          ))}
          {emptySpectra.length > 0 && (
            <p style={{ marginTop: 16, color: '#57606a' }}>
              No peak picking or multiplet analysis: {emptySpectra.map(spectrumLabel).join('; ')}.
            </p>
          )}
        </aside>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <Editor
            staticResourcesUrl=""
            structServiceProvider={structServiceProvider}
            disableMacromoleculesEditor
            onInit={async (ketcher: Ketcher) => {
              ketcherRef.current = ketcher;
              const molecule =
                data.structure?.molfile ?? data.molecules?.[0]?.molfile;
              if (molecule) {
                try {
                  await ketcher.setMolecule(molecule);
                } catch (caught) {
                  setError(
                    caught instanceof Error
                      ? `Could not load the NMRium molecule: ${caught.message}`
                      : 'Could not load the NMRium molecule.',
                  );
                }
              }
              setKetcherReady(true);
            }}
            errorHandler={(message: string) => {
              setError(`Ketcher error: ${message}`);
            }}
          />
          {!ketcherReady && <span role="status">Loading structure editor…</span>}
        </div>
      </div>
    </div>
  );
}
