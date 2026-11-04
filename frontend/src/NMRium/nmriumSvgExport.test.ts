import {
  generateSpectrumSvg,
  isMatchingTwoDimensionalTab,
  toDescendingPpmRange,
} from './nmriumSvgExport';
import { describe, expect, it } from 'vitest';

describe('generateSpectrumSvg', () => {
  it('normalizes NMRium domains into the descending SVG ppm convention', () => {
    expect(toDescendingPpmRange([-0.2, 8.4])).toEqual([8.4, -0.2]);
    expect(toDescendingPpmRange([8.4, -0.2])).toEqual([8.4, -0.2]);
    expect(toDescendingPpmRange([1, 1])).toBeUndefined();
    expect(toDescendingPpmRange([1])).toBeUndefined();
  });

  it('matches a COSY spectrum when NMRium represents its tab with one nucleus', () => {
    expect(isMatchingTwoDimensionalTab(['1H', '1H'], '1H')).toBe(true);
    expect(isMatchingTwoDimensionalTab(['1H', '1H'], '1H,1H')).toBe(true);
    expect(isMatchingTwoDimensionalTab('1H,1H', '1H')).toBe(true);
    expect(isMatchingTwoDimensionalTab(['1H', '13C'], '1H')).toBe(false);
    expect(isMatchingTwoDimensionalTab(['1H', '13C'], '1H,13C')).toBe(true);
  });

  function getSpectrumPoints(svgText: string): Array<[number, number]> {
    const points = svgText.match(
      /<polyline points="([^"]+)" fill="none" stroke="#000000"/,
    )?.[1];
    if (!points) throw new Error('Black spectrum polyline was not generated.');
    return points.split(' ').map((point) => {
      const [x, y] = point.split(',').map(Number);
      return [x, y];
    });
  }

  it('creates a wide black spectrum with the fixed proton ppm axis', () => {
    const x = Float64Array.from({ length: 401 }, (_value, index) => 10 - index * 0.025);
    const re = Float64Array.from(
      x,
      (ppm) => Math.exp(-((ppm - 2.5) ** 2) / 0.04),
    );

    const result = generateSpectrumSvg({
      id: 'h1-spectrum',
      info: { name: 'Proton', nucleus: '1H' },
      data: { x, re },
      ranges: { values: [{ from: 2, to: 3 }] },
    });

    expect(result.svgText).toContain('viewBox="0 0 3307 1323"');
    expect(result.svgText).toContain('width="279.993mm" height="112.014mm"');
    expect(result.svgText).toContain('stroke="#000000" stroke-width="4"');
    expect(result.svgText).toContain('stroke="#ff0000" stroke-width="4"');
    expect(result.svgText).toContain('>10</text>');
    expect(result.svgText).toContain('>0</text>');
    expect(result.nucleus).toBe('1H');
    expect(result.ppmRange).toEqual([10.1, -0.1]);
    expect(result.integralVerticalPosition).toBe(550);

    const points = getSpectrumPoints(result.svgText);
    const spectrumYs = points.map((point) => point[1]);
    expect(Math.min(...spectrumYs)).toBeGreaterThanOrEqual(150);
    expect(Math.max(...spectrumYs)).toBeLessThanOrEqual(1134);
    expect(result.svgText).toContain('y1="1172" x2="3242" y2="1172"');
    expect(Math.max(...spectrumYs)).toBeLessThan(1172 - 10);
  });

  it('uses the edited ppm range and moves the red integral curve', () => {
    const x = Float64Array.from({ length: 401 }, (_value, index) => 10 - index * 0.025);
    const re = Float64Array.from(
      x,
      (ppm) => Math.exp(-((ppm - 2.5) ** 2) / 0.04),
    );
    const spectrum = {
      id: 'h1-spectrum',
      info: { name: 'Proton', nucleus: '1H' },
      data: { x, re },
      ranges: { values: [{ from: 2, to: 3 }] },
    };

    const baseline = generateSpectrumSvg(spectrum);
    const adjusted = generateSpectrumSvg(spectrum, {
      ppmRange: [6, 1],
      integralVerticalPosition: 100,
    });

    expect(adjusted.ppmRange).toEqual([6, 1]);
    expect(adjusted.integralVerticalPosition).toBe(100);
    expect(adjusted.svgText).toContain('>6</text>');
    expect(adjusted.svgText).not.toContain('>10</text>');
    expect(adjusted.svgText).not.toBe(baseline.svgText);
  });

  it('uses the fixed 13C ppm width', () => {
    const x = Float64Array.from({ length: 211 }, (_value, index) => 210 - index);
    const re = Float64Array.from(x, (ppm) => Math.exp(-((ppm - 50) ** 2) / 100));
    const result = generateSpectrumSvg({
      id: 'c13-spectrum',
      info: { nucleus: '13C' },
      data: { x, re },
    });

    expect(result.svgText).toContain('>210</text>');
    expect(result.svgText).toContain('>0</text>');
    expect(result.svgText).not.toContain('stroke="#ff0000"');
  });

  it('fits offset 13C signals while retaining at least 10px plot margins', () => {
    const x = Float64Array.from({ length: 211 }, (_value, index) => 210 - index);
    const signal = Float64Array.from(x, (ppm) => {
      const positive = Math.exp(-((ppm - 50) ** 2) / 100);
      const negative = 0.35 * Math.exp(-((ppm - 140) ** 2) / 80);
      return positive - negative;
    });
    const shifted = Float64Array.from(signal, (value) => value + 137.5);
    const makeSpectrum = (re: Float64Array) => ({
      id: 'offset-c13',
      info: { nucleus: '13C' },
      data: { x, re },
    });

    const original = generateSpectrumSvg(makeSpectrum(signal));
    const offset = generateSpectrumSvg(makeSpectrum(shifted));
    const originalPoints = getSpectrumPoints(original.svgText);
    const offsetPoints = getSpectrumPoints(offset.svgText);

    expect(Math.min(...offsetPoints.map((point) => point[1]))).toBeGreaterThanOrEqual(150);
    expect(Math.max(...offsetPoints.map((point) => point[1]))).toBeLessThanOrEqual(1134);
    expect(offsetPoints).toEqual(originalPoints);
  });

  it('renders 2D contours with independently adjustable descending ppm axes', () => {
    const z = Array.from({ length: 11 }, (_row, row) =>
      Array.from({ length: 11 }, (_column, column) =>
        Math.exp(-((row - 5) ** 2 + (column - 5) ** 2) / 2),
      ),
    );
    const result = generateSpectrumSvg(
      {
        id: 'cosy',
        info: { dimension: 2, name: 'COSY', nucleus: ['1H', '1H'] },
        data: { rr: { z, minX: 0, maxX: 10, minY: 0, maxY: 10 } },
      },
      {
        ppmRange: [8, 2],
        secondPpmRange: [7, 1],
        contourOptions: {
          positive: { contourLevels: [15, 100], numberOfLayers: 10 },
          negative: { contourLevels: [15, 100], numberOfLayers: 10 },
        },
      },
    );

    expect(result.dimension).toBe(2);
    expect(result.ppmRange).toEqual([8, 2]);
    expect(result.secondPpmRange).toEqual([7, 1]);
    expect(result.svgText).toContain('viewBox="0 0 2007 2007"');
    expect(result.svgText).toContain('stroke="#ff0000"');
    expect(result.svgText).toContain('1H δ (ppm)');
    expect(result.svgText).toContain('x="260" y="170"');
    expect(result.svgText).not.toContain('Integral');
  });

  it('colors positive contours red and negative contours blue for heteronuclear spectra', () => {
    const z = Array.from({ length: 21 }, (_row, row) =>
      Array.from({ length: 21 }, (_column, column) => {
        const positive = Math.exp(-((row - 6) ** 2 + (column - 6) ** 2) / 4);
        const negative = Math.exp(-((row - 15) ** 2 + (column - 15) ** 2) / 4);
        return positive - negative;
      }),
    );
    const result = generateSpectrumSvg(
      {
        id: 'hsqc',
        info: { dimension: 2, name: 'HSQC', nucleus: ['1H', '13C'] },
        data: { rr: { z, minX: 0, maxX: 20, minY: 0, maxY: 200 } },
      },
      {
        contourOptions: {
          positive: { contourLevels: [15, 100], numberOfLayers: 10 },
          negative: { contourLevels: [15, 100], numberOfLayers: 10 },
        },
      },
    );

    expect(result.svgText).toContain('stroke="#ff0000"');
    expect(result.svgText).toContain('stroke="#0000ff"');
  });

  it('uses the supplied NMRium view range and adds the top and left traces', () => {
    const z = Array.from({ length: 11 }, (_row, row) =>
      Array.from({ length: 11 }, (_column, column) =>
        Math.exp(-((row - 5) ** 2 + (column - 5) ** 2) / 2),
      ),
    );
    const result = generateSpectrumSvg(
      {
        id: 'traced-cosy',
        info: { dimension: 2, name: 'COSY', nucleus: ['1H', '1H'] },
        data: { rr: { z, minX: 0, maxX: 10, minY: 0, maxY: 10 } },
      },
      {
        ppmRange: [8, 2],
        secondPpmRange: [7, 1],
        contourOptions: {
          positive: { contourLevels: [15, 100], numberOfLayers: 10 },
          negative: { contourLevels: [15, 100], numberOfLayers: 0 },
        },
        traces: {
          top: {
            x: [8, 6, 4, 2],
            re: [0, 1, 0, -1],
          },
          left: {
            x: [7, 5, 3, 1],
            re: [0, 1, 0, -1],
          },
        },
      },
    );

    expect(result.ppmRange).toEqual([8, 2]);
    expect(result.secondPpmRange).toEqual([7, 1]);
    expect(result.svgText.match(/<polyline points="[^"]+" fill="none" stroke="#000000"/g))
      .toHaveLength(2);
    expect(result.svgText.match(/<polyline points=/g)).toHaveLength(2);
    expect(result.svgText).toContain('260.00,');
  });

  it('falls back to the spectrum bounds when a selected 2D axis does not overlap', () => {
    const z = Array.from({ length: 11 }, (_row, row) =>
      Array.from({ length: 11 }, (_column, column) =>
        Math.exp(-((row - 5) ** 2 + (column - 5) ** 2) / 2),
      ),
    );
    const result = generateSpectrumSvg(
      {
        id: 'non-overlapping-view',
        info: { dimension: 2, name: 'HSQC', nucleus: ['1H', '13C'] },
        data: { rr: { z, minX: 0, maxX: 10, minY: 0, maxY: 10 } },
      },
      {
        ppmRange: [8, 2],
        secondPpmRange: [20, 12],
        contourOptions: {
          positive: { contourLevels: [15, 100], numberOfLayers: 10 },
          negative: { contourLevels: [15, 100], numberOfLayers: 10 },
        },
      },
    );

    expect(result.ppmRange).toEqual([8, 2]);
    expect(result.secondPpmRange).toEqual([10, 0]);
    expect(result.svgText).toContain('1850.00,');
  });

  it('keeps dense 2D contours below the temporary export size limit', () => {
    const size = 240;
    const z = Array.from({ length: size }, (_row, row) =>
      Array.from({ length: size }, (_column, column) =>
        (row + column) % 2 === 0 ? 1 : -1,
      ),
    );
    const result = generateSpectrumSvg(
      {
        id: 'dense-cosy',
        info: { dimension: 2, name: 'Dense COSY', nucleus: ['1H', '1H'] },
        data: {
          rr: {
            z,
            minX: 0,
            maxX: 10,
            minY: 0,
            maxY: 10,
          },
        },
      },
      {
        contourOptions: {
          positive: { contourLevels: [15, 100], numberOfLayers: 10 },
          negative: { contourLevels: [15, 100], numberOfLayers: 10 },
        },
      },
    );

    expect(result.svgText.length).toBeLessThanOrEqual(4_500_000);
  });

  it('uses the contour levels and layer count configured in NMRium', () => {
    const z = Array.from({ length: 21 }, (_row, row) =>
      Array.from({ length: 21 }, (_column, column) =>
        Math.exp(-((row - 10) ** 2 + (column - 10) ** 2) / 20),
      ),
    );
    const spectrum = {
      id: 'cosy-levels',
      info: { dimension: 2, name: 'COSY', nucleus: ['1H', '1H'] },
      data: {
        rr: {
          z,
          minX: 0,
          maxX: 10,
          minY: 0,
          maxY: 10,
          minZ: 0,
          maxZ: 1,
        },
      },
    };
    const fewHighContours = generateSpectrumSvg(spectrum, {
      contourOptions: {
        positive: { contourLevels: [60, 100], numberOfLayers: 2 },
        negative: { contourLevels: [15, 100], numberOfLayers: 0 },
      },
    });
    const manyLowContours = generateSpectrumSvg(spectrum, {
      contourOptions: {
        positive: { contourLevels: [15, 100], numberOfLayers: 10 },
        negative: { contourLevels: [15, 100], numberOfLayers: 0 },
      },
    });
    const countContourPaths = (svg: string) => svg.match(/<path d="/g)?.length ?? 0;

    expect(countContourPaths(fewHighContours.svgText)).toBe(1);
    expect(countContourPaths(manyLowContours.svgText)).toBe(9);
  });

  it("uses NMRium's shared absolute intensity scale for positive and negative HSQC contours", () => {
    const size = 31;
    const z = Array.from({ length: size }, (_row, row) =>
      Array.from({ length: size }, (_column, column) => {
        const positive = Math.exp(-((row - 8) ** 2 + (column - 8) ** 2) / 18);
        const negative = 0.2 * Math.exp(-((row - 23) ** 2 + (column - 23) ** 2) / 18);
        return positive - negative;
      }),
    );
    const makeSpectrum = (minZ: number) => ({
      id: 'hsqc-shared-scale',
      info: { dimension: 2, name: 'HSQC', nucleus: ['1H', '13C'] },
      data: {
        rr: {
          z,
          minX: 0,
          maxX: 10,
          minY: 0,
          maxY: 200,
          minZ,
          maxZ: 1,
        },
      },
    });
    const options = {
      contourOptions: {
        positive: { contourLevels: [20, 100] as [number, number], numberOfLayers: 8 },
        negative: { contourLevels: [20, 100] as [number, number], numberOfLayers: 8 },
      },
    };

    expect(
      generateSpectrumSvg(makeSpectrum(-0.2), options).svgText,
    ).toBe(generateSpectrumSvg(makeSpectrum(-0.8), options).svgText);
  });
});
