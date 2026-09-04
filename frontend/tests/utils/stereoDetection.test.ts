import { describe, it, expect } from 'vitest';
import {
  countStereoSlashes,
  detectNewStereoBonds,
  applyStereoChoice,
  findStereogenicDoubleBonds,
  insertDefaultStereoSlashes,
  enumerateKekuleForms,
  stripMapNumbersFromSmiles,
} from '../../src/utils/stereoDetection';
import type { MolGraph } from '../../src/types/molecule';

// MolGraph builders
//
// Conventions:
//   bond type:  1 = single, 2 = double, 3 = triple, 4 = aromatic
//   atoms numbered in the order they appear in the SMILES they correspond to
//   so test assertions can reference atom indices unambiguously.

function atom(index: number, symbol: string): MolGraph['atoms'][number] {
  return { index, symbol, x: 0, y: 0, z: 0, charge: 0 };
}
function bond(from: number, to: number, type: number): MolGraph['bonds'][number] {
  return { from, to, type, stereo: 0 };
}

// Trivial / simple chains

const methane: MolGraph = {                             // C
  atoms: [atom(0, 'C')],
  bonds: [],
};

const ethane: MolGraph = {                              // CC
  atoms: [atom(0, 'C'), atom(1, 'C')],
  bonds: [bond(0, 1, 1)],
};

const ethene: MolGraph = {                              // C=C
  atoms: [atom(0, 'C'), atom(1, 'C')],
  bonds: [bond(0, 1, 2)],
};

const propene: MolGraph = {                             // C=CC
  atoms: [atom(0, 'C'), atom(1, 'C'), atom(2, 'C')],
  bonds: [bond(0, 1, 2), bond(1, 2, 1)],
};

const butene: MolGraph = {                              // CC=CC, 2-butene
  atoms: [atom(0, 'C'), atom(1, 'C'), atom(2, 'C'), atom(3, 'C')],
  bonds: [bond(0, 1, 1), bond(1, 2, 2), bond(2, 3, 1)],
};

const hexadiene: MolGraph = {                           // CC=CC=CC, 2,4-hexadiene
  atoms: [atom(0, 'C'), atom(1, 'C'), atom(2, 'C'), atom(3, 'C'), atom(4, 'C'), atom(5, 'C')],
  bonds: [bond(0, 1, 1), bond(1, 2, 2), bond(2, 3, 1), bond(3, 4, 2), bond(4, 5, 1)],
};

// Ring / special bond cases

const cyclohexene: MolGraph = {                         // ring with one C=C
  atoms: [atom(0, 'C'), atom(1, 'C'), atom(2, 'C'), atom(3, 'C'), atom(4, 'C'), atom(5, 'C')],
  bonds: [
    bond(0, 1, 2),
    bond(1, 2, 1), bond(2, 3, 1), bond(3, 4, 1), bond(4, 5, 1), bond(5, 0, 1),
  ],
};

const acetone: MolGraph = {                             // CC(=O)C : has C=O, no C=C
  atoms: [atom(0, 'C'), atom(1, 'C'), atom(2, 'O'), atom(3, 'C')],
  bonds: [bond(0, 1, 1), bond(1, 2, 2), bond(1, 3, 1)],
};

const allene: MolGraph = {                              // C=C=C : outer carbons terminal
  atoms: [atom(0, 'C'), atom(1, 'C'), atom(2, 'C')],
  bonds: [bond(0, 1, 2), bond(1, 2, 2)],
};

// Substituent comparison

// =C(Cl)Cl: right side has two identical Cl substituents : not stereogenic.
const dichloroethene: MolGraph = {
  atoms: [atom(0, 'C'), atom(1, 'C'), atom(2, 'Cl'), atom(3, 'Cl'), atom(4, 'C')],
  bonds: [bond(0, 1, 2), bond(1, 2, 1), bond(1, 3, 1), bond(0, 4, 1)],
};

// Crotonic acid CC=CC(=O)O : stereogenic C=C; methyl vs carboxyl substituents.
const crotonicAcid: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'), atom(3, 'C'), atom(4, 'O'), atom(5, 'O'),
  ],
  bonds: [
    bond(0, 1, 1), bond(1, 2, 2), bond(2, 3, 1), bond(3, 4, 2), bond(3, 5, 1),
  ],
};

// Bug-report fixture #1: isopropenol C(O)(C)=C : NOT stereogenic (right side
// is terminal =CH2).
const isopropenol: MolGraph = {
  atoms: [atom(0, 'C'), atom(1, 'O'), atom(2, 'C'), atom(3, 'C')],
  bonds: [bond(0, 1, 1), bond(0, 2, 1), bond(0, 3, 2)],
};

// Bug-report fixture #1 (post-merge): isopropenol + methyl -> CC=C(C)O.
// Atom indices match the canonical SMILES "CC=C(C)O" in parse order.
const isopropenolPlusMethyl: MolGraph = {
  atoms: [
    atom(0, 'C'),  // chain CH3
    atom(1, 'C'),  // left =C
    atom(2, 'C'),  // right =C (branched)
    atom(3, 'C'),  // branch methyl
    atom(4, 'O'),  // hydroxyl
  ],
  bonds: [
    bond(0, 1, 1),
    bond(1, 2, 2),    // stereogenic C=C
    bond(2, 3, 1),
    bond(2, 4, 1),
  ],
};

// Bug-report fixture #2 (post-merge): alpha-methylstyrene + ethyl ->
// CCC=C(C)c1ccccc1. Right side has methyl (C, neighbours = none) versus
// phenyl-ring-C (C, neighbours = 2 ring carbons). Without CIP these look
// identical; CIP correctly distinguishes them at sphere 1.
const aMethylStyreneWithEthyl: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'), atom(3, 'C'),
    atom(4, 'C'),
    atom(5, 'C'), atom(6, 'C'), atom(7, 'C'),
    atom(8, 'C'), atom(9, 'C'), atom(10, 'C'),
  ],
  bonds: [
    bond(0, 1, 1), bond(1, 2, 1),
    bond(2, 3, 2),    // stereogenic C=C
    bond(3, 4, 1),    // methyl substituent
    bond(3, 5, 1),    // phenyl attachment
    bond(5, 6, 2), bond(6, 7, 1), bond(7, 8, 2),
    bond(8, 9, 1), bond(9, 10, 2), bond(10, 5, 1),
  ],
};

// Pre-merge alpha-methylstyrene fragment (terminal =CH2 : not stereogenic yet).
const aMethylStyrene: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'C'), atom(4, 'C'), atom(5, 'C'),
    atom(6, 'C'), atom(7, 'C'), atom(8, 'C'),
  ],
  bonds: [
    bond(0, 1, 2), bond(1, 2, 1), bond(1, 3, 1),
    bond(3, 4, 2), bond(4, 5, 1), bond(5, 6, 2),
    bond(6, 7, 1), bond(7, 8, 2), bond(8, 3, 1),
  ],
};

// CIP-distinguishable substituent pairs (shell-1 looks identical)

