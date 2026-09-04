import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatChemistryText } from '../../utils/formatChemistryText'

type ViewMode = 'fit' | 'scroll'

const highlightStyles = `
  .peak-highlight-box {
    position: absolute;
    top: 0;
    height: 100%;
    box-sizing: border-box;
    transition: background-color 0.1s ease-in-out;
    cursor: pointer;
  }
  .peak-highlight-box:hover, .peak-highlight-box.active {
    background-color: rgba(144, 238, 144, 0.4);
  }
`;

export interface SpectrumViewerProps {
  /**
   * Optional override for the rendered title. When omitted, the title is built
   * from `type` (so we can render `<sup>1</sup>H-NMR Spectrum` /
   * `<sup>13</sup>C-NMR Spectrum`) plus the solvent / frequency / APT metadata.
   */
  title?: string
  src: string
  height?: number | string
  embedded?: boolean
  type: 'H' | 'C';
  peaks: { id: string; ppm: number }[];
  axisRange: [number, number];
  onHoverPeak?: (id: string | null) => void;
  onSelectPeak?: (id: string) => void;
  isHighlighted?: (id: string) => boolean;
  /** Solvent string (e.g. "CDCl3" or "/it{n}-BuLi"). Rendered formatted. */
  solvent?: string | null;
  /** NMR frequency in MHz, rendered as `300 MHz`. */
  frequencyMhz?: number | null;
  /** When true, append "APT" next to a 13C title. Ignored for 1H. */
  apt?: boolean;
}

/** Build the NMR title node: `<sup>n</sup>X-NMR Spectrum [solvent] [freq] [APT]`. */
function renderSpectrumTitle(
  type: 'H' | 'C',
  solvent: string | null | undefined,
  frequencyMhz: number | null | undefined,
  apt: boolean | undefined,
) {
  const massNumber = type === 'H' ? '1' : '13';
  const nucleus = type === 'H' ? 'H' : 'C';

  return (
    <span>
      <sup>{massNumber}</sup>{nucleus}-NMR Spectrum
      {solvent && (
        <span key={`solvent:${solvent}`} style={{ marginLeft: 8, fontWeight: 500 }}>
          {formatChemistryText(solvent)}
        </span>
      )}
      {frequencyMhz != null && (
        <span key="freq" style={{ marginLeft: 8, fontWeight: 500 }}>
          {frequencyMhz} MHz
        </span>
      )}
      {apt && type === 'C' && (
        <span key="apt" style={{ marginLeft: 8, fontWeight: 500 }}>APT</span>
      )}
    </span>
  );
}

