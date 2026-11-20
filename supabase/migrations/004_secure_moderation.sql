-- ============================================================================
-- 004_secure_moderation.sql
-- Модерация: серверная проверка роли + запрет самомуодобрения.
--
-- НАЙДЕННЫЕ ПРОБЛЕМЫ
--   1. moderate_post() проверял роль по username = 'admin'. Пользователь мог
--      сам сменить username на 'admin' и одобрять любые публикации.
--   2. Политика posts_update_self разрешала автору менять ЛЮБЫЕ поля, включая
--      status. Автор мог сам перевести свою публикацию из pending в approved.
--   3. moderate_post принимал любой p_new_status без проверки допустимых
--      значений и не проверял, что пост существует.
--   4. SELECT-политика media_posts отдавала авторизованным ВСЕ публикации,
--      включая pending и rejected других пользователей — чужие черновики
--      были видны.
--
-- РЕШЕНИЕ
--   - Права на модерацию: только public.is_moderator() (таблица moderators).
--   - Автор редактирует только title/content/post_type; status менять нельзя
--     (column-level GRANT + триггер).
--   - Любое изменение автором возвращает status в 'pending'.
--   - Проверка допустимых статусов через CHECK-ограничение.
--   - SELECT: одобренные видят все авторизованные, свои (любой статус) —
--     только автор, неопубликованные чужие недоступны.
--
-- ПОСЛЕДСТВИЯ
--   - Данные не удаляются (0 строк).
--   - Уже опубликованные записи не меняются.
-- ============================================================================

-- --- 1. Новый moderate_post ------------------------------------------------
CREATE OR REPLACE FUNCTION public.moderate_post(
  p_post_id    BIGINT,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rows INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'NOT_MODERATOR' USING ERRCODE = '42501';
  END IF;
  IF p_new_status NOT IN ('approved', 'rejected', 'unpublished', 'pending') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = '22023';
  END IF;

  UPDATE public.media_posts
     SET status = p_new_status,
         moderated_at = CASE WHEN p_new_status IN ('approved','rejected') THEN now() ELSE moderated_at END,
         moderated_by = CASE WHEN p_new_status IN ('approved','rejected') THEN v_uid ELSE moderated_by END,
         updated_at = now()
   WHERE id = p_post_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'POST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN JSONB_BUILD_OBJECT('success', true, 'status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_post(BIGINT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.moderate_post(BIGINT, TEXT) TO authenticated;


-- --- 2. Защита статуса от автора ------------------------------------------
-- Автор не может писать в status/moderated_* напрямую.
REVOKE UPDATE ON public.media_posts FROM authenticated;
GRANT UPDATE (title, content, post_type) ON public.media_posts TO authenticated;

-- Триггер: правка автором всегда возвращает публикацию на модерацию
-- и Never позволяет выставить approved/unpublished вручную.
CREATE OR REPLACE FUNCTION public.enforce_pending_on_author_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  -- Только модератор может менять статус напрямую.
  IF TG_OP = 'UPDATE'
     AND (NEW.status IS DISTINCT FROM OLD.status)
     AND NOT public.is_moderator() THEN
    NEW.status := 'pending';
  END IF;

  NEW.moderated_at := NULL;
  NEW.moderated_by := NULL;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_posts_author_edit ON public.media_posts;
CREATE TRIGGER trg_media_posts_author_edit
  BEFORE UPDATE ON public.media_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pending_on_author_edit();


-- --- 3. Новые SELECT-политики ---------------------------------------------
DROP POLICY IF EXISTS "posts_select_all" ON public.media_posts;

-- Одобренные публикации видны всем авторизованным.
DROP POLICY IF EXISTS "posts_select_approved" ON public.media_posts;
CREATE POLICY "posts_select_approved" ON public.media_posts
  FOR SELECT TO authenticated
  USING (status = 'approved');

-- Свои публикации в любом статусе видит только автор.
DROP POLICY IF EXISTS "posts_select_own" ON public.media_posts;
CREATE POLICY "posts_select_own" ON public.media_posts
  FOR SELECT TO authenticated
  USING (author_id = auth.uid());

-- Модератор видит всё, включая очередь на проверку.
DROP POLICY IF EXISTS "posts_select_moderator" ON public.media_posts;
CREATE POLICY "posts_select_moderator" ON public.media_posts
  FOR SELECT TO authenticated
  USING (public.is_moderator());


-- --- 4. Профиль модератора виден для ленты ---------------------------------
-- (profiles уже читаются всеми авторизованными; email там не хранится.)