// =C(CH2-CH3)(CH2-Cl): both right-side substituents are CH2 carbons. They
// differ only at shell 2 (CH3 vs Cl). Requires CIP to detect.
// Atom indices match the SMILES "CC=C(CC)CCl" in parse order.
const ethylVsChloromethyl: MolGraph = {
  atoms: [
    atom(0, 'C'),  // leading methyl (left side of =C)
    atom(1, 'C'),  // left =C
    atom(2, 'C'),  // right =C
    atom(3, 'C'),  // CH2 of ethyl (in branch)
    atom(4, 'C'),  // CH3 of ethyl
    atom(5, 'C'),  // CH2 of chloromethyl (after branch)
    atom(6, 'Cl'),
  ],
  bonds: [
    bond(0, 1, 1),
    bond(1, 2, 2),      // stereogenic C=C
    bond(2, 3, 1), bond(3, 4, 1),
    bond(2, 5, 1), bond(5, 6, 1),
  ],
};

// =C(CH=CH2)(CH2-CH3): vinyl vs ethyl. Both substituents are sp2/sp3 C atoms
// with 1 heavy neighbour at shell 1, but vinyl's neighbour is itself part of
// a double bond, contributing a phantom atom under CIP rules.
// Atom indices match the SMILES "CC=C(C=C)CC" in parse order.
const vinylVsEthyl: MolGraph = {
  atoms: [
    atom(0, 'C'),  // leading methyl
    atom(1, 'C'),  // left =C
    atom(2, 'C'),  // right =C
    atom(3, 'C'),  // vinyl middle CH (in branch)
    atom(4, 'C'),  // vinyl terminal =CH2
    atom(5, 'C'),  // ethyl CH2 (after branch)
    atom(6, 'C'),  // ethyl CH3
  ],
  bonds: [
    bond(0, 1, 1),
    bond(1, 2, 2),      // stereogenic C=C
    bond(2, 3, 1), bond(3, 4, 2),
    bond(2, 5, 1), bond(5, 6, 1),
  ],
};

// =C(CH2-OMe)(CH2-CH3): methoxymethyl vs ethyl.
// Atom indices match the SMILES "CC=C(COC)CC" in parse order.
const methoxymethylVsEthyl: MolGraph = {
  atoms: [
    atom(0, 'C'),  // leading methyl
    atom(1, 'C'),  // left =C
    atom(2, 'C'),  // right =C
    atom(3, 'C'),  // CH2 of methoxymethyl (in branch)
    atom(4, 'O'),  // -O-
    atom(5, 'C'),  // CH3 of -OMe
    atom(6, 'C'),  // CH2 of ethyl (after branch)
    atom(7, 'C'),  // CH3 of ethyl
  ],
  bonds: [
    bond(0, 1, 1),
    bond(1, 2, 2),
    bond(2, 3, 1), bond(3, 4, 1), bond(4, 5, 1),
    bond(2, 6, 1), bond(6, 7, 1),
  ],
};

// =C(phenyl)(cyclohexyl): aromatic vs saturated ring. CIP separates them
// because aromatic bonds contribute phantoms while sp3 single bonds do not.
// Atom indices match the SMILES "CC=C(c1ccccc1)C1CCCCC1" in parse order.
const phenylVsCyclohexyl: MolGraph = {
  atoms: [
    atom(0, 'C'),    // leading methyl
    atom(1, 'C'),    // left =C
    atom(2, 'C'),    // right =C
    // phenyl ring (atoms 3..8, atom 3 attaches to atom 2)
    atom(3, 'C'), atom(4, 'C'), atom(5, 'C'),
    atom(6, 'C'), atom(7, 'C'), atom(8, 'C'),
    // cyclohexyl ring (atoms 9..14, atom 9 attaches to atom 2)
    atom(9, 'C'), atom(10, 'C'), atom(11, 'C'),
    atom(12, 'C'), atom(13, 'C'), atom(14, 'C'),
  ],
  bonds: [
    bond(0, 1, 1),
    bond(1, 2, 2),
    // phenyl: aromatic bond type 4 throughout
    bond(2, 3, 1),
    bond(3, 4, 4), bond(4, 5, 4), bond(5, 6, 4),
    bond(6, 7, 4), bond(7, 8, 4), bond(8, 3, 4),
    // cyclohexyl: all single bonds
    bond(2, 9, 1),
    bond(9, 10, 1), bond(10, 11, 1), bond(11, 12, 1),
    bond(12, 13, 1), bond(13, 14, 1), bond(14, 9, 1),
  ],
};

// Additional CIP fixtures

// =C(CH3)(CH3): geminal-symmetric: substituents identical. Not stereogenic.
// SMILES: "CC=C(C)C". Atoms in parse order.
const geminalDimethyl: MolGraph = {
  atoms: [
    atom(0, 'C'),  // leading methyl
    atom(1, 'C'),  // left =C
    atom(2, 'C'),  // right =C
    atom(3, 'C'),  // branch methyl
    atom(4, 'C'),  // continuation methyl
  ],
  bonds: [
    bond(0, 1, 1), bond(1, 2, 2),
    bond(2, 3, 1), bond(2, 4, 1),
  ],
};

// =C(C#CH)(CH2-CH3): propargyl-CH2 vs ethyl. Triple bond contributes 2
// phantoms, so propargyl's neighbour exposes more atomic-number weight at
// shell 2 than ethyl does. Requires CIP phantoms.
// SMILES: "CC=C(CC#C)CC": atom 3 = CH2 of propargyl branch, atom 4 = sp C,
// atom 5 = terminal sp CH, atom 6 = ethyl CH2, atom 7 = ethyl CH3.
const propargylVsEthyl: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'C'), atom(4, 'C'), atom(5, 'C'),
    atom(6, 'C'), atom(7, 'C'),
  ],
  bonds: [
    bond(0, 1, 1), bond(1, 2, 2),       // stereogenic
    bond(2, 3, 1), bond(3, 4, 1), bond(4, 5, 3),  // propargyl with triple bond
    bond(2, 6, 1), bond(6, 7, 1),       // ethyl
  ],
};

// =C(CHF2)(CH3): difluoromethyl vs methyl. The difluoro carbon's shell 1 has
// two F (Z=9) atoms while methyl's shell 1 is empty. Trivially separated by
// CIP. (Used to confirm shell-1 heteroatoms dominate.)
// SMILES: "CC=C(C)C(F)F": atom 3 = branch methyl, atom 4 = CHF2 carbon,
// atoms 5,6 = the two fluorines.
const difluoromethylVsMethyl: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'C'), atom(4, 'C'),
    atom(5, 'F'), atom(6, 'F'),
  ],
  bonds: [
    bond(0, 1, 1), bond(1, 2, 2),
    bond(2, 3, 1),       // methyl substituent
    bond(2, 4, 1),       // CHF2 substituent
    bond(4, 5, 1), bond(4, 6, 1),
  ],
};

// =C(CH2-CH2-Cl)(CH2-CH2-CH3): substituents differ only at shell 3.
// SMILES: "CC=C(CCCl)CCC".
// Atoms: 0 methyl, 1 left=C, 2 right=C, 3 first-CH2 of chloropropyl,
// 4 second-CH2, 5 Cl, 6 first-CH2 of propyl, 7 second-CH2, 8 methyl.
const shell3Difference: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'C'), atom(4, 'C'), atom(5, 'Cl'),
    atom(6, 'C'), atom(7, 'C'), atom(8, 'C'),
  ],
  bonds: [
    bond(0, 1, 1), bond(1, 2, 2),
    bond(2, 3, 1), bond(3, 4, 1), bond(4, 5, 1),
    bond(2, 6, 1), bond(6, 7, 1), bond(7, 8, 1),
  ],
};

