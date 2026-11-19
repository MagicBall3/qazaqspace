/**
 * SPEAK — диалогтар, рөлдік жағдаяттар және өзін-өзі тексеру.
 */
import { data } from '../data.js';
import { completeSpeak, getState } from '../store.js';
import { esc, icon, levelLabel, speakKazakh, toast, emptyState } from '../ui.js';

export function speakView() {
  const state = getState();
  const done = data.speak.filter((scenario) => state.speak[scenario.id]).length;

  return {
    nav: 'speak',
    title: 'SPEAK — сөйлеу практикасы',
    html: `
      <div class="page">
        <div class="section-head">
          <div class="eyebrow">${icon('chat')} Төрт бағыттың бірі</div>
          <h2>SPEAK · Сөйлеу практикасы</h2>
          <p>Нақты өмірлік жағдайларда қазақша сөйлеуді үйреніңіз: диалогты тыңдаңыз, фразаларды қайталаңыз, рөлдік тапсырманы орындаңыз.</p>
        </div>

        <div class="grid cols-3" style="margin-bottom:16px">
          <div class="card"><div class="stat"><b>${done}/${data.speak.length}</b><small>жағдаят орындалды</small></div></div>
          <div class="card"><div class="stat"><b>3</b><small>қадам: оқу → қайталау → сөйлеу</small></div></div>
          <div class="card"><div class="stat"><b>5–7</b><small>сынып деңгейлері</small></div></div>
        </div>

        <div class="row-list">
          ${data.speak.map((scenario) => {
            const completed = Boolean(state.speak[scenario.id]);
            return `
              <a class="row-item" href="#/speak/${esc(scenario.id)}">
                <span class="num">${esc(scenario.titleKz.slice(0, 2))}</span>
                <span class="row-body">
                  <b>${esc(scenario.titleKz)} <span class="muted" style="font-weight:500">· ${esc(scenario.titleRu)}</span></b>
                  <small>${esc(scenario.situationRu)}</small>
                </span>
                <span class="tag">${levelLabel(scenario.level)}</span>
                ${completed ? '<span class="tag ok">Орындалды</span>' : '<span class="tag warn">Жаңа</span>'}
                <span class="chev">${icon('chevron')}</span>
              </a>`;
          }).join('')}
        </div>

        <div class="notice info" style="margin-top:16px">
          ${icon('info')}
          <div>
            <strong>Бұл диалогтар — оқу үлгілері.</strong>
            Олар нақты адамдардың сөзі емес. Рөлдік тапсырманы сыныптасыңмен орындап, кейін өз сөзіңмен қайталап көріңіз.
            Мұғалім материалды тексеріп, өзгерте алады.
          </div>
        </div>
      </div>`
  };
}

