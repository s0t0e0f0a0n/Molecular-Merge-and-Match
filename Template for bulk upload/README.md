# Bulk Exercise Import

This application supports bulk import of exercises from a ZIP archive. A single ZIP file represents one exercise set (for example: `setname.zip`).

## ZIP Structure

The ZIP archive must contain:

* One CSV file containing the exercise metadata.
* Optional SVG spectrum files.

Example:

```text
setname.zip
├── CSV.csv
├── 1_H.svg
├── 1_C.svg
├── 1_IR.svg
├── 2_H.svg
├── 2_C.svg
├── 2_MS.svg
└── ...
```

## CSV Format

The CSV file uses semicolon (`;`) separators.

Required columns:

| Column  | Description                                                 |
| ------- | ----------------------------------------------------------- |
| Problem | Exercise number. Used to link spectra files to an exercise. |
| Formula | Molecular formula shown to students.                        |
| CAS     | SHA256 hash of the correct CAS number.                      |
| InChI   | SHA256 hash of the correct InChI string.                    |
| Solvent | Solvent displayed with the spectra.                         |
| H-NMR   | Proton NMR description.                                     |
| APT     | Carbon spectrum type indicator.                             |
| C-NMR   | Carbon NMR description.                                     |
| Tag     | Optional tags. Multiple Tag columns may be used.            |

Example:

```csv
Problem;Formula;CAS;InChI;Solvent;H-NMR;APT;C-NMR;Tag;Tag
1;C4H8O;[SHA256];[SHA256];CDCl3;"1H-NMR (CDCl3, 300 MHz): 2.46 (2H, q, J = 7.3 Hz), 2.14 (3H, s), 1.06 (3H, t, J = 7.3 Hz);";1;"13C-NMR (CDCl3, 75 MHz): 209.6, 36.9, 29.5, 7.9;";Organic;Practice
```

## Spectrum File Naming

Spectrum files must be SVG files.

### Standard NMR spectra

The following filenames are recognized automatically:

```text
[problem]_H.svg
[problem]_C.svg
```

Examples:

```text
1_H.svg
1_C.svg
25_H.svg
25_C.svg
```

### Additional spectra

Any additional SVG spectrum may be included.

Format:

```text
[problem]_[spectrumtype].svg
```

Examples:

```text
1_IR.svg
1_MS.svg
1_UV.svg
1_Raman.svg
```

The text after the underscore (`IR`, `MS`, `UV`, etc.) is displayed as the spectrum label in the application.

## Missing Spectrum Files

SVG files are optional.

If a spectrum file is not present, the application displays a placeholder instead.

## Solvent Formatting

The solvent column supports simple formatting commands.

### Subscript

Numbers are displayed as subscripts by default.

Example:

```text
CDCl3
```

is displayed as:

```text
CDCl₃
```

### Disable automatic subscript

To prevent automatic subscript formatting, use:

```text
CDCl/notsub{3}
```

### Italic text

To display part of the solvent name in italics, use:

```text
CD/it{Cl}3
```

Multiple formatting commands may be combined as needed.

## 1H-NMR Format

The proton NMR string should follow this format:

```text
1H-NMR (solvent, frequency): shift (integration, multiplicity, J value), shift (...);
```

Example:

```text
1H-NMR (CDCl3, 300 MHz): 2.46 (2H, q, J = 7.3 Hz), 2.14 (3H, s), 1.06 (3H, t, J = 7.3 Hz);
```

Components:

* Chemical shift
* Number of protons
* Multiplicity
* Coupling constant (optional)

Typical multiplicities:

* s = singlet
* d = doublet
* t = triplet
* q = quartet
* m = multiplet
* bs = broad singlet

## 13C-NMR Format

The carbon NMR string follows a similar structure:

```text
13C-NMR (solvent, frequency): shift, shift, shift;
```

Example:

```text
13C-NMR (CDCl3, 75 MHz): 209.6, 36.9, 29.5, 7.9;
```

## APT Column

The APT column indicates whether the carbon spectrum is an APT spectrum.

Values:

| Value | Meaning             |
| ----- | ------------------- |
| 1     | APT spectrum        |
| 0     | Not an APT spectrum |

Other spectrum types such as DEPT should use:

```text
0
```

## Correct Answer Validation

The application stores correct answers as SHA256 hashes.

Two answer types are supported:

### InChI Answer

The preferred answer format is an InChI string (starting with "InChI=").

The SHA256 hash of the InChI is stored in the `InChI` column.

### CAS Answer

A CAS number may be provided as an alternative answer.

The SHA256 hash of the CAS number is stored in the `CAS` column.

Students never see the original answers; only the hashes are stored in the exercise data.
