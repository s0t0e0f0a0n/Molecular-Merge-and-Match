import re
from xml.etree.ElementTree import Element, register_namespace

from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException

SVG_NAMESPACE = "http://www.w3.org/2000/svg"
XLINK_NAMESPACE = "http://www.w3.org/1999/xlink"
XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace"

# Without these, serialisation emits `ns0:` prefixes, which the frontend's HTML
# parser (innerHTML) does not recognise as SVG elements.
register_namespace("", SVG_NAMESPACE)
register_namespace("xlink", XLINK_NAMESPACE)

_ALLOWED_ELEMENTS = {
    "a",
    "circle",
    "clipPath",
    "defs",
    "desc",
    "ellipse",
    "g",
    "image",
    "line",
    "linearGradient",
    "marker",
    "mask",
    "path",
    "pattern",
    "polygon",
    "polyline",
    "radialGradient",
    "rect",
    "stop",
    "svg",
    "symbol",
    "text",
    "textPath",
    "title",
    "tspan",
    "use",
}

_ALLOWED_ATTRIBUTES = {
    "alignment-baseline",
    "baseline-shift",
    "class",
    "clip-path",
    "clip-rule",
    "color",
    "cx",
    "cy",
    "d",
    "dx",
    "dy",
    "fill",
    "fill-opacity",
    "fill-rule",
    "filter",
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "gradientTransform",
    "gradientUnits",
    "height",
    "id",
    "letter-spacing",
    "marker-end",
    "marker-mid",
    "marker-start",
    "mask",
    "offset",
    "opacity",
    "points",
    "preserveAspectRatio",
    "r",
    "refX",
    "refY",
    "role",
    "rx",
    "ry",
    "shape-rendering",
    "spreadMethod",
    "stop-color",
    "stop-opacity",
    "stroke",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "stroke-width",
    "text-anchor",
    "textLength",
    "transform",
    "vector-effect",
    "version",
    "viewBox",
    "visibility",
    "width",
    "x",
    "x1",
    "x2",
    "y",
    "y1",
    "y2",
}

_STYLE_PROPERTIES = _ALLOWED_ATTRIBUTES | {
    "display",
    "dominant-baseline",
    "font-variant",
    "paint-order",
    "text-decoration",
    "text-rendering",
}
_URL_ATTRIBUTES = {
    "clip-path",
    "fill",
    "filter",
    "mask",
    "marker-end",
    "marker-mid",
    "marker-start",
    "stroke",
}
_LOCAL_URL_RE = re.compile(r"url\(\s*(['\"]?)#[^\s)'\"<>]+\1\s*\)", re.IGNORECASE)
_URL_RE = re.compile(r"url\s*\(", re.IGNORECASE)
_SAFE_DATA_IMAGE_RE = re.compile(
    r"data:image/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}", re.IGNORECASE
)


def _local_name(name: str) -> tuple[str | None, str]:
    if name.startswith("{"):
        namespace, local_name = name[1:].split("}", 1)
        return namespace, local_name
    return None, name


def _is_safe_href(value: str) -> bool:
    return bool(
        re.fullmatch(r"#[^\s\"'<>]+", value)
        or _SAFE_DATA_IMAGE_RE.fullmatch(value)
    )


def _has_only_local_urls(value: str) -> bool:
    if "\\" in value or "/*" in value or "*/" in value:
        return False
    return not _URL_RE.search(value) or bool(
        _LOCAL_URL_RE.fullmatch(value.strip())
    )


def _sanitize_style(value: str) -> str:
    safe_declarations = []
    for declaration in value.split(";"):
        property_name, separator, property_value = declaration.partition(":")
        property_name = property_name.strip()
        property_value = property_value.strip()
        if (
            not separator
            or property_name not in _STYLE_PROPERTIES
            or not property_value
            or re.search(
                r"expression|javascript|@import|behavior",
                property_value,
                re.IGNORECASE,
            )
            or not _has_only_local_urls(property_value)
        ):
            continue
        safe_declarations.append(f"{property_name}: {property_value}")
    return "; ".join(safe_declarations)


def _sanitize_element(element: Element) -> bool:
    namespace, local_name = _local_name(element.tag)
    if namespace not in (None, SVG_NAMESPACE) or local_name not in _ALLOWED_ELEMENTS:
        return False

    for attribute_name, value in list(element.attrib.items()):
        attribute_namespace, attribute_local_name = _local_name(attribute_name)
        if attribute_local_name.lower().startswith("on"):
            del element.attrib[attribute_name]
        elif attribute_local_name == "href":
            if (
                attribute_namespace not in (None, XLINK_NAMESPACE)
                or not _is_safe_href(value)
            ):
                del element.attrib[attribute_name]
        elif attribute_namespace == XML_NAMESPACE and attribute_local_name == "space":
            if value not in {"default", "preserve"}:
                del element.attrib[attribute_name]
        elif (
            attribute_namespace is not None
            or attribute_local_name not in _ALLOWED_ATTRIBUTES | {"style"}
        ):
            del element.attrib[attribute_name]
        elif attribute_local_name == "style":
            safe_style = _sanitize_style(value)
            if safe_style:
                element.attrib[attribute_name] = safe_style
            else:
                del element.attrib[attribute_name]
        elif attribute_local_name in _URL_ATTRIBUTES and not _has_only_local_urls(value):
            del element.attrib[attribute_name]

    for child in list(element):
        if not _sanitize_element(child):
            element.remove(child)
    return True


def sanitize_svg(svg_text: str) -> str:
    try:
        root = ElementTree.fromstring(svg_text)
    except (DefusedXmlException, ElementTree.ParseError) as exc:
        raise ValueError("SVG must be well-formed XML.") from exc

    namespace, local_name = _local_name(root.tag)
    if local_name != "svg" or namespace not in (None, SVG_NAMESPACE):
        raise ValueError("Document root must be an SVG element.")
    _sanitize_element(root)
    return ElementTree.tostring(root, encoding="unicode")
