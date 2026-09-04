import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  DEFAULT_AXIS_BEGIN,
  DEFAULT_AXIS_END,
  DEFAULT_C13_AXIS_BEGIN,
  DEFAULT_C13_AXIS_END,
  parseNumber,
  resolveSvgPayload,
  postExercise,
  type AdditionalSpectrum,
  type ExerciseCreatePayload,
} from "./exerciseImportUtils";

const cardStyle: CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: "8px 10px",
  boxSizing: "border-box",
  fontSize: 14,
};

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 84,
  resize: "vertical",
};

const smallButtonStyle: CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 8,
  background: "#f8f8f8",
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 13,
};

async function fileToText(file: File): Promise<string> {
  return await file.text();
}

async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface ExerciseCreationFormProps {
  onCreated?: () => void | Promise<void>;
}

export function ExerciseCreationForm({ onCreated }: ExerciseCreationFormProps) {
  const [name, setName] = useState("");
  const [molecularFormula, setMolecularFormula] = useState("");
  const [solutionInchi, setSolutionInchi] = useState("");
  const [solutionCasNumber, setSolutionCasNumber] = useState("");
  const [exerciseSet, setExerciseSet] = useState("");
  const [tagsCsv, setTagsCsv] = useState("");

  const [h1AxisBegin, setH1AxisBegin] = useState(DEFAULT_AXIS_BEGIN);
  const [h1AxisEnd, setH1AxisEnd] = useState(DEFAULT_AXIS_END);
  const [h1SvgFilename, setH1SvgFilename] = useState("");
  const [h1SvgText, setH1SvgText] = useState("");
  const [h1NmrText, setH1NmrText] = useState("");

  const [c13AxisBegin, setC13AxisBegin] = useState(DEFAULT_C13_AXIS_BEGIN);
  const [c13AxisEnd, setC13AxisEnd] = useState(DEFAULT_C13_AXIS_END);
  const [c13SvgFilename, setC13SvgFilename] = useState("");
  const [c13SvgText, setC13SvgText] = useState("");
  const [c13NmrText, setC13NmrText] = useState("");

  const [additionalLabelInput, setAdditionalLabelInput] = useState("");
  const [additionalSpectra, setAdditionalSpectra] = useState<
    AdditionalSpectrum[]
  >([]);

  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const parsedTags = useMemo(
    () =>
      tagsCsv
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    [tagsCsv],
  );

  const onH1SvgFileChange = async (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setErrorText("1H spectrum must be an SVG file.");
      return;
    }
    const text = await fileToText(file);
    setH1SvgFilename(file.name);
    setH1SvgText(text);
    setErrorText(null);
  };

  const onC13SvgFileChange = async (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setErrorText("13C spectrum must be an SVG file.");
      return;
    }
    const text = await fileToText(file);
    setC13SvgFilename(file.name);
    setC13SvgText(text);
    setErrorText(null);
  };

  const onAddAdditionalSpectrum = async (file: File | null) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    const isAllowed =
      lower.endsWith(".svg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg");
    if (!isAllowed) {
      setErrorText("Additional spectrum must be SVG, PNG, JPG, or JPEG.");
      return;
    }

    const fileBase64 = await fileToBase64(file);
    setAdditionalSpectra((prev) => [
      ...prev,
      {
        filename: file.name,
        file_base64: fileBase64,
        label: additionalLabelInput.trim() || null,
      },
    ]);
    setAdditionalLabelInput("");
    setErrorText(null);
  };

  const validateMandatory = (): string | null => {
    const h1Begin = parseNumber(h1AxisBegin);
    const h1End = parseNumber(h1AxisEnd);
    const c13Begin = parseNumber(c13AxisBegin);
    const c13End = parseNumber(c13AxisEnd);

    if (h1Begin === null || h1End === null)
      return "1H axis scale must be two numbers.";
    if (c13Begin === null || c13End === null)
      return "13C axis scale must be two numbers.";
    if (h1Begin === h1End) return "1H axis begin and end cannot be equal.";
    if (c13Begin === c13End) return "13C axis begin and end cannot be equal.";
    if (!h1NmrText.trim()) return "Please provide the 1H ACS NMR text.";
    if (!c13NmrText.trim()) return "Please provide the 13C ACS NMR text.";
    return null;
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessText(null);

    const validationError = validateMandatory();
    if (validationError) {
      setErrorText(validationError);
      return;
    }

    const payload: ExerciseCreatePayload = {
      h1_spectrum_svg: resolveSvgPayload(h1SvgFilename, h1SvgText, "h1"),
      h1_axis_scale: {
        begin: Number(h1AxisBegin),
        end: Number(h1AxisEnd),
      },
      h1_nmr_text: h1NmrText.trim(),
      c13_spectrum_svg: resolveSvgPayload(c13SvgFilename, c13SvgText, "c13"),
      c13_axis_scale: {
        begin: Number(c13AxisBegin),
        end: Number(c13AxisEnd),
      },
      c13_nmr_text: c13NmrText.trim(),
      c13_apt: null,
      molecular_formula: molecularFormula.trim() || null,
      solution_inchi: solutionInchi.trim() || null,
      solution_cas_number: solutionCasNumber.trim() || null,
      name: name.trim() || null,
      exercise_set: exerciseSet.trim() || null,
      tags: parsedTags,
      additional_spectra: additionalSpectra,
    };

    setSubmitting(true);
    setErrorText(null);

    try {
      const result = await postExercise(payload);
      if (!result.ok) {
        setErrorText(result.detail ?? "Failed to create exercise.");
        return;
      }
      setSuccessText(`Exercise ${result.id} created.`);
      await onCreated?.();
      setName("");
      setMolecularFormula("");
      setSolutionInchi("");
      setSolutionCasNumber("");
      setExerciseSet("");
      setTagsCsv("");

      setH1AxisBegin(DEFAULT_AXIS_BEGIN);
      setH1AxisEnd(DEFAULT_AXIS_END);
      setH1SvgFilename("");
      setH1SvgText("");
      setH1NmrText("");

      setC13AxisBegin(DEFAULT_C13_AXIS_BEGIN);
      setC13AxisEnd(DEFAULT_C13_AXIS_END);
      setC13SvgFilename("");
      setC13SvgText("");
      setC13NmrText("");

      setAdditionalLabelInput("");
      setAdditionalSpectra([]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <h2 style={{ margin: 0 }}>Create Exercise</h2>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Exercise Metadata (optional)</h3>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div>
            <label style={labelStyle}>Exercise name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="If empty, backend uses molecular formula when provided."
            />
          </div>
          <div>
            <label style={labelStyle}>Molecular formula</label>
            <input
              value={molecularFormula}
              onChange={(e) => setMolecularFormula(e.target.value)}
              style={inputStyle}
              placeholder="e.g. C6H12O6"
            />
          </div>
          <div>
            <label style={labelStyle}>Solution InChI hash</label>
            <input
              value={solutionInchi}
              onChange={(e) => setSolutionInchi(e.target.value)}
              style={inputStyle}
              placeholder="SHA-256 hash (hex) of InChI"
            />
          </div>
          <div>
            <label style={labelStyle}>CAS number hash</label>
            <input
              value={solutionCasNumber}
              onChange={(e) => setSolutionCasNumber(e.target.value)}
              style={inputStyle}
              placeholder="SHA-256 hash (hex) of normalized CAS number"
            />
          </div>
          <div>
            <label style={labelStyle}>Exercise set</label>
            <input
              value={exerciseSet}
              onChange={(e) => setExerciseSet(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Aromatics week 1"
            />
          </div>
          <div>
            <label style={labelStyle}>Tags (comma separated)</label>
            <input
              value={tagsCsv}
              onChange={(e) => setTagsCsv(e.target.value)}
              style={inputStyle}
              placeholder="aromatic, acid"
            />
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>1H Spectrum (SVG optional)</h3>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Upload 1H SVG (optional)</label>
          <input
            type="file"
            accept=".svg,image/svg+xml"
            onChange={(e) =>
              void onH1SvgFileChange(e.currentTarget.files?.[0] ?? null)
            }
          />
          {h1SvgFilename ? (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Loaded: {h1SvgFilename}
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              No SVG uploaded. A placeholder SVG will be used.
            </div>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div>
            <label style={labelStyle}>x-axis begin</label>
            <input
              value={h1AxisBegin}
              onChange={(e) => setH1AxisBegin(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>x-axis end</label>
            <input
              value={h1AxisEnd}
              onChange={(e) => setH1AxisEnd(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>ACS text (1H NMR)</label>
          <textarea
            value={h1NmrText}
            onChange={(e) => setH1NmrText(e.target.value)}
            style={textAreaStyle}
            placeholder="1H-NMR (CDCl3, 300 MHz): 4.26 (1H, dqd, J = 10.2, 6.6, 4.2 Hz), 3.86 (1H, dd, J = 10.0, 4.3 Hz), 3.56 (1H, t, J = 10.1 Hz), 1.82 (3H, d, J = 6.6 Hz);"
          />
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>13C Spectrum (SVG optional)</h3>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Upload 13C SVG (optional)</label>
          <input
            type="file"
            accept=".svg,image/svg+xml"
            onChange={(e) =>
              void onC13SvgFileChange(e.currentTarget.files?.[0] ?? null)
            }
          />
          {c13SvgFilename ? (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Loaded: {c13SvgFilename}
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              No SVG uploaded. A placeholder SVG will be used.
            </div>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div>
            <label style={labelStyle}>x-axis begin</label>
            <input
              value={c13AxisBegin}
              onChange={(e) => setC13AxisBegin(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>x-axis end</label>
            <input
              value={c13AxisEnd}
              onChange={(e) => setC13AxisEnd(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>ACS text (13C NMR)</label>
          <textarea
            value={c13NmrText}
            onChange={(e) => setC13NmrText(e.target.value)}
            style={textAreaStyle}
            placeholder="13C-NMR (CDCl3, 75 MHz): 46.0, 37.8, 24.3;"
          />
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Additional spectra (optional)</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 8,
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle}>Label (optional)</label>
            <input
              value={additionalLabelInput}
              onChange={(e) => setAdditionalLabelInput(e.target.value)}
              style={inputStyle}
              placeholder="e.g. IR spectrum"
            />
          </div>
          <div>
            <label style={labelStyle}>Upload file</label>
            <input
              type="file"
              accept=".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg"
              onChange={(e) =>
                void onAddAdditionalSpectrum(e.currentTarget.files?.[0] ?? null)
              }
            />
          </div>
        </div>

        {additionalSpectra.length > 0 ? (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {additionalSpectra.map((item, index) => (
              <div
                key={`additional-${index}`}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: "8px 10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 13 }}>
                  {item.filename}
                  {item.label ? ` · ${item.label}` : ""}
                </div>
                <button
                  type="button"
                  style={smallButtonStyle}
                  onClick={() =>
                    setAdditionalSpectra((prev) =>
                      prev.filter((_, i) => i !== index),
                    )
                  }
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            ...smallButtonStyle,
            padding: "8px 14px",
            background: "#111",
            borderColor: "#111",
            color: "#fff",
          }}
        >
          {submitting ? "Saving..." : "Create exercise"}
        </button>
      </div>

      {errorText ? (
        <div
          style={{
            color: "#b30000",
            fontSize: 13,
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
            fontSize: 13,
            border: "1px solid #cceacc",
            borderRadius: 8,
            padding: 8,
            whiteSpace: "pre-wrap",
          }}
        >
          {successText}
        </div>
      ) : null}
    </form>
  );
}
