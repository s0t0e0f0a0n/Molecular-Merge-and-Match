import { useEffect, useState } from 'react';
import type {
  NMRiumDraftData,
  NMRiumDraftSpectrum,
  NMRiumSvgExport,
} from '../api/exerciseCreation';
import { containsNucleus, getDefaultSpectrumLabel } from './spectrumMetadata';
import { ExerciseCreationDataConfirmation } from './ExerciseCreationDataConfirmation';

type SpectrumExportCardProps = {
  item: NMRiumSvgExport;
  busy: boolean;
  previewed: boolean;
  onSelectedChange: (selected: boolean) => void;
  onPreviewToggle: () => void;
  onUpdateSettings: (
    ppmRange: [number, number],
    integralVerticalPosition: number,
    secondPpmRange?: [number, number],
  ) => Promise<void>;
  spectrum?: NMRiumDraftSpectrum;
  onMetadataChange: (
    spectrum: NMRiumDraftSpectrum,
    update: Partial<NMRiumDraftSpectrum>,
    primaryNucleus?: '1H' | '13C',
  ) => Promise<void>;
};

function SpectrumExportCard({
  item,
  busy,
  previewed,
  onSelectedChange,
  onPreviewToggle,
  onUpdateSettings,
  spectrum,
  onMetadataChange,
}: SpectrumExportCardProps) {
  const initialLabel =
    spectrum?.label ?? (spectrum ? getDefaultSpectrumLabel(spectrum) : item.name);
  const [labelValue, setLabelValue] = useState(initialLabel);
  const [rangeStart, setRangeStart] = useState(String(item.ppmRange[0]));
  const [rangeEnd, setRangeEnd] = useState(String(item.ppmRange[1]));
  const [secondRangeStart, setSecondRangeStart] = useState(
    String(item.secondPpmRange?.[0] ?? ''),
  );
  const [secondRangeEnd, setSecondRangeEnd] = useState(
    String(item.secondPpmRange?.[1] ?? ''),
  );
  const [integralPosition, setIntegralPosition] = useState(
    String(item.integralVerticalPosition),
  );
  const parsedRangeStart = Number(rangeStart);
  const parsedRangeEnd = Number(rangeEnd);
  const parsedSecondRangeStart = Number(secondRangeStart);
  const parsedSecondRangeEnd = Number(secondRangeEnd);
  const parsedIntegralPosition = Number(integralPosition);
  const validSettings =
    rangeStart.trim() !== '' &&
    rangeEnd.trim() !== '' &&
    integralPosition.trim() !== '' &&
    Number.isFinite(parsedRangeStart) &&
    Number.isFinite(parsedRangeEnd) &&
    parsedRangeStart > parsedRangeEnd &&
    (item.dimension !== 2 ||
      (secondRangeStart.trim() !== '' &&
        secondRangeEnd.trim() !== '' &&
        Number.isFinite(parsedSecondRangeStart) &&
        Number.isFinite(parsedSecondRangeEnd) &&
        parsedSecondRangeStart > parsedSecondRangeEnd)) &&
    (item.dimension === 2 ||
      (Number.isFinite(parsedIntegralPosition) &&
        parsedIntegralPosition >= 0 &&
        parsedIntegralPosition <= 842));
  const previewUrl = `${item.url}?range=${encodeURIComponent(
    `${item.ppmRange[0]}-${item.ppmRange[1]}`,
  )}&integral=${item.integralVerticalPosition}${
    item.secondPpmRange
      ? `&secondRange=${encodeURIComponent(`${item.secondPpmRange[0]}-${item.secondPpmRange[1]}`)}`
      : ''
  }`;

  useEffect(() => {
    setLabelValue(initialLabel);
  }, [initialLabel]);

  useEffect(() => {
    setRangeStart(String(item.ppmRange[0]));
    setRangeEnd(String(item.ppmRange[1]));
    setSecondRangeStart(String(item.secondPpmRange?.[0] ?? ''));
    setSecondRangeEnd(String(item.secondPpmRange?.[1] ?? ''));
    setIntegralPosition(String(item.integralVerticalPosition));
  }, [item.ppmRange, item.secondPpmRange, item.integralVerticalPosition]);

  return (
    <section
      style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: 12 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 5,
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={item.selected}
            onChange={(event) => onSelectedChange(event.target.checked)}
          />
          Include
        </label>
        <strong style={{ marginLeft: 2 }}>{item.nucleus}</strong>
        <span>{item.name}</span>
        {spectrum && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Label:
            <input
              aria-label={`Spectrum label for ${item.nucleus} ${item.name}`}
              type="text"
              style={{ width: 100, boxSizing: 'border-box' }}
              value={labelValue}
              onChange={(event) => setLabelValue(event.currentTarget.value)}
              onBlur={() => {
                const label = labelValue.trim();
                if (label && label !== spectrum.label) {
                  void onMetadataChange(spectrum, { label });
                }
              }}
            />
          </label>
        )}
        {spectrum &&
          spectrum.dimension === 1 &&
          (containsNucleus(spectrum, '1H') || containsNucleus(spectrum, '13C')) && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 2 }}>
              <input
                aria-label={`Primary ${containsNucleus(spectrum, '1H') ? '1H' : '13C'} spectrum`}
                type="checkbox"
                checked={spectrum.isPrimary ?? false}
                onChange={(event) => {
                  const primaryNucleus = containsNucleus(spectrum, '1H')
                    ? '1H'
                    : '13C';
                  void onMetadataChange(
                    spectrum,
                    { isPrimary: event.currentTarget.checked },
                    primaryNucleus,
                  );
                }}
              />
              Primary {containsNucleus(spectrum, '1H') ? '1H' : '13C'}
            </label>
          )}
        <a href={previewUrl} target="_blank" rel="noreferrer">
          Open SVG
        </a>
        <button type="button" onClick={onPreviewToggle}>
          {previewed ? 'Hide preview' : 'Preview'}
        </button>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'end',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 12,
        }}
      >
        <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>
          Range start (ppm)
          <input
            type="number"
            step="any"
            value={rangeStart}
            onChange={(event) => setRangeStart(event.target.value)}
          />
        </label>
        <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>
          Range end (ppm)
          <input
            type="number"
            step="any"
            value={rangeEnd}
            onChange={(event) => setRangeEnd(event.target.value)}
          />
        </label>
        {item.dimension === 2 ? (
          <>
            <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>
              Vertical range start (ppm)
              <input
                type="number"
                step="any"
                value={secondRangeStart}
                onChange={(event) => setSecondRangeStart(event.target.value)}
              />
            </label>
            <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>
              Vertical range end (ppm)
              <input
                type="number"
                step="any"
                value={secondRangeEnd}
                onChange={(event) => setSecondRangeEnd(event.target.value)}
              />
            </label>
          </>
        ) : (
          <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>
            Integral offset from axis (px)
            <input
              type="number"
              min="0"
              max="842"
              step="5"
              value={integralPosition}
              onChange={(event) => setIntegralPosition(event.target.value)}
            />
          </label>
        )}
        <button
          type="button"
          disabled={busy || !validSettings}
          onClick={() =>
            void onUpdateSettings(
              [parsedRangeStart, parsedRangeEnd],
              parsedIntegralPosition,
              item.dimension === 2
                ? [parsedSecondRangeStart, parsedSecondRangeEnd]
                : undefined,
            )
          }
        >
          Update preview
        </button>
      </div>
      {previewed && (
        <img
          src={previewUrl}
          alt={`${item.nucleus} spectrum preview`}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 12,
            border: '1px solid #e5e7eb',
            background: 'white',
          }}
        />
      )}
    </section>
  );
}

