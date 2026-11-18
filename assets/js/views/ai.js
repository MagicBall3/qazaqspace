/**
 * AI LAB — чат с честным обозначением демо-режима.
 * История хранится только в памяти вкладки и не пишется в localStorage.
 */
import { CONFIG } from '../config.js';
import { esc, icon, toast, confirmDialog } from '../ui.js';
import { aiProvider, providerMode } from '../ai/provider.js';

const QUICK_PROMPTS = [
  'Что значит «кітап»?',
  'Переведи: Мен мектепке барамын',
  'Исправь: Мен мектеп барамын',
  'Объясни -ке',
  'Придумай диалог в магазине',
  'Помоги составить предложение'
];

const INITIAL_MESSAGE = {
  role: 'bot',
  demo: true,
  text: `Сәлем! Мен — QAZAQ SPACE-тың <b>демо-көмекшісімін</b>.<br>
    Нақты ИИ әзірге қосылмаған: жауаптар алдын ала дайындалған сценарийлерден алынады.<br><br>
    Мысалы: «Что значит кітап?», «Переведи: Мен мектепке барамын», «Исправь: Мен мектеп барамын», «Объясни -ке».`
};

let messages = [{ ...INITIAL_MESSAGE }];
let selectedLevel = 1;
let busy = false;

function messageHtml(message) {
  if (message.role === 'user') {
    return `<div class="msg me">${esc(message.text)}</div>`;
  }
  const body = message.demo
    ? message.text
    : esc(message.text).replace(/\n/g, '<br>');
  return `<div class="msg">${body}${message.error ? '' : ''}</div>`;
}

function chatHtml() {
  return messages.map(messageHtml).join('')
    + (busy ? '<div class="msg typing" aria-label="Жауап дайындалуда"><i></i><i></i><i></i></div>' : '');
}

function historyForServer() {
  return messages
    .slice(-CONFIG.ai.maxHistory)
    .map((message) => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.demo ? String(message.text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : message.text
    }));
}

