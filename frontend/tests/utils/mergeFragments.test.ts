import { describe, it, expect } from 'vitest';
import { mergeAtAtoms } from '../../src/utils/mergeFragments';
import { parseMolBlock, molGraphToMolBlock } from '../../src/utils/molParser';

// C with one explicit H
const C_WITH_H = [
  '', '  test', '',
  '  2  1  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    1.5000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  1  0  0  0  0',
  'M  END',
].join('\n');

// Simple C (no bonds: implicit H)
const BARE_C = [
  '', '  test', '',
  '  1  0  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  'M  END',
].join('\n');

// C-C (ethane backbone, no explicit H)
const CC = [
  '', '  test', '',
  '  2  1  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  1  0  0  0  0',
  'M  END',
].join('\n');

describe('mergeAtAtoms', () => {
  it('bonds two bare C atoms -> C-C with 1 bond', () => {
    const gA = parseMolBlock(BARE_C);
    const gB = parseMolBlock(BARE_C);

    const merged = mergeAtAtoms(gA, 0, gB, 0);

    expect(merged.atoms).toHaveLength(2);
    expect(merged.bonds).toHaveLength(1);
    expect(merged.atoms.every((a) => a.symbol === 'C')).toBe(true);
  });

  it('removes explicit H when bonding C-H + C-H -> C-C', () => {
    const gA = parseMolBlock(C_WITH_H);
    const gB = parseMolBlock(C_WITH_H);

    // Bond the two C atoms (index 0 in each)
    const merged = mergeAtAtoms(gA, 0, gB, 0);

    // Each had 1 C + 1 H, remove one H from each -> 2 atoms remain
    expect(merged.atoms).toHaveLength(2);
    expect(merged.atoms.every((a) => a.symbol === 'C')).toBe(true);
    expect(merged.bonds).toHaveLength(1);
  });

  it('bonds C-C + C -> C-C-C (propane backbone)', () => {
    const gA = parseMolBlock(CC);
    const gB = parseMolBlock(BARE_C);

    // Bond the second C of CC (index 1) to the bare C (index 0)
    const merged = mergeAtAtoms(gA, 1, gB, 0);

    expect(merged.atoms).toHaveLength(3);
    expect(merged.bonds).toHaveLength(2);
    expect(merged.atoms.every((a) => a.symbol === 'C')).toBe(true);
  });

  it('produces valid roundtrip MOL block', () => {
    const gA = parseMolBlock(CC);
    const gB = parseMolBlock(BARE_C);

    const merged = mergeAtAtoms(gA, 0, gB, 0);
    const molBlock = molGraphToMolBlock(merged);

    const reparsed = parseMolBlock(molBlock);
    expect(reparsed.atoms).toHaveLength(3);
    expect(reparsed.bonds).toHaveLength(2);
  });

  /**
   * Additional EP/BVA tests for mergeAtAtoms:
   *
   * EC: Merge when neither atom has explicit H (no H removal)
   * EC: Merge preserves existing double bond types
   * BVA: Single-atom + single-atom (minimal possible merge)
   * BVA: Coordinate offset is applied correctly
   */

  it('merges without H removal when no explicit H exists', () => {
    // CC has no explicit H atoms, so merging should not remove anything
    const gA = parseMolBlock(CC);
    const gB = parseMolBlock(CC);

    // Bond second C of gA (index 1) to first C of gB (index 0)
    const merged = mergeAtAtoms(gA, 1, gB, 0);

    // Should have all 4 atoms (2 + 2) and 3 bonds (1 + 1 + 1 new)
    expect(merged.atoms).toHaveLength(4);
    expect(merged.bonds).toHaveLength(3);
    expect(merged.atoms.every((a) => a.symbol === 'C')).toBe(true);
  });

  it('preserves double bond type when merging', () => {
    // C=C (ethene with explicit double bond)
    const DOUBLE_BOND = [
      '', '  test', '',
      '  2  1  0  0  0  0  0  0  0  0999 V2000',
      '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
      '    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
      '  1  2  2  0  0  0  0',
      'M  END',
    ].join('\n');

    const gA = parseMolBlock(DOUBLE_BOND);
    const gB = parseMolBlock(BARE_C);

    const merged = mergeAtAtoms(gA, 1, gB, 0);

    // Original double bond should still be type 2
    const doubleBond = merged.bonds.find((b) => b.type === 2);
    expect(doubleBond).toBeDefined();
    // The new bond between the two merge atoms should be type 1 (single)
    const newBond = merged.bonds.find((b) => b.type === 1);
    expect(newBond).toBeDefined();
  });

  it('offsets graphB coordinates relative to graphA merge atom', () => {
    const gA = parseMolBlock(BARE_C);
    const gB = parseMolBlock(BARE_C);

    const merged = mergeAtAtoms(gA, 0, gB, 0);

    // atomA is at x=0, so atomB should be offset to x ≈ 1.5
    expect(merged.atoms[1].x).toBeCloseTo(1.5);
    // Y should be the same (both were 0)
    expect(merged.atoms[1].y).toBeCloseTo(0);
  });

  it('tags atoms with origin and endpoint mapNumbers', () => {
    // Verifies the atom-map tagging that `detectNewStereoBonds` relies on to
    // distinguish a newly-stereogenic bond from a preserved one.
    const gA = parseMolBlock(CC);  // 2 atoms from A
    const gB = parseMolBlock(CC);  // 2 atoms from B

    // Merge gA atom 1 to gB atom 0 -> endpoints get map 3 / 4, non-endpoints 1 / 2.
    const merged = mergeAtAtoms(gA, 1, gB, 0);

    expect(merged.atoms).toHaveLength(4);
    expect(merged.atoms[0].mapNumber).toBe(1); // gA non-endpoint
    expect(merged.atoms[1].mapNumber).toBe(3); // gA endpoint
    expect(merged.atoms[2].mapNumber).toBe(4); // gB endpoint
    expect(merged.atoms[3].mapNumber).toBe(2); // gB non-endpoint
  });

  it('clears stale mapNumber tags from a prior merge before re-tagging', () => {
    // Simulate a fragment that came from an earlier merge: pre-existing maps
    // on the input atoms. These should not survive into the new merge result.
    const gA = parseMolBlock(CC);
    const gB = parseMolBlock(CC);
    gA.atoms[0].mapNumber = 3;
    gA.atoms[1].mapNumber = 1;
    gB.atoms[0].mapNumber = 4;
    gB.atoms[1].mapNumber = 2;

    const merged = mergeAtAtoms(gA, 0, gB, 1);

    // Endpoint atoms should be re-tagged 3 and 4 according to THIS merge,
    // and non-endpoints should be tagged 1 and 2 (not whatever they were before).
    expect(merged.atoms[0].mapNumber).toBe(3);
    expect(merged.atoms[1].mapNumber).toBe(1);
    expect(merged.atoms[2].mapNumber).toBe(2);
    expect(merged.atoms[3].mapNumber).toBe(4);
  });

  it('handles merging with H and preserves non-H neighbors', () => {
    // C with two explicit H atoms
    const C_WITH_TWO_H = [
      '', '  test', '',
      '  3  2  0  0  0  0  0  0  0  0999 V2000',
      '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
      '    1.5000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
      '    0.0000    1.5000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
      '  1  2  1  0  0  0  0',
      '  1  3  1  0  0  0  0',
      'M  END',
    ].join('\n');

    const gA = parseMolBlock(C_WITH_TWO_H);
    const gB = parseMolBlock(BARE_C);

    const merged = mergeAtAtoms(gA, 0, gB, 0);

    // Should remove only 1 H from gA, keeping 1 H + 1 C from gA + 1 C from gB = 3 atoms
    expect(merged.atoms).toHaveLength(3);
    expect(merged.atoms.filter((a) => a.symbol === 'H')).toHaveLength(1);
    expect(merged.atoms.filter((a) => a.symbol === 'C')).toHaveLength(2);
  });
});
