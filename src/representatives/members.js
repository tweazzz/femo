/* full participants dashboard JS
   assumes helper functions exist elsewhere:
   - authorizedFetch(url, options)
   - refreshAccessToken()
   - toggleModal(id)
   - applyTranslations(dict)
*/

'use strict';

// -------------------- auth / header --------------------
async function ensureUserAuthenticated() {
  let userData = localStorage.getItem('user');

  if (!userData) {
    console.warn('user не найден в localStorage. Пробуем обновить access_token...');
    const newAccessToken = await refreshAccessToken();
    console.log('Результат refreshAccessToken:', newAccessToken);

    if (!newAccessToken) {
      console.warn('refreshAccessToken вернул null. Перенаправление на /login.html');
      window.location.href = '/index.html';
      return null;
    }

    userData = localStorage.getItem('user');
    if (!userData) {
      console.warn('user всё ещё не найден после обновления токена. Редирект.');
      window.location.href = '/index.html';
      return null;
    }
  }

  let user;
  try {
    user = JSON.parse(userData);
  } catch (e) {
    console.error('Не удалось распарсить user из localStorage', e);
    window.location.href = '/index.html';
    return null;
  }

  const role = user.profile?.role;
  if (role !== 'representative') {
    console.warn(`Пользователь с ролью "${role}" не имеет доступа к админке. Редирект.`);
    window.location.href = '/index.html';
    return null;
  }

  return user;
}

function renderUserInfo(profile) {
  const p = profile && profile.profile ? profile.profile : (profile || {});

  const avatarEl  = document.getElementById('user-avatar');
  const nameEl    = document.getElementById('user-name');
  const roleEl    = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  if (!avatarEl || !nameEl || !roleEl || !welcomeEl) {
    console.warn('renderUserInfo: отсутствуют элементы в DOM для отрисовки профиля');
    return;
  }

  const imgPath = p.image || '';
  avatarEl.src = imgPath
    ? (imgPath.startsWith('http') ? imgPath : `https://portal.femo.kz${imgPath}`)
    : '';

  // Определяем frontend language для выбора имени (которое может быть на en/ru)
  const storedLang = localStorage.getItem('lang') || 'ru';
  const frontendLang = (storedLang === 'kk') ? 'kz' : storedLang; // устойчиво: если случайно кто-то записал kk
  const fullName = (frontendLang === 'en') ? (p.full_name_en || p.full_name_ru || '') : (p.full_name_ru || p.full_name_en || '');
  nameEl.textContent = fullName;

  const firstName = (fullName.split && fullName.split(' ')[0]) || '';

  const welcomeKeyCandidates = ['welcome.message_admin', 'welcome.message', 'welcome.message_rep'];

  // Находим или создаём span[data-i18n]
  let greetSpan = welcomeEl.querySelector('span[data-i18n]');
  if (!greetSpan) {
    greetSpan = document.createElement('span');
    greetSpan.setAttribute('data-i18n', welcomeKeyCandidates[0]);
    greetSpan.textContent = 'Добро пожаловать,'; // fallback
    welcomeEl.innerHTML = '';
    welcomeEl.appendChild(greetSpan);
    welcomeEl.appendChild(document.createTextNode(' ' + firstName + ' 👋'));
  } else {
    // обновляем имя (не трогаем span текст)
    let node = greetSpan.nextSibling;
    while (node) {
      const next = node.nextSibling;
      node.remove();
      node = next;
    }
    greetSpan.after(document.createTextNode(' ' + firstName + ' 👋'));
  }

  try {
    const dict = window.i18nDict || {};
    const foundKey = welcomeKeyCandidates.find(k => Object.prototype.hasOwnProperty.call(dict, k));
    if (foundKey) greetSpan.dataset.i18n = foundKey;
    if (typeof applyTranslations === 'function') applyTranslations(dict);
  } catch (e) {
    console.warn('renderUserInfo: applyTranslations error', e);
  }

  const roleMap = { representative: 'Представитель' };
  roleEl.textContent = roleMap[p.role] || p.role || '';

  // Подписка на смену языка (обновит перевод и имя)
  function onLanguageChanged() {
    try {
      const dict = window.i18nDict || {};
      const foundKey = welcomeKeyCandidates.find(k => Object.prototype.hasOwnProperty.call(dict, k));
      if (foundKey) greetSpan.dataset.i18n = foundKey;
      if (typeof applyTranslations === 'function') applyTranslations(dict);

      const langNow = localStorage.getItem('lang') || 'ru';
      const resolvedLang = (langNow === 'kk') ? 'kz' : langNow;
      const newFullName = (resolvedLang === 'en') ? (p.full_name_en || p.full_name_ru || '') : (p.full_name_ru || p.full_name_en || '');
      nameEl.textContent = newFullName;
      let node = greetSpan.nextSibling;
      while (node) {
        const next = node.nextSibling;
        node.remove();
        node = next;
      }
      const newFirst = (newFullName.split && newFullName.split(' ')[0]) || '';
      greetSpan.after(document.createTextNode(' ' + newFirst + ' 👋'));
    } catch (e) {
      console.warn('onLanguageChanged error', e);
    }
  }

  // remove old listeners then add
  try {
    window.removeEventListener('i18n:languageChanged', onLanguageChanged);
    window.addEventListener('i18n:languageChanged', onLanguageChanged);
    window.removeEventListener('i18n:languageReady', onLanguageChanged);
    window.addEventListener('i18n:languageReady', onLanguageChanged);
  } catch (e) {
    // ignore
  }
}

