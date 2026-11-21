-- ============================================================================
-- 002_secure_roles_and_grants.sql
-- Роли и права доступа.
--
-- ИСПРАВЛЯЕТ
--   1. Роль «модератор» определялась по username = 'admin'. Пользователь мог
--      сам сменить username (политика profiles_update_self это позволяет) и
--      получить права модератора. Теперь роль хранится в отдельной таблице,
--      к которой у клиента нет доступа.
--   2. Роль anon имела INSERT/UPDATE/DELETE/TRUNCATE на всех таблицах.
--   3. У authenticated был полный UPDATE строки профиля, включая служебные
--      поля. Теперь только (username, display_name, avatar_url).
--   4. user_stats был доступен на запись клиенту — накрутка XP напрямую.
--      Теперь запись только через SECURITY DEFINER функции.
--
-- ПОСЛЕДСТВИЯ
--   - Данные не удаляются и не изменяются.
--   - Первого модератора назначают вручную (см. README).
--   - Клиент, проверявший username === 'admin', теряет смысл — замена в 004.
-- ============================================================================

-- --- Таблица ролей --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderators (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.moderators ENABLE ROW LEVEL SECURITY;

-- Ни одной политики — таблица недоступна клиенту полностью.
DROP POLICY IF EXISTS "moderators_no_client_access" ON public.moderators;
CREATE POLICY "moderators_no_client_access" ON public.moderators
  FOR ALL TO public USING (false) WITH CHECK (false);

-- Явный отзыв всех прав. Политика FOR ALL USING(false) уже блокирует доступ
-- через RLS, но без REVOKE у роли остаются сами привилегии: любая будущая
-- политика или отладка могла бы их открыть. Отзываем полностью.
REVOKE ALL ON public.moderators FROM PUBLIC;
REVOKE ALL ON public.moderators FROM anon;
REVOKE ALL ON public.moderators FROM authenticated;

-- Единственный источник правды о роли. SECURITY DEFINER нужен, потому что
-- у authenticated нет SELECT на moderators; STABLE — функция только читает.
CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.moderators m WHERE m.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_moderator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated;

-- --- Гарантируем RLS на существующих таблицах ------------------------------
-- RLS уже включён, но повторное включение идемпотентно и защищает от
-- ситуации, когда таблица была пересоздана без RLS.
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_posts   ENABLE ROW LEVEL SECURITY;

-- --- Профили: только отображаемые поля ------------------------------------
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT  UPDATE (username, display_name, avatar_url) ON public.profiles TO authenticated;
GRANT  SELECT ON public.profiles TO authenticated;

-- --- Отзыв записи у anon --------------------------------------------------
-- Неаутентифицированный посетитель не пишет ничего.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles      FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_progress FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.game_results  FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_stats    FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.media_posts   FROM anon;

-- SELECT у anon можно не отзывать: политики написаны только для TO authenticated,
-- поэтому неаутентифицированный запрос всё равно получит 0 строк.
-- Оставляем, чтобы не ломать анонимные проверки доступности.

-- --- Лишние привилегии у authenticated ------------------------------------
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles      FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.user_progress FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.game_results  FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.user_stats    FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.media_posts   FROM authenticated;

-- user_stats: клиент не пишет вообще. Только SECURITY DEFINER функции.
REVOKE INSERT, UPDATE, DELETE ON public.user_stats FROM authenticated;

-- user_progress и game_results: клиент не пишет напрямую.
-- Все изменения идут через complete_lesson() и record_game_result(), которые
-- являются SECURITY DEFINER и обходят привилегии. Прямая запись позволила бы
-- ученику выставить себе любой score, status или plays в обход серверной
-- логики, поэтому INSERT/UPDATE/DELETE отозваны полностью.
-- Чтение своих строк остаётся (нужно для загрузки прогресса при входе).
REVOKE INSERT, UPDATE, DELETE ON public.user_progress FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_results  FROM authenticated;
GRANT  SELECT ON public.user_progress TO authenticated;
GRANT  SELECT ON public.game_results  TO authenticated;

-- profiles: прямой INSERT клиенту не нужен и опасен.
-- Профиль создаёт триггер handle_new_user на auth.users (SECURITY DEFINER).
-- Если триггер не сработал, клиент вызывает ensure_profile() ниже —
-- идемпотентную функцию с проверкой auth.uid().
REVOKE INSERT ON public.profiles FROM PUBLIC, anon, authenticated;

-- --- ensure_profile: безопасное восстановление профиля --------------------
CREATE OR REPLACE FUNCTION public.ensure_profile(
  p_username     TEXT DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_base    TEXT;
  v_name    TEXT;
  v_display TEXT;
  v_rows    INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  -- Username приходит от клиента: санитизируем до безопасного набора.
  v_base := regexp_replace(
    COALESCE(NULLIF(btrim(COALESCE(p_username, '')), ''),
             'user_' || substr(v_uid::text, 1, 8)),
    '[^a-zA-Z0-9_]', '', 'g');
  v_base := COALESCE(NULLIF(v_base, ''), 'user_' || substr(v_uid::text, 1, 8));

  v_display := COALESCE(
    NULLIF(btrim(COALESCE(p_display_name, '')), ''),
    v_base);

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (v_uid, v_base, v_display)
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- username занят другим аккаунтом: добавляем суффикс из UUID.
  IF v_rows = 0 AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (v_uid, left(v_base, 24) || '_' || substr(v_uid::text, 1, 4), v_display)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.user_stats (user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN JSONB_BUILD_OBJECT('success', true, 'username',
                            (SELECT username FROM public.profiles WHERE id = v_uid));
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_profile(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_profile(TEXT, TEXT) TO authenticated;

-- --- Политики существующих таблиц -----------------------------------------
-- Раньше они были созданы вручную и жили только в базе. Здесь они описаны
-- явно и идемпотентно, чтобы набор миграций был воспроизводимым.

-- profiles: читают все авторизованные (нужно для ленты и рейтинга),
-- пишет только владелец. INSERT-политика убрана: профиль создаёт триггер
-- handle_new_user или RPC ensure_profile(), прямой вставке клиента больше
-- ничего не нужно.
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- user_progress: только чтение своих строк. INSERT/UPDATE больше не нужны —
-- запись идёт через complete_lesson() (SECURITY DEFINER).
DROP POLICY IF EXISTS "progress_select_self" ON public.user_progress;
CREATE POLICY "progress_select_self" ON public.user_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "progress_insert_self" ON public.user_progress;
DROP POLICY IF EXISTS "progress_update_self" ON public.user_progress;

-- game_results: только чтение своих строк, запись через record_game_result().
DROP POLICY IF EXISTS "games_select_self" ON public.game_results;
CREATE POLICY "games_select_self" ON public.game_results
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "games_insert_self" ON public.game_results;
DROP POLICY IF EXISTS "games_update_self" ON public.game_results;

-- user_stats: читают все авторизованные (рейтинг), записи нет вообще —
-- очки меняются только функциями из 003.
DROP POLICY IF EXISTS "stats_select_all" ON public.user_stats;
CREATE POLICY "stats_select_all" ON public.user_stats
  FOR SELECT TO authenticated USING (true);

-- --- Модератор читает журнал начислений -----------------------------------
-- Политика добавляется здесь, а не в 000, потому что 000 выполняется раньше
-- и не может ссылаться на is_moderator().
DROP POLICY IF EXISTS "xp_awards_select_moderator" ON public.xp_awards;
CREATE POLICY "xp_awards_select_moderator" ON public.xp_awards
  FOR SELECT TO authenticated USING (public.is_moderator());

-- xp_awards, lesson_catalog, game_catalog создаются в 000 и там же защищены.
