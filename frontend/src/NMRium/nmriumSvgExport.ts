const SVG_WIDTH = 3307;
const SVG_HEIGHT = 1323;
const PLOT_LEFT = 65;
const PLOT_RIGHT = 3242;
const PLOT_TOP = 140;
const BASELINE = 1172;
const SPECTRUM_TOP = PLOT_TOP + 10;
const SPECTRUM_BOTTOM = BASELINE - 38;
const AXIS_LABEL_Y = 1244;

type RecordValue = Record<string, unknown>;

type SpectrumSvgInput = {
  id?: string;
  info?: { name?: unknown; nucleus?: unknown };
  data?: { x?: unknown; re?: unknown };
  ranges?: { values?: unknown };
  integrals?: { values?: unknown };
};

export type GeneratedSpectrumSvg = {
  id: string;
  name: string;
  nucleus: string;
  ppmRange: [number, number];
  integralVerticalPosition: number;
  svgText: string;
};

export type SpectrumSvgOptions = {
  ppmRange?: [number, number];
  integralVerticalPosition?: number;
};

function asRecord(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

function numberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is number => typeof item === 'number' && Number.isFinite(item),
    );
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as ArrayLike<number>).filter(Number.isFinite);
  }
  return [];
}

function getNucleus(spectrum: SpectrumSvgInput): string {
  const nucleus = spectrum.info?.nucleus;
  if (Array.isArray(nucleus)) return nucleus.map(String).join(', ');
  return typeof nucleus === 'string' ? nucleus : 'NMR';
}

function getDomain(nucleus: string, x: number[]): [number, number] {
  const primaryNucleus = nucleus.split(',')[0].trim();
  if (primaryNucleus === '1H') return [10.1, -0.1];
  if (primaryNucleus === '13C') return [213, -2];
  if (primaryNucleus === '19F') return [200, -200];
  if (primaryNucleus === '31P') return [250, -50];
  const finiteX = x.filter(Number.isFinite);
  if (finiteX.length === 0) throw new Error(`No ppm data found for ${nucleus}.`);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const ppm of finiteX) {
    min = Math.min(min, ppm);
    max = Math.max(max, ppm);
  }
  const padding = Math.max((max - min) * 0.03, 1);
  return [Math.ceil((max + padding) / 10) * 10, Math.floor((min - padding) / 10) * 10];
}

function ppmToX(ppm: number, domain: [number, number]): number {
  return PLOT_LEFT + ((domain[0] - ppm) / (domain[0] - domain[1])) * (PLOT_RIGHT - PLOT_LEFT);
}

function formatTick(value: number, nucleus: string): string {
  const step = nucleus === '1H' ? 1 : 10;
  return Number((Math.round(value / step) * step).toFixed(2)).toString();
}

function buildAxis(domain: [number, number], nucleus: string): string {
  const [start, end] = domain;
  const majorStep = nucleus === '1H' ? 1 : 10;
  const minorStep = majorStep / 5;
  const firstTick = Math.ceil(end / minorStep) * minorStep;
  const ticks: string[] = [];

  for (let ppm = firstTick; ppm <= start + minorStep / 10; ppm += minorStep) {
    const x = ppmToX(ppm, domain);
    const isMajor = Math.abs(ppm / majorStep - Math.round(ppm / majorStep)) < 1e-7;
    const tickHeight = isMajor ? 18 : 9;
    ticks.push(
      `<line x1="${x.toFixed(2)}" y1="${BASELINE}" x2="${x.toFixed(2)}" y2="${BASELINE + tickHeight}" stroke="#000000" stroke-width="4"/>`,
    );
    if (isMajor) {
      ticks.push(
        `<text x="${x.toFixed(2)}" y="${AXIS_LABEL_Y}" text-anchor="middle" font-family="Aptos, Calibri, Ubuntu Sans, system-ui, sans-serif" font-size="51" fill="#000000">${formatTick(ppm, nucleus)}</text>`,
      );
    }
  }

  return [
    `<line x1="${PLOT_LEFT}" y1="${BASELINE}" x2="${PLOT_RIGHT}" y2="${BASELINE}" stroke="#000000" stroke-width="4"/>`,
    ...ticks,
    `<text x="${SVG_WIDTH / 2}" y="1305" text-anchor="middle" font-family="Aptos, Calibri, Ubuntu Sans, system-ui, sans-serif" font-size="51" fill="#000000">δ (ppm)</text>`,
  ].join('');
}

