export type AdditionalSpectrum = {
  filename: string;
  file_base64: string;
  label: string | null;
};

export type UploadedSvgPayload = {
  filename: string;
  svg_text: string;
};

export type ExerciseCreatePayload = {
  h1_spectrum_svg: UploadedSvgPayload;
  h1_axis_scale: { begin: number; end: number };
  h1_nmr_text: string;
  c13_spectrum_svg: UploadedSvgPayload;
  c13_axis_scale: { begin: number; end: number };
  c13_nmr_text: string;
  c13_apt: boolean | null;
  molecular_formula: string | null;
  solution_inchi: string | null;
  solution_cas_number: string | null;
  name: string | null;
  exercise_set?: string | null;
  tags: string[];
  additional_spectra: AdditionalSpectrum[];
  solvent?: string | null;
};

type CreatedExerciseResponse = {
  id: number;
};

export const DEFAULT_AXIS_BEGIN = "10.1";
export const DEFAULT_AXIS_END = "-0.1";
export const DEFAULT_C13_AXIS_BEGIN = "213.0";
export const DEFAULT_C13_AXIS_END = "-2.0";

export function parseNumber(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current.trim());
  return out;
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const headerLine = lines[0];
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const delimiter = semicolonCount >= commaCount ? ";" : ",";

  const headers = splitCsvLine(headerLine, delimiter).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const row = splitCsvLine(line, delimiter);
    if (row.length < headers.length) {
      return [...row, ...Array(headers.length - row.length).fill("")];
    }
    return row.slice(0, headers.length);
  });

  return { headers, rows };
}

function getFirstValueByAliases(
  headers: string[],
  row: string[],
  aliases: string[],
): string {
  const normalizedHeaders = headers.map(normalizeHeader);
  const normalizedAliases = aliases.map(normalizeHeader);

  for (let i = 0; i < normalizedAliases.length; i += 1) {
    const alias = normalizedAliases[i];
    const index = normalizedHeaders.indexOf(alias);
    if (index >= 0) {
      return (row[index] ?? "").trim();
    }
  }

  return "";
}

function getTagValues(headers: string[], row: string[]): string[] {
  const tags: string[] = [];
  for (let i = 0; i < headers.length; i += 1) {
    const headerNormalized = normalizeHeader(headers[i]);
    if (headerNormalized.startsWith("tag")) {
      const value = (row[i] ?? "").trim();
      if (value) tags.push(value);
    }
  }

  const tagsCsv = getFirstValueByAliases(headers, row, ["tags", "tagscsv"]);
  if (tagsCsv) {
    tagsCsv
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((t) => tags.push(t));
  }

  return Array.from(new Set(tags));
}

function isHashLikeValue(value: string): boolean {
  return /^[a-z0-9]{64}$/.test(value);
}

