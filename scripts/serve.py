#!/usr/bin/env python3
"""
QAZAQ SPACE — локальный сервер для разработки.

Запуск:
    python scripts/serve.py
    python scripts/serve.py 5173

Отдаёт файлы проекта с заголовком Cache-Control: no-store, чтобы браузер
не держал устаревшие ES-модули и JSON после правок. Для продакшена
используйте обычный статический хостинг.
"""
from __future__ import annotations

import http.server
import os
import socketserver
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
    }

    def end_headers(self) -> None:  # noqa: D401
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[qazaqspace] " + fmt % args + "\n")


def main() -> int:
    port = 5173
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("Порт должен быть числом, например: python scripts/serve.py 5173")
            return 2

    os.chdir(ROOT)
    handler = partial(NoCacheHandler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
            print(f"QAZAQ SPACE: http://127.0.0.1:{port}")
            print("Остановить: Ctrl+C")
            httpd.serve_forever()
    except OSError as exc:
        print(f"Не удалось запустить сервер на порту {port}: {exc}")
        return 1
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
