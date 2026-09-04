from __future__ import annotations

import re
from collections import Counter


def calculate_dbe(atom_counts: dict[str, int]) -> float:
    c = sum(atom_counts.get(symbol, 0) for symbol in ["C", "Si", "Sn"])
    h = atom_counts.get("H", 0)
    n = sum(atom_counts.get(symbol, 0) for symbol in ["N", "P", "B"])
    x = sum(
        atom_counts.get(symbol, 0)
        for symbol in ["F", "Cl", "Br", "I", "D", "[2]H", "[2H]"]
    )

    return c + 1 - (h + x - n) / 2


def parse_formula(formula: str) -> dict[str, int]:
    """
    Convert a molecular formula string into atom counts.

    Examples:
    "C6H12O6+"        -> {'C': 6, 'H': 12, 'O': 6}
    "C6H12O6·H2O"     -> {'C': 6, 'H': 12, 'O': 6}
    "Fe2(SO4)3"       -> {'Fe': 2, 'S': 3, 'O': 12}
    "CH3COOH"         -> {'C': 2, 'H': 4, 'O': 2}
    """

    formula = formula.strip().replace(" ", "")
    formula = formula.replace("[2]H", "H")

    # Ignore adducts/salts after hydrate-style separators.
    formula = re.split(r"[.·●•]", formula, maxsplit=1)[0]

    # Remove trailing charge, e.g. +, -, 2+, 3-
    formula = re.sub(r"(\d*[+-])$", "", formula)

    return _parse_formula_part(formula)


def _parse_formula_part(part: str) -> dict[str, int]:
    """
    Parse one part of a formula (no hydrates).
    Handles nested parentheses and element counts.
    """

    stack = [Counter()]
    i = 0

    while i < len(part):
        char = part[i]

        if char == "(":
            stack.append(Counter())
            i += 1
        elif char == ")":
            if len(stack) == 1:
                raise ValueError(f"Unmatched closing parenthesis in formula: {part}")

            i += 1
            multiplier, i = _read_number(part, i)
            group_counts = stack.pop()

            for element, count in group_counts.items():
                stack[-1][element] += count * multiplier
        elif char.isupper():
            element = char
            i += 1

            if i < len(part) and part[i].islower():
                element += part[i]
                i += 1

            count, i = _read_number(part, i)
            stack[-1][element] += count
        else:
            raise ValueError(f"Unexpected character in formula: {char}")

    if len(stack) != 1:
        raise ValueError(f"Unclosed parenthesis in formula: {part}")

    return dict(stack[0])


def _read_number(text: str, i: int) -> tuple[int, int]:
    start = i

    while i < len(text) and text[i].isdigit():
        i += 1

    if start == i:
        return 1, i

    return int(text[start:i]), i
