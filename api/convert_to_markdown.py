"""
Converts an uploaded file (PDF, Excel, CSV, Word...) to Markdown with Microsoft's MarkItDown.

The Next.js server calls this function with a short-lived signed URL of the file in the private "documents" bucket plus the
signed-in user's access token. Nothing is converted for anyone who is not signed in, and only files from this project's own
Supabase storage can be fetched (so the function cannot be used to download arbitrary web addresses).
"""
import json
import os
import tempfile
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
MAX_MARKDOWN_CHARS = 1_500_000

_converter = None


def _get_converter():
    global _converter
    if _converter is None:
        from markitdown import MarkItDown  # imported lazily so a failed import is reported as a clear JSON error

        _converter = MarkItDown(enable_plugins=False)
    return _converter


def _supabase_base() -> str:
    return os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")


def _user_is_signed_in(token: str) -> bool:
    base = _supabase_base()
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    if not base or not key or not token:
        return False
    request = urllib.request.Request(f"{base}/auth/v1/user", headers={"apikey": key, "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status == 200
    except Exception:
        return False


def _download(url: str, destination: str) -> int:
    total = 0
    with urllib.request.urlopen(url, timeout=40) as response, open(destination, "wb") as out:
        while True:
            chunk = response.read(1024 * 256)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_DOWNLOAD_BYTES:
                raise ValueError("file_too_large")
            out.write(chunk)
    return total


def convert_url(url: str, filename: str) -> dict:
    """Core logic (also used directly by the local tests): download the file and convert it."""
    extension = os.path.splitext(filename)[1].lower() or ".bin"
    started = time.time()
    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "file" + extension)
        size = _download(url, path)
        result = _get_converter().convert(path)
    text = (result.text_content or "").strip()
    truncated = len(text) > MAX_MARKDOWN_CHARS
    return {
        "markdown": text[:MAX_MARKDOWN_CHARS],
        "chars": len(text),
        "truncated": truncated,
        "bytes": size,
        "seconds": round(time.time() - started, 2),
        "converter": "markitdown",
    }


class handler(BaseHTTPRequestHandler):
    def _reply(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # a quick health check (no conversion, no data)
        self._reply(200, {"ok": True, "service": "markitdown"})

    def do_POST(self):
        try:
            length = int(self.headers.get("content-length") or 0)
            if length <= 0 or length > 20_000:
                return self._reply(400, {"error": "bad_request", "message": "Expected a small JSON body."})
            payload = json.loads(self.rfile.read(length))
            url = str(payload.get("url") or "")
            filename = str(payload.get("filename") or "file")
            auth = self.headers.get("authorization") or ""
            token = auth[7:] if auth.lower().startswith("bearer ") else ""

            if not _user_is_signed_in(token):
                return self._reply(401, {"error": "unauthorized", "message": "Sign in to convert files."})
            allowed_prefix = _supabase_base() + "/storage/v1/object/sign/documents/"
            if not _supabase_base() or not url.startswith(allowed_prefix):
                return self._reply(400, {"error": "bad_url", "message": "Only files in this system's document storage can be converted."})

            return self._reply(200, convert_url(url, filename))
        except ValueError as err:
            if str(err) == "file_too_large":
                return self._reply(413, {"error": "file_too_large", "message": "The file is over the 25 MB conversion limit."})
            return self._reply(400, {"error": "bad_request", "message": "The request could not be understood."})
        except urllib.error.HTTPError as err:
            return self._reply(502, {"error": "download_failed", "message": f"The file could not be fetched from storage (HTTP {err.code})."})
        except Exception as err:  # conversion problems must come back as a readable reason, never a platform error page
            return self._reply(500, {"error": "conversion_failed", "message": f"{type(err).__name__}: {str(err)[:300]}"})
