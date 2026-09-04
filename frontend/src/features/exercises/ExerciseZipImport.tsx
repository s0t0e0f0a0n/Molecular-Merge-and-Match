import { useState, useEffect, useRef, type CSSProperties } from "react";
import JSZip, { type JSZipObject } from "jszip";
import {
  DEFAULT_AXIS_BEGIN,
  DEFAULT_AXIS_END,
  DEFAULT_C13_AXIS_BEGIN,
  DEFAULT_C13_AXIS_END,
  buildPayloadFromCsvRow,
  parseCsv,
  postExercise,
  postExerciseImportUpdate,
} from "./exerciseImportUtils";
import type { AdditionalSpectrum, ExerciseImportUpdateRequest, UploadedSvgPayload } from "./exerciseImportUtils";

interface ExerciseZipImportProps {
  onImported?: () => void | Promise<void>;
  onImportingChange?: (isImporting: boolean) => void;
}

const buttonStyle: CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 8,
  background: "#f8f8f8",
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

function toSvgFilename(path: string): string {
  const filename = path.split("/").pop() ?? path;
  if (filename.toLowerCase().endsWith(".svg")) {
    return filename;
  }
  return filename.replace(/\.[^.]+$/, "") + ".svg";
}

function getParentDirectory(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const separatorIndex = normalized.lastIndexOf("/");
  if (separatorIndex < 0) {
    return "";
  }
  return normalized.slice(0, separatorIndex + 1);
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function getDirectoryName(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) {
    return null;
  }
  const parts = normalized.split("/");
  return parts[parts.length - 1] || null;
}

function normalizeDirectoryPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function getAllCsvEntries(zip: JSZip): JSZipObject[] {
  return Object.values(zip.files)
    .filter((entry): entry is JSZipObject => !entry.dir && entry.name.toLowerCase().endsWith(".csv"))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function getJsonEntry(zip: JSZip): JSZipObject | null {
  return Object.values(zip.files).find((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".json")) ?? null;
}

function findZipEntry(zip: JSZip, path: string): JSZipObject | null {
  const normalizedPath = path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  return Object.values(zip.files).find((entry) => !entry.dir && entry.name.replace(/\\/g, "/").toLowerCase() === normalizedPath) ?? null;
}

async function readSvgPayload(zip: JSZip, path: string): Promise<UploadedSvgPayload> {
  const entry = findZipEntry(zip, path);
  if (!entry) throw new Error(`Referenced SVG file not found: ${path}`);
  return { filename: getFileName(entry.name), svg_text: await entry.async("text") };
}

async function readAdditionalSpectrum(zip: JSZip, spectrum: { file: string; label?: string | null; key?: string; priority?: number }): Promise<AdditionalSpectrum> {
  const entry = findZipEntry(zip, spectrum.file);
  if (!entry) throw new Error(`Referenced spectrum file not found: ${spectrum.file}`);
  return {
    filename: getFileName(entry.name),
    file_base64: await entry.async("base64"),
    label: spectrum.label ?? spectrum.key ?? null,
    priority: spectrum.priority,
  };
}

async function processJsonImport(zip: JSZip, jsonEntry: JSZipObject): Promise<{ updatedCount: number; failures: string[] }> {
  const manifest = JSON.parse(await jsonEntry.async("text")) as {
    schema_version?: number;
    operation?: string;
    changes?: Array<{
      match?: { inchi_hash?: string; cas_hash?: string };
      update?: Record<string, unknown>;
      spectra?: {
        replace?: {
          h1?: string;
          c13?: string;
          additional?: Record<string, { file: string; label?: string | null; key?: string; priority?: number }>;
        };
        add?: Array<{ file: string; label?: string | null; key?: string; priority?: number }>;
      };
    }>;
  };
  if (manifest.schema_version !== 1 || manifest.operation !== "update" || !Array.isArray(manifest.changes)) {
    throw new Error("JSON import requires schema_version 1, operation 'update', and a changes array.");
  }

  let updatedCount = 0;
  const failures: string[] = [];
  for (let index = 0; index < manifest.changes.length; index += 1) {
    const change = manifest.changes[index];
    try {
      if (!change.match?.inchi_hash && !change.match?.cas_hash) throw new Error("Missing InChI/CAS match identifier.");
      const update = { ...(change.update ?? {}) };
      if ("inchi_hash" in update) {
        update.solution_inchi_hash = update.inchi_hash;
        delete update.inchi_hash;
      }
      if ("cas_hash" in update) {
        update.solution_cas_hash = update.cas_hash;
        delete update.cas_hash;
      }
      const replace: { h1?: UploadedSvgPayload; c13?: UploadedSvgPayload } = {};
      if (change.spectra?.replace?.h1) replace.h1 = await readSvgPayload(zip, change.spectra.replace.h1);
      if (change.spectra?.replace?.c13) replace.c13 = await readSvgPayload(zip, change.spectra.replace.c13);
      const append = await Promise.all((change.spectra?.add ?? []).map((spectrum) => readAdditionalSpectrum(zip, spectrum)));
      const replaceAdditional: Record<string, AdditionalSpectrum> = {};
      for (const [key, spectrum] of Object.entries(change.spectra?.replace?.additional ?? {})) {
        replaceAdditional[key] = await readAdditionalSpectrum(zip, spectrum);
      }
      const request: ExerciseImportUpdateRequest = {
        match: change.match,
        update,
        replace,
        replace_additional: replaceAdditional,
        append,
      };
      const result = await postExerciseImportUpdate(request);
      if (!result.ok) throw new Error(result.detail ?? "Failed to update exercise.");
      updatedCount += 1;
    } catch (error) {
      failures.push(`Change ${index + 1}: ${error instanceof Error ? error.message : "Failed to update exercise."}`);
    }
  }
  return { updatedCount, failures };
}

function getFilesInDirectory(zip: JSZip, directoryPath: string): JSZipObject[] {
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath).toLowerCase();
  return Object.values(zip.files).filter((entry): entry is JSZipObject => {
    if (entry.dir) {
      return false;
    }
    const entryDirPath = normalizeDirectoryPath(getParentDirectory(entry.name)).toLowerCase();
    return entryDirPath === normalizedDirectoryPath;
  });
}

