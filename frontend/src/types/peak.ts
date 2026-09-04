export type PeakDef = {
  id: string;
  spectrum: '1H' | '13C';
  ppm: number;
  multiplicity?: string | null;
};