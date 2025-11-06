// rate-olympiad.js (исправленная версия)

// ---- Helpers: безопасный доступ к DOM ----
function el(id) {
  return document.getElementById(id);
}
function safeSetText(id, value) {
  const node = el(id);
  if (node) node.textContent = value ?? '';
  else console.warn(`safeSetText: элемент с id="${id}" не найден`);
}
function safeSetHTML(id, html) {
  const node = el(id);
  if (node) node.innerHTML = html ?? '';
  else console.warn(`safeSetHTML: элемент с id="${id}" не найден`);
}
function safeQuery(selector) {
  return document.querySelector(selector);
}

// ---- Аутентификация / профиль ----
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

  const user = JSON.parse(userData);

  // Проверяем роль
  const role = user.profile?.role;
  if (role !== 'participant') {
    console.warn(`Пользователь с ролью "${role}" не имеет доступа к участникам. Редирект.`);
    window.location.href = '/index.html';
    return null;
  }

  return user;
}

async function loadUserProfile() {
  const res = await authorizedFetch('https://portal.femo.kz/api/users/participant/profile/');
  if (!res || !res.ok) throw new Error('Не удалось загрузить профиль');
  return await res.json();
}

function renderUserInfo(profile) {
  const avatarEl = el('user-avatar');
  const nameEl = el('user-name');
  const roleEl = el('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  if (!avatarEl || !nameEl || !roleEl || !welcomeEl) {
    console.warn('renderUserInfo: missing DOM elements');
    return;
  }

  const imgPath = profile.image || '';
  avatarEl.src = imgPath ? (imgPath.startsWith('http') ? imgPath : `https://portal.femo.kz${imgPath}`) : '';

  // name
  nameEl.textContent = profile.full_name_ru || profile.full_name_en || '';

  const firstName = (profile.full_name_ru || profile.full_name_en || '').split(' ')[0] || '';

  // безопасный рендер приветствия: создаём/обновляем span с data-i18n
  let greetSpan = welcomeEl.querySelector('span[data-i18n="welcome.message_rep"]');
  if (!greetSpan) {
    greetSpan = document.createElement('span');
    greetSpan.setAttribute('data-i18n', 'welcome.message_rep');
    greetSpan.textContent = 'Добро пожаловать,';
    // очистим welcomeEl и добавим span + имя
    welcomeEl.innerHTML = '';
    welcomeEl.appendChild(greetSpan);
    welcomeEl.appendChild(document.createTextNode(' ' + firstName + ' 👋'));
  } else {
    // почистим узлы после span и вставим имя
    let node = greetSpan.nextSibling;
    while (node) {
      const next = node.nextSibling;
      node.remove();
      node = next;
    }
    greetSpan.after(document.createTextNode(' ' + firstName + ' 👋'));
  }

  // если словарь i18n уже загружен, применим переводы к новому span
  try {
    if (window.i18nDict && Object.keys(window.i18nDict).length > 0 && typeof applyTranslations === 'function') {
      applyTranslations(window.i18nDict);
    }
  } catch (e) {
    console.warn('applyTranslations error', e);
  }

  const roleMap = { administrator: 'Участник', representative: 'Участник' };
  roleEl.textContent = roleMap[profile.role] || profile.role || '';
}

// ---- Загрузка данных и отображение ----

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated();
  if (!user) return;

  // загрузим профиль
  let profile;
  try {
    profile = await loadUserProfile();
  } catch (e) {
    console.error('Не удалось загрузить профиль участника:', e);
    return;
  }
  renderUserInfo(profile);

  try {
    await loadAssignments();
    setupAssignmentFilters();
    await loadOlympiadFilter();
    await populateCountryFilter();
    const data = await loadSummary();
    if (data) updateProgressBar(data.recommendation?.xp_to_next ?? 100);

    let sortAscending = true;
    const sortHeader = el('sort-rank-header');
    if (sortHeader) {
      sortHeader.addEventListener('click', () => {
        allAssignments.sort((a, b) => {
          const A = a.place;
          const B = b.place;
          return sortAscending ? A - B : B - A;
        });
        sortAscending = !sortAscending;
        renderPaginatedAssignments();
      });
    }
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err);
  }
});

