// certificates.js

// ---------- Utilities ----------
function escapeHtml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// применяется переводы аккуратно: не ломает html-структуру (не очищает innerHTML).
function applyTranslationsSafe(root = document) {
  try {
    const dict = window.i18nDict || {};

    // если есть глобальная функция — вызвать её (поддержка существующего i18n.js)
    if (typeof window.applyTranslations === 'function') {
      try { window.applyTranslations(dict); } catch (e) { /* ignore */ }
    }

    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const raw = dict[key];
      if (raw == null) return;

      // params: JSON в data-i18n-params или data-i18n-param-*
      let params = {};
      const paramsAttr = el.getAttribute('data-i18n-params');
      if (paramsAttr) {
        try { params = JSON.parse(paramsAttr); } catch (e) { params = {}; }
      }
      Object.keys(el.dataset || {}).forEach((k) => {
        if (k.startsWith('i18nParam')) {
          const name = k.slice('i18nParam'.length);
          if (name) {
            const paramName = name[0].toLowerCase() + name.slice(1);
            params[paramName] = el.dataset[k];
          }
        }
      });

      // подставляем параметры
      const out = String(raw).replace(/\{([^}]+)\}/g, (m, p) => (params[p] !== undefined ? params[p] : m));

      const attr = el.getAttribute('data-i18n-attr');
      if (attr) el.setAttribute(attr, out);
      else {
        let replaced = false;
        for (let node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
            node.textContent = out;
            replaced = true;
            break;
          }
        }
        if (!replaced) el.appendChild(document.createTextNode(out));
      }
    });
  } catch (e) {
    // silent fail
  }
}

// ---------- Auth/profile ----------
async function ensureUserAuthenticated() {
  let userData = localStorage.getItem('user');

  if (!userData) {
    // попробуем обновить токен, если есть функция
    const newAccessToken = (typeof refreshAccessToken === 'function') ? await refreshAccessToken() : null;
    if (!newAccessToken) {
      window.location.href = '/index.html';
      return null;
    }
    userData = localStorage.getItem('user');
    if (!userData) { window.location.href = '/index.html'; return null; }
  }

  const user = JSON.parse(userData);
  const role = user.profile?.role;
  if (role !== 'participant') {
    window.location.href = '/index.html';
    return null;
  }
  return user;
}

