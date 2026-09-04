import { describe, it, expect } from 'vitest';
import { parseMolBlock, molGraphToMolBlock } from '../../src/utils/molParser';

// Minimal V2000 MOL block for *C (methyl with one merge point)
const STAR_METHYL_MOL = [
  '',
  '  test',
  '',
  '  2  1  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 *   0  0  0  0  0  0  0  0  0  0  0  0',
  '    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  1  0  0  0  0',
  'M  END',
].join('\n');

// MOL block for *CC* (ethyl with two merge points)
const STAR_ETHYL_STAR_MOL = [
  '',
  '  test',
  '',
  '  4  3  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 *   0  0  0  0  0  0  0  0  0  0  0  0',
  '    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    3.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    4.5000    0.0000    0.0000 *   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  1  0  0  0  0',
  '  2  3  1  0  0  0  0',
  '  3  4  1  0  0  0  0',
  'M  END',
].join('\n');

// MOL block for CC (ethane, no merge points)
const ETHANE_MOL = [
  '',
  '  test',
  '',
  '  2  1  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  1  0  0  0  0',
  'M  END',
].join('\n');

describe('parseMolBlock', () => {
  it('parses atom count and bond count', () => {
    const graph = parseMolBlock(STAR_METHYL_MOL);
    expect(graph.atoms).toHaveLength(2);
    expect(graph.bonds).toHaveLength(1);
  });

  it('parses atom symbols including *', () => {
    const graph = parseMolBlock(STAR_METHYL_MOL);
    expect(graph.atoms[0].symbol).toBe('*');
    expect(graph.atoms[1].symbol).toBe('C');
  });

  it('parses atom coordinates', () => {
    const graph = parseMolBlock(STAR_METHYL_MOL);
    expect(graph.atoms[0].x).toBeCloseTo(0);
    expect(graph.atoms[1].x).toBeCloseTo(1.5);
    expect(graph.atoms[0].y).toBeCloseTo(0);
  });

  it('uses 0-based indexing for bonds', () => {
    const graph = parseMolBlock(STAR_METHYL_MOL);
    expect(graph.bonds[0].from).toBe(0);
    expect(graph.bonds[0].to).toBe(1);
    expect(graph.bonds[0].type).toBe(1);
  });

  it('parses multiple atoms and bonds', () => {
    const graph = parseMolBlock(STAR_ETHYL_STAR_MOL);
    expect(graph.atoms).toHaveLength(4);
    expect(graph.bonds).toHaveLength(3);
    expect(graph.atoms[3].symbol).toBe('*');
  });

  it('throws on invalid MOL block', () => {
    expect(() => parseMolBlock('not a mol block')).toThrow();
  });

  /**
   * Additional EP/BVA tests:
   *
   * EC: Charged atom         -> charge field parsed correctly
   * EC: Double/triple bonds  -> bond type 2 and 3 parsed
   * BVA: 0 atoms, 0 bonds    -> empty molecule (minimum valid)
   * BVA: empty string        -> throws (below minimum)
   * BVA: missing atom lines  -> counts say N atoms but lines are absent
   */

  it('parses charged atoms correctly', () => {
    // MOL block with a carbon that has charge field = 3 (means +1 in V2000 encoding)
    const chargedMol = [
      '',
      '  test',
      '',
      '  1  0  0  0  0  0  0  0  0  0999 V2000',
      '    0.0000    0.0000    0.0000 N   0  3  0  0  0  0  0  0  0  0  0  0',
      'M  END',
    ].join('\n');
    const graph = parseMolBlock(chargedMol);
    expect(graph.atoms).toHaveLength(1);
    expect(graph.atoms[0].symbol).toBe('N');
    expect(graph.atoms[0].charge).toBe(3);
  });

  it('parses double and triple bonds', () => {
    const doubleBondMol = [
      '',
      '  test',
      '',
      '  3  2  0  0  0  0  0  0  0  0999 V2000',
      '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
      '    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
      '    3.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0',
      '  1  2  2  0  0  0  0',
      '  2  3  3  0  0  0  0',
      'M  END',
    ].join('\n');
    const graph = parseMolBlock(doubleBondMol);
    expect(graph.bonds).toHaveLength(2);
    expect(graph.bonds[0].type).toBe(2); // double bond
    expect(graph.bonds[1].type).toBe(3); // triple bond
  });

  it('parses stereo bonds', () => {
    const stereoMol = [
      '',
      '  test',
      '',
      '  2  1  0  0  0  0  0  0  0  0999 V2000',
      '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
      '    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
      '  1  2  1  1  0  0  0',
      'M  END',
    ].join('\n');
    const graph = parseMolBlock(stereoMol);
    expect(graph.bonds[0].stereo).toBe(1);
  });

  it('handles 0 atoms 0 bonds (BVA: empty molecule)', () => {
    const emptyMol = [
      '',
      '  test',
      '',
      '  0  0  0  0  0  0  0  0  0  0999 V2000',
      'M  END',
    ].join('\n');
    const graph = parseMolBlock(emptyMol);
    expect(graph.atoms).toHaveLength(0);
    expect(graph.bonds).toHaveLength(0);
  });

  it('throws on empty string (BVA: below minimum input)', () => {
    expect(() => parseMolBlock('')).toThrow();
  });

  it('throws when atom lines are missing but counts say otherwise', () => {
    const truncated = [
      '',
      '  test',
      '',
      '  5  0  0  0  0  0  0  0  0  0999 V2000',
      '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
      'M  END',
    ].join('\n');
    // Claims 5 atoms but only provides 1 atom line
    expect(() => parseMolBlock(truncated)).toThrow();
  });
});

