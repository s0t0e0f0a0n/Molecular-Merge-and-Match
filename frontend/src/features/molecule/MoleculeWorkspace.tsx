import { lazy, Suspense, useState } from 'react';
import type { BackendFragment } from '../../hooks/useFragments';
import type { ExportedFragment } from '../../components/fragmentTypes';

const RDKitViewer = lazy(() => import('../../components/RDKitViewer'));

// Prefetch: start the download at page load, not on first render, so Ketcher is ready by the time the popup opens
const ketcherEditorChunk = import('../../components/KetcherEditor');
const KetcherEditor = lazy(() => ketcherEditorChunk);

export type EditorType = 'ketcher' | 'rdkit';

export interface MoleculeWorkspaceProps {
  onCreateFragment: (label: string, smiles: string, molFile: string) => Promise<number | null>;
  onUpdateFragment: (id: number, smiles: string, molFile: string) => Promise<boolean>;
  editingFragment?: BackendFragment | null;
  onEditComplete?: () => void;
  editor?: EditorType;
  onEditorChange?: (editor: EditorType) => void;
}

export function MoleculeWorkspace({
  onCreateFragment,
  onUpdateFragment,
  editingFragment = null,
  onEditComplete,
  editor: editorProp,
}: MoleculeWorkspaceProps) {
  const [internalEditor] = useState<EditorType>('ketcher');
  const editor = editorProp ?? internalEditor;

  const handleExportFragment = async (fragment: ExportedFragment) => {
    if (editingFragment) {
      const ok = await onUpdateFragment(editingFragment.id, fragment.smiles, fragment.molFile);
      if (ok) onEditComplete?.();
    } else {
      await onCreateFragment('', fragment.smiles, fragment.molFile);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {editor === 'ketcher' && (
        <Suspense fallback={<p>Loading Ketcher editor...</p>}>
          <section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <KetcherEditor
              onExportFragment={handleExportFragment}
              editingFragment={
                editingFragment
                  ? { id: editingFragment.id, label: editingFragment.label, molFile: editingFragment.mol_file }
                  : null
              }
              onCancelEdit={editingFragment ? onEditComplete : undefined}
            />
          </section>
        </Suspense>
      )}

      {editor === 'rdkit' && (
        <Suspense fallback={<p>Loading RDKit...</p>}>
          <RDKitViewer />
        </Suspense>
      )}
    </div>
  );
}