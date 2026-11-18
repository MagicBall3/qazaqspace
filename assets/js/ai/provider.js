/**
 * Провайдер AI LAB.
 *
 * По умолчанию используется локальный көмекші (сөздік және грамматика негізінде).
 * Для подключения серверного ИИ укажите в config.js серверный URL (например, '/api/ai').
 * Ключи API хранятся ТОЛЬКО на сервере и никогда не попадают в клиент.
 */
import { CONFIG } from '../config.js';
import { demoReply } from './demo.js';

const localProvider = {
  mode: 'local',
  label: 'Локальный көмекші',
  async send({ text, level }) {
    await new Promise((resolve) => setTimeout(resolve, 450 + Math.random() * 350));
    return {
      text: demoReply(text, { level })
    };
  }
};

function httpProvider(endpoint) {
  return {
    mode: 'http',
    label: 'Серверлік ИИ',
    async send({ text, history = [], level }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            // Только учебный текст и уровень. Без имён, e-mail и других данных.
            messages: history.slice(-CONFIG.ai.maxHistory),
            level,
            locale: 'kk'
          })
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        const reply = payload.reply || payload.text || payload?.message?.content;
        if (!reply || typeof reply !== 'string') {
          throw new Error('Сервер жауабында мәтін жоқ');
        }
        return {
          text: reply,
          provider: payload.provider || null
        };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

export const aiProvider = CONFIG.ai.endpoint ? httpProvider(CONFIG.ai.endpoint) : localProvider;

export function providerMode() {
  return aiProvider.mode;
}
