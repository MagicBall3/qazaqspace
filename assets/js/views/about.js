
import { esc, icon } from '../ui.js';

const PEOPLE = [
  {
    icon: 'user-round',
    role: 'Создатель проекта',
    name: 'Юлдошев М. Ф.',
    description: 'Разработчик.'
  },
  {
    icon: 'graduation-cap',
    role: 'учитель казахского языка и литературы',
    name: 'Мухаметжанова Ж. К.',
    description: 'автор идеи QAZAQ SPACE.'
  }
];

export function aboutView() {
  return {
    nav: 'about',
    title: 'О нас — QAZAQ SPACE',
    html: `
      <div class="page">
        <section class="hero">
          <span class="hero-badge">${icon('info')} QAZAQ SPACE</span>
          <h1>О нас</h1>
          <p class="lead">Люди, стоящие за созданием проекта.</p>
        </section>

        <div class="grid cols-2">
          ${PEOPLE.map(person => `
            <article class="card">
              <div class="card-head">
                <div class="card-icon soft">
                  ${icon(person.icon)}
                </div>
                <div>
                  <p class="eyebrow">${esc(person.role)}</p>
                  <h3>${esc(person.name)}</h3>
                </div>
              </div>
              <p class="muted small">
                ${esc(person.description)}
              </p>
            </article>
          `).join('')}
        </div>
      </div>
    `
  };
}
