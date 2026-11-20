import {
  getCurrentUser, getCurrentProfile, fetchLeaderboard, fetchMyRank,
  fetchFeed, fetchMyPosts, createPost, updatePost, deletePost,
} from '../supabase.js';
import { esc, icon, toast, confirmDialog, emptyState, navigate } from '../ui.js';
import { authModal } from '../auth.js';

const POST_TYPES = {
  text: { label: 'Мәтін', icon: 'edit' },
  news: { label: 'Жаңалық', icon: 'spark' },
  interview: { label: 'Сұхбат', icon: 'chat' },
  podcast: { label: 'Подкаст', icon: 'media' },
  report: { label: 'Репортаж', icon: 'media' },
  script: { label: 'Сценарий', icon: 'edit' },
};

export async function leaderboardView() {
  let loading = true;
  let error = null;
  let data = [];
  let myRank = null;

  try {
    data = await fetchLeaderboard(50);
    const user = getCurrentUser();
    if (user) myRank = await fetchMyRank();
  } catch (err) { error = err.message; }
  loading = false;

  const top10 = data.slice(0, 10);
  const rest = data.slice(10);
  const currentUserId = getCurrentUser()?.id;

  function renderRow(entry, index) {
    const profile = entry.profile || {};
    const name = esc(profile.display_name || profile.username || 'Қолданушы');
    const username = profile.username ? `@${esc(profile.username)}` : '';
    const avatar = profile.avatar_url
      ? `<img class="lb-avatar" src="${esc(profile.avatar_url)}" alt="">`
      : `<span class="lb-avatar lb-avatar-fallback">${esc((profile.display_name || 'Q')[0].toUpperCase())}</span>`;
    const isMe = entry.user_id === currentUserId;
    const medals = ['🥇', '🥈', '🥉'];
    const medal = index < 3 ? medals[index] : `#${index + 1}`;
    return `<div class="lb-row ${isMe ? 'lb-row-me' : ''}">
      <span class="lb-rank">${medal}</span>
      ${avatar}
      <div class="lb-info"><b>${name}</b>${username ? `<small class="muted">${username}</small>` : ''}</div>
      <div class="lb-stats"><span class="lb-xp">${entry.total_xp} XP</span><small class="muted">${entry.completed_lessons} сабақ · ${entry.completed_games} ойын</small></div>
    </div>`;
  }

  const html = `<div class="page">
    <div class="section-head"><div class="eyebrow">${icon('chart')} Рейтинг</div><h2>Таблица лидеров</h2><p>Үздік оқушылар тізімі.</p></div>
    ${myRank ? `<div class="notice info" style="margin-bottom:14px">${icon('chart')}<div><strong>Сіздің орныңыз:</strong> #${myRank.rank} · ${myRank.totalXP} XP</div></div>` : ''}
    ${loading ? '<div class="loading"><div class="spinner"></div>Жүктелуде...</div>'
    : error ? `<div class="error-box"><h3>Қате</h3><p class="muted">${esc(error)}</p></div>`
    : !data.length ? emptyState({ icon: 'chart', title: 'Рейтинг жоқ', text: 'Әзірге ешкім жоқ. Бірінші болыңыз!' })
    : `<div class="lb-list">${top10.map(renderRow).join('')}</div>${rest.length ? `<div class="hr-label">Қалған қатысушылар</div><div class="lb-list">${rest.map((e, i) => renderRow(e, i + 10)).join('')}</div>` : ''}`}
  </div>`;

  return { nav: 'leaderboard', title: 'Рейтинг — QAZAQ SPACE', html, mount() {} };
}

export async function mediaFeedView() {
  const user = getCurrentUser();
  let posts = [];
  let myPosts = [];
  let error = null;

  try {
    if (user) { posts = await fetchFeed(); myPosts = await fetchMyPosts(); }
  } catch (err) { error = err.message; }

  const html = `<div class="page">
    <div class="section-head"><div class="eyebrow">${icon('media')} MEDIA SPACE</div><h2>Қазақша медиа</h2><p>Оқушылардың шығармашылық жұмыстары.</p></div>
    ${!user ? `<div class="notice info" style="margin-bottom:14px">${icon('info')}<div>Жарияланған жұмыстарды көру үшін <button class="link-btn" data-auth-login>кіріңіз</button>.</div></div>`
    : `<div class="btn-row" style="margin-bottom:14px"><button class="btn" data-create-post>Жаңа жазба</button><a class="btn btn-ghost" href="#/media/my">Менің жазбаларым</a></div>`}
    ${error ? `<div class="error-box"><h3>Қате</h3><p class="muted">${esc(error)}</p></div>`
    : !posts.length ? emptyState({ icon: 'media', title: 'Жазбалар жоқ', text: 'Әзірге ешкім жазба қоймады.' })
    : `<div class="media-feed">${posts.map(post => {
      const author = post.author || {};
      const typeInfo = POST_TYPES[post.post_type] || POST_TYPES.text;
      return `<article class="media-post-card"><div class="media-post-head"><span class="tag accent">${typeInfo.label}</span><span class="tiny muted">${new Date(post.created_at).toLocaleDateString('kk-KZ')}</span></div><h3>${esc(post.title)}</h3><p class="small muted">${esc(String(post.content).slice(0, 150))}${post.content.length > 150 ? '…' : ''}</p></article>`;
    }).join('')}</div>`}
  </div>`;

  return {
    nav: 'media', title: 'MEDIA SPACE — QAZAQ SPACE', html,
    mount(root) {
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-auth-login]')) { await authModal(); navigate('/media', { replace: true }); }
        if (e.target.closest('[data-create-post]')) { if (!user) { await authModal(); return; } showCreatePostModal(); }
      });
    }
  };
}

export async function myPostsView() {
  const user = getCurrentUser();
  if (!user) {
    return { nav: 'media', title: 'Менің жазбаларым', html: '<div class="page">' + emptyState({ icon: 'media', title: 'Кіріңіз', text: 'Жазбаларыңызды көру үшін кір.', action: '<button class="btn" data-login>Кіру</button>' }) + '</div>', mount(root) { root.addEventListener('click', () => authModal()); } };
  }
  const posts = await fetchMyPosts();
  const statusLabels = { pending: 'Модерацияда', approved: 'Жарияланды', rejected: 'Қабылданбады' };
  const statusTags = { pending: 'warn', approved: 'ok', rejected: 'danger' };

  const html = `<div class="page">
    <div class="section-head"><div class="eyebrow">${icon('media')} MEDIA SPACE</div><h2>Менің жазбаларым</h2></div>
    ${!posts.length ? emptyState({ icon: 'media', title: 'Жазбалар жоқ', text: 'Алғашқы жазбаңызды қосыңыз.', action: '<a class="btn" href="#/media">Бастау</a>' })
    : `<div class="media-feed">${posts.map(post => `
      <article class="media-post-card">
        <div class="media-post-head"><span class="tag ${statusTags[post.status] || ''}">${statusLabels[post.status] || post.status}</span><span class="tiny muted">${new Date(post.created_at).toLocaleDateString('kk-KZ')}</span></div>
        <h3>${esc(post.title)}</h3>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn btn-ghost btn-sm" data-edit="${post.id}">Өңдеу</button>
          <button class="btn btn-danger btn-sm" data-delete="${post.id}">Өшіру</button>
        </div>
      </article>`).join('')}</div>`}
  </div>`;

  return {
    nav: 'media', title: 'Менің жазбаларым — MEDIA SPACE', html,
    mount(root) {
      root.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('[data-edit]');
        if (editBtn) { const post = posts.find(p => p.id === Number(editBtn.dataset.edit)); if (post) showCreatePostModal(post); }
        const delBtn = e.target.closest('[data-delete]');
        if (delBtn) {
          const id = Number(delBtn.dataset.delete);
          if (await confirmDialog({ title: 'Жазбаны өшіру?', message: 'Бұл әрекетті қайтару мүмкін емес.', confirmLabel: 'Өшіру', cancelLabel: 'Болдырмау', danger: true })) {
            try { await deletePost(id); toast('Жазба өшірілді', 'ok'); navigate('/media/my', { replace: true }); }
            catch (err) { toast(err.message, 'error'); }
          }
        }
      });
    }
  };
}

function showCreatePostModal(existing = null) {
  const root = document.createElement('div');
  root.className = 'post-modal';
  const isEdit = !!existing;
  root.innerHTML = `<div class="post-modal-overlay">
    <div class="post-modal-card">
      <button type="button" class="post-modal-close" aria-label="Жабу">✕</button>
      <h2>${isEdit ? 'Өңдеу' : 'Жаңа жазба'}</h2>
      <form data-post-form>
        <div class="field"><label for="postTitle">Тақырып</label><input type="text" id="postTitle" name="title" required maxlength="100" value="${esc(existing?.title || '')}"></div>
        <div class="field"><label for="postType">Түрі</label><select id="postType" name="postType">${Object.entries(POST_TYPES).map(([k, v]) => `<option value="${k}" ${existing?.post_type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
        <div class="field"><label for="postContent">Мәтін</label><textarea id="postContent" name="content" required maxlength="12000">${esc(existing?.content || '')}</textarea></div>
        <button type="submit" class="btn">${isEdit ? 'Сақтау' : 'Жіберу'}</button>
      </form>
    </div>
  </div>`;
  document.body.appendChild(root);
  const close = () => root.remove();
  root.querySelector('.post-modal-close').addEventListener('click', close);
  root.querySelector('.post-modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
  root.querySelector('[data-post-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = root.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = isEdit ? 'Сақталуда...' : 'Жіберілуде...';
    try {
      const title = root.querySelector('#postTitle').value;
      const content = root.querySelector('#postContent').value;
      const postType = root.querySelector('#postType').value;
      if (isEdit) { await updatePost(existing.id, { title, content, post_type: postType }); toast('Жазба жаңартылды', 'ok'); }
      else { await createPost(title, content, postType); toast('Жазба модерацияға жіберілді', 'ok'); }
      close(); navigate('/media/my', { replace: true });
    } catch (err) { toast(err.message || 'Қате', 'error'); btn.disabled = false; btn.textContent = isEdit ? 'Сақтау' : 'Жіберу'; }
  });
}
