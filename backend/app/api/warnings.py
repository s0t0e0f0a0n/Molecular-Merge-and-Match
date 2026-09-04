from __future__ import annotations

import re
from collections import Counter
from typing import Literal, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from rdkit import Chem

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


def calculate_dbe(atom_counts: dict[str, int]) -> float:
    c = sum(atom_counts.get(symbol, 0) for symbol in ["C", "Si", "Sn"])
    h = atom_counts.get("H", 0)
    n = sum(atom_counts.get(symbol, 0) for symbol in ["N", "P", "B"])
    x = sum(atom_counts.get(symbol, 0) for symbol in ["F", "Cl", "Br", "I", "D", "[2]H", "[2H]"])

    dbe = c + 1 - (h + x - n) / 2
    return dbe

def parse_formula(formula: str) -> dict[str, int]:
    """
    Convert a molecular formula string into atom counts.

    Examples:
    "C6H12O6+"        -> {'C': 6, 'H': 12, 'O': 6}
    "C6H12O6·H2O"     -> {'C': 6, 'H': 14, 'O': 7}
    "Fe2(SO4)3"       -> {'Fe': 2, 'S': 3, 'O': 12}
    "CH3COOH"         -> {'C': 2, 'H': 4, 'O': 2}
    """

    # Remove spaces
    formula = formula.strip().replace(" ", "")
    # replace the deuterium isotope notation, with "D"still gives frontend error symbol.
    # replace with "H" avoids this
    formula = formula.replace("[2]H", "H")
    # Remove charge at the end, like +, -, 2+, 3-
    formula = re.sub(r'(\d*[+-])$', '', formula)

    # Split hydrates (e.g. "C6H12O6·H2O" or "C6H12O6.H2O")
    parts = re.split(r'[·.]', formula)

    total_counts = Counter()

    # Parse each part separately and add them together
    for part in parts:
        total_counts += Counter(_parse_formula_part(part))

    return dict(total_counts)


def _parse_formula_part(part: str) -> dict[str, int]:
    """
    Parse one part of a formula (no hydrates).
    Handles parentheses and element counts.
    """

    # Stack is used to handle nested parentheses
    stack = [Counter()]
    i = 0

    while i < len(part):
        char = part[i]

        if char == '(':
            # Start a new group
            stack.append(Counter())
            i += 1

        elif char == ')':
            # End of a group
            i += 1

            # Read multiplier after ')'
            multiplier, i = _read_number(part, i)

            # Pop the group and multiply it
            group_counts = stack.pop()

            for element, count in group_counts.items():
                stack[-1][element] += count * multiplier

        elif char.isupper():
            # Start of an element symbol (e.g. C, Fe, Na)
            element = char
            i += 1

            # Check if it has a lowercase letter (e.g. Cl, Na)
            if i < len(part) and part[i].islower():
                element += part[i]
                i += 1

            # Read the number after the element (if any)
            count, i = _read_number(part, i)

            # Add to current level
            stack[-1][element] += count

        else:
            # Unexpected character
            raise ValueError(f"Unexpected character in formula: {char}")

    # If stack is not back to 1, parentheses were not closed
    if len(stack) != 1:
        raise ValueError(f"Unclosed parenthesis in formula: {part}")

    return dict(stack[0])


def _read_number(text: str, i: int) -> tuple[int, int]:
    """
    Read a number starting at position i.
    If no number is found, return 1.
    """

    start = i

    # Read all digits
    while i < len(text) and text[i].isdigit():
        i += 1

    # If no digits, default count is 1
    if start == i:
        return 1, i

    return int(text[start:i]), i

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
