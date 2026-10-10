import { generateSpectrumSvg } from './nmriumSvgExport';
import { describe, expect, it } from 'vitest';

describe('generateSpectrumSvg', () => {
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
});
