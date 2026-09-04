import { Fragment, type ReactNode } from 'react';

/**
 * Render a chemistry-style label (e.g. a solvent name like `CDCl3`, `Na2SO4`,
 * `D2O`) as React nodes with automatic formatting:
 *
 *   - Consecutive digit runs are wrapped in `<sub>`
 *   - `/it{...}` wraps its contents in `<em>` (italic).
 *   - `/notsub{...}` suppresses the auto-subscript for digits inside it
 *     (useful when the digits are part of a name and should stay inline).
 *
 * Formatting tokens nest: `/it{CDCl3}` renders italic with the `3` subscripted,
 * and `/notsub{/it{D2O}}` italicizes but keeps the `2` inline. Unknown `/foo{`
 * tokens are emitted verbatim so a typo is visible in the UI.
 */
export function formatChemistryText(input: string): ReactNode {
  if (!input) return null;
  return <Fragment>{parseSegment(input, { italic: false, subscriptDigits: true })}</Fragment>;
}

type Mode = { italic: boolean; subscriptDigits: boolean };

function parseSegment(input: string, mode: Mode): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let plainStart = 0;

  const flushPlain = (end: number) => {
    if (end <= plainStart) return;
    const chunk = input.slice(plainStart, end);
    pushPlainChunk(out, chunk, mode);
    plainStart = end;
  };

  while (i < input.length) {
    if (input[i] === '/') {
      const tag = matchTag(input, i);
      if (tag) {
        flushPlain(i);
        const inner = parseSegment(tag.body, {
          italic: mode.italic || tag.name === 'it',
          subscriptDigits: mode.subscriptDigits && tag.name !== 'notsub',
        });
        out.push(<Fragment key={i}>{inner}</Fragment>);
        i = tag.end;
        plainStart = i;
        continue;
      }
    }
    i++;
  }
  flushPlain(input.length);
  return out;
}

function pushPlainChunk(out: ReactNode[], chunk: string, mode: Mode): void {
  if (!chunk) return;

  // Wrap the whole chunk in italic when we're inside /it{...} so nested
  // subscripts stay italicized correctly.
  const wrap = (node: ReactNode, key: number): ReactNode =>
    mode.italic ? <em key={key}>{node}</em> : <Fragment key={key}>{node}</Fragment>;

  if (!mode.subscriptDigits) {
    out.push(wrap(chunk, out.length));
    return;
  }

  // Split chunk into digit / non-digit runs.
  let i = 0;
  while (i < chunk.length) {
    if (/\d/.test(chunk[i])) {
      let j = i;
      while (j < chunk.length && /\d/.test(chunk[j])) j++;
      out.push(wrap(<sub key={`s${out.length}`}>{chunk.slice(i, j)}</sub>, out.length));
      i = j;
    } else {
      let j = i;
      while (j < chunk.length && !/\d/.test(chunk[j])) j++;
      out.push(wrap(chunk.slice(i, j), out.length));
      i = j;
    }
  }
}

type TagMatch = { name: 'it' | 'notsub'; body: string; end: number };

/**
 * Try to match `/it{...}` or `/notsub{...}` starting at `pos`. Returns null
 * if the prefix doesn't match or the braces aren't balanced.
 */
function matchTag(input: string, pos: number): TagMatch | null {
  const names: Array<'it' | 'notsub'> = ['it', 'notsub'];
  for (const name of names) {
    const prefix = `/${name}{`;
    if (input.startsWith(prefix, pos)) {
      const bodyStart = pos + prefix.length;
      const bodyEnd = findMatchingBrace(input, bodyStart);
      if (bodyEnd === -1) return null;
      return { name, body: input.slice(bodyStart, bodyEnd), end: bodyEnd + 1 };
    }
  }
  return null;
}

function findMatchingBrace(input: string, start: number): number {
  let depth = 1;
  for (let i = start; i < input.length; i++) {
    if (input[i] === '{') depth++;
    else if (input[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
