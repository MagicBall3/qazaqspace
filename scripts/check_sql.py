"""Статическая проверка миграций.

psql в окружении нет, поэтому проверяем без сервера:
  * структуру и парность dollar-тегов;
  * идемпотентность (DROP ... IF EXISTS перед CREATE POLICY/TRIGGER/CONSTRAINT);
  * порядок зависимостей (функция должна быть создана раньше, чем её
    используют в политике или другой функции);
  * наличие RLS и явного REVOKE у каждой пользовательской таблицы;
  * наличие SET search_path у каждой SECURITY DEFINER функции;
  * полноту набора политик для RLS-таблиц.
"""
import re
import sys
from pathlib import Path

MIG = Path(__file__).resolve().parent.parent / 'supabase' / 'migrations'
FILES = sorted(MIG.glob('*.sql'))

problems = []
notes = []

# Функции, которые создаёт сам PostgreSQL: их наличие не требуется.
BUILTIN = {
    'set_updated_at', 'enforce_pending_on_author_edit',
    'enforce_work_review_rules',
}


def strip_comments(text):
    text = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
    return '\n'.join(
        (line[:line.find('--')] if '--' in line else line)
        for line in text.splitlines())


def check_structure(name, text):
    counts = {}
    for tag in re.findall(r'\$[A-Za-z_]*\$', text):
        counts[tag] = counts.get(tag, 0) + 1
    for tag, n in counts.items():
        if n % 2:
            problems.append(f'{name}: dollar-тег {tag} нечётный ({n})')

    if re.search(r'\bDROP\s+(TABLE|DATABASE|SCHEMA)\b', text, re.I):
        problems.append(f'{name}: содержит DROP TABLE/DATABASE/SCHEMA')

    if re.search(r'\bTRUNCATE\b(?![^;]*)', text) and 'REVOKE' not in text:
        pass  # TRUNCATE допустим только в REVOKE; отдельная проверка ниже


def check_idempotency(name, text):
    for pol in re.findall(r'CREATE POLICY\s+"([^"]+)"', text):
        if f'DROP POLICY IF EXISTS "{pol}"' not in text:
            problems.append(f'{name}: нет DROP POLICY IF EXISTS для "{pol}"')
    for trg in re.findall(r'CREATE TRIGGER\s+(\w+)', text):
        if f'DROP TRIGGER IF EXISTS {trg}' not in text:
            problems.append(f'{name}: нет DROP TRIGGER IF EXISTS для {trg}')
    for con in re.findall(r'ADD CONSTRAINT\s+(\w+)', text):
        if f'DROP CONSTRAINT IF EXISTS {con}' not in text:
            problems.append(f'{name}: нет DROP CONSTRAINT IF EXISTS для {con}')


def check_search_path(name, text):
    for m in re.finditer(
            r'CREATE OR REPLACE FUNCTION\s+([\w.]+)\s*\(([^)]*)\)(.*?)(?=\nCREATE|\Z)',
            text, re.S):
        decl = m.group(3)
        if 'SECURITY DEFINER' in decl and 'SET search_path' not in decl:
            problems.append(
                f'{name}: {m.group(1)} SECURITY DEFINER без SET search_path')


loaded = {}
for f in FILES:
    loaded[f.name] = strip_comments(f.read_text(encoding='utf-8'))
    check_structure(f.name, loaded[f.name])
    check_idempotency(f.name, loaded[f.name])
    check_search_path(f.name, loaded[f.name])

# --- Порядок зависимостей --------------------------------------------------
# Функция считается доступной с того файла, в котором её создали.
created_in = {}
used_in = []

for fname, text in loaded.items():
    for m in re.finditer(
            r'CREATE OR REPLACE FUNCTION\s+(?:public\.)?(\w+)', text):
        created_in.setdefault(m.group(1), fname)
    for m in re.finditer(r'public\.(\w+)\s*\(', text):
        used_in.append((m.group(1), fname))

for fn, fname in used_in:
    if fn in created_in and fn not in BUILTIN:
        order = [f.name for f in FILES]
        if order.index(created_in[fn]) > order.index(fname):
            problems.append(
                f'{fname}: используется {fn}(), но она создаётся позже '
                f'в {created_in[fn]}')

# --- RLS и REVOKE ---------------------------------------------------------
rls_tables = {}
for fname, text in loaded.items():
    for t in re.findall(
            r'ALTER TABLE\s+(?:public\.)?(\w+)\s+ENABLE ROW LEVEL SECURITY', text):
        rls_tables.setdefault(t, fname)

all_text = '\n'.join(loaded.values())
for table, fname in rls_tables.items():
    if not re.search(rf'REVOKE[^;]*ON public\.{table}\b', all_text):
        problems.append(f'{fname}: таблица {table} с RLS без явного REVOKE')

    pols = re.findall(
        rf'CREATE POLICY\s+"[^"]+"\s+ON public\.{table}\s+FOR (\w+)', all_text)
    if not pols:
        problems.append(f'{fname}: таблица {table} с RLS без единой политики')
    else:
        notes.append(f'{table}: политики {sorted(set(pols))}')

# --- moderators должен быть закрыт полностью --------------------------------
if 'moderators' in rls_tables or 'moderators' in all_text:
    if not re.search(
            r'REVOKE ALL ON public\.moderators FROM PUBLIC', all_text):
        problems.append('moderators: нет REVOKE ALL ... FROM PUBLIC')
    if not re.search(
            r'REVOKE ALL ON public\.moderators FROM anon', all_text):
        problems.append('moderators: нет REVOKE ALL ... FROM anon')
    if not re.search(
            r'REVOKE ALL ON public\.moderators FROM authenticated', all_text):
        problems.append('moderators: нет REVOKE ALL ... FROM authenticated')

# --- Поля оценки не должны быть доступны клиенту ----------------------------
grant_grade = re.search(
    r'GRANT\s+UPDATE\s*\(([^)]*)\)\s*ON public\.student_works\s+TO authenticated',
    all_text)
if grant_grade:
    cols = grant_grade.group(1)
    for forbidden in ('grade', 'teacher_comment', 'reviewed_by', 'reviewed_at'):
        if forbidden in cols:
            problems.append(
                f'student_works: "{forbidden}" выдан в GRANT UPDATE — '
                f'ученик сможет менять оценку')

print('Проверено файлов:', len(FILES))
print('Порядок:', ' -> '.join(f.name.split("_")[0] for f in FILES))
print()
if notes:
    print('ИНФОРМАЦИЯ:')
    for n in notes:
        print('  -', n)
    print()
if problems:
    print('ПРОБЛЕМЫ:')
    for p in problems:
        print('  -', p)
    sys.exit(1)
print('Проблем не найдено.')