type NMRiumSvgPreviewProps = {
  data: NMRiumDraftData;
  exports: NMRiumSvgExport[];
  busy: boolean;
  error: string;
  onBack: () => void;
  onExportsChange: (exports: NMRiumSvgExport[]) => void;
  onUpdateSettings: (
    id: string,
    ppmRange: [number, number],
    integralVerticalPosition: number,
    secondPpmRange?: [number, number],
  ) => Promise<void>;
  onDataChange: (data: NMRiumDraftData) => Promise<void>;
  onContinue: () => void;
};

export function NMRiumSvgPreview({
  data,
  exports,
  busy,
  error,
  onBack,
  onExportsChange,
  onUpdateSettings,
  onDataChange,
  onContinue,
}: NMRiumSvgPreviewProps) {
  const [previewedIds, setPreviewedIds] = useState<Set<string>>(() => new Set());
  const [metadataError, setMetadataError] = useState('');
  const selectedCount = exports.filter((item) => item.selected).length;

  function togglePreview(id: string) {
    setPreviewedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateSelected(id: string, selected: boolean) {
    onExportsChange(
      exports.map((item) => (item.id === id ? { ...item, selected } : item)),
    );
  }

  async function updateSpectrumMetadata(
    spectrum: NMRiumDraftSpectrum,
    update: Partial<NMRiumDraftSpectrum>,
    primaryNucleus?: '1H' | '13C',
  ) {
    const updatedData: NMRiumDraftData = {
      ...data,
      spectra: data.spectra.map((item) => {
        if (
          primaryNucleus &&
          item.dimension === 1 &&
          containsNucleus(item, primaryNucleus)
        ) {
          return {
            ...item,
            isPrimary: item.id === spectrum.id ? Boolean(update.isPrimary) : false,
            ...(item.id === spectrum.id ? update : {}),
          };
        }
        return item.id === spectrum.id ? { ...item, ...update } : item;
      }),
    };
    setMetadataError('');
    try {
      await onDataChange(updatedData);
    } catch (caught) {
      setMetadataError(
        caught instanceof Error ? caught.message : 'Could not save the spectrum settings.',
      );
    }
  }

  return (
    <main
      style={{
        height: '100vh',
        overflow: 'auto',
        padding: 20,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <button type="button" onClick={onBack} disabled={busy}>
          Back to NMRium
        </button>
        <h2 style={{ margin: 0 }}>Generated SVG spectra</h2>
        <span style={{ marginLeft: 'auto' }}>
          Select spectra to include ({selectedCount} selected)
        </span>
        <button
          type="button"
          onClick={onContinue}
          disabled={busy || selectedCount === 0}
        >
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {metadataError && <p role="alert">{metadataError}</p>}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 16,
        }}
      >
        {exports.map((item) => (
          <SpectrumExportCard
            key={item.id}
            item={item}
            busy={busy}
            previewed={previewedIds.has(item.id)}
            onSelectedChange={(selected) => updateSelected(item.id, selected)}
            onPreviewToggle={() => togglePreview(item.id)}
            onUpdateSettings={(ppmRange, integralPosition, secondPpmRange) =>
              onUpdateSettings(item.id, ppmRange, integralPosition, secondPpmRange)
            }
            spectrum={data.spectra.find((spectrum) => spectrum.id === item.id)}
            onMetadataChange={updateSpectrumMetadata}
          />
        ))}
      </div>
      <ExerciseCreationDataConfirmation data={data} onDataChange={onDataChange} />
    </main>
  );
}
