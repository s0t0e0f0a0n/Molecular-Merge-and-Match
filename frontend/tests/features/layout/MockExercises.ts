import type { ExerciseDetail, ExerciseSummary } from '../../../src/api/exercises';

export const mockSummaries: ExerciseSummary[] = [
  {
    id: 1,
    name: 'Exercise 1',
    exercise_set: 'Base set',
    tags: ['OSS', 'C4', 'base set', 'solvent'],
  },
  {
    id: 2,
    name: 'Exercise 2',
    exercise_set: 'Base set',
    tags: ['OSS', 'C3', 'base set', 'solvent', 'symmetry', 'exchange'],
  },
];

export const mockExercise1: ExerciseDetail = {
  id: 1,
  name: 'Exercise 1',
  molecular_formula: 'C4H8O',
  exercise_set: 'Base set',
  tags: ['OSS', 'C4', 'base set', 'solvent'],

  h1_svg_path: '/mock/h1/ex1.svg',
  h1_svg_url: '/mock/h1/ex1.svg',
  h1_axis_start: 10.1,
  h1_axis_end: -0.1,
  h1_nmr_text:
    '1H NMR (300 MHz, CDCl3) δ 2.46 (q, J = 7.3 Hz, 1H), 2.14 (s, 2H), 1.06 (t, J = 7.3 Hz, 2H).',
  h1_frequency_mhz: 300,
  h1_solvent: 'CDCl3',
  h1_peaks: [
    {
      id: 1,
      ppm: 2.46,
      multiplicity: 'q',
      j_values_hz_csv: '7.3',
      proton_count: 1,
      extra_info: 'q, J = 7.3 Hz, 1H',
    },
    {
      id: 2,
      ppm: 2.14,
      multiplicity: 's',
      j_values_hz_csv: null,
      proton_count: 2,
      extra_info: 's, 2H',
    },
    {
      id: 3,
      ppm: 1.06,
      multiplicity: 't',
      j_values_hz_csv: '7.3',
      proton_count: 2,
      extra_info: 't, J = 7.3 Hz, 2H',
    },
  ],

  c13_svg_path: '/mock/c13/ex1.svg',
  c13_svg_url: '/mock/c13/ex1.svg',
  c13_axis_start: 213,
  c13_axis_end: -2,
  c13_nmr_text:
    '13C NMR (75 MHz, CDCl3) δ 209.58, 77.58, 77.16, 76.74, 36.90, 29.49, 7.87.',
  c13_frequency_mhz: 75,
  c13_solvent: 'CDCl3',
  c13_peaks: [
    { id: 1, ppm: 209.58, atom_count: 1, extra_info: null },
    { id: 2, ppm: 77.58, atom_count: 1, extra_info: null },
    { id: 3, ppm: 77.16, atom_count: 1, extra_info: null },
    { id: 4, ppm: 76.74, atom_count: 1, extra_info: null },
    { id: 5, ppm: 36.9, atom_count: 1, extra_info: null },
    { id: 6, ppm: 29.49, atom_count: 1, extra_info: null },
    { id: 7, ppm: 7.87, atom_count: 1, extra_info: null },
  ],

  additional_spectra: [],
};

export const mockExercise2: ExerciseDetail = {
  id: 2,
  name: 'Exercise 2',
  molecular_formula: 'C3H8O',
  exercise_set: 'Base set',
  tags: ['OSS', 'C3', 'base set', 'solvent', 'symmetry', 'exchange'],

  h1_svg_path: '/mock/h1/ex2.svg',
  h1_svg_url: '/mock/h1/ex2.svg',
  h1_axis_start: 10.1,
  h1_axis_end: -0.1,
  h1_nmr_text:
    '1H NMR (300 MHz, CDCl3) δ 4.14 – 3.80 (m, 1H), 2.58 (d, J = 2.1 Hz, 1H), 1.20 (d, J = 6.2 Hz, 6H).',
  h1_frequency_mhz: 300,
  h1_solvent: 'CDCl3',
  h1_peaks: [
    {
      id: 4,
      ppm: 3.8,
      multiplicity: 'm',
      j_values_hz_csv: null,
      proton_count: 1,
      extra_info: 'm, 1H',
    },
    {
      id: 5,
      ppm: 2.58,
      multiplicity: 'd',
      j_values_hz_csv: '2.1',
      proton_count: 1,
      extra_info: 'd, J = 2.1 Hz, 1H',
    },
    {
      id: 6,
      ppm: 1.2,
      multiplicity: 'd',
      j_values_hz_csv: '6.2',
      proton_count: 6,
      extra_info: 'd, J = 6.2 Hz, 6H',
    },
  ],

  c13_svg_path: '/mock/c13/ex2.svg',
  c13_svg_url: '/mock/c13/ex2.svg',
  c13_axis_start: 213,
  c13_axis_end: -2,
  c13_nmr_text:
    '13C NMR (75 MHz, CDCl3) δ 77.58, 77.16, 76.73, 64.18, 25.27.',
  c13_frequency_mhz: 75,
  c13_solvent: 'CDCl3',
  c13_peaks: [
    { id: 8, ppm: 77.58, atom_count: 1, extra_info: null },
    { id: 9, ppm: 77.16, atom_count: 1, extra_info: null },
    { id: 10, ppm: 76.73, atom_count: 1, extra_info: null },
    { id: 11, ppm: 64.18, atom_count: 1, extra_info: null },
    { id: 12, ppm: 25.27, atom_count: 1, extra_info: null },
  ],

  additional_spectra: [],
};
