from uuid import uuid4

from app.api.nmrium_svg_exports import SVG_TEMP_ROOT


def test_temporary_nmrium_svg_is_saved_and_served(client):
    draft_id = str(uuid4())
    response = client.post(
        "/api/v1/nmrium-svg-exports/temp",
        json={
            "draft_id": draft_id,
            "spectra": [
                {
                    "id": "spectrum-1",
                    "name": "Proton spectrum",
                    "nucleus": "1H",
                    "svg_text": (
                        '<svg xmlns="http://www.w3.org/2000/svg" '
                        'viewBox="0 0 3307 1323"><path stroke="#000000"/></svg>'
                    ),
                }
            ],
        },
    )

    assert response.status_code == 200
    saved = response.json()[0]
    assert saved["url"] == f"/nmrium-temp/{draft_id}_001.svg"
    file_path = SVG_TEMP_ROOT / saved["file_name"]
    try:
        assert file_path.read_text(encoding="utf-8").startswith("<svg")
        preview = client.get(saved["url"])
        assert preview.status_code == 200
        assert "viewBox" in preview.text
    finally:
        file_path.unlink(missing_ok=True)


def test_temporary_nmrium_svg_rejects_script_elements(client):
    response = client.post(
        "/api/v1/nmrium-svg-exports/temp",
        json={
            "draft_id": str(uuid4()),
            "spectra": [
                {
                    "id": "spectrum-1",
                    "name": "Unsafe spectrum",
                    "nucleus": "1H",
                    "svg_text": (
                        '<svg xmlns="http://www.w3.org/2000/svg">'
                        "<script>alert(1)</script></svg>"
                    ),
                }
            ],
        },
    )

    assert response.status_code == 422