export function speakScenarioView(params) {
  const scenario = data.speakIndex.get(params.id);
  if (!scenario) {
    return {
      nav: 'speak',
      title: 'Жағдаят табылмады',
      html: `<div class="page">${emptyState({
        icon: 'chat',
        title: 'Жағдаят табылмады',
        text: 'SPEAK тізіміне оралыңыз.',
        action: '<a class="btn btn-sm" href="#/speak">SPEAK-ке оралу</a>'
      })}</div>`
    };
  }

  const state = getState();
  const completed = Boolean(state.speak[scenario.id]);

  const dialogue = (scenario.dialogue || []).map((line) => `
    <div class="bubble ${line.side === 'b' ? 'right' : ''}">
      <div class="who">${esc(line.speaker)}</div>
      <div class="kz-line">
        <span>${esc(line.kz)}</span>
        <button type="button" class="speak-btn" data-speak="${esc(line.kz)}" aria-label="Тыңдау">${icon('speaker')}</button>
      </div>
      <div class="ru-line">${esc(line.ru)}</div>
    </div>`).join('');

  const phrases = (scenario.phrases || []).map((phrase) => `
    <div class="phrase-item">
      <b>${esc(phrase.kz)}</b>
      <span>${esc(phrase.ru)}</span>
    </div>`).join('');

  const checks = (scenario.selfCheck || []).map((item, index) => `
    <label class="check-row">
      <input type="checkbox" data-check="${index}">
      <span>${esc(item)}</span>
    </label>`).join('');

  return {
    nav: 'speak',
    title: `${scenario.titleKz} — SPEAK`,
    html: `
      <div class="page">
        <a class="back-link" href="#/speak">← SPEAK-ке</a>

        <section class="card" style="margin-bottom:14px">
          <div class="lesson-head">
            <span class="tag accent">${levelLabel(scenario.level)}</span>
            <span class="tag">${esc(scenario.titleRu)}</span>
            <span data-done-tag>${completed ? '<span class="tag ok">Орындалды</span>' : ''}</span>
          </div>
          <h1 style="margin-bottom:4px">${esc(scenario.titleKz)}</h1>
          <p class="muted" style="margin-bottom:12px">${esc(scenario.situationRu)}</p>
          <div class="lesson-goal"><b>Мақсат:</b> ${esc(scenario.goal)}</div>
        </section>

        <section class="card" style="margin-bottom:14px">
          <div class="card-head">
            <div style="flex:1">
              <div class="hr-label" style="margin:0 0 4px">Диалог</div>
              <p class="small muted" style="margin:0">Мәтінді дауыстап оқыңыз. Аударманы жасырып, өзіңіз түсінуге тырысыңыз.</p>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-toggle-translations aria-pressed="false">Аударманы жасыру</button>
          </div>
          <div class="dialogue">${dialogue}</div>
        </section>

        <div class="split" style="margin-bottom:14px">
          <section class="card">
            <div class="hr-label" style="margin-top:0">Пайдалы фразалар</div>
            <div class="phrase-list">${phrases}</div>
          </section>

          <section class="card">
            <div class="hr-label" style="margin-top:0">Рөлдік тапсырма</div>
            <p class="small"><b>Сенің рөлің:</b> ${esc(scenario.rolePlay?.yourRole || '')}</p>
            <p class="small"><b>Серіктесің:</b> ${esc(scenario.rolePlay?.partnerRole || '')}</p>
            <p class="small muted">${esc(scenario.rolePlay?.task || '')}</p>
            <ol class="small" style="margin:8px 0 0;padding-left:20px;color:var(--muted);line-height:1.6">
              ${(scenario.rolePlay?.steps || []).map((step) => `<li>${esc(step)}</li>`).join('')}
            </ol>
          </section>
        </div>

        <section class="card" style="margin-bottom:14px">
          <div class="hr-label" style="margin-top:0">Өзін-өзі тексеру</div>
          <p class="small muted">Орындаған әрекеттерді белгілеңіз. Бұл — өзін-өзі бағалау, автоматты баға емес.</p>
          <div class="check-list">${checks}</div>
          <div class="btn-row" style="margin-top:14px">
            <button type="button" class="btn" data-complete ${completed ? 'disabled' : 'disabled'}>
              ${completed ? 'Орындалды ✓' : 'Жағдаятты аяқтадым'}
            </button>
            <span class="small muted" data-check-count>0 / ${(scenario.selfCheck || []).length}</span>
          </div>
          <div data-complete-note style="margin-top:10px">
            ${completed ? `<div class="notice ok">${icon('check')}<div>Бұл жағдаят аяқталған. Қайталап сөйлеуге болады.</div></div>` : ''}
          </div>
        </section>

        <div class="btn-row" style="justify-content:space-between">
          <a class="btn btn-ghost btn-sm" href="#/speak">← Тізімге</a>
          <a class="btn btn-ghost btn-sm" href="#/games">Ойынмен бекіту ${icon('arrow')}</a>
        </div>
      </div>`,
    mount(root) {
      const controller = new AbortController();
      const checkboxes = Array.from(root.querySelectorAll('[data-check]'));
      const completeButton = root.querySelector('[data-complete]');
      const countLabel = root.querySelector('[data-check-count]');
      const totalChecks = checkboxes.length;
      let isCompleted = completed;

      const updateChecks = () => {
        const checked = checkboxes.filter((box) => box.checked).length;
        if (countLabel) countLabel.textContent = `${checked} / ${totalChecks}`;
        if (completeButton && !isCompleted) {
          completeButton.disabled = checked < totalChecks;
        }
      };

      root.addEventListener('click', (event) => {
        const speakButton = event.target.closest('[data-speak]');
        if (speakButton) {
          speakKazakh(speakButton.dataset.speak || '');
          return;
        }

        const toggle = event.target.closest('[data-toggle-translations]');
        if (toggle) {
          const hide = toggle.getAttribute('aria-pressed') !== 'true';
          root.querySelectorAll('.ru-line').forEach((line) => {
            line.hidden = hide;
          });
          toggle.setAttribute('aria-pressed', String(hide));
          toggle.textContent = hide ? 'Аударманы көрсету' : 'Аударманы жасыру';
          return;
        }

        const complete = event.target.closest('[data-complete]');
        if (complete && !isCompleted) {
          const checked = checkboxes.filter((box) => box.checked).length;
          if (checked < totalChecks) return;
          isCompleted = true;
          completeSpeak(scenario.id);
          complete.disabled = true;
          complete.textContent = 'Орындалды ✓';
          const doneTag = root.querySelector('[data-done-tag]');
          if (doneTag) doneTag.innerHTML = '<span class="tag ok">Орындалды</span>';
          const note = root.querySelector('[data-complete-note]');
          if (note) {
            note.innerHTML = `<div class="notice ok">${icon('check')}<div>Жағдаят аяқталды! +15 ұпай. Енді сол диалогты еске түсіріп, өз сөзіңізбен қайталаңыз.</div></div>`;
          }
          toast('Жағдаят аяқталды! +15 ұпай', 'ok');
        }
      }, { signal: controller.signal });

      checkboxes.forEach((box) => {
        box.addEventListener('change', updateChecks, { signal: controller.signal });
      });

      updateChecks();

      return () => controller.abort();
    }
  };
}
