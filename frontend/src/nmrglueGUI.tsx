import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './nmrglueGUI.css';

type NmrPreview = {
  dataset: string;
  nucleus: string;
  spectrometer_frequency_mhz: number | null;
  points: number;
  sampled_points: number;
  dwell_time_us: number | null;
  fid_real: number[];
  fid_imaginary: number[];
  spectrum_ppm: number[];
  spectrum_real: number[];
  spectrum_imaginary: number[];
  automatic_p0: number;
  automatic_p1: number;
};

type WindowFunction = 'none' | 'em' | 'gm';
type NmrProcessing = { zero_fill: number; window: WindowFunction; lb: number; g1: number; g2: number; g3: number };

type FileSystemEntryLike = { isFile: boolean; isDirectory: boolean; name: string };
type FileSystemFileEntryLike = FileSystemEntryLike & { file: (callback: (file: File) => void) => void };
type FileSystemDirectoryEntryLike = FileSystemEntryLike & { createReader: () => { readEntries: (callback: (entries: FileSystemEntryLike[]) => void) => void } };

async function filesFromDrop(items: DataTransferItemList): Promise<Array<{ file: File; path: string }>> {
  const droppedFiles: Array<{ file: File; path: string }> = [];
  const readEntry = (entry: FileSystemEntryLike, parentPath: string): Promise<void> => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        (entry as FileSystemFileEntryLike).file((file) => {
          droppedFiles.push({ file, path: `${parentPath}${entry.name}` });
          resolve();
        });
      });
    }
    const reader = (entry as FileSystemDirectoryEntryLike).createReader();
    return new Promise((resolve) => reader.readEntries(async (entries) => {
      await Promise.all(entries.map((child) => readEntry(child, `${parentPath}${entry.name}/`)));
      resolve();
    }));
  };
  await Promise.all(Array.from(items).map(async (item) => {
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null }).webkitGetAsEntry?.();
    if (entry) await readEntry(entry, '');
    else {
      const file = item.getAsFile();
      if (file) droppedFiles.push({ file, path: file.webkitRelativePath || file.name });
    }
  }));
  return droppedFiles;
}

function seriesPath(values: number[], width: number, height: number): string {
  if (!values.length) return '';
  const minimum = Math.min(...values);
  const range = Math.max(...values) - minimum || 1;
  return values.map((value, index) => {
    const x = index * width / Math.max(values.length - 1, 1);
    const y = height - ((value - minimum) / range) * height;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function Trace({ title, real, imaginary, showImaginary, ppm }: { title: string; real: number[]; imaginary: number[]; showImaginary: boolean; ppm?: number[] }) {
  const width = 760;
  const height = 190;
  return (
    <section className="nmr-trace-card">
      <div className="nmr-trace-heading">
        <h2>{title}</h2>
        <span><i className="nmr-legend-real" />real {showImaginary ? <><i className="nmr-legend-imaginary" />imaginary</> : null}</span>
      </div>
      <svg className="nmr-trace" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} className="nmr-zero-line" />
        <path d={seriesPath(real, width, height)} className="nmr-series-real" />
        {showImaginary ? <path d={seriesPath(imaginary, width, height)} className="nmr-series-imaginary" /> : null}
      </svg>
      {ppm?.length ? <div className="nmr-axis-labels"><span>{ppm[0].toFixed(2)} ppm</span><span>{ppm[ppm.length - 1].toFixed(2)} ppm</span></div> : null}
    </section>
  );
}

function NumberInput({ label, value, onChange, onCommit }: { label: string; value: string; onChange: (value: string) => void; onCommit: () => void }) {
  return <label><span>{label}</span><input type="number" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onCommit(); } }} /></label>;
}

