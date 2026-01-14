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

  
function getLevelLabel(lvl) {
  if (!lvl) return '';
  const lang = (localStorage.getItem('lang') || 'ru').toLowerCase();
  const dict = window.i18nDict || {};
  const key = `levels.${lvl}`;

  // Если есть перевод в словаре — используем его
  if (dict[key]) return dict[key];

  // Fallback для русского (дефолт)
  if (lang === 'ru') {
    if (lvl === 'easy') return 'Лёгкий';
    if (lvl === 'medium') return 'Средний';
    if (lvl === 'hard') return 'Сложный';
  }

  // Fallback для английского
  if (lang === 'en') {
    if (lvl === 'easy') return 'Easy';
    if (lvl === 'medium') return 'Medium';
    if (lvl === 'hard') return 'Hard';
  }

  // Fallback для казахского
  if (lang === 'kk' || lang === 'kz') {
    if (lvl === 'easy') return 'Оңай';
    if (lvl === 'medium') return 'Орташа';
    if (lvl === 'hard') return 'Қиын';
  }

  return lvl; // если ничего не подошло
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
          <div class="bg-violet-secondary rounded-xl p-2"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g clip-path="url(#clip0_4387_36066)">
          <path d="M0.935677 8.93784L13.7313 3.54208C14.7224 3.12363 15.7905 2.94744 16.8587 3.01351L30.8106 3.9385C31.4713 3.98255 31.9888 4.53314 31.9888 5.19384V20.8195C31.9888 21.293 31.7686 21.7445 31.3942 22.0308L22.4306 28.9462C22.1443 29.1664 21.7809 29.2766 21.4175 29.2655L5.13116 28.4837C4.43741 28.4507 3.85379 27.9551 3.71064 27.2834L0.0437238 10.6777C-0.121453 9.96193 0.26396 9.22414 0.935677 8.93784Z" fill="#F4891E"/>
          <path d="M3.6011 26.8979L0.0222809 10.6776C-0.10986 10.083 0.363644 9.5324 0.969291 9.57645L19.469 10.7547C19.9205 10.7877 20.2729 11.1291 20.3169 11.5806L21.8256 28.0652C21.8806 28.7039 21.3631 29.2545 20.7134 29.2214L5.40703 28.4396C4.5371 28.3845 3.7883 27.7569 3.6011 26.8979Z" fill="#F4891E"/>
          <path d="M20.5812 10.6114L31.0974 4.54395C31.4938 4.31271 32.0003 4.59901 32.0003 5.0615V21.2818C32.0003 21.469 31.9123 21.6452 31.7691 21.7553L22.8165 28.6157C22.4421 28.902 21.9026 28.6597 21.8585 28.1972L20.2948 11.173C20.2618 10.9528 20.3719 10.7215 20.5812 10.6114Z" fill="#F4891E"/>
          <path d="M0.671514 9.10328L13.6103 3.5974C14.4913 3.223 15.4493 3.05783 16.4073 3.11288L30.9538 3.9718C31.2622 3.99382 31.3503 4.39025 31.086 4.54441L20.9552 10.3917C20.4817 10.667 19.9421 10.7881 19.4025 10.755L0.737585 9.56577C0.506339 9.53274 0.451279 9.20239 0.671514 9.10328Z" fill="#F4891E"/>
          <path d="M27.1891 16.6571L25.4272 17.9015C25.3171 17.439 24.9317 17.2298 24.5463 17.417C24.1389 17.6152 23.8746 18.2098 23.9627 18.7274C23.9737 18.7934 23.9847 18.8485 24.0067 18.9035L22.1457 20.225L21.408 12.0983C21.3639 11.5917 21.6062 11.1072 22.0466 10.8429L26.7707 8.02393L27.1891 16.6571Z" fill="#E81C2B"/>
          <path d="M26.2088 12.7478C26.1208 12.2302 26.385 11.6356 26.7925 11.4374C27.1999 11.2392 27.6073 11.4924 27.6954 12.021C27.7835 12.5386 27.5192 13.1332 27.1118 13.3314C26.6934 13.5296 26.2969 13.2653 26.2088 12.7478Z" fill="#E81C2B"/>
          <path d="M27.5315 23.7706L23.4791 26.964C23.1928 27.1952 22.7634 27.008 22.7304 26.6446L22.1467 20.2248L27.1901 16.657L27.3333 19.5421C27.3002 19.5531 27.2672 19.5641 27.2231 19.5861C26.8157 19.7843 26.5514 20.379 26.6395 20.8965C26.7166 21.37 27.058 21.6343 27.4324 21.5132L27.5315 23.7706Z" fill="#CEDEF1"/>
          <path d="M23.9537 18.7383C23.8656 18.2207 24.1299 17.6261 24.5373 17.4279C24.9448 17.2296 25.3522 17.4829 25.4403 18.0115C25.5284 18.54 25.2641 19.1237 24.8567 19.3219C24.4492 19.5201 24.0418 19.2558 23.9537 18.7383Z" fill="#CEDEF1"/>
          <path d="M22.3119 20.4452C22.2789 20.4452 22.2458 20.4232 22.2128 20.4012C22.1798 20.3461 22.1908 20.28 22.2348 20.236L24.0298 18.9476C23.9857 18.6944 23.8866 17.9125 24.4592 17.5381C24.6684 17.406 24.8556 17.3729 25.0208 17.45C25.241 17.5491 25.3512 17.8134 25.4062 18.0006L26.9919 16.8554C27.047 16.8224 27.113 16.8334 27.1571 16.8774C27.1901 16.9325 27.1791 16.9985 27.1351 17.0426L25.4062 18.2979C25.3732 18.32 25.3291 18.331 25.2961 18.3089C25.2631 18.2979 25.23 18.2539 25.23 18.2208C25.208 18.0997 25.1309 17.7473 24.9437 17.6703C24.8556 17.6262 24.7345 17.6482 24.6024 17.7363C24.0628 18.0887 24.283 18.9696 24.283 18.9696C24.294 19.0137 24.272 19.0688 24.239 19.0908L22.378 20.4342C22.356 20.4342 22.3339 20.4452 22.3119 20.4452Z" fill="#B9D2EA"/>
          <path d="M31.5614 13.5852V20.0491C31.5614 20.4015 31.3962 20.7318 31.1209 20.9521L27.5311 23.7821L27.1897 16.6685L28.6543 15.6334C28.7754 16.0739 29.1498 16.2831 29.5352 16.0959C29.9426 15.8977 30.2069 15.303 30.1188 14.7855C30.1078 14.7304 30.0968 14.6754 30.0858 14.6313L31.5614 13.5852Z" fill="#E81C2B"/>
          <path d="M26.6275 20.9079C26.5395 20.3904 26.8037 19.7957 27.2112 19.5975C27.6186 19.3993 28.026 19.6526 28.1141 20.1812C28.2022 20.7097 27.9379 21.2933 27.5305 21.4916C27.1231 21.6898 26.7156 21.4255 26.6275 20.9079Z" fill="#E81C2B"/>
          <path d="M27.3435 16.8887C27.3105 16.8887 27.2664 16.8667 27.2444 16.8337C27.2114 16.7786 27.2224 16.7125 27.2774 16.6685L28.5438 15.7985C28.5768 15.7765 28.6099 15.7765 28.6429 15.7875C28.6759 15.7985 28.698 15.8206 28.72 15.8536C28.72 15.8536 28.8631 16.1619 29.1164 16.25C29.2596 16.2941 29.4137 16.261 29.5789 16.1619C30.3938 15.6774 30.1956 14.7084 30.1956 14.6974C30.1846 14.6533 30.2066 14.6093 30.2396 14.5762L31.3408 13.7724C31.3958 13.7393 31.4619 13.7504 31.506 13.7944C31.539 13.8495 31.528 13.9155 31.4839 13.9596L30.4378 14.7194C30.4709 14.9837 30.5149 15.8646 29.7 16.3491C29.4688 16.4813 29.2486 16.5253 29.0503 16.4592C28.8081 16.3822 28.6539 16.184 28.5768 16.0518L27.4206 16.8557C27.3876 16.8777 27.3655 16.8887 27.3435 16.8887Z" fill="#FC5EB9"/>
          <path d="M31.5602 5.73345V13.5848L27.1885 16.6571L27.0233 13.3536C27.0563 13.3426 27.0784 13.3316 27.1114 13.3206C27.5188 13.1223 27.7831 12.5277 27.695 12.0102C27.618 11.5477 27.2876 11.2834 26.9242 11.3825L26.759 8.03491L31.0756 5.46917C31.2959 5.34804 31.5602 5.49119 31.5602 5.73345Z" fill="#CEDEF1"/>
          <path d="M28.6302 15.5119C28.5421 14.9944 28.8064 14.3997 29.2139 14.2015C29.6213 14.0033 30.0287 14.2566 30.1168 14.7852C30.2049 15.3027 29.9406 15.8973 29.5332 16.0956C29.1147 16.2938 28.7183 16.0405 28.6302 15.5119Z" fill="#CEDEF1"/>
          <path d="M27.364 16.3822C27.298 16.3822 27.2539 16.3382 27.2539 16.2721L27.1218 13.4861C27.1218 13.4421 27.1438 13.409 27.1768 13.387C27.2099 13.365 27.8596 12.9576 27.7935 12.0986C27.7274 11.2728 27.1218 11.2617 27.0998 11.2617C27.0337 11.2617 26.9896 11.2177 26.9896 11.1516L26.8245 8.20047C26.8245 8.1344 26.8685 8.07935 26.9346 8.07935C27.0007 8.07935 27.0557 8.12339 27.0557 8.18946L27.2099 11.0525C27.4411 11.0966 27.9587 11.2838 28.0247 12.0876C28.0908 12.9465 27.5402 13.42 27.353 13.5522L27.4852 16.2831C27.4742 16.3272 27.4301 16.3822 27.364 16.3822Z" fill="#B9D2EA"/>
          <path d="M25.7353 7.03325L20.9452 9.7972C20.3726 10.1276 19.7229 10.2817 19.0732 10.2377L10.429 9.68708L17.2452 6.48267L20.0973 6.66986C20.0532 6.7029 20.0202 6.72492 19.9982 6.75796C19.789 7.00022 20.0753 7.19843 20.6479 7.19843C21.1874 7.19843 21.7821 7.02224 22.0243 6.79099L25.7353 7.03325Z" fill="#FF8D76"/>
          <path d="M15.6045 7.84809C15.5604 8.12339 14.9658 8.35463 14.272 8.37666C13.5783 8.39868 13.0497 8.20047 13.0828 7.92518C13.1268 7.64988 13.7214 7.41864 14.4152 7.39661C15.1089 7.37459 15.6485 7.58381 15.6045 7.84809Z" fill="#FF8D76"/>
          <path d="M11.0463 9.69809C11.0022 9.69809 10.9582 9.67606 10.9472 9.63201C10.9251 9.57696 10.9472 9.51089 11.0022 9.47785L13.5019 8.28858C13.3367 8.22251 13.1825 8.13442 13.1715 7.99126C13.1495 7.80406 13.3697 7.69395 13.5349 7.62788C14.1626 7.36359 14.9665 7.48472 15.1537 7.51776L17.2789 6.54872C17.334 6.5267 17.4111 6.54872 17.4331 6.60378C17.4551 6.65884 17.4331 6.72491 17.378 6.75795L15.2197 7.74901C15.1977 7.76002 15.1757 7.76002 15.1537 7.76002C15.1426 7.76002 14.2617 7.58383 13.634 7.84811C13.4358 7.93621 13.4138 7.99126 13.4138 7.99126C13.4358 8.03531 13.6561 8.12341 13.8653 8.16745C13.9093 8.17846 13.9534 8.22251 13.9534 8.26656C13.9534 8.3106 13.9313 8.36566 13.8873 8.38769L11.1123 9.7091C11.0793 9.69809 11.0683 9.69809 11.0463 9.69809Z" fill="#FC796B"/>
          <path d="M22.717 3.83973L17.2331 6.48255L14.1939 6.35041C14.2159 6.32839 14.2379 6.31737 14.26 6.29535C14.4912 6.0641 14.1719 5.8769 13.5442 5.8769C12.9496 5.8769 12.2999 6.04208 12.0356 6.2513L8.88623 6.10815L13.8635 3.92782C14.6234 3.59747 15.4492 3.44331 16.2751 3.48735L22.717 3.83973Z" fill="#FF8D76"/>
          <path d="M21.0546 5.03999C21.0216 5.24922 20.5701 5.43641 20.0306 5.44743C19.502 5.46945 19.0835 5.31529 19.1166 5.10606C19.1496 4.89684 19.6011 4.70964 20.1407 4.69863C20.6802 4.6766 21.0877 4.83077 21.0546 5.03999Z" fill="#FF8D76"/>
          <path d="M9.70187 6.04198C9.65783 6.04198 9.61378 6.01995 9.59176 5.97591C9.56973 5.92085 9.59175 5.85478 9.65782 5.82174C9.70187 5.79972 13.8423 4.08188 14.4479 3.80659C15.1197 3.50927 16.2318 3.52028 17.1238 3.57534C18.1038 3.6304 21.9029 3.85064 21.9029 3.85064L21.8919 4.08188C21.8919 4.08188 18.1038 3.86165 17.1128 3.80659C16.2429 3.76254 15.1747 3.74052 14.547 4.01581C13.9414 4.29111 9.78997 6.00894 9.74592 6.03097C9.7239 6.04198 9.71288 6.04198 9.70187 6.04198Z" fill="#FC796B"/>
          <path d="M30.1181 4.56635L25.7354 7.03299L17.2454 6.4824L19.4807 5.40324C19.6349 5.44729 19.8221 5.4583 20.0313 5.4583C20.5599 5.43628 21.0224 5.26009 21.0554 5.05087C21.0664 4.94075 20.9673 4.84164 20.7801 4.78659L22.7182 3.85059L30.041 4.28005C30.2062 4.26904 30.2502 4.47826 30.1181 4.56635Z" fill="white"/>
          <path d="M22.0468 6.75761C21.8375 6.99987 21.2099 7.19808 20.6372 7.19808C20.0646 7.19808 19.7783 6.99987 19.9876 6.75761C20.1968 6.51535 20.8244 6.31714 21.3971 6.31714C21.9697 6.31714 22.256 6.51535 22.0468 6.75761Z" fill="white"/>
          <path d="M17.8175 6.49357C17.7735 6.49357 17.7294 6.47155 17.7184 6.42751C17.6964 6.37245 17.7184 6.30637 17.7735 6.27334L19.5023 5.45847C19.5243 5.44746 19.5574 5.44746 19.5794 5.44746C19.5904 5.44746 20.2181 5.60162 20.8127 5.31532C20.9999 5.22722 21.099 5.13913 21.11 5.05104C21.121 4.96294 21.044 4.89687 21.044 4.89687C21.0109 4.87485 20.9999 4.8308 20.9999 4.79776C20.9999 4.76473 21.0329 4.72068 21.066 4.70967L22.7177 3.8948C22.7398 3.88379 22.7508 3.88379 22.7728 3.88379L29.8203 4.25819C29.8864 4.25819 29.9304 4.31325 29.9304 4.37932C29.9304 4.44539 29.8644 4.48944 29.8093 4.48944L22.7948 4.11504L21.2972 4.85282C21.3303 4.91889 21.3523 4.99598 21.3413 5.08407C21.3192 5.26026 21.1761 5.40341 20.9118 5.53555C20.3282 5.81085 19.7336 5.72275 19.5684 5.68972L17.8726 6.49357C17.8505 6.49357 17.8285 6.49357 17.8175 6.49357Z" fill="#CEDEF1"/>
          <path d="M17.2456 6.48231L15.1424 7.47337C14.9442 7.42932 14.7019 7.39629 14.4266 7.4073C13.7329 7.42932 13.1382 7.67158 13.0942 7.93586C13.0722 8.068 13.2043 8.18913 13.4245 8.27723L10.4293 9.68673L2.55594 9.18019C2.4238 9.16918 2.39077 8.98198 2.5119 8.92692L8.8877 6.10791L17.2456 6.48231Z" fill="white"/>
          <path d="M14.2609 6.28417C14.0297 6.51541 13.3359 6.70262 12.7083 6.70262C12.0806 6.70262 11.7612 6.51541 11.9925 6.28417C12.2237 6.05292 12.9175 5.86572 13.5452 5.86572C14.1728 5.87673 14.4922 6.06393 14.2609 6.28417Z" fill="white"/>
          <path d="M2.75357 9.10323C2.70952 9.10323 2.66547 9.08121 2.64345 9.03716C2.62143 8.9821 2.64345 8.91603 2.69851 8.883L8.84307 6.13006C8.86509 6.11905 8.8761 6.11905 8.89813 6.11905L12.1025 6.30625C12.2567 6.19613 12.8403 5.79971 13.6552 5.86578C13.8865 5.8878 14.1617 5.93185 14.2058 6.11905C14.2278 6.20714 14.1838 6.29524 14.1177 6.37232L16.6614 6.50446C16.7275 6.50446 16.7715 6.55952 16.7715 6.62559C16.7715 6.69166 16.7165 6.73571 16.6504 6.73571L13.7984 6.59255C13.7433 6.59255 13.6993 6.5485 13.6882 6.50446C13.6772 6.4494 13.6993 6.40535 13.7433 6.37232C13.8534 6.30625 13.9635 6.20714 13.9745 6.1741C13.9745 6.1741 13.9195 6.11905 13.6332 6.09702C12.7853 6.03095 12.2127 6.50446 12.2017 6.51547C12.1796 6.53749 12.1466 6.54851 12.1246 6.5375L8.90914 6.35029L2.79761 9.09222C2.77559 9.10323 2.76458 9.10323 2.75357 9.10323Z" fill="#CEDEF1"/>
          <path d="M20.0298 20.4779L17.7834 20.3457L11.0882 19.9493L10.2734 13.3312L9.98706 11.0298L18.2459 11.5363C18.8075 11.5694 19.2479 12.0098 19.303 12.5604L20.0298 20.4779Z" fill="#1C3177"/>
          <path d="M14.2381 20.2357C14.0839 19.5089 14.5794 18.9143 15.3393 18.9143C16.0991 18.9143 16.8369 19.5089 16.991 20.2357C17.1452 20.9625 16.6497 21.5571 15.8898 21.5571C15.13 21.5571 14.3922 20.9625 14.2381 20.2357Z" fill="#1C3177"/>
          <path d="M19.7001 28.2303L12.0579 27.8559L11.0889 19.9495L14.2162 20.1367C14.2162 20.1697 14.2272 20.2027 14.2382 20.2358C14.3924 20.9625 15.1302 21.5572 15.89 21.5572C16.6278 21.5572 17.1123 20.9956 17.0022 20.3018L20.0414 20.478L20.6581 27.2392C20.7021 27.7898 20.2507 28.2523 19.7001 28.2303Z" fill="white"/>
          <path d="M10.1636 24.1119C10.0094 23.3852 10.505 22.7905 11.2648 22.7905C12.0246 22.7905 12.7624 23.3852 12.9166 24.1119C13.0707 24.8387 12.5752 25.4333 11.8154 25.4333C11.0556 25.4333 10.3178 24.8387 10.1636 24.1119Z" fill="white"/>
          <path d="M15.9229 21.8543C15.9008 21.8543 15.8678 21.8543 15.8458 21.8543C14.3482 21.7992 14.0288 20.7421 13.9628 20.4007L11.2759 20.2686C11.2098 20.2686 11.1658 20.2135 11.1658 20.1475C11.1658 20.0814 11.2208 20.0374 11.2869 20.0374L14.0619 20.1805C14.1169 20.1805 14.172 20.2246 14.172 20.2906C14.172 20.3457 14.2821 21.579 15.8458 21.6341C16.2202 21.6451 16.5175 21.557 16.7267 21.3478C17.0681 21.0174 17.0681 20.5109 17.0681 20.5109C17.0681 20.4778 17.0791 20.4448 17.1011 20.4228C17.1231 20.4007 17.1562 20.3897 17.1892 20.3897L19.8871 20.4998C19.9532 20.4998 19.9972 20.5549 19.9972 20.621C19.9972 20.687 19.9421 20.7311 19.8761 20.7311L17.2883 20.632C17.2663 20.8302 17.1892 21.2266 16.8809 21.5129C16.6496 21.7442 16.3193 21.8543 15.9229 21.8543Z" fill="#CEDEF1"/>
          <path d="M12.0572 27.8561L5.90161 27.5478C5.27393 27.5147 4.73436 27.0743 4.60222 26.4576L3.04956 19.5532L11.0992 19.9496L11.4515 22.8127C11.3965 22.8017 11.3414 22.8017 11.2753 22.8017C10.5155 22.8017 10.031 23.3963 10.1742 24.1231C10.3173 24.8389 11.0221 25.4115 11.7599 25.4445L12.0572 27.8561Z" fill="#8324E3"/>
          <path d="M5.5601 19.7953C5.40593 19.0685 5.90146 18.4739 6.66127 18.4739C7.42109 18.4739 8.15887 19.0685 8.31304 19.7953C8.4672 20.5221 7.97167 21.1167 7.21186 21.1167C6.45205 21.1167 5.71426 20.5221 5.5601 19.7953Z" fill="#8324E3"/>
          <path d="M11.8698 27.7789C11.8147 27.7789 11.7596 27.7348 11.7596 27.6798L11.5614 25.7307C11.209 25.6756 9.98675 25.3673 9.86562 23.9578C9.83258 23.5614 9.92068 23.242 10.1409 22.9998C10.4492 22.6584 10.9117 22.5593 11.132 22.5373L10.8567 20.1477C10.8457 20.0817 10.8897 20.0266 10.9558 20.0156C11.0219 20.0046 11.0769 20.0486 11.0879 20.1147L11.3852 22.6254C11.3852 22.6584 11.3742 22.6915 11.3632 22.7135C11.3412 22.7355 11.3082 22.7575 11.2751 22.7575C11.2641 22.7575 10.6585 22.7796 10.3281 23.154C10.1519 23.3522 10.0748 23.6164 10.1079 23.9468C10.24 25.3893 11.6275 25.5215 11.6936 25.5215C11.7486 25.5215 11.7927 25.5655 11.8037 25.6206L12.0129 27.6578C12.0239 27.7238 11.9689 27.7789 11.9138 27.7789C11.8808 27.7789 11.8698 27.7789 11.8698 27.7789Z" fill="#8324E3"/>
          <path d="M10.857 20.2688L8.11506 20.1476C8.06 20.1476 8.01596 20.1036 8.00494 20.0485C7.99393 19.9935 7.83977 18.7602 6.57342 18.8262C6.33116 18.8372 6.14396 18.9253 6.02283 19.0685C5.76956 19.3768 5.84664 19.8724 5.84664 19.8834C5.84664 19.9164 5.84664 19.9494 5.8136 19.9825C5.79158 20.0045 5.75855 20.0265 5.72551 20.0155L3.22584 19.8944C3.15977 19.8944 3.11572 19.8393 3.11572 19.7732C3.11572 19.7072 3.17078 19.6631 3.23685 19.6631L5.60438 19.7843C5.59337 19.586 5.61539 19.2117 5.83563 18.9253C6.0008 18.7161 6.24306 18.606 6.55139 18.595C7.80673 18.5179 8.13708 19.5971 8.21417 19.9274L10.857 20.0485C10.9231 20.0485 10.9671 20.1036 10.9671 20.1697C10.9671 20.2247 10.9231 20.2688 10.857 20.2688Z" fill="#8324E3"/>
          <path d="M9.18315 15.754C9.02898 15.0273 9.52451 14.4326 10.2843 14.4326C11.0441 14.4326 11.7819 15.0273 11.9361 15.754C12.0902 16.4808 11.5947 17.0754 10.8349 17.0754C10.0751 17.0644 9.33731 16.4808 9.18315 15.754Z" fill="white"/>
          <path d="M11.0885 19.9495L8.31357 19.8173V19.8063C8.1594 19.0796 7.42161 18.4849 6.6618 18.4849C5.94604 18.4849 5.47253 19.0135 5.54961 19.6852L3.04995 19.5641L1.25503 11.4154C1.15592 10.9529 1.53032 10.5124 2.00383 10.5454L10.0094 11.041L11.0885 19.9495Z" fill="white"/>
          <path d="M10.8467 19.8944C10.7916 19.8944 10.7366 19.8503 10.7366 19.7953L10.3952 16.9322C10.3952 16.8992 10.4062 16.8552 10.4282 16.8331C10.4503 16.8111 10.4943 16.8001 10.5274 16.8001C10.5274 16.8001 11.0669 16.8882 11.3863 16.6239C11.5404 16.4918 11.6285 16.2825 11.6285 15.9962C11.6175 14.862 10.186 14.7189 10.175 14.7189C10.1199 14.7189 10.0759 14.6748 10.0759 14.6198L9.66843 11.1951C9.65742 11.129 9.70147 11.074 9.76754 11.063C9.83361 11.052 9.88867 11.096 9.89968 11.1621L10.2961 14.4986C10.6485 14.5537 11.8598 14.84 11.8708 15.9962C11.8708 16.3486 11.7607 16.6129 11.5514 16.8001C11.2651 17.0424 10.8687 17.0534 10.6595 17.0424L10.9788 19.7623C10.9898 19.8283 10.9458 19.8834 10.8797 19.8944C10.8577 19.8944 10.8467 19.8944 10.8467 19.8944Z" fill="#F0F6FC"/>
          <path d="M3.14874 19.5309C3.09368 19.5309 3.04964 19.4979 3.03862 19.4429L1.28775 11.4043C1.24371 11.184 1.29877 10.9638 1.44192 10.7876C1.58507 10.6224 1.80531 10.5343 2.02554 10.5454L9.43645 11.107C9.50252 11.107 9.54657 11.162 9.54657 11.2281C9.54657 11.2942 9.4805 11.3382 9.42544 11.3382L2.01453 10.7766C1.86037 10.7656 1.71721 10.8206 1.61811 10.9418C1.519 11.0519 1.47495 11.2061 1.50799 11.3602L3.25886 19.3988C3.26987 19.4649 3.23683 19.5199 3.17076 19.5309C3.17076 19.5309 3.15975 19.5309 3.14874 19.5309Z" fill="#CEDEF1"/>
          </g>
          <defs>
          <clipPath id="clip0_4387_36066">
          <rect width="32" height="32" fill="white"/>
          </clipPath>
          </defs>
          </svg>
          </div>
          <div class="w-full">
            <div class="mb-2 flex items-center space-x-2">
              <span class="font-bold">${escapeHtml(task.title)}</span>
              <span class="bg-orange-secondary border-default text-orange-primary flex items-center rounded-xl px-1 py-0.5 text-sm leading-2 font-bold">
                ${task.base_points} XP
                <img class="ms-[.125rem] mb-[.125rem] h-4 w-4" src="/src/assets/images/coin.png" alt="coin" />
              </span>
              <span class="${levelClasses[lvl] || 'bg-gray-200'} border-default rounded-xl px-2 py-0.5 text-sm">
                <span ${levelKey ? `data-i18n="${levelKey}"` : ''}>${getLevelLabel(lvl)}</span>
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
    const completedCheckbox = document.getElementById('onlyCompleted');
    const showCompleted = completedCheckbox?.checked || false;

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
          <div class="bg-violet-secondary rounded-xl p-2"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g clip-path="url(#clip0_4387_36066)">
          <path d="M0.935677 8.93784L13.7313 3.54208C14.7224 3.12363 15.7905 2.94744 16.8587 3.01351L30.8106 3.9385C31.4713 3.98255 31.9888 4.53314 31.9888 5.19384V20.8195C31.9888 21.293 31.7686 21.7445 31.3942 22.0308L22.4306 28.9462C22.1443 29.1664 21.7809 29.2766 21.4175 29.2655L5.13116 28.4837C4.43741 28.4507 3.85379 27.9551 3.71064 27.2834L0.0437238 10.6777C-0.121453 9.96193 0.26396 9.22414 0.935677 8.93784Z" fill="#F4891E"/>
          <path d="M3.6011 26.8979L0.0222809 10.6776C-0.10986 10.083 0.363644 9.5324 0.969291 9.57645L19.469 10.7547C19.9205 10.7877 20.2729 11.1291 20.3169 11.5806L21.8256 28.0652C21.8806 28.7039 21.3631 29.2545 20.7134 29.2214L5.40703 28.4396C4.5371 28.3845 3.7883 27.7569 3.6011 26.8979Z" fill="#F4891E"/>
          <path d="M20.5812 10.6114L31.0974 4.54395C31.4938 4.31271 32.0003 4.59901 32.0003 5.0615V21.2818C32.0003 21.469 31.9123 21.6452 31.7691 21.7553L22.8165 28.6157C22.4421 28.902 21.9026 28.6597 21.8585 28.1972L20.2948 11.173C20.2618 10.9528 20.3719 10.7215 20.5812 10.6114Z" fill="#F4891E"/>
          <path d="M0.671514 9.10328L13.6103 3.5974C14.4913 3.223 15.4493 3.05783 16.4073 3.11288L30.9538 3.9718C31.2622 3.99382 31.3503 4.39025 31.086 4.54441L20.9552 10.3917C20.4817 10.667 19.9421 10.7881 19.4025 10.755L0.737585 9.56577C0.506339 9.53274 0.451279 9.20239 0.671514 9.10328Z" fill="#F4891E"/>
          <path d="M27.1891 16.6571L25.4272 17.9015C25.3171 17.439 24.9317 17.2298 24.5463 17.417C24.1389 17.6152 23.8746 18.2098 23.9627 18.7274C23.9737 18.7934 23.9847 18.8485 24.0067 18.9035L22.1457 20.225L21.408 12.0983C21.3639 11.5917 21.6062 11.1072 22.0466 10.8429L26.7707 8.02393L27.1891 16.6571Z" fill="#E81C2B"/>
          <path d="M26.2088 12.7478C26.1208 12.2302 26.385 11.6356 26.7925 11.4374C27.1999 11.2392 27.6073 11.4924 27.6954 12.021C27.7835 12.5386 27.5192 13.1332 27.1118 13.3314C26.6934 13.5296 26.2969 13.2653 26.2088 12.7478Z" fill="#E81C2B"/>
          <path d="M27.5315 23.7706L23.4791 26.964C23.1928 27.1952 22.7634 27.008 22.7304 26.6446L22.1467 20.2248L27.1901 16.657L27.3333 19.5421C27.3002 19.5531 27.2672 19.5641 27.2231 19.5861C26.8157 19.7843 26.5514 20.379 26.6395 20.8965C26.7166 21.37 27.058 21.6343 27.4324 21.5132L27.5315 23.7706Z" fill="#CEDEF1"/>
          <path d="M23.9537 18.7383C23.8656 18.2207 24.1299 17.6261 24.5373 17.4279C24.9448 17.2296 25.3522 17.4829 25.4403 18.0115C25.5284 18.54 25.2641 19.1237 24.8567 19.3219C24.4492 19.5201 24.0418 19.2558 23.9537 18.7383Z" fill="#CEDEF1"/>
          <path d="M22.3119 20.4452C22.2789 20.4452 22.2458 20.4232 22.2128 20.4012C22.1798 20.3461 22.1908 20.28 22.2348 20.236L24.0298 18.9476C23.9857 18.6944 23.8866 17.9125 24.4592 17.5381C24.6684 17.406 24.8556 17.3729 25.0208 17.45C25.241 17.5491 25.3512 17.8134 25.4062 18.0006L26.9919 16.8554C27.047 16.8224 27.113 16.8334 27.1571 16.8774C27.1901 16.9325 27.1791 16.9985 27.1351 17.0426L25.4062 18.2979C25.3732 18.32 25.3291 18.331 25.2961 18.3089C25.2631 18.2979 25.23 18.2539 25.23 18.2208C25.208 18.0997 25.1309 17.7473 24.9437 17.6703C24.8556 17.6262 24.7345 17.6482 24.6024 17.7363C24.0628 18.0887 24.283 18.9696 24.283 18.9696C24.294 19.0137 24.272 19.0688 24.239 19.0908L22.378 20.4342C22.356 20.4342 22.3339 20.4452 22.3119 20.4452Z" fill="#B9D2EA"/>
          <path d="M31.5614 13.5852V20.0491C31.5614 20.4015 31.3962 20.7318 31.1209 20.9521L27.5311 23.7821L27.1897 16.6685L28.6543 15.6334C28.7754 16.0739 29.1498 16.2831 29.5352 16.0959C29.9426 15.8977 30.2069 15.303 30.1188 14.7855C30.1078 14.7304 30.0968 14.6754 30.0858 14.6313L31.5614 13.5852Z" fill="#E81C2B"/>
          <path d="M26.6275 20.9079C26.5395 20.3904 26.8037 19.7957 27.2112 19.5975C27.6186 19.3993 28.026 19.6526 28.1141 20.1812C28.2022 20.7097 27.9379 21.2933 27.5305 21.4916C27.1231 21.6898 26.7156 21.4255 26.6275 20.9079Z" fill="#E81C2B"/>
          <path d="M27.3435 16.8887C27.3105 16.8887 27.2664 16.8667 27.2444 16.8337C27.2114 16.7786 27.2224 16.7125 27.2774 16.6685L28.5438 15.7985C28.5768 15.7765 28.6099 15.7765 28.6429 15.7875C28.6759 15.7985 28.698 15.8206 28.72 15.8536C28.72 15.8536 28.8631 16.1619 29.1164 16.25C29.2596 16.2941 29.4137 16.261 29.5789 16.1619C30.3938 15.6774 30.1956 14.7084 30.1956 14.6974C30.1846 14.6533 30.2066 14.6093 30.2396 14.5762L31.3408 13.7724C31.3958 13.7393 31.4619 13.7504 31.506 13.7944C31.539 13.8495 31.528 13.9155 31.4839 13.9596L30.4378 14.7194C30.4709 14.9837 30.5149 15.8646 29.7 16.3491C29.4688 16.4813 29.2486 16.5253 29.0503 16.4592C28.8081 16.3822 28.6539 16.184 28.5768 16.0518L27.4206 16.8557C27.3876 16.8777 27.3655 16.8887 27.3435 16.8887Z" fill="#FC5EB9"/>
          <path d="M31.5602 5.73345V13.5848L27.1885 16.6571L27.0233 13.3536C27.0563 13.3426 27.0784 13.3316 27.1114 13.3206C27.5188 13.1223 27.7831 12.5277 27.695 12.0102C27.618 11.5477 27.2876 11.2834 26.9242 11.3825L26.759 8.03491L31.0756 5.46917C31.2959 5.34804 31.5602 5.49119 31.5602 5.73345Z" fill="#CEDEF1"/>
          <path d="M28.6302 15.5119C28.5421 14.9944 28.8064 14.3997 29.2139 14.2015C29.6213 14.0033 30.0287 14.2566 30.1168 14.7852C30.2049 15.3027 29.9406 15.8973 29.5332 16.0956C29.1147 16.2938 28.7183 16.0405 28.6302 15.5119Z" fill="#CEDEF1"/>
          <path d="M27.364 16.3822C27.298 16.3822 27.2539 16.3382 27.2539 16.2721L27.1218 13.4861C27.1218 13.4421 27.1438 13.409 27.1768 13.387C27.2099 13.365 27.8596 12.9576 27.7935 12.0986C27.7274 11.2728 27.1218 11.2617 27.0998 11.2617C27.0337 11.2617 26.9896 11.2177 26.9896 11.1516L26.8245 8.20047C26.8245 8.1344 26.8685 8.07935 26.9346 8.07935C27.0007 8.07935 27.0557 8.12339 27.0557 8.18946L27.2099 11.0525C27.4411 11.0966 27.9587 11.2838 28.0247 12.0876C28.0908 12.9465 27.5402 13.42 27.353 13.5522L27.4852 16.2831C27.4742 16.3272 27.4301 16.3822 27.364 16.3822Z" fill="#B9D2EA"/>
          <path d="M25.7353 7.03325L20.9452 9.7972C20.3726 10.1276 19.7229 10.2817 19.0732 10.2377L10.429 9.68708L17.2452 6.48267L20.0973 6.66986C20.0532 6.7029 20.0202 6.72492 19.9982 6.75796C19.789 7.00022 20.0753 7.19843 20.6479 7.19843C21.1874 7.19843 21.7821 7.02224 22.0243 6.79099L25.7353 7.03325Z" fill="#FF8D76"/>
          <path d="M15.6045 7.84809C15.5604 8.12339 14.9658 8.35463 14.272 8.37666C13.5783 8.39868 13.0497 8.20047 13.0828 7.92518C13.1268 7.64988 13.7214 7.41864 14.4152 7.39661C15.1089 7.37459 15.6485 7.58381 15.6045 7.84809Z" fill="#FF8D76"/>
          <path d="M11.0463 9.69809C11.0022 9.69809 10.9582 9.67606 10.9472 9.63201C10.9251 9.57696 10.9472 9.51089 11.0022 9.47785L13.5019 8.28858C13.3367 8.22251 13.1825 8.13442 13.1715 7.99126C13.1495 7.80406 13.3697 7.69395 13.5349 7.62788C14.1626 7.36359 14.9665 7.48472 15.1537 7.51776L17.2789 6.54872C17.334 6.5267 17.4111 6.54872 17.4331 6.60378C17.4551 6.65884 17.4331 6.72491 17.378 6.75795L15.2197 7.74901C15.1977 7.76002 15.1757 7.76002 15.1537 7.76002C15.1426 7.76002 14.2617 7.58383 13.634 7.84811C13.4358 7.93621 13.4138 7.99126 13.4138 7.99126C13.4358 8.03531 13.6561 8.12341 13.8653 8.16745C13.9093 8.17846 13.9534 8.22251 13.9534 8.26656C13.9534 8.3106 13.9313 8.36566 13.8873 8.38769L11.1123 9.7091C11.0793 9.69809 11.0683 9.69809 11.0463 9.69809Z" fill="#FC796B"/>
          <path d="M22.717 3.83973L17.2331 6.48255L14.1939 6.35041C14.2159 6.32839 14.2379 6.31737 14.26 6.29535C14.4912 6.0641 14.1719 5.8769 13.5442 5.8769C12.9496 5.8769 12.2999 6.04208 12.0356 6.2513L8.88623 6.10815L13.8635 3.92782C14.6234 3.59747 15.4492 3.44331 16.2751 3.48735L22.717 3.83973Z" fill="#FF8D76"/>
          <path d="M21.0546 5.03999C21.0216 5.24922 20.5701 5.43641 20.0306 5.44743C19.502 5.46945 19.0835 5.31529 19.1166 5.10606C19.1496 4.89684 19.6011 4.70964 20.1407 4.69863C20.6802 4.6766 21.0877 4.83077 21.0546 5.03999Z" fill="#FF8D76"/>
          <path d="M9.70187 6.04198C9.65783 6.04198 9.61378 6.01995 9.59176 5.97591C9.56973 5.92085 9.59175 5.85478 9.65782 5.82174C9.70187 5.79972 13.8423 4.08188 14.4479 3.80659C15.1197 3.50927 16.2318 3.52028 17.1238 3.57534C18.1038 3.6304 21.9029 3.85064 21.9029 3.85064L21.8919 4.08188C21.8919 4.08188 18.1038 3.86165 17.1128 3.80659C16.2429 3.76254 15.1747 3.74052 14.547 4.01581C13.9414 4.29111 9.78997 6.00894 9.74592 6.03097C9.7239 6.04198 9.71288 6.04198 9.70187 6.04198Z" fill="#FC796B"/>
          <path d="M30.1181 4.56635L25.7354 7.03299L17.2454 6.4824L19.4807 5.40324C19.6349 5.44729 19.8221 5.4583 20.0313 5.4583C20.5599 5.43628 21.0224 5.26009 21.0554 5.05087C21.0664 4.94075 20.9673 4.84164 20.7801 4.78659L22.7182 3.85059L30.041 4.28005C30.2062 4.26904 30.2502 4.47826 30.1181 4.56635Z" fill="white"/>
          <path d="M22.0468 6.75761C21.8375 6.99987 21.2099 7.19808 20.6372 7.19808C20.0646 7.19808 19.7783 6.99987 19.9876 6.75761C20.1968 6.51535 20.8244 6.31714 21.3971 6.31714C21.9697 6.31714 22.256 6.51535 22.0468 6.75761Z" fill="white"/>
          <path d="M17.8175 6.49357C17.7735 6.49357 17.7294 6.47155 17.7184 6.42751C17.6964 6.37245 17.7184 6.30637 17.7735 6.27334L19.5023 5.45847C19.5243 5.44746 19.5574 5.44746 19.5794 5.44746C19.5904 5.44746 20.2181 5.60162 20.8127 5.31532C20.9999 5.22722 21.099 5.13913 21.11 5.05104C21.121 4.96294 21.044 4.89687 21.044 4.89687C21.0109 4.87485 20.9999 4.8308 20.9999 4.79776C20.9999 4.76473 21.0329 4.72068 21.066 4.70967L22.7177 3.8948C22.7398 3.88379 22.7508 3.88379 22.7728 3.88379L29.8203 4.25819C29.8864 4.25819 29.9304 4.31325 29.9304 4.37932C29.9304 4.44539 29.8644 4.48944 29.8093 4.48944L22.7948 4.11504L21.2972 4.85282C21.3303 4.91889 21.3523 4.99598 21.3413 5.08407C21.3192 5.26026 21.1761 5.40341 20.9118 5.53555C20.3282 5.81085 19.7336 5.72275 19.5684 5.68972L17.8726 6.49357C17.8505 6.49357 17.8285 6.49357 17.8175 6.49357Z" fill="#CEDEF1"/>
          <path d="M17.2456 6.48231L15.1424 7.47337C14.9442 7.42932 14.7019 7.39629 14.4266 7.4073C13.7329 7.42932 13.1382 7.67158 13.0942 7.93586C13.0722 8.068 13.2043 8.18913 13.4245 8.27723L10.4293 9.68673L2.55594 9.18019C2.4238 9.16918 2.39077 8.98198 2.5119 8.92692L8.8877 6.10791L17.2456 6.48231Z" fill="white"/>
          <path d="M14.2609 6.28417C14.0297 6.51541 13.3359 6.70262 12.7083 6.70262C12.0806 6.70262 11.7612 6.51541 11.9925 6.28417C12.2237 6.05292 12.9175 5.86572 13.5452 5.86572C14.1728 5.87673 14.4922 6.06393 14.2609 6.28417Z" fill="white"/>
          <path d="M2.75357 9.10323C2.70952 9.10323 2.66547 9.08121 2.64345 9.03716C2.62143 8.9821 2.64345 8.91603 2.69851 8.883L8.84307 6.13006C8.86509 6.11905 8.8761 6.11905 8.89813 6.11905L12.1025 6.30625C12.2567 6.19613 12.8403 5.79971 13.6552 5.86578C13.8865 5.8878 14.1617 5.93185 14.2058 6.11905C14.2278 6.20714 14.1838 6.29524 14.1177 6.37232L16.6614 6.50446C16.7275 6.50446 16.7715 6.55952 16.7715 6.62559C16.7715 6.69166 16.7165 6.73571 16.6504 6.73571L13.7984 6.59255C13.7433 6.59255 13.6993 6.5485 13.6882 6.50446C13.6772 6.4494 13.6993 6.40535 13.7433 6.37232C13.8534 6.30625 13.9635 6.20714 13.9745 6.1741C13.9745 6.1741 13.9195 6.11905 13.6332 6.09702C12.7853 6.03095 12.2127 6.50446 12.2017 6.51547C12.1796 6.53749 12.1466 6.54851 12.1246 6.5375L8.90914 6.35029L2.79761 9.09222C2.77559 9.10323 2.76458 9.10323 2.75357 9.10323Z" fill="#CEDEF1"/>
          <path d="M20.0298 20.4779L17.7834 20.3457L11.0882 19.9493L10.2734 13.3312L9.98706 11.0298L18.2459 11.5363C18.8075 11.5694 19.2479 12.0098 19.303 12.5604L20.0298 20.4779Z" fill="#1C3177"/>
          <path d="M14.2381 20.2357C14.0839 19.5089 14.5794 18.9143 15.3393 18.9143C16.0991 18.9143 16.8369 19.5089 16.991 20.2357C17.1452 20.9625 16.6497 21.5571 15.8898 21.5571C15.13 21.5571 14.3922 20.9625 14.2381 20.2357Z" fill="#1C3177"/>
          <path d="M19.7001 28.2303L12.0579 27.8559L11.0889 19.9495L14.2162 20.1367C14.2162 20.1697 14.2272 20.2027 14.2382 20.2358C14.3924 20.9625 15.1302 21.5572 15.89 21.5572C16.6278 21.5572 17.1123 20.9956 17.0022 20.3018L20.0414 20.478L20.6581 27.2392C20.7021 27.7898 20.2507 28.2523 19.7001 28.2303Z" fill="white"/>
          <path d="M10.1636 24.1119C10.0094 23.3852 10.505 22.7905 11.2648 22.7905C12.0246 22.7905 12.7624 23.3852 12.9166 24.1119C13.0707 24.8387 12.5752 25.4333 11.8154 25.4333C11.0556 25.4333 10.3178 24.8387 10.1636 24.1119Z" fill="white"/>
          <path d="M15.9229 21.8543C15.9008 21.8543 15.8678 21.8543 15.8458 21.8543C14.3482 21.7992 14.0288 20.7421 13.9628 20.4007L11.2759 20.2686C11.2098 20.2686 11.1658 20.2135 11.1658 20.1475C11.1658 20.0814 11.2208 20.0374 11.2869 20.0374L14.0619 20.1805C14.1169 20.1805 14.172 20.2246 14.172 20.2906C14.172 20.3457 14.2821 21.579 15.8458 21.6341C16.2202 21.6451 16.5175 21.557 16.7267 21.3478C17.0681 21.0174 17.0681 20.5109 17.0681 20.5109C17.0681 20.4778 17.0791 20.4448 17.1011 20.4228C17.1231 20.4007 17.1562 20.3897 17.1892 20.3897L19.8871 20.4998C19.9532 20.4998 19.9972 20.5549 19.9972 20.621C19.9972 20.687 19.9421 20.7311 19.8761 20.7311L17.2883 20.632C17.2663 20.8302 17.1892 21.2266 16.8809 21.5129C16.6496 21.7442 16.3193 21.8543 15.9229 21.8543Z" fill="#CEDEF1"/>
          <path d="M12.0572 27.8561L5.90161 27.5478C5.27393 27.5147 4.73436 27.0743 4.60222 26.4576L3.04956 19.5532L11.0992 19.9496L11.4515 22.8127C11.3965 22.8017 11.3414 22.8017 11.2753 22.8017C10.5155 22.8017 10.031 23.3963 10.1742 24.1231C10.3173 24.8389 11.0221 25.4115 11.7599 25.4445L12.0572 27.8561Z" fill="#8324E3"/>
          <path d="M5.5601 19.7953C5.40593 19.0685 5.90146 18.4739 6.66127 18.4739C7.42109 18.4739 8.15887 19.0685 8.31304 19.7953C8.4672 20.5221 7.97167 21.1167 7.21186 21.1167C6.45205 21.1167 5.71426 20.5221 5.5601 19.7953Z" fill="#8324E3"/>
          <path d="M11.8698 27.7789C11.8147 27.7789 11.7596 27.7348 11.7596 27.6798L11.5614 25.7307C11.209 25.6756 9.98675 25.3673 9.86562 23.9578C9.83258 23.5614 9.92068 23.242 10.1409 22.9998C10.4492 22.6584 10.9117 22.5593 11.132 22.5373L10.8567 20.1477C10.8457 20.0817 10.8897 20.0266 10.9558 20.0156C11.0219 20.0046 11.0769 20.0486 11.0879 20.1147L11.3852 22.6254C11.3852 22.6584 11.3742 22.6915 11.3632 22.7135C11.3412 22.7355 11.3082 22.7575 11.2751 22.7575C11.2641 22.7575 10.6585 22.7796 10.3281 23.154C10.1519 23.3522 10.0748 23.6164 10.1079 23.9468C10.24 25.3893 11.6275 25.5215 11.6936 25.5215C11.7486 25.5215 11.7927 25.5655 11.8037 25.6206L12.0129 27.6578C12.0239 27.7238 11.9689 27.7789 11.9138 27.7789C11.8808 27.7789 11.8698 27.7789 11.8698 27.7789Z" fill="#8324E3"/>
          <path d="M10.857 20.2688L8.11506 20.1476C8.06 20.1476 8.01596 20.1036 8.00494 20.0485C7.99393 19.9935 7.83977 18.7602 6.57342 18.8262C6.33116 18.8372 6.14396 18.9253 6.02283 19.0685C5.76956 19.3768 5.84664 19.8724 5.84664 19.8834C5.84664 19.9164 5.84664 19.9494 5.8136 19.9825C5.79158 20.0045 5.75855 20.0265 5.72551 20.0155L3.22584 19.8944C3.15977 19.8944 3.11572 19.8393 3.11572 19.7732C3.11572 19.7072 3.17078 19.6631 3.23685 19.6631L5.60438 19.7843C5.59337 19.586 5.61539 19.2117 5.83563 18.9253C6.0008 18.7161 6.24306 18.606 6.55139 18.595C7.80673 18.5179 8.13708 19.5971 8.21417 19.9274L10.857 20.0485C10.9231 20.0485 10.9671 20.1036 10.9671 20.1697C10.9671 20.2247 10.9231 20.2688 10.857 20.2688Z" fill="#8324E3"/>
          <path d="M9.18315 15.754C9.02898 15.0273 9.52451 14.4326 10.2843 14.4326C11.0441 14.4326 11.7819 15.0273 11.9361 15.754C12.0902 16.4808 11.5947 17.0754 10.8349 17.0754C10.0751 17.0644 9.33731 16.4808 9.18315 15.754Z" fill="white"/>
          <path d="M11.0885 19.9495L8.31357 19.8173V19.8063C8.1594 19.0796 7.42161 18.4849 6.6618 18.4849C5.94604 18.4849 5.47253 19.0135 5.54961 19.6852L3.04995 19.5641L1.25503 11.4154C1.15592 10.9529 1.53032 10.5124 2.00383 10.5454L10.0094 11.041L11.0885 19.9495Z" fill="white"/>
          <path d="M10.8467 19.8944C10.7916 19.8944 10.7366 19.8503 10.7366 19.7953L10.3952 16.9322C10.3952 16.8992 10.4062 16.8552 10.4282 16.8331C10.4503 16.8111 10.4943 16.8001 10.5274 16.8001C10.5274 16.8001 11.0669 16.8882 11.3863 16.6239C11.5404 16.4918 11.6285 16.2825 11.6285 15.9962C11.6175 14.862 10.186 14.7189 10.175 14.7189C10.1199 14.7189 10.0759 14.6748 10.0759 14.6198L9.66843 11.1951C9.65742 11.129 9.70147 11.074 9.76754 11.063C9.83361 11.052 9.88867 11.096 9.89968 11.1621L10.2961 14.4986C10.6485 14.5537 11.8598 14.84 11.8708 15.9962C11.8708 16.3486 11.7607 16.6129 11.5514 16.8001C11.2651 17.0424 10.8687 17.0534 10.6595 17.0424L10.9788 19.7623C10.9898 19.8283 10.9458 19.8834 10.8797 19.8944C10.8577 19.8944 10.8467 19.8944 10.8467 19.8944Z" fill="#F0F6FC"/>
          <path d="M3.14874 19.5309C3.09368 19.5309 3.04964 19.4979 3.03862 19.4429L1.28775 11.4043C1.24371 11.184 1.29877 10.9638 1.44192 10.7876C1.58507 10.6224 1.80531 10.5343 2.02554 10.5454L9.43645 11.107C9.50252 11.107 9.54657 11.162 9.54657 11.2281C9.54657 11.2942 9.4805 11.3382 9.42544 11.3382L2.01453 10.7766C1.86037 10.7656 1.71721 10.8206 1.61811 10.9418C1.519 11.0519 1.47495 11.2061 1.50799 11.3602L3.25886 19.3988C3.26987 19.4649 3.23683 19.5199 3.17076 19.5309C3.17076 19.5309 3.15975 19.5309 3.14874 19.5309Z" fill="#CEDEF1"/>
          </g>
          <defs>
          <clipPath id="clip0_4387_36066">
          <rect width="32" height="32" fill="white"/>
          </clipPath>
          </defs>
          </svg>
          </div>
          <div class="w-full">
            <div class="mb-2 flex items-center space-x-2">
              <span class="truncate font-bold">${escapeHtml(task.title)}</span>
              <span class="bg-orange-secondary border-default text-orange-primary flex items-center rounded-xl px-1 py-0.5 text-sm leading-2 font-bold">
                ${task.points} XP
                <img class="ms-[.125rem] mb-[.125rem] h-4 w-4" src="/src/assets/images/coin.png" alt="coin" />
              </span>
              <span class="${levelClasses[lvl] || 'bg-gray-200'} border-default rounded-xl px-2 py-0.5 text-sm">
                <span ${levelKey ? `data-i18n="${levelKey}"` : ''}>${getLevelLabel(lvl)}</span>
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
