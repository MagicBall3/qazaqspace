"""Единая точка входа для локальных проверок.

psql в окружении нет, поэтому проверки статические. Реальные тесты
поведения описаны в supabase/migrations/TESTS.md и выполняются после
применения миграций.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CHECKS = [
    ('SQL: структура, идемпотентность, зависимости, INSERT-права',
     'check_sql.py'),
    ('SQL: динамический SQL, search_path, column-level GRANT',
     'audit_sql_security.py'),
    ('JS: XSS и инъекции в клиентском коде',
     'audit_xss.py'),
    ('Инъекции: векторы admin\' -- и XSS-полезная нагрузка',
     'test_injection_vectors.py'),
]

failed = []
for title, script in CHECKS:
    print('=' * 64)
    print(title)
    print('=' * 64)
    result = subprocess.run([sys.executable, str(ROOT / script)],
                            capture_output=True, text=True)
    tail = (result.stdout or '').strip().splitlines()
    print('\n'.join(tail[-6:]) if tail else '(нет вывода)')
    if result.returncode != 0:
        failed.append(title)
        if result.stderr.strip():
            print(result.stderr.strip()[:500])
    print()

print('=' * 64)
if failed:
    print('ПРОВАЛЕНО:', len(failed))
    for f in failed:
        print('  -', f)
    sys.exit(1)
print('Все локальные проверки пройдены.')
print()
print('Не проверено локально (нужен сервер PostgreSQL):')
print('  - фактическое применение миграций;')
print('  - поведение RLS от имени anon/authenticated/service_role;')
print('  - гонки параллельных транзакций;')
print('  - срабатывание триггеров BEFORE INSERT/UPDATE.')
