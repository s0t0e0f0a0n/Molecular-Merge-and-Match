import { describe, expect, it } from 'vitest';

import {
  formatMissingAtoms,
  formulaToCounts,
} from '../../../src/features/solution/WorkingSolutionPanel';

describe('formulaToCounts', () => {
  it('parses molecular formulas with explicit and implicit counts', () => {
    const counts = formulaToCounts('C4H8O2');

    expect(counts.get('C')).toBe(4);
    expect(counts.get('H')).toBe(8);
    expect(counts.get('O')).toBe(2);
  });

  it('parses two-letter atom symbols', () => {
    const counts = formulaToCounts('C2H5Cl');

    expect(counts.get('C')).toBe(2);
    expect(counts.get('H')).toBe(5);
    expect(counts.get('Cl')).toBe(1);
  });
});

describe('formatMissingAtoms', () => {
  it('shows all missing atoms in a sentence', () => {
    expect(formatMissingAtoms('C4H8O2', 'C2H4O')).toBe(
      'You are still missing: \n2 C, 4 H and 1 O.',
    );
  });

  it('shows one missing atom without a list', () => {
    expect(formatMissingAtoms('C4H8O2', 'C4H8O')).toBe(
      'You are still missing: \n1 O.',
    );
  });

  it('ignores atoms that are present in excess', () => {
    expect(formatMissingAtoms('C4H8O2', 'C6H8O')).toBe(
      'You are still missing: \n1 O.',
    );
  });

  it('returns a completed message when no atoms are missing', () => {
    expect(formatMissingAtoms('C4H8O2', 'C4H8O2')).toBe(
      'You are not missing any atoms.',
    );
  });

  it('does not complain about extra atom types in the current formula', () => {
    expect(formatMissingAtoms('C2H6O', 'C2H6OCl')).toBe(
      'You are not missing any atoms.',
    );
  });

  it('handles a missing target formula', () => {
    expect(formatMissingAtoms(undefined, 'C2H6O')).toBe(
      'Target formula is not available yet.',
    );
  });
});