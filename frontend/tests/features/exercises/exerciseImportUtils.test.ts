import { describe, expect, it } from 'vitest';
import { buildPayloadFromCsvRow, parseCsv } from '../../../src/features/exercises/exerciseImportUtils';

function buildFromCsv(csv: string) {
  const { headers, rows } = parseCsv(csv);
  return buildPayloadFromCsvRow(headers, rows[0], 10.1, -0.1, 213, -2, 'Test set');
}

describe('exercise ZIP CSV import', () => {
  it('maps the SR column to in_SR', () => {
    const result = buildFromCsv('Problem,SR,HNMR,CNMR\n1,4,1H NMR text,13C NMR text');

    expect(result.error).toBeNull();
    expect(result.payload?.in_SR).toBe(4);
  });

  it('defaults in_SR to zero when SR is missing or blank', () => {
    const missingColumn = buildFromCsv('Problem,HNMR,CNMR\n1,1H NMR text,13C NMR text');
    const blankValue = buildFromCsv('Problem,SR,HNMR,CNMR\n1,,1H NMR text,13C NMR text');

    expect(missingColumn.payload?.in_SR).toBe(0);
    expect(blankValue.payload?.in_SR).toBe(0);
  });

  it('rejects a non-integer SR value', () => {
    const result = buildFromCsv('Problem,SR,HNMR,CNMR\n1,1.5,1H NMR text,13C NMR text');

    expect(result.payload).toBeNull();
    expect(result.error).toBe('Invalid SR value. Expected an integer.');
  });
});