// =C(NH2)(OH) shoulder-by-shoulder amine vs alcohol. Shell 0 differs (N vs O)
// so this is trivially separated, but useful as a sanity check for heteroatom
// support in the CIP engine.
// SMILES: "CC=C(N)O": atom 3 = N, atom 4 = O.
const amineVsHydroxyl: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'N'), atom(4, 'O'),
  ],
  bonds: [
    bond(0, 1, 1), bond(1, 2, 2),
    bond(2, 3, 1), bond(2, 4, 1),
  ],
};

// =C(CHO)(C(=O)CH3): aldehyde vs acetyl. Both attach-carbons see [=O,
// phantom-O, X] at shell 1, but X differs (H/nothing for CHO, methyl for
// acetyl). The methyl gives acetyl an extra C at shell 1.
// SMILES: "CC=C(C=O)C(C)=O" : atom 3 = CHO carbon, atom 4 = =O of CHO,
// atom 5 = acetyl-C, atom 6 = acetyl methyl, atom 7 = acetyl =O.
const aldehydeVsAcetyl: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'C'), atom(4, 'O'),
    atom(5, 'C'), atom(6, 'C'), atom(7, 'O'),
  ],
  bonds: [
    bond(0, 1, 1), bond(1, 2, 2),
    bond(2, 3, 1), bond(3, 4, 2),       // -CHO
    bond(2, 5, 1), bond(5, 6, 1), bond(5, 7, 2),  // -C(CH3)=O
  ],
};

// Aromatic systems encoded with type-4 (aromatic) bonds: these exercise
// the Kekulé enumeration in compareCIP.

// Benzene c1ccccc1, type-4 bonds. Used to sanity-check that Kekulé
// enumeration produces exactly 2 forms.
const benzeneAromatic: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'C'), atom(4, 'C'), atom(5, 'C'),
  ],
  bonds: [
    bond(0, 1, 4), bond(1, 2, 4), bond(2, 3, 4),
    bond(3, 4, 4), bond(4, 5, 4), bond(5, 0, 4),
  ],
};

// Naphthalene c1ccc2ccccc2c1, type-4 bonds. Two fused 6-rings sharing the
// 3-8 bond. Junctions: atoms 3 and 8. Three Kekulé tautomers expected.
const naphthaleneAromatic: MolGraph = {
  atoms: Array.from({ length: 10 }, (_, i) => atom(i, 'C')),
  bonds: [
    bond(0, 1, 4), bond(1, 2, 4), bond(2, 3, 4),
    bond(3, 4, 4), bond(4, 5, 4), bond(5, 6, 4),
    bond(6, 7, 4), bond(7, 8, 4), bond(8, 9, 4),
    bond(3, 8, 4),                       // ring-2 closure (the fusion bond)
    bond(9, 0, 4),                       // ring-1 closure
  ],
};

// Furan c1ccoc1, type-4 bonds. Oxygen contributes a lone pair to the
// aromatic pi-system rather than a double bond, so only one Kekulé form is
// possible (C=C double bonds at the two non-O edges).
const furanAromatic: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'O'),
    atom(4, 'C'),
  ],
  bonds: [
    bond(0, 1, 4), bond(1, 2, 4), bond(2, 3, 4),
    bond(3, 4, 4), bond(4, 0, 4),
  ],
};

// Imidazole c1nc[nH]c1, type-4 bonds. Two nitrogens at non-adjacent
// positions: one pyridine-like (no H), one pyrrole-like (explicit H bond
// added as a non-aromatic single bond to a hydrogen atom). Only ONE valid
// Kekulé form exists because the NH locks the matching geometry.
const imidazoleAromatic: MolGraph = {
  atoms: [
    atom(0, 'C'),          // C2 (between the two nitrogens)
    atom(1, 'N'),          // N3 (pyridine-style)
    atom(2, 'C'),          // C4
    atom(3, 'C'),          // C5
    atom(4, 'N'),          // N1 (pyrrole-style, bears the H)
    atom(5, 'H'),          // explicit H on N1
  ],
  bonds: [
    bond(0, 1, 4), bond(1, 2, 4), bond(2, 3, 4),
    bond(3, 4, 4), bond(4, 0, 4),
    bond(4, 5, 1),         // N1–H, non-aromatic
  ],
};

// Pyrylium c1cc[o+]cc1, type-4 bonds. Six-ring with a positively-charged
// oxygen that DOES participate in a ring double bond (effective valence 3).
// Two Kekulé forms, analogous to benzene.
const pyryliumAromatic: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    { index: 3, symbol: 'O', x: 0, y: 0, z: 0, charge: 1 },
    atom(4, 'C'), atom(5, 'C'),
  ],
  bonds: [
    bond(0, 1, 4), bond(1, 2, 4), bond(2, 3, 4),
    bond(3, 4, 4), bond(4, 5, 4), bond(5, 0, 4),
  ],
};

// Thiopyrylium c1cc[s+]cc1 : same shape as pyrylium with cationic S+.
const thiopyryliumAromatic: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    { index: 3, symbol: 'S', x: 0, y: 0, z: 0, charge: 1 },
    atom(4, 'C'), atom(5, 'C'),
  ],
  bonds: [
    bond(0, 1, 4), bond(1, 2, 4), bond(2, 3, 4),
    bond(3, 4, 4), bond(4, 5, 4), bond(5, 0, 4),
  ],
};

// N-methylpyridinium c1cc[n+](C)cc1 : pyridinium with an alkyl on N. The N+
// has 2 aromatic bonds + 1 non-aromatic (methyl) + charge +1, so its target
// valence is 4 : still needs a ring double bond. Two Kekulé forms.
const nMethylPyridinium: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    { index: 3, symbol: 'N', x: 0, y: 0, z: 0, charge: 1 },
    atom(4, 'C'), atom(5, 'C'),
    atom(6, 'C'),          // exocyclic methyl
  ],
  bonds: [
    bond(0, 1, 4), bond(1, 2, 4), bond(2, 3, 4),
    bond(3, 4, 4), bond(4, 5, 4), bond(5, 0, 4),
    bond(3, 6, 1),         // N+–CH3
  ],
};

// Selenophene c1ccsec1 (5-ring with Se): Se behaves like S/O, contributes
// a lone pair, only one Kekulé form (two C=C doubles between the carbons).
const selenopheneAromatic: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'Se'),
    atom(4, 'C'),
  ],
  bonds: [
    bond(0, 1, 4), bond(1, 2, 4), bond(2, 3, 4),
    bond(3, 4, 4), bond(4, 0, 4),
  ],
};

// Phosphabenzene c1ccpcc1: 6-ring with neutral P at one position, acts
// like pyridine N (no non-aromatic bond, needs a ring double bond).
const phosphabenzeneAromatic: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'P'),
    atom(4, 'C'), atom(5, 'C'),
  ],
  bonds: [
    bond(0, 1, 4), bond(1, 2, 4), bond(2, 3, 4),
    bond(3, 4, 4), bond(4, 5, 4), bond(5, 0, 4),
  ],
};