// ---- Summary ----
async function loadSummary() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return null;
  }

  // Очистить карточки безопасно
  safeSetText('assignment_points', '');
  safeSetText('assignments_percent', '');
  safeSetText('olympiad_points', '');
  safeSetText('olympiad_percentile', '');
  safeSetText('total_points', '');
  safeSetText('total_percentile', '');
  safeSetText('current_level', '');
  safeSetText('xp_to_next', '');

  try {
    const response = await authorizedFetch('https://portal.femo.kz/api/results/participant/dashboard/ranking/summary/', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response || !response.ok) throw new Error('Ошибка загрузки сводки');

    const data = await response.json();

    safeSetText('assignment_points', data.assignment_points);
    safeSetText('assignments_percent', data.assignments_percent);
    safeSetText('olympiad_points', data.olympiad_points);
    safeSetText('olympiad_percentile', data.olympiad_percentile);
    safeSetText('total_points', data.total_points);
    safeSetText('total_percentile', data.total_percentile);
    safeSetText('current_level', data.recommendation?.current_level ?? 0);
    safeSetText('xp_to_next', data.recommendation?.xp_to_next ?? '');

    return data;
  } catch (err) {
    console.error('Ошибка при загрузке сводной информации:', err);
    return null;
  }
}

function updateProgressBar(xpToNext) {
  const progressBar = el('progress-bar');
  if (!progressBar) {
    console.warn('updateProgressBar: элемент progress-bar не найден');
    return;
  }
  const progress = Math.max(0, 100 - (Number(xpToNext) || 0));
  progressBar.style.width = `${progress}%`;
}

// ---- Assignments (таблица + пагинация) ----
let allAssignments = [];
let currentAssignmentPage = 1;
const assignmentPageSize = 20;
let totalAssignmentCount = 0;

let assignmentFilters = {
  search: '',
  country: '',
  grade: '',
  olympiad: ''
};

