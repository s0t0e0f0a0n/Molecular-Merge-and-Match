from __future__ import annotations

from collections import Counter
from typing import Literal, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from rdkit import Chem

from app.core.calculation import calculate_dbe, parse_formula

router = APIRouter(prefix="/warnings", tags=["warnings"])

# What can be send from frontend to backend
class AtomCountDBERequest(BaseModel):
    type: Literal["atom_count_DBE"]   #The type determines what class format is used.
    fragments: list[str]    #All currently linked fragments in SMILE format
    molecularFormula: str | None = None
    formulaDbe: float | None = None
    hydrogenInWarning: bool = False

class DoublePeakAssignmentRequest(BaseModel):
    type: Literal["double_peak_assignment"]
    assignmentsByPeak: dict[str, list[str]]


WarningRequest = Union[AtomCountDBERequest, DoublePeakAssignmentRequest]

# What is send beck to the frontend
class WarningResponse(BaseModel):
    type: Literal["atom_count_DBE", "double_peak_assignment"]
    warning: bool
    info: str = ""

# Functions to process the data

def count_atoms_in_smiles(smiles: str) -> dict[str, int]:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise HTTPException(status_code=400, detail=f"Invalid SMILES: {smiles}")

    mol = Chem.AddHs(mol)
    counts = Counter(atom.GetSymbol() for atom in mol.GetAtoms())
    return dict(counts)


def count_atoms_in_fragments(fragments: list[str]) -> dict[str, int]:
    total = Counter()
    for smiles in fragments:
        total += Counter(count_atoms_in_smiles(smiles))
    return dict(total)

def exceeds_formula(fragment_counts: dict[str, int], formula_counts: dict[str, int], hydrogen_in_warning: bool = False,) -> bool:
    """
    Return True if any atom count in fragments exceeds the allowed count
    from the molecular formula.
    Hydrogen (H) is ignored in this comparison.
    """

    for element, frag_count in fragment_counts.items():
        # Skip hydrogen
        if element == "H" and not hydrogen_in_warning:
            continue

        allowed = formula_counts.get(element, 0)

        if frag_count > allowed:
            return True

    return False

# The actual response back to the frontend

@router.post(
    "/",
    response_model=WarningResponse,
    summary="Process warning request",
    description="Receives one warning request from the frontend and returns the current warning state for that warning type.",
)
def receive_warnings(body: WarningRequest) -> WarningResponse:
    def validate_formula_dbe(value: float | None) -> float | None:
        if value is None:
            return None

        try:
            dbe = float(value)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid formula DBE: {value}",
            ) from exc

        if dbe * 2 != round(dbe * 2):
            raise HTTPException(
                status_code=400,
                detail="Formula DBE must be an integer or half-integer",
            )

        return dbe

    if body.type == "atom_count_DBE":
        try:
            formula_counts = parse_formula(body.molecularFormula) if body.molecularFormula else {}
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid molecular formula: {body.molecularFormula}",
            ) from exc

        if len(body.fragments) > 0:
            counted_atoms = count_atoms_in_fragments(body.fragments)
            dbe = calculate_dbe(counted_atoms)
            try:
                formula_dbe = validate_formula_dbe(body.formulaDbe)
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail="Could not validate formula DBE",
                ) from exc

            dbe_too_high = formula_dbe is not None and dbe > formula_dbe
        else:
            counted_atoms = {}
            dbe = 0
            validate_formula_dbe(body.formulaDbe)
            dbe_too_high = 0

        excess_atoms = {
            atom: counted_amount - formula_counts.get(atom, 0)
            for atom, counted_amount in counted_atoms.items()
            if ((body.hydrogenInWarning or atom != "H") and counted_amount > formula_counts.get(atom, 0))
        }

        warning = bool(excess_atoms) or bool(dbe_too_high)

        if warning:
            warning_reasons = []

            if excess_atoms:
                excess_text = ", ".join(
                    f"{atom}: {amount} too many"
                    for atom, amount in excess_atoms.items()
                )
                warning_reasons.append(f"too many atoms ({excess_text})")

            if dbe_too_high:
                warning_reasons.append(
                    f"DBE too high (fragments: {dbe}, formula: {formula_dbe})"
                )

            info = (
                f"Warning active: linked fragments have "
                f"{'; '.join(warning_reasons)}. "
                f"Atom count: {counted_atoms}, DBE: {dbe}"
            )
        else:
            info = (
                f"No warning: linked fragments fit within the molecular formula. "
                f"Atom count: {counted_atoms}, DBE: {dbe}"
            )

        return {
            "type": body.type,
            "warning": warning,
            "info": info,
        }

    if body.type == "double_peak_assignment":
        double_assigned_peaks = {
            peak_id: fragment_ids
            for peak_id, fragment_ids in body.assignmentsByPeak.items()
            if len(fragment_ids) > 1
        }

        warning = len(double_assigned_peaks) > 0

        info = (
            f"Peaks assigned to multiple fragments: {double_assigned_peaks}"
            if warning
            else "No double peak assignments"
        )

        return {
            "type": body.type,
            "warning": warning,
            "info": info,
        }
    raise HTTPException(status_code=400, detail="Unknown warning type")
