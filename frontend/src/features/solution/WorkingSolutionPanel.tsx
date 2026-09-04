import { useEffect, useMemo, useState } from 'react';
import { useRDKit } from '../../context/RDKitContext';
import { useExerciseData } from '../../context/ExerciseDataContext';
import { validateExerciseSolutionHash } from '../../api/exercises';
import { parseMolBlock } from '../../utils/molParser';
import { findHighlightedAtomPositions } from '../../utils/svgMergePointLocator';
import { ExpandedMoleculeView } from '../../components/ExpandedMoleculeView';
import type { WorkingSolution } from '../../hooks/useWorkingSolution';
import type { MergeState, MolAtom } from '../../types/molecule';
import { useWarning, type WarningResponse } from '../../context/WarningContext';

const SVG_W = 200;
const SVG_H = 110;

export function formulaToCounts(formula: string): Map<string, number> {
  const counts = new Map<string, number>();
  const matches = formula.matchAll(/([A-Z][a-z]?)(\d*)/g);

  for (const match of matches) {
    const symbol = match[1];
    const count = match[2] ? Number(match[2]) : 1;
    counts.set(symbol, (counts.get(symbol) ?? 0) + count);
  }

  return counts;
}

export function formatMissingAtoms(targetFormula: string | undefined, currentFormula: string): string {
  if (!targetFormula) return 'Target formula is not available yet.';

  const targetCounts = formulaToCounts(targetFormula);
  const currentCounts = formulaToCounts(currentFormula);

  const missing = Array.from(targetCounts.entries())
    .map(([symbol, targetCount]) => {
      const currentCount = currentCounts.get(symbol) ?? 0;
      return [symbol, targetCount - currentCount] as const;
    })
    .filter(([, missingCount]) => missingCount > 0);

  if (missing.length === 0) return 'You are not missing any atoms.';

  const parts = missing.map(([symbol, count]) => `${count} ${symbol}`);

  if (parts.length === 1) return `You are still missing: \n${parts[0]}.`;

  return `You are still missing: \n${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}.`;
}

export function FormulaWithSubscripts({ formula }: { formula: string }) {
  const parts = formula.match(/[A-Z][a-z]?|\d+/g) ?? [];

  return (
    <>
      {parts.map((part, index) =>
        /^\d+$/.test(part) ? <sub key={index}>{part}</sub> : <span key={index}>{part}</span>,
      )}
    </>
  );
}

