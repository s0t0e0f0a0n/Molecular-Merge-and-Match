import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatChemistryText } from '../../utils/formatChemistryText'
import { useHighlighting, type MergedHighlightBox, type PeakBox } from '../../hooks/useHighlighting'
import { forceSvgFontFamily } from './svgFontOverride'

type ViewMode = 'fit' | 'scroll'

type CheatOverlaySegmentDefinition = {
  label: string;
  backgroundColor: string;
  textColor: string;
};

type CheatOverlayDefinition = {
  innerBordersPpm: number[];
  segments: CheatOverlaySegmentDefinition[];
};

const CHEAT_OVERLAY_DEFINITIONS: Record<'H' | 'C', CheatOverlayDefinition> = {
  H: {
    innerBordersPpm: [8.5, 6.5, 4.5, 3.0],
    segments: [
      { label: "H's on sp² C of aldehydes", backgroundColor: 'rgba(255, 77, 77, 0.15)', textColor: '#5d4037' },
      { label: "H's on sp² C of aromatics", backgroundColor: 'rgba(255, 77, 255, 0.15)', textColor: '#5d4037' },
      { label: "H's on sp² C of alkenes", backgroundColor: 'rgba(255, 255, 77, 0.15)', textColor: '#5d4037' },
      { label: "H's on sp³ C, next to O", backgroundColor: 'rgba(77, 255, 77, 0.15)', textColor: '#5d4037' },      
      { label: "H's on sp³ C, not next to O", backgroundColor: 'rgba(77, 200, 255, 0.15)', textColor: '#5d4037' },
    ],
  },
  C: {
    innerBordersPpm: [150, 100, 50],
    segments: [
      { label: 'sp² C, next to O', backgroundColor: 'rgba(255, 77, 77, 0.15)', textColor: '#5d4037' },
      { label: 'sp² C, not next to O', backgroundColor: 'rgba(255, 255, 77, 0.15)', textColor: '#5d4037' },
      { label: 'sp³ C, next to O', backgroundColor: 'rgba(77, 255, 77, 0.15)', textColor: '#5d4037' },
      { label: 'sp³ C, not next to O', backgroundColor: 'rgba(77, 200, 255, 0.15)', textColor: '#5d4037' },
    ],
  },
};

