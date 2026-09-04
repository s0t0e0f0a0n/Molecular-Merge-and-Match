import pytest

from app.api.warnings import (
    AtomCountDBERequest,
    calculate_dbe,
    count_atoms_in_fragments,
    count_atoms_in_smiles,
    exceeds_formula,
    parse_formula,
    receive_warnings,
)


def test_count_atoms_complex_molecule_with_chlorine():
    counts = count_atoms_in_smiles("N#Cc1cc(C(=O)O)ccc1C(Cl)(Cl)Cl")
    print(str(counts))
    assert counts["N"] == 1
    assert counts["C"] == 9
    assert counts["O"] == 2
    assert counts["Cl"] == 3
    assert counts["H"] == 4


def test_calculate_dbe_complex_molecule_with_chlorine():
    counts = {
        "N": 1,
        "C": 9,
        "O": 2,
        "Cl": 3,
        "H": 4,
    }

    dbe = calculate_dbe(counts)
    assert dbe == pytest.approx(7.0)


def test_count_atoms_normal_molecule():
    counts = count_atoms_in_smiles("OCCCCCCc1ccccc1")

    assert counts["O"] == 1
    assert counts["C"] == 12
    assert counts["H"] == 18


def test_calculate_dbe_normal_molecule():
    counts = {
        "O": 1,
        "C": 12,
        "H": 18,
    }

    dbe = calculate_dbe(counts)
    assert dbe == pytest.approx(4.0)


def test_count_atoms_charged_molecule():
    counts = count_atoms_in_smiles("CC[O-]")

    assert counts["C"] == 2
    assert counts["O"] == 1
    assert counts["H"] == 5


def test_calculate_dbe_charged_molecule():
    counts = {
        "C": 2,
        "O": 1,
        "H": 5,
    }

    dbe = calculate_dbe(counts)
    assert dbe == pytest.approx(0.5)

def test_warning_false_when_fragments_do_not_exceed_formula():
    formula_counts = parse_formula("C4H8O")
    fragment_counts = count_atoms_in_fragments(["C", "CCO"])

    assert exceeds_formula(fragment_counts, formula_counts) is False

def test_warning_false_when_hydrogen_exceeds_formula_but_hydrogen_warning_disabled():
    formula_counts = parse_formula("CH2")
    fragment_counts = count_atoms_in_fragments(["C"])

    assert exceeds_formula(fragment_counts, formula_counts) is False


def test_warning_true_when_hydrogen_exceeds_formula_and_hydrogen_warning_enabled():
    formula_counts = parse_formula("CH2")
    fragment_counts = count_atoms_in_fragments(["C"])

    assert exceeds_formula(
        fragment_counts,
        formula_counts,
        hydrogen_in_warning=True,
    ) is True

def test_warning_true_when_fragments_exceed_formula():
    formula_counts = parse_formula("C4H8O")
    fragment_counts = count_atoms_in_fragments(["CCCCC"])

    assert exceeds_formula(fragment_counts, formula_counts) is True


def test_warning_false_when_no_fragments():
    formula_counts = parse_formula("C4H8O")
    fragment_counts = count_atoms_in_fragments([])

    assert exceeds_formula(fragment_counts, formula_counts) is False


def test_warning_with_multiletter_element_and_hydrate():
    formula_counts = parse_formula("C2H6Br2·H2O")
    fragment_counts = count_atoms_in_fragments(["C(Br)(Br)Br"])

    assert exceeds_formula(fragment_counts, formula_counts) is True

def test_warning_true_when_fragment_dbe_exceeds_formula_dbe():
    formula_counts = parse_formula("C2H4Br2")
    fragment_counts = count_atoms_in_fragments(["C=C"])

    formula_dbe = calculate_dbe(formula_counts)
    fragment_dbe = calculate_dbe(fragment_counts)

    assert fragment_dbe > formula_dbe


def test_receive_warnings_ignores_hydrogen_by_default():
    response = receive_warnings(
        AtomCountDBERequest(
            type="atom_count_DBE",
            fragments=["C"],          # methane: CH4
            molecularFormula="CH2",   # too few H, but H ignored by default
            formulaDbe=None,
        )
    )

    assert response["warning"] is False


def test_receive_warnings_includes_hydrogen_when_enabled():
    response = receive_warnings(
        AtomCountDBERequest(
            type="atom_count_DBE",
            fragments=["C"],          # methane: CH4
            molecularFormula="CH2",   # H exceeds formula by 2
            formulaDbe=None,
            hydrogenInWarning=True,
        )
    )

    assert response["warning"] is True
    assert "H:" in response["info"]