async function sha256Hex(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function calculateMolecularFormula(molFile: string, rdkit: any): string {
  if (!rdkit || !molFile) return '';

  const mol = rdkit.get_mol(molFile);
  const molWithHs =
    mol && typeof (mol as unknown as { copy?: () => typeof mol }).copy === 'function'
      ? (mol as unknown as { copy: () => typeof mol }).copy()
      : mol;

  try {
    if (!mol || !mol.is_valid() || !molWithHs) return '';

    if (
      typeof (molWithHs as unknown as { add_hs_in_place?: () => void }).add_hs_in_place !== 'function' ||
      typeof (molWithHs as unknown as { get_molblock?: () => string }).get_molblock !== 'function'
    ) {
      return '';
    }

    (molWithHs as unknown as { add_hs_in_place: () => void }).add_hs_in_place();

    const molBlockWithHs = (molWithHs as unknown as { get_molblock: () => string }).get_molblock();
    const graph = parseMolBlock(molBlockWithHs);
    const counts = new Map<string, number>();

    graph.atoms.forEach((atom) => {
      if (atom.symbol === '*') return;
      counts.set(atom.symbol, (counts.get(atom.symbol) ?? 0) + 1);
    });

    const order = [
      ...(['C', 'H'].filter((symbol) => counts.has(symbol))),
      ...Array.from(counts.keys())
        .filter((symbol) => symbol !== 'C' && symbol !== 'H')
        .sort(),
    ];

    return order
      .map((symbol) => {
        const count = counts.get(symbol) ?? 0;
        return `${symbol}${count > 1 ? count : ''}`;
      })
      .join('');
  } catch {
    return '';
  } finally {
    if (molWithHs && molWithHs !== mol) {
      molWithHs.delete?.();
    }
    mol?.delete?.();
  }
}

export interface WorkingSolutionPanelProps {
  exerciseId: number | null;
  solution: WorkingSolution | null;
  clearSolution: () => void;
  mergeState: MergeState;
  onSolutionAtomClick: (pointIndex: number) => void;
  onSendToFragments: () => void;
  formulaDbe?: number | null;
}

export function WorkingSolutionPanel({
  exerciseId,
  solution,
  clearSolution,
  mergeState,
  onSolutionAtomClick,
  onSendToFragments,
  formulaDbe,
}: WorkingSolutionPanelProps) {
  const { setWarningResult } = useWarning();
  const { selectedExercise } = useExerciseData();
  const molecularFormula = selectedExercise?.molecular_formula ?? undefined;
  const { rdkit } = useRDKit();
  const [svg, setSvg] = useState('');
  const [overlayPositions, setOverlayPositions] = useState<Array<{ x: number; y: number }>>([]);
  const [expanded, setExpanded] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isPicking = mergeState.phase === 'picking-merge-target';


  // Atom count and DBE count warning
useEffect(() => {
  const smiles = solution?.smiles;

  if (!smiles) {
    setWarningResult({
      type: 'atom_count_DBE',
      warning: false,
      info: 'No molecule present',
    });
    return;
  }

  fetch('/api/v1/warnings/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'atom_count_DBE',
      fragments: [smiles],
      molecularFormula: molecularFormula ?? null,
      formulaDbe: formulaDbe ?? null,
      hydrogenInWarning: true,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Molecule warning request failed with status ${res.status}`);
      }

      const data: WarningResponse = await res.json();
      setWarningResult(data);
    })
    .catch((err) => {
      console.error('Failed to update molecule warning', err);
    });
}, [solution?.smiles, molecularFormula, formulaDbe, setWarningResult]);

  // Calculate molecular formula when the answer is updated
  const currentFormula = useMemo(() => {
    if (!rdkit || !solution?.mol_file) return '';
    return calculateMolecularFormula(solution.mol_file, rdkit);
}, [rdkit, solution?.mol_file]);

  const missingAtomsText = useMemo(
    () => formatMissingAtoms(selectedExercise?.molecular_formula ?? undefined, currentFormula),
    [selectedExercise?.molecular_formula, currentFormula],
  );

  // The expand modal only makes sense while the user is mid-merge.
  useEffect(() => {
    if (!isPicking) setExpanded(false);
  }, [isPicking]);

  useEffect(() => {
    setValidating(false);
    setValidationResult(null);
    setValidationError(null);
  }, [exerciseId, solution?.smiles]);

  useEffect(() => {
    if (validationResult === null && validationError === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setValidationResult(null);
      setValidationError(null);
    }, 30_000);

    return () => window.clearTimeout(timeoutId);
  }, [validationResult, validationError]);

  // Heavy (non-H, non-*) atoms for atom-to-atom merge
  const heavyAtoms: MolAtom[] = useMemo(() => {
    if (!solution?.mol_file) return [];
    try {
      const graph = parseMolBlock(solution.mol_file);
      return graph.atoms.filter((a) => a.symbol !== 'H' && a.symbol !== '*');
    } catch {
      return [];
    }
  }, [solution?.mol_file]);

  useEffect(() => {
    if (!rdkit || !solution?.mol_file) {
      setSvg('');
      setOverlayPositions([]);
      return;
    }

    const mol = rdkit.get_mol(solution.mol_file);
    if (!mol || !mol.is_valid()) {
      mol?.delete();
      if (solution.smiles) {
        const molFromSmiles = rdkit.get_mol(solution.smiles);
        if (molFromSmiles?.is_valid()) {
          setSvg(molFromSmiles.get_svg(SVG_W, SVG_H));
          setOverlayPositions([]);
        }
        molFromSmiles?.delete();
      }
      return;
    }

    if (isPicking && heavyAtoms.length > 0) {
      const atomIndices = heavyAtoms.map((a) => a.index);
      const highlightSvg = mol.get_svg_with_highlights(
        JSON.stringify({ atoms: atomIndices, width: SVG_W, height: SVG_H }),
      );
      setSvg(highlightSvg);
      setOverlayPositions(findHighlightedAtomPositions(highlightSvg));
    } else {
      setSvg(mol.get_svg(SVG_W, SVG_H));
      setOverlayPositions([]);
    }

    mol.delete();
  }, [rdkit, solution, isPicking, heavyAtoms]);

  const viewBox = useMemo(() => {
    if (!svg) return null;
    const match = svg.match(/viewBox=['"]([\d.\-\s]+)['"]/);
    if (!match) return null;
    const [vx, vy, vw, vh] = match[1].split(/\s+/).map(Number);
    return { x: vx, y: vy, w: vw, h: vh };
  }, [svg]);

  const hasOverlayPositions = isPicking && viewBox && overlayPositions.length === heavyAtoms.length;

  const blockEvent = (e: any) => {
    e.stopPropagation();
    if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
      e.nativeEvent.stopImmediatePropagation();
    }
  };

  if (!solution) {
    return (
      <div
        style={{
          padding: 7,
          borderRadius: 12,
          border: '1px dashed #cfcfcf',
          background: '#fafafa',
          textAlign: 'center',
          color: '#666',
          fontSize: 13,
        }}
      >
        No working solution yet: add a fragment from the linking tab below.
      </div>
    );
  }

  const handleValidateSolution = async () => {
    if (!solution || !rdkit || exerciseId === null || validating) return;
    if (!globalThis.crypto?.subtle) {
      setValidationError('Validation is not available in this environment.');
      setValidationResult(null);
      return;
    }

    setValidating(true);
    setValidationResult(null);
    setValidationError(null);

    const mol = rdkit.get_mol(solution.smiles);
    if (!mol || !mol.is_valid()) {
      mol?.delete();
      setValidationError('Unable to read the working solution SMILES.');
      setValidating(false);
      return;
    }

    let inchi = '';
    try {
      inchi = mol.get_inchi();
    } catch {
      inchi = '';
    } finally {
      mol.delete();
    }

    if (!inchi || !inchi.startsWith('InChI=')) {
      setValidationError('Unable to generate InChI for the working solution.');
      setValidating(false);
      return;
    }

    try {
      const hash = await sha256Hex(inchi);
      const result = await validateExerciseSolutionHash(exerciseId, hash);
      setValidationResult(result.is_correct);
    } catch {
      setValidationError('Unable to validate the working solution.');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div
      style={{
        borderRadius: 12,
        border: isPicking ? '0px solid #2196F3' : '0px solid #ddd',
        background: 'white',
        padding: 5,
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      {/* Molecule SVG */}
      {svg ? (
        <div
          style={{
            width: SVG_W,
            border: '0px solid #ececec',
            borderRadius: 8,
            background: '#fff',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: SVG_W,
              height: SVG_H,
            }}
          >
          <div style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: svg }} />

          {/* Clickable overlays (if SVG positions detected) */}
          {hasOverlayPositions &&
            overlayPositions.map((pos, idx) => {
              const leftPct = ((pos.x - viewBox!.x) / viewBox!.w) * 100;
              const topPct = ((pos.y - viewBox!.y) / viewBox!.h) * 100;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    blockEvent(e);
                    onSolutionAtomClick(idx);
                  }}
                  onPointerDown={blockEvent}
                  onMouseDown={blockEvent}
                  onMouseUp={blockEvent}
                  onTouchStart={blockEvent}
                  onTouchEnd={blockEvent}
                  title={`${heavyAtoms[idx]?.symbol ?? '?'} (atom ${idx + 1})`}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: '2px solid #FF5722',
                    background: 'rgba(255, 87, 34, 0.2)',
                    cursor: 'pointer',
                    padding: 0,
                    zIndex: 10,
                  }}
                />
              );
            })}
          </div>
          {/* Display the current molecular formula of the working solution */}
          {currentFormula && (
            <div
              style={{
                textAlign: 'center',
                fontSize: 14,
                fontWeight: 600,
                marginTop: 6,
              }}
            >
              <FormulaWithSubscripts formula={currentFormula} />
            </div>
          )}
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
            fontSize: 12,
            color: '#999',
            flexShrink: 0,
          }}
        >
          {rdkit ? 'Rendering...' : 'Loading RDKit...'}
        </div>
      )}

      {/* Info panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Working Solution</div>

        {isPicking && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <div style={{ fontSize: 12, color: '#2196F3', fontWeight: 600 }}>
              Click an atom on the molecule
            </div>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{
                alignSelf: 'flex-start',
                padding: '4px 10px',
                borderRadius: 8,
                border: '1px solid #2196F3',
                background: 'white',
                color: '#2196F3',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Expand
            </button>
          </div>
        )}

        {/* The atom countdown text */}
        <div
          style={{
            fontSize: 12,
            opacity: 0.8,
            marginTop: 4,
            whiteSpace: 'pre-line',
          }}
        >
          {missingAtomsText}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          <button
            type="button"
            onClick={onSendToFragments}
            style={{
              padding: '4px 12px',
              borderRadius: 8,
              border: '1px solid #FF9800',
              background: '#FFF3E0',
              color: '#E65100',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Send to fragments
          </button>

          <button
            type="button"
            onClick={clearSolution}
            style={{
              padding: '4px 12px',
              borderRadius: 8,
              border: '1px solid #ccc',
              background: 'white',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Clear solution
          </button>

          <button
            type="button"
            onClick={() => void handleValidateSolution()}
            disabled={validating || exerciseId === null || !rdkit}
            style={{
              padding: '4px 12px',
              borderRadius: 8,
              border: '1px solid #4CAF50',
              background: validating ? '#f2f2f2' : '#E8F5E9',
              color: '#1B5E20',
              cursor: validating ? 'default' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {validating ? 'Validating...' : 'Validate answer'}
          </button>
        </div>

        {validationError ? (
          <div style={{ fontSize: 12, color: '#b30000' }}>{validationError}</div>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: validationResult ? '#0f5f0f' : '#b30000',
              visibility: validationResult === null ? 'hidden' : 'visible',
            }}
          >
            {validationResult ? 'Your answer is correct.' : 'Your answer is incorrect.'}
          </div>
        )}
      </div>

      {expanded && isPicking && (
        <ExpandedMoleculeView
          molFile={solution.mol_file}
          heavyAtoms={heavyAtoms}
          title="Working solution — pick an atom"
          onAtomClick={(atomIndex) => {
            setExpanded(false);
            // onSolutionAtomClick takes the *index into heavyAtoms*, not the full atom index.
            const pointIndex = heavyAtoms.findIndex((a) => a.index === atomIndex);
            if (pointIndex >= 0) onSolutionAtomClick(pointIndex);
          }}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
