import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PeakDef } from '../types/peak';
import { useHistory } from '../context/HistoryContext';

export function useLinking(peaks: PeakDef[]) {
  const { links, setLinks, record } = useHistory();

  const [selectedPeakId, setSelectedPeakId] = useState<string | null>(null);
  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null);
  const [hoverPeakId, setHoverPeakIdState] = useState<string | null>(null);
  const [hoverFragmentId, setHoverFragmentIdState] = useState<string | null>(null);

  const setHoverPeakId = useCallback((peakId: string | null) => {
    setHoverPeakIdState((prev) => (prev === peakId ? prev : peakId));
  }, []);

  const setHoverFragmentId = useCallback((fragmentId: string | null) => {
    setHoverFragmentIdState((prev) => (prev === fragmentId ? prev : fragmentId));
  }, []);

  const peaks1H = useMemo(() => peaks.filter((p) => p.spectrum === '1H'), [peaks]);
  const peaks13C = useMemo(() => peaks.filter((p) => p.spectrum === '13C'), [peaks]);

  const peaksKey = useMemo(
    () => peaks.map((p) => p.id).sort().join('|'),
    [peaks],
  );

  useEffect(() => {
    setSelectedPeakId(null);
    setSelectedFragmentId(null);
    setHoverPeakId(null);
    setHoverFragmentId(null);
  }, [peaksKey, setHoverPeakId, setHoverFragmentId]);

  const linksByPeak = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of links) {
      const arr = m.get(l.peakId) ?? [];
      arr.push(l.fragmentId);
      m.set(l.peakId, arr);
    }
    return m;
  }, [links]);

  const linksByFragment = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of links) {
      const arr = m.get(l.fragmentId) ?? [];
      arr.push(l.peakId);
      m.set(l.fragmentId, arr);
    }
    return m;
  }, [links]);

  const isLinked = useCallback(
    (fragmentId: string, peakId: string) =>
      links.some((l) => l.fragmentId === fragmentId && l.peakId === peakId),
    [links],
  );

  const link = useCallback(
    (fragmentId: string, peakId: string) => {
      if (links.some((l) => l.fragmentId === fragmentId && l.peakId === peakId)) return;
      setLinks([...links, { fragmentId, peakId }]);
      record({ kind: 'link', fragmentId, peakId });
    },
    [links, setLinks, record],
  );

  const unlink = useCallback(
    (fragmentId: string, peakId: string) => {
      if (!links.some((l) => l.fragmentId === fragmentId && l.peakId === peakId)) return;
      setLinks(links.filter((l) => !(l.fragmentId === fragmentId && l.peakId === peakId)));
      record({ kind: 'unlink', fragmentId, peakId });
    },
    [links, setLinks, record],
  );

const removeLinksForFragment = useCallback(
  (fragmentId: string) => {
    const linksToRemove = links.filter((l) => l.fragmentId === fragmentId);

    if (linksToRemove.length === 0) return;

    setLinks(links.filter((l) => l.fragmentId !== fragmentId));

    for (const link of linksToRemove) {
      record({ kind: 'unlink', fragmentId: link.fragmentId, peakId: link.peakId });
    }

    if (selectedFragmentId === fragmentId) {
      setSelectedFragmentId(null);
    }

    if (hoverFragmentId === fragmentId) {
      setHoverFragmentId(null);
    }
  },
  [links, setLinks, record, selectedFragmentId, hoverFragmentId, setHoverFragmentId],
);

const clearFragmentFocus = useCallback(
  (fragmentId: string) => {
    if (selectedFragmentId === fragmentId) {
      setSelectedFragmentId(null);
    }

    if (hoverFragmentId === fragmentId) {
      setHoverFragmentId(null);
    }
  },
  [selectedFragmentId, hoverFragmentId, setHoverFragmentId],
);

const selectFragment = useCallback(
  (fragmentId: string) => {
    if (selectedPeakId) {
      if (isLinked(fragmentId, selectedPeakId)) unlink(fragmentId, selectedPeakId);
      else link(fragmentId, selectedPeakId);

      setSelectedPeakId(null);
      setSelectedFragmentId(null);
    } else {
      setSelectedFragmentId((prev) => (prev === fragmentId ? null : fragmentId));
    }
  },
  [selectedPeakId, isLinked, unlink, link],
);


const selectPeak = useCallback(
  (peakId: string) => {
    if (selectedFragmentId) {
      if (isLinked(selectedFragmentId, peakId)) unlink(selectedFragmentId, peakId);
      else link(selectedFragmentId, peakId);

      setSelectedFragmentId(null);
      setSelectedPeakId(null);
    } else {
      setSelectedPeakId((prev) => (prev === peakId ? null : peakId));
    }
  },
  [selectedFragmentId, isLinked, unlink, link],
);

  const activePeakId = hoverPeakId ?? selectedPeakId;
  const activeFragmentId = hoverFragmentId ?? selectedFragmentId;
  const hasFocus = Boolean(activePeakId || selectedFragmentId);

  //This is where the highlighting in the peaklists is done.
  const peakIsHighlighted = useCallback(
    (peakId: string) => {
      if (activeFragmentId) {
        const linkedToActiveFragment = (linksByFragment.get(activeFragmentId) ?? []).includes(peakId);

        if (linkedToActiveFragment) return true;
        if (hoverPeakId) return peakId === hoverPeakId;

        return false;
      }

      if (activePeakId) return peakId === activePeakId;
      return false;
    },
    [activeFragmentId, activePeakId, hoverPeakId, linksByFragment],
  );

  // This is where the highlighting of the fragments is done.
  const fragmentIsHighlighted = useCallback(
    (fragmentId: string) => {
      if (activePeakId) {
        const linkedToActivePeak = (linksByPeak.get(activePeakId) ?? []).includes(fragmentId);

        if (linkedToActivePeak) return true;
        if (hoverFragmentId) return fragmentId === hoverFragmentId;

        return false;
      }

      if (activeFragmentId) return fragmentId === activeFragmentId;
      return false;
    },
    [activePeakId, activeFragmentId, hoverFragmentId, linksByPeak],
  );

  const clearLinks = useCallback(() => {
    if (links.length === 0) return;
    record({ kind: 'clear-links', before: links });
    setLinks([]);
  }, [links, setLinks, record]);

  return {
    links,
    selectedPeakId,
    selectedFragmentId,
    selectPeak,
    selectFragment,
    isLinked,
    unlink,
    removeLinksForFragment,
    clearFragmentFocus,
    linksByPeak,
    linksByFragment,
    peakIsHighlighted,
    fragmentIsHighlighted,
    hasFocus,
    setHoverPeakId,
    setHoverFragmentId,
    clearLinks,
    peaks1H,
    peaks13C,
  };
}