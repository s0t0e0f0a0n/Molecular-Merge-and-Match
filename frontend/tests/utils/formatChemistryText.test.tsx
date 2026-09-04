import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { formatChemistryText } from '../../src/utils/formatChemistryText';

function html(input: string): string {
  // Wrap in a span so render gives us a single host node and we can read its
  // innerHTML. Newlines/whitespace between nested elements are not significant
  // formatChemistryText emits adjacent inline nodes only.
  const { container } = render(<span>{formatChemistryText(input)}</span>);
  return container.firstChild ? (container.firstChild as HTMLElement).innerHTML : '';
}

describe('formatChemistryText', () => {
  it('returns null for empty input', () => {
    const { container } = render(<span>{formatChemistryText('')}</span>);
    expect(container.firstChild?.textContent).toBe('');
  });

  it('subscripts a trailing digit (CDCl3 -> CDCl<sub>3</sub>)', () => {
    expect(html('CDCl3')).toBe('CDCl<sub>3</sub>');
  });

  it('subscripts a digit in the middle (H2O -> H<sub>2</sub>O)', () => {
    expect(html('H2O')).toBe('H<sub>2</sub>O');
  });

  it('groups consecutive digits into one subscript', () => {
    // 13 should stay together rather than split into <sub>1</sub><sub>3</sub>.
    expect(html('C13')).toBe('C<sub>13</sub>');
  });

  it('subscripts multiple digit groups in one string', () => {
    expect(html('Na2SO4')).toBe('Na<sub>2</sub>SO<sub>4</sub>');
  });

  it('applies italic via /it{...}', () => {
    expect(html('/it{n}-BuLi')).toBe('<em>n</em>-BuLi');
  });

  it('combines italic and auto-subscript inside /it{...}', () => {
    // 3 still becomes a subscript, but the whole tag is italicised so the
    // <em> wraps both pieces.
    expect(html('/it{CDCl3}')).toBe('<em>CDCl</em><em><sub>3</sub></em>');
  });

  it('suppresses auto-subscript via /notsub{...}', () => {
    expect(html('/notsub{13}C')).toBe('13C<sub></sub>'.replace('<sub></sub>', ''));
  });

  it('nests /notsub inside /it (italic without subscript)', () => {
    expect(html('/it{/notsub{D2O}}')).toBe('<em>D2O</em>');
  });

  it('nests /it inside /notsub (italic, no subscript)', () => {
    expect(html('/notsub{/it{H2O}}')).toBe('<em>H2O</em>');
  });

  it('leaves unmatched /it{ literal so typos are visible', () => {
    // Open brace, no close: emit verbatim.
    expect(html('/it{CDCl3')).toBe('/it{CDCl<sub>3</sub>');
  });

  it('leaves an unknown tag literal', () => {
    expect(html('/bold{X}')).toBe('/bold{X}');
  });
});
