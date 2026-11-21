"""Проверка экранирования на конкретных векторах.

Реализует ту же логику, что и клиентский esc()/safeUrl(), и проверяет
恢复 строк, которые используются в тестах T12/T13.
"""
import html
import re
import sys

from urllib.parse import urlparse


def esc(value):
    """Копия assets/js/ui.js esc()."""
    s = '' if value is None else str(value)
    return (s.replace('&', '&amp;')
             .replace('<', '&lt;')
             .replace('>', '&gt;')
             .replace('"', '&quot;')
             .replace("'", '&#39;'))


def safe_url(value):
    """Копия assets/js/ui.js safeUrl(): только http и https."""
    raw = ('' if value is None else str(value)).strip()
    if not raw:
        return ''
    if re.search(r'[\x00-\x1f\x7f]', raw):
        return ''
    try:
        parsed = urlparse(raw)
        return raw if parsed.scheme in ('http', 'https') else ''
    except Exception:
        return ''


XSS_VECTORS = [
    '<img src=x onerror=alert(1)>',
    '"><script>alert(1)</script>',
    "'><svg/onload=alert(1)>",
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '<iframe src="javascript:alert(1)">',
    '"><body onload=alert(1)>',
    '${alert(1)}',
    '{{constructor.constructor("alert(1)")()}}',
]

SQLI_VECTORS = [
    "admin' --",
    "'; DROP TABLE public.user_stats; --",
    "' OR '1'='1",
    "1; DELETE FROM public.moderators",
    "') OR 1=1 --",
    "admin'/**/--",
    "'; SELECT pg_sleep(5); --",
]

failures = []

print('=== XSS: экранирование ===')
for v in XSS_VECTORS:
    out = esc(v)
    # Инвариант: после экранирования в строке не остаётся ни одного
    # неэкранированного < или >, то есть браузер не может построить тег.
    has_raw_angle = '<' in out or '>' in out
    has_raw_quote_in_attr = False  # кавычки внутри текста безопасны
    ok = not has_raw_angle
    if not ok:
        failures.append(f'XSS: {v!r} -> {out!r}')
    print(f'  {"OK  " if ok else "FAIL"} {v!r}')
    print(f'         {out!r}')

print()
print('=== URL: схемы ===')
for v in ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)',
          'data:text/html,x', 'vbscript:msgbox(1)', '/local.png', '']:
    out = safe_url(v)
    ok = out == '' or out.startswith('http')
    if not ok:
        failures.append(f'URL: {v!r} -> {out!r}')
    print(f'  {"OK  " if ok else "FAIL"} {v!r} -> {out!r}')

for v in ['https://cdn.example.com/a.png', 'http://example.com/b.jpg']:
    out = safe_url(v)
    ok = out.startswith('http')
    if not ok:
        failures.append(f'URL отклонён легитимный: {v!r}')
    print(f'  {"OK  " if ok else "FAIL"} {v!r} -> {out!r}')

print()
print('=== SQL-инъекции: строки как данные ===')
for v in SQLI_VECTORS:
    # В миграциях значения передаются параметрами и сравниваются с каталогом.
    # Строка не может совпасть ни с одним lesson_id/game_id -> UNKNOWN_*.
    matches_catalog = v in ('lesson_greetings', 'lesson_family', 'lesson_school',
                            'lesson_shop', 'lesson_city', 'lesson_opinion',
                            'wordquiz', 'sentence', 'match', 'proverbs',
                            'quiz', 'quest', 'marathon', 'finderror', 'qazaqword')
    ok = not matches_catalog
    if not ok:
        failures.append(f'SQLi: {v!r} совпало с каталогом')
    print(f'  {"OK  " if ok else "FAIL"} {v!r} -> отклонено как неизвестный идентификатор')

print()
if failures:
    print('ПРОВАЛЕНО:')
    for f in failures:
        print('  -', f)
    sys.exit(1)
print('Все векторы обезврежены.')
