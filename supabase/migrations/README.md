# Восстановление Supabase — миграции

Ветка: `backup/main-before-rollback-2026-11-20`
Проект: `hdgcwazbnxacpggdbpcv` (qazaqspace, ap-northeast-1)

Статус: **SQL подготовлен и проверен статически, к базе НЕ применён.**

## Состояние базы на 20.11.2026

| Таблица | RLS | Строк |
|---|---|---|
| profiles | включён | 0 |
| user_progress | включён | 0 |
| game_results | включён | 0 |
| user_stats | включён | 0 |
| media_posts | включён | 0 |

Все таблицы пустые → миграции не затрагивают существующие данные.

## Порядок применения (обязателен)

```
000_catalog_and_xp_ledger.sql
001_fix_relationships.sql
002_secure_roles_and_grants.sql
003_secure_xp.sql
004_secure_moderation.sql
005_student_works.sql
```

Порядок не произвольный:

- `000` создаёт каталоги и журнал начислений; полей оценок ещё не касается.
- `001` добавляет внешние ключи для встраивания профилей (PGRST200).
- `002` создаёт `moderators` и `is_moderator()` — их используют 003–005.
- `003` переписывает функции начисления; ссылается на `lesson_catalog`,
  `game_catalog`, `xp_awards` из 000 и `is_moderator` нет.
- `004` переписывает `moderate_post` и триггер публикаций; нужен `is_moderator`.
- `005` создаёт `student_works` и `review_student_work`; нужен `is_moderator`.

Проверка порядка включена в `scripts/check_sql.py`.

## Локальная проверка

```
python3 scripts/check_sql.py
```

Проверяет без сервера:

- парность dollar-тегов;
- идемпотентность: у каждого `CREATE POLICY`, `CREATE TRIGGER`,
  `ADD CONSTRAINT` есть соответствующий `DROP ... IF EXISTS`;
- порядок зависимостей: функция не используется раньше, чем создаётся;
- наличие RLS и явного `REVOKE` у каждой пользовательской таблицы;
- наличие `SET search_path` у каждой `SECURITY DEFINER` функции;
- что поля оценки (`grade`, `teacher_comment`, `reviewed_by`, `reviewed_at`)
  не выданы клиенту в `GRANT UPDATE`;
- что `moderators` закрыт тремя `REVOKE ALL` (`PUBLIC`, `anon`, `authenticated`);
- отсутствие `DROP TABLE` / `TRUNCATE`.

Выполнено 20.11.2026: 6 файлов, проблем не найдено.

## Новый урок или новая игра

`003` начисляет XP только для идентификаторов из каталога. Добавили урок —
вставьте строку, иначе вернётся `UNKNOWN_LESSON`:

```sql
INSERT INTO public.lesson_catalog (lesson_id, title, xp_reward, is_active)
VALUES ('lesson_new_topic', 'Новая тема', 20, true)
ON CONFLICT (lesson_id) DO NOTHING;

INSERT INTO public.game_catalog (game_id, title, xp_reward, is_active)
VALUES ('newgame', 'Название', 10, true)
ON CONFLICT (game_id) DO NOTHING;
```

Права на запись в каталоги есть только у `postgres`/service role: клиент
получил лишь `SELECT`.

## Первый модератор

Клиент не может назначать роли: `moderators` закрыт политикой
`FOR ALL USING (false)` и тремя `REVOKE ALL`. Назначение — только через
SQL Editor (замените UUID):

```sql
INSERT INTO public.moderators (user_id)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid);
```

UUID берётся в Authentication → Users.

## Ключи API — требует вашего действия

Шлюз Supabase отклоняет текущий ключ: `UNAUTHORIZED_INVALID_API_KEY`,
в логах шлюза `bad_length`. В `assets/js/supabase-client.js` записано
`sb_publishable_<uuid>` — это значение поля `id` ключа из MCP-вывода, а не
сам ключ. Настоящий publishable ключ нужно скопировать в
Project Settings → API Keys и подставить в `assets/js/config.js`.

Service-role ключ в клиентский код не попадает и попасть не должен.
