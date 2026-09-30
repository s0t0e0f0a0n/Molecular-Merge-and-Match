import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './nmrglueGUI.css';

type NmrPreview = {
  dataset: string;
  title: string;
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
  phase_source: string;
  baseline_corrected: boolean;
  ppm_min: number;
  ppm_max: number;
  solvent: string;
  acquisition_date: string;
  temperature: string;
  scans: number | null;
  pulseprogram: string;
  receiver_gain: string;
  acquisition_time: string;
  pulse_width: string;
  relaxation_delay: string;
  pulse_program_steps: Array<{ label: string; channel: string; duration_us: number; f1_level?: number; f2_level?: number }>;
  pulse_program_source: string;
  phase_cycles: Record<string, number[]>;
  pulse_program_loop: string;
  decoupling_program: string;
  decoupling_during_acquisition: boolean;
  acquisition_channel: string;
};

type WindowFunction = 'none' | 'em' | 'gm';
type NmrProcessing = { zero_fill: number; window: WindowFunction; lb: number; g1: number; g2: number; g3: number; p0: number; p1: number; baseline: boolean };

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
  const padding = 2;
  const innerHeight = height - padding * 2;
  return values.map((value, index) => {
    const x = index * width / Math.max(values.length - 1, 1);
    const y = height - padding - ((value - minimum) / range) * innerHeight;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function decayingSinePath(width: number, height: number): string {
  const points = 240;
  const mid = height / 2;
  const amplitude = height * 0.42;
  return Array.from({ length: points + 1 }, (_, index) => {
    const t = index / points;
    const x = t * width;
    const y = mid - Math.sin(t * Math.PI * 28) * Math.exp(-t * 3.2) * amplitude;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function tickPosition(tick: number, ppm: number[]): number {
  const high = ppm[0];
  const low = ppm[ppm.length - 1];
  return ((high - tick) / (high - low)) * 760;
}

function ppmTicks(ppm: number[], interval: number): number[] {
  if (ppm.length < 2) return [];
  const high = Math.max(ppm[0], ppm[ppm.length - 1]);
  const low = Math.min(ppm[0], ppm[ppm.length - 1]);
  const first = Math.ceil(low / interval) * interval;
  return Array.from({ length: Math.floor((high - first) / interval) + 1 }, (_, index) => first + index * interval)
    .filter((value) => value >= low && value <= high);
}

function Trace({ title, real, imaginary, showImaginary, ppm }: { title: string; real: number[]; imaginary: number[]; showImaginary: boolean; ppm?: number[] }) {
  const width = 760;
  const height = 190;
  const ppmInterval = ppm && ppm[0] > 100 ? 20 : 1;
  const ticks = ppm ? ppmTicks(ppm, ppmInterval) : [];
  return (
    <section className="nmr-trace-card">
      <div className="nmr-trace-heading">
        <h2>{title}</h2>
        <span><i className="nmr-legend-real" />real {showImaginary ? <><i className="nmr-legend-imaginary" />imaginary</> : null}</span>
      </div>
      <svg className="nmr-trace" width="100%" height={height + 28} viewBox={`0 0 ${width} ${height + 28}`} preserveAspectRatio="none" role="img" aria-label={title}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} className="nmr-zero-line" />
        <path d={seriesPath(real, width, height)} className="nmr-series-real" />
        {showImaginary ? <path d={seriesPath(imaginary, width, height)} className="nmr-series-imaginary" /> : null}
      </svg>
      {ticks.length ? <div className="nmr-axis-tick-row">{ticks.map((tick) => <span key={tick} style={{ left: `${(tickPosition(tick, ppm!) / width) * 100}%` }}>{tick}</span>)}</div> : null}
      {ppm?.length ? <div className="nmr-axis-labels"><span>{ppm[0].toFixed(2)} ppm</span><span>{ppm[ppm.length - 1].toFixed(2)} ppm</span></div> : null}
    </section>
  );
}

function NumberInput({ label, value, onChange, onCommit }: { label: string; value: string; onChange: (value: string) => void; onCommit: () => void }) {
  return <label><span>{label}</span><input type="number" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onCommit(); } }} /></label>;
}

function PulseProgramOverview({ preview }: { preview: NmrPreview }) {
  const { pulse_program_steps: steps } = preview;
  if (!steps.length) return null;
  // Pulses and acquisition are the interesting parts; delays are de-emphasized so they don't dominate the timeline.
  const channelWidthFactor: Record<string, number> = { f1: 1.7, f2: 1.7, acquisition: 1.9, sequence: 0.5 };
  const visualWeights = steps.map((step) => Math.max(1, Math.log10(step.duration_us + 10)) * (channelWidthFactor[step.channel] ?? 1));
  const totalWeight = visualWeights.reduce((sum, weight) => sum + weight, 0);
  let accumulatedWeight = 0;
  return (
    <section className="nmr-pulse-card">
      <div className="nmr-trace-heading"><h2>Pulse-program overview</h2><span>ordered timing and power states; widths are readability-scaled</span></div>
      <div className="nmr-pulse-diagram" role="img" aria-label="Pulse-program timing overview">
        <div className="nmr-pulse-lane-label">1H / f2</div>
        <div className="nmr-pulse-lane-label">13C / f1</div>
        <div className="nmr-pulse-lane nmr-pulse-lane-f2" />
        <div className="nmr-pulse-lane nmr-pulse-lane-f1" />
        {steps.map((step, index) => {
          const left = accumulatedWeight / totalWeight * 100;
          const width = visualWeights[index] / totalWeight * 100;
          accumulatedWeight += visualWeights[index];
          const protonObserved = preview.nucleus.toUpperCase().startsWith('1H');
          const lane = step.channel === 'f1' ? (protonObserved ? 0 : 1) : step.channel === 'f2' ? (protonObserved ? 1 : 0) : step.channel === 'acquisition' ? (protonObserved ? 0 : 1) : -1;
          const f2Level = step.f2_level ?? 0;
          const isAcquisition = step.channel === 'acquisition';
          const laneLineTop = lane === 0 ? 38 : 105;
          return <div key={`${step.label}-${index}`} className="nmr-pulse-event-group" style={{ left: `${left}%`, width: `${width}%` }}><i className="nmr-pulse-event-line" />{f2Level > 0 ? <div className={`nmr-pulse-state ${f2Level < 1 ? 'is-low' : 'is-high'}`} style={{ height: `${22 * f2Level}px` }} title={`F2 ${f2Level < 1 ? 'low-power pl13' : 'high-power pl12'}: ${step.duration_us.toFixed(2)} us`}>{f2Level >= 1 && width > 6 ? <span>CPD decoupling</span> : null}</div> : null}{isAcquisition ? <svg className="nmr-pulse-fid-icon" viewBox="0 0 60 24" preserveAspectRatio="none" aria-hidden="true" style={{ top: `${laneLineTop}px` }}><path d={decayingSinePath(60, 24)} /></svg> : null}<div className={`nmr-pulse-event is-${step.channel}`} style={{ left: isAcquisition ? '0%' : '12%', width: isAcquisition ? '100%' : '76%', top: lane < 0 ? '18px' : lane === 0 ? '4px' : '76px' }} title={`${step.label}: ${step.duration_us.toFixed(2)} us`}><span>{step.label}</span></div></div>;
        })}
      </div>
      <div className="nmr-pulse-legend"><span><i className="is-f1" />{preview.nucleus.toUpperCase().startsWith('1H') ? '1H RF pulse' : '13C RF pulse'}</span><span><i className="is-f2" />{preview.nucleus.toUpperCase().startsWith('1H') ? '13C RF/decoupling' : '1H RF/decoupling'}</span><span><i className="is-acquisition" />acquisition</span><span><i className="is-sequence" />delay/sequence</span></div>
      <div className="nmr-pulse-event-list">{steps.map((step, index) => <span key={`${step.label}-${index}`}><b>{step.label}</b> {step.duration_us.toFixed(2)} us{step.f2_level ? `, F2 ${step.f2_level < 1 ? 'low power' : 'high power'}` : ''}</span>)}</div>
    </section>
  );
}

function PhaseCycleSummary({ preview }: { preview: NmrPreview }) {
  const cycles = Object.entries(preview.phase_cycles);
  return <div className="nmr-pulse-details"><span><b>{preview.pulse_program_source}</b> source</span><span><b>{preview.decoupling_program}</b> decoupling</span><span><b>{preview.pulse_program_loop}</b></span>{cycles.map(([name, values]) => <span key={name}><b>{name}: {values.join(' ')}</b> phase cycle</span>)}</div>;
}

function NmrglueGUI() {
  const [preview, setPreview] = useState<NmrPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showImaginary, setShowImaginary] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [processing, setProcessing] = useState<NmrProcessing>({ zero_fill: 32768, window: 'em', lb: 1.5, g1: 0, g2: 0, g3: 0.5, p0: 0, p1: 0, baseline: false });
  const [draft, setDraft] = useState<Record<string, string>>({ lb: '1.5', g1: '0', g2: '0', g3: '0.5', p0: '0', p1: '0' });

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      fetch(`${window.location.protocol === 'file:' ? 'api://backend' : ''}/api/v1/nmr-preview/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...processing, max_points: 32768 }), signal: controller.signal })
        .then(async (response) => {
          const text = await response.text();
          const body = text ? JSON.parse(text) as Partial<NmrPreview> & { detail?: string } : {};
          if (!response.ok) throw new Error(body.detail ?? `NMR service returned HTTP ${response.status}.`);
          if (!body.dataset || !body.spectrum_ppm) throw new Error('NMR service returned no preview data.');
          return body as NmrPreview;
        })
        .then((body) => { setPreview(body); setError(null); setDraft((current) => ({ ...current, p0: String(body.automatic_p0 + processing.p0), p1: String(body.automatic_p1 + processing.p1) })); })
        .catch((reason: unknown) => { if (reason instanceof Error && reason.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Unable to process the dataset.'); })
        .finally(() => setIsLoading(false));
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [processing]);

  const commit = (key: keyof NmrProcessing) => {
    const value = Number(draft[key]);
    if (!Number.isFinite(value)) return;
    const automaticPhase = key === 'p0' ? (preview?.automatic_p0 ?? 0) : key === 'p1' ? (preview?.automatic_p1 ?? 0) : 0;
    setProcessing((current) => ({ ...current, [key]: key === 'p0' || key === 'p1' ? value - automaticPhase : value }));
  };
  const updateDraft = (key: keyof NmrProcessing, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const uploadFolder = async (items: DataTransferItemList) => {
    const droppedFiles = await filesFromDrop(items);
    if (!droppedFiles.length) return;
    const formData = new FormData();
    droppedFiles.forEach(({ file, path }) => formData.append('files', file, path));
    setUploadStatus(`Uploading ${droppedFiles.length} files...`);
    try {
      const response = await fetch(`${window.location.protocol === 'file:' ? 'api://backend' : ''}/api/v1/nmr-preview/upload`, { method: 'POST', body: formData });
      const body = await response.json() as { detail?: string; file_count?: number; recommended_lb?: number | null; nucleus?: string | null };
      if (!response.ok) throw new Error(body.detail ?? `Upload failed (HTTP ${response.status}).`);
      setUploadStatus(`Loaded ${body.file_count ?? droppedFiles.length} files. Processing...`);
      setPreview(null);
      setError(null);
      if (body.recommended_lb != null) {
        setDraft((current) => ({ ...current, lb: String(body.recommended_lb) }));
        setDraft((current) => ({ ...current, p0: '0', p1: '0' }));
        setProcessing((current) => ({ ...current, window: 'em', lb: body.recommended_lb ?? current.lb, p0: 0, p1: 0 }));
      } else {
        setProcessing((current) => ({ ...current }));
      }
    } catch (reason: unknown) {
      setUploadStatus(null);
      setError(reason instanceof Error ? reason.message : 'Could not upload the Bruker folder.');
    }
  };

  return (
    <main className={`nmr-preview-content nmr-standalone-page${isDragging ? ' is-dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }} onDrop={(event) => { event.preventDefault(); setIsDragging(false); void uploadFolder(event.dataTransfer.items); }}>
      {isDragging ? <div className="nmr-drop-overlay">Drop Bruker folder to load it</div> : null}
      <header className="nmr-preview-toolbar"><div><span className="nmr-eyebrow">nmrglue test bench</span><h1>{preview?.title ?? 'Bruker NMR acquisition'}</h1><p>{preview?.dataset ?? 'temporary Bruker dataset'} · {preview?.nucleus ?? 'NMR'}</p></div><a className="nmr-reload-button" href="/">Back to application</a></header>
      <p className="nmr-drop-hint">Drop a Bruker data folder anywhere on this page to replace the temporary dataset.</p>
      {uploadStatus ? <p className="nmr-processing-status">{uploadStatus}</p> : null}
      <div className="nmr-processing-controls" aria-label="NMR processing controls">
        <label><span>Zero fill</span><select value={processing.zero_fill} onChange={(event) => setProcessing((current) => ({ ...current, zero_fill: Number(event.target.value) }))}><option value="32768">32k</option><option value="65536">64k</option><option value="131072">128k</option><option value="262144">256k</option><option value="524288">512k</option></select></label>
        <label><span>Window</span><select value={processing.window} onChange={(event) => setProcessing((current) => ({ ...current, window: event.target.value as WindowFunction }))}><option value="none">None</option><option value="em">Exponential (EM)</option><option value="gm">Gaussian / Lorentz (GM)</option></select></label>
        {processing.window === 'em' ? <NumberInput label="LB (Hz)" value={draft.lb} onChange={(value) => updateDraft('lb', value)} onCommit={() => commit('lb')} /> : null}
        {processing.window === 'gm' ? <><NumberInput label="G1" value={draft.g1} onChange={(value) => updateDraft('g1', value)} onCommit={() => commit('g1')} /><NumberInput label="G2 / GB (Hz)" value={draft.g2} onChange={(value) => updateDraft('g2', value)} onCommit={() => commit('g2')} /><NumberInput label="G3" value={draft.g3} onChange={(value) => updateDraft('g3', value)} onCommit={() => commit('g3')} /></> : null}
        <span className="nmr-phase-label">Phasing applied:</span><NumberInput label="P0 (°)" value={draft.p0} onChange={(value) => updateDraft('p0', value)} onCommit={() => commit('p0')} /><NumberInput label="P1 (°)" value={draft.p1} onChange={(value) => updateDraft('p1', value)} onCommit={() => commit('p1')} /><button type="button" className="nmr-phase-button" onClick={() => { const nextP0 = Number(draft.p0) + 180; const automaticPhase = preview?.automatic_p0 ?? 0; setDraft((current) => ({ ...current, p0: String(nextP0) })); setProcessing((current) => ({ ...current, p0: nextP0 - automaticPhase })); }}>180°</button><button type="button" className="nmr-phase-button" onClick={() => setProcessing((current) => ({ ...current, baseline: !current.baseline }))}>{processing.baseline ? 'Baseline on' : 'Apply baseline'}</button><label className="nmr-imaginary-toggle"><span>Show imaginary</span><input type="checkbox" checked={showImaginary} onChange={(event) => setShowImaginary(event.target.checked)} /></label>
      </div>
      {isLoading ? <p className="nmr-processing-status">Processing spectrum...</p> : null}
      {error ? <div className="nmr-error-state"><strong>NMR preview unavailable</strong><p>{error}</p></div> : null}
      {preview ? <><p className="nmr-processing-status">Phase source: {preview.phase_source}; automatic P0 {preview.automatic_p0.toFixed(1)}°, P1 {preview.automatic_p1.toFixed(1)}°. {preview.baseline_corrected ? 'Baseline corrected.' : ''}</p><div className="nmr-metrics"><span><b>{preview.solvent}</b> solvent</span><span><b>{preview.spectrometer_frequency_mhz?.toFixed(2) ?? 'n/a'} MHz</b> frequency</span><span><b>{preview.temperature}</b> temperature</span><span><b>{preview.scans ?? 'n/a'}</b> scans</span><span><b>{preview.pulseprogram}</b> pulse program</span><span><b>{preview.acquisition_date}</b> date</span><span><b>{preview.receiver_gain}</b> receiver gain</span><span><b>{preview.acquisition_time}</b> acquisition time</span><span><b>{preview.pulse_width}</b> pulse width</span><span><b>{preview.dwell_time_us?.toFixed(2) ?? 'n/a'} us</b> dwell time</span><span><b>{preview.relaxation_delay}</b> relaxation delay</span><span><b>{preview.points.toLocaleString()}</b> number of data points</span><span><b>{preview.sampled_points.toLocaleString()}</b> number of plotted data points</span></div><Trace title="Frequency domain" real={preview.spectrum_real} imaginary={preview.spectrum_imaginary} showImaginary={showImaginary} ppm={preview.spectrum_ppm} /><Trace title="Time domain" real={preview.fid_real} imaginary={preview.fid_imaginary} showImaginary={showImaginary} /><PulseProgramOverview preview={preview} /><PhaseCycleSummary preview={preview} /></> : null}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<NmrglueGUI />);
