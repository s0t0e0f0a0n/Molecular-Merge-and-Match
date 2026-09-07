import { useCallback, useMemo } from 'react';

export const DEFAULT_CHEATS = '000000000000';

export function normalizeCheatBits(raw: unknown): string {
  const bits = String(raw ?? '')
    .trim()
    .split('')
    .filter((ch) => ch === '0' || ch === '1')
    .join('');

  if (!bits) return DEFAULT_CHEATS;
  if (bits.length < DEFAULT_CHEATS.length) {
    return bits.padEnd(DEFAULT_CHEATS.length, '0');
  }
  return bits;
}

export function isCheatPositionEnabled(cheats: string, oneBasedPosition: number): boolean {
  const normalized = normalizeCheatBits(cheats);
  if (oneBasedPosition < 1 || oneBasedPosition > normalized.length) {
    return false;
  }
  return normalized[0] === '1' && normalized[oneBasedPosition - 1] === '1';
}

export function useCheating(rawCheats: unknown) {
  const cheatBits = useMemo(() => normalizeCheatBits(rawCheats), [rawCheats]);

  const isEnabled = useCallback(
    (oneBasedPosition: number) => isCheatPositionEnabled(cheatBits, oneBasedPosition),
    [cheatBits],
  );

  const showSpectrumSegmentsOverlay = useMemo(() => isEnabled(2), [isEnabled]);
  const showCorrectDbe = useMemo(() => isEnabled(3), [isEnabled]);
  const useAltC13Display = useMemo(() => isEnabled(4), [isEnabled]);
  const showAltC13JValues = useMemo(() => isEnabled(5), [isEnabled]);
  const showH1JValues = useMemo(() => isEnabled(6), [isEnabled]);
  const showAtomCount = useMemo(() => isEnabled(7), [isEnabled]);
  const showAltNucleiTables = useMemo(() => isEnabled(8), [isEnabled]);
  const showSecretTags = useMemo(() => isEnabled(9), [isEnabled]);
  const showSpectrumDataSources = useMemo(() => isEnabled(10), [isEnabled]);

  return {
    cheatBits,
    isEnabled,
    showSpectrumSegmentsOverlay,
    showCorrectDbe,
    useAltC13Display,
    showAltC13JValues,
    showH1JValues,
    showAtomCount,
    showAltNucleiTables,
    showSecretTags,
    showSpectrumDataSources,
  };
}
