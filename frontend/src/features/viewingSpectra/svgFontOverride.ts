export type SvgFontPreference = '--font-ui' | '--font-spectrum';

type SvgFontOverrideOptions = {
  forceFill?: boolean;
};

const IR_TOKEN_REGEX = /(^|[^a-z0-9])ir([^a-z0-9]|$)/i;

export function isSvgPath(path: string): boolean {
  return /\.svg(?:$|[?#])/i.test(path);
}

export function isLikelyIrSpectrum(label: string | null | undefined, filePath: string): boolean {
  const labelText = (label ?? '').trim();
  if (labelText && IR_TOKEN_REGEX.test(labelText)) {
    return true;
  }

  const fileName = filePath.split('/').pop() ?? filePath;
  return IR_TOKEN_REGEX.test(fileName);
}

export function forceSvgFontFamily(
  svgText: string,
  fontPreference: SvgFontPreference,
  options: SvgFontOverrideOptions = {},
): string {
  const { forceFill = true } = options;

  const fontStack =
    fontPreference === '--font-ui'
      ? "'Ubuntu Sans', system-ui, sans-serif"
      : "Aptos, Calibri, 'Ubuntu Sans', system-ui, sans-serif";

  // Remove explicit family declarations so the override applies predictably.
  let processed = svgText
    .replace(/\sfont-family\s*=\s*"[^"]*"/gi, '')
    .replace(/\sfont-family\s*=\s*'[^']*'/gi, '')
    .replace(/font-family\s*:\s*[^;}{]+;?/gi, '');

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
