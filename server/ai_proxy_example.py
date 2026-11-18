#!/usr/bin/env python3
"""
QAZAQ SPACE — пример серверного прокси для AI LAB.

Зачем нужен прокси:
    Ключ API нельзя хранить в браузере. Браузер обращается к /api/ai,
    а сервер уже сам добавляет ключ и вызывает провайдера.

Запуск (PowerShell):
    $env:OPENAI_API_KEY = "ваш-ключ"
    $env:OPENAI_MODEL   = "ваша-модель"
    $env:OPENAI_BASE_URL = "https://api.openai.com/v1"   # можно не задавать
    python server/ai_proxy_example.py

Затем в assets/js/config.js:
    ai: { endpoint: '/api/ai', ... }

Откройте адрес, который напечатает сервер: http://127.0.0.1:8787

Пример намеренно минимальный. Для реальной школы добавьте:
аутентификацию, ограничение частоты запросов, журналирование без
персональных данных, политику хранения и мониторинг затрат.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_BODY = 32 * 1024
MAX_MESSAGES = 12
MAX_CONTENT = 4000
MAX_TOTAL_CHARS = 12000

SYSTEM_PROMPT = (
    "Сен QAZAQ SPACE оқу платформасының қазақ тілі мұғалімісің. "
    "Оқушылар — 5–7 сынып. Қарапайым, нақты және қысқа жауап бер. "
    "Негізгі тіл — қазақша; қажет болса орысша қысқа түсіндірме қос. "
    "Грамматиканы мысалмен түсіндір. Оқушының қатесін сыпайы түрде түзет. "
    "Жеке деректерді (телефон, мекенжай, құпия сөз) сұрама және қайталама. "
    "Нақты білмесең, ойдан құрастырма: «бұл туралы мұғалімнен сұраңыз» деп айт. "
    "Жауап 120 сөзден аспасын."
)


def fail(handler: SimpleHTTPRequestHandler, status: int, message: str) -> None:
    payload = json.dumps({"error": message}, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


def validate_messages(payload: object) -> list[dict] | None:
    if not isinstance(payload, dict):
        return None
    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        return None
    if len(messages) > MAX_MESSAGES:
        return None

    clean: list[dict] = []
    total = 0
    for message in messages:
        if not isinstance(message, dict):
            return None
        role = message.get("role")
        content = message.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str):
            return None
        content = content.strip()
        if not content or len(content) > MAX_CONTENT:
            return None
        total += len(content)
        clean.append({"role": role, "content": content})

    if total > MAX_TOTAL_CHARS:
        return None
    return clean


def call_provider(messages: list[dict], level: int) -> str:
    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY не задан")

    system = f"{SYSTEM_PROMPT} Оқушы деңгейі: {level} (1=5 сынып, 3=7 сынып)."
    body = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": system}, *messages],
        "temperature": 0.4,
        "max_tokens": 500,
    }, ensure_ascii=False).encode("utf-8")

    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=35) as response:
        data = json.loads(response.read().decode("utf-8"))

    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("Провайдер вернул пустой ответ")
    content = choices[0].get("message", {}).get("content")
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Провайдер вернул ответ без текста")
    return content.strip()


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def allowed_origin(self) -> str | None:
        origin = self.headers.get("Origin", "")
        allowed = os.environ.get("ALLOWED_ORIGIN", "").strip()
        if allowed and origin == allowed:
            return origin
        if origin in {"http://127.0.0.1:5173", "http://localhost:5173"}:
            return origin
        return None

    def do_OPTIONS(self) -> None:  # noqa: N802
        origin = self.allowed_origin()
        self.send_response(204)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?")[0] != "/api/ai":
            fail(self, 404, "Маршрут табылмады / маршрут не найден")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            fail(self, 400, "Некорректный Content-Length")
            return
        if length <= 0 or length > MAX_BODY:
            fail(self, 413, "Слишком большой или пустой запрос")
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            fail(self, 400, "Некорректный JSON")
            return

        messages = validate_messages(payload)
        if messages is None:
            fail(self, 400, "Некорректный формат messages")
            return

        level = payload.get("level")
        level = level if isinstance(level, int) and 1 <= level <= 3 else 1

        try:
            reply = call_provider(messages, level)
        except urllib.error.HTTPError as exc:
            # Не раскрываем ключ и тело ответа провайдера ученику.
            print(f"[ai-proxy] provider HTTP {exc.code}", file=sys.stderr)
            fail(self, 502, "Провайдер ИИ вернул ошибку")
            return
        except Exception as exc:  # noqa: BLE001
            print(f"[ai-proxy] {type(exc).__name__}: {exc}", file=sys.stderr)
            fail(self, 502, "Не удалось получить ответ от провайдера")
            return

        output = json.dumps(
            {"reply": reply, "provider": os.environ.get("OPENAI_MODEL", "server")},
            ensure_ascii=False,
        ).encode("utf-8")

        origin = self.allowed_origin()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Content-Length", str(len(output)))
        self.end_headers()
        self.wfile.write(output)


def main() -> int:
    if not os.environ.get("OPENAI_API_KEY", "").strip():
        print("Ошибка: задайте переменную окружения OPENAI_API_KEY.", file=sys.stderr)
        print('PowerShell: $env:OPENAI_API_KEY = "ваш-ключ"', file=sys.stderr)
        return 1

    os.chdir(ROOT)
    host = os.environ.get("HOST", "127.0.0.1")
    try:
        port = int(os.environ.get("PORT", "8787"))
    except ValueError:
        print("Ошибка: PORT должен быть числом.", file=sys.stderr)
        return 2

    handler = partial(Handler, directory=str(ROOT))
    server = ThreadingHTTPServer((host, port), handler)
    print(f"QAZAQ SPACE + AI proxy: http://{host}:{port}")
    print("Endpoint: /api/ai · ключ читается только из окружения сервера")
    print("Остановить: Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановлено.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
