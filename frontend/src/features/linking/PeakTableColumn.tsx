import type { PeakDef } from '../../types/peak';

type PeakListRow = Pick<PeakDef, 'id' | 'ppm' | 'multiplicity'>;

function ppmFmt(x: number) {
  return x.toFixed(x < 10 ? 2 : 1);
}

export function PeakList({
  peaks,
  linksByPeak,
  selectedPeakId,
  onSelectPeak,
  onHoverPeak,
  isHighlighted,
  dimNonHighlighted,
  activeFragmentIds,
  fragmentIndexMap,
}: {
  peaks: PeakListRow[];
  linksByPeak: Map<string, string[]>;
  selectedPeakId: string | null;
  onSelectPeak: (id: string) => void;
  onHoverPeak: (id: string | null) => void;
  isHighlighted: (peakId: string) => boolean;
  dimNonHighlighted: boolean;
  // If provided, fragment chips are only rendered when their fragmentId is
  // in this set. Hides ghost chips left behind by deleted fragments.
  activeFragmentIds?: Set<string>;
  // Maps fragment string ID to 1-based display number
  fragmentIndexMap?: Map<string, number>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {peaks.map((p) => {
        const allFrags = linksByPeak.get(p.id) ?? [];
        const frags = activeFragmentIds
          ? allFrags.filter((fid) => activeFragmentIds.has(fid))
          : allFrags;
        const selected = selectedPeakId === p.id;

        return (
          <div
            key={p.id}
            onClick={() => onSelectPeak(p.id)}
            onMouseEnter={() => onHoverPeak(p.id)}
            onMouseLeave={() => onHoverPeak(null)}
            style={{
              border: '1px solid #ddd',
              borderRadius: 8, // Peak entry border radius
              padding: '3px 5px', // Top and side padding within peak entry
              cursor: 'pointer',
              background: selected ? '#111' : isHighlighted(p.id) ? '#eeeeee' : 'white',
              color: selected ? 'white' : 'black',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8, // Gap between label and badges
              opacity: dimNonHighlighted ? (selected || isHighlighted(p.id) ? 1 : 0.35) : 1,
              fontSize: 13, // Peakvalue fontsize
            }}
            role="button"
            tabIndex={0}
          >
            <div style={{ display: 'flex', gap: 8, // Gap between peakvalue and label
                          alignItems: 'baseline' }}>
              <b>{ppmFmt(p.ppm)}</b>
              {p.multiplicity && (
                <span style={{ fontSize: 11, // Label fontsize
                               opacity: selected ? 0.85 : 0.6 }}>{p.multiplicity}</span>
              )}
            </div>

            {frags.length > 0 && (
              // Gap between badges
              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                {frags.map((fid) => (
                  <span
                    key={fid}
                    style={{
                      fontSize: 11, // Badge fontsize
                      padding: '1px 4px', // Badge number padding
                      borderRadius: 999, // Badge border radius
                      border: selected ? '1px solid rgba(255,255,255,0.5)' : '1px solid #ccc',
                    }}
                  >
                    {fragmentIndexMap ? (fragmentIndexMap.get(fid) ?? fid) : fid}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface PeakTableColumnProps {
  peaks1H: PeakDef[];
  peaks13C: PeakDef[];
  linksByPeak: Map<string, string[]>;
  selectedPeakId: string | null;
  selectPeak: (id: string) => void;
  setHoverPeakId: (id: string | null) => void;
  peakIsHighlighted: (peakId: string) => boolean;
  hasFocus: boolean;
  clearLinks: () => void;
  selectedFragmentId: string | null;
}

export function PeakTableColumn({
  peaks1H,
  peaks13C,
  linksByPeak,
  selectedPeakId,
  selectPeak,
  setHoverPeakId,
  peakIsHighlighted,
  hasFocus,
  clearLinks,
  selectedFragmentId,
}: PeakTableColumnProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <button
          onClick={clearLinks}
          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc', background: 'white', fontSize: 12, cursor: 'pointer' }}
          type="button"
        >
          Clear links
        </button>
        <span style={{ fontSize: 11, opacity: 0.6 }}>
          peak <b>{selectedPeakId ?? '—'}</b> · frag <b>{selectedFragmentId ?? '—'}</b>
        </span>
      </div>

      {/* 1H peaks */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>¹H peaks (ppm)</div>
        <PeakList
          peaks={peaks1H}
          linksByPeak={linksByPeak}
          selectedPeakId={selectedPeakId}
          onSelectPeak={selectPeak}
          onHoverPeak={setHoverPeakId}
          isHighlighted={peakIsHighlighted}
          dimNonHighlighted={hasFocus}
        />
      </div>

      {/* 13C peaks */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>¹³C peaks (ppm)</div>
        <PeakList
          peaks={peaks13C}
          linksByPeak={linksByPeak}
          selectedPeakId={selectedPeakId}
          onSelectPeak={selectPeak}
          onHoverPeak={setHoverPeakId}
          isHighlighted={peakIsHighlighted}
          dimNonHighlighted={hasFocus}
        />
      </div>
    </div>
  );
}
