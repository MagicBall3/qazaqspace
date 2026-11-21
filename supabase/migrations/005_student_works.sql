-- ============================================================================
-- 005_student_works.sql
-- Ученические работы: сдача учеником, проверка преподавателем.
--
-- МОДЕЛЬ
--   Ученик    : создаёт черновик и отправляет на проверку, видит только своё.
--   Учитель   : видит всё (is_moderator), ставит оценку исключительно через
--               RPC review_student_work().
--   Посетитель: ничего.
--
-- ЗАЩИТА ОТ ПОДДЕЛКИ ПРОВЕРКИ
--   Раньше у authenticated был табличный GRANT INSERT, а триггер проверял
--   только UPDATE. Ученик мог одной вставкой создать работу с
--   grade = 100, teacher_comment = «отлично», reviewed_by = себя и
--   status = 'reviewed'. Теперь:
--     * INSERT выдан только на колонки автора и содержимого;
--     * BEFORE INSERT триггер принудительно обнуляет поля оценки и
--       запрещает статусы reviewed/returned при создании.
--
-- ЗАЩИТА ОТ ПОТЕРИ РЕЗУЛЬТАТА ПРОВЕРКИ
--   Проверенная работа (reviewed/returned) становится read-only для автора:
--   он не может ни изменить содержимое, ни вернуть её в submitted.
--   Изменить статус после проверки может только преподаватель через
--   review_student_work().
--
-- РАЗДЕЛЕНИЕ ПРАВ
--   Поля grade, teacher_comment, reviewed_at, reviewed_by не входят ни в
--   один GRANT. Их меняет только review_student_work() (SECURITY DEFINER
--   обходит привилегии), а триггер отличает этот вызов от обычного UPDATE
--   по транзакционному флагу qazaqspace.review.
--
-- ФЛАГ И АВТОРИЗАЦИЯ
--   Триггер пропускает поля оценки только если флаг выставлен И вызов
--   идёт от модератора. Одного флага недостаточно: даже если GUC удалось
--   бы выставить посторонним способом, без роли модератора обхода нет.
--
-- ПОСЛЕДСТВИЯ
--   - Таблица новая, существующие данные не затрагиваются.
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

-- --- Разрешённые переходы статуса -----------------------------------------
-- draft     -> submitted, draft
-- submitted -> draft (отзыв), submitted
-- reviewed  -> только преподаватель
-- returned  -> только преподаватель
CREATE OR REPLACE FUNCTION public.student_work_status_transition(
  p_from TEXT,
  p_to   TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_from IN ('draft', 'submitted') AND p_to IN ('draft', 'submitted');
$$;

-- --- BEFORE INSERT: ученик не создаёт проверенную работу -------------------
CREATE OR REPLACE FUNCTION public.enforce_work_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  -- Автор всегда сам пользователь, подделать нельзя.
  NEW.author_id := auth.uid();

  -- Поля проверки при вставке всегда пустые.
  NEW.grade           := NULL;
  NEW.teacher_comment := NULL;
  NEW.reviewed_at     := NULL;
  NEW.reviewed_by     := NULL;

  -- Новая работа не может быть сразу проверенной.
  IF NEW.status NOT IN ('draft', 'submitted') THEN
    NEW.status := 'draft';
  END IF;

  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_works_insert ON public.student_works;
CREATE TRIGGER trg_student_works_insert
  BEFORE INSERT ON public.student_works
  FOR EACH ROW EXECUTE FUNCTION public.enforce_work_insert();

-- --- BEFORE UPDATE: поля оценки и статус после проверки -------------------
CREATE OR REPLACE FUNCTION public.enforce_work_review_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_review_bypass BOOLEAN;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  -- Обход только для модератора, вызвавшего review_student_work в этой
  -- транзакции. Флаг без роли модератора ничего не даёт.
  v_review_bypass :=
       current_setting('qazaqspace.review', true) = 'on'
       AND public.is_moderator();

  IF v_review_bypass THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- Поля проверки не меняются никем, кроме review_student_work.
  NEW.grade           := OLD.grade;
  NEW.teacher_comment := OLD.teacher_comment;
  NEW.reviewed_by     := OLD.reviewed_by;
  NEW.reviewed_at     := OLD.reviewed_at;

  -- После проверки автор работу не редактирует и не «отзывает» результат.
  IF OLD.status IN ('reviewed', 'returned') THEN
    NEW.status := OLD.status;
    NEW.title      := OLD.title;
    NEW.content    := OLD.content;
    NEW.work_type  := OLD.work_type;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- До проверки автор переводит работу только между draft и submitted.
  IF NOT public.student_work_status_transition(OLD.status, NEW.status) THEN
    NEW.status := OLD.status;
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
  v_author UUID;
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

  SELECT author_id INTO v_author FROM public.student_works WHERE id = p_work_id;
  IF v_author IS NULL THEN
    RAISE EXCEPTION 'WORK_NOT_FOUND' USING ERRCODE = 'P0002';
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

  RETURN JSONB_BUILD_OBJECT('success', true, 'grade', p_grade, 'status', v_status,
                            'author_id', v_author);
END;
$$;

REVOKE ALL ON FUNCTION public.review_student_work(BIGINT, INT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.student_work_status_transition(TEXT, TEXT) FROM PUBLIC, anon;

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
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "works_update_own" ON public.student_works;
CREATE POLICY "works_update_own" ON public.student_works
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "works_delete_own" ON public.student_works;
CREATE POLICY "works_delete_own" ON public.student_works
  FOR DELETE TO authenticated USING (author_id = auth.uid());

-- --- Права: column-level, без полей оценки --------------------------------
REVOKE ALL ON public.student_works FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.student_works FROM authenticated;

-- Вставка: только автор и содержимое. grade/teacher_comment/reviewed_*
-- отсутствуют в списке, поэтому получают значения по умолчанию (NULL),
-- а триггер дополнительно их обнуляет.
GRANT SELECT ON public.student_works TO authenticated;
GRANT INSERT (author_id, title, content, work_type, status)
  ON public.student_works TO authenticated;
GRANT UPDATE (title, content, work_type, status)
  ON public.student_works TO authenticated;
GRANT DELETE ON public.student_works TO authenticated;

-- grade, teacher_comment, reviewed_at, reviewed_by не выданы никому:
-- единственный путь — review_student_work() (SECURITY DEFINER).
