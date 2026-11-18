#!/usr/bin/env python3
"""
QAZAQ SPACE — проверка целостности данных.

Запуск из корня проекта:
    python scripts/validate_data.py

Скрипт не требует зависимостей. Проверяет JSON, уникальность ID,
ссылки между разделами, корректность ответов и статусы записей.
Код выхода 1 — найдены ошибки, 0 — ошибок нет (предупреждения допустимы).
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

FILES = {
    "vocabulary": "vocabulary.json",
    "lessons": "lessons.json",
    "speak": "speak.json",
    "games": "games.json",
    "culture": "culture.json",
    "media": "media.json",
}

STATUSES = {"needs_review", "verified", "rejected"}
LEVELS = {1, 2, 3}

errors: list[str] = []
warnings: list[str] = []


def error(message: str) -> None:
    errors.append(message)


def warn(message: str) -> None:
    warnings.append(message)


def load(name: str) -> dict:
    path = DATA / FILES[name]
    if not path.exists():
        error(f"{path.relative_to(ROOT)}: файл не найден")
        return {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except json.JSONDecodeError as exc:
        error(f"{path.relative_to(ROOT)}: некорректный JSON — {exc}")
        return {}
    if not isinstance(payload, dict):
        error(f"{path.relative_to(ROOT)}: корень должен быть объектом")
        return {}
    return payload


def require(value: object, field: str, where: str) -> None:
    if value is None or (isinstance(value, str) and not value.strip()):
        error(f"{where}: отсутствует обязательное поле «{field}»")


def unique(items: list[dict], label: str, where: str) -> set[str]:
    seen: set[str] = set()
    for item in items:
        item_id = item.get("id")
        if not item_id:
            error(f"{where}: запись без id")
            continue
        if item_id in seen:
            error(f"{where}: повторяющийся id «{item_id}»")
        seen.add(item_id)
    return seen


def check_answer(options: object, answer: object, where: str) -> None:
    if not isinstance(options, list) or len(options) < 2:
        error(f"{where}: нужно минимум 2 варианта ответа")
        return
    if not isinstance(answer, int) or not 0 <= answer < len(options):
        error(f"{where}: индекс правильного ответа вне диапазона вариантов")
    if len(set(map(str, options))) != len(options):
        warn(f"{where}: повторяющиеся варианты ответа")


def check_vocabulary(payload: dict) -> tuple[set[str], dict[str, dict]]:
    topics = payload.get("topics")
    words = payload.get("words")
    if not isinstance(topics, list):
        error("vocabulary.json: отсутствует массив topics")
        topics = []
    if not isinstance(words, list):
        error("vocabulary.json: отсутствует массив words")
        words = []

    topic_ids = unique(topics, "тема", "vocabulary.json → topics")
    word_ids = unique(words, "слово", "vocabulary.json → words")

    for topic in topics:
        require(topic.get("kz"), "kz", f"тема {topic.get('id')}")
        require(topic.get("ru"), "ru", f"тема {topic.get('id')}")

    for word in words:
        wid = word.get("id") or "—"
        where = f"слово {wid}"
        for field in ("kazakh", "russian", "topic", "level", "exampleKz", "exampleRu", "status"):
            require(word.get(field), field, where)
        if word.get("topic") and word["topic"] not in topic_ids:
            error(f"{where}: неизвестная тема «{word['topic']}»")
        if word.get("level") not in LEVELS:
            error(f"{where}: уровень должен быть 1, 2 или 3")
        if word.get("status") not in STATUSES:
            error(f"{where}: недопустимый статус «{word.get('status')}»")
        if word.get("status") == "verified":
            warn(f"{where}: помечено verified — убедитесь, что преподаватель действительно проверил запись")

    pairs = Counter((w.get("kazakh", ""), w.get("russian", "")) for w in words)
    for (kazakh, russian), count in pairs.items():
        if count > 1:
            warn(f"словарь: дубль пары «{kazakh} — {russian}» ({count} раза)")

    return word_ids, {word.get("id"): word for word in words if word.get("id")}


def check_lessons(payload: dict, word_ids: set[str]) -> None:
    lessons = payload.get("lessons")
    if not isinstance(lessons, list):
        error("lessons.json: отсутствует массив lessons")
        return
    unique(lessons, "урок", "lessons.json → lessons")

    levels = set()
    for lesson in lessons:
        lid = lesson.get("id") or "—"
        where = f"урок {lid}"
        for field in ("level", "titleKz", "titleRu", "summary", "goal", "vocabulary", "examples", "explanation", "practice"):
            require(lesson.get(field), field, where)
        if lesson.get("level") not in LEVELS:
            error(f"{where}: уровень должен быть 1, 2 или 3")
        else:
            levels.add(lesson["level"])

        vocabulary = lesson.get("vocabulary") or []
        if not isinstance(vocabulary, list) or not vocabulary:
            error(f"{where}: список vocabulary пуст")
        else:
            for word_id in vocabulary:
                if word_id not in word_ids:
                    error(f"{where}: ссылка на несуществующее слово «{word_id}»")

        examples = lesson.get("examples") or []
        if not isinstance(examples, list) or len(examples) < 2:
            warn(f"{where}: меньше двух примеров")
        for index, example in enumerate(examples if isinstance(examples, list) else []):
            if not example.get("kz") or not example.get("ru"):
                error(f"{where}: пример #{index + 1} без kz/ru")

        practice = lesson.get("practice") or {}
        questions = practice.get("questions") or []
        if not isinstance(questions, list) or len(questions) < 3:
            error(f"{where}: нужно минимум 3 вопроса практики")
        else:
            for index, question in enumerate(questions):
                q_where = f"{where} → вопрос #{index + 1}"
                require(question.get("prompt"), "prompt", q_where)
                check_answer(question.get("options"), question.get("answer"), q_where)

        if not practice.get("openTask", {}).get("prompt"):
            error(f"{where}: отсутствует открытое задание openTask.prompt")

    if levels != LEVELS:
        error(f"lessons.json: должны быть уроки для 5, 6 и 7 класса, найдено: {sorted(levels)}")


def check_speak(payload: dict) -> None:
    scenarios = payload.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        error("speak.json: отсутствует массив scenarios")
        return
    unique(scenarios, "сценарий", "speak.json → scenarios")

    for scenario in scenarios:
        sid = scenario.get("id") or "—"
        where = f"SPEAK {sid}"
        for field in ("level", "titleKz", "titleRu", "situationRu", "goal", "dialogue", "phrases", "rolePlay", "selfCheck"):
            require(scenario.get(field), field, where)
        if scenario.get("level") not in LEVELS:
            error(f"{where}: уровень должен быть 1, 2 или 3")
        dialogue = scenario.get("dialogue") or []
        if not isinstance(dialogue, list) or len(dialogue) < 3:
            error(f"{where}: диалог должен содержать минимум 3 реплики")
        else:
            for index, line in enumerate(dialogue):
                if not line.get("kz") or not line.get("ru") or not line.get("speaker"):
                    error(f"{where}: реплика #{index + 1} без speaker/kz/ru")
        if not scenario.get("selfCheck"):
            error(f"{where}: отсутствует selfCheck")


def check_games(payload: dict) -> None:
    sentences = payload.get("sentences")
    proverbs = payload.get("proverbs")
    quiz = payload.get("quiz")
    quest = payload.get("quest")

    for name, value in (("sentences", sentences), ("proverbs", proverbs), ("quiz", quiz)):
        if not isinstance(value, list) or not value:
            error(f"games.json: отсутствует массив {name}")

    for sentence in sentences or []:
        sid = sentence.get("id") or "—"
        if not isinstance(sentence.get("words"), list) or len(sentence.get("words", [])) < 2:
            error(f"games.json → предложение {sid}: список words слишком короткий")
        if not sentence.get("ru"):
            error(f"games.json → предложение {sid}: нет перевода ru")
        if sentence.get("level") not in LEVELS:
            error(f"games.json → предложение {sid}: неверный уровень")

    unique(proverbs or [], "пословица", "games.json → proverbs")
    for proverb in proverbs or []:
        pid = proverb.get("id") or "—"
        where = f"games.json → пословица {pid}"
        require(proverb.get("beginning"), "beginning", where)
        require(proverb.get("ru"), "ru", where)
        check_answer(proverb.get("options"), proverb.get("answer"), where)
        if proverb.get("status") not in STATUSES:
            error(f"{where}: недопустимый статус")

    unique(quiz or [], "вопрос", "games.json → quiz")
    for question in quiz or []:
        qid = question.get("id") or "—"
        where = f"games.json → вопрос {qid}"
        require(question.get("question"), "question", where)
        check_answer(question.get("options"), question.get("answer"), where)
        if question.get("level") not in LEVELS:
            error(f"{where}: неверный уровень")

    if not isinstance(quest, dict):
        error("games.json: отсутствует объект quest")
        return
    stations = quest.get("stations")
    if not isinstance(stations, list) or not stations:
        error("games.json → quest: отсутствует массив stations")
        return
    unique(stations, "станция", "games.json → quest.stations")
    codes = Counter((station.get("code") or "").strip().upper() for station in stations)
    for code, count in codes.items():
        if not code:
            error("games.json → quest: станция без кода")
        elif count > 1:
            error(f"games.json → quest: код станции «{code}» повторяется")
    for station in stations:
        sid = station.get("id") or "—"
        where = f"games.json → станция {sid}"
        for field in ("titleKz", "titleRu", "taskKz", "question", "options", "answer", "hint"):
            require(station.get(field), field, where)
        check_answer(station.get("options"), station.get("answer"), where)


def check_culture(payload: dict) -> None:
    themes = payload.get("themes")
    cards = payload.get("cards")
    if not isinstance(themes, list):
        error("culture.json: отсутствует массив themes")
        themes = []
    if not isinstance(cards, list):
        error("culture.json: отсутствует массив cards")
        cards = []

    theme_ids = unique(themes, "тема", "culture.json → themes")
    unique(cards, "карточка", "culture.json → cards")

    for card in cards:
        cid = card.get("id") or "—"
        where = f"culture.json → карточка {cid}"
        for field in ("theme", "level", "titleKz", "titleRu", "textKz", "textRu", "dictionary", "task", "status", "source"):
            require(card.get(field), field, where)
        if card.get("theme") and card["theme"] not in theme_ids:
            error(f"{where}: неизвестная тема «{card['theme']}»")
        if card.get("level") not in LEVELS:
            error(f"{where}: неверный уровень")
        if card.get("status") not in STATUSES:
            error(f"{where}: недопустимый статус")
        task = card.get("task") or {}
        require(task.get("question"), "task.question", where)
        check_answer(task.get("options"), task.get("answer"), where)


def check_media(payload: dict) -> None:
    templates = payload.get("templates")
    if not isinstance(templates, list) or not templates:
        error("media.json: отсутствует массив templates")
        return
    unique(templates, "шаблон", "media.json → templates")

    for template in templates:
        tid = template.get("id") or "—"
        where = f"media.json → шаблон {tid}"
        for field in ("type", "level", "titleKz", "titleRu", "brief", "prompt", "checklist"):
            require(template.get(field), field, where)
        if template.get("level") not in LEVELS:
            error(f"{where}: неверный уровень")
        if not isinstance(template.get("minSentences"), int) or template.get("minSentences", 0) < 1:
            error(f"{where}: minSentences должен быть положительным числом")
        if not isinstance(template.get("starters"), list) or not template.get("starters"):
            warn(f"{where}: нет стартовых фраз")


def main() -> int:
    payloads = {name: load(name) for name in FILES}

    word_ids, _ = check_vocabulary(payloads["vocabulary"])
    check_lessons(payloads["lessons"], word_ids)
    check_speak(payloads["speak"])
    check_games(payloads["games"])
    check_culture(payloads["culture"])
    check_media(payloads["media"])

    words = payloads["vocabulary"].get("words") or []
    status_counts = Counter(word.get("status") for word in words)

    print("QAZAQ SPACE · проверка данных")
    print(f"  словарь: {len(words)} слов, {len(payloads['vocabulary'].get('topics') or [])} тем")
    print(f"  уроки: {len(payloads['lessons'].get('lessons') or [])}")
    print(f"  SPEAK: {len(payloads['speak'].get('scenarios') or [])}")
    print(f"  культура: {len(payloads['culture'].get('cards') or [])} карточек")
    print(f"  медиа: {len(payloads['media'].get('templates') or [])} шаблонов")
    print("  статусы словаря: " + ", ".join(f"{key}={value}" for key, value in sorted(status_counts.items())))
    print()

    for message in warnings:
        print(f"WARN  {message}")
    for message in errors:
        print(f"ERROR {message}")

    if errors:
        print(f"\nНайдено ошибок: {len(errors)}. Исправьте их перед публикацией.")
        return 1

    print(f"Ошибок нет. Предупреждений: {len(warnings)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
