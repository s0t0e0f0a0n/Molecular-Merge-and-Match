import { useEffect, useMemo, useRef, useState } from 'react'
import { useRDKit } from '../../context/RDKitContext'
import { usePredefinedFragments, type PredefinedFragment } from '../../hooks/usePredefinedFragments'

const THUMB_SIZE = 78;

interface PredefinedFragmentMenuProps {
      onAdd: (name: string, smiles: string, molFile: string) => void;
}

function FragmentButton({
      fragment,
      onAdd,
}: {
      fragment: PredefinedFragment;
      onAdd: (name: string, smiles: string, molFile: string) => void;
}) {
      const { rdkit } = useRDKit();
      const [svg, setSvg] = useState('');

      useEffect(() => {
            if (!rdkit) return;
            const mol = rdkit.get_mol(fragment.smiles);
            if (mol?.is_valid()) {
              setSvg(mol.get_svg(THUMB_SIZE, THUMB_SIZE));
            }
            mol?.delete();
      }, [rdkit, fragment.smiles]);

      function handleAdd() {
            if (!rdkit) return;
            const mol = rdkit.get_mol(fragment.smiles);
            if (!mol?.is_valid()) {
              mol?.delete();
              return;
            }
            const molBlock = mol.get_molblock();
            const canonSmiles = mol.get_smiles();
            mol.delete();
            onAdd(fragment.name, canonSmiles, molBlock);
      }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 8,
        background: 'white',
        width: THUMB_SIZE + 16,
      }}
    >
      <div
        style={{
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: 4,
          overflow: 'hidden',
          border: '0px solid #ececec',
          background: '#fff',
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          marginTop: 0,
          textAlign: 'center',
          lineHeight: 1.4,
          minHeight: 22,
        }}
      >
        {fragment.name}
      </div>
      <button
        type="button"
        onClick={handleAdd}
        style={{
          marginTop: 0,
          padding: '3px 10px',
          borderRadius: 6,
          border: '1px solid #4CAF50',
          background: '#E8F5E9',
          color: '#2E7D32',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        Add
      </button>
    </div>
  );
}

export function PredefinedFragmentMenu({ onAdd }: PredefinedFragmentMenuProps) {
  const { fragments, loading, refetch: _refetch } = usePredefinedFragments();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close the menu when clicking anywhere outside it.
  useEffect(() => {
    if (!isOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOpen]);

  // Filter locally so we get instant feedback while typing
  const filtered = useMemo(() => {
    if (!search.trim()) return fragments;
    try {
      const pattern = new RegExp(search, 'i');
      setSearchError(null);
      return fragments.filter(
        (f) => pattern.test(f.keywords) || pattern.test(f.name),
      );
    } catch {
      setSearchError('Invalid regex');
      return fragments;
    }
  }, [fragments, search]);

  if (loading) {
    return <div style={{ fontSize: 12, opacity: 0.6, padding: 8 }}>Loading predefined fragments...</div>;
  }

  if (fragments.length === 0) {
    return (
      <div
        style={{
          padding: 12,
          borderRadius: 8,
          border: '1px dashed #cfcfcf',
          fontSize: 12,
          color: '#666',
          background: '#fafafa',
        }}
      >
        No predefined fragments in the library yet.
      </div>
    );
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 999,
          border: '1px solid #ccc',
          background: isOpen ? '#111' : 'white',
          color: isOpen ? 'white' : '#111',
          cursor: 'pointer',
          fontSize: 13,
          whiteSpace: 'nowrap',
        }}
      >
        {isOpen ? 'Hide fragments' : 'Predefined fragments'}
        <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>
          ({fragments.length})
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            width: 336,
            maxHeight: 485,
            overflowY: 'auto',
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: 12,
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            padding: 10,
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {/* Search field */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fragments..."
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 8,
              border: searchError ? '1px solid #E53935' : '1px solid #ccc',
              fontSize: 12,
              boxSizing: 'border-box',
            }}
          />
          {searchError && (
            <div style={{ fontSize: 11, color: '#E53935' }}>{searchError}</div>
          )}

          {/* Fragment grid — 3 columns */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, auto)',
              gap: 8,
              justifyContent: 'start',
            }}
          >
            {filtered.map((f) => (
              <FragmentButton key={f.id} fragment={f} onAdd={onAdd} />
            ))}
          </div>

          {filtered.length === 0 && search && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>No fragments match your search.</div>
          )}
        </div>
      )}
    </div>
  );
}