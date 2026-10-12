import { contours as createContours } from 'd3';

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
  info?: {
    dimension?: unknown;
    name?: unknown;
    nucleus?: unknown;
  };
  data?: {
    x?: unknown;
    re?: unknown;
    rr?: unknown;
  };
  ranges?: { values?: unknown };
  integrals?: { values?: unknown };
};

export type GeneratedSpectrumSvg = {
  id: string;
  name: string;
  nucleus: string;
  dimension: number;
  ppmRange: [number, number];
  secondPpmRange?: [number, number];
  integralVerticalPosition: number;
  svgText: string;
};

export type SpectrumSvgOptions = {
  ppmRange?: [number, number];
  secondPpmRange?: [number, number];
  integralVerticalPosition?: number;
  contourOptions?: TwoDimensionalContourOptions;
  traces?: {
    top?: TwoDimensionalTrace;
    left?: TwoDimensionalTrace;
  };
};

export type TwoDimensionalTrace = {
  x: number[];
  re: number[];
};

export type TwoDimensionalContourOptions = {
  positive?: {
    contourLevels: [number, number];
    numberOfLayers: number;
  };
  negative?: {
    contourLevels: [number, number];
    numberOfLayers: number;
  };
};

type ContourItemOptions = {
  contourLevels: [number, number];
  numberOfLayers: number;
};

const TWO_D_WIDTH = 2007;
const TWO_D_HEIGHT = 2007;
const TWO_D_LEFT = 260;
const TWO_D_RIGHT = 1850;
const TWO_D_TOP = 170;
const TWO_D_BOTTOM = 1740;
const MAX_TWO_D_SVG_CHARACTERS = 4_500_000;

export function toDescendingPpmRange(
  domain: readonly number[],
): [number, number] | undefined {
  if (
    domain.length !== 2 ||
    !domain.every(Number.isFinite) ||
    domain[0] === domain[1]
  ) {
    return undefined;
  }
  return [Math.max(domain[0], domain[1]), Math.min(domain[0], domain[1])];
}

export function isMatchingTwoDimensionalTab(
  spectrumNucleus: string | string[],
  activeTab: string,
): boolean {
  const nuclei = (Array.isArray(spectrumNucleus) ? spectrumNucleus : [spectrumNucleus])
    .flatMap((nucleus) => nucleus.split(','))
    .map((nucleus) => nucleus.trim())
    .filter(Boolean);
  const activeNuclei = activeTab
    .split(',')
    .map((nucleus) => nucleus.trim())
    .filter(Boolean);
  if (nuclei.length !== 2) return false;
  if (nuclei[0] === nuclei[1]) {
    return (
      (activeNuclei.length === 1 && activeNuclei[0] === nuclei[0]) ||
      (activeNuclei.length === 2 && activeNuclei[0] === nuclei[0] && activeNuclei[1] === nuclei[1])
    );
  }
  return nuclei.join(',') === activeNuclei.join(',');
}

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
  const absoluteRange = Math.abs(value);
  const decimals = nucleus === '1H' ? (absoluteRange < 1 ? 1 : 1) : 0;
  return Number(value.toFixed(decimals)).toString();
}

function getAxisStep(domain: [number, number], nucleus: string): number {
  const width = Math.abs(domain[0] - domain[1]);
  if (nucleus === '1H') {
    if (width <= 1) return 0.1;
    if (width <= 2) return 0.2;
    if (width <= 5) return 0.5;
    return 1;
  }
  if (width <= 20) return 2;
  if (width <= 50) return 5;
  return 10;
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

function safeText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character];
  });
}

function getTwoDimensionalNuclei(nucleus: string): [string, string] {
  const nuclei = nucleus.split(',').map((item) => item.trim());
  return [nuclei[0] ?? '1H', nuclei[1] ?? nuclei[0] ?? '1H'];
}

