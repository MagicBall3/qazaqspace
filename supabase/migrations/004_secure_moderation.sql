-- ============================================================================
-- 004_secure_moderation.sql
-- Модерация публикаций: серверная роль, запрет самомуодобрения.
--
-- ИСПРАВЛЯЕТ
--   1. moderate_post() проверял username = 'admin'. Теперь is_moderator().
--   2. Триггер сбрасывал moderated_at/moderated_by ВСЕГДА, в том числе когда
--      статус менял сам модератор: его действие затиралось. Теперь действия
--      модератора проходят без изменений.
--   3. Триггер смотрел только на status. Правка содержимого одобренной
--      публикации не возвращала её на проверку. Теперь изменение title,
--      content или post_type переводит публикацию в pending и очищает поля
--      модерации.
--   4. Автор мог через UPDATE выставить status = 'approved' сам. Теперь
--      статус авторам недоступен на уровне привилегий, а триггер служит
--      вторым барьером.
--   5. SELECT отдавал авторизованным ВСЕ публикации, включая чужие pending
--      и rejected. Теперь три политики: одобренные — всем, свои — автору,
--      всё — модератору.
--   6. moderate_post принимал любой статус и не проверял существование поста.
--
-- ПОСЛЕДСТВИЯ
--   - Данные не удаляются (0 строк).
--   - Прямая смена status через PostgREST становится невозможной для всех,
--     включая модератора: только через moderate_post.
-- ============================================================================

-- --- 1. moderate_post с проверкой роли и статуса ----------------------------
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
  v_uid  UUID := auth.uid();
  v_rows INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'NOT_MODERATOR' USING ERRCODE = '42501';
  END IF;
  IF p_new_status NOT IN ('pending', 'approved', 'rejected', 'unpublished') THEN
    RAISE EXCEPTION 'INVALID_STATUS: %', p_new_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.media_posts
     SET status       = p_new_status,
         moderated_at = CASE WHEN p_new_status IN ('approved','rejected','unpublished')
                             THEN now() END,
         moderated_by = CASE WHEN p_new_status IN ('approved','rejected','unpublished')
                             THEN v_uid END,
         updated_at   = now()
   WHERE id = p_post_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'POST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN JSONB_BUILD_OBJECT('success', true, 'status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_post(BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_post(BIGINT, TEXT) TO authenticated;

-- --- 2. Триггер: правка автора возвращает на модерацию ---------------------
CREATE OR REPLACE FUNCTION public.enforce_pending_on_author_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
    END IF;

    -- Действие модератора (в том числе moderate_post): не вмешиваемся.
    IF public.is_moderator() THEN
      NEW.updated_at := now();
      RETURN NEW;
    END IF;

    -- Обычный автор: статус изменить себе не может.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status := 'pending';
    END IF;

    -- Изменение содержимого одобренной публикации возвращает её на проверку.
    IF NEW.title     IS DISTINCT FROM OLD.title
       OR NEW.content    IS DISTINCT FROM OLD.content
       OR NEW.post_type  IS DISTINCT FROM OLD.post_type THEN
      NEW.status       := 'pending';
      NEW.moderated_at := NULL;
      NEW.moderated_by := NULL;
    END IF;

    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_posts_author_edit ON public.media_posts;
CREATE TRIGGER trg_media_posts_author_edit
  BEFORE UPDATE ON public.media_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pending_on_author_edit();

-- --- 3. Права: автор правит только содержимое ------------------------------
REVOKE UPDATE ON public.media_posts FROM authenticated;
GRANT UPDATE (title, content, post_type) ON public.media_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.media_posts TO authenticated;

-- --- 4. SELECT-политики ---------------------------------------------------
DROP POLICY IF EXISTS "posts_select_all" ON public.media_posts;

DROP POLICY IF EXISTS "posts_select_approved" ON public.media_posts;
CREATE POLICY "posts_select_approved" ON public.media_posts
  FOR SELECT TO authenticated USING (status = 'approved');

DROP POLICY IF EXISTS "posts_select_own" ON public.media_posts;
CREATE POLICY "posts_select_own" ON public.media_posts
  FOR SELECT TO authenticated USING (author_id = auth.uid());

DROP POLICY IF EXISTS "posts_select_moderator" ON public.media_posts;
CREATE POLICY "posts_select_moderator" ON public.media_posts
  FOR SELECT TO authenticated USING (public.is_moderator());
