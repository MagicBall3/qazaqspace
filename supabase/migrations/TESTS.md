-- ============================================================================
-- TESTS.md — сценарии проверки безопасности
--
-- Эти проверки выполняются ПОСЛЕ применения миграций 000–005, в Supabase
-- SQL Editor или psql. Они не меняют данные: каждый блок начинается с
-- BEGIN и заканчивается ROLLBACK.
--
-- psql в среде AndroidHarness отсутствует, поэтому здесь они только
-- описаны как текст, а не выполнены.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- T1. Ученик не может создать «проверенную» работу через INSERT
-- ----------------------------------------------------------------------------
-- Ожидание: grade = NULL, teacher_comment = NULL, reviewed_by = NULL,
--           status = 'draft' (триггер принудительно исправляет).
BEGIN;
  -- имитируем аутентифицированного пользователя
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '<UUID_УЧЕНИКА>', 'role', 'authenticated')::text, true);

  INSERT INTO public.student_works (author_id, title, content, work_type, status,
                                    grade, teacher_comment, reviewed_by, reviewed_at)
  VALUES ('<UUID_УЧЕНИКА>', 't', 'c', 'text', 'reviewed', 100, 'fake', '<UUID_УЧЕНИКА>', now())
  RETURNING status, grade, teacher_comment, reviewed_by;
  -- ОЖИДАЕМО: status=draft, grade=NULL, teacher_comment=NULL, reviewed_by=NULL
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T2. Ученик не может изменить статус проверенной работы
-- ----------------------------------------------------------------------------
BEGIN;
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '<UUID_УЧЕНИКА>', 'role', 'authenticated')::text, true);

  -- сначала работа, проверенная преподавателем
  INSERT INTO public.student_works (author_id, title, content, status, grade, reviewed_by)
  VALUES ('<UUID_УЧЕНИКА>', 't', 'c', 'reviewed', 80, '<UUID_УЧИТЕЛЯ>')
  RETURNING id \gset

  -- попытка автора отозвать результат
  UPDATE public.student_works SET status = 'submitted', content = 'new'
   WHERE id = :'id'
   RETURNING status, grade, content;
  -- ОЖИДАЕМО: status=reviewed, grade=80, content='c' (не изменилось)
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T3. Ученик не может выставить себе оценку через review_student_work
-- ----------------------------------------------------------------------------
-- Ожидание: ошибка 42501 NOT_MODERATOR.
BEGIN;
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '<UUID_УЧЕНИКА>', 'role', 'authenticated')::text, true);
  SELECT public.review_student_work(1, 100, 'excellent');
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T4. Гонка complete_lesson: 20 параллельных вызовов дают ровно 20 XP
-- ----------------------------------------------------------------------------
-- Выполнять в двух сессиях одновременно (psql \while или два клиента):
--   SELECT public.complete_lesson('lesson_greetings', 4, 4, 999999);
-- Ожидание: у всех вызовов xp_added = 20 у одного, 0 у остальных.
--           user_stats.total_xp = 20, completed_lessons = 1.
--           client p_xp = 999999 игнорируется.

-- ----------------------------------------------------------------------------
-- T5. Произвольный lesson_id отклоняется
-- ----------------------------------------------------------------------------
-- Ожидание: ошибка P0002 UNKNOWN_LESSON.
BEGIN;
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '<UUID_УЧЕНИКА>', 'role', 'authenticated')::text, true);
  SELECT public.complete_lesson('lesson_выдуманный', 5, 5);
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T6. Повторное прохождение не начисляет XP
-- ----------------------------------------------------------------------------
-- После T4 (в реальной сессии, без ROLLBACK):
--   SELECT public.complete_lesson('lesson_greetings', 4, 4);
-- Ожидание: xp_added = 0, already_completed = true, total_xp не изменился.

-- ----------------------------------------------------------------------------
-- T7. Гонка record_game_result
-- ----------------------------------------------------------------------------
-- Два одновременных вызова:
--   SELECT public.record_game_result('wordquiz', 20, 25, 999999);
-- Ожидание: ровно один xp_added = 10, второй 0; plays = 2; best_score = 20.

-- ----------------------------------------------------------------------------
-- T8. Самостоятельное одобрение публикации
-- ----------------------------------------------------------------------------
BEGIN;
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '<UUID_УЧЕНИКА>', 'role', 'authenticated')::text, true);

  INSERT INTO public.media_posts (author_id, title, content, post_type, status)
  VALUES ('<UUID_УЧЕНИКА>', 't', 'c', 'text', 'approved')
  RETURNING status;
  -- ОЖИДАЕМО: status = 'pending' (column-level GRANT не даёт status;
  -- если вставка вообще допустима — триггер вернёт pending)

  -- попытка сменить статус напрямую
  UPDATE public.media_posts SET status = 'approved' WHERE author_id = '<UUID_УЧЕНИКА>';
  -- ОЖИДАЕМО: permission denied for table media_posts (нет UPDATE на status)
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T9. Чужая публикация в статусе pending не видна
-- ----------------------------------------------------------------------------
BEGIN;
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '<UUID_УЧЕНИКА_1>', 'role', 'authenticated')::text, true);
  SELECT count(*) FROM public.media_posts WHERE status <> 'approved';
  -- ОЖИДАЕМО: 0 (posts_select_approved отдаёт только approved,
  --            posts_select_own — только свои)
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T10. moderators недоступна клиенту
-- ----------------------------------------------------------------------------
BEGIN;
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '<UUID_УЧЕНИКА>', 'role', 'authenticated')::text, true);
  -- ОЖИДАЕМО: permission denied for table moderators
  INSERT INTO public.moderators (user_id) VALUES ('<UUID_УЧЕНИКА>');
  SELECT * FROM public.moderators;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T11. Прямая запись в user_stats невозможна
-- ----------------------------------------------------------------------------
BEGIN;
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '<UUID_УЧЕНИКА>', 'role', 'authenticated')::text, true);
  -- ОЖИДАЕМО: permission denied for table user_stats
  UPDATE public.user_stats SET total_xp = 999999 WHERE user_id = '<UUID_УЧЕНИКА>';
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T12. Инъекция через lesson_id не исполняется
-- ----------------------------------------------------------------------------
-- Параметры PostgREST передаются как связанные значения, поэтому строка
-- «admin' --» или «'; DROP TABLE user_stats; --» обрабатывается как данные.
-- Ожидание: ошибка P0002 UNKNOWN_LESSON, таблицы не изменены.
BEGIN;
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '<UUID_УЧЕНИКА>', 'role', 'authenticated')::text, true);
  SELECT public.complete_lesson('admin'' --', 5, 5);
  SELECT public.complete_lesson('''; DROP TABLE public.user_stats; --', 5, 5);
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T13. XSS в медиа-публикации не исполняется
-- ----------------------------------------------------------------------------
-- Клиент экранирует всё через esc(); проверка в браузере:
-- опубликовать title = <img src=x onerror=alert(1)>
-- Ожидание: в ленте виден текст, а не выполненный обработчик.
-- Автоматически: python3 scripts/audit_xss.py (см. ниже).
