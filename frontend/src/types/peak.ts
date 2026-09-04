export type PeakDef = {
  id: string;
  spectrum: '1H' | '13C' | 'alt';
  ppm: number;
  multiplicity?: string | null;
  displayLabel?: string | null;
};