const highlightStyles = `
  .peak-highlight-box {
    position: absolute;
    top: 0;
    height: 100%;
    box-sizing: border-box;
  }
  .peak-highlight-fill {
    position: absolute;
    top: 0;
    height: 100%;
    box-sizing: border-box;
    background-color: rgba(144, 238, 144, 0.4);
  }
  .peak-highlight-hitbox {
    position: absolute;
    top: 0;
    height: 100%;
    box-sizing: border-box;
    transition: background-color 0.1s ease-in-out;
    cursor: pointer;
    background: transparent;
  }
  .peak-highlight-hitbox:hover {
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
  /** Toggle literal "solvent" text embedded inside source SVG. */
  showSolventText?: boolean;
  /** Toggle literal "exchanges with D2O / D₂O" text in 1H source SVGs. */
  showExchangeText?: boolean;
  /** Show the cheat segmentation overlay for this spectrum. */
  showCheatSegmentsOverlay?: boolean;
  /** Show the spectrum data source label in the bottom-left corner. */
  showSpectrumDataSource?: boolean;
  /** Optional text to render as spectrum source metadata. */
  dataSource?: string | null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function ppmToPercent(ppm: number, axisRange: [number, number]): number {
  const minPpm = axisRange[0];
  const maxPpm = axisRange[1];
  const total = maxPpm - minPpm;

  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return clampPercent(((maxPpm - ppm) / total) * 100);
}
/** Replace "solvent" and "exchanges with D2O" as setting, with additional variations in the latter */
function applySvgTextVisibility(
  text: string,
  type: 'H' | 'C',
  showSolventText: boolean,
  showExchangeText: boolean,
): string {
  let processed = text;

  if (!showSolventText) {
    processed = processed.replace(/\bsolvent\b(?!\s+residual\b)/gi, '');
  }

  if (type === 'H' && !showExchangeText) {
    //Replaces the "exchanges with D2O" when it's a single line, including words like "slowly" etc.
    processed = processed.replace(/exchanges.*?\s+with\s+D(?:₂|2)O/gis, ''); 
    // Linebreaks in the MestreNova generated SVG's are treated as new <text> elements, so we replace every line.
    // This leaves empty <text> elements behind in most cases, it clutters but should be harmless.
    processed = processed.replace(/exchanges/gi, '');
    processed = processed.replace(/both\s+exchange/gi, '');
    processed = processed.replace(/(?:\w+\s+)?with\s+D(?:₂|2)O/gi, '');  
    // When part of a already exchanged water peak, this text is displayed, over 2 lines.
    processed = processed.replace(/also contains/gi, '');
    processed = processed.replace(/exchanged\s+protons/gi, '');
    
  }
// clean up empty text elements anyway
  processed = processed.replace(/<text\b[^>]*>\s*<\/text>/gis, '');  

  return processed;
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
  type,
  axisRange,
  showCheatSegmentsOverlay,
  showSpectrumDataSource,
  dataSource,
  peakBoxes,
  mergedActiveBoxes,
  onHoverPeak,
  onSelectPeak,
}: {
  viewMode: ViewMode;
  zoom: number;
  displaySvg: string;
  svgContent: string;
  type: 'H' | 'C';
  axisRange: [number, number];
  showCheatSegmentsOverlay: boolean;
  showSpectrumDataSource?: boolean;
  dataSource?: string | null;
  peakBoxes: PeakBox[];
  mergedActiveBoxes: MergedHighlightBox[];
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

  const overlayDefinition = useMemo(() => CHEAT_OVERLAY_DEFINITIONS[type], [type]);

  const overlaySegmentEdges = useMemo(() => {
    const borderPercents = overlayDefinition.innerBordersPpm
      .map((ppm) => ppmToPercent(ppm, axisRange))
      .sort((a, b) => a - b);
    return [0, ...borderPercents, 100];
  }, [overlayDefinition, axisRange]);

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
        {mergedActiveBoxes.map((box) => (
          <div
            key={box.id}
            className="peak-highlight-fill"
            style={box.style}
          />
        ))}

        {peakBoxes.map((box) => (
          <div
            key={box.id}
            className="peak-highlight-box peak-highlight-hitbox"
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

        {showCheatSegmentsOverlay && (
          <div
            data-testid={`cheat-overlay-${type}`}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            {overlaySegmentEdges.slice(0, -1).map((start, index) => {
              const end = overlaySegmentEdges[index + 1];
              const width = Math.max(0, end - start);
              const segmentDefinition = overlayDefinition.segments[index] ?? {
                label: `text ${index + 1}`,
                backgroundColor: 'rgba(255, 217, 102, 0.28)',
                textColor: '#333',
              };

              return (
                <div
                  key={`segment-${type}-${index}`}
                  data-testid={`cheat-overlay-${type}-segment-${index}`}
                  data-segment-label={segmentDefinition.label}
                  data-segment-color={segmentDefinition.backgroundColor}
                  style={{
                    position: 'absolute',
                    left: `${start}%`,
                    top: 0,
                    width: `${width}%`,
                    height: '100%',
                    backgroundColor: segmentDefinition.backgroundColor,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 6,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: segmentDefinition.textColor,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {segmentDefinition.label}
                  </div>
                </div>
              );
            })}

            {overlaySegmentEdges.slice(1, -1).map((position, index) => (
              <div
                key={`border-${type}-${index}`}
                data-testid={`cheat-overlay-${type}-border-${index}`}
                data-position={position.toFixed(3)}
                style={{
                  position: 'absolute',
                  left: `${position}%`,
                  top: 0,
                  height: '100%',
                  borderLeft: '2px dashed rgba(60, 60, 60, 0.6)',
                }}
              />
            ))}
          </div>
        )}

        {showSpectrumDataSource && dataSource ? (
          <div
            style={{
              position: 'absolute',
              fontFamily: 'var(--font-mono)',
              left: 6,
              bottom: 6,
              maxWidth: '50%',
              minWidth: 'max-content',
              padding: '4px 6px',
              borderRadius: 6,
              background: 'rgba(0, 0, 0, 0.4)',
              color: 'white',
              fontSize: 10,
              lineHeight: 0.9,              
			  
              pointerEvents: 'none',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'break-word',
            }}
          >Data source: &nbsp;
            {dataSource}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SpectrumViewer({ title, src, height = 200, type, peaks, axisRange, onHoverPeak, onSelectPeak, isHighlighted, embedded = false, solvent, frequencyMhz, apt, showSolventText = true, showExchangeText = true, showCheatSegmentsOverlay = false, showSpectrumDataSource = false, dataSource = null }: SpectrumViewerProps) {
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
      const processed = forceSvgFontFamily(
        applySvgTextVisibility(text, type, showSolventText, showExchangeText),
        {},
      )
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
}, [src, type, showSolventText, showExchangeText])

  const highlightWidthPPM = useMemo(() => {
    if (type === 'H') return 0.18; // 0.18 ppm
    if (type === 'C') return 2.00;  // 2.00 ppm
    return 0;
  }, [type]);

  const { peakBoxes, mergedActiveBoxes } = useHighlighting({
    peaks,
    axisRange,
    highlightWidthPPM,
    isHighlighted,
  });

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', }}>
      {/* Toolbar */}
      <div
        style={{
          fontFamily: 'var(--font-ui)',
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
          width: isModal ? '97%' : '100%',
          paddingBottom: 0,
          paddingRight: isModal ? 13 : 0,
          paddingLeft: isModal ? 13: 0,
          paddingTop: 0,
          fontFamily: 'var(--font-spectrum)',
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
          type={type}
          axisRange={axisRange}
          showCheatSegmentsOverlay={showCheatSegmentsOverlay}
          showSpectrumDataSource={showSpectrumDataSource}
          dataSource={dataSource}
          peakBoxes={peakBoxes}
          mergedActiveBoxes={mergedActiveBoxes}
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
        }}><div
              style={{
                width: '95%',
                height: '84%',
                alignSelf: 'center',
                overflow: viewMode === 'scroll' ? 'auto' : 'hidden',
              }}
            >
          <div style={{ width: '100%', height: '100%', background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            {renderContent(true)}
          </div></div>
        </div>,
        document.body
      )}
    </>
  )
}


