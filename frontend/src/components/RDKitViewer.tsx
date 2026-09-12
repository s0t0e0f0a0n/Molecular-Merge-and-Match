import { useState } from "react";
import { useRDKit } from "../context/RDKitContext";

interface RDKitViewerProps {
  onTransferToEditor: (smiles: string, molFile: string) => void;
  onAddToWorkingFragments: (smiles: string, molFile: string) => Promise<number | null>;
}

export default function RDKitViewer({ onTransferToEditor, onAddToWorkingFragments }: RDKitViewerProps) {
  const { rdkit } = useRDKit();
  const [smilesInput, setSmilesInput] = useState("c1ccccc1");
  const [svg, setSvg] = useState("");
  const [info, setInfo] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const handleRender = () => {
    if (!rdkit) return;
    setError("");
    setSvg("");
    setInfo({});

    const mol = rdkit.get_mol(smilesInput);
    if (!mol || !mol.is_valid()) {
      setError("Invalid SMILES string.");
      mol?.delete();
      return;
    }

    try {
      setSvg(mol.get_svg(500, 350));
      const desc = JSON.parse(mol.get_descriptors());
      setInfo({
        "SMILES": mol.get_smiles(),
        "InChI": mol.get_inchi(),
        "MW": desc.exactmw ? Number(desc.exactmw).toFixed(2) : "–",
        "Heavy atoms": desc.NumHeavyAtoms ?? "–",
        "Rings": desc.NumRings ?? "–",
        "HBA": desc.NumHBA ?? "–",
        "HBD": desc.NumHBD ?? "–",
        "LogP": desc.CrippenClogP ? Number(desc.CrippenClogP).toFixed(2) : "–",
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      mol.delete();
    }
  };

  const handleTransfer = () => {
    if (!rdkit) return;
    const mol = rdkit.get_mol(smilesInput);
    if (!mol || !mol.is_valid()) {
      mol?.delete();
      setError("Render a valid SMILES string first.");
      return;
    }

    try {
      onTransferToEditor(mol.get_smiles(), mol.get_molblock());
    } finally {
      mol.delete();
    }
  };

  const handleAddToWorkingFragments = async () => {
    if (!rdkit) return;
    const mol = rdkit.get_mol(smilesInput);
    if (!mol || !mol.is_valid()) {
      mol?.delete();
      setError("Render a valid SMILES string first.");
      return;
    }

    try {
      await onAddToWorkingFragments(mol.get_smiles(), mol.get_molblock());
    } finally {
      mol.delete();
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          value={smilesInput}
          onChange={(e) => setSmilesInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleRender()}
          placeholder="Enter SMILES, e.g. c1ccccc1"
          style={{ flex: 1, padding: 8, fontSize: 14, borderRadius: 4, border: "1px solid #ccc" }}
        />
        <button onClick={handleRender} disabled={!rdkit} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: rdkit ? 'white' : '#f2f2f2', cursor: rdkit ? 'pointer' : 'default', fontSize: 13, fontWeight: 600 }}>
          Render
        </button>
      </div>

      {error && <p style={{ color: "#c00", marginTop: 8 }}>{error}</p>}

      {svg && (
        <>
          <div
            style={{ marginTop: 16, border: "1px solid #ccc", borderRadius: 8, background: "#fff", padding: 16, display: "inline-block" }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={handleTransfer} disabled={!rdkit} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: 13 }}>
              Transfer to editor
            </button>
            <button type="button" onClick={() => void handleAddToWorkingFragments()} disabled={!rdkit} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: 13 }}>
              Add to working fragments
            </button>
          </div>
        </>
      )}

      {Object.keys(info).length > 0 && (
        <table style={{ marginTop: 16, borderCollapse: "collapse" }}>
          <tbody>
            {Object.entries(info).map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: "4px 12px 4px 0", fontWeight: "bold" }}>{k}</td>
                <td style={{ padding: 4, fontFamily: "monospace" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