function getTwoDimensionalDomain(
  nucleus: string,
  min: number,
  max: number,
): [number, number] {
  if (nucleus === '1H' || nucleus === '13C' || nucleus === '19F' || nucleus === '31P') {
    return getDomain(nucleus, [max, min]);
  }
  const padding = Math.max(Math.abs(max - min) * 0.03, 1);
  return [Math.ceil((max + padding) / 10) * 10, Math.floor((min - padding) / 10) * 10];
}

function validateDomain(domain: [number, number], axisName: string) {
  if (
    !Number.isFinite(domain[0]) ||
    !Number.isFinite(domain[1]) ||
    domain[0] <= domain[1]
  ) {
    throw new Error(`The ${axisName} ppm range start must be greater than its end.`);
  }
}

function axisToX(ppm: number, domain: [number, number]): number {
  return (
    TWO_D_LEFT +
    ((domain[0] - ppm) / (domain[0] - domain[1])) * (TWO_D_RIGHT - TWO_D_LEFT)
  );
}

function axisToY(ppm: number, domain: [number, number]): number {
  return (
    TWO_D_TOP +
    ((domain[1] - ppm) / (domain[1] - domain[0])) * (TWO_D_BOTTOM - TWO_D_TOP)
  );
}

function buildTopTracePath(
  trace: TwoDimensionalTrace,
  domain: [number, number],
): string {
  const length = Math.min(trace.x.length, trace.re.length);
  const visible = Array.from({ length }, (_value, index) => index).filter(
    (index) =>
      Number.isFinite(trace.x[index]) &&
      Number.isFinite(trace.re[index]) &&
      trace.x[index] <= domain[0] &&
      trace.x[index] >= domain[1],
  );
  if (visible.length < 2) return '';
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const index of visible) {
    minimum = Math.min(minimum, trace.re[index]);
    maximum = Math.max(maximum, trace.re[index]);
  }
  if (maximum === minimum) return '';
  const top = 20;
  const baseline = TWO_D_TOP - 10;
  const indexes = sampleIndices(visible, 4000);
  const points = indexes.map((index) => {
    const x = axisToX(trace.x[index], domain);
    const y =
      baseline - ((trace.re[index] - minimum) / (maximum - minimum)) * (baseline - top);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return points.join(' ');
}

function buildLeftTracePath(
  trace: TwoDimensionalTrace,
  domain: [number, number],
): string {
  const length = Math.min(trace.x.length, trace.re.length);
  const visible = Array.from({ length }, (_value, index) => index).filter(
    (index) =>
      Number.isFinite(trace.x[index]) &&
      Number.isFinite(trace.re[index]) &&
      trace.x[index] <= domain[0] &&
      trace.x[index] >= domain[1],
  );
  if (visible.length < 2) return '';
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const index of visible) {
    minimum = Math.min(minimum, trace.re[index]);
    maximum = Math.max(maximum, trace.re[index]);
  }
  if (maximum === minimum) return '';
  const left = 80;
  const baseline = TWO_D_LEFT - 10;
  const indexes = sampleIndices(visible, 4000);
  const points = indexes.map((index) => {
    const x =
      baseline -
      ((trace.re[index] - minimum) / (maximum - minimum)) * (baseline - left);
    const y = axisToY(trace.x[index], domain);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return points.join(' ');
}

function buildTwoDimensionalAxes(
  xDomain: [number, number],
  yDomain: [number, number],
  xNucleus: string,
  yNucleus: string,
): string {
  const markup: string[] = [
    `<rect x="${TWO_D_LEFT}" y="${TWO_D_TOP}" width="${TWO_D_RIGHT - TWO_D_LEFT}" height="${TWO_D_BOTTOM - TWO_D_TOP}" fill="none" stroke="#000000" stroke-width="4"/>`,
  ];
  const appendTicks = (
    domain: [number, number],
    nucleus: string,
    orientation: 'x' | 'y',
  ) => {
    const step = getAxisStep(domain, nucleus);
    const firstTick = Math.ceil(domain[1] / step) * step;
    for (let value = firstTick; value <= domain[0] + step / 10; value += step) {
      if (orientation === 'x') {
        const x = axisToX(value, domain);
        markup.push(
          `<line x1="${x.toFixed(2)}" y1="${TWO_D_TOP}" x2="${x.toFixed(2)}" y2="${TWO_D_BOTTOM}" stroke="#000000" stroke-width="2"/>`,
          `<text x="${x.toFixed(2)}" y="${TWO_D_BOTTOM + 48}" text-anchor="middle" font-family="Aptos, Calibri, Ubuntu Sans, system-ui, sans-serif" font-size="38" fill="#000000">${formatTick(value, nucleus)}</text>`,
        );
      } else {
        const y = axisToY(value, domain);
        markup.push(
          `<line x1="${TWO_D_LEFT}" y1="${y.toFixed(2)}" x2="${TWO_D_RIGHT}" y2="${y.toFixed(2)}" stroke="#000000" stroke-width="2"/>`,
          `<text x="${TWO_D_LEFT - 18}" y="${(y + 12).toFixed(2)}" text-anchor="end" font-family="Aptos, Calibri, Ubuntu Sans, system-ui, sans-serif" font-size="38" fill="#000000">${formatTick(value, nucleus)}</text>`,
        );
      }
    }
  };
  appendTicks(xDomain, xNucleus, 'x');
  appendTicks(yDomain, yNucleus, 'y');
  markup.push(
    `<text x="${(TWO_D_LEFT + TWO_D_RIGHT) / 2}" y="${TWO_D_HEIGHT - 42}" text-anchor="middle" font-family="Aptos, Calibri, Ubuntu Sans, system-ui, sans-serif" font-size="42" fill="#000000">${safeText(xNucleus)} δ (ppm)</text>`,
    `<text x="48" y="${(TWO_D_TOP + TWO_D_BOTTOM) / 2}" text-anchor="middle" transform="rotate(-90 48 ${(TWO_D_TOP + TWO_D_BOTTOM) / 2})" font-family="Aptos, Calibri, Ubuntu Sans, system-ui, sans-serif" font-size="42" fill="#000000">${safeText(yNucleus)} δ (ppm)</text>`,
  );
  return markup.join('');
}

function indicesWithinRange(
  min: number,
  max: number,
  length: number,
  domain: [number, number],
): number[] {
  const selected: number[] = [];
  const step = (max - min) / (length - 1);
  for (let index = 0; index < length; index += 1) {
    const value = min + index * step;
    if (value <= domain[0] && value >= domain[1]) selected.push(index);
  }
  return selected;
}

function resolvePpmRange(
  requestedRange: [number, number],
  min: number,
  max: number,
  length: number,
): [number, number] {
  const overlappingRange: [number, number] = [
    Math.min(requestedRange[0], max),
    Math.max(requestedRange[1], min),
  ];
  return indicesWithinRange(min, max, length, overlappingRange).length >= 2
    ? overlappingRange
    : [max, min];
}

function sampleIndices(indices: number[], maximumSamples: number): number[] {
  const step = Math.max(1, Math.ceil((indices.length - 1) / (maximumSamples - 1)));
  const result = indices.filter((_value, index) => index % step === 0);
  const last = indices[indices.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

function getContourThresholds(
  options: ContourItemOptions | undefined,
  maximumIntensity: number,
): number[] {
  if (!options) return [];
  const [minimumLevel, maximumLevel] = options.contourLevels;
  if (
    !Number.isFinite(minimumLevel) ||
    !Number.isFinite(maximumLevel) ||
    !Number.isFinite(options.numberOfLayers) ||
    options.numberOfLayers <= 0 ||
    maximumLevel <= minimumLevel
  ) {
    return [];
  }

  const numberOfLevels = Math.min(
    Math.floor(options.numberOfLayers),
    Math.floor(maximumLevel - minimumLevel),
  );
  if (numberOfLevels <= 0) return [];
  const minIntensity =
    (maximumIntensity * (2 ** (minimumLevel / 10) - 1)) / (2 ** 10 - 1);
  const maxIntensity =
    (maximumIntensity * (2 ** (maximumLevel / 10) - 1)) / (2 ** 10 - 1);
  const factors = new Float64Array(numberOfLevels + 1);
  for (let index = 1; index <= numberOfLevels; index += 1) {
    factors[index] = factors[index - 1] + 1 / 2 ** index;
  }
  const scale = factors[numberOfLevels - 1];
  const thresholds: number[] = [];
  for (let index = 0; index < numberOfLevels; index += 1) {
    const fraction = factors[index] / scale;
    thresholds.push(maxIntensity - fraction * (maxIntensity - minIntensity));
  }
  return [...new Set(thresholds.filter((threshold) => threshold > 0))];
}

function getContourPaths(
  matrix: number[][],
  xRange: [number, number],
  yRange: [number, number],
  sign: 1 | -1,
  thresholds: number[],
): string[] {
  if (thresholds.length === 0) return [];
  const rows = matrix.length;
  const columns = matrix[0]?.length ?? 0;
  const values = matrix.flatMap((row) => row.map((value) => value * sign));
  if (rows < 2 || columns < 2) return [];
  const geometries = createContours()
    .size([columns, rows])
    .thresholds(thresholds)(values);

  return geometries.flatMap((geometry) =>
    geometry.coordinates.flatMap((polygon) =>
      polygon.map((ring) => {
        const points = ring.map(([column, row]) => {
          const xPpm = xRange[0] + (column / (columns - 1)) * (xRange[1] - xRange[0]);
          const yPpm = yRange[0] + (row / (rows - 1)) * (yRange[1] - yRange[0]);
          return `${axisToX(xPpm, [xRange[1], xRange[0]]).toFixed(2)},${axisToY(yPpm, [yRange[1], yRange[0]]).toFixed(2)}`;
        });
        return points.length > 2 ? `M${points.join('L')}Z` : '';
      }),
    ),
  ).filter(Boolean);
}

function generateTwoDimensionalSpectrumSvg(
  spectrum: SpectrumSvgInput,
  options: SpectrumSvgOptions,
): GeneratedSpectrumSvg {
  const nucleus = getNucleus(spectrum);
  const [xNucleus, yNucleus] = getTwoDimensionalNuclei(nucleus);
  const data = asRecord(asRecord(spectrum.data).rr);
  const z = Array.isArray(data.z) ? data.z.map(numberArray) : [];
  if (z.length < 2 || z[0].length < 2 || z.some((row) => row.length !== z[0].length)) {
    throw new Error(`The 2D spectrum ${nucleus} does not contain a rectangular intensity matrix.`);
  }
  const minX = typeof data.minX === 'number' ? data.minX : 0;
  const maxX = typeof data.maxX === 'number' ? data.maxX : 0;
  const minY = typeof data.minY === 'number' ? data.minY : 0;
  const maxY = typeof data.maxY === 'number' ? data.maxY : 0;
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxY) ||
    maxX <= minX ||
    maxY <= minY
  ) {
    throw new Error(`The 2D spectrum ${nucleus} is missing valid ppm axis metadata.`);
  }
  const requestedPpmRange =
    options.ppmRange ?? getTwoDimensionalDomain(xNucleus, minX, maxX);
  const requestedSecondPpmRange =
    options.secondPpmRange ?? getTwoDimensionalDomain(yNucleus, minY, maxY);
  validateDomain(requestedPpmRange, 'horizontal');
  validateDomain(requestedSecondPpmRange, 'vertical');
  const ppmRange = resolvePpmRange(requestedPpmRange, minX, maxX, z[0].length);
  const secondPpmRange = resolvePpmRange(
    requestedSecondPpmRange,
    minY,
    maxY,
    z.length,
  );
  const name =
    typeof spectrum.info?.name === 'string' && spectrum.info.name.trim()
      ? spectrum.info.name.trim()
      : nucleus;
  const title = safeText(name);
  const id = typeof spectrum.id === 'string' ? spectrum.id : `${nucleus}-${name}`;
  const columnRange = indicesWithinRange(minX, maxX, z[0].length, ppmRange);
  const rowRange = indicesWithinRange(minY, maxY, z.length, secondPpmRange);
  const fullMatrixMaximum = z.reduce(
    (maximum, row) =>
      row.reduce(
        (rowMaximum, value) => Math.max(rowMaximum, Math.abs(value)),
        maximum,
      ),
    0,
  );
  if (!options.contourOptions?.positive || !options.contourOptions.negative) {
    throw new Error(
      `NMRium contour levels are unavailable for ${name}; adjust or load the 2D spectrum in NMRium before exporting.`,
    );
  }
  const positiveThresholds = getContourThresholds(
    options.contourOptions.positive,
    fullMatrixMaximum,
  );
  const negativeThresholds = getContourThresholds(
    options.contourOptions.negative,
    fullMatrixMaximum,
  );
  const topTracePath = options.traces?.top
    ? buildTopTracePath(options.traces.top, ppmRange)
    : '';
  const leftTracePath = options.traces?.left
    ? buildLeftTracePath(options.traces.left, secondPpmRange)
    : '';
  const traceColor = '#000000';

  for (const maximumSamples of [250, 175, 125, 90, 64]) {
    const columnIndices = sampleIndices(columnRange, maximumSamples);
    const rowIndices = sampleIndices(rowRange, maximumSamples);
    const matrix = rowIndices.map((rowIndex) =>
      columnIndices.map((columnIndex) => z[rowIndex][columnIndex]),
    );
    const xSamples: [number, number] = [
      minX + (columnIndices[0] / (z[0].length - 1)) * (maxX - minX),
      minX +
        (columnIndices[columnIndices.length - 1] / (z[0].length - 1)) *
          (maxX - minX),
    ];
    const ySamples: [number, number] = [
      minY + (rowIndices[0] / (z.length - 1)) * (maxY - minY),
      minY +
        (rowIndices[rowIndices.length - 1] / (z.length - 1)) * (maxY - minY),
    ];
    const contourMarkup = [
      ...getContourPaths(matrix, xSamples, ySamples, 1, positiveThresholds).map(
        (path) =>
          `<path d="${path}" fill="none" stroke="#ff0000" stroke-width="3" stroke-linecap="butt" stroke-linejoin="round"/>`,
      ),
      ...getContourPaths(matrix, xSamples, ySamples, -1, negativeThresholds).map(
        (path) =>
          `<path d="${path}" fill="none" stroke="#0000ff" stroke-width="3" stroke-linecap="butt" stroke-linejoin="round"/>`,
      ),
    ].join('');
    const svgText =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="169.926mm" height="169.926mm" viewBox="0 0 ${TWO_D_WIDTH} ${TWO_D_HEIGHT}">` +
      `<title>${title}</title>` +
      `<rect width="${TWO_D_WIDTH}" height="${TWO_D_HEIGHT}" fill="#ffffff"/>` +
      `<defs><clipPath id="plot"><rect x="${TWO_D_LEFT}" y="${TWO_D_TOP}" width="${TWO_D_RIGHT - TWO_D_LEFT}" height="${TWO_D_BOTTOM - TWO_D_TOP}"/></clipPath></defs>` +
      (topTracePath
        ? `<polyline points="${topTracePath}" fill="none" stroke="${traceColor}" stroke-width="3"/>`
        : '') +
      (leftTracePath
        ? `<polyline points="${leftTracePath}" fill="none" stroke="${traceColor}" stroke-width="3"/>`
        : '') +
      `<g clip-path="url(#plot)">${contourMarkup}</g>` +
      `<g>${buildTwoDimensionalAxes(ppmRange, secondPpmRange, xNucleus, yNucleus)}</g></svg>`;
    if (svgText.length <= MAX_TWO_D_SVG_CHARACTERS) {
      return {
        id,
        name,
        nucleus,
        dimension: 2,
        ppmRange,
        secondPpmRange,
        integralVerticalPosition: 0,
        svgText,
      };
    }
  }

  throw new Error(
    `The 2D SVG for ${name} is too complex to export within the size limit. Try a narrower ppm range.`,
  );
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
  if (spectrum.info?.dimension === 2) {
    return generateTwoDimensionalSpectrumSvg(spectrum, options);
  }
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
    dimension: 1,
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