async function loadRepresentativeProfileForHeader() {
  try {
    const res = await authorizedFetch('https://portal.femo.kz/api/users/representative/profile/');
    if (!res.ok) throw new Error(`Ошибка загрузки профиля представителя: ${res.status}`);
    const profile = await res.json();
    renderUserInfo(profile);
  } catch (err) {
    console.error('Ошибка при загрузке профиля для шапки:', err);
  }
}

// -------------------- глобальные переменные --------------------
let allParticipants = [];
let filteredParticipants = [];
let currentPage = 1;
const pageSize = 20;
let sortField = null;
let sortDir = 1;
let currentDeleteId = null;

// DOM references (будут установлены при DOMContentLoaded)
let searchInput = null;
let gradeSelect = null;
let exportBtn = null;
let confirmDeleteBtn = null;

// -------------------- grade mapping & normalization --------------------
const gradeTextToNum = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12
};

function getNumericGrade(val) {
  if (val == null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    const lower = trimmed.toLowerCase();
    if (lower in gradeTextToNum) return gradeTextToNum[lower];
  }
  return null;
}

// -------------------- сортировка --------------------
function attachSortHandlers() {
  document.querySelectorAll('th[data-sort-field]').forEach((th) => {
    th.classList.add('cursor-pointer');
    th.addEventListener('click', () => {
      const field = th.dataset.sortField;
      if (sortField === field) {
        sortDir = -sortDir;
      } else {
        sortField = field;
        sortDir = 1;
      }
      currentPage = 1;
      updateView();
    });
  });
}

