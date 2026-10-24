#!/usr/bin/env python3
"""Serve SmartQuote and proxy /api to a local AstrBot dashboard."""

from __future__ import annotations

import http.client
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ASTRBOT_HOST = "127.0.0.1"
ASTRBOT_PORT = 6185
LISTEN_PORT = 8080
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
}


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        if self.path.startswith("/api"):
            self.proxy()
            return
        super().do_GET()

    def do_POST(self):
        self._api_or_404()

    def do_PUT(self):
        self._api_or_404()

    def do_PATCH(self):
        self._api_or_404()

    def do_DELETE(self):
        self._api_or_404()

    def _api_or_404(self):
        if self.path.startswith("/api"):
            self.proxy()
            return
        self.send_error(404)

    def proxy(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length else None
        headers = {}
        for key in ("Authorization", "Content-Type", "Accept", "Accept-Language"):
            value = self.headers.get(key)
            if value:
                headers[key] = value
        target = urlsplit(self.path)
        path = target.path + (("?" + target.query) if target.query else "")
        conn = http.client.HTTPConnection(ASTRBOT_HOST, ASTRBOT_PORT, timeout=300)
        try:
            conn.request(self.command, path, body=body, headers=headers)
            resp = conn.getresponse()
            self.send_response(resp.status)
            for key, value in resp.getheaders():
                if key.lower() in HOP_BY_HOP:
                    continue
                self.send_header(key, value)
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    self.wfile.write(b"0\r\n\r\n")
                    break
                self.wfile.write(f"{len(chunk):X}\r\n".encode("ascii"))
                self.wfile.write(chunk)
                self.wfile.write(b"\r\n")
                self.wfile.flush()
        except OSError as exc:
            message = f"AstrBot 未响应（{ASTRBOT_HOST}:{ASTRBOT_PORT}）：{exc}".encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)
        finally:
            conn.close()


def main():
    server = ThreadingHTTPServer(("127.0.0.1", LISTEN_PORT), Handler)
    print(f"SmartQuote http://127.0.0.1:{LISTEN_PORT}/  ->  AstrBot :{ASTRBOT_PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
