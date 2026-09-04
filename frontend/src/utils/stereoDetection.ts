import type { MolGraph, NewStereoBond } from '../types/molecule';

/**
 * Strip atom-atom map numbers (`:N` inside bracket atoms) from a SMILES string
 * without re-canonicalizing. Atom parse-order is preserved, so callers that
 * walk the SMILES (e.g. `mapSmilesEqualsToBonds`) can still align atom indices
 * with a graph derived from the same canonical mol block. The output may still
 * contain bracket atoms like `[CH3]`; full prettification would require a
 * re-canonical round-trip, which would shift atom indices.
 */
export function stripMapNumbersFromSmiles(smiles: string): string {
  let out = '';
  let i = 0;
  let bracketDepth = 0;
  while (i < smiles.length) {
    const ch = smiles[i];
    if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;

    if (bracketDepth > 0 && ch === ':') {
      let j = i + 1;
      while (j < smiles.length && /\d/.test(smiles[j])) j++;
      if (j > i + 1 && j < smiles.length && smiles[j] === ']') {
        // skip ":N" entirely (do not emit), continue from `]`
        i = j;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Count `/` and `\` characters in a SMILES string that represent bond
 * stereochemistry. Characters inside bracket atoms (e.g. `[C@@H]`) are
 * excluded because they denote tetrahedral stereo, not bond direction.
 */
export function countStereoSlashes(smiles: string): number {
  let count = 0;
  let bracketDepth = 0;
  for (const ch of smiles) {
    if (ch === '[') { bracketDepth++; continue; }
    if (ch === ']') { bracketDepth--; continue; }
    if (bracketDepth === 0 && (ch === '/' || ch === '\\')) count++;
  }
  return count;
}

/**
 * Find all stereogenic C=C double bonds in a molecular graph.
 *
 * A C=C is stereogenic when:
 *  - it is not in a ring (ring geometry constrains it);
 *  - each side has at least one heavy-atom substituent;
 *  - the two substituents on each side differ in CIP priority.
 *
 * Substituent comparison uses {@link compareCIP}: a sphere-by-sphere expansion
 * with phantom atoms for multiple bonds and phantom terminals for ring
 * closures. This correctly distinguishes substituents that share an immediate
 * atom but differ further out (e.g. `CH2-CH3` vs `CH2-Cl`, or vinyl vs ethyl).
 */
export function findStereogenicDoubleBonds(
  graph: MolGraph,
): Array<{ atomA: number; atomB: number }> {
  const result: Array<{ atomA: number; atomB: number }> = [];

  for (const bond of graph.bonds) {
    if (bond.type !== 2) continue;
    const a = graph.atoms[bond.from];
    const b = graph.atoms[bond.to];
    if (!a || !b) continue;
    if (a.symbol !== 'C' || b.symbol !== 'C') continue;
    if (isBondInRing(graph, bond.from, bond.to)) continue;

    const heavyA = heavyNeighborIndices(graph, bond.from, bond.to);
    const heavyB = heavyNeighborIndices(graph, bond.to, bond.from);

    // Each side needs at least one heavy substituent
    if (heavyA.length === 0 || heavyB.length === 0) continue;

    // If a side has two substituents, they must differ in CIP priority
    if (heavyA.length === 2 &&
        compareCIP(graph, heavyA[0], bond.from, heavyA[1], bond.from) === 0) continue;
    if (heavyB.length === 2 &&
        compareCIP(graph, heavyB[0], bond.to, heavyB[1], bond.to) === 0) continue;

    result.push({ atomA: bond.from, atomB: bond.to });
  }

  return result;
}

/**
 * After a merge, detect stereogenic double bonds that became stereogenic
 * because of the merge, i.e. those touching a merge endpoint.
 *
 * Identification relies on atom-map tags placed by `mergeAtAtoms`:
 *   3 = source-side merge endpoint, 4 = target-side merge endpoint.
 * The two tagged atoms are the only atoms whose substituent sets changed in
 * the merge, so any newly-stereogenic C=C must have at least one such atom as
 * an endpoint. This is more reliable than counting stereogenic bonds before
 * and after the merge, which can't distinguish two stereogenic bonds that
 * happen to share an endpoint.
 *
 * If the merged graph has no merge-endpoint tags (e.g. tests passing
 * hand-rolled graphs), fall back to the old count-based heuristic so existing
 * callers and fixtures keep working.
 *
 * For each identified bond: reuse existing `/\` slashes if present, else
 * insert default trans slashes so the dialog has something to toggle. Returns
 * the possibly-rewritten SMILES along with the bond descriptors.
 */
export function detectNewStereoBonds(
  inputGraphA: MolGraph,
  inputGraphB: MolGraph,
  mergedGraph: MolGraph,
  mergedSmiles: string,
): { bonds: NewStereoBond[]; smiles: string } {
  // Strip atom-map numbers from the SMILES up front. Atom parse-order is
  // preserved, so `mapSmilesEqualsToBonds` still aligns with `mergedGraph`.
  const cleanedSmiles = stripMapNumbersFromSmiles(mergedSmiles);

  const stereogenicBonds = findStereogenicDoubleBonds(mergedGraph);
  if (stereogenicBonds.length === 0) return { bonds: [], smiles: cleanedSmiles };

  // Are atom-map tags present on the merged graph? If so, use them; otherwise
  // fall back to the legacy count-based identifier.
  const hasMergeTags = mergedGraph.atoms.some(
    (a) => a.mapNumber === 3 || a.mapNumber === 4,
  );

  let targetBonds: Array<{ atomA: number; atomB: number }>;
  if (hasMergeTags) {
    targetBonds = stereogenicBonds.filter(({ atomA, atomB }) => {
      const a = mergedGraph.atoms[atomA];
      const b = mergedGraph.atoms[atomB];
      return (
        a?.mapNumber === 3 || a?.mapNumber === 4 ||
        b?.mapNumber === 3 || b?.mapNumber === 4
      );
    });
  } else {
    const inputCount =
      findStereogenicDoubleBonds(inputGraphA).length +
      findStereogenicDoubleBonds(inputGraphB).length;
    const newCount = stereogenicBonds.length - inputCount;
    if (newCount <= 0) return { bonds: [], smiles: cleanedSmiles };
    // Without map tags, take the last `newCount` stereogenic bonds in
    // canonical-SMILES order (legacy heuristic).
    targetBonds = stereogenicBonds.slice(stereogenicBonds.length - newCount);
  }

  if (targetBonds.length === 0) return { bonds: [], smiles: cleanedSmiles };

  // Map each target graph bond to its `=` position in the SMILES.
  const targetKeys = new Set(
    targetBonds.map(({ atomA, atomB }) =>
      atomA < atomB ? `${atomA}-${atomB}` : `${atomB}-${atomA}`,
    ),
  );
  const equalsMap = mapSmilesEqualsToBonds(cleanedSmiles);
  const eqPositions = equalsMap
    .filter((e) => {
      const key = e.atomA < e.atomB ? `${e.atomA}-${e.atomB}` : `${e.atomB}-${e.atomA}`;
      return targetKeys.has(key);
    })
    .map((e) => e.eqPos)
    .sort((x, y) => x - y);
  if (eqPositions.length === 0) return { bonds: [], smiles: cleanedSmiles };

  let workingSmiles = cleanedSmiles;
  const resultBonds: NewStereoBond[] = [];

  // Process right-to-left so earlier positions stay valid after inserts.
  for (let i = eqPositions.length - 1; i >= 0; i--) {
    const eqPos = eqPositions[i];
    const existing = findStereoAroundEquals(workingSmiles, eqPos);
    if (existing) {
      resultBonds.unshift({ ...existing, bondIndex: i });
      continue;
    }
    const inserted = insertDefaultStereoSlashes(workingSmiles, eqPos);
    if (!inserted) continue;
    workingSmiles = inserted.smiles;
    resultBonds.unshift({
      equalsPosition: inserted.equalsPosition,
      slashPosition: inserted.slashPosition,
      currentConfig: inserted.currentConfig,
      bondIndex: i,
    });
  }

  return { bonds: resultBonds, smiles: workingSmiles };
}

/**
 * Apply the user's cis/trans choice to a SMILES string by flipping the
 * directional slash character at the indicated position.
 *
 * If the current configuration already matches `choice`, the SMILES is
 * returned unchanged.
 */
export function applyStereoChoice(
  smiles: string,
  bond: NewStereoBond,
  choice: 'cis' | 'trans',
): string {
  if (bond.currentConfig === choice) return smiles;
  const chars = [...smiles];
  const ch = chars[bond.slashPosition];
  if (ch === '/') chars[bond.slashPosition] = '\\';
  else if (ch === '\\') chars[bond.slashPosition] = '/';
  return chars.join('');
}

/**
 * Insert default `/` slashes around a `=` in a SMILES string to represent a
 * default trans configuration. Used when RDKit's canonical SMILES omits
 * directional slashes for a newly stereogenic double bond.
 *
 * If a slash already exists on either side (because an adjacent stereogenic
 * bond was annotated first), that slash is reused and its direction determines 
 * this bond's current cis/trans state.
 * The returned `slashPosition` always refers to a slash that is exclusive to
 * this bond when possible, so toggling does not accidentally flip a neighbour.
 */
export function insertDefaultStereoSlashes(
  smiles: string,
  eqPos: number,
): {
  smiles: string;
  equalsPosition: number;
  slashPosition: number;
  currentConfig: 'cis' | 'trans';
} | null {
  // Need an atom to the left of the left-C
  if (eqPos - 1 < 0) return null;
  let leftRefPos = eqPos - 2;
  while (leftRefPos >= 0) {
    const c = smiles[leftRefPos];
    if (c === ')' || c === ']' || /\d/.test(c)) { leftRefPos--; continue; }
    break;
  }
  if (leftRefPos < 0) return null;

  // Right-side insertion point
  const rightCPos = eqPos + 1;
  if (rightCPos >= smiles.length) return null;
  let afterRightC: number;
  if (smiles[rightCPos] === '[') {
    const end = smiles.indexOf(']', rightCPos);
    if (end === -1) return null;
    afterRightC = end + 1;
  } else if (
    rightCPos + 1 < smiles.length &&
    ((smiles[rightCPos] === 'C' && smiles[rightCPos + 1] === 'l') ||
      (smiles[rightCPos] === 'B' && smiles[rightCPos + 1] === 'r'))
  ) {
    afterRightC = rightCPos + 2;
  } else {
    afterRightC = rightCPos + 1;
  }
  while (afterRightC < smiles.length && /\d/.test(smiles[afterRightC])) afterRightC++;
  if (afterRightC >= smiles.length) return null;

  let rightSlashInsertPos: number;
  if (smiles[afterRightC] === '(') {
    rightSlashInsertPos = afterRightC + 1;
  } else {
    rightSlashInsertPos = afterRightC;
  }
  const rightChar = smiles[rightSlashInsertPos];
  if (!rightChar) return null;

  const rightAlreadySlashed = rightChar === '/' || rightChar === '\\';
  if (!rightAlreadySlashed && rightChar !== '[' && !/[A-Za-z]/.test(rightChar)) {
    return null;
  }

  const leftSlashPos = eqPos - 1;
  const leftChar = smiles[leftSlashPos];
  const leftAlreadySlashed = leftChar === '/' || leftChar === '\\';

  // Insert right slash first (higher index) if needed; left slash next.
  let out = smiles;
  if (!rightAlreadySlashed) {
    out = out.slice(0, rightSlashInsertPos) + '/' + out.slice(rightSlashInsertPos);
  }
  if (!leftAlreadySlashed) {
    out = out.slice(0, leftSlashPos) + '/' + out.slice(leftSlashPos);
  }

  // Inserting the left slash shifts every position to its right by 1.
  const leftShift = leftAlreadySlashed ? 0 : 1;
  const rightSlashFinalPos = rightSlashInsertPos + leftShift;
  const eqFinalPos = eqPos + leftShift;

  // Configuration is determined by the (possibly-existing) slash directions.
  const finalLeftChar = leftAlreadySlashed ? leftChar : '/';
  const finalRightChar = rightAlreadySlashed ? rightChar : '/';
  const config: 'cis' | 'trans' = finalLeftChar === finalRightChar ? 'trans' : 'cis';

  // Pick a toggle position that is exclusive to this bond. A pre-existing slash
  // is shared with an adjacent stereogenic bond, so flipping it would also
  // change that neighbour's stereo. Prefer a freshly-inserted slash.
  let slashPos: number;
  if (!rightAlreadySlashed) {
    slashPos = rightSlashFinalPos;
  } else if (!leftAlreadySlashed) {
    slashPos = leftSlashPos;
  } else {
    // Both shared: known limitation, fall back to right.
    slashPos = rightSlashFinalPos;
  }

  return {
    smiles: out,
    equalsPosition: eqFinalPos,
    slashPosition: slashPos,
    currentConfig: config,
  };
}

// CIP priority (sphere-by-sphere expansion with phantoms)

const ATOMIC_NUMBERS: Readonly<Record<string, number>> = Object.freeze({
  H: 1, He: 2, Li: 3, Be: 4, B: 5, C: 6, N: 7, O: 8, F: 9, Ne: 10,
  Na: 11, Mg: 12, Al: 13, Si: 14, P: 15, S: 16, Cl: 17, Ar: 18,
  K: 19, Ca: 20, Sc: 21, Ti: 22, V: 23, Cr: 24, Mn: 25, Fe: 26,
  Co: 27, Ni: 28, Cu: 29, Zn: 30, Ga: 31, Ge: 32, As: 33, Se: 34, Br: 35,
  // Aromatic lowercase aliases. RDKit emits these in canonical SMILES.
  c: 6, n: 7, o: 8, s: 16, p: 15, b: 5,
});

function atomicNumber(symbol: string): number {
  return ATOMIC_NUMBERS[symbol] ?? 0;
}

type CIPNode = {
  atomicNumber: number;
  /** null = phantom atom (terminal, no further expansion) */
  realAtomIdx: number | null;
  parentRealIdx: number;
  /** Atoms on the path root->this (used to detect ring closures). */
  visitedAtoms: Set<number>;
};

// Kekulé enumeration

/**
 * Decide whether an aromatic atom needs exactly one aromatic double bond in
 * a valid Kekulé form.
 *
 * Rules organized by periodic-table group + formal charge, so that common
 * and less-common aromatics share one consistent decision tree.
 *
 *  - Group 13/14 (C, Si, B): always need a ring double bond when neutral or
 *    cationic; carbanions/boranions don't (lower valence).
 *  - Group 15 (N, P, As): cation (charge >= +1) always needs; neutral
 *    pyridine-style (no non-aromatic bond) needs; neutral pyrrole-style
 *    (carries explicit -H or -R) doesn't; anion doesn't.
 *  - Group 16 (O, S, Se, Te): neutral atoms contribute a lone pair to the
 *    pi-system (furan, thiophene) and don't need; cationic (pyrylium,
 *    thiopyrylium, ...) DO need.
 *  - Anything else: defaults to "no" (conservative fall-back).
 *
 * Covers benzene, naphthalene, pyridine, furan, thiophene, pyrrole, imidazole,
 * phosphabenzene, selenophene, pyridinium, pyrylium, thiopyrylium, and hopefully more
 */
function atomNeedsAromaticDoubleBond(graph: MolGraph, atomIdx: number): boolean {
  const atom = graph.atoms[atomIdx];
  if (!atom) return false;
  const s = atom.symbol;
  const charge = atom.charge ?? 0;

  // Group 13/14 (C, Si, B): tetravalent or trivalent elements that occupy
  // the pi-system fully. Always need a double bond except when anionic.
  if (s === 'C' || s === 'c' || s === 'B' || s === 'b' || s === 'Si' || s === 'si') {
    return charge >= 0;
  }

  // Group 15 (N, P, As): cation always needs; neutral pyridine-style (no
  // non-aromatic explicit bond) needs; neutral pyrrole-style with an
  // explicit substituent/H doesn't; anion doesn't.
  if (s === 'N' || s === 'n' || s === 'P' || s === 'p' || s === 'As' || s === 'as') {
    if (charge >= 1) return true;
    if (charge < 0) return false;
    let nonAromaticBonds = 0;
    for (const b of graph.bonds) {
      if ((b.from === atomIdx || b.to === atomIdx) && b.type !== 4) nonAromaticBonds++;
    }
    return nonAromaticBonds === 0;
  }

  // Group 16 (O, S, Se, Te): neutral atoms contribute a lone pair to the
  // pi-system and don't need a double; cationic (pyrylium, thiopyrylium,
  // ...) have effective valence raised by one and DO need a double.
  if (s === 'O' || s === 'o' || s === 'S' || s === 's' ||
      s === 'Se' || s === 'se' || s === 'Te' || s === 'te') {
    return charge >= 1;
  }

  // Unknown / unsupported element: default to "no" so we under-match rather
  // than over-match. Falls back to all-single Kekulé, a conservative CIP.
  return false;
}

/**
 * Enumerate all valid Kekulé tautomers of the graph's aromatic system.
 *
 * Each result is a Map from bond index (into `graph.bonds`) to either 1
 * (single) or 2 (double), covering every aromatic bond. Non-aromatic bonds
 * are left out of the map. If the graph has no aromatic bonds, a single empty
 * map is returned, letting the caller treat "no aromatic atoms" as a
 * degenerate single-form case.
 *
 * Algorithm: backtracking perfect matching over the subgraph of aromatic
 * atoms that need a double bond (see `atomNeedsAromaticDoubleBond`). For each
 * such atom we pick one of its aromatic bonds to be double, mark both
 * endpoints as matched, and recurse. Aromatic bonds that aren't matched
 * become single. Capped at MAX_FORMS to keep complexity bounded; for the
 * molecules in scope (benzene -> 2, naphthalene -> 3, furan -> 1, pyridine -> 2,
 * biphenyl -> 4) we stay well under the cap.
 */
export function enumerateKekuleForms(graph: MolGraph): Array<Map<number, 1 | 2>> {
  const aromaticBondIndices: number[] = [];
  const aromaticAtomIndices = new Set<number>();
  for (let i = 0; i < graph.bonds.length; i++) {
    if (graph.bonds[i].type === 4) {
      aromaticBondIndices.push(i);
      aromaticAtomIndices.add(graph.bonds[i].from);
      aromaticAtomIndices.add(graph.bonds[i].to);
    }
  }
  if (aromaticBondIndices.length === 0) return [new Map()];

  const needsMatch = new Set<number>();
  for (const a of aromaticAtomIndices) {
    if (atomNeedsAromaticDoubleBond(graph, a)) needsMatch.add(a);
  }

  const aromaticBondsByAtom = new Map<number, number[]>();
  for (const a of aromaticAtomIndices) aromaticBondsByAtom.set(a, []);
  for (const bondIdx of aromaticBondIndices) {
    const b = graph.bonds[bondIdx];
    aromaticBondsByAtom.get(b.from)!.push(bondIdx);
    aromaticBondsByAtom.get(b.to)!.push(bondIdx);
  }

  const MAX_FORMS = 32;
  const results: Array<Map<number, 1 | 2>> = [];
  const matched = new Set<number>();
  const assignment = new Map<number, 1 | 2>();

  const backtrack = (): void => {
    if (results.length >= MAX_FORMS) return;

    let unmatched: number | null = null;
    for (const a of needsMatch) {
      if (!matched.has(a)) { unmatched = a; break; }
    }
    if (unmatched === null) {
      // Every needs-match atom has its double bond. Fill the remaining
      // aromatic bonds as single, then record the form.
      const full = new Map(assignment);
      for (const bondIdx of aromaticBondIndices) {
        if (!full.has(bondIdx)) full.set(bondIdx, 1);
      }
      results.push(full);
      return;
    }

    for (const bondIdx of aromaticBondsByAtom.get(unmatched)!) {
      if (assignment.has(bondIdx)) continue;
      const bond = graph.bonds[bondIdx];
      const other = bond.from === unmatched ? bond.to : bond.from;
      if (!needsMatch.has(other) || matched.has(other)) continue;

      assignment.set(bondIdx, 2);
      matched.add(unmatched);
      matched.add(other);

      backtrack();

      assignment.delete(bondIdx);
      matched.delete(unmatched);
      matched.delete(other);
    }
  };

  backtrack();

  // If no perfect matching exists (e.g. valid heteroaromatic such as furan
  // where carbons can still match but the algorithm above found no full
  // covering), fall back to the trivial all-single form so CIP at least runs.
  return results.length > 0 ? results : [new Map(aromaticBondIndices.map((i) => [i, 1] as const))];
}

/**
 * Apply a Kekulé form to a graph, returning a new MolGraph where each
 * aromatic bond's type is replaced by the form's chosen multiplicity. Atoms
 * are shared; only the bonds array is rebuilt.
 */
function applyKekuleForm(graph: MolGraph, form: Map<number, 1 | 2>): MolGraph {
  if (form.size === 0) return graph;
  const newBonds = graph.bonds.map((b, idx) => {
    if (b.type === 4 && form.has(idx)) return { ...b, type: form.get(idx)! };
    return b;
  });
  return { atoms: graph.atoms, bonds: newBonds };
}

/**
 * Compare two substituents via CIP-style sphere-by-sphere atomic-number
 * comparison, with full Kekulé enumeration for aromatic systems.
 *
 * If the graph contains aromatic bonds (type 4), each substituent's CIP
 * profile is computed under every valid Kekulé tautomer and the substituent
 * is assigned the maximum profile across forms, the CIP-canonical
 * "best face" of the substituent. Then the two maxima are compared.
 *
 * For graphs without aromatic bonds, `enumerateKekuleForms` returns a single
 * trivial form and the algorithm reduces to a single-form CIP traversal.
 *
 * Returns +1 if A > B, -1 if A < B, 0 if equal.
 */
function compareCIP(
  graph: MolGraph,
  rootA: number, parentA: number,
  rootB: number, parentB: number,
  maxDepth: number = 30,
): number {
  const forms = enumerateKekuleForms(graph);

  let maxProfileA: number[][] | null = null;
  let maxProfileB: number[][] | null = null;
  for (const form of forms) {
    const formGraph = applyKekuleForm(graph, form);
    const profileA = cipProfile(formGraph, rootA, parentA, maxDepth);
    const profileB = cipProfile(formGraph, rootB, parentB, maxDepth);
    if (maxProfileA === null || compareProfiles(profileA, maxProfileA) > 0) {
      maxProfileA = profileA;
    }
    if (maxProfileB === null || compareProfiles(profileB, maxProfileB) > 0) {
      maxProfileB = profileB;
    }
  }

  return compareProfiles(maxProfileA ?? [], maxProfileB ?? []);
}

/**
 * Compute a substituent's full CIP profile as an array of spheres, where each
 * sphere is a descending-sorted list of atomic numbers. Used for cross-Kekulé
 * comparison: unlike the single-form early-exit walk, we need every sphere so
 * the per-form profiles can be ordered against each other.
 */
function cipProfile(
  graph: MolGraph,
  root: number,
  parent: number,
  maxDepth: number,
): number[][] {
  const rootAtom = graph.atoms[root];
  if (!rootAtom) return [];

  let frontier: CIPNode[] = [{
    atomicNumber: atomicNumber(rootAtom.symbol),
    realAtomIdx: root,
    parentRealIdx: parent,
    visitedAtoms: new Set([parent]),
  }];

  const profile: number[][] = [];
  for (let depth = 0; depth <= maxDepth; depth++) {
    if (frontier.length === 0) break;
    profile.push(frontier.map((n) => n.atomicNumber).sort((x, y) => y - x));

    const next: CIPNode[] = [];
    for (const n of frontier) next.push(...expandCIPNode(graph, n));
    frontier = next;
  }
  return profile;
}

function compareProfiles(a: number[][], b: number[][]): number {
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const sphereA = a[i] ?? [];
    const sphereB = b[i] ?? [];
    const cmp = lexCompareNumbers(sphereA, sphereB);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/**
 * Expand a CIP node into its children for the next sphere.
 *
 * Rules:
 *  - Phantom nodes (realAtomIdx === null) are terminal, meaning no children.
 *  - For each real neighbour (mult-bond aware):
 *      - the neighbour itself is added as a real child
 *      - (mult - 1) phantom copies of the neighbour are added (multi-bond duplicate atoms)
 *  - The bond back to the parent contributes (mult - 1) phantoms of the parent
 *    (its real form is omitted to prevent backtracking).
 *  - A neighbour already on this path (ring closure) becomes a phantom and is
 *    not expanded further.
 *
 * Aromatic bonds (type 4) are expected to have been resolved to specific
 * single/double assignments by {@link applyKekuleForm} before reaching this
 * function. As a defensive fallback (e.g. an external caller bypassed the
 * Kekulé step), type 4 is treated as multiplicity 2.
 */
function expandCIPNode(graph: MolGraph, node: CIPNode): CIPNode[] {
  if (node.realAtomIdx === null) return [];

  const children: CIPNode[] = [];
  const myIdx = node.realAtomIdx;
  const newVisited = new Set(node.visitedAtoms);
  newVisited.add(myIdx);

  for (const bond of graph.bonds) {
    let other: number | null = null;
    if (bond.from === myIdx) other = bond.to;
    else if (bond.to === myIdx) other = bond.from;
    if (other === null) continue;

    const otherAtom = graph.atoms[other];
    if (!otherAtom) continue;

    const mult =
      bond.type === 2 ? 2 :
      bond.type === 3 ? 3 :
      bond.type === 4 ? 2 :  // aromatic approx. double for priority purposes
      1;
    const otherZ = atomicNumber(otherAtom.symbol);

    if (other === node.parentRealIdx) {
      // Back-link: phantoms for multi-bond only.
      for (let p = 1; p < mult; p++) {
        children.push(phantomChild(otherZ, myIdx, newVisited));
      }
      continue;
    }

    if (node.visitedAtoms.has(other)) {
      // Ring closure: add (mult) phantoms of the closing atom.
      for (let p = 0; p < mult; p++) {
        children.push(phantomChild(otherZ, myIdx, newVisited));
      }
      continue;
    }

    // Real child plus (mult - 1) phantoms for the multi-bond duplicate.
    children.push({
      atomicNumber: otherZ,
      realAtomIdx: other,
      parentRealIdx: myIdx,
      visitedAtoms: newVisited,
    });
    for (let p = 1; p < mult; p++) {
      children.push(phantomChild(otherZ, myIdx, newVisited));
    }
  }
  return children;
}

function phantomChild(z: number, parent: number, visited: Set<number>): CIPNode {
  return {
    atomicNumber: z,
    realAtomIdx: null,
    parentRealIdx: parent,
    visitedAtoms: visited,
  };
}

function lexCompareNumbers(a: number[], b: number[]): number {
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

// Graph helpers

function heavyNeighborIndices(graph: MolGraph, atomIdx: number, excludeIdx: number): number[] {
  const indices: number[] = [];
  for (const bond of graph.bonds) {
    let other: number | null = null;
    if (bond.from === atomIdx) other = bond.to;
    else if (bond.to === atomIdx) other = bond.from;
    if (other === null || other === excludeIdx) continue;
    const atom = graph.atoms[other];
    if (!atom) continue;
    if (atom.symbol === 'H' || atom.symbol === '*') continue;
    indices.push(other);
  }
  return indices;
}

/**
 * Return true if the bond between `atomA` and `atomB` is part of a ring.
 * Implemented as a BFS from `atomA` that skips the direct bond and checks
 * whether `atomB` can still be reached.
 */
function isBondInRing(graph: MolGraph, atomA: number, atomB: number): boolean {
  const visited = new Set<number>([atomA]);
  const queue: number[] = [atomA];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const bond of graph.bonds) {
      if (
        (bond.from === atomA && bond.to === atomB) ||
        (bond.from === atomB && bond.to === atomA)
      ) continue;
      let other: number | null = null;
      if (bond.from === current) other = bond.to;
      else if (bond.to === current) other = bond.from;
      if (other === null || visited.has(other)) continue;
      if (other === atomB) return true;
      visited.add(other);
      queue.push(other);
    }
  }
  return false;
}

// SMILES walking helpers

type SmilesEqualsBond = {
  /** Position of the `=` character in the SMILES string. */
  eqPos: number;
  /** Parse-order index of the atom on the left of `=`. */
  atomA: number;
  /** Parse-order index of the atom on the right of `=`. */
  atomB: number;
};

/**
 * Walk a SMILES string and return, for each `=` outside bracket atoms, the
 * position of the `=` and the parse-order atom indices it bridges.
 *
 * Assumes the SMILES is the canonical form produced by RDKit so that atom
 * indices align with the indices in the MolGraph reparsed from the matching
 * MOL block. Branch parens and ring-closure digits don't consume atom indices
 * but the "previous atom" tracking still works correctly across them.
 */
function mapSmilesEqualsToBonds(smiles: string): SmilesEqualsBond[] {
  const result: SmilesEqualsBond[] = [];
  const branchStack: (number | null)[] = [];
  let lastAtomIdx: number | null = null;
  let pendingEqPos = -1;
  let atomCounter = -1;

  const commit = (newAtomIdx: number) => {
    if (pendingEqPos !== -1 && lastAtomIdx !== null) {
      result.push({ eqPos: pendingEqPos, atomA: lastAtomIdx, atomB: newAtomIdx });
    }
    pendingEqPos = -1;
    lastAtomIdx = newAtomIdx;
  };

  let i = 0;
  while (i < smiles.length) {
    const ch = smiles[i];

    if (ch === '(') {
      branchStack.push(lastAtomIdx);
      pendingEqPos = -1;
      i++;
      continue;
    }
    if (ch === ')') {
      lastAtomIdx = branchStack.pop() ?? null;
      pendingEqPos = -1;
      i++;
      continue;
    }
    if (ch === '=') {
      pendingEqPos = i;
      i++;
      continue;
    }
    if (ch === '/' || ch === '\\' || ch === '#' || ch === '-' || ch === ':') {
      i++;
      continue;
    }
    if (/\d/.test(ch)) { i++; continue; }
    if (ch === '[') {
      const end = smiles.indexOf(']', i);
      if (end === -1) break;
      atomCounter++;
      commit(atomCounter);
      i = end + 1;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let atomLen = 1;
      if (ch === 'C' && smiles[i + 1] === 'l') atomLen = 2;
      else if (ch === 'B' && smiles[i + 1] === 'r') atomLen = 2;
      atomCounter++;
      commit(atomCounter);
      i += atomLen;
      continue;
    }
    i++;
  }
  return result;
}

/**
 * Given the position of `=` in a SMILES, look for existing `/` or `\` slashes
 * on both sides that together annotate the double bond's stereochemistry.
 * Returns a descriptor if found, else null.
 */
function findStereoAroundEquals(
  smiles: string,
  eqPos: number,
): Omit<NewStereoBond, 'bondIndex'> | null {
  const left = findNearestSlash(smiles, eqPos, 'left');
  const right = findNearestSlash(smiles, eqPos, 'right');
  if (left === null || right === null) return null;
  const leftChar = smiles[left];
  const rightChar = smiles[right];
  const config: 'cis' | 'trans' = leftChar === rightChar ? 'trans' : 'cis';
  return { equalsPosition: eqPos, slashPosition: right, currentConfig: config };
}

function findNearestSlash(
  smiles: string,
  eqPos: number,
  direction: 'left' | 'right',
): number | null {
  const step = direction === 'left' ? -1 : 1;
  let pos = eqPos + step;
  let bracketDepth = 0;

  while (pos >= 0 && pos < smiles.length) {
    const ch = smiles[pos];
    if (direction === 'left') {
      if (ch === ']') { bracketDepth++; pos += step; continue; }
      if (ch === '[') { bracketDepth--; pos += step; continue; }
    } else {
      if (ch === '[') { bracketDepth++; pos += step; continue; }
      if (ch === ']') { bracketDepth--; pos += step; continue; }
    }
    if (bracketDepth > 0) { pos += step; continue; }
    if (ch === '/' || ch === '\\') return pos;
    if (ch === '=' || ch === '#') return null;
    pos += step;
  }
  return null;
}
