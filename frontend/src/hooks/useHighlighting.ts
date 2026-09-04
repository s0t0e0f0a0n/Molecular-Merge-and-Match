import { useMemo } from 'react';

export type SpectrumPeak = { id: string; ppm: number };

export type PeakBox = {
  id: string;
  ppm: number;
  leftPercent: number;
  widthPercent: number;
  style: { left: string; width: string };
};

export type MergedHighlightBox = {
  id: string;
  style: { left: string; width: string };
};

function mergeIntervals(
  intervals: Array<{ leftPercent: number; widthPercent: number }>,
): Array<{ leftPercent: number; widthPercent: number }> {
  if (intervals.length <= 1) return intervals;

  const sorted = [...intervals]
    .map((interval) => ({
      start: interval.leftPercent,
      end: interval.leftPercent + interval.widthPercent,
    }))
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      continue;
    }

    merged.push(current);
  }

  return merged.map((interval) => ({
    leftPercent: interval.start,
    widthPercent: interval.end - interval.start,
  }));
}

export function useHighlighting({
  peaks,
  axisRange,
  highlightWidthPPM,
  isHighlighted,
}: {
  peaks: SpectrumPeak[];
  axisRange: [number, number];
  highlightWidthPPM: number;
  isHighlighted?: (id: string) => boolean;
}) {
  const peakBoxes = useMemo<PeakBox[]>(() => {
    const totalAxisRange = axisRange[1] - axisRange[0];
    if (!peaks || totalAxisRange <= 0) return [];

    return peaks.map((peak) => {
      const boxLeftEdgePpm = peak.ppm + (highlightWidthPPM / 2);
      const leftPercent = ((axisRange[1] - boxLeftEdgePpm) / totalAxisRange) * 100;
      const widthPercent = (highlightWidthPPM / totalAxisRange) * 100;

      return {
        id: peak.id,
        ppm: peak.ppm,
        leftPercent,
        widthPercent,
        style: { left: `${leftPercent}%`, width: `${widthPercent}%` },
      };
    });
  }, [peaks, highlightWidthPPM, axisRange]);

  const mergedActiveBoxes = useMemo<MergedHighlightBox[]>(() => {
    const activeIntervals = peakBoxes
      .filter((box) => isHighlighted?.(box.id))
      .map((box) => ({
        leftPercent: box.leftPercent,
        widthPercent: box.widthPercent,
      }));

    return mergeIntervals(activeIntervals).map((interval, index) => ({
      id: `active-${index}`,
      style: {
        left: `${interval.leftPercent}%`,
        width: `${interval.widthPercent}%`,
      },
    }));
  }, [peakBoxes, isHighlighted]);

  return { peakBoxes, mergedActiveBoxes };
}