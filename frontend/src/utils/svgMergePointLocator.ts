/**
 * Extract positions of highlighted atoms from an RDKit-generated SVG.
 *
 * RDKit render atom highlights as <ellipse> (or sometimes <circle>) elements.
 * These are the only ellipses/circles in the SVG: bonds are <path> elements
 * and atom labels are <text>. So we grab all ellipse/circle elements and treat
 * them as highlight positions.
 *
 * If a highlightColor is provided, we first try to match by fill color.
 * If that yields nothing, we fall back to collecting ALL ellipses/circles
 * that have a non-white, non-transparent fill (i.e., likely highlights).
 */
export function findHighlightedAtomPositions(
  svgString: string,
  highlightColor?: string,
): Array<{ x: number; y: number }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const positions: Array<{ x: number; y: number }> = [];

  // Collect all ellipses and circles
  const elements = [
    ...Array.from(doc.querySelectorAll('ellipse')),
    ...Array.from(doc.querySelectorAll('circle')),
  ];

  // First pass: try exact color match if given
  if (highlightColor) {
    const colorLower = highlightColor.toLowerCase();
    for (const el of elements) {
      const fill = (el.getAttribute('fill') ?? el.getAttribute('style') ?? '').toLowerCase();
      if (fill.includes(colorLower)) {
        positions.push(getCenter(el));
      }
    }
    if (positions.length > 0) return positions;
  }

  // Second pass: collect any ellipse/circle that looks like a highlight
  // (has a fill that isn't white, none, transparent, or black)
  const ignoreFills = new Set(['none', '#fff', '#ffffff', 'white', 'transparent', '#000', '#000000', 'black', '']);
  for (const el of elements) {
    const fill = (el.getAttribute('fill') ?? '').toLowerCase().trim();
    const styleFill = extractFillFromStyle(el.getAttribute('style') ?? '');

    const effectiveFill = fill || styleFill;
    if (effectiveFill && !ignoreFills.has(effectiveFill)) {
      positions.push(getCenter(el));
    }
  }

  return positions;
}

function getCenter(el: Element): { x: number; y: number } {
  // ellipse uses cx/cy, circle uses cx/cy
  const cx = parseFloat(el.getAttribute('cx') ?? '0');
  const cy = parseFloat(el.getAttribute('cy') ?? '0');
  return { x: cx, y: cy };
}

function extractFillFromStyle(style: string): string {
  const match = style.match(/fill\s*:\s*([^;]+)/i);
  return match ? match[1].trim().toLowerCase() : '';
}
