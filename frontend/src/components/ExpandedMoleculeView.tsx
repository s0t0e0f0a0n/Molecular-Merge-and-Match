import { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useRDKit } from '../context/RDKitContext';
import { findHighlightedAtomPositions } from '../utils/svgMergePointLocator';
import type { MolAtom } from '../types/molecule';

const SVG_W = 640;
const SVG_H = 500;
const OVERLAY_SIZE = 28;

export interface ExpandedMoleculeViewProps {
  molFile: string;
  heavyAtoms: MolAtom[];
  /** Atom index (in the full atom array) that is already selected as source. */
  selectedAtom?: number | null;
  /** Header title rendered above the molecule. */
  title?: string;
  /** Fired with the picked atom's index into `graph.atoms`. */
  onAtomClick: (atomIndex: number) => void;
  /** Fired when the user dismisses the popup without picking. */
  onClose: () => void;
}

/**
 * Modal-style enlarged view of a molecule with clickable atom overlays.
 * Used during merge picking so students can see crowded structures clearly.
 * Picking an atom invokes `onAtomClick` and dismisses the modal in one step.
 */
export function ExpandedMoleculeView({
  molFile,
  heavyAtoms,
  selectedAtom = null,
  title = 'Pick an atom',
  onAtomClick,
  onClose,
}: ExpandedMoleculeViewProps) {
  const { rdkit } = useRDKit();
  const [svg, setSvg] = useState('');
  const [overlayPositions, setOverlayPositions] = useState<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    if (!rdkit || !molFile) return;
    const mol = rdkit.get_mol(molFile);
    if (!mol?.is_valid()) { mol?.delete(); setSvg(''); return; }

    if (heavyAtoms.length > 0) {
      const hl = mol.get_svg_with_highlights(
        JSON.stringify({ atoms: heavyAtoms.map((a) => a.index), width: SVG_W, height: SVG_H }),
      );
      setSvg(hl);
      setOverlayPositions(findHighlightedAtomPositions(hl));
    } else {
      setSvg(mol.get_svg(SVG_W, SVG_H));
      setOverlayPositions([]);
    }
    mol.delete();
  }, [rdkit, molFile, heavyAtoms]);

  const viewBox = useMemo(() => {
    if (!svg) return null;
    const m = svg.match(/viewBox=['"]([\d.\-\s]+)['"]/);
    if (!m) return null;
    const [vx, vy, vw, vh] = m[1].split(/\s+/).map(Number);
    return { x: vx, y: vy, w: vw, h: vh };
  }, [svg]);

  const hasOverlay = viewBox && overlayPositions.length === heavyAtoms.length;

  // Close on Escape so keyboard users can back out quickly.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.25)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          maxWidth: '90vw',
          maxHeight: '90vh',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '4px 12px',
              borderRadius: 8,
              border: '1px solid #ccc',
              background: 'white',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Close
          </button>
        </div>

        {svg ? (
          <div
            style={{
              position: 'relative',
              width: SVG_W,
              height: SVG_H,
              border: '1px solid #ececec',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#fff',
            }}
          >
            <div style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: svg }} />
            {hasOverlay && overlayPositions.map((pos, idx) => {
              const leftPct = ((pos.x - viewBox!.x) / viewBox!.w) * 100;
              const topPct = ((pos.y - viewBox!.y) / viewBox!.h) * 100;
              const isSel = selectedAtom === heavyAtoms[idx]?.index;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onAtomClick(heavyAtoms[idx].index)}
                  title={`${heavyAtoms[idx]?.symbol ?? '?'} (atom ${idx + 1})`}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    transform: 'translate(-50%, -50%)',
                    width: OVERLAY_SIZE,
                    height: OVERLAY_SIZE,
                    borderRadius: '50%',
                    border: isSel ? '3px solid #2196F3' : '2px solid #9C27B0',
                    background: isSel ? 'rgba(33,150,243,0.3)' : 'rgba(156,39,176,0.2)',
                    cursor: 'pointer',
                    padding: 0,
                    zIndex: 10,
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div
            style={{
              width: SVG_W,
              height: SVG_H,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f9f9f9',
              borderRadius: 8,
              fontSize: 13,
              color: '#999',
            }}
          >
            {rdkit ? 'Rendering...' : 'Loading RDKit...'}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
