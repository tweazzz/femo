// src/participant/tasks.js
// Полностью рабочая версия без логов. Бережно применяет i18n и не ломает навигацию.

(function () {
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

  function applyParamsToString(template, params = {}) {
    if (typeof template !== 'string') return template;
    return template.replace(/\{([^}]+)\}/g, (m, p) => (params[p] !== undefined ? params[p] : m));
  }

  // Бережное применение переводов только внутри указанного root.
  // Не очищает innerHTML, заменяет только первый текстовый узел или placeholder-атрибут.
  function applyTranslationsSafe(root = document) {
    try {
      const dict = window.i18nDict || {};

      // Если есть глобальная функция applyTranslations (i18n.js), вызываем её сначала
      if (typeof window.applyTranslations === 'function') {
        try { window.applyTranslations(dict); } catch (e) { /* ignore */ }
      }

      // Затем дополняем: подставляем параметры и обеспечиваем поддержание изображений/структуры
      root.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        const value = dict[key];
        if (value == null) return; // перевод отсутствует — не трогаем

        // соберём параметры (data-i18n-params JSON или data-i18n-param-*)
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

        const out = applyParamsToString(value, params);
        const attr = el.getAttribute('data-i18n-attr');

        if (attr) {
          // установить атрибут (например placeholder)
          el.setAttribute(attr, out);
        } else {
          // заменим только первый непустой текстовый узел (чтобы сохранить <img> и структуру)
          let replaced = false;
          for (let node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
              node.textContent = out;
              replaced = true;
              break;
            }
          }
          if (!replaced) {
            // если нет текстовых узлов — просто добавим текст в конец (не трогая существующие элементы)
            el.appendChild(document.createTextNode(out));
          }
        }
      });
    } catch (e) {
      // silent
    }
  }

  // ---------- Level helpers ----------
  const levelClasses = {
    easy: 'text-green-primary bg-green-secondary',
    medium: 'text-orange-primary bg-orange-secondary',
    hard: 'text-red-primary bg-red-secondary',
  };

  function levelLabelToCode(label) {
    if (label == null) return null;
    const raw = String(label).trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();

    if (['easy','medium','hard'].includes(lower)) return lower;

    try {
      const d = window.i18nDict || {};
      if (d['levels.easy'] && d['levels.easy'].toLowerCase() === lower) return 'easy';
      if (d['levels.medium'] && d['levels.medium'].toLowerCase() === lower) return 'medium';
      if (d['levels.hard'] && d['levels.hard'].toLowerCase() === lower) return 'hard';
    } catch (e) { /* ignore */ }

    if (lower.includes('легк') || lower.includes('оңай') || lower.includes('easy')) return 'easy';
    if (lower.includes('сред') || lower.includes('орташа') || lower.includes('medium')) return 'medium';
    if (lower.includes('слож') || lower.includes('қиын') || lower.includes('hard')) return 'hard';
    return null;
  }

  // ---------- Auth/profile ----------
  async function ensureUserAuthenticated() {
    let userData = localStorage.getItem('user');
    if (!userData) {
      const newAccessToken = (typeof refreshAccessToken === 'function') ? await refreshAccessToken() : null;
      if (!newAccessToken) { window.location.href = '/index.html'; return null; }
      userData = localStorage.getItem('user');
      if (!userData) { window.location.href = '/index.html'; return null; }
    }
    const user = JSON.parse(userData);
    const role = user.profile?.role;
    if (role !== 'participant') { window.location.href = '/index.html'; return null; }
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

  // ---------- Daily tasks ----------
  async function loadDailyTasks() {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    const allResults = [];
    let url = 'https://portal.femo.kz/api/assignments/participant/dashboard/daily/';
    try {
      while (url) {
        const response = await authorizedFetch(url, { headers: { Authorization: `Bearer ${token}` }});
        if (!response.ok) throw new Error(`Ошибка загрузки: ${response.status}`);
        const data = await response.json();
        allResults.push(...(data.results || []));
        url = data.next;
      }
      renderDailyTasks(allResults);
    } catch (e) {
      // silent
    }
  }

  function renderDailyTasks(tasks) {
    const container = document.querySelector('.pt-6 .grid');
    if (!container) return;
    container.innerHTML = '';

    if (!tasks || tasks.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center text-gray-500 py-10">
          <div data-i18n="tasks.empty_tasks">Сегодня нет доступных задач</div>
        </div>
      `;
      applyTranslationsSafe(container);
      return;
    }

    tasks.forEach((task) => {
      const lvl = task.level || '';
      const levelKey = lvl ? `levels.${lvl}` : null;
      const solvedKey = task.solved ? 'tasks.solved' : 'tasks.not_solved';

      const taskHTML = `
        <a href="/participant/task.html?id=${task.id}&source=daily" class="border-default flex items-start space-x-4 rounded-2xl bg-white p-4">
          <div class="bg-violet-secondary rounded-xl p-2"><img src="/src/assets/images/cube.png" alt="cube" /></div>
          <div class="w-full">
            <div class="mb-2 flex items-center space-x-2">
              <span class="font-bold">${escapeHtml(task.title)}</span>
              <span class="bg-orange-secondary border-default text-orange-primary flex items-center rounded-xl px-1 py-0.5 text-sm leading-2 font-bold">
                ${task.base_points} XP
                <img class="ms-[.125rem] mb-[.125rem] h-4 w-4" src="/src/assets/images/coin.png" alt="coin" />
              </span>
              <span class="${levelClasses[lvl] || 'bg-gray-200'} border-default rounded-xl px-2 py-0.5 text-sm">
                <span ${levelKey ? `data-i18n="${levelKey}"` : ''}>${escapeHtml(lvl)}</span>
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="ms-auto size-5">
                <path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
              </svg>
            </div>

            <div class="mb-2 flex items-center justify-between text-sm text-gray-600">
              <span><span data-i18n="tasks.for_grade" data-i18n-params='{"grade":"${task.grade}"}'>Для ${task.grade} класса</span></span>
              <p class="text-gray-primary flex"><span data-i18n="${solvedKey}">${task.solved ? 'Завершено' : 'Не завершено'}</span></p>
            </div>

            <div class="flex w-full items-center space-x-4">
              <div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div class="${task.solved ? 'bg-gray-primary' : 'bg-orange-500'} h-full rounded-full" style="width: ${task.solved ? '100%' : '0%'}"></div>
              </div>
              <span class="w-4 text-sm">${task.solved ? '1/1' : '0/1'}</span>
            </div>
          </div>
        </a>
      `;
      container.insertAdjacentHTML('beforeend', taskHTML);
    });

    applyTranslationsSafe(container);
  }

  // ---------- All tasks + filters ----------
  const classMap = { 1:'first',2:'second',3:'third',4:'fourth',5:'fifth',6:'sixth',7:'seventh',8:'eighth',9:'ninth',10:'tenth',11:'eleventh',12:'twelfth' };

  function readClassFilter() {
    const select = document.querySelectorAll('.select-filter')[0];
    if (!select) return { isAll: true, number: null, raw: '' };
    const opt = select.options[select.selectedIndex];
    const optText = (opt && opt.textContent) ? opt.textContent.trim() : '';
    const optValue = opt && opt.value ? opt.value.trim() : '';
    const dataI18n = opt ? opt.getAttribute('data-i18n') : null;
    const dict = window.i18nDict || {};
    const allKey = 'tasks.all_classes111';
    const allText = dict[allKey] || '';

    const isAll = !optValue || dataI18n === allKey || (allText && allText.trim() === optText) || optText.toLowerCase() === 'все классы' || optText.toLowerCase() === 'барлық сыныптар' || optText.toLowerCase() === 'all classes';
    const number = isAll ? null : (parseInt(optText, 10) || (optValue ? parseInt(optValue, 10) : null));
    return { isAll, number, raw: optText };
  }

  function readLevelFilter() {
    const select = document.querySelectorAll('.select-filter')[1];
    if (!select) return { isAll: true, code: null, raw: '' };
    const opt = select.options[select.selectedIndex];
    const optText = (opt && opt.textContent) ? opt.textContent.trim() : '';
    const dataI18n = opt ? opt.getAttribute('data-i18n') : null;
    const dict = window.i18nDict || {};
    const allKey = 'tasks.all_levels';
    const allText = dict[allKey] || '';

    const isAll = !optText || dataI18n === allKey || (allText && allText.trim() === optText) || optText.toLowerCase() === 'все уровни' || optText.toLowerCase() === 'барлық деңгейлер' || optText.toLowerCase() === 'all levels';
    if (isAll) return { isAll: true, code: null, raw: optText };
    const code = levelLabelToCode(optText);
    return { isAll: false, code, raw: optText };
  }

  function renderAllTasks(tasks) {
    const grids = document.querySelectorAll('.grid');
    const container = grids[1] || document.querySelector('.all-tasks-grid') || document.querySelector('#all-tasks');
    if (!container) return;

    const classFilter = readClassFilter();
    const levelFilter = readLevelFilter();
    const showCompleted = (document.querySelector('input[type="checkbox"]') || {}).checked || false;

    container.innerHTML = '';

    (tasks || []).forEach((task) => {
      if (!classFilter.isAll && classFilter.number && task.grade !== classFilter.number) return;
      if (!levelFilter.isAll && levelFilter.code && task.level !== levelFilter.code) return;
      if (showCompleted && !task.solved) return;

      const lvl = task.level || '';
      const levelKey = lvl ? `levels.${lvl}` : null;
      const solvedKey = task.solved ? 'tasks.solved' : 'tasks.not_solved';

      const taskHTML = `
        <a href="/participant/task.html?id=${task.id}&source=general" class="border-default flex items-start space-x-4 rounded-2xl bg-white p-4">
          <div class="bg-violet-secondary rounded-xl p-2"><img src="/src/assets/images/cube.png" alt="cube" /></div>
          <div class="w-full">
            <div class="mb-2 flex items-center space-x-2">
              <span class="truncate font-bold">${escapeHtml(task.title)}</span>
              <span class="bg-orange-secondary border-default text-orange-primary flex items-center rounded-xl px-1 py-0.5 text-sm leading-2 font-bold">
                ${task.points} XP
                <img class="ms-[.125rem] mb-[.125rem] h-4 w-4" src="/src/assets/images/coin.png" alt="coin" />
              </span>
              <span class="${levelClasses[lvl] || 'bg-gray-200'} border-default rounded-xl px-2 py-0.5 text-sm">
                <span ${levelKey ? `data-i18n="${levelKey}"` : ''}>${escapeHtml(lvl)}</span>
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="ms-auto size-5">
                <path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
              </svg>
            </div>

            <div class="mb-2 flex items-center justify-between text-sm text-gray-600">
              <span><span data-i18n="tasks.for_grade" data-i18n-params='{"grade":"${task.grade}"}'>Для ${task.grade} класса</span></span>
              <p class="text-gray-primary flex"><span data-i18n="${solvedKey}">${task.solved ? 'Завершено' : 'Не завершено'}</span></p>
            </div>

            <div class="flex w-full items-center space-x-4">
              <div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div class="${task.solved ? 'bg-gray-primary' : 'bg-orange-500'} h-full rounded-full" style="width: ${task.solved ? '100%' : '0%'}"></div>
              </div>
              <span class="w-4 text-sm">${task.solved ? '1/1' : '0/1'}</span>
            </div>
          </div>
        </a>
      `;
      container.insertAdjacentHTML('beforeend', taskHTML);
    });

    applyTranslationsSafe(container);
  }

  async function loadAllTasks() {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    const allResults = [];
    let url = 'https://portal.femo.kz/api/assignments/participant/dashboard/general/';
    try {
      while (url) {
        const response = await authorizedFetch(url, { headers: { Authorization: `Bearer ${token}` }});
        if (!response.ok) throw new Error(`Ошибка загрузки: ${response.status}`);
        const data = await response.json();
        allResults.push(...(data.results || []));
        url = data.next;
      }
      renderAllTasks(allResults);
    } catch (e) {
      // silent
    }
  }

  function getFilterParamsForServer() {
    const classSel = readClassFilter();
    const levelSel = readLevelFilter();
    const solvedOnly = (document.querySelector('input[type="checkbox"]') || {}).checked || false;
    const params = new URLSearchParams();
    if (!classSel.isAll && classSel.number) {
      const gradeCode = classMap[classSel.number];
      if (gradeCode) params.append('grade', gradeCode);
    }
    if (!levelSel.isAll && levelSel.code) {
      params.append('level', levelSel.code);
    }
    params.append('solved_only', solvedOnly ? 'true' : 'false');
    return params;
  }

  async function loadAllTasksWithFilters() {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    const params = getFilterParamsForServer();
    const url = `https://portal.femo.kz/api/assignments/participant/dashboard/general/?${params.toString()}`;
    try {
      const response = await authorizedFetch(url, { headers: { Authorization: `Bearer ${token}` }});
      if (!response.ok) throw new Error(`Ошибка загрузки: ${response.status}`);
      const data = await response.json();
      renderAllTasks(data.results || []);
    } catch (e) {
      // silent
    }
  }

  function attachFilterListeners() {
    document.querySelectorAll('.select-filter, input[type="checkbox"]').forEach((el) => {
      el.addEventListener('change', () => {
        loadAllTasksWithFilters();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const user = await ensureUserAuthenticated();
    if (!user) return;

    try {
      const profile = await loadUserProfile();
      renderUserInfo(profile);
    } catch (e) { /* ignore */ }

    if (typeof window.initLanguageOnPage === 'function') {
      try { await window.initLanguageOnPage(); } catch (e) { /* ignore */ }
    }

    await loadDailyTasks();
    await loadAllTasks();
    attachFilterListeners();

    // Применим переводы к статическим элементам страницы (на всякий случай)
    applyTranslationsSafe(document);
  });

})();