// Pyridine c1ccncc1, type-4 bonds. Nitrogen with no non-aromatic bond needs
// to participate in a double bond: same matching shape as benzene, so two
// Kekulé tautomers.
const pyridineAromatic: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'N'),
    atom(4, 'C'), atom(5, 'C'),
  ],
  bonds: [
    bond(0, 1, 4), bond(1, 2, 4), bond(2, 3, 4),
    bond(3, 4, 4), bond(4, 5, 4), bond(5, 0, 4),
  ],
};

// =C(1-naphthyl)(2-naphthyl) on a stereogenic double bond. Both
// substituents are aromatic naphthyl groups; they differ only in attachment
// position (1-naphthyl is adjacent to the ring junction, 2-naphthyl is not).
// CIP must distinguish them via the topology surfaced through Kekulé-aware
// expansion. 23 atoms total:
//   0     : methyl on left =C
//   1     : left =C
//   2     : right =C
//   3-12  : 1-naphthyl substituent (10 atoms; attachment atom 3 is alpha)
//   13-22 : 2-naphthyl substituent (10 atoms; attachment atom 13 is beta)
//
// 1-naphthyl ring numbering inside the substituent (offsets relative to 3):
//   offset 0 = attachment atom (alpha-C, next to junction)
//   offset 1 = junction (3a)
//   offset 2-6 = the second ring
//   offset 7-9 = rest of the first ring
//
// 2-naphthyl ring numbering inside its substituent (offsets relative to 13):
//   offset 0 = attachment atom (beta-C, NOT adjacent to junction)
//   offset 1, 2 = first-ring neighbours
//   offset 3 = ring junction
//   ...
const alphaVsBetaNaphthyl: MolGraph = (() => {
  const atoms: MolGraph['atoms'] = [];
  const bonds: MolGraph['bonds'] = [];

  // Outer structure: CC=C(... )(...)
  atoms.push(atom(0, 'C'), atom(1, 'C'), atom(2, 'C'));
  bonds.push(bond(0, 1, 1));
  bonds.push(bond(1, 2, 2));               // stereogenic C=C

  // 1-naphthyl substituent (atoms 3..12)
  // Local indexing (offset 3):
  //   0 (=3): alpha attachment
  //   1 (=4): ring-1 neighbour, also junction
  //   2 (=5)..6 (=9): ring 2 atoms
  //   7 (=10), 8 (=11), 9 (=12): rest of ring 1
  for (let i = 3; i <= 12; i++) atoms.push(atom(i, 'C'));

  // Ring 1 (atoms 3,4,5,6,7,8). Aromatic bonds:
  bonds.push(bond(3, 4, 4));     // 3 (alpha) - 4 (junction)
  bonds.push(bond(4, 5, 4));     // 4 (junction) - 5 (junction) 
  bonds.push(bond(5, 6, 4));
  bonds.push(bond(6, 7, 4));
  bonds.push(bond(7, 8, 4));
  bonds.push(bond(8, 3, 4));     // closes ring 1

  // Ring 2 (atoms 4,5,9,10,11,12).
  bonds.push(bond(5, 9, 4));
  bonds.push(bond(9, 10, 4));
  bonds.push(bond(10, 11, 4));
  bonds.push(bond(11, 12, 4));
  bonds.push(bond(12, 4, 4));    // closes ring 2

  // Attach 1-naphthyl to right =C (atom 2)
  bonds.push(bond(2, 3, 1));

  // 2-naphthyl substituent (atoms 13..22)
  // Local indexing (offset 13):
  //   0 (=13): beta attachment (NOT adjacent to junction)
  //   1 (=14), 2 (=15): ring-1 neighbours of 13
  //   3 (=16), 4 (=17): junctions (the ring-1 fusion atoms)
  //   etc.
  //
  // Choose: atoms 13,14,15,16,17,18 form ring 1; 16,17,19,20,21,22 form
  // ring 2. Attachment atom 13 is beta : its ring-1 neighbours are atoms
  // 14 and 18, neither of which is a junction. Junctions are 16 and 17
  // (the fusion bond 16-17).
  for (let i = 13; i <= 22; i++) atoms.push(atom(i, 'C'));

  // Ring 1 (atoms 13,14,15,16,17,18):
  bonds.push(bond(13, 14, 4));   // beta attachment to ring neighbour
  bonds.push(bond(14, 15, 4));
  bonds.push(bond(15, 16, 4));   // arrives at junction
  bonds.push(bond(16, 17, 4));   // fusion bond
  bonds.push(bond(17, 18, 4));
  bonds.push(bond(18, 13, 4));   // closes ring 1

  // Ring 2 (atoms 16,17,19,20,21,22):
  bonds.push(bond(16, 19, 4));
  bonds.push(bond(19, 20, 4));
  bonds.push(bond(20, 21, 4));
  bonds.push(bond(21, 22, 4));
  bonds.push(bond(22, 17, 4));   // closes ring 2

  // Attach 2-naphthyl to right =C (atom 2)
  bonds.push(bond(2, 13, 1));

  return { atoms, bonds };
})();

// =C(phenyl)(phenyl) : two identical phenyls. Sanity-check that simple
// aromatic symmetric substituents are detected as CIP-equal under the new
// Kekulé enumeration.
const symmetricDiphenyl: MolGraph = {
  atoms: [
    atom(0, 'C'), atom(1, 'C'), atom(2, 'C'),
    atom(3, 'C'), atom(4, 'C'), atom(5, 'C'),
    atom(6, 'C'), atom(7, 'C'), atom(8, 'C'),
    atom(9, 'C'), atom(10, 'C'), atom(11, 'C'),
    atom(12, 'C'), atom(13, 'C'), atom(14, 'C'),
  ],
  bonds: [
    bond(0, 1, 1), bond(1, 2, 2),
    bond(2, 3, 1),
    bond(3, 4, 4), bond(4, 5, 4), bond(5, 6, 4),
    bond(6, 7, 4), bond(7, 8, 4), bond(8, 3, 4),
    bond(2, 9, 1),
    bond(9, 10, 4), bond(10, 11, 4), bond(11, 12, 4),
    bond(12, 13, 4), bond(13, 14, 4), bond(14, 9, 4),
  ],
};

// =C(1-naphthyl)(1-naphthyl) : both substituents identical (both alpha).
// Used to confirm symmetric aromatic substituents are NOT stereogenic.
const symmetricAlphaNaphthyl: MolGraph = (() => {
  const atoms: MolGraph['atoms'] = [];
  const bonds: MolGraph['bonds'] = [];
  atoms.push(atom(0, 'C'), atom(1, 'C'), atom(2, 'C'));
  bonds.push(bond(0, 1, 1));
  bonds.push(bond(1, 2, 2));

  // First 1-naphthyl (atoms 3..12) : same wiring as before.
  for (let i = 3; i <= 12; i++) atoms.push(atom(i, 'C'));
  bonds.push(bond(3, 4, 4), bond(4, 5, 4), bond(5, 6, 4),
             bond(6, 7, 4), bond(7, 8, 4), bond(8, 3, 4));
  bonds.push(bond(5, 9, 4), bond(9, 10, 4), bond(10, 11, 4),
             bond(11, 12, 4), bond(12, 4, 4));
  bonds.push(bond(2, 3, 1));

  // Second 1-naphthyl (atoms 13..22) : same internal wiring, attached
  // alpha (atom 13 is alpha, atom 14 is its ring junction neighbour).
  for (let i = 13; i <= 22; i++) atoms.push(atom(i, 'C'));
  bonds.push(bond(13, 14, 4), bond(14, 15, 4), bond(15, 16, 4),
             bond(16, 17, 4), bond(17, 18, 4), bond(18, 13, 4));
  bonds.push(bond(15, 19, 4), bond(19, 20, 4), bond(20, 21, 4),
             bond(21, 22, 4), bond(22, 14, 4));
  bonds.push(bond(2, 13, 1));

  return { atoms, bonds };
})();

