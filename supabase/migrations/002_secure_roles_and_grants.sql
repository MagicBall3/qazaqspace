-- ============================================================================
-- 002_secure_roles_and_grants.sql
-- Закрывает три уязвимости сразу.
--
-- НАЙДЕННЫЕ ПРОБЛЕМЫ
--   1. Роль «модератор» определялась по username = 'admin'. Любой
--      зарегистрированный пользователь мог изменить свой username на 'admin'
--      (политика profiles_update_self это разрешает) и получить права
--      модератора. Это подделка прав на клиенте.
--   2. Роль anon имела INSERT/UPDATE/DELETE/TRUNCATE на ВСЕХ пользовательских
--      таблицах. RLS ограничивал строки, но любая ошибка в политике
--      превращалась в порчу или удаление данных.
--   3. Не было защиты от самостоятельного повышения прав.
--
-- РЕШЕНИЕ
--   - Отдельная таблица ролей: public.moderators (не редактируется клиентом).
--   - Функция public.is_moderator() — единственный источник правды.
--   - Отзыв записи у anon и лишних привилегий у authenticated.
--   - Право UPDATE только на нужные колонки профиля: пользователь не может
--     изменить служебные поля даже при ошибке в RLS.
--
-- ПОСЛЕДСТВИЯ
--   - Данные не удаляются.
--   - Первого модератора нужно назначить вручную (см. файл README в папке).
--   - Клиентский код, проверявший username === 'admin', перестанет работать —
--     он заменяется в 004_secure_moderation.sql.
-- ============================================================================

-- --- Таблица ролей --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderators (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id)
);

-- Клиент не имеет прав на эту таблицу вообще: только service role / SQL.
ALTER TABLE public.moderators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moderators_no_client_access" ON public.moderators;
CREATE POLICY "moderators_no_client_access" ON public.moderators
  FOR ALL TO public USING (false) WITH CHECK (false);

-- --- Функция проверки роли ------------------------------------------------
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

-- --- Профиль:中等职业学校 column-level UPDATE -----------------------------
-- Пользователь правит только отображаемые поля.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT  UPDATE (username, display_name, avatar_url) ON public.profiles TO authenticated;
GRANT  SELECT ON public.profiles TO authenticated;

-- --- Отзыв записи у anon --------------------------------------------------
-- anon (неаутентифицированный посетитель) не должен ничего писать.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles      FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_progress FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.game_results  FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_stats    FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.media_posts   FROM anon;

-- authenticated: запись остаётся, но контролируется RLS и триггерами.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles      FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.user_progress FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.game_results  FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.user_stats    FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.media_posts   FROM authenticated;

-- user_stats доступен на запись только через RPC (защита от накрутки XP).
REVOKE INSERT, UPDATE, DELETE ON public.user_stats FROM authenticated;
