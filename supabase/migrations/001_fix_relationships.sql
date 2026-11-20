-- ============================================================================
-- 001_fix_relationships.sql
-- Исправление PGRST200: отсутствие связей для встраивания профилей.
--
-- ПРОБЛЕМА
--   media_posts.author_id и user_stats.user_id ссылаются на auth.users,
--   а не на public.profiles. PostgREST не может построить встраивание
--   `author:profiles(...)` и `profile:profiles(...)` и возвращает PGRST200
--   «Could not find a relationship».
--
-- РЕШЕНИЕ
--   Добавить внешние ключи на public.profiles. Связь 1:1 корректна:
--   profiles.id сам ссылается на auth.users(id) и создаётся при регистрации.
--
-- ПОСЛЕДСТВИЯ
--   - Данные не удаляются и не изменяются (таблицы пустые: 0 строк).
--   - Появляется защита от «сирот»: нельзя удалить профиль, если на него
--     ссылаются публикации или статистика.
--   - Embedd-запросы начинают работать.
-- ============================================================================

-- user_stats: 1:1 с профилем
ALTER TABLE public.user_stats
  DROP CONSTRAINT IF EXISTS user_stats_user_id_profiles_fkey;
ALTER TABLE public.user_stats
  ADD CONSTRAINT user_stats_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- media_posts: автор — профиль
ALTER TABLE public.media_posts
  DROP CONSTRAINT IF EXISTS media_posts_author_id_profiles_fkey;
ALTER TABLE public.media_posts
  ADD CONSTRAINT media_posts_author_id_profiles_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Индексы для сортировки ленты и рейтинга
CREATE INDEX IF NOT EXISTS idx_media_posts_approved_created
  ON public.media_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_xp_desc
  ON public.user_stats (total_xp DESC);
