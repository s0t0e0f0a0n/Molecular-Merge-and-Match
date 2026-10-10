import { useEffect, useState } from 'react';
import type { NMRiumDraftData, NMRiumSvgExport } from '../api/exerciseCreation';
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
  ) => Promise<void>;
};

function SpectrumExportCard({
  item,
  busy,
  previewed,
  onSelectedChange,
  onPreviewToggle,
  onUpdateSettings,
}: SpectrumExportCardProps) {
  const [rangeStart, setRangeStart] = useState(String(item.ppmRange[0]));
  const [rangeEnd, setRangeEnd] = useState(String(item.ppmRange[1]));
  const [integralPosition, setIntegralPosition] = useState(
    String(item.integralVerticalPosition),
  );
  const parsedRangeStart = Number(rangeStart);
  const parsedRangeEnd = Number(rangeEnd);
  const parsedIntegralPosition = Number(integralPosition);
  const validSettings =
    rangeStart.trim() !== '' &&
    rangeEnd.trim() !== '' &&
    integralPosition.trim() !== '' &&
    Number.isFinite(parsedRangeStart) &&
    Number.isFinite(parsedRangeEnd) &&
    parsedRangeStart > parsedRangeEnd &&
    Number.isFinite(parsedIntegralPosition) &&
    parsedIntegralPosition >= 0 &&
    parsedIntegralPosition <= 842;
  const previewUrl = `${item.url}?range=${encodeURIComponent(
    `${item.ppmRange[0]}-${item.ppmRange[1]}`,
  )}&integral=${item.integralVerticalPosition}`;

  useEffect(() => {
    setRangeStart(String(item.ppmRange[0]));
    setRangeEnd(String(item.ppmRange[1]));
    setIntegralPosition(String(item.integralVerticalPosition));
  }, [item.ppmRange, item.integralVerticalPosition]);

  return (
    <section
      style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <input
            type="checkbox"
            checked={item.selected}
            onChange={(event) => onSelectedChange(event.target.checked)}
          />
          <strong>{item.nucleus}</strong>
          <span>{item.name}</span>
        </label>
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
        <button
          type="button"
          disabled={busy || !validSettings}
          onClick={() =>
            void onUpdateSettings(
              [parsedRangeStart, parsedRangeEnd],
              parsedIntegralPosition,
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
  skippedTwoDimensionalCount: number;
  busy: boolean;
  error: string;
  onBack: () => void;
  onExportsChange: (exports: NMRiumSvgExport[]) => void;
  onUpdateSettings: (
    id: string,
    ppmRange: [number, number],
    integralVerticalPosition: number,
  ) => Promise<void>;
  onDataChange: (data: NMRiumDraftData) => Promise<void>;
  onContinue: () => void;
};

export function NMRiumSvgPreview({
  data,
  exports,
  skippedTwoDimensionalCount,
  busy,
  error,
  onBack,
  onExportsChange,
  onUpdateSettings,
  onDataChange,
  onContinue,
}: NMRiumSvgPreviewProps) {
  const [previewedIds, setPreviewedIds] = useState<Set<string>>(() => new Set());
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
      {skippedTwoDimensionalCount > 0 && (
        <p role="status" style={{ color: '#8a4b08' }}>
          {skippedTwoDimensionalCount} 2D spectrum/spectra were not included in this
          initial SVG test; only 1D spectra are currently rendered.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
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
            onUpdateSettings={(ppmRange, integralPosition) =>
              onUpdateSettings(item.id, ppmRange, integralPosition)
            }
          />
        ))}
      </div>
      <ExerciseCreationDataConfirmation data={data} onDataChange={onDataChange} />
    </main>
  );
}
