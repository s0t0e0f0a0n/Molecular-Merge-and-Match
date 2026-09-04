import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useRDKit } from '../context/RDKitContext';
import { applyStereoChoice } from '../utils/stereoDetection';
import type { NewStereoBond } from '../types/molecule';

const SVG_W = 540;
const SVG_H = 380;

export interface StereoChoiceDialogProps {
  mergedSmiles: string;
  newStereoBonds: NewStereoBond[];
  onConfirm: (finalSmiles: string) => void;
  onCancel: () => void;
}

export function StereoChoiceDialog({
  mergedSmiles,
  newStereoBonds,
  onConfirm,
  onCancel,
}: StereoChoiceDialogProps) {
  const { rdkit } = useRDKit();

  // Track user choice per bond, initialize to current config
  const [choices, setChoices] = useState<Array<'cis' | 'trans'>>(() =>
    newStereoBonds.map((b) => b.currentConfig),
  );

  // Build the current SMILES reflecting all user choices
  const currentSmiles = (() => {
    let s = mergedSmiles;
    for (let i = 0; i < newStereoBonds.length; i++) {
      s = applyStereoChoice(s, newStereoBonds[i], choices[i]);
    }
    return s;
  })();

  // Render SVG preview. Track render failure separately so we can show a
  // helpful error instead of a perpetual "Rendering..." placeholder when the
  // generated SMILES is invalid
  const [svg, setSvg] = useState('');
  const [renderFailed, setRenderFailed] = useState(false);
  useEffect(() => {
    if (!rdkit) return;
    const mol = rdkit.get_mol(currentSmiles);
    if (mol?.is_valid()) {
      setSvg(mol.get_svg(SVG_W, SVG_H));
      setRenderFailed(false);
    } else {
      setSvg('');
      setRenderFailed(true);
    }
    mol?.delete();
  }, [rdkit, currentSmiles]);

  const handleChoice = (bondIdx: number, config: 'cis' | 'trans') => {
    setChoices((prev) => {
      const next = [...prev];
      next[bondIdx] = config;
      return next;
    });
  };

  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-label="Choose cis or trans configuration"
      style={{
        fontFamily: 'system-ui, sans-serif',
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.4)',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          padding: 24,
          minWidth: 340,
          maxWidth: 720,
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          Choose double bond configuration
        </div>

        <div style={{ fontSize: 13, color: '#555' }}>
          The merge created a new double bond with directional geometry.
          Please choose one of the two possible configurations for each new bond.
        </div>

        {/* Molecule preview */}
        {svg ? (
          <div
            style={{
              border: '1px solid #ececec',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#fff',
              alignSelf: 'center',
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : renderFailed ? (
          <div
            style={{
              width: SVG_W,
              maxWidth: '100%',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              alignItems: 'flex-start',
              background: '#FFF3E0',
              border: '1px solid #FFB74D',
              borderRadius: 8,
              fontSize: 13,
              color: '#E65100',
              alignSelf: 'center',
            }}
          >
            <div style={{ fontWeight: 700 }}>Cannot render this stereo configuration.</div>
            <div style={{ fontSize: 12, color: '#6A4A1F' }}>
              This may be due to an unspecified substituent orientation. 
              Please cancel and try a different merge atom, or edit the fragment and try again.
            </div>
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
              alignSelf: 'center',
            }}
          >
            Rendering...
          </div>
        )}

        {/* Choice per bond */}
        {newStereoBonds.map((bond, idx) => (
          <div
            key={bond.bondIndex}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #e0e0e0',
              background: '#fafafa',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 100 }}>
              {newStereoBonds.length > 1 ? `Bond ${idx + 1}:` : 'Configuration:'}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name={`stereo-${bond.bondIndex}`}
                checked={choices[idx] === 'trans'}
                onChange={() => handleChoice(idx, 'trans')}
              />
              Option 1
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name={`stereo-${bond.bondIndex}`}
                checked={choices[idx] === 'cis'}
                onChange={() => handleChoice(idx, 'cis')}
              />
              Option 2
            </label>
          </div>
        ))}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: '1px solid #ccc',
              background: 'white',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(currentSmiles)}
            disabled={renderFailed}
            title={renderFailed ? 'Resolve the rendering error before confirming' : undefined}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: '1px solid #2196F3',
              background: renderFailed ? '#90CAF9' : '#2196F3',
              color: 'white',
              cursor: renderFailed ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
