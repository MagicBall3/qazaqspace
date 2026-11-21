-- ============================================================================
-- 003_secure_xp.sql
-- Начисление XP: доверенный каталог, серверные ставки, атомарность.
--
-- ИСПРАВЛЯЕТ
--   1. p_xp приходил ОТ КЛИЕНТА — любой ученик мог начислить себе 999999 XP.
--      Количество очков теперь берётся из каталога на сервере, параметр
--      оставлен в подписи (по умолчанию NULL) и игнорируется.
--   2. complete_lesson('выдуманный_урок') и record_game_result('выдуманная_игра')
--      начисляли XP за идентификаторы, которых не существует. Теперь
--      идентификатор обязан быть в lesson_catalog / game_catalog.
--   3. Оценки приходили без границ. Ограничены диапазоном.
--   4. Гонка при параллельных запросах: две транзакции обе читали «ещё не
--      завершено» и обе инкрементировали total_xp. Лечится атомарной
--      «заявкой» на начисление в xp_awards (UNIQUE + ON CONFLICT DO NOTHING
--      + RETURNING): право на начисление получает ровно один запрос.
--   5. Функции SECURITY DEFINER без SET search_path.
--
-- АТОМАРНОСТЬ — КАК ЭТО РАБОТАЕТ
--   xp_awards имеет UNIQUE (user_id, kind, item_id). Вставка с
--   ON CONFLICT DO NOTHING RETURNING id блокирует вторую параллельную
--   транзакцию на уникальном индексе: она ждёт завершения первой, после
--   чего получает конфликт и v_award_id = NULL. Инкремент total_xp
--   выполняется только при v_award_id IS NOT NULL. Поэтому XP за одно
--   событие начисляется ровно один раз, даже при десятках одновременных
--   запросов.
--
-- СОВМЕСТИМОСТЬ
--   Запись со статусом in_progress переходит в completed: UPSERT по
--   (user_id, lesson_id) обновляет существующую строку, а не отказывается
--   от неё.minScore не понижается (GREATEST).
--
-- ПОСЛЕДСТВИЯ
--   - Данные не удаляются.
--   - Новый урок или игру нужно добавить в каталог (000), иначе XP не
--     начислится и вернётся ошибка UNKNOWN_LESSON / UNKNOWN_GAME.
-- ============================================================================