// -------------------- селект классов: синхронизация --------------------
// Заменить старую syncGradeOptionsWithData на эту версию
function syncGradeOptionsWithData() {
  if (!gradeSelect) return;

  // подсчёт участников по нормализованным классам
  const counts = allParticipants.reduce((acc, u) => {
    const g = u.normalizedGrade;
    if (g != null) acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {});

  Array.from(gradeSelect.querySelectorAll('option')).forEach(opt => {
    const v = opt.value;
    if (!v) return; // опция "Все классы" — оставляем как есть

    const num = parseInt(v, 10);
    if (isNaN(num)) return;

    const cnt = counts[num] || 0;
    // сохраняем оригинальный текст (если ещё не сохранён)
    if (!opt.dataset.baseLabel) opt.dataset.baseLabel = opt.textContent.replace(/\s*\(\d+\)$/, '');
    // добавляем количество в скобках, чтобы пользователь видел, есть ли записи
    // opt.textContent = `${opt.dataset.baseLabel} (${cnt})`;

    // визуальный индикатор отсутствия данных: полупрозрачность (Tailwind класс)
    // опция остаётся выбираемой — при выборе таблица просто будет пустой
    opt.classList.toggle('opacity-50', cnt === 0);
  });
}


// -------------------- фильтрация --------------------
function applyFilters() {
  const term = (searchInput && searchInput.value || '').trim().toLowerCase();
  const gradeVal = gradeSelect ? gradeSelect.value : '';
  const gradeNum = gradeVal ? parseInt(gradeVal, 10) : null;

  filteredParticipants = allParticipants.filter(u => {
    const name = (u.full_name || u.full_name_ru || '').toString().toLowerCase();
    const matchSearch = !term || name.includes(term) || String(u.id).includes(term);
    const matchGrade = !gradeNum || (u.normalizedGrade === gradeNum);
    return matchSearch && matchGrade;
  });

  currentPage = 1;
  updateView();
}

function attachFilterHandlers() {
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(window._searchDebounce);
      window._searchDebounce = setTimeout(applyFilters, 300);
    });
  } else {
    console.warn('attachFilterHandlers: searchInput is not found');
  }

  if (gradeSelect) {
    gradeSelect.addEventListener('change', applyFilters);
  } else {
    console.warn('attachFilterHandlers: gradeSelect is not found');
  }
}

// -------------------- загрузка участников --------------------
async function loadParticipants() {
  try {
    const res = await authorizedFetch('https://portal.femo.kz/api/results/representatives/dashboard/participants');
    if (!res.ok) throw new Error('Ошибка загрузки участников');

    const json = await res.json();
    const raw = json.results || [];

    // нормализуем grade в поле normalizedGrade
    allParticipants = raw.map(u => ({
      ...u,
      normalizedGrade: getNumericGrade(u.grade)
    }));

    // debug: можно раскомментировать
    // console.log('allParticipants after normalization', allParticipants);

    filteredParticipants = allParticipants.slice();

    // Синхронизируем опции селекта (удалим те, которых нет)
    syncGradeOptionsWithData();

    attachFilterHandlers();

    const countEl = document.getElementById('participants-count');
    if (countEl) countEl.textContent = `Всего ${json.count} участников`;

    attachSortHandlers();
    currentPage = 1;
    renderTable();
    renderPagination();
  } catch (err) {
    console.error('loadParticipants error:', err);
  }
}

