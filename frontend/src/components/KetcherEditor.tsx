import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import type { Ketcher, StructServiceProvider } from 'ketcher-core';
import 'ketcher-react/dist/index.css';

import type { ExportedFragment } from './fragmentTypes';
import { useRDKit } from '../context/RDKitContext';

interface EditingFragment {
  id: number;
  label: string;
  molFile: string;
}

interface KetcherEditorProps {
  onExportFragment: (fragment: ExportedFragment) => void;
  editingFragment?: EditingFragment | null;
  onCancelEdit?: () => void;
}

const hiddenButtons = {
  arom: { hidden: true },
  dearom: { hidden: true },
  clean: { hidden: true },
  cip: { hidden: true },
  miew: { hidden: true },


  // Keep only single/double/triple/chain bond types
  'bond-any': { hidden: true },
  'bond-aromatic': { hidden: true },
  'bond-singledouble': { hidden: true },
  'bond-singlearomatic': { hidden: true },
  'bond-doublearomatic': { hidden: true },
  'bond-dative': { hidden: true },
  'bond-hydrogen': { hidden: true },
  'bond-query': { hidden: true },
  'bond-special': { hidden: true },

  'bond-stereo': { hidden: true },
  'bond-up': { hidden: true },
  'bond-down': { hidden: true },
  'bond-updown': { hidden: true },
  'bond-crossed': { hidden: true },
  'enhanced-stereo': { hidden: true },

  sgroup: { hidden: true },
  rgroup: { hidden: true },
  'rgroup-label': { hidden: true },
  'rgroup-fragment': { hidden: true },
  'rgroup-attpoints': { hidden: true },
  'reaction-plus': { hidden: true },
  arrows: { hidden: true },
  'reaction-arrow-open-angle': { hidden: true },
  'reaction-arrow-filled-triangle': { hidden: true },
  'reaction-arrow-filled-bow': { hidden: true },
  'reaction-arrow-dashed-open-angle': { hidden: true },
  'reaction-arrow-failed': { hidden: true },
  'reaction-arrow-retrosynthetic': { hidden: true },
  'reaction-arrow-both-ends-filled-triangle': { hidden: true },
  'reaction-arrow-equilibrium-filled-half-bow': { hidden: true },
  'reaction-arrow-equilibrium-filled-triangle': { hidden: true },
  'reaction-arrow-equilibrium-open-angle': { hidden: true },
  'reaction-arrow-unbalanced-equilibrium-filled-half-bow': { hidden: true },
  'reaction-arrow-unbalanced-equilibrium-open-half-angle': { hidden: true },
  'reaction-arrow-unbalanced-equilibrium-large-filled-half-bow': { hidden: true },
  'reaction-arrow-unbalanced-equilibrium-filled-half-triangle': { hidden: true },
  'reaction-arrow-elliptical-arc-arrow-filled-bow': { hidden: true },
  'reaction-arrow-elliptical-arc-arrow-filled-triangle': { hidden: true },
  'reaction-arrow-elliptical-arc-arrow-open-angle': { hidden: true },
  'reaction-arrow-elliptical-arc-arrow-open-half-angle': { hidden: true },
  'reaction-mapping-tools': { hidden: true },
  'reaction-automap': { hidden: true },
  'reaction-map': { hidden: true },
  'reaction-unmap': { hidden: true },
  'create-monomer': { hidden: true },
  shapes: { hidden: true },
  'shape-ellipse': { hidden: true },
  'shape-rectangle': { hidden: true },
  'shape-line': { hidden: true },
  text: { hidden: true },
  images: { hidden: true },

  analyse: { hidden: true },
  'any-atom': { hidden: true },
  'extended-table': { hidden: true },
  open: { hidden: true },
  save: { hidden: true },
  copy: { hidden: true },
  paste: { hidden: true },
} as const;

