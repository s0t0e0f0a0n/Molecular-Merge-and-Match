# Frontend

React + TypeScript + Vite frontend for Molecular Bookkeeping.

## Run (dev)

```bash
cd frontend
npm install
npm run dev
```

Vite runs on `http://localhost:5173` and proxies all `/api/*` requests to the backend at `http://localhost:8000`.

## Tests & linting

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript type check
npm run test:run      # Vitest single run
npm run test:coverage # Vitest with coverage report
```

## Notes

- `ExerciseCreationForm` (`src/features/exercises/ExerciseCreationForm.tsx`) is implemented but not wired into the main page yet. The bulk CSV import section exists in the source but is not exposed in the UI. When bulk-importing, non-1H/13C spectra (e.g. IR) are matched by filename convention `{N}_<label>.svg` and stored as additional spectra.
- `AdditionalSpectraPopup` (`src/features/viewingSpectra/AdditionalSpectraPopup.tsx`) renders a modal popup with one tab per additional spectrum. Supports Fit and Scroll view modes; Scroll starts at 150% zoom.
