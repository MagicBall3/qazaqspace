"""Аудит SQL-миграций: динамический SQL, search_path, RLS, column-level INSERT.

Дополняет check_sql.py (идемпотентность и порядок зависимостей).
"""
import re
import sys
from pathlib import Path

MIG = Path(__file__).resolve().parent.parent / 'supabase' / 'migrations'
FILES = sorted(MIG.glob('*.sql'))

problems = []


def strip_comments(text):
    text = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
    return '\n'.join(
        (line[:line.find('--')] if '--' in line else line)
        for line in text.splitlines())


all_text = ''
per_file = {}
for f in FILES:
    body = strip_comments(f.read_text(encoding='utf-8'))
    per_file[f.name] = body
    all_text += '\n' + body

# 1. Динамический SQL внутри функций
for fname, text in per_file.items():
    for m in re.finditer(r'\bEXECUTE\s+(?!FUNCTION\b|PROCEDURE\b)', text, re.I):
        line = text[:m.start()].count('\n') + 1
        context = text[max(0, m.start() - 40):m.start()].lower()
        if 'grant' in context or 'revoke' in context:
            continue
        problems.append(f'{fname}:{line}: EXECUTE — динамический SQL')
    for m in re.finditer(r'\bformat\s*\(', text, re.I):
        line = text[:m.start()].count('\n') + 1
        problems.append(f'{fname}:{line}: format() — сборка запроса из строк')
    # Конкатенация в предикате SQL: WHERE ... = '...' || var
    for m in re.finditer(r"(WHERE|AND|OR)[^;\n]*'\s*\|\|", text, re.I):
        line = text[:m.start()].count('\n') + 1
        problems.append(f'{fname}:{line}: конкатенация в SQL-условии')
    # LIKE с подстановкой без экранирования
    for m in re.finditer(r"LIKE\s+[^;\n]*'\s*\|\|", text, re.I):
        line = text[:m.start()].count('\n') + 1
        problems.append(f'{fname}:{line}: LIKE с конкатенацией — нужен ILIKE/параметр')

# 2. SECURITY DEFINER без search_path
for fname, text in per_file.items():
    for m in re.finditer(
            r'CREATE OR REPLACE FUNCTION\s+([\w.]+)\s*\([^)]*\)(.*?)AS\s*\$',
            text, re.S):
        decl = m.group(2)
        if 'SECURITY DEFINER' in decl and 'SET search_path' not in decl:
            problems.append(
                f'{fname}: {m.group(1)} SECURITY DEFINER без SET search_path')

# 3. SECURITY DEFINER функции, доступные anon
for fname, text in per_file.items():
    for m in re.finditer(
            r'GRANT EXECUTE ON FUNCTION\s+(?:public\.)?(\w+)[^;]*TO\s+([^;]+);',
            text, re.I):
        fn, roles = m.group(1), m.group(2)
        if 'anon' in roles and 'authenticated' not in roles:
            problems.append(
                f'{fname}: {fn}() выдана роли anon — проверьте необходимость')

# 4. RLS включён, но нет ни одной политики
rls_tables = {}
for fname, text in per_file.items():
    for t in re.findall(
            r'ALTER TABLE\s+(?:public\.)?(\w+)\s+ENABLE ROW LEVEL SECURITY', text):
        rls_tables.setdefault(t, fname)

for t, fname in rls_tables.items():
    pols = re.findall(
        rf'CREATE POLICY\s+"[^"]+"\s+ON public\.{t}\s+FOR (\w+)', all_text)
    if not pols:
        problems.append(f'{fname}: {t} с RLS без политик')
    elif 'ALL' not in pols:
        covered = set(pols)
        if not {'SELECT', 'INSERT', 'UPDATE', 'DELETE'} <= covered:
            # допустимо: часть операций намеренно отозвана
            pass

# 5. Пользовательская таблица без REVOKE при наличии RLS
for t, fname in rls_tables.items():
    if not re.search(rf'REVOKE[^;]*ON public\.{t}\b', all_text):
        problems.append(f'{fname}: {t} без явного REVOKE')

# 6. moderators закрыт полностью
for role in ('PUBLIC', 'anon', 'authenticated'):
    if not re.search(
            rf'REVOKE ALL ON public\.moderators FROM {role}', all_text, re.I):
        problems.append(f'moderators: нет REVOKE ALL ... FROM {role}')

# 7. Поля оценки и XP не должны быть доступны клиенту
forbidden_grants = [
    (r'GRANT\s+UPDATE\s*\(([^)]*)\)\s+ON public\.student_works', 'student_works UPDATE'),
    (r'GRANT\s+INSERT\s*\(([^)]*)\)\s+ON public\.student_works', 'student_works INSERT'),
    (r'GRANT\s+UPDATE\s*\(([^)]*)\)\s+ON public\.user_stats', 'user_stats UPDATE'),
    (r'GRANT\s+INSERT\s*\([^)]*\)\s+ON public\.xp_awards', 'xp_awards INSERT'),
]
FORBIDDEN = {
    'student_works UPDATE': ('grade', 'teacher_comment', 'reviewed_by', 'reviewed_at'),
    'student_works INSERT': ('grade', 'teacher_comment', 'reviewed_by', 'reviewed_at'),
    'user_stats UPDATE': ('total_xp', 'completed_lessons', 'completed_games'),
    'xp_awards INSERT': (),
}
for pattern, label in forbidden_grants:
    m = re.search(pattern, all_text, re.I)
    if m:
        cols = m.group(1)
        for col in FORBIDDEN.get(label, ()):
            if re.search(rf'\b{col}\b', cols):
                problems.append(
                    f'{label}: "{col}" в GRANT — клиент сможет подделать')

# 8. Табличный INSERT/UPDATE на student_works и user_stats
if re.search(
        r'GRANT\s+(INSERT|UPDATE)\s+ON public\.student_works\s+TO authenticated',
        all_text, re.I):
    problems.append('student_works: табличный GRANT INSERT/UPDATE — нужен column-level')
if re.search(
        r'GRANT\s+(INSERT|UPDATE)\s+ON public\.user_stats\s+TO authenticated',
        all_text, re.I):
    problems.append('user_stats: табличный GRANT INSERT/UPDATE — только через RPC')

# 9. BEFORE INSERT триггер там, где есть column-level INSERT
if 'GRANT INSERT' in all_text and 'BEFORE INSERT' not in all_text:
    problems.append('есть GRANT INSERT, но нет BEFORE INSERT триггера')

# 10. GUC-обход должен требовать и флаг, и роль
m = re.search(
    r"current_setting\('qazaqspace\.review'[^)]*\)\s*=\s*'on'(.*?)END IF",
    all_text, re.S)
if m and 'is_moderator()' not in m.group(1):
    problems.append(
        'qazaqspace.review: обход по флагу без проверки is_moderator()')

print('Проверено миграций:', len(FILES))
print()
if problems:
    print('ПРОБЛЕМЫ:')
    for p in problems:
        print('  -', p)
    sys.exit(1)
print('Проблем не найдено.')