-- --- complete_lesson -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_lesson(
  p_lesson_id TEXT,
  p_score     INT,
  p_total     INT,
  p_xp        INT DEFAULT NULL   -- игнорируется: ставка из каталога
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_xp      INT;
  v_score   INT := GREATEST(0, LEAST(COALESCE(p_score, 0), 1000));
  v_total   INT := GREATEST(0, LEAST(COALESCE(p_total, 0), 1000));
  v_award   BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF p_lesson_id IS NULL OR length(btrim(p_lesson_id)) = 0 THEN
    RAISE EXCEPTION 'INVALID_LESSON_ID' USING ERRCODE = '22023';
  END IF;

  -- 1. Доверенный каталог: идентификатор должен существовать.
  SELECT xp_reward INTO v_xp
    FROM public.lesson_catalog
   WHERE lesson_id = p_lesson_id AND is_active;

  IF v_xp IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_LESSON: %', p_lesson_id USING ERRCODE = 'P0002';
  END IF;

  -- 2. Прогресс: in_progress -> completed, либо обновление результата.
  INSERT INTO public.user_progress (user_id, lesson_id, status, score, total, completed_at)
  VALUES (v_uid, p_lesson_id, 'completed', v_score, v_total, now())
  ON CONFLICT (user_id, lesson_id) DO UPDATE
    SET status       = 'completed',
        score        = GREATEST(user_progress.score, EXCLUDED.score),
        total        = GREATEST(user_progress.total, EXCLUDED.total),
        completed_at = now(),
        updated_at   = now();

  -- 3. Атомарная заявка на начисление. Побеждает только один запрос.
  INSERT INTO public.xp_awards (user_id, kind, item_id, xp)
  VALUES (v_uid, 'lesson', p_lesson_id, v_xp)
  ON CONFLICT (user_id, kind, item_id) DO NOTHING
  RETURNING id INTO v_award;

  -- 4. Очки только если заявку выиграли мы.
  IF v_award IS NOT NULL THEN
    INSERT INTO public.user_stats (user_id, total_xp, completed_lessons)
    VALUES (v_uid, v_xp, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET total_xp        = user_stats.total_xp + v_xp,
          completed_lessons = user_stats.completed_lessons + 1,
          updated_at      = now();
    RETURN JSONB_BUILD_OBJECT('success', true, 'xp_added', v_xp, 'already_completed', false);
  END IF;

  RETURN JSONB_BUILD_OBJECT('success', true, 'xp_added', 0, 'already_completed', true);
END;
$$;

-- --- record_game_result ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_game_result(
  p_game_id TEXT,
  p_score   INT,
  p_max     INT,
  p_xp      INT DEFAULT NULL   -- игнорируется: ставка из каталога
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_xp    INT;
  v_score INT := GREATEST(0, LEAST(COALESCE(p_score, 0), 100000));
  v_max   INT := GREATEST(0, LEAST(COALESCE(p_max, 0), 100000));
  v_award BIGINT;
  v_best  INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF p_game_id IS NULL OR length(btrim(p_game_id)) = 0 THEN
    RAISE EXCEPTION 'INVALID_GAME_ID' USING ERRCODE = '22023';
  END IF;

  -- 1. Доверенный каталог.
  SELECT xp_reward INTO v_xp
    FROM public.game_catalog
   WHERE game_id = p_game_id AND is_active;

  IF v_xp IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_GAME: %', p_game_id USING ERRCODE = 'P0002';
  END IF;

  -- 2. Результат: первая партия создаётся, повтор обновляет статистику.
  INSERT INTO public.game_results (user_id, game_id, score, max_score, plays, completed_at)
  VALUES (v_uid, p_game_id, v_score, v_max, 1, now())
  ON CONFLICT (user_id, game_id) DO UPDATE
    SET score        = GREATEST(game_results.score, EXCLUDED.score),
        max_score    = GREATEST(game_results.max_score, EXCLUDED.max_score),
        plays        = game_results.plays + 1,
        completed_at = now();

  SELECT score INTO v_best
    FROM public.game_results
   WHERE user_id = v_uid AND game_id = p_game_id;

  -- 3. Атомарная заявка: XP только за первую в истории партию.
  INSERT INTO public.xp_awards (user_id, kind, item_id, xp)
  VALUES (v_uid, 'game', p_game_id, v_xp)
  ON CONFLICT (user_id, kind, item_id) DO NOTHING
  RETURNING id INTO v_award;

  IF v_award IS NOT NULL THEN
    INSERT INTO public.user_stats (user_id, total_xp, completed_games)
    VALUES (v_uid, v_xp, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET total_xp       = user_stats.total_xp + v_xp,
          completed_games = user_stats.completed_games + 1,
          updated_at     = now();
    RETURN JSONB_BUILD_OBJECT('success', true, 'xp_added', v_xp, 'best_score', v_best, 'first_play', true);
  END IF;

  RETURN JSONB_BUILD_OBJECT('success', true, 'xp_added', 0, 'best_score', v_best, 'first_play', false);
END;
$$;

-- --- Права -----------------------------------------------------------------
REVOKE ALL ON FUNCTION public.complete_lesson(TEXT, INT, INT, INT)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_game_result(TEXT, INT, INT, INT)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_lesson(TEXT, INT, INT, INT)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_game_result(TEXT, INT, INT, INT) TO authenticated;

-- --- Перенос уже существующих завершений -----------------------------------
-- Если до миграции в user_progress уже были завершённые уроки, они получили XP
-- по старой логике. Отмечаем их в журнале, чтобы повторный вызов не начислил
-- очки второй раз. На 20.11.2026 таблица пуста, поэтому перенос — 0 строк.
INSERT INTO public.xp_awards (user_id, kind, item_id, xp)
SELECT p.user_id, 'lesson', p.lesson_id,
       COALESCE(c.xp_reward, 20)
  FROM public.user_progress p
  JOIN public.lesson_catalog c ON c.lesson_id = p.lesson_id
 WHERE p.status = 'completed'
ON CONFLICT (user_id, kind, item_id) DO NOTHING;

INSERT INTO public.xp_awards (user_id, kind, item_id, xp)
SELECT g.user_id, 'game', g.game_id,
       COALESCE(c.xp_reward, 10)
  FROM public.game_results g
  JOIN public.game_catalog c ON c.game_id = g.game_id
ON CONFLICT (user_id, kind, item_id) DO NOTHING;
