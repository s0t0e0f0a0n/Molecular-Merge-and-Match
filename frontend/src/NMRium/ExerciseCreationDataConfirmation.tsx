import { useState } from 'react';
import type { NMRiumDraftData, NMRiumDraftSpectrum } from '../api/exerciseCreation';

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

function spectrumLabel(spectrum: NMRiumDraftSpectrum): string {
  const nucleus = Array.isArray(spectrum.nucleus)
    ? spectrum.nucleus.join(', ')
    : spectrum.nucleus;
  return spectrum.info.name ? `${nucleus} - ${String(spectrum.info.name)}` : nucleus;
}

function isCarbon13(spectrum: NMRiumDraftSpectrum): boolean {
  return (Array.isArray(spectrum.nucleus) ? spectrum.nucleus : [spectrum.nucleus]).includes(
    '13C',
  );
}

function getFrequency(spectrum: NMRiumDraftSpectrum): string {
  const frequencyKeys = [
    'originFrequency',
    'baseFrequency',
    'frequency',
    'frequencyMHz',
    'observeFrequency',
    'observeFrequencyMHz',
  ];
  for (const key of frequencyKeys) {
    const value = spectrum.info[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${value} MHz`;
    }
    if (typeof value === 'string' && value.trim()) {
      return /mhz/i.test(value) ? value.trim() : `${value.trim()} MHz`;
    }
  }
  return '—';
}

export function ExerciseCreationDataConfirmation({
  data,
  onDataChange,
}: {
  data: NMRiumDraftData;
  onDataChange: (data: NMRiumDraftData) => Promise<void>;
}) {
  const [savingPeakAssignment, setSavingPeakAssignment] = useState(false);
  const [carbonCountValues, setCarbonCountValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const spectra = data.spectra
    .map((spectrum, index) => ({ spectrum, index }))
    .sort((left, right) => {
      const priority = (spectrum: NMRiumDraftSpectrum) => {
        const nuclei = Array.isArray(spectrum.nucleus)
          ? spectrum.nucleus
          : [spectrum.nucleus];
        const priorities = ['13C', '1H', '19F', '31P'];
        const index = priorities.findIndex((nucleus) => nuclei.includes(nucleus));
        return index < 0 ? priorities.length : index;
      };
      return (
        priority(left.spectrum) - priority(right.spectrum) || left.index - right.index
      );
    })
    .map(({ spectrum }) => spectrum);
  async function savePeakChanges(
    spectrum: NMRiumDraftSpectrum,
    peakIndex: number,
    update: (peak: DataRecord) => DataRecord,
  ) {
    const updatedPeaks = spectrum.peaks.map((value, index) =>
      index === peakIndex ? update(asRecord(value)) : value,
    );
    const updatedData: NMRiumDraftData = {
      ...data,
      spectra: data.spectra.map((item) =>
        item.id === spectrum.id ? { ...item, peaks: updatedPeaks } : item,
      ),
    };
    setSavingPeakAssignment(true);
    setError('');
    try {
      await onDataChange(updatedData);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not save the peak assignment.',
      );
    } finally {
      setSavingPeakAssignment(false);
    }
  }

  return (
    <section
      aria-label="Stored NMRium data confirmation"
      style={{
        marginTop: 28,
        borderTop: '2px solid #57606a',
        paddingTop: 18,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Confirm stored NMRium data</h2>
      <p>Review multiplets and picked peaks. Carbon counts and peak-to-multiplet links are editable.</p>
      {error && <p role="alert">{error}</p>}
      {spectra.length === 0 && (
        <p>No one-dimensional spectra were saved.</p>
      )}
      {spectra.map((spectrum, spectrumIndex) => (
        <section
          key={spectrum.id}
          style={{
            marginTop: spectrumIndex > 0 ? 20 : 0,
            paddingTop: spectrumIndex > 0 ? 16 : 0,
            borderTop: spectrumIndex > 0 ? '1px solid #d8dee4' : undefined,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 1fr) minmax(0, 3fr)',
              gap: 20,
              alignItems: 'start',
            }}
          >
            <div>
              <h3 style={{ marginTop: 0 }}>{spectrumLabel(spectrum)}</h3>
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
                    <th scope="row" style={{ padding: 6, textAlign: 'left', verticalAlign: 'top' }}>
                      Spectrometer
                    </th>
                    <td style={{ padding: 6, overflowWrap: 'anywhere' }}>
                      {spectrum.spectrometer ?? 'Not available in NMRium source metadata'}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" style={{ padding: 6, textAlign: 'left', verticalAlign: 'top' }}>
                      Data source
                    </th>
                    <td style={{ padding: 6, overflowWrap: 'anywhere' }}>
                      {spectrum.dataSource ?? 'Not available in NMRium source metadata'}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" style={{ padding: 6, textAlign: 'left', verticalAlign: 'top' }}>
                      Solvent
                    </th>
                    <td style={{ padding: 6, overflowWrap: 'anywhere' }}>
                      {spectrum.solvent || '—'}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" style={{ padding: 6, textAlign: 'left', verticalAlign: 'top' }}>
                      Frequency
                    </th>
                    <td style={{ padding: 6, overflowWrap: 'anywhere' }}>
                      {getFrequency(spectrum)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              {spectrum.multiplets.length > 0 && (
                <div>
                  <h4 style={{ marginTop: 0, fontSize: '1.17em' }}>Multiplets</h4>
                  <Table
                    headers={[
                      'ID',
                      'Approx. center (ppm)',
                      'Range (ppm)',
                      'Multiplicity',
                      'J (Hz)',
                      'Integral',
                    ]}
                    rows={spectrum.multiplets.flatMap((value, multipletIndex) => {
                      const range = asRecord(value);
                      const signals = Array.isArray(range.signals) ? range.signals : [null];
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

              {spectrum.peaks.length > 0 && (
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
                          {['Position (ppm)', 'Intensity']
                            .concat(isCarbon13(spectrum) ? ['Number of C atoms'] : [])
                            .concat(
                              isCarbon13(spectrum) && spectrum.multiplets.length > 0
                                ? ['Multiplet ID']
                                : [],
                            )
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
                          const valueKey = `${spectrum.id}:${peakIndex}`;
                          return (
                            <tr key={peakIndex}>
                              <td style={{ borderBottom: '1px solid #eaeef2', padding: 6 }}>
                                {formatValue(peak.x)}
                              </td>
                              <td style={{ borderBottom: '1px solid #eaeef2', padding: 6 }}>
                                {formatValue(peak.y ?? peak.intensity)}
                              </td>
                              {isCarbon13(spectrum) && (
                                <td style={{ borderBottom: '1px solid #eaeef2', padding: 6 }}>
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    style={{ width: '4em' }}
                                    aria-label={`Number of carbon atoms for ${String(peak.x ?? `peak ${peakIndex + 1}`)} ppm`}
                                    value={
                                      carbonCountValues[valueKey] ??
                                      (typeof peak.carbonCount === 'number'
                                        ? String(peak.carbonCount)
                                        : '1')
                                    }
                                    disabled={savingPeakAssignment}
                                    onChange={(event) =>
                                      setCarbonCountValues((values) => ({
                                        ...values,
                                        [valueKey]: event.currentTarget.value,
                                      }))
                                    }
                                    onBlur={async (event) => {
                                      const rawValue = event.currentTarget.value;
                                      const carbonCount =
                                        rawValue === '' ? null : Number(rawValue);
                                      if (
                                        carbonCount !== null &&
                                        (!Number.isInteger(carbonCount) || carbonCount < 1)
                                      ) {
                                        setError(
                                          'The number of carbon atoms must be a positive whole number.',
                                        );
                                        return;
                                      }
                                      await savePeakChanges(spectrum, peakIndex, (item) => ({
                                        ...item,
                                        carbonCount,
                                      }));
                                    }}
                                  />
                                </td>
                              )}
                              {isCarbon13(spectrum) && spectrum.multiplets.length > 0 && (
                                <td style={{ borderBottom: '1px solid #eaeef2', padding: 6 }}>
                                  <select
                                    aria-label={`Multiplet ID for ${String(peak.x ?? `peak ${peakIndex + 1}`)} ppm`}
                                    value={
                                      typeof peak.multipletId === 'number' &&
                                      spectrum.multiplets.some(
                                        (_multiplet, index) => index + 1 === peak.multipletId,
                                      )
                                        ? peak.multipletId
                                        : ''
                                    }
                                    disabled={savingPeakAssignment}
                                    onChange={(event) => {
                                      const selectedId = event.currentTarget.value
                                        ? Number(event.currentTarget.value)
                                        : null;
                                      void savePeakChanges(spectrum, peakIndex, (item) => ({
                                        ...item,
                                        multipletId: selectedId,
                                      }));
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
              )}
              {spectrum.multiplets.length === 0 && spectrum.peaks.length === 0 && (
                <p>No multiplets or picked peaks were saved for this spectrum.</p>
              )}
            </div>
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
    </section>
  );
}