// countStereoSlashes

describe('countStereoSlashes', () => {
  it('returns 0 for SMILES with no slashes', () => {
    expect(countStereoSlashes('CC')).toBe(0);
    expect(countStereoSlashes('C(=O)O')).toBe(0);
  });

  it('counts / and \\ in simple SMILES', () => {
    expect(countStereoSlashes('C/C=C/C')).toBe(2);
    expect(countStereoSlashes('C/C=C\\C')).toBe(2);
  });

  it('ignores slashes inside bracket atoms', () => {
    expect(countStereoSlashes('[C/H]C=CC')).toBe(0);
  });

  it('handles mixed bracket and bond slashes', () => {
    expect(countStereoSlashes('[C@@H](/C)=C\\C')).toBe(2);
  });
});

// findStereogenicDoubleBonds

describe('findStereogenicDoubleBonds', () => {
  // Simple cases: building intuition for the basic rules.
  describe('basic cases', () => {
    it('returns empty for molecules without a C=C', () => {
      expect(findStereogenicDoubleBonds(methane)).toEqual([]);
      expect(findStereogenicDoubleBonds(ethane)).toEqual([]);
    });

    it('returns empty for ethene (C=C with no substituents)', () => {
      expect(findStereogenicDoubleBonds(ethene)).toEqual([]);
    });

    it('returns empty for propene (one side is terminal =CH2)', () => {
      expect(findStereogenicDoubleBonds(propene)).toEqual([]);
    });

    it('finds the stereogenic bond in 2-butene CC=CC', () => {
      const result = findStereogenicDoubleBonds(butene);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });

    it('reports two independent stereogenic bonds in 2,4-hexadiene', () => {
      const result = findStereogenicDoubleBonds(hexadiene);
      expect(result.length).toBe(2);
      expect(result).toEqual(
        expect.arrayContaining([
          { atomA: 1, atomB: 2 },
          { atomA: 3, atomB: 4 },
        ]),
      );
    });
  });

  // Bonds that should always be excluded.
  describe('ring and special-bond exclusions', () => {
    it('skips ring double bonds (cyclohexene)', () => {
      expect(findStereogenicDoubleBonds(cyclohexene)).toEqual([]);
    });

    it('ignores C=O carbonyl bonds (acetone)', () => {
      expect(findStereogenicDoubleBonds(acetone)).toEqual([]);
    });

    it('does not flag allenes/cumulated dienes as cis/trans', () => {
      // Outer carbons of C=C=C are =CH2 (no heavy substituents).
      // Axial chirality of allenes is a separate phenomenon we do not model.
      expect(findStereogenicDoubleBonds(allene)).toEqual([]);
    });
  });

  // Substituent comparison: cases solvable with shell-1 inspection.
  describe('substituent comparison (shell 1)', () => {
    it('rejects =C with two identical substituents (dichloroethene)', () => {
      expect(findStereogenicDoubleBonds(dichloroethene)).toEqual([]);
    });

    it('detects the CC=C(C)O regression : methyl vs hydroxyl', () => {
      // Bug report: isopropenol + methyl -> CC=C(C)O.
      const result = findStereogenicDoubleBonds(isopropenolPlusMethyl);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });

    it('detects crotonic acid CH3-CH=CH-COOH', () => {
      const result = findStereogenicDoubleBonds(crotonicAcid);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });

    it('detects methyl-vs-phenyl substituents (regression)', () => {
      // α-methylstyrene + ethyl -> CCC=C(C)c1ccccc1. Both right-side atoms
      // are 'C' at shell 0, but at shell 1 the phenyl-C has 2 ring neighbours
      // while the methyl-C has none.
      const result = findStereogenicDoubleBonds(aMethylStyreneWithEthyl);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 2, atomB: 3 });
    });
  });

  // CIP-driven detection: cases where atom-symbol equality at shell 1 fools
  // simpler heuristics. Each requires sphere-deep comparison or phantom
  // atoms from multi-bonds.
  describe('CIP-distinguishable substituents', () => {
    it('separates ethyl from chloromethyl (shell-2 heteroatom)', () => {
      // =C(CH2-CH3)(CH2-Cl): immediate atoms are both 'C:1'. CIP needs to
      // look one more shell out to see Cl (Z=17) vs C (Z=6) and rank them.
      const result = findStereogenicDoubleBonds(ethylVsChloromethyl);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });

    it('separates vinyl from ethyl (multi-bond phantom)', () => {
      // =C(CH=CH2)(CH2-CH3): without CIP's phantom-atom rule, vinyl and
      // ethyl both look like 'a C with one C neighbour'. The double-bond
      // duplicate atom gives vinyl an extra entry at shell 1.
      const result = findStereogenicDoubleBonds(vinylVsEthyl);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });

    it('separates methoxymethyl from ethyl (shell-1 heteroatom)', () => {
      // =C(CH2-OMe)(CH2-CH3): immediate atoms are both CH2 carbons. At
      // shell 1 the methoxymethyl has an O (Z=8) where ethyl has a C (Z=6).
      const result = findStereogenicDoubleBonds(methoxymethylVsEthyl);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });

    it('separates phenyl from cyclohexyl (aromatic phantoms)', () => {
      // Both substituents attach via a ring carbon. Aromatic bonds contribute
      // phantom atoms (treated as multiplicity 2 here), so phenyl's attachment
      // C exposes more atoms at shell 1 than cyclohexyl's.
      const result = findStereogenicDoubleBonds(phenylVsCyclohexyl);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });

    it('rejects geminal-symmetric =C(CH3)(CH3) : substituents identical', () => {
      // CIP must conclude "tied", and the bond must NOT be reported as stereogenic.
      expect(findStereogenicDoubleBonds(geminalDimethyl)).toEqual([]);
    });

    it('separates propargyl from ethyl (triple-bond phantoms)', () => {
      // -CH2-C#CH vs -CH2-CH3. At shell 1 both look like a single C.
      // At shell 2: propargyl's sp carbon contributes 1 real + 2 phantoms
      // (triple bond -> mult = 3 -> 2 phantoms), while ethyl's CH2 contributes
      // 1 real C only. CIP correctly separates them.
      const result = findStereogenicDoubleBonds(propargylVsEthyl);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });

    it('separates difluoromethyl from methyl (shell-1 halogens)', () => {
      // -CHF2 vs -CH3. The difluoro carbon's shell 1 = [F, F] (Z=9 twice)
      // while methyl's shell 1 is empty. Trivial separation but exercises
      // halogen lookup in the atomic-number table.
      const result = findStereogenicDoubleBonds(difluoromethylVsMethyl);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });

    it('separates substituents that differ only at shell 3', () => {
      // -CH2-CH2-Cl vs -CH2-CH2-CH3. Both shell 1 and shell 2 are "a C atom",
      // they only diverge at shell 3 (Cl vs C). CIP must recurse that deep.
      const result = findStereogenicDoubleBonds(shell3Difference);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });

    it('separates amine (NH2) from hydroxyl (OH) : heteroatoms at shell 0', () => {
      // Substituent atoms themselves differ: N (Z=7) vs O (Z=8). CIP returns
      // the comparison at sphere 0 immediately.
      const result = findStereogenicDoubleBonds(amineVsHydroxyl);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });

    it('separates aldehyde (CHO) from acetyl (-C(=O)CH3) : shell-2 difference', () => {
      // Both substituent carbons see [O, O-phantom, X] at shell 1. For CHO,
      // X is "nothing" (implicit H = absent in graph -> atomic number 0). For
      // acetyl, X is C (methyl). CIP picks acetyl as higher priority.
      const result = findStereogenicDoubleBonds(aldehydeVsAcetyl);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });
  });

  // Aromatic substituents encoded with type-4 bonds. These exercise the
  // Kekulé enumeration path inside compareCIP : each substituent's CIP
  // profile is maximised across all valid Kekulé tautomers before the two
  // are compared.
  describe('aromatic substituents (Kekulé enumeration)', () => {
    it('treats two phenyl substituents as identical (symmetric)', () => {
      // Simple single-ring aromatic symmetry check.
      expect(findStereogenicDoubleBonds(symmetricDiphenyl)).toEqual([]);
    });

    it('treats two 1-naphthyl substituents as identical (symmetric)', () => {
      // Both sides of the =C are 1-naphthyl (alpha-attached). CIP must
      // collapse to "equal" so the bond is NOT reported as stereogenic.
      expect(findStereogenicDoubleBonds(symmetricAlphaNaphthyl)).toEqual([]);
    });

    it('distinguishes 1-naphthyl from 2-naphthyl (alpha vs beta attachment)', () => {
      // The two naphthyl substituents have identical atom composition but
      // different attachment topology relative to the ring junction. CIP
      // surfaces the difference via the junction's degree-3 connectivity
      // (visible by sphere 2 regardless of Kekulé form). The Kekulé pass
      // ensures the comparison uses real single/double bonds, not the old
      // mult-2 approximation.
      const result = findStereogenicDoubleBonds(alphaVsBetaNaphthyl);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({ atomA: 1, atomB: 2 });
    });
  });
});

