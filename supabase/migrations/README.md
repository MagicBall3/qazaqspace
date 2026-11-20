# Восстановление Supabase — миграции

Ветка: `backup/main-before-rollback-2026-11-20`
Проект: `hdgcwazbnxacpggdbpcv` (qazaqspace, ap-northeast-1)

## Состояние базы на момент аудита (20.11.2026)

| Таблица | RLS | Строк |
|---|---|---|
| profiles | включён | 0 |
| user_progress | включён | 0 |
| game_results | включён | 0 |
| user_stats | включён | 0 |
| media_posts | включён | 0 |

Все таблицы пустые → миграции безопасны, данные потерять нельзя.

## Порядок применения

```
001_fix_relationships.sql
002_secure_roles_and_grants.sql
003_secure_xp.sql
004_secure_moderation.sql
005_student_works.sql
```

Применять строго по порядку: 002 создаёт `public.is_moderator()`, который
используют 004 и 005.

## Что делает каждая миграция

**001** — внешние ключи `user_stats.user_id → profiles.id` и
`media_posts.author_id → profiles.id`. Исправляет PGRST200 при встраивании
профиля в ленту и рейтинг.

**002** — таблица `moderators`, функция `is_moderator()`, отзыв записи у
`anon`, column-level UPDATE для профиля. Убирает возможность «назначить себя
админом» через смену username.

**003** — XP считается только на сервере (урок 20, новая игра 10), клиентский
`p_xp` игнорируется. Оценки ограничены диапазоном. `SET search_path`.
Повторное прохождение не начисляет XP второй раз.

**004** — `moderate_post` проверяет `is_moderator()` и допустимые статусы.
Автор не может менять `status` (column-level GRANT + триггер возвращает
`pending`). Чужие `pending`/`rejected` больше не видны.

**005** — таблица `student_works` для работ, которые проверяет преподаватель:
оценка 0–100, комментарий, статусы draft/submitted/reviewed/returned.
Ученик не может поставить себе оценку.

## Первый модератор

Клиент не может назначать роли. После применения миграций выполните в
Supabase SQL Editor (замените UUID на нужный):

```sql
INSERT INTO public.moderators (user_id)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid);
```

UUID берётся в Authentication → Users.

## Ключи API — требует вашего действия

Шлюз Supabase отклоняет текущий ключ с `UNAUTHORIZED_INVALID_API_KEY`
(в логах шлюза: `bad_length`). Ключ в `assets/js/supabase-client.js`
имеет вид `sb_publishable_<uuid>` — это значение поля `id` ключа, а не сам
ключ. Настоящий publishable ключ нужно скопировать из
Project Settings → API Keys и подставить в `assets/js/config.js`.

Service-role ключ в клиентский код не попадает никогда.