describe('molGraphToMolBlock', () => {
  it('roundtrips: parse then reconstruct preserves structure', () => {
    const original = parseMolBlock(STAR_METHYL_MOL);
    const reconstructed = molGraphToMolBlock(original);
    const reparsed = parseMolBlock(reconstructed);

    expect(reparsed.atoms).toHaveLength(original.atoms.length);
    expect(reparsed.bonds).toHaveLength(original.bonds.length);

    for (let i = 0; i < original.atoms.length; i++) {
      expect(reparsed.atoms[i].symbol).toBe(original.atoms[i].symbol);
      expect(reparsed.atoms[i].x).toBeCloseTo(original.atoms[i].x, 3);
      expect(reparsed.atoms[i].y).toBeCloseTo(original.atoms[i].y, 3);
    }

    for (let i = 0; i < original.bonds.length; i++) {
      expect(reparsed.bonds[i].from).toBe(original.bonds[i].from);
      expect(reparsed.bonds[i].to).toBe(original.bonds[i].to);
      expect(reparsed.bonds[i].type).toBe(original.bonds[i].type);
    }
  });

  it('roundtrips a larger molecule', () => {
    const original = parseMolBlock(STAR_ETHYL_STAR_MOL);
    const reconstructed = molGraphToMolBlock(original);
    const reparsed = parseMolBlock(reconstructed);

    expect(reparsed.atoms).toHaveLength(4);
    expect(reparsed.bonds).toHaveLength(3);
    expect(reparsed.atoms[0].symbol).toBe('*');
    expect(reparsed.atoms[3].symbol).toBe('*');
  });

  it('produces M  END terminator', () => {
    const graph = parseMolBlock(ETHANE_MOL);
    const mol = molGraphToMolBlock(graph);
    expect(mol.trimEnd().endsWith('M  END')).toBe(true);
  });

  it('preserves charge through roundtrip', () => {
    const chargedMol = [
      '',
      '  test',
      '',
      '  1  0  0  0  0  0  0  0  0  0999 V2000',
      '    0.0000    0.0000    0.0000 N   0  3  0  0  0  0  0  0  0  0  0  0',
      'M  END',
    ].join('\n');
    const original = parseMolBlock(chargedMol);
    const reconstructed = molGraphToMolBlock(original);
    const reparsed = parseMolBlock(reconstructed);
    expect(reparsed.atoms[0].charge).toBe(3);
  });

  it('preserves double bond type through roundtrip', () => {
    const doubleBondMol = [
      '',
      '  test',
      '',
      '  2  1  0  0  0  0  0  0  0  0999 V2000',
      '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
      '    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
      '  1  2  2  0  0  0  0',
      'M  END',
    ].join('\n');
    const original = parseMolBlock(doubleBondMol);
    const reconstructed = molGraphToMolBlock(original);
    const reparsed = parseMolBlock(reconstructed);
    expect(reparsed.bonds[0].type).toBe(2);
  });

  it('handles empty molecule (0 atoms, 0 bonds) roundtrip', () => {
    const emptyGraph = { atoms: [], bonds: [] };
    const molBlock = molGraphToMolBlock(emptyGraph);
    const reparsed = parseMolBlock(molBlock);
    expect(reparsed.atoms).toHaveLength(0);
    expect(reparsed.bonds).toHaveLength(0);
  });

  it('preserves atom-map numbers through a roundtrip', () => {
    // V2000 atom-map field lives at cols 61-63 of the atom line. Detection
    // uses these tags to identify the merge endpoints after RDKit
    // canonicalizes the merged mol block.
    const graph = parseMolBlock(ETHANE_MOL);
    graph.atoms[0].mapNumber = 3;
    graph.atoms[1].mapNumber = 4;

    const reconstructed = molGraphToMolBlock(graph);
    const reparsed = parseMolBlock(reconstructed);
    expect(reparsed.atoms[0].mapNumber).toBe(3);
    expect(reparsed.atoms[1].mapNumber).toBe(4);
  });

  it('treats absent or zero atom-map field as undefined mapNumber', () => {
    // Lines without map tags must not produce a stray mapNumber=0, leaving
    // it undefined keeps the type contract clean and avoids polluting later
    // merges with a false "no-tag" sentinel.
    const graph = parseMolBlock(ETHANE_MOL);
    expect(graph.atoms[0].mapNumber).toBeUndefined();
    expect(graph.atoms[1].mapNumber).toBeUndefined();
  });
});