// enumerateKekuleForms (exported for testability)

describe('enumerateKekuleForms', () => {
  it('returns a single empty form for graphs with no aromatic bonds', () => {
    const forms = enumerateKekuleForms(ethane);
    expect(forms).toHaveLength(1);
    expect(forms[0].size).toBe(0);
  });

  it('returns 2 Kekulé tautomers for benzene', () => {
    // The two equivalent rotations of the alternating-double-bond pattern.
    const forms = enumerateKekuleForms(benzeneAromatic);
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      // Each aromatic bond got assigned 1 or 2
      expect(form.size).toBe(6);
      let doubles = 0;
      for (const v of form.values()) if (v === 2) doubles++;
      expect(doubles).toBe(3);   // half the bonds are double in any Kekulé
    }
  });

  it('returns 3 Kekulé tautomers for naphthalene', () => {
    // Three distinct double-bond placements: two "outer-only" forms (one
    // per outer ring) plus the form with the fusion bond as a double.
    const forms = enumerateKekuleForms(naphthaleneAromatic);
    expect(forms).toHaveLength(3);
    for (const form of forms) {
      expect(form.size).toBe(11);
      let doubles = 0;
      for (const v of form.values()) if (v === 2) doubles++;
      expect(doubles).toBe(5);
    }
  });

  it('returns 1 Kekulé tautomer for furan (O cannot accept a double)', () => {
    // The O contributes its lone pair, so both O-C aromatic bonds stay
    // single. The C=C double bonds are forced into a unique placement.
    const forms = enumerateKekuleForms(furanAromatic);
    expect(forms).toHaveLength(1);
    for (const form of forms) {
      let doubles = 0;
      for (const v of form.values()) if (v === 2) doubles++;
      expect(doubles).toBe(2);
    }
  });

  it('returns 1 Kekulé tautomer for imidazole (NH locks the matching)', () => {
    // 1H-imidazole has only one way to place the two C=C double bonds: the
    // pyrrole-NH (N1) sits out of the matching, the pyridine-N (N3) must be
    // doubled to the central C2 : leaves only C4=C5.
    const forms = enumerateKekuleForms(imidazoleAromatic);
    expect(forms).toHaveLength(1);
    let doubles = 0;
    for (const v of forms[0].values()) if (v === 2) doubles++;
    expect(doubles).toBe(2);
  });

  it('returns 2 Kekulé tautomers for pyrylium (cationic O+ participates)', () => {
    // O+ has effective valence 3, so it must participate in a ring double
    // bond. The 6-ring then has the same matching shape as benzene.
    const forms = enumerateKekuleForms(pyryliumAromatic);
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      let doubles = 0;
      for (const v of form.values()) if (v === 2) doubles++;
      expect(doubles).toBe(3);
    }
  });

  it('returns 2 Kekulé tautomers for thiopyrylium (S+ analogue of pyrylium)', () => {
    const forms = enumerateKekuleForms(thiopyryliumAromatic);
    expect(forms).toHaveLength(2);
  });

  it('returns 2 Kekulé tautomers for N-methylpyridinium (charged N+ with alkyl)', () => {
    // The N+ carries an exocyclic methyl, so the older "no-non-aromatic-bond"
    // rule would have classed it as pyrrole-style. The charge-aware rule
    // correctly marks it as needing a ring double bond.
    const forms = enumerateKekuleForms(nMethylPyridinium);
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      let doubles = 0;
      for (const v of form.values()) if (v === 2) doubles++;
      expect(doubles).toBe(3);
    }
  });

  it('returns 1 Kekulé tautomer for selenophene (Se behaves like S/O)', () => {
    // Group-16 heavier chalcogen, lone-pair donor. Same shape as furan.
    const forms = enumerateKekuleForms(selenopheneAromatic);
    expect(forms).toHaveLength(1);
  });

  it('returns 2 Kekulé tautomers for phosphabenzene (P behaves like N pyridine)', () => {
    // Group-15 heavier pnictogen, neutral with no non-aromatic bond, acts
    // like a pyridine nitrogen.
    const forms = enumerateKekuleForms(phosphabenzeneAromatic);
    expect(forms).toHaveLength(2);
  });

  it('enumerates 9 forms for a molecule containing two independent naphthyl groups', () => {
    // Two disconnected aromatic systems (joined only by non-aromatic single
    // bonds) should produce the Cartesian product of their individual forms.
    const forms = enumerateKekuleForms(symmetricAlphaNaphthyl);
    expect(forms).toHaveLength(9);
  });

  it('returns 2 Kekulé tautomers for pyridine (N participates like a C)', () => {
    // Pyridine N has no non-aromatic explicit bond and so needs one
    // aromatic double bond, giving it the same matching shape as benzene.
    const forms = enumerateKekuleForms(pyridineAromatic);
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      let doubles = 0;
      for (const v of form.values()) if (v === 2) doubles++;
      expect(doubles).toBe(3);
    }
  });
});

// detectNewStereoBonds