// -------------------- рендер таблицы --------------------
function renderTable() {
  const tbody = document.getElementById('participants-tbody');
  if (!tbody) {
    console.warn('renderTable: tbody not found');
    return;
  }
  tbody.innerHTML = '';

  let data = filteredParticipants.slice();
  if (sortField) {
    data.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (typeof va === 'string' || typeof vb === 'string') {
        return sortDir * (String(va || '').localeCompare(String(vb || '')));
      }
      va = va ?? 0; vb = vb ?? 0;
      return sortDir * (va - vb);
    });
  }

  const start = (currentPage - 1) * pageSize;
  const pageItems = data.slice(start, start + pageSize);

  if (pageItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-gray-500" data-i18n="members.table_empty">
          Нет участников на этой странице
        </td>
      </tr>`;
    return;
  }

  for (const user of pageItems) {
    const tr = document.createElement('tr');
    tr.classList.add('hover:bg-gray-50');

    const avatar = user.image || '/src/assets/images/user_logo.jpg';
    const displayName = user.full_name || user.full_name_ru || user.full_name_en || '';
    const displayGrade = user.normalizedGrade ?? '—';
    const city = user.city || '';
    const scores = user.scores ?? 0;

    tr.innerHTML = `
      <td class="px-6 py-4 whitespace-nowrap">
        <a href="members-progress.html?id=${user.id}" class="flex items-center">
          <div class="flex items-center">
            <img class="h-8 w-8 rounded-full" src="${avatar}" alt="avatar"/>
            <div class="ml-4">
              <div class="text-sm font-medium text-gray-900">${escapeHtml(displayName)}</div>
            </div>
          </div>
        </a>
      </td>
      <td class="px-6 py-4 text-sm whitespace-nowrap">${escapeHtml(String(user.id))}</td>
      <td class="px-6 py-4 text-sm whitespace-nowrap">${escapeHtml(String(displayGrade))}</td>
      <td class="px-6 py-4 whitespace-nowrap">
        <span class="text-sm text-gray-900">${escapeHtml(city)}</span>
      </td>
      <td class="px-6 py-4 text-sm whitespace-nowrap" style="color: orange; font-weight: bold">
        ${escapeHtml(String(scores))}
      </td>
      <td class="px-6 py-4 text-sm whitespace-nowrap">

      </td>`;

    tbody.appendChild(tr);
  }
}

// -------------------- пагинация --------------------
function renderPagination() {
  const container = document.getElementById('pagination-container');
  if (!container) return;
  container.innerHTML = '';

  const total = filteredParticipants.length;
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages === 0) {
    const countEl = document.getElementById('participants-count');
    if (countEl) countEl.textContent = `Всего ${total} участников`;
    return;
  }

  const prev = document.createElement('button');
  prev.className = 'cursor-pointer px-3 py-1';
  prev.textContent = '‹';
  prev.disabled = currentPage === 1;
  prev.onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      updateView();
    }
  };
  container.appendChild(prev);

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = i === currentPage
      ? 'border-orange-primary text-orange-primary rounded border-1 px-3 py-1'
      : 'px-3 py-1 text-gray-600 hover:bg-gray-50';
    btn.onclick = () => {
      if (currentPage !== i) {
        currentPage = i;
        updateView();
      }
    };
    container.appendChild(btn);
  }

  const next = document.createElement('button');
  next.className = 'cursor-pointer px-3 py-1';
  next.textContent = '›';
  next.disabled = currentPage === totalPages;
  next.onclick = () => {
    if (currentPage < totalPages) {
      currentPage++;
      updateView();
    }
  };
  container.appendChild(next);

  const countEl = document.getElementById('participants-count');
  if (countEl) countEl.textContent = `Всего ${total} участников`;
}

// -------------------- общие хелперы --------------------
function updateView() {
  renderTable();
  renderPagination();
}

function openDeleteModal(id) {
  currentDeleteId = id;
  toggleModal('modalDel');
}

// простая экранировка (чтобы не ломать HTML если в имени встречаются <>&)
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -------------------- export / delete handlers (will be attached when DOM ready) --------------------
// event listeners will be attached inside DOMContentLoaded (because elements may not exist earlier)

// -------------------- DOMContentLoaded — инициализация --------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Получаем DOM-элементы безопасно
  searchInput = document.getElementById('search-input');
  gradeSelect = document.getElementById('grade-filter');
  exportBtn = document.getElementById('export-btn');
  confirmDeleteBtn = document.getElementById('confirm-delete-btn');

  // Если хочешь заранее иметь в селекте опции 1..11, убедись что HTML содержит:
  // <option value="">Все классы</option><option value="1">1</option>...<option value="11">11</option>
  // Этот код только убирает те опции, которых нет в данных.

  const user = await ensureUserAuthenticated();
  if (!user) return;

  renderUserInfo(user);

  // attach export button
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      try {
        const res = await authorizedFetch('https://portal.femo.kz/api/results/representatives/dashboard/participants/export/');
        if (!res.ok) throw new Error(`Export failed: ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'participants_export.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Ошибка при экспорте участников:', err);
        alert('Не удалось скачать данные. Попробуйте позже.');
      }
    });
  } else {
    console.warn('export-btn not found');
  }

  // attach confirm delete button
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
      if (!currentDeleteId) return;
      try {
        const res = await authorizedFetch(
          `https://portal.femo.kz/api/results/representatives/dashboard/participants/${currentDeleteId}/`,
          { method: 'DELETE' }
        );
        if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
        toggleModal('modalDel');
        await loadParticipants();
      } catch (err) {
        console.error('Ошибка при удалении участника:', err);
        alert('Не удалось удалить участника');
      }
    });
  } else {
    console.warn('confirm-delete-btn not found');
  }

  // Загружаем данные
  try {
    await loadParticipants();
    await loadRepresentativeProfileForHeader();
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err);
  }
});
