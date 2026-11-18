/**
 * QAZAQ SPACE — минимальный hash-роутер без зависимостей.
 * Маршруты вида '#/lesson/lesson_greetings'.
 */

const routes = new Map();
let fallback = null;
let started = false;
let onChange = null;

export function route(pattern, handler) {
  routes.set(pattern, handler);
}

export function setNotFound(handler) {
  fallback = handler;
}

export function parse() {
  const raw = String(window.location.hash || '').replace(/^#\/?/, '');
  const clean = raw.split('?')[0];
  const segments = clean.split('/').filter(Boolean);
  return {
    segments,
    path: `/${segments.join('/')}`,
    query: new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '')
  };
}

export function resolve() {
  const { segments, path, query } = parse();
  for (const [pattern, handler] of routes) {
    const parts = pattern.split('/').filter(Boolean);
    if (parts.length !== segments.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part.startsWith(':')) {
        params[part.slice(1)] = decodeURIComponent(segments[i]);
      } else if (part !== segments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { handler, params, path, query };
  }
  return { handler: fallback, params: {}, path, query };
}

export function navigate(path, { replace = false } = {}) {
  const target = `#/${String(path).replace(/^\/+/, '')}`;
  if (replace) {
    history.replaceState(null, '', target);
    if (started && onChange) onChange(resolve());
    else if (started) window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (window.location.hash === target) {
    if (started && onChange) onChange(resolve());
  } else {
    window.location.hash = target;
  }
}

export function start(callback) {
  onChange = callback;
  if (!window.location.hash) {
    history.replaceState(null, '', '#/home');
  }
  started = true;
  window.addEventListener('hashchange', () => {
    if (onChange) onChange(resolve());
  });

  callback(resolve());
}

export function currentKey() {
  return parse().segments[0] || 'home';
}
