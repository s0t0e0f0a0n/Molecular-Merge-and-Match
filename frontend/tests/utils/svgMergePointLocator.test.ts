import { describe, it, expect } from 'vitest';
import { findHighlightedAtomPositions } from '../../src/utils/svgMergePointLocator';

/**
 * Equivalence classes for findHighlightedAtomPositions:
 *
 * EC1: SVG with ellipses matching the given highlightColor  -> returns their positions
 * EC2: SVG with ellipses that do NOT match highlightColor    -> falls back to non-ignored fills
 * EC3: SVG with only ignored fills (white, transparent, etc) -> returns []
 * EC4: SVG with no ellipses or circles at all                -> returns []
 * EC5: SVG with <circle> elements (not <ellipse>)            -> also detected
 * EC6: Fill specified via inline style attribute              -> correctly extracted
 * EC7: Empty / minimal SVG string (BVA: boundary input)      -> returns []
 *
 * Boundary values:
 * - Empty string (below minimum valid SVG)
 * - SVG with zero highlight elements
 * - SVG with exactly one highlight element
 * - SVG with multiple highlight elements
 */

function svgWrap(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

describe('findHighlightedAtomPositions', () => {
  // EC1: ellipses matching highlightColor
  it('returns positions of ellipses matching the highlight color', () => {
    const svg = svgWrap(
      '<ellipse cx="10" cy="20" fill="#FF0000" />' +
      '<ellipse cx="30" cy="40" fill="#FF0000" />'
    );
    const positions = findHighlightedAtomPositions(svg, '#FF0000');
    expect(positions).toHaveLength(2);
    expect(positions[0]).toEqual({ x: 10, y: 20 });
    expect(positions[1]).toEqual({ x: 30, y: 40 });
  });

  // EC1 boundary: exactly one matching ellipse 
  it('returns one position when exactly one ellipse matches', () => {
    const svg = svgWrap('<ellipse cx="5" cy="15" fill="red" />');
    const positions = findHighlightedAtomPositions(svg, 'red');
    expect(positions).toHaveLength(1);
    expect(positions[0]).toEqual({ x: 5, y: 15 });
  });

  // EC2: no exact match -> fallback to non-white fills 
  it('falls back to non-ignored fills when color does not match', () => {
    const svg = svgWrap(
      '<ellipse cx="10" cy="20" fill="#00FF00" />' +
      '<ellipse cx="50" cy="60" fill="white" />'
    );
    // Requesting blue, but only green exists -> fallback picks green (non-ignored)
    const positions = findHighlightedAtomPositions(svg, '#0000FF');
    expect(positions).toHaveLength(1);
    expect(positions[0]).toEqual({ x: 10, y: 20 });
  });

  // EC3: all fills are ignored (white, transparent, none, black) 
  it('returns empty array when all fills are ignored colors', () => {
    const svg = svgWrap(
      '<ellipse cx="10" cy="20" fill="white" />' +
      '<ellipse cx="30" cy="40" fill="transparent" />' +
      '<ellipse cx="50" cy="60" fill="none" />' +
      '<ellipse cx="70" cy="80" fill="#ffffff" />' +
      '<ellipse cx="90" cy="100" fill="black" />'
    );
    const positions = findHighlightedAtomPositions(svg);
    expect(positions).toHaveLength(0);
  });

  // EC4: no ellipses or circles at all 
  it('returns empty array when SVG has no ellipses or circles', () => {
    const svg = svgWrap(
      '<rect x="0" y="0" width="100" height="100" fill="red" />' +
      '<path d="M 0 0 L 10 10" stroke="blue" />'
    );
    const positions = findHighlightedAtomPositions(svg, 'red');
    expect(positions).toHaveLength(0);
  });

  // EC5: <circle> elements are also detected 
  it('detects circle elements in addition to ellipses', () => {
    const svg = svgWrap('<circle cx="25" cy="35" fill="#FF0000" />');
    const positions = findHighlightedAtomPositions(svg, '#FF0000');
    expect(positions).toHaveLength(1);
    expect(positions[0]).toEqual({ x: 25, y: 35 });
  });

  // EC6: fill specified via style attribute 
  it('extracts fill from inline style attribute in fallback pass', () => {
    const svg = svgWrap(
      '<ellipse cx="12" cy="34" style="fill: #00FF00; stroke: black;" />'
    );
    // No highlightColor -> goes straight to fallback pass
    const positions = findHighlightedAtomPositions(svg);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toEqual({ x: 12, y: 34 });
  });

  // EC7 / BVA: empty SVG string 
  it('returns empty array for empty string input', () => {
    const positions = findHighlightedAtomPositions('');
    expect(positions).toHaveLength(0);
  });

  // BVA: minimal valid SVG with no content 
  it('returns empty array for minimal SVG with no children', () => {
    const svg = svgWrap('');
    const positions = findHighlightedAtomPositions(svg);
    expect(positions).toHaveLength(0);
  });

  // EC6 variant: style fill in first pass (highlightColor match) 
  it('matches highlight color in style attribute during first pass', () => {
    const svg = svgWrap(
      '<ellipse cx="7" cy="8" style="fill:#ff0000" />'
    );
    const positions = findHighlightedAtomPositions(svg, '#ff0000');
    expect(positions).toHaveLength(1);
    expect(positions[0]).toEqual({ x: 7, y: 8 });
  });

  // EC1+EC3 combined: mix of matching and ignored fills 
  it('only returns positions for matching fills, ignoring white ellipses', () => {
    const svg = svgWrap(
      '<ellipse cx="10" cy="20" fill="red" />' +
      '<ellipse cx="30" cy="40" fill="white" />' +
      '<ellipse cx="50" cy="60" fill="red" />'
    );
    const positions = findHighlightedAtomPositions(svg, 'red');
    expect(positions).toHaveLength(2);
    expect(positions[0]).toEqual({ x: 10, y: 20 });
    expect(positions[1]).toEqual({ x: 50, y: 60 });
  });

  // BVA: element missing cx/cy defaults to 0 
  it('defaults to (0, 0) when cx/cy attributes are missing', () => {
    const svg = svgWrap('<ellipse fill="red" />');
    const positions = findHighlightedAtomPositions(svg, 'red');
    expect(positions).toHaveLength(1);
    expect(positions[0]).toEqual({ x: 0, y: 0 });
  });
});
