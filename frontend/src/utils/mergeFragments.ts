import type { MolGraph, MolAtom, MolBond } from '../types/molecule';

/**
 * Merge two molecular graphs by bonding two arbitrary (non-H) atoms.
 *
 * Algorithm:
 * 1. Deep-clone both graphs (clearing any stale atom-map tags from prior merges).
 * 2. For each clicked atom, if it has an explicit H neighbor, remove one
 *    (to free up a valence slot for the new bond).
 * 3. Offset graphB coordinates so atomB sits a small angle away from atomA.
 * 4. Renumber graphB atoms.
 * 5. Concatenate atoms and bonds.
 * 6. Add a single bond between atomA and atomB.
 * 7. Compact-renumber (because H atoms may have been removed).
 *
 * Atom-map tagging (see MolAtom.mapNumber JSDoc):
 *   1 = graph-A atom (non-endpoint), 2 = graph-B atom (non-endpoint),
 *   3 = graph-A merge endpoint,      4 = graph-B merge endpoint.
 * These tags travel through RDKit's canonical SMILES round-trip and let
 * `detectNewStereoBonds` identify exactly which bond the merge created.
 */
export function mergeAtAtoms(
  graphA: MolGraph,
  atomIndexA: number,
  graphB: MolGraph,
  atomIndexB: number,
): MolGraph {
  // 1. Deep-clone, stripping any stale mapNumber from earlier merges.
  const a = cloneGraph(graphA);
  const b = cloneGraph(graphB);
  for (const atom of a.atoms) delete atom.mapNumber;
  for (const atom of b.atoms) delete atom.mapNumber;

  // 2. Remove one explicit H from each atom (if present) to free valence
  const removeIndices: number[] = [];
  const hA = findExplicitH(a, atomIndexA);
  if (hA !== null) removeIndices.push(hA);
  const hB = findExplicitH(b, atomIndexB);
  if (hB !== null) removeIndices.push(-1); // placeholder, will adjust after renumber

  // Remove H from graphA
  if (hA !== null) {
    const compacted = removeAtomsAndCompact(a, [hA]);
    a.atoms = compacted.atoms;
    a.bonds = compacted.bonds;
    // Adjust atomIndexA if it shifted
    atomIndexA = hA < atomIndexA ? atomIndexA - 1 : atomIndexA;
  }

  // Remove H from graphB
  if (hB !== null) {
    const compacted = removeAtomsAndCompact(b, [hB]);
    b.atoms = compacted.atoms;
    b.bonds = compacted.bonds;
    atomIndexB = hB < atomIndexB ? atomIndexB - 1 : atomIndexB;
  }

  // 3. Offset graphB so atomB sits ~1.5 Å away from atomA
  const atomA = a.atoms[atomIndexA];
  const atomB = b.atoms[atomIndexB];
  const offsetX = atomA.x + 1.5 - atomB.x;
  const offsetY = atomA.y - atomB.y;
  for (const atom of b.atoms) {
    atom.x += offsetX;
    atom.y += offsetY;
  }

  // 4. Renumber graphB atoms
  const offset = a.atoms.length;
  for (const atom of b.atoms) {
    atom.index += offset;
  }
  for (const bond of b.bonds) {
    bond.from += offset;
    bond.to += offset;
  }

  // 4b. Tag atom origins. Endpoint tags (3/4) must be assigned after the H
  //     removal step so the indices still refer to the right atoms.
  for (const atom of a.atoms) atom.mapNumber = 1;
  for (const atom of b.atoms) atom.mapNumber = 2;
  a.atoms[atomIndexA].mapNumber = 3;
  b.atoms[atomIndexB].mapNumber = 4;

  // 5. Combine
  const combined: MolGraph = {
    atoms: [...a.atoms, ...b.atoms],
    bonds: [...a.bonds, ...b.bonds],
  };

  // 6. Add bond between the two atoms
  combined.bonds.push({ from: atomIndexA, to: atomIndexB + offset, type: 1, stereo: 0 });

  return combined;
}

/**
 * Find one explicit H atom bonded to the given atom. Returns its index, or null.
 */
function findExplicitH(graph: MolGraph, atomIndex: number): number | null {
  for (const bond of graph.bonds) {
    let neighborIdx: number | null = null;
    if (bond.from === atomIndex) neighborIdx = bond.to;
    else if (bond.to === atomIndex) neighborIdx = bond.from;
    if (neighborIdx !== null) {
      const neighbor = graph.atoms[neighborIdx];
      if (neighbor && neighbor.symbol === 'H') return neighborIdx;
    }
  }
  return null;
}

function cloneGraph(g: MolGraph): MolGraph {
  return {
    atoms: g.atoms.map((a) => ({ ...a })),
    bonds: g.bonds.map((b) => ({ ...b })),
  };
}

/**
 * Remove a set of atoms from the graph and renumber remaining atoms/bonds.
 */
function removeAtomsAndCompact(graph: MolGraph, removeIndices: number[]): MolGraph {
  const removeSet = new Set(removeIndices);

  // Filter atoms
  const keptAtoms = graph.atoms.filter((a) => !removeSet.has(a.index));

  // Build old→new index mapping
  const indexMap = new Map<number, number>();
  keptAtoms.forEach((atom, newIdx) => {
    indexMap.set(atom.index, newIdx);
  });

  // Update atom indices
  const newAtoms: MolAtom[] = keptAtoms.map((atom, newIdx) => ({
    ...atom,
    index: newIdx,
  }));

  // Filter bonds (remove any bond touching a removed atom) and renumber
  const newBonds: MolBond[] = graph.bonds
    .filter((b) => !removeSet.has(b.from) && !removeSet.has(b.to))
    .map((b) => ({
      ...b,
      from: indexMap.get(b.from)!,
      to: indexMap.get(b.to)!,
    }));

  return { atoms: newAtoms, bonds: newBonds };
}