function SpectrumCanvas({
  viewMode,
  zoom,
  displaySvg,
  svgContent,
  peakBoxes,
  isHighlighted,
  onHoverPeak,
  onSelectPeak,
}: {
  viewMode: ViewMode;
  zoom: number;
  displaySvg: string;
  svgContent: string;
  peakBoxes: { id: string; ppm: number; style: { left: string; width: string } }[];
  isHighlighted?: (id: string) => boolean;
  onHoverPeak?: (id: string | null) => void;
  onSelectPeak?: (id: string) => void;
}) {
  const spectrumInnerRef = useRef<HTMLDivElement | null>(null);

  const [svgViewport, setSvgViewport] = useState({
    left: 0,
    width: 0,
  });

  const svgAspectRatio = useMemo(() => {
    const match = svgContent.match(
      /viewBox="[^"]*?([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/i
    );

    if (!match) return null;

    const viewBoxWidth = Number(match[3]);
    const viewBoxHeight = Number(match[4]);

    if (
      !Number.isFinite(viewBoxWidth) ||
      !Number.isFinite(viewBoxHeight) ||
      viewBoxHeight === 0
    ) {
      return null;
    }

    return viewBoxWidth / viewBoxHeight;
  }, [svgContent]);

  useEffect(() => {
    const el = spectrumInnerRef.current;
    if (!el || !svgAspectRatio) return;

    const updateViewport = () => {
      const containerWidth = el.clientWidth;
      const containerHeight = el.clientHeight;

      if (containerWidth === 0 || containerHeight === 0) return;

      const containerRatio = containerWidth / containerHeight;

      let width = containerWidth;
      let left = 0;

      if (containerRatio > svgAspectRatio) {
        width = containerHeight * svgAspectRatio;
        left = (containerWidth - width) / 2;
      }

      setSvgViewport({ left, width });
    };

    updateViewport();

    const observer = new ResizeObserver(updateViewport);
    observer.observe(el);

    window.addEventListener('resize', updateViewport);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, [svgAspectRatio, viewMode, zoom]);

  return (
    <div
      ref={spectrumInnerRef}
      style={{
        height: viewMode === 'fit' ? '100%' : `${zoom * 100}%`,
        width: viewMode === 'fit' ? '100%' : `${zoom * 100}%`,
        minWidth: '100%',
        minHeight: '100%',
        transition: 'width 0.3s ease, height 0.3s ease',
        position: 'relative',
      }}
    >
      <div
        style={{ width: '100%', height: '100%', }}
        dangerouslySetInnerHTML={{ __html: displaySvg }}
      />

      <div
        style={{
          position: 'absolute',
          left: svgViewport.left,
          top: 0,
          width: svgViewport.width,
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {peakBoxes.map((box) => (
          <div
            key={box.id}
            className={`peak-highlight-box ${isHighlighted?.(box.id) ? 'active' : ''}`}
            style={{
              ...box.style,
              pointerEvents: 'auto',
            }}
            title={`Peak at ${box.ppm.toFixed(2)} ppm`}
            onMouseEnter={() => onHoverPeak?.(box.id)}
            onMouseLeave={() => onHoverPeak?.(null)}
            onClick={() => onSelectPeak?.(box.id)}  // This line makes the green highlighting boxes clickable/ linkable. To undo this: Remove this line.
          />
        ))}
      </div>
    </div>
  );
}

export function SpectrumViewer({ title, src, height = 200, type, peaks, axisRange, onHoverPeak, onSelectPeak, isHighlighted, embedded = false, solvent, frequencyMhz, apt }: SpectrumViewerProps) {
  // Built-in title: `<sup>n</sup>X-NMR Spectrum [solvent] [freq] [APT]`.
  // Callers can still pass an explicit `title` to override (used by tests).
  const renderedTitle: React.ReactNode = title ?? renderSpectrumTitle(type, solvent, frequencyMhz, apt);
  const [viewMode, setViewMode] = useState<ViewMode>('fit')
  const [zoom, setZoom] = useState(1.2) // Multiplier for 'scroll' mode
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [svgContent, setSvgContent] = useState<string>('')

  useEffect(() => {
  if (!src) {
    setSvgContent('');
    return;
  }

  fetch(src)
    .then((res) => res.text())
    .then((text) => {
      const processed = text
        .replace(/<title[\s\S]*?<\/title>/gi, '')
        .replace(/<desc[\s\S]*?<\/desc>/gi, '')
        .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
        .replace(/\s+title="[^"]*"/gi, '')
        .replace(/\s+data-name="[^"]*"/gi, '')
        .replace(/width="[^"]*"/, 'width="100%"')
        .replace(/height="[^"]*"/, 'height="100%"')
      setSvgContent(processed)
    })
    .catch((err) => console.error('Failed to load SVG', err))
}, [src])

  const totalAxisRange = axisRange[1] - axisRange[0];

  const highlightWidthPPM = useMemo(() => {
    if (type === 'H') return 0.18; // 0.18 ppm
    if (type === 'C') return 2.50;  // 2.00 ppm
    return 0;
  }, [type]);


  const peakBoxes = useMemo(() => {
    if (!peaks || totalAxisRange <= 0) return [];

    return peaks.map(peak => {
      // In NMR, high ppm is on the left. The axis is reversed.
      // The highlight box is centered on peakPpm. Its left edge in ppm units is at a higher ppm value.
      const boxLeftEdgePpm = peak.ppm + (highlightWidthPPM / 2);

      // The position of the left edge of the box is calculated relative to the start of the axis (the max ppm value).
      const leftPercent = ((axisRange[1] - boxLeftEdgePpm) / totalAxisRange) * 100;
      const widthPercent = (highlightWidthPPM / totalAxisRange) * 100;

      return {
        id: peak.id,
        ppm: peak.ppm,
        style: { left: `${leftPercent}%`, width: `${widthPercent}%` },
      };
    });
  }, [peaks, highlightWidthPPM, axisRange, totalAxisRange]);

  // Controls logic
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.2, 10))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.2, 1))
 
  const displaySvg = svgContent.replace(
    /<svg([^>]*)>/,
    (match, attrs) => {
      const cleanAttrs = attrs
        .replace(/preserveAspectRatio="[^"]*"/g, '')
        .replace(/\s*style="[^"]*"/g, '')
      return `<svg${cleanAttrs} preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;">`
    }
  )
  
  const renderContent = (isModal: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          background: '#f9f9f9',
          borderBottom: '1px solid #eee',
          borderTopLeftRadius: isModal ? 8 : 12,
          borderTopRightRadius: isModal ? 8 : 12,
        }}
      >
        {!embedded && <div style={{ fontWeight: 700, fontSize: 14 }}>{renderedTitle}</div>}
        
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* View Mode Toggle */}
          <div style={{ display: 'flex', background: '#eee', borderRadius: 6, padding: 2 }}>
            <button
              onClick={() => setViewMode('fit')}
              style={{
                border: 'none',
                background: viewMode === 'fit' ? 'white' : 'transparent',
                boxShadow: viewMode === 'fit' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Fit
            </button>
            <button
              onClick={() => setViewMode('scroll')}
              style={{
                border: 'none',
                background: viewMode === 'scroll' ? 'white' : 'transparent',
                boxShadow: viewMode === 'scroll' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Scroll
            </button>
          </div>

          {/* Zoom Controls (only active in scroll mode) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: viewMode === 'scroll' ? 1 : 0.4 }}>
            <button
              onClick={handleZoomOut}
              disabled={viewMode !== 'scroll'}
              style={{ border: '1px solid #ccc', borderRadius: 4, width: 24, height: 24, cursor: viewMode === 'scroll' ? 'pointer' : 'default', background: 'white' }}
            >
              -
            </button>
            <span style={{ fontSize: 12, minWidth: 30, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button
              onClick={handleZoomIn}
              disabled={viewMode !== 'scroll'}
              style={{ border: '1px solid #ccc', borderRadius: 4, width: 24, height: 24, cursor: viewMode === 'scroll' ? 'pointer' : 'default', background: 'white' }}
            >
              +
            </button>
          </div>

          {/* Popup Toggle */}
          {!isModal && !embedded && (
            <button
              onClick={() => setIsPopupOpen(true)}
              style={{ border: '1px solid #ccc', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer', background: 'white' }}
              title="Open in popup"
            >
              ⤢
            </button>
          )}
          {isModal && (
             <button
             onClick={() => setIsPopupOpen(false)}
             style={{ border: '1px solid #ccc', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer', background: 'white' }}
             title="Close popup"
           >
             ✕ Close
           </button>
          )}
        </div>
      </div>

      {/* Spectrum Area */}
      <div
        style={{
          flex: 1,
          width: isModal ? '98%' : '100%',
          paddingBottom: isModal ? 6 : 2,
          paddingRight: isModal ? 13 : 3,
          paddingLeft: isModal ? 13: 3,
          paddingTop: 0,
          fontFamily: 'Aptos',
          alignSelf: 'center',
          overflowX: viewMode === 'scroll' ? 'auto' : 'hidden',
          overflowY: viewMode === 'scroll' ? 'auto' : 'hidden',
          
          position: 'relative',
          background: 'white',
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
        }}
      >
        <SpectrumCanvas
          viewMode={viewMode}
          zoom={zoom}
          displaySvg={displaySvg}
          svgContent={svgContent}
          peakBoxes={peakBoxes}
          isHighlighted={isHighlighted}
          onHoverPeak={onHoverPeak}
          onSelectPeak={onSelectPeak}
        />
      </div>
    </div>

  )

  if (embedded) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {renderContent(false)}
      </div>
    )
  }

  return (
    <>
      <style>{highlightStyles}</style>
      {/* Inline Version */}
      <div style={{ border: '1px solid #ddd', borderRadius: 12, height: height, display: 'flex', flexDirection: 'column', marginBottom: 16 }}>
        {renderContent(false)}
      </div>

      {/* Popup / Modal Version */}
      {isPopupOpen && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40
        }}>
          <div style={{ width: '95%', height: '100%', background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            {renderContent(true)}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}


