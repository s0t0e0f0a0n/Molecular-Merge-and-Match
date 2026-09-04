import { useCallback, useState } from 'react';
import { FragmentList } from '../../components/FragmentList';
import type { BackendFragment } from '../../hooks/useFragments';
import type { WorkingSolution } from '../../hooks/useWorkingSolution';
import type { FragmentWithGraph, MergeState, MolAtom } from '../../types/molecule';
import type { PeakDef } from '../../types/peak';

function ppmFmt(x: number) {
  return x.toFixed(x < 10 ? 2 : 1);
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        padding: '2px 4px',
        border: '1px solid #ccc',
        borderRadius: 999,
        fontSize: 11,
        background: 'white',
      }}
    >
      {label}
      <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, opacity: 0.8 }}
        title="Unlink"
        type="button"
      >
        ✕
      </button>
    </span>
  );
}

export interface WorkingFragmentsStripProps {
  userFragments: BackendFragment[];
  onDeleteFragment: (id: number) => void;
  onEditFragment?: (id: number) => void;
  peaks: PeakDef[];
  // linking
  selectedPeakId: string | null;
  selectedFragmentId: string | null;
  selectFragment: (id: string) => void;
  isLinked: (fragmentId: string, peakId: string) => boolean;
  unlink: (fragmentId: string, peakId: string) => void;
  linksByFragment: Map<string, string[]>;
  setHoverFragmentId: (id: string | null) => void;
  fragmentIsHighlighted: (id: string) => boolean;
  hasFocus: boolean;
  // solution / merge
  solution: WorkingSolution | null;
  setSolution: (smiles: string, molFile: string) => Promise<void>;
  mergeState: MergeState;
  setMergeState: (state: MergeState) => void;
  onFragmentToFragmentMerge: (targetFragmentId: number, targetPointIndex: number) => void;
  headerExtra?: React.ReactNode;
  onFragmentOrderChange?: (orderedIds: string[]) => void;
  fragmentIndexMap?: Map<string, number>;
}

