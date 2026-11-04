import type { NMRiumDraftSpectrum } from '../api/exerciseCreation';

export function containsNucleus(
  spectrum: NMRiumDraftSpectrum,
  nucleus: string,
): boolean {
  return (Array.isArray(spectrum.nucleus) ? spectrum.nucleus : [spectrum.nucleus]).includes(
    nucleus,
  );
}

export function getDefaultSpectrumLabel(spectrum: NMRiumDraftSpectrum): string {
  const experimentNames = [
    spectrum.info.technique,
    spectrum.info.experiment,
    spectrum.info.name,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  const technique = experimentNames.match(
    /HSQC[- ]?TOCSY|INADEQUATE|COSY|HSQC|HMQC|HMBC|TOCSY|NOESY|ROESY|JRES|DEPT|H2BC/i,
  )?.[0];
  if (technique) return technique.toUpperCase().replace(' ', '-');

  if (spectrum.dimension === 1) {
    if (containsNucleus(spectrum, '1H')) return '1H';
    if (containsNucleus(spectrum, '13C')) return '13C';
  }

  const pulseSequence = spectrum.info.pulseSequence;
  if (typeof pulseSequence === 'string' && pulseSequence.trim()) {
    return pulseSequence.trim();
  }
  return Array.isArray(spectrum.nucleus)
    ? spectrum.nucleus.join(', ')
    : spectrum.nucleus;
}

function hasIntegral(spectrum: NMRiumDraftSpectrum): boolean {
  return spectrum.multiplets.some((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const range = value as Record<string, unknown>;
    const integral = range.integrationRaw ?? range.integration ?? range.integrationRounded;
    return typeof integral === 'number' && Number.isFinite(integral) && integral > 0;
  });
}

export function initializePrimarySpectrumSelections(
  spectra: NMRiumDraftSpectrum[],
): NMRiumDraftSpectrum[] {
  const hasExplicitProtonSelection = spectra.some(
    (spectrum) =>
      spectrum.dimension === 1 &&
      containsNucleus(spectrum, '1H') &&
      typeof spectrum.isPrimary === 'boolean',
  );
  const hasExplicitCarbonSelection = spectra.some(
    (spectrum) =>
      spectrum.dimension === 1 &&
      containsNucleus(spectrum, '13C') &&
      typeof spectrum.isPrimary === 'boolean',
  );
  const primaryProton =
    (hasExplicitProtonSelection
      ? spectra.find(
          (spectrum) =>
            spectrum.dimension === 1 &&
            containsNucleus(spectrum, '1H') &&
            spectrum.isPrimary === true,
        )
      : undefined) ??
    (!hasExplicitProtonSelection
      ? spectra.find(
          (spectrum) =>
            spectrum.dimension === 1 &&
            containsNucleus(spectrum, '1H') &&
            hasIntegral(spectrum),
        )
      : undefined);
  const primaryCarbon =
    (hasExplicitCarbonSelection
      ? spectra.find(
          (spectrum) =>
            spectrum.dimension === 1 &&
            containsNucleus(spectrum, '13C') &&
            spectrum.isPrimary === true,
        )
      : undefined) ??
    (!hasExplicitCarbonSelection
      ? spectra.find(
          (spectrum) => spectrum.dimension === 1 && containsNucleus(spectrum, '13C'),
        )
      : undefined);
  if (!primaryProton && !primaryCarbon) return spectra;

  return spectra.map((spectrum) => {
    if (spectrum.dimension !== 1) return spectrum;
    const isProton = containsNucleus(spectrum, '1H');
    const isCarbon = containsNucleus(spectrum, '13C');
    if (!isProton && !isCarbon) return spectrum;
    let isPrimary = spectrum.isPrimary ?? false;
    if (isProton && !hasExplicitProtonSelection) {
      isPrimary = spectrum.id === primaryProton?.id;
    }
    if (isCarbon && !hasExplicitCarbonSelection) {
      isPrimary = spectrum.id === primaryCarbon?.id;
    }
    return {
      ...spectrum,
      isPrimary,
    };
  });
}
