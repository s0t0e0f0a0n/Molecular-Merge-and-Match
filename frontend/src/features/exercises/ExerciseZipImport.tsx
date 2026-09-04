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
} from "./exerciseImportUtils";

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

          if (!payload) {
            failures.push(`${exerciseSet} - Row ${i + 2} (${displayName}): ${error}`);
            continue;
          }
          if (problemNumber === null) {
            failures.push(`${exerciseSet} - Row ${i + 2} (${displayName}): Missing Problem/ID value.`);
            continue;
          }

          const cEntry = findFileByName(filesInCsvDirectory, `${problemNumber}_C.svg`);
          const hEntry =
            findFileByName(filesInCsvDirectory, `${problemNumber}_H.svg`) ??
            findFileByName(filesInCsvDirectory, `${problemNumber}_H.csv`);

          if (!cEntry || !hEntry) {
            failures.push(
              `${exerciseSet} - Row ${i + 2} (${displayName}): Missing required spectra files for ID ${problemNumber}.`,
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
              `${exerciseSet} - Row ${i + 2} (${displayName}): ${result.detail ?? "Failed to create exercise."}`,
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
