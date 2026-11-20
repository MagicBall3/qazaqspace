
import { esc, icon } from '../ui.js';

const PEOPLE = [
  {
    icon: 'user-round',
    role: 'Создатель проекта',
    name: 'Укажите своё имя',
    description: 'Разработчик и автор идеи QAZAQ SPACE.'
  },
  {
    icon: 'graduation-cap',
    role: 'Заместитель директора',
    name: 'Укажите ФИО завуча',
    description: 'Укажите краткую информацию.'
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