describe('detectNewStereoBonds', () => {
  // Basic flow: counting before/after and reusing existing annotations.
  describe('basic flow', () => {
    it('returns empty when no new stereogenic bonds were created', () => {
      const res = detectNewStereoBonds(methane, methane, ethane, 'CC');
      expect(res.bonds).toEqual([]);
      expect(res.smiles).toBe('CC');
    });

    it('detects a new stereogenic bond in 2-butene formed from two ethanes', () => {
      const res = detectNewStereoBonds(ethane, ethane, butene, 'CC=CC');
      expect(res.bonds.length).toBe(1);
    });

    it('reuses existing slashes when merged SMILES already has them', () => {
      const res = detectNewStereoBonds(ethane, ethane, butene, 'C/C=C/C');
      expect(res.bonds.length).toBe(1);
      expect(res.bonds[0].currentConfig).toBe('trans');
      expect(res.smiles).toBe('C/C=C/C'); // unchanged
    });
  });

  // Slash insertion when RDKit's canonical SMILES omits stereo annotations.
  describe('default slash insertion when SMILES lacks them', () => {
    it('inserts default trans slashes for the CC=C(C)O regression', () => {
      const res = detectNewStereoBonds(
        isopropenol, methane, isopropenolPlusMethyl, 'CC=C(C)O',
      );
      expect(res.bonds.length).toBe(1);
      expect(res.bonds[0].currentConfig).toBe('trans');
      expect(countStereoSlashes(res.smiles)).toBe(2);

      const cisSmiles = applyStereoChoice(res.smiles, res.bonds[0], 'cis');
      expect(countStereoSlashes(cisSmiles)).toBe(2);
      expect(cisSmiles).toContain('/');
      expect(cisSmiles).toContain('\\');
    });

    it('fires for the phenyl-vs-methyl styrene regression', () => {
      const res = detectNewStereoBonds(
        aMethylStyrene, ethane, aMethylStyreneWithEthyl,
        'CCC=C(C)c1ccccc1',
      );
      expect(res.bonds.length).toBe(1);
      expect(countStereoSlashes(res.smiles)).toBeGreaterThanOrEqual(2);
    });

    it('targets the C=C and not a neighbouring C=O', () => {
      // Merge of methyl + acrylic-acid-like fragment producing crotonic acid.
      // SMILES `CC=CC(=O)O` has two `=` symbols (positions 2 and 6); the C=O
      // must NOT be the slash anchor. Earlier versions silently picked the
      // wrong `=` and `insertDefaultStereoSlashes` returned null, suppressing
      // the dialog entirely.
      const res = detectNewStereoBonds(methane, methane, crotonicAcid, 'CC=CC(=O)O');
      expect(res.bonds.length).toBe(1);

      const eqPositions: number[] = [];
      let depth = 0;
      for (let i = 0; i < res.smiles.length; i++) {
        const c = res.smiles[i];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '=' && depth === 0) eqPositions.push(i);
      }
      expect(eqPositions.length).toBe(2);
      // The slash must sit between the C=C `=` and the C=O `=`, never after
      // both of them.
      expect(res.bonds[0].slashPosition).toBeGreaterThan(eqPositions[0]);
      expect(res.bonds[0].slashPosition).toBeLessThan(eqPositions[1]);
    });
  });


  // Merges where CIP-aware substituent comparison changes the outcome.
  // Without full CIP these would have been silently dropped.
  describe('CIP-driven merge detection', () => {
    it('fires for ethyl-vs-chloromethyl merge (shell-2 heteroatom)', () => {
      const res = detectNewStereoBonds(
        methane, methane, ethylVsChloromethyl, 'CC=C(CC)CCl',
      );
      expect(res.bonds.length).toBe(1);
      expect(countStereoSlashes(res.smiles)).toBeGreaterThanOrEqual(2);
    });

    it('fires for vinyl-vs-ethyl merge (multi-bond phantom)', () => {
      const res = detectNewStereoBonds(
        methane, methane, vinylVsEthyl, 'CC=C(C=C)CC',
      );
      expect(res.bonds.length).toBe(1);
    });

    it('fires for methoxymethyl-vs-ethyl merge', () => {
      const res = detectNewStereoBonds(
        methane, methane, methoxymethylVsEthyl, 'CC=C(COC)CC',
      );
      expect(res.bonds.length).toBe(1);
    });

    it('fires for propargyl-vs-ethyl merge (triple-bond phantoms)', () => {
      const res = detectNewStereoBonds(
        methane, methane, propargylVsEthyl, 'CC=C(CC#C)CC',
      );
      expect(res.bonds.length).toBe(1);
    });

    it('fires for aldehyde-vs-acetyl merge (shell-2 difference)', () => {
      const res = detectNewStereoBonds(
        methane, methane, aldehydeVsAcetyl, 'CC=C(C=O)C(C)=O',
      );
      expect(res.bonds.length).toBe(1);
    });

    it('fires for shell-3 difference merge (-CH2CH2Cl vs -CH2CH2CH3)', () => {
      const res = detectNewStereoBonds(
        methane, methane, shell3Difference, 'CC=C(CCCl)CCC',
      );
      expect(res.bonds.length).toBe(1);
    });
  });

  // Edge cases: situations that have historically slipped past simpler
  // implementations. Each documents either a correct behaviour to preserve
  // or a known limitation to address.
  describe('edge cases', () => {
    it('does not fire for geminal-symmetric merges (no real stereogenicity)', () => {
      // =C(CH3)(CH3) is symmetric on the right side : bond is not stereogenic.
      // A merge that produces this should NOT pop up a dialog.
      const res = detectNewStereoBonds(
        methane, methane, geminalDimethyl, 'CC=C(C)C',
      );
      expect(res.bonds).toEqual([]);
    });

    it('does not fire when the merge destroys an existing stereogenic bond', () => {
      // Inputs: 2-butene (1 stereogenic) + methane (0). Merge attaches a
      // methyl to the inner carbon of butene -> gem-disubstituted alkene
      // 2-methyl-2-butene CC=C(C)C, which is NOT stereogenic. The count
      // diff is negative; the dialog must not appear.
      const res = detectNewStereoBonds(
        butene, methane, geminalDimethyl, 'CC=C(C)C',
      );
      expect(res.bonds).toEqual([]);
    });

    it('fires for a conjugated-diene merge that creates two stereogenic bonds', () => {
      // Two non-stereogenic inputs (methane, methane) -> 2,4-hexadiene with
      // TWO new stereogenic bonds. The dialog should expose both for the
      // student to configure independently. Tests the multi-bond code path
      // including any shared-edge handling between adjacent =.
      const res = detectNewStereoBonds(
        methane, methane, hexadiene, 'CC=CC=CC',
      );
      expect(res.bonds.length).toBe(2);
    });

    it('preserves an existing stereo bond when a non-stereo extension is merged', () => {
      // Input1: 2-butene (1 stereo bond, slashes preserved in canonical SMILES).
      // Input2: methane. Merge -> 2-pentene CCC=CC (1 stereo bond).
      // newCount = 0 -> no new dialog should fire (the butene stereo is
      // preserved through canonicalization).
      const pentene: MolGraph = {                          // CCC=CC, 2-pentene
        atoms: [atom(0, 'C'), atom(1, 'C'), atom(2, 'C'), atom(3, 'C'), atom(4, 'C')],
        bonds: [bond(0, 1, 1), bond(1, 2, 1), bond(2, 3, 2), bond(3, 4, 1)],
      };
      const res = detectNewStereoBonds(butene, methane, pentene, 'C/CC=C/C');
      expect(res.bonds).toEqual([]);
    });

    it('handles bracket atoms in canonical SMILES', () => {
      // Some canonical SMILES from RDKit include explicit-H bracket atoms
      // like [CH3] for atoms with non-default valence or charge. Verify the
      // SMILES walker counts bracket atoms correctly so the `=` -> bond
      // mapping stays in sync with the MolGraph.
      const res = detectNewStereoBonds(
        methane, methane, butene, '[CH3]C=C[CH3]',
      );
      expect(res.bonds.length).toBe(1);
    });
  });
});

