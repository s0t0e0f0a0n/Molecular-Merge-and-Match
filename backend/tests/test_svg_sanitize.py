from app.core.svg_sanitize import sanitize_svg

MNOVA_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
    ' viewBox="0 0 10 10"><title>t</title>'
    '<use xlink:href="#a"/><text xml:space="preserve" x="1" y="1">-10</text>'
    '<polyline points="0,0 1,1" fill="none" stroke="black"/></svg>'
)


def test_output_uses_default_svg_namespace_without_prefixes():
    out = sanitize_svg(MNOVA_SVG)

    assert out.startswith('<svg xmlns="http://www.w3.org/2000/svg"')
    assert "ns0:" not in out
    assert 'xlink:href="#a"' in out
    assert "<polyline" in out


def test_scripts_and_handlers_are_still_removed():
    out = sanitize_svg(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script>'
        '<rect onclick="x()" width="1" height="1"/></svg>'
    )

    assert "script" not in out
    assert "onclick" not in out
    assert "<rect" in out