export function WorkingFragmentsStrip({
  userFragments,
  onDeleteFragment,
  onEditFragment,
  peaks,
  selectedPeakId,
  selectedFragmentId,
  selectFragment,
  isLinked,
  unlink,
  linksByFragment,
  setHoverFragmentId,
  fragmentIsHighlighted,
  hasFocus,
  solution,
  setSolution,
  mergeState,
  setMergeState,
  onFragmentToFragmentMerge,
  headerExtra,
  onFragmentOrderChange,
  fragmentIndexMap,
}: WorkingFragmentsStripProps) {
  const [annotationDrafts, setAnnotationDrafts] = useState<Record<string, string>>({});
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);

  const handleUseAsSolution = useCallback(
    (fragment: FragmentWithGraph) => {
      setSolution(fragment.smiles, fragment.molFile);
    },
    [setSolution],
  );

  const handleStartMerge = useCallback(
    (fragmentId: number) => {
      setMergeState({ phase: 'picking-fragment-atom', fragmentId });
    },
    [setMergeState],
  );

  const handleCancelMerge = useCallback(() => {
    setMergeState({ phase: 'idle' });
  }, [setMergeState]);

  const handleFragmentAtomClick = useCallback(
    (fragmentId: string, atomIndex: number) => {
      if (mergeState.phase === 'picking-fragment-atom') {
        // Source atom picked -> show all merge targets
        setMergeState({
          phase: 'picking-merge-target',
          fragmentId: mergeState.fragmentId,
          fragmentAtomIndex: atomIndex,
        });
      } else if (mergeState.phase === 'picking-merge-target') {
        // Target atom picked on another fragment -> fragment-to-fragment merge
        onFragmentToFragmentMerge(Number(fragmentId), atomIndex);
      }
    },
    [mergeState, setMergeState, onFragmentToFragmentMerge],
  );

  const getFragmentStyle = useCallback(
    (fragment: FragmentWithGraph): React.CSSProperties => {
      const isFragSelected = selectedFragmentId === fragment.id;
      return {
        border: isFragSelected ? '2px solid #111' : '1px solid #ddd',
        padding: isFragSelected ? 5 : 6,
        background: isFragSelected ? '#eeeeee' : fragmentIsHighlighted(fragment.id) ? '#eeeeee' : 'white',
        opacity: hasFocus ? (fragmentIsHighlighted(fragment.id) ? 1 : 0.35) : 1,
        cursor: 'pointer',
      };
    },
    [selectedFragmentId, hasFocus, fragmentIsHighlighted],
  );

  const renderLinkingActions = useCallback(
    (fragment: FragmentWithGraph, heavyAtoms: MolAtom[]) => {
      const peakIds = linksByFragment.get(fragment.id) ?? [];
      const _linkedToSelected = selectedPeakId ? isLinked(fragment.id, selectedPeakId) : false;
      const _isFragSelected = selectedFragmentId === fragment.id;
      const hasHeavy = heavyAtoms.length > 0;

      // Show "Merge" when there's at least one possible target (solution or another fragment)
      const canMerge = mergeState.phase === 'idle' && hasHeavy && (!!solution || userFragments.length >= 2);
      const isThisMerge = mergeState.phase !== 'idle' && 'fragmentId' in mergeState && mergeState.fragmentId === Number(fragment.id);

      const annotation = annotationDrafts[fragment.id] ?? (fragment as any).annotation ?? '';
      const isEditing = editingAnnotationId === fragment.id;

      return (
        <>
          <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap', justifyContent: 'flex-start'}} >
            {!solution && (
              <button
                type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleUseAsSolution(fragment);
              }}
                style={{
                  padding: '2px 8px', borderRadius: 6,
                  border: '1px solid #4CAF50', background: '#E8F5E9', color: '#2E7D32',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                }}
              >
                Use as solution
              </button>
            )}

            {canMerge && (
              <button
                type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStartMerge(Number(fragment.id));
              }}
                style={{
                  padding: '2px 8px', borderRadius: 6,
                  border: '1px solid #2196F3', background: '#E3F2FD', color: '#1565C0',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                }}
              >
                Merge
              </button>
            )}

            {isThisMerge && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelMerge();
                }}
                aria-label="Cancel merge"
                title="Cancel the in-progress merge"
                style={{
                  padding: '2px 8px', borderRadius: 6,
                  border: '1px solid #FF5722', background: '#FFF3E0', color: '#E65100',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                }}
              >
                Cancel
              </button>
            )}

            {!annotation && !isEditing && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingAnnotationId(fragment.id);
                }}
                style={{
                  padding: '2px 8px', borderRadius: 6,
                  border: '1px solid black', background: '#f0f0f0', color: 'black',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                }}
              >
                Annotate
              </button>
            )}
          </div>

          {(annotation || isEditing) && (
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }} onClick={(e) => e.stopPropagation()}>
              {isEditing ? (
                <textarea
                  autoFocus
                  value={annotation}
                  onChange={(e) =>
                    setAnnotationDrafts((prev) => ({
                      ...prev,
                      [fragment.id]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={async () => {
                    setEditingAnnotationId(null);
                    try {
                      await fetch(`/api/v1/fragments/${fragment.id}/annotation`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ annotation: annotation })
                      });
                    } catch (err) {
                      console.error('Failed to save annotation:', err);
                    }
                  }}
                  placeholder="Write a note..."
                  style={{ width: '100%', minHeight: 45, fontSize: 11, fontFamily: 'var(--font-ui)', padding: '4px 6px', borderRadius: 4, border: '1px solid #ccc', resize: 'vertical', boxSizing: 'border-box' }}
                />
              ) : (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingAnnotationId(fragment.id);
                  }}
                  title="Click to edit annotation"
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-ui)',
                    padding: '4px 6px',
                    cursor: 'text',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                    color: '#555',
                    background: 'transparent',
                    borderRadius: 4,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {annotation}
                </div>
              )}
            </div>
          )}

          {peakIds.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2, overflow: 'auto', justifyContent: 'flex-end', }}>
              {peakIds.map((pid) => {
                  const peak = peaks.find((p) => p.id === pid);

                  if (!peak) {
                      console.warn('Missing peak for id', pid);
                      return null;
                  }

                  return (
                    <Chip
                      key={pid}
                      label={`${
                                  peak.displayLabel
                                    ?? (peak.spectrum === '1H'
                                      ? '¹H'
                                      : peak.spectrum === '13C'
                                        ? '¹³C'
                                        : peak.spectrum)
                                } ${ppmFmt(peak.ppm)}`}
                      onRemove={() => unlink(fragment.id, pid)}
                    />
                  );
                })}
            </div>
          )}
        </>
      );
    },
    [
      linksByFragment,
      selectedPeakId,
      selectedFragmentId,
      solution,
      mergeState,
      peaks,
      isLinked,
      unlink,
      handleUseAsSolution,
      handleStartMerge,
      handleCancelMerge,
      userFragments.length,
      annotationDrafts,
      editingAnnotationId,
    ],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, paddingLeft: 15 }}>Working fragments</span>
          {headerExtra}
        </div>
        {mergeState.phase !== 'idle' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 10px', borderRadius: 6,
            background: '#E3F2FD', border: '1px solid #90CAF9',
            color: '#1565C0', fontSize: 12,
          }}>
            <span>
              {mergeState.phase === 'picking-fragment-atom' && 'Click an atom on the fragment to bond'}
              {mergeState.phase === 'picking-merge-target' && 'Now click an atom on the solution or another fragment'}
            </span>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'auto' }}>
        <FragmentList
          fragments={userFragments}
          onDelete={onDeleteFragment}
          onEdit={onEditFragment}
          emptyMessage="No fragments yet. Pick from the predefined library or open the molecule editor."
          onFragmentHover={setHoverFragmentId}
          onFragmentClick={(id) => selectFragment(String(id))}
          getFragmentStyle={getFragmentStyle}
          atomMergeFragmentId={'fragmentId' in mergeState ? mergeState.fragmentId : null}
          atomMergePhase={mergeState.phase}
          selectedFragmentAtom={
            mergeState.phase === 'picking-merge-target' ? mergeState.fragmentAtomIndex : null
          }
          onFragmentAtomClick={handleFragmentAtomClick}
          mergeTargetMode={mergeState.phase === 'picking-merge-target'}
          renderActions={renderLinkingActions}
          onOrderChange={onFragmentOrderChange}
          fragmentIndexMap={fragmentIndexMap}
        />
      </div>
    </div>
  );
}