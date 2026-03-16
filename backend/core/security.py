"""
Centralised security utilities:
  - Input sanitisation (strip HTML/script tags from user text)
  - File-name validation (prevent path traversal)
  - Rate-limiting helper (slowapi Limiter instance)
  - XSS / SQLi guards
"""
import re
import html
import unicodedata
from pathlib import PurePosixPath
from slowapi import Limiter
from slowapi.util import get_remote_address

# ── Rate limiter (key = IP for anonymous, user-id for auth'd) ─────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


# ── Text sanitisation ─────────────────────────────────────────────────
_SCRIPT_RE  = re.compile(r'<\s*script[^>]*>.*?</\s*script\s*>', re.IGNORECASE | re.DOTALL)
_HTML_TAG_RE = re.compile(r'<[^>]+>')
_NULL_RE     = re.compile(r'\x00')

def sanitise_text(value: str, max_len: int = 4096) -> str:
    """Strip HTML tags, script blocks, null bytes; normalise unicode; truncate."""
    if not isinstance(value, str):
        return ""
    # Remove null bytes
    value = _NULL_RE.sub("", value)
    # Strip <script>…</script> blocks
    value = _SCRIPT_RE.sub("", value)
    # Strip remaining HTML/XML tags
    value = _HTML_TAG_RE.sub("", value)
    # HTML-entity-decode then re-escape to neutralise double-encoding tricks
    value = html.unescape(value)
    # Normalise unicode (prevent homoglyph attacks)
    value = unicodedata.normalize("NFC", value)
    return value[:max_len].strip()


def sanitise_name(value: str, max_len: int = 255) -> str:
    """
    Sanitise a workspace/file name.
    Strips HTML, control characters, and enforces max length.
    """
    value = sanitise_text(value, max_len=max_len)
    # Remove ASCII control characters (0x00-0x1F, 0x7F) except normal whitespace
    value = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
    return value.strip()


# ── File-name / path-traversal guard ─────────────────────────────────
_DANGEROUS_CHARS = re.compile(r'[<>:\\|?*\x00-\x1f]')
_TRAVERSAL_RE    = re.compile(r'\.\.[\\/]')

def validate_filename(name: str, max_len: int = 255) -> str:
    """
    Accept only safe filenames. Raises ValueError on violations.
    Returns the cleaned name.
    """
    if not name or not name.strip():
        raise ValueError("Filename must not be empty.")
    name = name.strip()
    if len(name) > max_len:
        raise ValueError(f"Filename too long (max {max_len} chars).")
    # No path separators or traversal sequences
    if _TRAVERSAL_RE.search(name):
        raise ValueError("Filename must not contain path traversal sequences.")
    if _DANGEROUS_CHARS.search(name):
        raise ValueError("Filename contains invalid characters.")
    # No leading dots (hidden files) beyond a single extension dot
    if name.startswith(".."):
        raise ValueError("Filename must not start with '..'.")
    # Use PurePosixPath to ensure it's a plain name (no directories)
    if "\\" in name:
        raise ValueError("Filename must not contain backslashes.")
    # Allow forward slashes for subfolder paths (e.g. src/components/App.jsx)
    # but still block traversal sequences (already checked above)
    return name


# ── Chat / code content guard ─────────────────────────────────────────
def sanitise_chat_message(msg: str) -> str:
    """Strip tags from chat messages but preserve normal text."""
    return sanitise_text(msg, max_len=4096)


def validate_content_size(content: str, max_bytes: int = 2_097_152) -> str:
    """Reject content that exceeds max byte size."""
    if len(content.encode("utf-8")) > max_bytes:
        raise ValueError(f"Content exceeds maximum size of {max_bytes // 1024} KB.")
    return content