export default function KetcherEditor({ onExportFragment, editingFragment = null, onCancelEdit }: KetcherEditorProps) {
  const { rdkit, error: rdkitError } = useRDKit();
  const ketcherRef = useRef<Ketcher | null>(null);
  const changeHandlerRef = useRef<(() => void) | null>(null);
  const prevEditingIdRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [structError, setStructError] = useState<string | null>(null);

  const structServiceProvider = useMemo(
    () => new StandaloneStructServiceProvider() as StructServiceProvider,
    [],
  );

  const handleInit = useCallback((ketcher: Ketcher) => {
    ketcherRef.current = ketcher;
    setReady(true);
    (ketcher as any).editor.zoom(1);

    const onStructChange = () => {
      const struct = (ketcher as any).editor.struct();
      const hasBadConn = [...struct.atoms.values()].some((atom: any) => atom.badConn);
      setStructError(hasBadConn ? 'Invalid structure — fix valence errors before exporting' : null);
    };

    (ketcher as any).changeEvent.add(onStructChange);
    changeHandlerRef.current = onStructChange;
  }, []);

  useEffect(() => {
    return () => {
      if (ketcherRef.current && changeHandlerRef.current) {
        (ketcherRef.current as any).changeEvent.remove(changeHandlerRef.current);
      }
    };
  }, []);

  // Load fragment into editor when entering edit mode; clear canvas when leaving
  useEffect(() => {
    if (!ready || !ketcherRef.current) return;

    const currentId = editingFragment?.id ?? null;
    const prevId = prevEditingIdRef.current;

    // Entering edit mode or switching to another fragment
    if (editingFragment && currentId !== prevId) {
      ketcherRef.current.setMolecule(editingFragment.molFile).catch(console.error);
      setStructError(null);
    }

    // Leaving edit mode
    if (prevId !== null && currentId === null) {
      ketcherRef.current.setMolecule('').catch(console.error);
      setStructError(null);
    }

    prevEditingIdRef.current = currentId;
  }, [editingFragment?.id, ready]);

  const handleExport = useCallback(async () => {
    const ketcher = ketcherRef.current;
    if (!ketcher) return;

    if (rdkitError) {
      return;
    }

    try {
      const smiles = (await ketcher.getSmiles()).trim();
      if (!smiles) {
        setStructError('Draw a molecule first');
        return;
      }

      if (smiles.includes('.')) {
        setStructError('Structure contains disconnected components');
        return;
      }

      const struct = (ketcher as any).editor.struct();
      const hasBadConn = [...struct.atoms.values()].some((atom: any) => atom.badConn);
      if (hasBadConn) {
        setStructError('Invalid structure - fix valence errors before exporting');
        return;
      }

      let molFile = await ketcher.getMolfile('v2000');

      if (rdkit) {
        const mol = rdkit.get_mol(smiles);

        try {
          if (!mol || !mol.is_valid()) {
            setStructError('Invalid molecule structure');
            return;
          }

          molFile = mol.get_molblock();
        } finally {
          if (mol) {
            mol.delete();
          }
        }
      }

      await onExportFragment({ smiles, molFile });

      await ketcher.setMolecule('');
      setStructError(null);
    } catch (e: any) {
      console.error('Ketcher export error:', e);
      setStructError('Could not export structure.');
    }
  }, [onExportFragment, rdkit, rdkitError]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {rdkitError && (
        <p style={{ color: '#c00', fontSize: 13, margin: '0 0 8px', flexShrink: 0 }}>
          RDKit failed to load. Structure validation is unavailable.
        </p>
      )}

      {structError && (
        <p style={{ color: '#c00', fontSize: 13, margin: '0 0 8px', flexShrink: 0 }}>
          {structError}
        </p>
      )}

      {hasError && (
        <p style={{ color: '#c00', fontSize: 13, margin: '0 0 8px', flexShrink: 0 }}>
          Ketcher encountered an error — check the browser console for details.
        </p>
      )}

      <div
        style={{
          width: '100%',
          flex: 1,
          minHeight: 200,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Editor
          staticResourcesUrl=""
          structServiceProvider={structServiceProvider}
          buttons={hiddenButtons}
          disableMacromoleculesEditor
          onInit={handleInit}
          errorHandler={(message: string) => {
            console.error('Ketcher error:', message);
            setHasError(true);
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexShrink: 0 }}>
        <button
          onClick={handleExport}
          disabled={!ready}
          style={{
            padding: '2px 8px',
            borderRadius: 5,
            border: '1px solid #ccc',
            background: ready ? 'white' : '#f2f2f2',
            cursor: ready ? 'pointer' : 'default',
            fontSize: 13,
            fontWeight: 400,
          }}
        >
          {editingFragment ? `Save changes to fragment` : 'Export to fragment space'}
        </button>
        {editingFragment && onCancelEdit && (
          <button
            onClick={onCancelEdit}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: 13 }}
          >
            Cancel edit
          </button>
        )}
      </div>
    </div>
  );
}