export function aiView() {
  const mode = providerMode();
  const isDemo = mode === 'demo';

  return {
    nav: 'ai',
    title: 'AI LAB — ЖИ-көмекші',
    html: `
      <div class="page">
        <div class="section-head">
          <div class="eyebrow">${icon('spark')} Бес бағыттың бірі</div>
          <h2>AI LAB · ЖИ-көмекші</h2>
          <p>Грамматиканы түсіну, сөз мағынасын қарау, қатені түзету және диалог үлгісін алуға арналған көмекші.</p>
        </div>

        ${isDemo
          ? `<div class="demo-banner">
              ${icon('warn')}
              <div>
                <b>DEMO MODE.</b> Бұл нақты ИИ емес. Жауаптар алдын ала дайындалған сценарийлер мен жергілікті сөздіктен құралады.
                Нақты ИИ қосылғанда интерфейс өзгермейді — тек серверлік провайдер қосылады.
              </div>
            </div>`
          : `<div class="notice info" style="margin-bottom:14px">${icon('spark')}<div><strong>Серверлік ИИ қосылған.</strong> Сұраныстар қорғалған серверлік API арқылы жіберіледі. API кілттері клиентте сақталмайды.</div></div>`}

        <div class="split">
          <section class="card chat-card">
            <div class="chat-head">
              <span class="card-icon soft" style="width:36px;height:36px;border-radius:11px">${icon('spark')}</span>
              <div>
                <b style="font-size:.9rem">QAZAQ көмекші</b>
                <div class="tiny muted">${isDemo ? 'Демо-сценарийлер' : 'Серверлік провайдер'}</div>
              </div>
              <span class="tag ${isDemo ? 'warn' : 'ok'} status">${isDemo ? 'DEMO' : 'ONLINE'}</span>
            </div>

            <div class="chat-window" data-chat aria-live="polite">${chatHtml()}</div>

            <div class="chat-quick">
              <div class="chips">
                ${QUICK_PROMPTS.map((prompt) => `<button type="button" class="chip" data-prompt="${esc(prompt)}">${esc(prompt)}</button>`).join('')}
              </div>
            </div>

            <form class="chat-input" data-chat-form>
              <input type="text" name="message" placeholder="Сұрағыңызды жазыңыз…" maxlength="${CONFIG.ai.maxInputLength}" autocomplete="off" aria-label="Хабарлама">
              <button class="btn" type="submit" aria-label="Жіберу">${icon('arrow')}</button>
            </form>
          </section>

          <div class="stack">
            <section class="card">
              <div class="hr-label" style="margin-top:0">Деңгей</div>
              <p class="small muted">Жауаптың қарапайымдылығы оқушы деңгейіне бейімделеді.</p>
              <div class="chips" data-level-row>
                ${[1, 2, 3].map((level) => `
                  <button type="button" class="chip ${level === selectedLevel ? 'active' : ''}" data-level="${level}" aria-pressed="${level === selectedLevel}">
                    ${level + 4} сынып
                  </button>`).join('')}
              </div>
              <p class="tiny muted" style="margin:10px 0 0" data-level-note>${selectedLevel + 4} сынып деңгейі таңдалды.</p>
            </section>

            <section class="card">
              <div class="hr-label" style="margin-top:0">Не істей алады</div>
              <ul class="checklist">
                ${[
                  'Грамматиканы қарапайым тілмен түсіндіреді',
                  'Сөз бен сөйлемді аударады',
                  'Дайын қате мысалдарын түзетеді',
                  'Диалог пен сөйлем үлгісін көрсетеді',
                  'Жаңа сөздермен мысал береді'
                ].map((item) => `<li class="done">${esc(item)}</li>`).join('')}
              </ul>
            </section>

            <section class="card">
              <div class="hr-label" style="margin-top:0">Құпиялылық</div>
              <p class="small muted" style="margin-bottom:8px">
                Аты-жөніңізді, мекенжайыңызды, телефон нөміріңізді жазбаңыз. Чат тарихы бетті жаңартқанда жойылады.
              </p>
              <p class="tiny muted" style="margin-bottom:10px">
                Нақты ИИ қосылғанда сұраныстар тек серверлік прокси арқылы өтеді. API кілттері браузерге жіберілмейді.
              </p>
              <button type="button" class="btn btn-ghost btn-sm" data-clear-chat>${icon('reset')} Чатты тазалау</button>
            </section>
          </div>
        </div>
      </div>`,
    mount(root) {
      const controller = new AbortController();
      const chat = root.querySelector('[data-chat]');
      const form = root.querySelector('[data-chat-form]');
      const input = form?.querySelector('input[name="message"]');

      const scrollChat = () => {
        if (chat) chat.scrollTop = chat.scrollHeight;
      };

      const renderChat = () => {
        if (!chat) return;
        chat.innerHTML = chatHtml();
        scrollChat();
      };

      const setBusy = (value) => {
        busy = value;
        const submit = form?.querySelector('button[type="submit"]');
        if (submit) submit.disabled = value;
        if (input) input.disabled = value;
      };

      const send = async (rawText) => {
        const text = String(rawText || '').trim();
        if (!text || busy) return;
        if (text.length > CONFIG.ai.maxInputLength) {
          toast(`Хабарлама тым ұзын (${CONFIG.ai.maxInputLength} таңбадан аспауы керек)`, 'warn');
          return;
        }

        messages.push({ role: 'user', text });
        setBusy(true);
        renderChat();
        if (input) {
          input.value = '';
          input.focus();
        }

        try {
          const reply = await aiProvider.send({
            text,
            level: selectedLevel,
            history: historyForServer()
          });
          if (controller.signal.aborted) return;
          messages.push({ role: 'bot', demo: reply.demo, text: reply.text });
        } catch (error) {
          if (controller.signal.aborted) return;
          console.warn('[QAZAQ SPACE] AI request failed', error);
          messages.push({
            role: 'bot',
            demo: true,
            error: true,
            text: 'Байланыс қатесі. Демо-режимде жауап беру мүмкін болмады. Бетті жаңартып, қайта көріңіз. <br><small>Нақты ИИ қосылғанда бұл хабарлама сервер жауабына байланысты болады.</small>'
          });
        } finally {
          if (!controller.signal.aborted) {
            setBusy(false);
            renderChat();
          }
        }
      };

      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        send(input?.value || '');
      }, { signal: controller.signal });

      root.addEventListener('click', async (event) => {
        const prompt = event.target.closest('[data-prompt]');
        if (prompt) {
          send(prompt.dataset.prompt || '');
          return;
        }

        const levelButton = event.target.closest('[data-level]');
        if (levelButton) {
          selectedLevel = Number(levelButton.dataset.level) || 1;
          root.querySelectorAll('[data-level]').forEach((button) => {
            const active = button === levelButton;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
          });
          const note = root.querySelector('[data-level-note]');
          if (note) note.textContent = `${selectedLevel + 4} сынып деңгейі таңдалды.`;
          return;
        }

        const clearButton = event.target.closest('[data-clear-chat]');
        if (clearButton) {
          const confirmed = await confirmDialog({
            title: 'Чат тарихын тазалау?',
            message: 'Ағымдағы диалог тарихы жойылады. Бұл оқу прогресіне әсер етпейді.',
            confirmLabel: 'Тазалау',
            cancelLabel: 'Болдырмау'
          });
          if (!confirmed) return;
          messages = [{ ...INITIAL_MESSAGE }];
          renderChat();
          toast('Чат тазаланды', 'ok');
        }
      }, { signal: controller.signal });

      scrollChat();

      return () => controller.abort();
    }
  };
}
