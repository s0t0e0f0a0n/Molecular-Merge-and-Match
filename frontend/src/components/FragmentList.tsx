import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';

import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';

import { CSS } from '@dnd-kit/utilities';
import { useRDKit } from '../context/RDKitContext';
import { parseMolBlock } from '../utils/molParser';
import { findHighlightedAtomPositions } from '../utils/svgMergePointLocator';
import { ExpandedMoleculeView } from './ExpandedMoleculeView';
import type { BackendFragment } from '../hooks/useFragments';
import type { FragmentWithGraph, MolAtom } from '../types/molecule';
import { calculateMolecularFormula, FormulaWithSubscripts } from '../features/solution/WorkingSolutionPanel';

// ---------------------------------------------------------------------------
// Enrichment helper: BackendFragment[] → FragmentWithGraph[]
// Exported so callers who need the enriched data (e.g. for merge) can reuse.
// ---------------------------------------------------------------------------
export function enrichFragments(raw: BackendFragment[]): FragmentWithGraph[] {
  return raw.map((f) => {
    try {
      const graph = parseMolBlock(f.mol_file);
        return Object.assign(
          { id: String(f.id), label: f.label, smiles: f.smiles, molFile: f.mol_file, graph },
          { annotation: (f as any).annotation }
        ) as FragmentWithGraph;
    } catch {
        return Object.assign(
          { id: String(f.id), label: f.label, smiles: f.smiles, molFile: f.mol_file, graph: { atoms: [], bonds: [] } },
          { annotation: (f as any).annotation }
        ) as FragmentWithGraph;
    }
  });
}

// ---------------------------------------------------------------------------
// SVG molecule thumbnail (shared between editor and linking views)
// ---------------------------------------------------------------------------
const THUMB_W = 120;
const THUMB_H = 95;

function makeSvgBackgroundTransparent(svg: string) {
  return svg.replace(/<rect\b[^>]*\/?>/i, '');
}