function buildSpectrumPath(
  xValues: number[],
  yValues: number[],
  domain: [number, number],
): string {
  const length = Math.min(xValues.length, yValues.length);
  if (length < 2) throw new Error('The spectrum does not contain enough data points to render.');
  const visible: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const ppm = xValues[index];
    if (ppm <= domain[0] && ppm >= domain[1]) visible.push(index);
  }
  if (visible.length < 2) {
    throw new Error('The selected ppm width does not overlap this spectrum.');
  }

  const baselineSampleStep = Math.max(1, Math.ceil(visible.length / 10000));
  const baselineSamples: number[] = [];
  for (let index = 0; index < visible.length; index += baselineSampleStep) {
    baselineSamples.push(yValues[visible[index]]);
  }
  if (baselineSamples.length === 0) {
    throw new Error('The spectrum contains no finite signal values.');
  }
  baselineSamples.sort((left, right) => left - right);
  const middleSample = Math.floor(baselineSamples.length / 2);
  const signalBaseline =
    baselineSamples.length % 2 === 0
      ? (baselineSamples[middleSample - 1] + baselineSamples[middleSample]) / 2
      : baselineSamples[middleSample];

  let maxPositive = 0;
  let maxNegative = 0;
  let maxPositiveIndex = visible[0];
  let maxNegativeIndex = visible[0];
  for (const index of visible) {
    const deviation = yValues[index] - signalBaseline;
    if (deviation > maxPositive) {
      maxPositive = deviation;
      maxPositiveIndex = index;
    } else if (-deviation > maxNegative) {
      maxNegative = -deviation;
      maxNegativeIndex = index;
    }
  }
  const totalDeviation = maxPositive + maxNegative;
  if (!Number.isFinite(totalDeviation) || totalDeviation === 0) {
    throw new Error('The spectrum contains no finite signal values.');
  }

  const verticalSpan = SPECTRUM_BOTTOM - SPECTRUM_TOP;
  const scale = verticalSpan / totalDeviation;
  const baselineY = SPECTRUM_TOP + maxPositive * scale;
  const pathIndexes = new Set<number>();
  const pathSampleStep = Math.max(1, Math.ceil(visible.length / 12000));
  for (let index = 0; index < visible.length; index += pathSampleStep) {
    pathIndexes.add(visible[index]);
  }
  pathIndexes.add(visible[visible.length - 1]);
  pathIndexes.add(maxPositiveIndex);
  pathIndexes.add(maxNegativeIndex);

  return [...pathIndexes]
    .sort((left, right) => left - right)
    .map((index) => {
      const x = ppmToX(xValues[index], domain);
      const y = baselineY - (yValues[index] - signalBaseline) * scale;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function buildIntegralCurves(
  spectrum: SpectrumSvgInput,
  xValues: number[],
  yValues: number[],
  domain: [number, number],
  verticalPosition: number,
): string {
  const ranges = Array.isArray(spectrum.ranges?.values)
    ? spectrum.ranges.values
    : [];
  const curves: string[] = [];
  for (const rangeValue of ranges) {
    const range = asRecord(rangeValue);
    if (typeof range.from !== 'number' || typeof range.to !== 'number') continue;
    const min = Math.min(range.from, range.to);
    const max = Math.max(range.from, range.to);
    const indexes = xValues
      .map((_ppm, index) => index)
      .filter((index) => xValues[index] >= min && xValues[index] <= max)
      .sort((left, right) => ppmToX(xValues[left], domain) - ppmToX(xValues[right], domain));
    if (indexes.length < 2) continue;

    const magnitudes = indexes.map((index) => Math.abs(yValues[index]));
    const maximum = magnitudes.reduce((current, value) => Math.max(current, value), 0);
    if (maximum <= 0) continue;
    let cumulative = 0;
    const accumulated = indexes.map((index, pointIndex) => {
      if (pointIndex > 0) {
        const previousIndex = indexes[pointIndex - 1];
        const delta = Math.abs(xValues[index] - xValues[previousIndex]);
        cumulative += ((magnitudes[pointIndex] + magnitudes[pointIndex - 1]) / 2) * delta;
      }
      return cumulative;
    });
    const total = accumulated[accumulated.length - 1];
    if (!total) continue;
    const points = indexes.map((index, pointIndex) => {
      const x = ppmToX(xValues[index], domain);
      const y =
        BASELINE -
        verticalPosition -
        (accumulated[pointIndex] / total) * 190;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    curves.push(
      `<polyline points="${points.join(' ')}" fill="none" stroke="#ff0000" stroke-width="4" stroke-linecap="butt" stroke-linejoin="bevel"/>`,
    );
  }

  const integralValues = Array.isArray(spectrum.integrals?.values)
    ? spectrum.integrals.values
    : [];
  for (const integralValue of integralValues) {
    const integral = asRecord(integralValue);
    const integralX = numberArray(integral.x);
    const integralY = numberArray(integral.y);
    const points = integralX
      .slice(0, Math.min(integralX.length, integralY.length))
      .map((ppm, index) => {
        const x = ppmToX(ppm, domain);
        const y = BASELINE - verticalPosition - integralY[index] * 190;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      });
    if (points.length > 1) {
      curves.push(
        `<polyline points="${points.join(' ')}" fill="none" stroke="#ff0000" stroke-width="4" stroke-linecap="butt" stroke-linejoin="bevel"/>`,
      );
    }
  }
  return curves.join('');
}

export function generateSpectrumSvg(
  value: unknown,
  options: SpectrumSvgOptions = {},
): GeneratedSpectrumSvg {
  const spectrum = asRecord(value) as SpectrumSvgInput;
  const x = numberArray(spectrum.data?.x);
  const y = numberArray(spectrum.data?.re);
  const nucleus = getNucleus(spectrum);
  const primaryNucleus = nucleus.split(',')[0].trim();
  if (x.length !== y.length) {
    throw new Error(`Spectrum ${nucleus} has mismatched ppm and signal arrays.`);
  }
  const ppmRange = options.ppmRange ?? getDomain(primaryNucleus, x);
  if (
    !Number.isFinite(ppmRange[0]) ||
    !Number.isFinite(ppmRange[1]) ||
    ppmRange[0] <= ppmRange[1]
  ) {
    throw new Error('The ppm range start must be greater than its end.');
  }
  const domain = ppmRange;
  const integralVerticalPosition = options.integralVerticalPosition ?? 550;
  if (
    !Number.isFinite(integralVerticalPosition) ||
    integralVerticalPosition < 0 ||
    integralVerticalPosition > BASELINE - PLOT_TOP - 190
  ) {
    throw new Error(
      `Integral offset must be between 0 and ${BASELINE - PLOT_TOP - 190} px.`,
    );
  }
  const spectrumPath = buildSpectrumPath(x, y, domain);
  const integralCurves = buildIntegralCurves(
    spectrum,
    x,
    y,
    domain,
    integralVerticalPosition,
  );
  const name =
    typeof spectrum.info?.name === 'string' && spectrum.info.name.trim()
      ? spectrum.info.name.trim()
      : nucleus;
  const escapedName = name.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character];
  });

  return {
    id: typeof spectrum.id === 'string' ? spectrum.id : `${nucleus}-${name}`,
    name,
    nucleus,
    ppmRange,
    integralVerticalPosition,
    svgText:
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="279.993mm" height="112.014mm" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">` +
      `<title>${escapedName}</title>` +
      `<rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#ffffff"/>` +
      `<g fill="none" stroke="#000000" stroke-width="4" stroke-linecap="butt" stroke-linejoin="bevel">` +
      `<polyline points="${spectrumPath}" fill="none" stroke="#000000" stroke-width="3"/>` +
      `</g><g>${integralCurves}</g><g>${buildAxis(domain, primaryNucleus)}</g></svg>`,
  };
}