function findFileByName(files: JSZipObject[], expectedName: string): JSZipObject | null {
  const normalizedExpectedName = expectedName.toLowerCase();
  for (const file of files) {
    if (getFileName(file.name).toLowerCase() === normalizedExpectedName) {
      return file;
    }
  }
  return null;
}

function toAdditionalSpectrumLabel(problemNumber: number, path: string): string | null {
  const filename = getFileName(path).replace(/\.[^.]+$/, "");
  const prefix = `${problemNumber}_`;
  if (!filename.toLowerCase().startsWith(prefix.toLowerCase())) {
    return null;
  }

  // const rawLabel = filename.slice(prefix.length).replace(/[_-]+/g, " ").trim();
  const rawLabel = filename.slice(prefix.length).trim();
  return rawLabel || null;
}

export function ExerciseZipImport({ onImported, onImportingChange }: ExerciseZipImportProps) {
  const [importing, setImporting] = useState(false);
  const [successText, setSuccessText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const onCancel = () => { onImportingChange?.(false); };
    input.addEventListener("cancel", onCancel);
    return () => input.removeEventListener("cancel", onCancel);
  }, [onImportingChange]);

  const onZipFileChange = async (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setErrorText("Please upload a .zip file.");
      return;
    }

    setImporting(true);
    setSuccessText(null);
    setErrorText(null);

    try {
      const zip = await JSZip.loadAsync(file);
      const allCsvEntries = getAllCsvEntries(zip);
      const jsonEntry = getJsonEntry(zip);
      if (jsonEntry) {
        if (allCsvEntries.length > 0) {
          throw new Error("ZIP cannot contain both JSON and CSV import files.");
        }
        const { updatedCount, failures } = await processJsonImport(zip, jsonEntry);
        if (failures.length === 0) {
          setSuccessText(`JSON import complete: ${updatedCount} exercises updated.`);
        } else {
          setErrorText(`JSON import finished: ${updatedCount} updated, ${failures.length} failed. ${failures.slice(0, 8).join(" | ")}`);
          if (updatedCount > 0) setSuccessText(`JSON import partial success: ${updatedCount} exercises updated.`);
        }
        if (updatedCount > 0) await onImported?.();
        return;
      }
      if (allCsvEntries.length === 0) {
        setErrorText("ZIP must contain at least one .csv file.");
        return;
      }

      const defaultH1AxisBegin = Number(DEFAULT_AXIS_BEGIN);
      const defaultH1AxisEnd = Number(DEFAULT_AXIS_END);
      const defaultC13AxisBegin = Number(DEFAULT_C13_AXIS_BEGIN);
      const defaultC13AxisEnd = Number(DEFAULT_C13_AXIS_END);

      let createdCount = 0;
      const failures: string[] = [];

      // Process each CSV file (one per folder)
      for (const csvEntry of allCsvEntries) {
        const csvDirectoryPath = getParentDirectory(csvEntry.name);
        const exerciseSet = getDirectoryName(csvDirectoryPath);
        const filesInCsvDirectory = getFilesInDirectory(zip, csvDirectoryPath);
        const csvText = await csvEntry.async("text");
        const { headers, rows } = parseCsv(csvText);
        if (headers.length === 0 || rows.length === 0) {
          failures.push(`${getFileName(csvEntry.name)} in folder "${exerciseSet}" is empty or invalid.`);
          continue;
        }

        // Process each row in this CSV
        for (let i = 0; i < rows.length; i += 1) {
          const row = rows[i];
          const { payload, error, displayName, problemNumber } = buildPayloadFromCsvRow(
            headers,
            row,
            defaultH1AxisBegin,
            defaultH1AxisEnd,
            defaultC13AxisBegin,
            defaultC13AxisEnd,
            exerciseSet,
          );

          // Allow an optional 'prefix' CSV column to determine the exercise name
          // when importing via ZIP: use "<prefix> <problemNumber>".
          let displayNameUsed = displayName;
          if (!payload) {
            failures.push(`${exerciseSet} - Row ${i + 2} (${displayNameUsed}): ${error}`);
            continue;
          }
          if (problemNumber === null) {
            failures.push(`${exerciseSet} - Row ${i + 2} (${displayNameUsed}): Missing Problem/ID value.`);
            continue;
          }

          try {
            const normalizedHeaders = headers.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
            const prefixIndex = normalizedHeaders.indexOf("prefix");
            if (prefixIndex >= 0) {
              const prefixValue = (row[prefixIndex] ?? "").trim();
              if (prefixValue) {
                payload.name = `${prefixValue} ${problemNumber}`;
                displayNameUsed = `${prefixValue} ${problemNumber}`;
              }
            }
          } catch {
            // Ignore any unexpected errors while reading prefix - keep original name
          }

          const cEntry = findFileByName(filesInCsvDirectory, `${problemNumber}_C.svg`);
          const hEntry =
            findFileByName(filesInCsvDirectory, `${problemNumber}_H.svg`) ??
            findFileByName(filesInCsvDirectory, `${problemNumber}_H.csv`);

          if (!cEntry || !hEntry) {
            failures.push(
              `${exerciseSet} - Row ${i + 2} (${displayNameUsed}): Missing required spectra files for ID ${problemNumber}.`,
            );
            continue;
          }

          const additionalEntries = filesInCsvDirectory.filter((entry) => {
            const fileName = getFileName(entry.name).toLowerCase();
            if (!fileName.endsWith(".svg")) {
              return false;
            }
            if (!fileName.startsWith(`${problemNumber}_`.toLowerCase())) {
              return false;
            }
            return (
              fileName !== `${problemNumber}_h.svg` &&
              fileName !== `${problemNumber}_c.svg`
            );
          });

          const [hSvgText, cSvgText, additionalSpectra] = await Promise.all([
            hEntry.async("text"),
            cEntry.async("text"),
            Promise.all(
              additionalEntries.map(async (entry) => ({
                filename: toSvgFilename(entry.name),
                file_base64: await entry.async("base64"),
                label: toAdditionalSpectrumLabel(problemNumber, entry.name),
              })),
            ),
          ]);

          payload.h1_spectrum_svg = {
            filename: toSvgFilename(hEntry.name),
            svg_text: hSvgText,
          };
          payload.c13_spectrum_svg = {
            filename: toSvgFilename(cEntry.name),
            svg_text: cSvgText,
          };
          payload.additional_spectra = additionalSpectra;

          const result = await postExercise(payload);
          if (result.ok) {
            createdCount += 1;
          } else {
            failures.push(
              `${exerciseSet} - Row ${i + 2} (${displayNameUsed}): ${result.detail ?? "Failed to create exercise."}`,
            );
          }
        }
      }

      if (failures.length === 0) {
        setSuccessText(`ZIP import complete: ${createdCount} exercises created.`);
      } else {
        const preview = failures.slice(0, 8).join(" | ");
        setErrorText(
          `ZIP import finished: ${createdCount} created, ${failures.length} failed. ${preview}`,
        );
        if (createdCount > 0) {
          setSuccessText(`ZIP import partial success: ${createdCount} exercises created.`);
        }
      }

      if (createdCount > 0) {
        await onImported?.();
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to import ZIP.");
    } finally {
      setImporting(false);
      onImportingChange?.(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label
        style={{ ...buttonStyle, display: "inline-flex", alignItems: "center", width: "fit-content" }}
        onClick={() => { onImportingChange?.(true); }}
      >
        {importing ? "Importing ZIP..." : "Upload exercise ZIP"}
        <input
          type="file"
          accept=".zip,application/zip"
          disabled={importing}
          style={{ display: "none" }}
          ref={fileInputRef}
          onChange={(event) => {
            const selectedFile = event.currentTarget.files?.[0] ?? null;
            if (!selectedFile) {
              onImportingChange?.(false);
              return;
            }
            void onZipFileChange(selectedFile);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {errorText ? (
        <div
          style={{
            color: "#b30000",
            fontSize: 12,
            border: "1px solid #f0c7c7",
            borderRadius: 8,
            padding: 8,
            whiteSpace: "pre-wrap",
          }}
        >
          {errorText}
        </div>
      ) : null}
      {successText ? (
        <div
          style={{
            color: "#0f5f0f",
            fontSize: 12,
            border: "1px solid #cceacc",
            borderRadius: 8,
            padding: 8,
            whiteSpace: "pre-wrap",
          }}
        >
          {successText}
        </div>
      ) : null}
    </div>
  );
}