function MolThumb({
  molFile,
  atomMergeMode = false,
  heavyAtoms = [],
  selectedAtom = null,
  onAtomClick,
}: {
  molFile: string;
  atomMergeMode?: boolean;
  heavyAtoms?: { index: number; symbol: string }[];
  selectedAtom?: number | null;
  onAtomClick?: (atomIndex: number) => void;
}) {
  const { rdkit } = useRDKit();
  const [svg, setSvg] = useState('');
  const [overlayPositions, setOverlayPositions] = useState<Array<{ x: number; y: number }>>([]);
  const [expanded, setExpanded] = useState(false);

  // The expand modal is merge-only; collapse it automatically when merge ends.
  useEffect(() => {
    if (!atomMergeMode) setExpanded(false);
  }, [atomMergeMode]);

  useEffect(() => {
    if (!rdkit) return;
    const mol = rdkit.get_mol(molFile);
    if (!mol?.is_valid()) { mol?.delete(); setSvg(''); return; }

    if (atomMergeMode && heavyAtoms.length > 0) {
      const hl = mol.get_svg_with_highlights(
        JSON.stringify({ atoms: heavyAtoms.map((a) => a.index), width: THUMB_W, height: THUMB_H }),
      );
      setSvg(makeSvgBackgroundTransparent(hl));
      setOverlayPositions(findHighlightedAtomPositions(hl));
    } else {
      setSvg(makeSvgBackgroundTransparent(mol.get_svg(THUMB_W, THUMB_H)));
      setOverlayPositions([]);
    }
    mol.delete();
  }, [rdkit, molFile, atomMergeMode, heavyAtoms]);

  const viewBox = useMemo(() => {
    if (!svg) return null;
    const m = svg.match(/viewBox=['"]([\d.\-\s]+)['"]/);
    if (!m) return null;
    const [vx, vy, vw, vh] = m[1].split(/\s+/).map(Number);
    return { x: vx, y: vy, w: vw, h: vh };
  }, [svg]);

  const hasOverlay = atomMergeMode && viewBox && overlayPositions.length === heavyAtoms.length;

  const blockEvent = (e: any) => {
    e.stopPropagation();
    if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
      e.nativeEvent.stopImmediatePropagation();
    }
  };

  if (!svg) {
    return (
      <div style={{
        width: THUMB_W, height: THUMB_H, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f9f9f9', borderRadius: 6, fontSize: 11, color: '#999',
        flexShrink: 0,
      }}>
        {rdkit ? 'Unable to render' : 'Loading RDKit…'}
      </div>
    );
  }

  return (
    <>
      <div style={{
        position: 'relative', width: THUMB_W, height: THUMB_H,
        borderRadius: 6, overflow: 'hidden', border: 'none',
        background: 'transparent', flexShrink: 0,
      }}>
        <div style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: svg }} />
        {hasOverlay && overlayPositions.map((pos, idx) => {
          const leftPct = ((pos.x - viewBox!.x) / viewBox!.w) * 100;
          const topPct = ((pos.y - viewBox!.y) / viewBox!.h) * 100;
          const isSel = selectedAtom === heavyAtoms[idx]?.index;
          return (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                blockEvent(e);
                onAtomClick?.(heavyAtoms[idx].index);
              }}
              onPointerDown={blockEvent}
              onMouseDown={blockEvent}
              onMouseUp={blockEvent}
              onTouchStart={blockEvent}
              onTouchEnd={blockEvent}
              title={`${heavyAtoms[idx]?.symbol ?? '?'} (atom ${idx + 1})`}
              style={{
                position: 'absolute', left: `${leftPct}%`, top: `${topPct}%`,
                transform: 'translate(-50%, -50%)', width: 20, height: 20,
                borderRadius: '50%',
                border: isSel ? '3px solid #2196F3' : '2px solid #9C27B0',
                background: isSel ? 'rgba(33,150,243,0.3)' : 'rgba(156,39,176,0.2)',
                cursor: 'pointer', padding: 0, zIndex: 10,
              }}
            />
          );
        })}
        {atomMergeMode && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              blockEvent(e);
              setExpanded(true);
            }}
            onPointerDown={blockEvent}
            onMouseDown={blockEvent}
            onMouseUp={blockEvent}
            onTouchStart={blockEvent}
            onTouchEnd={blockEvent}
            title="Expand for a larger view"
            style={{
              position: 'absolute', top: 4, right: 4,
              padding: '2px 8px', fontSize: 11, fontWeight: 600,
              borderRadius: 6, border: '1px solid #2196F3',
              background: 'white', color: '#2196F3',
              cursor: 'pointer', zIndex: 11,
            }}
          >
            Expand
          </button>
        )}
      </div>
      {expanded && atomMergeMode && (
        <ExpandedMoleculeView
          molFile={molFile}
          heavyAtoms={heavyAtoms as MolAtom[]}
          selectedAtom={selectedAtom}
          title="Pick an atom"
          onAtomClick={(atomIndex) => {
            setExpanded(false);
            onAtomClick?.(atomIndex);
          }}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Fragment Formula Display
// ---------------------------------------------------------------------------
function FragmentFormula({ molFile }: { molFile: string }) {
  const { rdkit } = useRDKit();
  const formula = useMemo(() => calculateMolecularFormula(molFile, rdkit), [molFile, rdkit]);

  if (!formula) return null;
  return (
    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: '#444', marginTop: 2 }}>
      <FormulaWithSubscripts formula={formula} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FragmentList — the shared fragment list rendered in both the editor popup
// and the linking view.
// ---------------------------------------------------------------------------

export interface FragmentListProps {
  fragments: BackendFragment[];
  onDelete?: (id: number) => void;
  onEdit?: (id: number) => void;
  emptyMessage?: string;
  /**
   * Optional render-prop to inject extra per-fragment actions or controls
   * (e.g. link-to-peak buttons in the linking view).
   */
  renderActions?: (fragment: FragmentWithGraph, heavyAtoms: MolAtom[]) => React.ReactNode;
  /**
   * Optional ref callback so the parent can track DOM nodes per fragment
   * (used by the linking view for line-overlay positioning).
   */
  fragmentRefCallback?: (fragmentId: string, el: HTMLDivElement | null) => void;
  /** Optional hover callbacks for the linking view highlight mode. */
  onFragmentHover?: (fragmentId: string | null) => void;
  /** Optional click callback for selecting the fragment. */
  onFragmentClick?: (fragmentId: string) => void;
  /** Per-fragment style override (e.g. selection border, dimming). */
  getFragmentStyle?: (fragment: FragmentWithGraph) => React.CSSProperties;
  /** Atom merge mode props — only the fragment with this id shows merge overlays. */
  atomMergeFragmentId?: number | null;
  atomMergePhase?: 'idle' | 'picking-fragment-atom' | 'picking-merge-target';
  selectedFragmentAtom?: number | null;
  onFragmentAtomClick?: (fragmentId: string, atomIndex: number) => void;
  /** When true, all fragments except atomMergeFragmentId show target overlays. */
  mergeTargetMode?: boolean;
  /** Called whenever the visual order of fragments changes (drag or reset) */
  onOrderChange?: (orderedIds: string[]) => void;
  /** Per-fragment badge number, same as the peak table. */
  fragmentIndexMap?: Map<string, number>;
}

function SortableFragmentCard({
  fragmentId,
  children,
}: {
  fragmentId: string;
  children: (dragHandleProps: {
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners: ReturnType<typeof useSortable>['listeners'];
  }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: fragmentId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}

export function FragmentList({
  fragments: rawFragments,
  onDelete,
  onEdit,
  emptyMessage = 'No fragments yet.',
  renderActions,
  fragmentRefCallback,
  onFragmentHover,
  onFragmentClick,
  getFragmentStyle,
  atomMergeFragmentId = null,
  atomMergePhase = 'idle',
  selectedFragmentAtom = null,
  onFragmentAtomClick,
  mergeTargetMode = false,
  onOrderChange,
  fragmentIndexMap,
}: FragmentListProps) {
  const enriched = useMemo(() => enrichFragments(rawFragments), [rawFragments]);

  const [orderedFragments, setOrderedFragments] = useState(enriched);

  useEffect(() => {
    setOrderedFragments((prev) => {
      const enrichedById = new Map(
        enriched.map((fragment) => [fragment.id, fragment]),
      );

      // Keep the existing drag-and-drop order for fragments that still exist
      const preserved = prev
        .filter((fragment) => enrichedById.has(fragment.id))
        .map((fragment) => enrichedById.get(fragment.id)!);

      const preservedIds = new Set(preserved.map((fragment) => fragment.id));

      // Put newly added fragments at the beginning
      const added = enriched.filter(
        (fragment) => !preservedIds.has(fragment.id),
      );

      return [...added, ...preserved];
    });
  }, [enriched]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = orderedFragments.findIndex((f) => f.id === active.id);
    const newIndex = orderedFragments.findIndex((f) => f.id === over.id);

    setOrderedFragments((items) => {
      const next = arrayMove(items, oldIndex, newIndex);
      onOrderChange?.(next.map((f) => f.id));
      return next;
    });
  };

  if (enriched.length === 0) {
    return (
      <div style={{
        padding: 14, borderRadius: 10, border: '1px dashed #cfcfcf',
        fontSize: 13, color: '#666', background: '#fafafa',
      }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={orderedFragments.map((f) => f.id)}
        strategy={rectSortingStrategy}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 8,
            minWidth: 0,
            alignItems: 'start',
          }}
        >
      {orderedFragments.map((fragment) => {
        const heavyAtoms = fragment.graph.atoms.filter((a) => a.symbol !== 'H' && a.symbol !== '*');
        const isThisMerge = atomMergeFragmentId === Number(fragment.id);
        const isSourcePicking = atomMergePhase === 'picking-fragment-atom' && isThisMerge;
        const isTargetCandidate = mergeTargetMode && !isThisMerge && heavyAtoms.length > 0;
        const isAtomMerging = isSourcePicking || isTargetCandidate;

        const customStyle = getFragmentStyle?.(fragment) ?? {};
        const num = fragmentIndexMap?.get(fragment.id) ?? fragment.id;

        return (
          <SortableFragmentCard key={fragment.id} fragmentId={fragment.id}>
            {({ attributes, listeners }) => (
            <div
              ref={fragmentRefCallback ? (el) => fragmentRefCallback(fragment.id, el) : undefined}
              onMouseEnter={onFragmentHover ? () => onFragmentHover(fragment.id) : undefined}
              onMouseLeave={onFragmentHover ? () => onFragmentHover(null) : undefined}
              onClick={onFragmentClick ? () => onFragmentClick(fragment.id) : undefined}
              style={{
                border: '1px solid #d8d8d8',
                borderRadius: 10,
                padding: 8,
                background: '#fcfcfc',
                display: 'flex',
                gap: 0,
                alignItems: 'flex-start',
                ...customStyle,
              }}
            >
              <div>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 6}}>
                  <span
                    title={`Fragment ${num}`}
                    style={{
                      flexShrink: 0,
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      border: '1px solid #ccc',
                      background: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {num}
                  </span>

                  <div style={{ fontSize: 11, opacity: 1, wordBreak: 'break-all', fontFamily: 'var(--font-ui)' }}>
                    <FragmentFormula molFile={fragment.molFile} />
                  </div>
                </div>

                <MolThumb
                  molFile={fragment.molFile}
                  atomMergeMode={isAtomMerging}
                  heavyAtoms={heavyAtoms}
                  selectedAtom={
                    atomMergePhase === 'picking-merge-target' && isThisMerge
                      ? selectedFragmentAtom
                      : null
                  }
                  onAtomClick={
                    onFragmentAtomClick
                      ? (atomIndex) => onFragmentAtomClick(fragment.id, atomIndex)
                      : undefined
                  }
                />
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Header: edit + delete + drag */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                      alignItems: 'baseline',
                      gap: 6,
                      flexWrap: 'wrap',
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    {onEdit && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEdit(Number(fragment.id)); }}
                        aria-label={`Edit fragment ${num}`}
                        title={`Edit fragment ${num} in the molecule editor`}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          border: '1px solid #4a90d9',
                          background: '#eaf3fb',
                          color: '#1a6bb5',
                          cursor: 'pointer',
                          fontSize: 11,
                          flexShrink: 0,
                        }}
                      >
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(Number(fragment.id));
                        }}
                        aria-label={`Delete fragment ${num}`}
                        title={`Delete fragment ${num}`}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          border: '1px solid #ccc',
                          background: 'white',
                          cursor: 'pointer',
                          fontSize: 11,
                          flexShrink: 0,
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    onClick={(e) => e.stopPropagation()}
                    title="Drag fragment"
                    style={{
                      border: '0px solid #ccc',
                      background: 'none',
                      borderRadius: 6,
                      cursor: 'grab',
                      fontSize: 13,
                      padding: '2px 5px',
                      flexShrink: 0,
                    }}
                  >
                    {'\u283F'}
                  </button>
                </div>

                {/* View-specific actions injected by the parent */}
                {renderActions?.(fragment, heavyAtoms)}
              </div>
            </div>
            )}
          </SortableFragmentCard>
        );
      })}
    </div>
  </SortableContext>
</DndContext>
  );
}