async function loadUserProfile() {
  const res = await authorizedFetch('https://portal.femo.kz/api/users/participant/profile/');
  if (!res.ok) throw new Error('Не удалось загрузить профиль');
  return await res.json();
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

  const imgPath = p.image;
  avatarEl.src = imgPath
    ? (imgPath.startsWith('http') ? imgPath : `https://portal.femo.kz${imgPath}`)
    : '/src/assets/images/user-3296.svg';
  
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

  const roleMap = { participant: 'Представитель' };
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


// ---------- Assignments / Certificates ----------
let allAssignments = [];
let currentAssignmentPage = 1;
const assignmentPageSize = 20;
let totalAssignmentCount = 0;

async function loadAssignments(page = 1) {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }
  const params = new URLSearchParams();
  params.append('page', page);

  try {
    const response = await authorizedFetch(`https://portal.femo.kz/api/certificates/participant/dashboard/?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error(`Ошибка загрузки: ${response.status}`);

    const data = await response.json();
    allAssignments = data.results || [];
    totalAssignmentCount = data.count || 0;
    currentAssignmentPage = page;

    renderAssignmentTable(allAssignments.slice((page-1)*assignmentPageSize, page*assignmentPageSize));
    renderAssignmentPagination();
    const totalEl = document.getElementById('total-certificate-count');
    if (totalEl) totalEl.textContent = totalAssignmentCount;
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err);
    const tbody = document.getElementById('certificate-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red-500 py-4">${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

function getCertificateCategoryI18nKey(category) {
  const map = {
    participant: 'certificate.category.participant',
    winner: 'certificate.category.winner'
  };
  return map[category] || null;
}

function getCertificateCategoryClass(category) {
  const map = {
    participant: 'bg-blue-100 text-blue-800',
    winner: 'bg-yellow-100 text-yellow-800'
  };
  return map[category] || '';
}

function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('certificate-tbody');
  const noCertificatesEl = document.getElementById('no-certificates');
  const noCertificatesElPNG = document.getElementById('no-certificates-png');
  const tableContainer = document.getElementById('certificate-table-container');
  if (!tbody || !noCertificatesEl || !tableContainer) return;

  if (!assignments || assignments.length === 0) {
    noCertificatesEl.classList.remove('hidden');
    noCertificatesElPNG.classList.remove('hidden');
    tableContainer.classList.add('hidden');
    tbody.innerHTML = '';
    return;
  }

  noCertificatesEl.classList.add('hidden');
  noCertificatesElPNG.classList.add('hidden');
  tableContainer.classList.remove('hidden');

  tbody.innerHTML = assignments.map((task) => {
    const i18nKey = getCertificateCategoryI18nKey(task.category);
    const fallbackText = (i18nKey === 'certificate.category.participant') ? 'Участник'
                       : (i18nKey === 'certificate.category.winner') ? 'Победитель'
                       : (task.category || '');
    const categoryClass = getCertificateCategoryClass(task.category);
    const placeDisplay = ((task.place === 1) || (task.place === 2) || (task.place === 3))
      ? `${task.place}👑` : (task.place != null ? `${task.place}` : '');
    const encodedTask = encodeURIComponent(JSON.stringify(task));

    return `
      <tr class="hover:bg-gray-50">
        <td>${escapeHtml(task.olympiad)}</td>
        <td>${escapeHtml(task.date_received)}</td>
        <td>
          <span class="card ${categoryClass}">
            <span ${i18nKey ? `data-i18n="${i18nKey}"` : ''}>${escapeHtml(fallbackText)}</span>
          </span>
        </td>
        <td>${escapeHtml(placeDisplay)}</td>
        <td>
          <div class="flex justify-between gap-2 *:cursor-pointer">
            <button onclick="downloadCertificate(${task.id})" data-task="${encodedTask}" class="text-gray-400 hover:text-blue-primary" aria-label="Download certificate">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v12" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Применяем переводы к вставленному tbody
  applyTranslationsSafe(tbody);
}

function renderAssignmentPagination() {
  const container = document.querySelector('.pagination');
  if (!container) return;
  const totalPages = Math.max(1, Math.ceil(totalAssignmentCount / assignmentPageSize));
  let buttons = '';

  for (let i = 1; i <= totalPages; i++) {
    buttons += `<button class="${i === currentAssignmentPage ? 'text-orange-primary border-orange-primary border' : 'text-gray-600'} px-3 py-1 rounded" onclick="goToAssignmentPage(${i})">${i}</button>`;
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
  const totalEl = document.getElementById('total-certificate-count');
  if (totalEl) totalEl.textContent = allAssignments.length;
  renderAssignmentTable(pageData);
  renderAssignmentPagination();
}

function downloadCertificate(id) {
  const url = `https://portal.femo.kz/api/certificates/participant/dashboard/${id}/download`;
  const token = localStorage.getItem('access_token');
  fetch(url, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } })
    .then((response) => {
      if (!response.ok) throw new Error('Ошибка при загрузке файла');
      return response.blob();
    })
    .then((blob) => {
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `certificate_${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    })
    .catch((error) => {
      alert(`Ошибка: ${error.message}`);
    });
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated();
  if (!user) return;

  try {
    const profile = await loadUserProfile();
    renderUserInfo(profile);
  } catch (e) {
    // ignore profile errors
  }

  // попробуем инициализировать язык (если langInit доступен)
  if (typeof window.initLanguageOnPage === 'function') {
    try { await window.initLanguageOnPage(); } catch (e) { /* ignore */ }
  }

  await loadAssignments();
});
