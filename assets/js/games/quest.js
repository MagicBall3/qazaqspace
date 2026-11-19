/**
 * GAME · QR-квест «Мәдениет іздері».
 * 5 станций: вопрос + необязательный код станции (бонус).
 * Прогресс станций хранится локально в store.quest.
 */
import { data } from '../data.js';
import {
  getState,
  completeQuestStation,
  finishQuest,
  recordGame
} from '../store.js';
import { esc, icon, toast } from '../ui.js';
import { gameHud, gameResult } from './shared.js';

const STATION_POINTS = 10;
const CODE_BONUS = 5;

function questScore(state) {
  return Object.entries(state.quest?.stations || {}).reduce((sum, [, record]) => {
    return sum + STATION_POINTS + (record?.withCode ? CODE_BONUS : 0);
  }, 0);
}

export function render() {
  const stations = data.quest?.stations || [];
  const total = stations.length;

  let activeIndex = null;
  let selected = null;
  let answered = false;
  let feedback = '';
  let feedbackType = 'info';
  let showHint = false;
  let codeValue = '';
  let codeNote = '';

  function stateNow() {
    return getState();
  }

  function doneCount() {
    const state = stateNow();
    return stations.filter((station) => state.quest?.stations?.[station.id]).length;
  }

  function hubHtml() {
    const state = stateNow();
    const done = doneCount();
    const complete = done === total && total > 0;

    return `
      <div class="page">
        <a class="back-link" href="#/games">← Ойындарға</a>
        ${gameHud({
          roundValue: `${done}/${total} станция`,
          score: questScore(state),
          extra: complete ? '<span class="tag ok">Квест аяқталды</span>' : ''
        })}

        <section class="card" style="margin-bottom:14px">
          <div class="card-head">
            <span class="card-icon soft">${icon('qr')}</span>
            <div>
              <h3>${esc(data.quest?.titleKz || 'Мәдениет іздері')}</h3>
              <p>${esc(data.quest?.titleRu || '')}</p>
            </div>
          </div>
          <p class="small">${esc(data.quest?.introRu || '')}</p>
          <div class="notice warn" style="margin-top:12px">
            ${icon('warn')}
            <div>${esc(data.quest?.noteRu || '')}</div>
          </div>
        </section>

        ${complete
          ? `<div class="result-banner" style="margin-bottom:14px">
              <span class="tag accent">Квест аяқталды</span>
              <div class="result-score">${questScore(state)} / ${total * (STATION_POINTS + CODE_BONUS)}</div>
              <div class="result-max">Барлық станция өтілді · нәтиже жетістікте сақталды</div>
            </div>`
          : ''}

        <section class="card">
          <div class="hr-label" style="margin-top:0">Станциялар</div>
          <div class="quest-stations">
            ${stations.map((station, index) => {
              const record = state.quest?.stations?.[station.id];
              return `
                <button type="button" class="station-row ${record ? 'done' : ''}" data-station="${index}">
                  <span class="st-dot">${record ? icon('check') : index + 1}</span>
                  <span class="st-body">
                    <b>${esc(station.titleKz)} · ${esc(station.titleRu)}</b>
                    <small>${record
                      ? `Өтілді${record.withCode ? ' · код бонусы +5' : ' · кодсыз'}`
                      : 'Ашылмаған станция'}</small>
                  </span>
                  <span class="chev">${icon('chevron')}</span>
                </button>`;
            }).join('')}
          </div>
          <p class="tiny muted" style="margin:12px 0 0">
            Станцияны ашу үшін басыңыз. Код мұғалімде бар QR-кодтан алынады; кодты жазбасаңыз да станция есептеледі, бірақ бонус қосылмайды.
          </p>
        </section>
      </div>`;
  }

  function stationHtml() {
    const station = stations[activeIndex];
    const state = stateNow();
    const record = state.quest?.stations?.[station.id];
    const alreadyDone = Boolean(record);

    return `
      <div class="page">
        <button type="button" class="back-link" data-hub style="background:none;border:0;padding:0;cursor:pointer">← Станцияларға</button>
        ${gameHud({
          roundValue: `${activeIndex + 1}/${total} станция`,
          score: questScore(state),
          extra: alreadyDone ? '<span class="tag ok">Өтілді</span>' : ''
        })}

        <section class="card">
          <div class="lesson-head">
            <span class="tag accent">Станция ${activeIndex + 1}</span>
            <span class="tag">${esc(station.titleRu)}</span>
          </div>
          <h2 style="margin-bottom:6px">${esc(station.titleKz)}</h2>
          <p class="small">${esc(station.taskKz)}</p>

          <div class="field" style="margin-top:14px;max-width:320px">
            <label for="questCode">Станция коды (міндетті емес)</label>
            <input id="questCode" type="text" data-code value="${esc(codeValue)}" placeholder="QAZAQ-1" autocomplete="off" ${alreadyDone ? 'disabled' : ''}>
            ${codeNote ? `<span class="tiny ${codeNote.startsWith('Дұрыс') ? '' : 'muted'}">${esc(codeNote)}</span>` : ''}
          </div>

          <div class="hr-label" style="margin-top:16px">Сұрақ</div>
          <p style="font-weight:700;margin-bottom:10px">${esc(station.question)}</p>

          <div class="options">
            ${station.options.map((option, optionIndex) => {
              const isAnswer = optionIndex === station.answer;
              const className = answered
                ? isAnswer
                  ? 'correct'
                  : optionIndex === selected
                    ? 'wrong'
                    : ''
                : '';
              return `<button type="button" class="option ${className}" data-opt="${optionIndex}" ${answered || alreadyDone ? 'disabled' : ''}>
                <span class="opt-letter">${String.fromCharCode(65 + optionIndex)}</span>
                <span>${esc(option)}</span>
              </button>`;
            }).join('')}
          </div>

          ${feedback ? `<div class="feedback show ${feedbackType}" style="margin-top:12px">${feedback}</div>` : ''}

          <div class="btn-row" style="margin-top:12px">
            <button type="button" class="btn btn-ghost btn-sm" data-hint>${icon('info')} Кеңес</button>
            ${showHint ? `<span class="chip">${esc(station.hint || '')}</span>` : ''}
          </div>

          ${answered || alreadyDone
            ? `<div class="btn-row" style="margin-top:12px">
                <button type="button" class="btn" data-hub-btn>Станцияларға ${icon('arrow')}</button>
              </div>`
            : ''}
        </section>
        <p class="tiny muted center">Дұрыс жауап: +${STATION_POINTS} ұпай. Дұрыс код: +${CODE_BONUS} бонус.</p>
      </div>`;
  }

  function html() {
    return activeIndex === null ? hubHtml() : stationHtml();
  }

  return {
    nav: 'games',
    title: 'QR-квест — GAME',
    html: html(),
    mount(root) {
      const controller = new AbortController();

      const rerender = () => {
        root.innerHTML = html();
      };

      root.addEventListener('click', (event) => {
        const stationButton = event.target.closest('[data-station]');
        if (stationButton) {
          activeIndex = Number(stationButton.dataset.station);
          selected = null;
          answered = false;
          feedback = '';
          showHint = false;
          codeValue = '';
          codeNote = '';
          rerender();
          return;
        }

        const back = event.target.closest('[data-hub]') || event.target.closest('[data-hub-btn]');
        if (back) {
          activeIndex = null;
          feedback = '';
          rerender();
          return;
        }

        const hintButton = event.target.closest('[data-hint]');
        if (hintButton) {
          showHint = !showHint;
          rerender();
          return;
        }

        const option = event.target.closest('[data-opt]');
        if (option && !answered) {
          const station = stations[activeIndex];
          selected = Number(option.dataset.opt);
          const correct = selected === station.answer;
          if (!correct) {
            feedback = 'Қате. Мәтінді қайта оқып, басқа нұсқаны таңдаңыз.';
            feedbackType = 'bad';
            selected = null;
            rerender();
            return;
          }

          answered = true;
          const withCode = codeValue.trim().toUpperCase() === String(station.code || '').toUpperCase();
          const isNew = completeQuestStation(station.id, withCode);
          const state = stateNow();
          recordGame('quest', questScore(state));
          if (isNew && withCode) codeNote = 'Дұрыс код! +5 бонус қосылды.';
          else if (isNew) codeNote = 'Кодсыз өтілді. Бонус қосылмады.';

          const done = doneCount();
          if (done === total) {
            finishQuest(total);
            toast(`Квест аяқталды! Барлық ${total} станция өтілді.`, 'ok');
          } else {
            toast(`Дұрыс! +${STATION_POINTS} ұпай${withCode ? ' және +5 бонус' : ''}`, 'ok');
          }

          feedback = `Дұрыс! ${esc(station.explain || '')}`;
          feedbackType = 'ok';
          rerender();
        }
      }, { signal: controller.signal });

      root.addEventListener('input', (event) => {
        const input = event.target.closest('[data-code]');
        if (input) codeValue = input.value;
      }, { signal: controller.signal });

      return () => controller.abort();
    }
  };
}
