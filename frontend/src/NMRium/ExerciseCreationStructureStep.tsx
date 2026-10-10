import { useMemo, useRef, useState } from 'react';
import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import type { Ketcher, StructServiceProvider } from 'ketcher-core';
import 'ketcher-react/dist/index.css';

import type { NMRiumDraftData } from '../api/exerciseCreation';

type ExerciseCreationStructureStepProps = {
  data: NMRiumDraftData;
  onPrevious: () => void;
  onNext: () => void;
  onDataChange: (data: NMRiumDraftData) => Promise<void>;
};

export function ExerciseCreationStructureStep({
  data,
  onPrevious,
  onNext,
  onDataChange,
}: ExerciseCreationStructureStepProps) {
  const [ketcherReady, setKetcherReady] = useState(false);
  const [error, setError] = useState('');
  const [smilesInput, setSmilesInput] = useState(data.structure?.smiles ?? '');
  const [inchiInput, setInchiInput] = useState(data.structure?.inchi ?? '');
  const [structureInputSource, setStructureInputSource] = useState<
    'editor' | 'smiles' | 'inchi'
  >('editor');
  const [savingStructure, setSavingStructure] = useState(false);
  const ketcherRef = useRef<Ketcher | null>(null);
  const structServiceProvider = useMemo(
    () => new StandaloneStructServiceProvider() as StructServiceProvider,
    [],
  );

  const handleNext = async () => {
    const ketcher = ketcherRef.current;
    if (!ketcher) {
      setError('The structure editor is still loading.');
      return;
    }

    setSavingStructure(true);
    setError('');
    try {
      const smilesText = smilesInput.trim();
      const inchiText = inchiInput.trim();
      let smiles = (await ketcher.getSmiles()).trim();

      if (structureInputSource === 'smiles' && smilesText) {
        await ketcher.setMolecule(smilesText);
        smiles = (await ketcher.getSmiles()).trim();
      } else if (structureInputSource === 'inchi' && inchiText) {
        const normalizedInchi = inchiText.startsWith('InChI=')
          ? inchiText
          : `InChI=${inchiText}`;
        await ketcher.setMolecule(normalizedInchi);
        smiles = (await ketcher.getSmiles()).trim();
      }

      if (!smiles) {
        throw new Error(
          'Draw a structure or provide a SMILES or InChI string before continuing.',
        );
      }
      if (smiles.includes('.')) {
        throw new Error('The structure must be a single connected molecule.');
      }

      const [inchi, molfile] = await Promise.all([
        ketcher.getInchi(),
        ketcher.getMolfile('v2000'),
      ]);
      const updatedData: NMRiumDraftData = {
        ...data,
        structure: { smiles, inchi, molfile },
        spectra: data.spectra.map((spectrum) => {
          const nuclei = Array.isArray(spectrum.nucleus)
            ? spectrum.nucleus
            : [spectrum.nucleus];
          if (!nuclei.includes('13C')) return spectrum;
          return {
            ...spectrum,
            peaks: spectrum.peaks.map((value) => {
              const peak =
                value && typeof value === 'object' && !Array.isArray(value)
                  ? (value as Record<string, unknown>)
                  : {};
              return {
                ...peak,
                carbonCount:
                  typeof peak.carbonCount === 'number' &&
                  Number.isInteger(peak.carbonCount) &&
                  peak.carbonCount > 0
                    ? peak.carbonCount
                    : 1,
              };
            }),
          };
        }),
      };
      await onDataChange(updatedData);
      onNext();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not save the exercise structure.',
      );
    } finally {
      setSavingStructure(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div
        role="toolbar"
        aria-label="Exercise creation steps"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid #d8dee4',
          background: '#f6f8fa',
        }}
      >
        <button type="button" onClick={onPrevious}>
          Previous
        </button>
        <strong>Step 2: Draw the exercise structure</strong>
        <button
          type="button"
          onClick={handleNext}
          disabled={!ketcherReady || savingStructure}
        >
          {savingStructure ? 'Saving…' : 'Next'}
        </button>
        {error && <span role="alert">{error}</span>}
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside
          aria-label="Exercise structure"
          style={{
            width: '35%',
            minWidth: 280,
            overflow: 'auto',
            padding: 12,
            borderRight: '1px solid #d8dee4',
            boxSizing: 'border-box',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Please provide the molecular structure</h2>
          <p>Either draw the structure or paste an SMILES- or InChI-string below.</p>
          <label style={{ display: 'block', marginBottom: 8 }}>
            SMILES
            <input
              type="text"
              value={smilesInput}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSmilesInput(value);
                if (value) {
                  setInchiInput('');
                  setStructureInputSource('smiles');
                } else {
                  setStructureInputSource('editor');
                }
              }}
              style={{ display: 'block', boxSizing: 'border-box', width: '100%' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            InChI
            <input
              type="text"
              value={inchiInput}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setInchiInput(value);
                if (value) {
                  setSmilesInput('');
                  setStructureInputSource('inchi');
                } else {
                  setStructureInputSource('editor');
                }
              }}
              style={{ display: 'block', boxSizing: 'border-box', width: '100%' }}
            />
          </label>
        </aside>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <Editor
            staticResourcesUrl=""
            structServiceProvider={structServiceProvider}
            disableMacromoleculesEditor
            onInit={async (ketcher: Ketcher) => {
              ketcherRef.current = ketcher;
              const molecule = data.structure?.molfile ?? data.molecules?.[0]?.molfile;
              if (molecule) {
                try {
                  await ketcher.setMolecule(molecule);
                } catch (caught) {
                  setError(
                    caught instanceof Error
                      ? `Could not load the NMRium molecule: ${caught.message}`
                      : 'Could not load the NMRium molecule.',
                  );
                }
              }
              setKetcherReady(true);
            }}
            errorHandler={(message: string) => {
              setError(`Ketcher error: ${message}`);
            }}
          />
          {!ketcherReady && <span role="status">Loading structure editor…</span>}
        </div>
      </div>
    </div>
  );
}
