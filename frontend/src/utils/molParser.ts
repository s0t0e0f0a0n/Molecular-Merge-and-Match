import type { MolGraph, MolAtom, MolBond } from '../types/molecule';

/**
 * Parse a V2000 MOL block string into a MolGraph.
 *
 * V2000 layout:
 *   Line 0: molecule name
 *   Line 1: program / timestamp
 *   Line 2: comment
 *   Line 3: counts  "aaabbblll..."
 *   Lines 4 .. 4+nAtoms-1: atom block
 *   Lines 4+nAtoms .. 4+nAtoms+nBonds-1: bond block
 */
export function parseMolBlock(molFile: string): MolGraph {
  const lines = molFile.split('\n').map((l) => l.replace(/\r$/, ''));

  if (lines.length < 4) {
    throw new Error('MOL block too short – missing counts line');
  }

  const countsLine = lines[3];
  const nAtoms = parseInt(countsLine.substring(0, 3), 10);
  const nBonds = parseInt(countsLine.substring(3, 6), 10);

  if (Number.isNaN(nAtoms) || Number.isNaN(nBonds)) {
    throw new Error('Invalid counts line in MOL block');
  }

  const atoms: MolAtom[] = [];
  for (let i = 0; i < nAtoms; i++) {
    const line = lines[4 + i];
    if (!line) throw new Error(`Missing atom line at index ${i}`);

    const x = parseFloat(line.substring(0, 10));
    const y = parseFloat(line.substring(10, 20));
    const z = parseFloat(line.substring(20, 30));
    const symbol = line.substring(31, 34).trim();
    // Charge field is at position 36-38 in some variants: default to 0
    const chgRaw = parseInt(line.substring(36, 39), 10);
    const charge = Number.isNaN(chgRaw) ? 0 : chgRaw;
    // Atom-atom mapping field at V2000 cols 61-63 (0-indexed substring 60-63).
    // Lines from other producers may be short.
    const mapRaw = line.length >= 63 ? parseInt(line.substring(60, 63), 10) : NaN;
    const mapNumber = Number.isNaN(mapRaw) || mapRaw === 0 ? undefined : mapRaw;

    atoms.push({ index: i, symbol, x, y, z, charge, ...(mapNumber !== undefined ? { mapNumber } : {}) });
  }

  const bonds: MolBond[] = [];
  const bondOffset = 4 + nAtoms;
  for (let i = 0; i < nBonds; i++) {
    const line = lines[bondOffset + i];
    if (!line) throw new Error(`Missing bond line at index ${i}`);

    // V2000 uses 1-based atom indices
    const from = parseInt(line.substring(0, 3), 10) - 1;
    const to = parseInt(line.substring(3, 6), 10) - 1;
    const type = parseInt(line.substring(6, 9), 10);
    const stereo = parseInt(line.substring(9, 12), 10) || 0;

    bonds.push({ from, to, type, stereo });
  }

  return { atoms, bonds };
}

/**
 * Convert a MolGraph back to a valid V2000 MOL block string.
 */
export function molGraphToMolBlock(graph: MolGraph): string {
  const lines: string[] = [];

  // Header: name, program, comment
  lines.push('');
  lines.push('  MolBook  3D');
  lines.push('');

  // Counts line
  const nAtoms = graph.atoms.length.toString().padStart(3);
  const nBonds = graph.bonds.length.toString().padStart(3);
  lines.push(`${nAtoms}${nBonds}  0  0  0  0  0  0  0  0999 V2000`);

  // Atom block. V2000 atom line layout (1-indexed columns):
  //   1-10 x, 11-20 y, 21-30 z, 31 blank, 32-34 symbol, 35-36 mass diff,
  //   37-39 charge, 40-42 stereo parity, 43-45 H count, 46-48 stereo care,
  //   49-51 valence, 52-54 H0, 55-57 unused, 58-60 unused, 61-63 atom map,
  //   64-66 inversion/retention, 67-69 exact change.
  for (const atom of graph.atoms) {
    const x = atom.x.toFixed(4).padStart(10);
    const y = atom.y.toFixed(4).padStart(10);
    const z = atom.z.toFixed(4).padStart(10);
    const sym = atom.symbol.padEnd(3);
    const chgStr = atom.charge.toString().padStart(3);
    const mapStr = (atom.mapNumber ?? 0).toString().padStart(3);
    lines.push(`${x}${y}${z} ${sym} 0${chgStr}  0  0  0  0  0  0  0${mapStr}  0  0`);
  }

  // Bond block (1-based indices)
  for (const bond of graph.bonds) {
    const from = (bond.from + 1).toString().padStart(3);
    const to = (bond.to + 1).toString().padStart(3);
    const type = bond.type.toString().padStart(3);
    const stereo = bond.stereo.toString().padStart(3);
    lines.push(`${from}${to}${type}${stereo}  0  0  0`);
  }

  lines.push('M  END');
  return lines.join('\n');
}