// Atom-map-driven bond identification
//
// After `mergeAtAtoms` tags atom origins (1/2 = source/target side,
// 3/4 = merge endpoints), `detectNewStereoBonds` uses the tags to pick the
// newly stereogenic bond rather than relying on a count-difference
// heuristic. These tests verify that path with hand-built mergedGraphs that
// carry mapNumbers as RDKit's canonical round-trip would.

describe('detectNewStereoBonds — merge-tag-based identification', () => {
  // Helper: clone the fixture and set per-atom mapNumbers to simulate the
  // result of `mergeAtAtoms` flowing through RDKit's canonical SMILES.
  function withMapNumbers(g: MolGraph, mapBySymbolIdx: number[]): MolGraph {
    return {
      atoms: g.atoms.map((a, i) => ({ ...a, mapNumber: mapBySymbolIdx[i] })),
      bonds: g.bonds,
    };
  }

  it('picks the bond touching a merge endpoint over a preserved one', () => {
    // 2,4-hexadiene CC=CC=CC has TWO stereogenic C=C. Pretend the merge
    // joined the left half of the chain (atoms 0..2) with the right half
    // (atoms 3..5), so bond 1-2 contains a merge endpoint (atom 2 = mapNum 3)
    // and bond 3-4 contains the other endpoint (atom 3 = mapNum 4).
    //
    // The merged SMILES `CC=C/C=C/C` has slashes around the 3-4 bond
    // (preserved from the right-hand input), but none around 1-2.
    // The new algorithm must pick BOTH (both touch merge endpoints), and
    // crucially the 1-2 bond must come out with freshly-inserted slashes
    // rather than being silently skipped.
    const merged = withMapNumbers(hexadiene, [1, 1, 3, 4, 2, 2]);
    const res = detectNewStereoBonds(methane, methane, merged, 'CC=C/C=C/C');

    expect(res.bonds.length).toBe(2);
    expect(countStereoSlashes(res.smiles)).toBeGreaterThanOrEqual(3);
  });

  it('ignores a stereogenic bond that does not touch a merge endpoint', () => {
    // Same hexadiene fixture but tag both endpoints far away from atoms 1-4
    // (mark only atom 5 as a merge endpoint). Neither stereogenic bond
    // touches it, so detection should report no new bonds.
    const merged = withMapNumbers(hexadiene, [1, 1, 1, 1, 1, 3]);
    const res = detectNewStereoBonds(methane, methane, merged, 'CC=CC=CC');
    expect(res.bonds).toEqual([]);
  });

  it('falls back to the count-based heuristic when no merge tags are present', () => {
    // Graphs with no mapNumber on any atom (the case for hand-built fixtures
    // throughout the rest of this suite) must still trigger detection
    const res = detectNewStereoBonds(methane, methane, butene, 'CC=CC');
    expect(res.bonds.length).toBe(1);
  });

  it('strips atom-map numbers from the returned SMILES', () => {
    // RDKit emits canonical SMILES with `[C:N]` syntax when atom-map numbers
    // are present. `detectNewStereoBonds` must clean those out so the dialog
    // and storage never see them.
    const merged = withMapNumbers(butene, [1, 1, 3, 4]);
    const res = detectNewStereoBonds(
      methane, methane, merged, '[CH3:1][CH:1]=[CH:3][CH3:4]',
    );
    expect(res.smiles).not.toContain(':1');
    expect(res.smiles).not.toContain(':3');
    expect(res.smiles).not.toContain(':4');
    expect(res.bonds.length).toBe(1);
  });
});

// stripMapNumbersFromSmiles

describe('stripMapNumbersFromSmiles', () => {
  it('removes `:N` map suffixes from inside bracket atoms', () => {
    expect(stripMapNumbersFromSmiles('[CH3:1][CH:3]=[CH2:4]')).toBe('[CH3][CH]=[CH2]');
  });

  it('leaves bracket atoms untouched when no map number is present', () => {
    expect(stripMapNumbersFromSmiles('[NH4+]')).toBe('[NH4+]');
  });

  it('does not strip aromatic bond `:` between atoms (outside brackets)', () => {
    // `:` outside `[...]` is the aromatic-bond marker; it must survive intact.
    expect(stripMapNumbersFromSmiles('c1ccccc1')).toBe('c1ccccc1');
  });

  it('preserves slash characters and atom counts', () => {
    // Slashes are outside brackets and at directional-bond positions; the
    // strip must not touch them or the relative positions between them.
    const input = 'C/[CH:3]=[CH:4]/C';
    const out = stripMapNumbersFromSmiles(input);
    expect(out).toBe('C/[CH]=[CH]/C');
  });

  it('handles a SMILES with no map numbers as a no-op', () => {
    expect(stripMapNumbersFromSmiles('CC=CC')).toBe('CC=CC');
  });
});

// applyStereoChoice

describe('applyStereoChoice', () => {
  it('returns unchanged SMILES when choice matches current config', () => {
    const res = detectNewStereoBonds(ethane, ethane, butene, 'C/C=C/C');
    const out = applyStereoChoice('C/C=C/C', res.bonds[0], 'trans');
    expect(out).toBe('C/C=C/C');
  });

  it('flips trans to cis', () => {
    const res = detectNewStereoBonds(ethane, ethane, butene, 'C/C=C/C');
    const out = applyStereoChoice('C/C=C/C', res.bonds[0], 'cis');
    expect(out).toBe('C/C=C\\C');
  });

  it('flips cis to trans', () => {
    const res = detectNewStereoBonds(ethane, ethane, butene, 'C/C=C\\C');
    expect(res.bonds[0].currentConfig).toBe('cis');
    const out = applyStereoChoice('C/C=C\\C', res.bonds[0], 'trans');
    expect(out).toBe('C/C=C/C');
  });
});

// insertDefaultStereoSlashes

describe('insertDefaultStereoSlashes', () => {
  it('inserts slashes around a simple double bond', () => {
    const out = insertDefaultStereoSlashes('CC=CC', 2);
    expect(out).not.toBeNull();
    expect(out!.smiles).toBe('C/C=C/C');
    expect(out!.currentConfig).toBe('trans');
  });

  it('inserts slashes into a SMILES with a branch after the double bond', () => {
    const out = insertDefaultStereoSlashes('CC=C(C)O', 2);
    expect(out).not.toBeNull();
    expect(countStereoSlashes(out!.smiles)).toBe(2);
    expect(out!.currentConfig).toBe('trans');
  });

  it('returns null when there is no atom to the left of the double bond', () => {
    const out = insertDefaultStereoSlashes('=CC', 0);
    expect(out).toBeNull();
  });
});
