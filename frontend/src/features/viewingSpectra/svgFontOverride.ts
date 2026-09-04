type SvgFontOverrideOptions = {
  forceFill?: boolean;
};

export function isSvgPath(path: string): boolean {
  return /\.svg(?:$|[?#])/i.test(path);
}

export function forceSvgFontFamily(
  svgText: string,
  options: SvgFontOverrideOptions = {},
): string {
  const { forceFill = true } = options;

  // Uses escaped double quotes for the inner fallback string to ensure cross-browser parsing
  const fontStack = 'var(--font-spectrum, Aptos, "Ubuntu Sans", system-ui, sans-serif)';

  let processed = svgText;

  // 1. INJECT VIEWBOX ONLY IF MISSING (Normalizes all raw, un-viewboxed spectrum graphics)
  if (!/viewBox\s*=\s*/i.test(processed)) {
    const widthMatch = processed.match(/\swidth\s*=\s*"([^"]+)"/i);
    const heightMatch = processed.match(/\sheight\s*=\s*"([^"]+)"/i);
    
    if (widthMatch && heightMatch) {
      const w = widthMatch[1].replace(/[a-z%]/gi, '').trim();
      const h = heightMatch[1].replace(/[a-z%]/gi, '').trim();
      
      if (w && h) {
        processed = processed.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${h}"`);
      }
    }
  }

  // 2. STRIP EXPLICIT FONT DECLARATIONS
  processed = processed
    .replace(/\sfont-family\s*=\s*"[^"]*"/gi, '')
    .replace(/\sfont-family\s*=\s*'[^']*'/gi, '')
    .replace(/font-family\s*:\s*[^;}{]+;?/gi, '');
    
  // 3. INJECT A GLOBAL OVERRIDE STYLESHEET INSIDE DEFINITIONS (Forces uniform typography cascade)
  const cssOverride = `\n<style>text, tspan, g { font-family: ${fontStack} !important; }</style>\n`;
  
  if (/<defs([^>]*)>/i.test(processed)) {
    processed = processed.replace(/<defs([^>]*)>/i, `<defs$1>${cssOverride}`);
  } else {
    processed = processed.replace(/<svg([^>]*)>/i, `<svg$1><defs>${cssOverride}</defs>`);
  }    

  // 4. MERGE ELEMENT WRAPPER STYLES FOR FLUID RESPONSIVE DIMENSIONS
  processed = processed.replace(/<svg([^>]*)>/i, (_match, attrs) => {
    const existingStyleMatch = attrs.match(/\sstyle="([^"]*)"/i);
    const existingStyle = existingStyleMatch?.[1]?.trim() ?? '';
    const styleWithoutFont = existingStyle
      .replace(/font-family\s*:[^;]*;?/gi, '')
      .trim();
      
    const mergedStyle = forceFill
      ? `${styleWithoutFont}${styleWithoutFont ? ';' : ''}display:block;width:100%;height:100%;font-family:${fontStack};`
      : `${styleWithoutFont}${styleWithoutFont ? ';' : ''}display:block;font-family:${fontStack};`;

    const cleanAttrs = attrs
      .replace(/\s*style="[^"]*"/gi, '')
      .replace(/\s*font-family="[^"]*"/gi, '');

    return `<svg${cleanAttrs} style="${mergedStyle}">`;
  });

  return processed;
}
