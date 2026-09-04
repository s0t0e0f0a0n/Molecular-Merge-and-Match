/** A single atom in a parsed MOL graph. */
export type MolAtom = {
  index: number;
  symbol: string;
  x: number;
  y: number;
  z: number;
  charge: number;
  /**
   * Optional atom-map number (V2000 atom-map field, also written as `[C:N]`
   * in SMILES). Preserved by RDKit through canonical SMILES generation, so we
   * use it to tag atom origin across a merge -> canonicalize -> re-parse cycle.
   * Conventions used by `mergeAtAtoms`:
   *   1 - atom originated in the first input graph (the "source" / solution side).
   *   2 - atom originated in the second input graph (the "target" / fragment side).
   *   3 - the source-side endpoint of the merge bond (i.e. graph-A's merge atom).
   *   4 - the target-side endpoint of the merge bond (graph-B's merge atom).
   * Default 0 means "no tag" - atoms outside a merge keep mapNumber undefined.
   */
  mapNumber?: number;
};

/** A single bond in a parsed MOL graph. */
export type MolBond = {
  from: number;
  to: number;
  type: number;   // 1 = single, 2 = double, 3 = triple
  stereo: number;
};

/** Adjacency-list graph parsed from a MOL V2000 block. */
export type MolGraph = {
  atoms: MolAtom[];
  bonds: MolBond[];
};

/** Fragment with parsed graph data. */
export type FragmentWithGraph = {
  id: string;
  label: string;
  smiles: string;
  molFile: string;
  graph: MolGraph;
};

/** Merge state machine: shared between page, linking tab and solution panel. */
export type MergeState =
  | { phase: 'idle' }
  | { phase: 'picking-fragment-atom'; fragmentId: number }
  | { phase: 'picking-merge-target'; fragmentId: number; fragmentAtomIndex: number };

/** A newly created stereo double bond detected after a merge. */
export type NewStereoBond = {
  equalsPosition: number;
  slashPosition: number;
  currentConfig: 'cis' | 'trans';
  bondIndex: number;
};
