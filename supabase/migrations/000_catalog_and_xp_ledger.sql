-- ============================================================================
-- 000_catalog_and_xp_ledger.sql
-- Доверенный серверный каталог уроков и игр + журнал начислений.
--
-- ЗАЧЕМ КАТАЛОГ
--   Раньше complete_lesson('выдуманный_урок') и
--   record_game_result('выдуманная_игра') начисляли XP за идентификаторы,
--   которые придумал клиент. Проверки существования не было.
--   Теперь идентификатор обязан быть в серверном каталоге.
--
-- ЗАЧЕМ ЖУРНАЛ НАЧИСЛЕНИЙ
--   Уникальные индексы (user_id, lesson_id) и (user_id, game_id) не спасают
--   от гонки: две одновременные транзакции обе читают «ещё не завершено» и
--   обе инкрементируют total_xp. Строка прогресса не продублируется, а очки
--   начисляются дважды.
--   xp_awards — единственная точка истины. Атомарная вставка в неё
--   (ON CONFLICT DO NOTHING ... RETURNING) либо проходит, либо нет:
--   ровно один параллельный запрос получает право на начисление.
--
-- ПОСЛЕДСТВИЯ
--   - Новые таблицы, существующие данные не затрагиваются.
--   - Каталог заполняется текущими шестью уроками и девятью играми.
--     Если добавляете урок/игру — вставьте строку сюда, иначе XP не
--     начислится. Это осознанно: лучше отказ, чем накрутка.
-- ============================================================================

-- --- Каталог уроков --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_catalog (
  lesson_id   TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  xp_reward   INTEGER NOT NULL DEFAULT 20,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT lesson_catalog_xp_check CHECK (xp_reward >= 0 AND xp_reward <= 1000)
);

-- --- Каталог игр -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_catalog (
  game_id     TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  xp_reward   INTEGER NOT NULL DEFAULT 10,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT game_catalog_xp_check CHECK (xp_reward >= 0 AND xp_reward <= 1000)
);

-- Клиент читает каталоги, но не пишет в них.
ALTER TABLE public.lesson_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_catalog   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lesson_catalog_read" ON public.lesson_catalog;
CREATE POLICY "lesson_catalog_read" ON public.lesson_catalog
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "game_catalog_read" ON public.game_catalog;
CREATE POLICY "game_catalog_read" ON public.game_catalog
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.lesson_catalog FROM anon, authenticated;
REVOKE ALL ON public.game_catalog   FROM anon, authenticated;
GRANT SELECT ON public.lesson_catalog TO authenticated;
GRANT SELECT ON public.game_catalog   TO authenticated;

-- --- Журнал начислений ----------------------------------------------------
-- Одна строка = одно начисление XP. Уникальность по (user_id, kind, item_id)
-- гарантирует, что повторное событие не принесёт очков.
CREATE TABLE IF NOT EXISTS public.xp_awards (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  xp          INTEGER NOT NULL,
  awarded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT xp_awards_kind_check CHECK (kind IN ('lesson', 'game')),
  CONSTRAINT xp_awards_unique_event UNIQUE (user_id, kind, item_id)
);

CREATE INDEX IF NOT EXISTS idx_xp_awards_user ON public.xp_awards (user_id, awarded_at DESC);

ALTER TABLE public.xp_awards ENABLE ROW LEVEL SECURITY;

-- Ученик видит только свои начисления. Писать может только SECURITY DEFINER
-- функция, поэтому INSERT/UPDATE/DELETE у клиента отозваны полностью.
DROP POLICY IF EXISTS "xp_awards_select_own" ON public.xp_awards;
CREATE POLICY "xp_awards_select_own" ON public.xp_awards
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Политика для модератора добавляется в 002, после создания is_moderator().
-- Здесь на неё ссылаться нельзя: 000 выполняется раньше 002.

REVOKE ALL ON public.xp_awards FROM anon, authenticated;
GRANT SELECT ON public.xp_awards TO authenticated;

-- --- Наполнение каталога текущими данными проекта -------------------------
INSERT INTO public.lesson_catalog (lesson_id, title, xp_reward, is_active) VALUES
  ('lesson_greetings', 'Танысу / Знакомство',            20, true),
  ('lesson_family',    'Менің отбасым / Моя семья',     20, true),
  ('lesson_school',    'Мектеп / Школа',                20, true),
  ('lesson_shop',      'Дүкен / В магазине',            20, true),
  ('lesson_city',      'Қала / В городе',               20, true),
  ('lesson_opinion',   'Пікір / Мнение',                20, true)
ON CONFLICT (lesson_id) DO NOTHING;

INSERT INTO public.game_catalog (game_id, title, xp_reward, is_active) VALUES
  ('wordquiz',  'Сөз тап / Угадай слово',        10, true),
  ('sentence',  'Сөйлем құрастыр / Собери фразу',10, true),
  ('match',     'Сәйкес / Найди пару',           10, true),
  ('proverbs',  'Мақал / Пословицы',             10, true),
  ('quiz',      'Тест / Викторина',              10, true),
  ('quest',     'Квест / Квест',                 10, true),
  ('marathon',  'Марафон / Марафон',             10, true),
  ('finderror', 'Қатені тап / Найди ошибку',     10, true),
  ('qazaqword', 'QAZAQ WORD',                    10, true)
ON CONFLICT (game_id) DO NOTHING;
