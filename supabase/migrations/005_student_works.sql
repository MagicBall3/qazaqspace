-- ============================================================================
-- 005_student_works.sql
-- База для ученических работ, которые проверяет преподаватель.
--
-- ЗАЧЕМ
--   MEDIA SPACE — публичная лента с модерацией. Ученическая работа (домашнее
--   задание, сочинение, отчёт) — это другое: она проверяется учителем,
--   оценивается и не публикуется. Смешивать их в одной таблице нельзя:
--   у них разные статусы, разные права и разная аудитория.
--
-- ЧТО СОЗДАЁТСЯ
--   student_works + оценка преподавателя + комментарий.
--
-- ПРАВА (RLS)
--   - Ученик видит и редактирует только свои работы.
--   - Преподаватель (is_moderator) видит все и выставляет оценку.
--   - Оценку может поставить только преподаватель (column-level GRANT).
--   - Ученик не может изменить оценку или статус проверки.
--
-- ПОСЛЕДСТВИЯ
--   - Таблица новая, существующие данные не затрагиваются.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_works (
  id           BIGSERIAL PRIMARY KEY,
  author_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  work_type    TEXT NOT NULL DEFAULT 'text',
  status       TEXT NOT NULL DEFAULT 'draft',
  grade        INT,
  teacher_comment TEXT,
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
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

-- updated_at
DROP TRIGGER IF EXISTS trg_student_works_updated ON public.student_works;
CREATE TRIGGER trg_student_works_updated
  BEFORE UPDATE ON public.student_works
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- RLS -------------------------------------------------------------------
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
REVOKE ALL ON public.student_works FROM anon;

-- Ученик правит только своё содержимое, не оценку и не статус проверки.
REVOKE UPDATE ON public.student_works FROM authenticated;
GRANT UPDATE (title, content, work_type, status) ON public.student_works TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.student_works TO authenticated;

-- Преподаватель правит оценку и комментарий.
GRANT UPDATE (grade, teacher_comment, status, reviewed_at, reviewed_by)
  ON public.student_works TO authenticated;

-- --- Защита оценки от ученика ---------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_work_review_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_moderator() THEN
      -- Ученик: оценка, комментарий и рецензент не меняются.
      NEW.grade           := OLD.grade;
      NEW.teacher_comment := OLD.teacher_comment;
      NEW.reviewed_at     := OLD.reviewed_at;
      NEW.reviewed_by     := OLD.reviewed_by;
      -- Ученик не может выставить статус 'reviewed'.
      IF NEW.status = 'reviewed' THEN
        NEW.status := 'submitted';
      END IF;
    ELSE
      NEW.reviewed_at := now();
      NEW.reviewed_by := auth.uid();
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