async function loadAssignments(page = 1) {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }

  const params = new URLSearchParams();
  params.append('page', page);
  if (assignmentFilters.search) params.append('search', assignmentFilters.search);
  if (assignmentFilters.country) params.append('country', assignmentFilters.country);
  if (assignmentFilters.grade) params.append('grade', assignmentFilters.grade);
  if (assignmentFilters.olympiad) params.append('olympiad_id', assignmentFilters.olympiad);

  try {
    const response = await authorizedFetch(`https://portal.femo.kz/api/results/participant/dashboard/ranking/olympiad/?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response || !response.ok) {
      throw new Error('Для начала необходимо выбрать олимпиаду!');
    }

    const data = await response.json();
    allAssignments = data.results || [];
    totalAssignmentCount = data.count || allAssignments.length;
    currentAssignmentPage = page;
    console.log('assignments data', data);

    renderAssignmentTable(allAssignments);
    renderAssignmentPagination();
    safeSetText('total-rateolympiad-count', totalAssignmentCount);
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err);
    safeSetHTML('rateolympiad-tbody', `<tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>`);
  }
}

const classMap = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eights',
  9: 'ninth',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
};

function renderAssignmentTable(assignments) {
  const tbody = el('rateolympiad-tbody');
  if (!tbody) {
    console.warn('renderAssignmentTable: tbody #rateolympiad-tbody не найден');
    return;
  }

  tbody.innerHTML =
    !assignments || assignments.length === 0
      ? `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td></tr>`
      : assignments
          .map((task) => {
            return `
      <tr class="hover:bg-gray-50">
        <td>${((task.place === 1) || (task.place === 2) || (task.place === 3)) ? task.place+'👑' : task.place}</td>
        <td>${task.full_name}</td>
        <td>${Object.keys(classMap).find((key) => classMap[key] === task.grade) || task.grade}</td>
        <td>${task.country?.name || '-'}</td>
        <td>${task.olympiad_points ?? '-'}</td>
        <td>${task.result ?? '-'}</td>
      </tr>
    `;
          })
          .join('');
}

function renderAssignmentPagination() {
  const container = document.querySelector('.pagination');
  if (!container) return;

  const totalPages = Math.max(1, Math.ceil(totalAssignmentCount / assignmentPageSize));
  let buttons = '';

  for (let i = 1; i <= totalPages; i++) {
    buttons += `
      <button class="${i === currentAssignmentPage ? 'text-orange-primary border-orange-primary border' : 'text-gray-600'} px-3 py-1 rounded"
        onclick="goToAssignmentPage(${i})">${i}</button>
    `;
  }

  container.innerHTML = `
    <div class="flex items-center gap-1">
      <button onclick="goToAssignmentPage(${Math.max(1, currentAssignmentPage - 1)})" class="px-3 py-1">←</button>
      ${buttons}
      <button onclick="goToAssignmentPage(${Math.min(totalPages, currentAssignmentPage + 1)})" class="px-3 py-1">→</button>
    </div>
  `;
}

function goToAssignmentPage(page) {
  loadAssignments(page);
}

function renderPaginatedAssignments() {
  const start = (currentAssignmentPage - 1) * assignmentPageSize;
  const end = start + assignmentPageSize;
  const pageData = allAssignments.slice(start, end);

  safeSetText('total-rateolympiad-count', allAssignments.length);
  renderAssignmentTable(pageData);
  renderAssignmentPagination();
}

function applyAssignmentFilters() {
  assignmentFilters.search = el('filter-search')?.value.trim() || '';
  assignmentFilters.country = el('filter-country')?.value || '';
  assignmentFilters.grade = el('filter-grade')?.value || '';
  assignmentFilters.olympiad = el('filter-olympiad')?.value || '';
  loadAssignments(1);
}

function setupAssignmentFilters() {
  el('filter-search')?.addEventListener('input', applyAssignmentFilters);
  el('filter-country')?.addEventListener('change', applyAssignmentFilters);
  el('filter-grade')?.addEventListener('change', applyAssignmentFilters);
  el('filter-olympiad')?.addEventListener('change', applyAssignmentFilters);
  // initial load for filters handled in DOMContentLoaded flow
}

// ---- Countries ----
async function populateCountryFilter() {
  try {
    const response = await authorizedFetch('https://portal.femo.kz/api/common/countries/?page=1&page_size=500');
    if (!response || !response.ok) throw new Error('Ошибка загрузки стран');

    const data = await response.json();
    const select = el('filter-country');
    if (!select) {
      console.warn('populateCountryFilter: select #filter-country не найден');
      return;
    }

    // очищаем и заполняем
    select.innerHTML = `<option value="">Все страны</option>`;
    data.results.forEach((country) => {
      const option = document.createElement('option');
      option.value = country.code || '';
      option.textContent = country.name || country.code || '';
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Не удалось загрузить список стран:', err);
  }
}

// ---- Olympiad filter ----
async function loadOlympiadFilter() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }

  const select = el('filter-olympiad');
  if (!select) {
    console.warn('loadOlympiadFilter: select #filter-olympiad не найден');
    return;
  }

  try {
    const response = await authorizedFetch('https://portal.femo.kz/api/olympiads/participant/dashboard/', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response || !response.ok) throw new Error(`Ошибка загрузки олимпиад: ${response?.status}`);

    const data = await response.json();

    select.innerHTML = data.results.map(olympiad => `<option value="${olympiad.id}">${olympiad.title}</option>`).join('');
    const defaultOlympiadId = data.results.length > 0 ? data.results[0].id : '';
    select.value = defaultOlympiadId;
    assignmentFilters.olympiad = defaultOlympiadId;
  } catch (error) {
    console.error('Ошибка при загрузке списка олимпиад:', error);
  }
}