function buildFallbackSvgText(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="360" viewBox="0 0 1200 360">
  <rect x="0" y="0" width="1200" height="360" fill="white"/>
  <line x1="30" y1="310" x2="1170" y2="310" stroke="black" stroke-width="2"/>
  <text x="40" y="45" font-family="Arial, sans-serif" font-size="20" fill="#444">${label} placeholder (no uploaded SVG)</text>
</svg>`;
}

export function resolveSvgPayload(
  filename: string,
  svgText: string,
  fallbackPrefix: "h1" | "c13",
): UploadedSvgPayload {
  if (filename.trim() && svgText.trim()) {
    return { filename: filename.trim(), svg_text: svgText };
  }

  const fallbackName = `${fallbackPrefix}_placeholder.svg`;
  return {
    filename: fallbackName,
    svg_text: buildFallbackSvgText(
      fallbackPrefix === "h1" ? "1H spectrum" : "13C spectrum",
    ),
  };
}

export function buildPayloadFromCsvRow(
  headers: string[],
  row: string[],
  defaultH1AxisBegin: number,
  defaultH1AxisEnd: number,
  defaultC13AxisBegin: number,
  defaultC13AxisEnd: number,
  exerciseSet?: string | null,
): {
  payload: ExerciseCreatePayload | null;
  error: string | null;
  displayName: string;
  problemNumber: number | null;
} {
  const problemStr = getFirstValueByAliases(headers, row, ["problem", "number", "num", "id"]);
  const parsedProblemNumber = problemStr !== "" ? parseInt(problemStr, 10) : Number.NaN;
  const problemNumber = Number.isInteger(parsedProblemNumber) ? parsedProblemNumber : null;

  const molecularFormula = getFirstValueByAliases(headers, row, [
    "formula",
    "molecularformula",
  ]);
  const solutionInchiRaw = getFirstValueByAliases(headers, row, [
    "inchi",
    "solutioninchi",
  ]);
  const solutionCasNumberRaw = getFirstValueByAliases(headers, row, [
    "cas",
    "casnumber",
    "casnr",
  ]);
  const solventRaw = getFirstValueByAliases(headers, row, ["solvent"]);
  const h1NmrText = getFirstValueByAliases(headers, row, [
    "hnmr",
    "1hnmr",
    "h1nmr",
  ]);
  const c13NmrText = getFirstValueByAliases(headers, row, [
    "cnmr",
    "13cnmr",
    "c13nmr",
  ]);
  const aptRaw = getFirstValueByAliases(headers, row, ["apt", "c13apt"]);
  const c13Apt = aptRaw === "1" || aptRaw.toLowerCase() === "true" ? true
    : aptRaw === "0" || aptRaw.toLowerCase() === "false" ? false
    : null;
  const rawTags = getTagValues(headers, row);
  const normalizedExerciseSet = exerciseSet?.trim().toLowerCase();
  const tags = normalizedExerciseSet
    ? rawTags.filter((tag) => tag.trim().toLowerCase() !== normalizedExerciseSet)
    : rawTags;

  const h1BeginRaw = getFirstValueByAliases(headers, row, [
    "h1axisbegin",
    "1haxisbegin",
    "xaxisbegin",
    "axisbegin",
  ]);
  const h1EndRaw = getFirstValueByAliases(headers, row, [
    "h1axisend",
    "1haxisend",
    "xaxisend",
    "axisend",
  ]);
  const c13BeginRaw = getFirstValueByAliases(headers, row, [
    "c13axisbegin",
    "13caxisbegin",
  ]);
  const c13EndRaw = getFirstValueByAliases(headers, row, [
    "c13axisend",
    "13caxisend",
  ]);

  const h1Begin = h1BeginRaw ? parseNumber(h1BeginRaw) : defaultH1AxisBegin;
  const h1End = h1EndRaw ? parseNumber(h1EndRaw) : defaultH1AxisEnd;
  const c13Begin = c13BeginRaw ? parseNumber(c13BeginRaw) : defaultC13AxisBegin;
  const c13End = c13EndRaw ? parseNumber(c13EndRaw) : defaultC13AxisEnd;

  const displayName =
    problemNumber !== null ? `Exercise ${problemNumber}` : molecularFormula || "(unnamed)";
  const solutionInchi = solutionInchiRaw.trim().toLowerCase();
  const solutionCasNumber = solutionCasNumberRaw.trim().toLowerCase();

  if (!h1NmrText) {
    return { payload: null, error: "Missing 1H NMR text.", displayName, problemNumber };
  }
  if (!c13NmrText) {
    return { payload: null, error: "Missing 13C NMR text.", displayName, problemNumber };
  }
  if (
    h1Begin === null ||
    h1End === null ||
    c13Begin === null ||
    c13End === null
  ) {
    return {
      payload: null,
      error: "Invalid axis begin/end value.",
      displayName,
      problemNumber,
    };
  }
  if (h1Begin === h1End || c13Begin === c13End) {
    return {
      payload: null,
      error: "Axis begin and end cannot be equal.",
      displayName,
      problemNumber,
    };
  }
  if (solutionInchi && !isHashLikeValue(solutionInchi)) {
    return {
      payload: null,
      error: "Invalid InChI hash. Expected 64 alphanumeric characters.",
      displayName,
      problemNumber,
    };
  }
  if (solutionCasNumber && !isHashLikeValue(solutionCasNumber)) {
    return {
      payload: null,
      error: "Invalid CAS hash. Expected 64 alphanumeric characters.",
      displayName,
      problemNumber,
    };
  }

  const payload: ExerciseCreatePayload = {
    h1_spectrum_svg: resolveSvgPayload("", "", "h1"),
    h1_axis_scale: { begin: h1Begin, end: h1End },
    h1_nmr_text: h1NmrText,
    c13_spectrum_svg: resolveSvgPayload("", "", "c13"),
    c13_axis_scale: { begin: c13Begin, end: c13End },
    c13_nmr_text: c13NmrText,
    c13_apt: c13Apt,
    molecular_formula: molecularFormula || null,
    solution_inchi: solutionInchi || null,
    solution_cas_number: solutionCasNumber || null,
    name: problemNumber !== null ? `Exercise ${problemNumber}` : null,
    exercise_set: exerciseSet?.trim() || null,
    tags,
    additional_spectra: [],
    solvent: solventRaw.trim() || null,
  };

  return { payload, error: null, displayName, problemNumber };
}

export async function postExercise(payload: ExerciseCreatePayload): Promise<{
  ok: boolean;
  id?: number;
  detail?: string;
}> {
  const response = await fetch("/api/v1/exercises/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const maybeJson = (await response.json().catch(() => null)) as
    | CreatedExerciseResponse
    | { detail?: string }
    | null;

  if (!response.ok) {
    const detail =
      maybeJson && "detail" in maybeJson && typeof maybeJson.detail === "string"
        ? maybeJson.detail
        : "Failed to create exercise.";
    return { ok: false, detail };
  }

  const created = maybeJson as CreatedExerciseResponse;
  return { ok: true, id: created.id };
}