function NmrglueGUI() {
  const [preview, setPreview] = useState<NmrPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showImaginary, setShowImaginary] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [processing, setProcessing] = useState<NmrProcessing>({ zero_fill: 32768, window: 'none', lb: 0, g1: 0, g2: 0, g3: 0.5 });
  const [draft, setDraft] = useState<Record<string, string>>({ lb: '0', g1: '0', g2: '0', g3: '0.5' });

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      fetch('/api/v1/nmr-preview/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...processing, max_points: 2400 }), signal: controller.signal })
        .then(async (response) => {
          const text = await response.text();
          const body = text ? JSON.parse(text) as Partial<NmrPreview> & { detail?: string } : {};
          if (!response.ok) throw new Error(body.detail ?? `NMR service returned HTTP ${response.status}.`);
          if (!body.dataset || !body.spectrum_ppm) throw new Error('NMR service returned no preview data.');
          return body as NmrPreview;
        })
        .then((body) => { setPreview(body); setError(null); })
        .catch((reason: unknown) => { if (reason instanceof Error && reason.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Unable to process the dataset.'); })
        .finally(() => setIsLoading(false));
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [processing]);

  const commit = (key: keyof NmrProcessing) => {
    const value = Number(draft[key]);
    if (Number.isFinite(value)) setProcessing((current) => ({ ...current, [key]: value }));
  };
  const updateDraft = (key: keyof NmrProcessing, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const uploadFolder = async (items: DataTransferItemList) => {
    const droppedFiles = await filesFromDrop(items);
    if (!droppedFiles.length) return;
    const formData = new FormData();
    droppedFiles.forEach(({ file, path }) => formData.append('files', file, path));
    setUploadStatus(`Uploading ${droppedFiles.length} files...`);
    try {
      const response = await fetch('/api/v1/nmr-preview/upload', { method: 'POST', body: formData });
      const body = await response.json() as { detail?: string; file_count?: number };
      if (!response.ok) throw new Error(body.detail ?? `Upload failed (HTTP ${response.status}).`);
      setUploadStatus(`Loaded ${body.file_count ?? droppedFiles.length} files. Processing...`);
      setPreview(null);
      setError(null);
      setProcessing((current) => ({ ...current }));
    } catch (reason: unknown) {
      setUploadStatus(null);
      setError(reason instanceof Error ? reason.message : 'Could not upload the Bruker folder.');
    }
  };

  return (
    <main className={`nmr-preview-content nmr-standalone-page${isDragging ? ' is-dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }} onDrop={(event) => { event.preventDefault(); setIsDragging(false); void uploadFolder(event.dataTransfer.items); }}>
      {isDragging ? <div className="nmr-drop-overlay">Drop Bruker folder to load it</div> : null}
      <header className="nmr-preview-toolbar"><div><span className="nmr-eyebrow">nmrglue test bench</span><h1>Bruker {preview?.nucleus ?? 'NMR'} acquisition</h1><p>{preview?.dataset ?? 'backend/app/core/27'} · automatic peak-minima phasing</p></div><a className="nmr-reload-button" href="/">Back to application</a></header>
      <p className="nmr-drop-hint">Drop a Bruker data folder anywhere on this page to replace the temporary dataset.</p>
      {uploadStatus ? <p className="nmr-processing-status">{uploadStatus}</p> : null}
      <div className="nmr-processing-controls" aria-label="NMR processing controls">
        <label><span>Zero fill</span><select value={processing.zero_fill} onChange={(event) => setProcessing((current) => ({ ...current, zero_fill: Number(event.target.value) }))}><option value="32768">32k</option><option value="65536">64k</option><option value="131072">128k</option><option value="262144">256k</option><option value="524288">512k</option></select></label>
        <label><span>Window</span><select value={processing.window} onChange={(event) => setProcessing((current) => ({ ...current, window: event.target.value as WindowFunction }))}><option value="none">None</option><option value="em">Exponential (EM)</option><option value="gm">Gaussian / Lorentz (GM)</option></select></label>
        {processing.window === 'em' ? <NumberInput label="LB (Hz)" value={draft.lb} onChange={(value) => updateDraft('lb', value)} onCommit={() => commit('lb')} /> : null}
        {processing.window === 'gm' ? <><NumberInput label="G1" value={draft.g1} onChange={(value) => updateDraft('g1', value)} onCommit={() => commit('g1')} /><NumberInput label="G2 / GB (Hz)" value={draft.g2} onChange={(value) => updateDraft('g2', value)} onCommit={() => commit('g2')} /><NumberInput label="G3" value={draft.g3} onChange={(value) => updateDraft('g3', value)} onCommit={() => commit('g3')} /></> : null}
        <span className="nmr-phase-label">Phasing: automatic</span><label className="nmr-imaginary-toggle"><span>Show imaginary</span><input type="checkbox" checked={showImaginary} onChange={(event) => setShowImaginary(event.target.checked)} /></label>
      </div>
      {isLoading ? <p className="nmr-processing-status">Processing spectrum...</p> : null}
      {error ? <div className="nmr-error-state"><strong>NMR preview unavailable</strong><p>{error}</p></div> : null}
      {preview ? <><p className="nmr-processing-status">Automatic peak-minima phase: P0 {preview.automatic_p0.toFixed(1)} deg, P1 {preview.automatic_p1.toFixed(1)} deg.</p><div className="nmr-metrics"><span><b>{preview.points.toLocaleString()}</b> raw points</span><span><b>{preview.sampled_points.toLocaleString()}</b> plotted points</span><span><b>{preview.spectrometer_frequency_mhz?.toFixed(2) ?? 'n/a'} MHz</b> frequency</span><span><b>{preview.dwell_time_us?.toFixed(2) ?? 'n/a'} us</b> dwell time</span></div><Trace title="Frequency domain" real={preview.spectrum_real} imaginary={preview.spectrum_imaginary} showImaginary={showImaginary} ppm={preview.spectrum_ppm} /><Trace title="Time domain" real={preview.fid_real} imaginary={preview.fid_imaginary} showImaginary={showImaginary} /></> : null}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<NmrglueGUI />);
