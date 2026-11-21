-- ============================================================================
-- 005_student_works.sql
-- Ученические работы: сдача учеником, проверка преподавателем.
--
-- ЗАЧЕМ ОТДЕЛЬНАЯ ТАБЛИЦА
--   MEDIA SPACE — публичная лента с модерацией. Ученическая работа проверяется
--   учителем, оценивается и не публикуется. Разные статусы, разные права,
--   разная аудитория — смешивать нельзя.
--
-- МОДЕЛЬ ПРАВ
--   Ученик    : создаёт и правит своё, видит только своё.
--   Учитель   : видит всё (is_moderator), ставит оценку и комментарий
--               исключительно через RPC review_student_work().
--   Посетитель: ничего.
--
-- ИСПРАВЛЯЕТ
--   В предыдущей редакции оценку можно было менять обычным UPDATE строки:
--   GRANT UPDATE (grade, ...) был выдан всей роли authenticated, а запрет
--   держался только на триггере. Теперь прямой доступ к полям оценки
--   отозван у всех, включая модератора; единственный путь — RPC.
--
-- КАК ОТЛИЧАЕТСЯ ВЫЗОВ RPC ОТ ОБЫЧНОГО UPDATE
--   review_student_work() выставляет транзакционный флаг
--   qazaqspace.review = 'on' через set_config(..., is_local := true).
--   Триггер видит флаг и не откатывает поля оценки. Для любого другого
--   UPDATE флага нет, поля оценки восстанавливаются из OLD.
--
-- ПОСЛЕДСТВИЯ
--   - Таблица новая, существующие данные не затрагиваются.
--   - Преподаватель обязан использовать RPC, прямой UPDATE не сработает.
-- ============================================================================

-- --- Таблица --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_works (
  id              BIGSERIAL PRIMARY KEY,
  author_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  work_type       TEXT NOT NULL DEFAULT 'text',
  status          TEXT NOT NULL DEFAULT 'draft',
  grade           INT,
  teacher_comment TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_works_status_check
    CHECK (status IN ('draft', 'submitted', 'reviewed', 'returned')),
  CONSTRAINT student_works_type_check
    CHECK (work_type IN ('text','interview','news','podcast','report','script','creative')),
  CONSTRAINT student_works_grade_check
    CHECK (grade IS NULL OR (grade >= 0 AND grade <= 100))
);

CREATE INDEX IF NOT EXISTS idx_student_works_author
  ON public.student_works (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_works_status
  ON public.student_works (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_student_works_updated ON public.student_works;
CREATE TRIGGER trg_student_works_updated
  BEFORE UPDATE ON public.student_works
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- Триггер: защита полей оценки -----------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_work_review_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Вызов из review_student_work(): поля уже выставлены сервером.
  IF current_setting('qazaqspace.review', true) = 'on' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  -- Любая другая правка: поля оценки не меняются.
  IF NEW.grade             IS DISTINCT FROM OLD.grade
     OR NEW.teacher_comment IS DISTINCT FROM OLD.teacher_comment
     OR NEW.reviewed_by    IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at    IS DISTINCT FROM OLD.reviewed_at
     OR NEW.status         = 'reviewed' THEN
    NEW.grade           := OLD.grade;
    NEW.teacher_comment := OLD.teacher_comment;
    NEW.reviewed_by     := OLD.reviewed_by;
    NEW.reviewed_at     := OLD.reviewed_at;
    IF OLD.status IS DISTINCT FROM 'reviewed' THEN
      NEW.status := OLD.status;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_works_rules ON public.student_works;
CREATE TRIGGER trg_student_works_rules
  BEFORE UPDATE ON public.student_works
  FOR EACH ROW EXECUTE FUNCTION public.enforce_work_review_rules();

-- --- RPC: проверка работы преподавателем ----------------------------------
CREATE OR REPLACE FUNCTION public.review_student_work(
  p_work_id BIGINT,
  p_grade   INT,
  p_comment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_rows   INT;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_moderator() THEN
    RAISE EXCEPTION 'NOT_MODERATOR' USING ERRCODE = '42501';
  END IF;
  IF p_grade IS NULL OR p_grade < 0 OR p_grade > 100 THEN
    RAISE EXCEPTION 'GRADE_OUT_OF_RANGE' USING ERRCODE = '22023';
  END IF;

  v_status := CASE WHEN p_grade >= 50 THEN 'reviewed' ELSE 'returned' END;

  -- Разрешаем триггеру пропустить поля оценки в этой транзакции.
  PERFORM set_config('qazaqspace.review', 'on', true);

  UPDATE public.student_works
     SET grade           = p_grade,
         teacher_comment = NULLIF(btrim(COALESCE(p_comment, '')), ''),
         status          = v_status,
         reviewed_by     = v_uid,
         reviewed_at     = now()
   WHERE id = p_work_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'WORK_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN JSONB_BUILD_OBJECT('success', true, 'grade', p_grade, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.review_student_work(BIGINT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_student_work(BIGINT, INT, TEXT) TO authenticated;

-- --- RLS ------------------------------------------------------------------
ALTER TABLE public.student_works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "works_select_own" ON public.student_works;
CREATE POLICY "works_select_own" ON public.student_works
  FOR SELECT TO authenticated USING (author_id = auth.uid());

DROP POLICY IF EXISTS "works_select_moderator" ON public.student_works;
CREATE POLICY "works_select_moderator" ON public.student_works
  FOR SELECT TO authenticated USING (public.is_moderator());

DROP POLICY IF EXISTS "works_insert_own" ON public.student_works;
CREATE POLICY "works_insert_own" ON public.student_works
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "works_update_own" ON public.student_works;
CREATE POLICY "works_update_own" ON public.student_works
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "works_delete_own" ON public.student_works;
CREATE POLICY "works_delete_own" ON public.student_works
  FOR DELETE TO authenticated USING (author_id = auth.uid());

-- --- Права -----------------------------------------------------------------
REVOKE ALL ON public.student_works FROM PUBLIC, anon;

-- Ученик: содержимое и статус сдачи. Полей оценки в гранте нет.
GRANT SELECT, INSERT, DELETE ON public.student_works TO authenticated;
GRANT UPDATE (title, content, work_type, status) ON public.student_works TO authenticated;

-- grade, teacher_comment, reviewed_at, reviewed_by не выданы никому:
-- только review_student_work() (SECURITY DEFINER обходит привилегии).
