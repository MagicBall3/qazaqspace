-- ============================================================================
-- 003_secure_xp.sql
-- Устраняет накрутку XP и молчаливый провал синхронизации.
--
-- НАЙДЕННЫЕ ПРОБЛЕМЫ
--   1. complete_lesson(p_xp INT DEFAULT 20) и record_game_result(p_xp INT
--      DEFAULT 10) принимали количество XP ОТ КЛИЕНТА. Любой ученик мог
--      вызвать RPC с p_xp = 999999 и возглавить рейтинг. Значение
--      доверенным быть не может.
--   2. Баллы (p_score) и максимум (p_max) тоже приходили из браузера без
--      проверки диапазона: можно было записать score = 10 при total = 1.
--   3. Функции SECURITY DEFINER без SET search_path — риск подмены
--      функций через схему в search_path.
--   4. Клиент игнорировал поле error у RPC (см. supabase.js), поэтому
--      сбой синхронизации выглядел как успех.
--
-- РЕШЕНИЕ
--   - XP вычисляется только на сервере, по фиксированным ставкам.
--   - Клиентский p_xp удалён из обеих функций (lobi совместимость сохранена:
--     старый параметр игнорируется, если его передают).
--   - Оценки ограничены диапазоном и не могут быть отрицательными.
--   - Повторное прохождение не начисляет XP повторно.
--   - SET search_path у всех SECURITY DEFINER функций.
--
-- ПОСЛЕДСТВИЯ
--   - Существующие строки (их 0) не затрагиваются.
--   - Ставки: урок 20 XP, новая игра 10 XP. Менять здесь.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_lesson(
  p_lesson_id TEXT,
  p_score     INT,
  p_total     INT,
  p_xp        INT DEFAULT NULL   -- игнорируется, оставлен для совместимости
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_done     BOOLEAN;
  v_xp       CONSTANT INT := 20;          -- ставка только на сервере
  v_score    INT := GREATEST(0, LEAST(COALESCE(p_score, 0), 1000));
  v_total    INT := GREATEST(0, LEAST(COALESCE(p_total, 0), 1000));
  v_added    INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF p_lesson_id IS NULL OR length(trim(p_lesson_id)) = 0 THEN
    RAISE EXCEPTION 'INVALID_LESSON_ID' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_progress
    WHERE user_id = v_uid AND lesson_id = p_lesson_id AND status = 'completed'
  ) INTO v_done;

  IF v_done THEN
    -- Повторное прохождение: обновляем результат, XP не начисляем.
    UPDATE public.user_progress
       SET score = GREATEST(score, v_score),
           total = GREATEST(total, v_total),
           updated_at = now()
     WHERE user_id = v_uid AND lesson_id = p_lesson_id;
    RETURN JSONB_BUILD_OBJECT('success', true, 'xp_added', 0, 'already_completed', true);
  END IF;

  INSERT INTO public.user_progress (user_id, lesson_id, status, score, total, completed_at)
  VALUES (v_uid, p_lesson_id, 'completed', v_score, v_total, now())
  ON CONFLICT (user_id, lesson_id) DO UPDATE
    SET status = 'completed',
        score  = GREATEST(user_progress.score, EXCLUDED.score),
        total  = GREATEST(user_progress.total, EXCLUDED.total),
        completed_at = now();

  INSERT INTO public.user_stats (user_id, total_xp, completed_lessons)
  VALUES (v_uid, v_xp, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET total_xp        = user_stats.total_xp + v_xp,
        completed_lessons = user_stats.completed_lessons + 1,
        updated_at      = now();

  v_added := v_xp;
  RETURN JSONB_BUILD_OBJECT('success', true, 'xp_added', v_added, 'already_completed', false);
END;
$$;


CREATE OR REPLACE FUNCTION public.record_game_result(
  p_game_id TEXT,
  p_score   INT,
  p_max     INT,
  p_xp      INT DEFAULT NULL   -- игнорируется, оставлен для совместимости
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_exists BOOLEAN;
  v_xp     CONSTANT INT := 10;            -- ставка только на сервере
  v_score  INT := GREATEST(0, LEAST(COALESCE(p_score, 0), 100000));
  v_max    INT := GREATEST(0, LEAST(COALESCE(p_max, 0), 100000));
  v_added  INT := 0;
  v_best   INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF p_game_id IS NULL OR length(trim(p_game_id)) = 0 THEN
    RAISE EXCEPTION 'INVALID_GAME_ID' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.game_results
                 WHERE user_id = v_uid AND game_id = p_game_id) INTO v_exists;

  IF v_exists THEN
    UPDATE public.game_results
       SET score = GREATEST(game_results.score, v_score),
           max_score = GREATEST(game_results.max_score, v_max),
           plays = game_results.plays + 1,
           completed_at = now()
     WHERE user_id = v_uid AND game_id = p_game_id
    RETURNING score INTO v_best;
    RETURN JSONB_BUILD_OBJECT('success', true, 'xp_added', 0, 'best_score', v_best);
  END IF;

  INSERT INTO public.game_results (user_id, game_id, score, max_score, plays, completed_at)
  VALUES (v_uid, p_game_id, v_score, v_max, 1, now());

  INSERT INTO public.user_stats (user_id, total_xp, completed_games)
  VALUES (v_uid, v_xp, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET total_xp       = user_stats.total_xp + v_xp,
        completed_games = user_stats.completed_games + 1,
        updated_at     = now();

  v_added := v_xp;
  v_best  := v_score;
  RETURN JSONB_BUILD_OBJECT('success', true, 'xp_added', v_added, 'best_score', v_best);
END;
$$;

-- Права: только аутентифицированные, только эти две функции.
REVOKE ALL ON FUNCTION public.complete_lesson(TEXT, INT, INT, INT) FROM public, anon;
REVOKE ALL ON FUNCTION public.record_game_result(TEXT, INT, INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_lesson(TEXT, INT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_game_result(TEXT, INT, INT, INT) TO authenticated;
