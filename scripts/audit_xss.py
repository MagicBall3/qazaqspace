"""Аудит: XSS и SQL-инъекции в клиентском коде.

Вместо « flagged every ${}» здесь taint-анализ: отслеживаем, попадают ли
данные, которыми управляет пользователь, в HTML-приёмник без экранирования.

ИСТОЧНИКИ (tainted)
  profile.*, author.*, post.*, work.*, existing.*, params.*, query.get(),
  localStorage/sessionStorage, reply.text, message.text, input.value,
  form.*.value, error.message

ПРИЁМНИКИ (sinks)
  innerHTML, outerHTML, insertAdjacentHTML, document.write,
  шаблонная строка, присваиваемая в .html или в переменную разметки.

САНИТИЗАТОРЫ (обезвреживают)
  esc(), safeUrl(), initial(), Number(), parseInt(), toLocaleDateString(),
  formatDate(), statusLabel(), levelLabel(), icon()

Дополнительно ищет динамический SQL и небезопасные фильтры PostgREST.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TAINT = re.compile(
    r'\b('
    r'profile\??\.|author\??\.|post\??\.|work\??\.|existing\??\.'
    r'|params\??\.|query\.get|searchParams'
    r'|localStorage|sessionStorage'
    r'|reply\??\.|message\??\.'
    r'|input\.value|textarea\.value|form\.\w+\.value'
    r'|error\.message|err\.message'
    r'|userData|displayName|avatarUrl'
    r')\w*'
)

SANITIZERS = re.compile(
    r'\b(esc|safeUrl|initial|Number|parseInt|parseFloat|toFixed'
    r'|toLocaleDateString|toLocaleString|formatDate|statusLabel'
    r'|levelLabel|statusBadge|icon|progressBar|emptyState)\s*\('
)

SINKS = re.compile(
    r'\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|document\.write\s*\('
)

# Внутренние идентификаторы из наших JSON: id вида word_123, sent_01, q_01,
# station_03, lesson_*, culture_*, media_*, speak_*, err_*, prov_*.
SAFE_ID = re.compile(
    r"^\s*[\w.]*(id|Id|level|topic|status|status|length|count|Count|index"
    r"|percent|pct|plays|score|total|best|max|grade|xp|rank|value)\b"
    r"|^\s*[\w.]*\.(id|level|length|score|total|plays)\b"
    r"|^\s*(word|sent|prov|q|station|lesson|culture|media|speak|err|work)_"
    r"|^\s*['\"`]?\w+['\"`]?\s*$"
)

findings = []

for path in sorted((ROOT / 'assets/js').rglob('*.js')):
    if 'vendor' in str(path):
        continue
    text = path.read_text(encoding='utf-8')
    rel = path.relative_to(ROOT)
    lines = text.splitlines()

    for i, line in enumerate(lines, 1):
        # 1. Tainted -> innerHTML напрямую
        for m in SINKS.finditer(line):
            rhs = line[m.end():]
            if SANITIZERS.search(line) or 'esc(' in line:
                continue
            if not TAINT.search(rhs) and not TAINT.search(line):
                continue
            findings.append(
                f'{rel}:{i}: tainted → {m.group(0)} — нужен esc()/safeUrl()')

        # 2. Tainted в атрибуте src/href
        for m in re.finditer(r'(?:src|href)="([^"]*)"', line):
            val = m.group(1)
            if '${' not in val:
                continue
            inner = val[val.find('${'):]
            if not TAINT.search(inner):
                continue
            if SANITIZERS.search(inner) or 'safeUrl(' in inner:
                continue
            findings.append(
                f'{rel}:{i}: атрибут {m.group(0)[:40]}… из пользовательских данных')

        # 3. Динамический SQL / конкатенация в запросе
        for pat, label in [
            (r'\.or\(\s*[`\'"][^)]*\$\{', 'PostgREST .or() с интерполяцией'),
            (r'\.filter\(\s*[^,]+,\s*[`\'"][^"\']*\$\{',
             'PostgREST .filter() с интерполяцией'),
            (r'\.textSearch\([^)]*\$\{', 'textSearch с интерполяцией'),
            (r'\beval\s*\(', 'eval()'),
            (r'new\s+Function\s*\(', 'new Function()'),
        ]:
            if re.search(pat, line):
                findings.append(f'{rel}:{i}: {label}')

    # 4. Проверка, что в .or()/.filter() нет контакенации вообще
    for m in re.finditer(r'\.(or|filter)\(\s*([`\'"])(.*?)\2', text, re.S):
        arg = m.group(3)
        if '${' in arg:
            line = text[:m.start()].count('\n') + 1
            findings.append(
                f'{rel}:{line}: {m.group(1)}() содержит ${{}} — '
                f'используйте параметризованные .eq()')

# 5. Опасные API
for path in sorted((ROOT / 'assets/js').rglob('*.js')):
    if 'vendor' in str(path):
        continue
    text = path.read_text(encoding='utf-8')
    rel = path.relative_to(ROOT)
    for pat, label in [
        (r'\beval\s*\(', 'eval()'),
        (r'new\s+Function\s*\(', 'new Function()'),
        (r'document\.write\s*\(', 'document.write()'),
    ]:
        for m in re.finditer(pat, text):
            line = text[:m.start()].count('\n') + 1
            findings.append(f'{rel}:{line}: {label}')

print('Просканировано JS-файлов:', len(
    [p for p in (ROOT / 'assets/js').rglob('*.js') if 'vendor' not in str(p)]))
print()
if findings:
    print('НАЙДЕНО (проверить):')
    for f in sorted(set(findings)):
        print('  -', f)
    sys.exit(1)
print('Проблем не найдено.')
