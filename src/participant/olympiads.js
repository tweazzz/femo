console.log('src/participant/olympiads.js loaded')

async function ensureUserAuthenticated() {
  let userData = localStorage.getItem('user')

  if (!userData) {
    console.warn(
      'user не найден в localStorage. Пробуем обновить access_token...'
    )
    const newAccessToken = await refreshAccessToken()
    console.log('Результат refreshAccessToken:', newAccessToken)

    if (!newAccessToken) {
      console.warn(
        'refreshAccessToken вернул null. Перенаправление на /login.html'
      )
      window.location.href = '/index.html'
      return null
    }

    userData = localStorage.getItem('user')
    if (!userData) {
      console.warn('user всё ещё не найден после обновления токена. Редирект.')
      window.location.href = '/index.html'
      return null
    }
  }

  const user = JSON.parse(userData)

  // Проверяем роль
  const role = user.profile?.role
  if (role !== 'participant') {
    console.warn(
      `Пользователь с ролью "${role}" не имеет доступа к участникам. Редирект.`
    )
    window.location.href = '/index.html'
    return null
  }

  return user
}

// 1) Функция для загрузки полного профиля участника
async function loadUserProfile() {
  const res = await authorizedFetch(
    'https://portal.femo.kz/api/users/participant/profile/'
  );
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


document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded fired in participant/olympiads.js')
  const user = await ensureUserAuthenticated()
  if (!user) return

  // сначала загрузим детали профиля
  let profile
  try {
    profile = await loadUserProfile()
  } catch (e) {
    console.error(e)
    return
  }
  renderUserInfo(profile)

  try {
    await loadOlympiadCards()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})


function formatDate(dateStr) {
    const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
    }

// helper: transliterate cyrillic -> latin slug (оставляем только эту реализацию!)
function slugify(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    // transliterate basic cyrillic -> latin
    .replace(/а/g,'a').replace(/б/g,'b').replace(/в/g,'v').replace(/г/g,'g').replace(/д/g,'d')
    .replace(/е/g,'e').replace(/ё/g,'e').replace(/ж/g,'zh').replace(/з/g,'z').replace(/и/g,'i')
    .replace(/й/g,'i').replace(/к/g,'k').replace(/л/g,'l').replace(/м/g,'m').replace(/н/g,'n')
    .replace(/о/g,'o').replace(/п/g,'p').replace(/р/g,'r').replace(/с/g,'s').replace(/т/g,'t')
    .replace(/у/g,'u').replace(/ф/g,'f').replace(/х/g,'h').replace(/ц/g,'ts').replace(/ч/g,'ch')
    .replace(/ш/g,'sh').replace(/щ/g,'sch').replace(/ъ/g,'').replace(/ы/g,'y').replace(/ь/g,'')
    .replace(/э/g,'e').replace(/ю/g,'yu').replace(/я/g,'ya')
    // keep only a-z0-9 and dashes
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\-+|\-+$/g, '');
}

function formatSecondsToHoursMinutes(seconds) {
  const lang = localStorage.getItem('lang') || 'ru';
  const labelsMap = {
    ru: { day: 'д', hour: 'ч', minute: 'мин', less: 'менее минуты' },
    en: { day: 'd', hour: 'h', minute: 'min', less: 'less than a minute' },
    kk: { day: 'күн', hour: 'сағ', minute: 'мин', less: 'бір минуттан аз' }
  };
  const labels = labelsMap[lang === 'kz' ? 'kk' : (lang === 'en' ? 'en' : 'ru')];

  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return '—';

  const days = Math.floor(total / 86400);        // 24*3600
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} ${labels.day}`);
  if (hours > 0) parts.push(`${hours} ${labels.hour}`);
  if (minutes > 0) parts.push(`${minutes} ${labels.minute}`);

  return parts.join(' ') || labels.less;
}

// Для блока с "дней", если нет времени в секундах
function formatRemainingDays(endDate) {
  if (!endDate) return '—';
  const lang = localStorage.getItem('lang') || 'ru';
  const labelsMap = { ru: 'дней', en: 'days', kk: 'күн' };
  const label = labelsMap[lang === 'kz' ? 'kk' : (lang === 'en' ? 'en' : 'ru')];

  const remainingDays = Math.max(0, Math.round((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  return `${remainingDays} ${label}`;
}



function unescapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x2F;/g, "/");
}

async function loadOlympiadCards() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }

  // (карта только для fallback ключей по тексту — теперь используется в редких случаях)
  const statusI18nMap = {
    'Завершена': 'olympiads.olympiads-completed',
    'Вы участвуете': 'olympiads.olympiads-registered',
    'Регистрация открыта': 'olympiads.olympiads-registration-open',
    'Идет сейчас': 'olympiads.olympiads-ongoing',
    'Регистрация скоро откроется': 'olympiads.olympiads-registration-soon'
  };

  const tourTypeI18nMap = {
    'Зима': 'olympiads.tour-winter',
    'Весна': 'olympiads.tour-spring',
    'Лето': 'olympiads.tour-summer',
    'Осень': 'olympiads.tour-autumn',
    'Международный': 'olympiads.tour-international'
  };

  try {
    const response = await authorizedFetch('https://portal.femo.kz/api/olympiads/participant/dashboard/', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error(`Ошибка загрузки олимпиад: ${response.status}`);

    const data = await response.json();
    const container = document.querySelector('.grid');
    if (!container) throw new Error('Container .grid не найден в DOM');
    container.innerHTML = ''; // очистим

    data.results.forEach(olympiad => {
      // исходные поля
      const statusRaw = (olympiad.status || '').toString();
      const tourRaw = (olympiad.tour_type || '').toString();

      // булевые флаги (ЛОГИКА) — используем API-флаги прежде всего
      const isRegistered = olympiad.registered === true;
      const isFinished = olympiad.status === 'Завершена';
      // определение ongoing: либо есть специальный код, либо в статусе есть "идет" / "ongoing"
      const isOngoing = olympiad.status === 'Идет сейчас';
      const isUpcoming = olympiad.status=== 'Предстоящая';
                      
      // can register (fallback)
      const canRegister = olympiad.status=== 'Предстоящая';;

      // Выбираем итоговый i18n-ключ, текст и класс - НА ОСНОВЕ ЛОГИКИ
      let finalStatusKey = '';
      let finalStatusText = '';
      let finalStatusClass = '';

      if (isFinished) {
        finalStatusKey = 'olympiads.olympiads-completed';
        finalStatusText = statusRaw || 'Завершена';
        finalStatusClass = 'bg-green-100 text-green-primary';
      } else if (isRegistered) {
        finalStatusKey = 'olympiads.olympiads-registered';
        finalStatusText = 'Вы участвуете';
        finalStatusClass = 'bg-green-100 text-green-primary';
      } else if (isOngoing) {
        finalStatusKey = 'olympiads.olympiads-ongoing';
        finalStatusText = statusRaw || 'Идет сейчас';
        finalStatusClass = 'bg-red-100 text-red-primary'; // <- красный фон при "Идет сейчас"
      } else if (canRegister) {
        if (olympiad.registration_status === 'Registration will be opened soon') {
            finalStatusKey = 'olympiads.olympiads-registration-soon';
            finalStatusText = 'Регистрация в скором времени откроется';
            finalStatusClass = 'bg-orange-100 text-orange-primary';
        } else {
            // все остальные случаи "Регистрация открыта"
            finalStatusKey = 'olympiads.olympiads-registration-open';
            finalStatusText = 'Регистрация открыта';
            finalStatusClass = 'bg-orange-100 text-orange-primary';
        }
    } else {
        finalStatusKey = statusI18nMap[statusRaw] || `olympiads.status-${slugify(statusRaw)}`;
        finalStatusText = statusRaw || '';
        finalStatusClass = 'bg-grey-100 text-grey-primary';
      }

      // Даты / инфо
      let dateInfoText = '';
      let dateInfo = '';
      const startDate = olympiad.first_start_date ? new Date(olympiad.first_start_date) : null;
      const endDate = olympiad.last_end_date ? new Date(olympiad.last_end_date) : null;

      if (isFinished) {
        dateInfoText = 'Даты олимпиады';
        dateInfo = (startDate && endDate) ? `${formatDate(olympiad.first_start_date)} - ${formatDate(olympiad.last_end_date)}` : '—';
      } else if (canRegister || isOngoing) {
        dateInfoText = 'Осталось';
        if (olympiad.time_left) {
          dateInfo = formatSecondsToHoursMinutes(olympiad.time_left);
        }
        else if (endDate) {
        dateInfo = formatRemainingDays(endDate);
      }
        else dateInfo = '—';
      } else if ((olympiad.registration_status || '').toString().toLowerCase().includes('soon')) {
        dateInfoText = 'Откроется';
        dateInfo = startDate ? formatDate(olympiad.first_start_date) : '—';
      } else {
        dateInfoText = '';
        dateInfo = olympiad.time_left || '';
      }

      // Кнопки / тексты (берём из словаря если есть)
      const keyStartNow = 'olympiads.start_now';
      const keyMore = 'olympiads.podrobnee_btn';
      const keyViewResults = 'olympiads.view-results';
      const keyRegister = 'olympiads.registrate_btn';

      const startText = (window.i18nDict && window.i18nDict[keyStartNow]) || 'Начать сейчас';
      const moreText = (window.i18nDict && window.i18nDict[keyMore]) || 'Подробнее';
      const viewResultsText = (window.i18nDict && window.i18nDict[keyViewResults]) || 'Посмотреть результаты';
      const registerText = (window.i18nDict && window.i18nDict[keyRegister]) || 'Зарегистрироваться';

      // создаём карточку
      const card = document.createElement('div');
      card.className = 'border-default flex flex-col justify-between rounded-xl bg-white p-4 min-h-[220px]';
      card.style.border = '1px solid #EFEFEF';
      card.style.borderRadius = '16px';

      // top block
      const top = document.createElement('div');

      // статус элемент: рендерим иконку + span (span содержит data-i18n)
      const statusEl = document.createElement('div');
      statusEl.className = `${finalStatusClass} mb-2 w-fit rounded-full px-2 py-1 text-xs flex items-center gap-1`;
      // иконка (вставляем только если finished или для красоты)
      const iconHTML = isFinished
        ? `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" class="inline-block"><path d="M6 11C8.75 11 11 8.75 11 6C11 3.25 8.75 1 6 1C3.25 1 1 3.25 1 6C1 8.75 3.25 11 6 11Z" stroke="#0DB459" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.875 5.99996L5.29 7.41496L8.125 4.58496" stroke="#0DB459" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : '';
      // span с data-i18n (текст будет переведен applyTranslations)
      statusEl.innerHTML = `${iconHTML}<span data-i18n="${finalStatusKey}">${finalStatusText}</span>`;
      top.appendChild(statusEl);

      // title
      const h3 = document.createElement('h3');
      h3.className = 'mb-1 text-lg font-semibold break-words';
      h3.textContent = olympiad.title || '';
      top.appendChild(h3);

      // description
      const desc = document.createElement('div');
      // desc.className = 'text-gray-primary mb-3 text-sm leading-relaxed whitespace-normal break-words ...'; // old class
      desc.className = 'quill-description text-black mb-3 leading-relaxed whitespace-pre-wrap break-words';
      desc.innerHTML = unescapeHtml(olympiad.description || '');
      top.appendChild(desc);

      // Inject styles for Quill content if not already present
      if (!document.getElementById('quill-viewer-styles')) {
        const style = document.createElement('style');
        style.id = 'quill-viewer-styles';
        style.textContent = `
          .quill-description {
            font-family: 'Inter', sans-serif !important;
            font-size: 13px !important;
            color: #000000 !important;
            font-weight: 400 !important;
            tab-size: 4 !important;
            -moz-tab-size: 4 !important;
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
          }
          /* Force specific color and whitespace on common text containers to override global styles */
          .quill-description p, 
          .quill-description span, 
          .quill-description div, 
          .quill-description li,
          .quill-description h1, 
          .quill-description h2, 
          .quill-description h3, 
          .quill-description h4 {
            color: #000000 !important;
            white-space: pre-wrap !important;
            tab-size: 4 !important;
            -moz-tab-size: 4 !important;
          }

          .quill-description * {
            box-sizing: border-box !important;
            font-weight: 400 !important;
          }
          .quill-description ul { list-style-type: disc !important; padding-left: 1.5em !important; margin-bottom: 1em !important; display: block !important; }
          .quill-description ol { list-style-type: decimal !important; padding-left: 1.5em !important; margin-bottom: 1em !important; display: block !important; }
          .quill-description li { margin-bottom: 0.25em !important; display: list-item !important; }

          .quill-description h1 { font-size: 2em !important; font-weight: 400 !important; margin-bottom: 0.5em !important; margin-top: 0.5em !important; line-height: 1.2 !important; display: block !important; }
          .quill-description h2 { font-size: 1.5em !important; font-weight: 400 !important; margin-bottom: 0.5em !important; margin-top: 0.5em !important; line-height: 1.25 !important; display: block !important; }
          .quill-description h3 { font-size: 1.17em !important; font-weight: 400 !important; margin-bottom: 0.5em !important; margin-top: 0.5em !important; line-height: 1.3 !important; display: block !important; }
          .quill-description h4 { font-size: 1em !important; font-weight: 400 !important; margin-bottom: 0.5em !important; display: block !important; }

          .quill-description p { margin-bottom: 1em !important; line-height: 1.5 !important; white-space: pre-wrap !important; display: block !important; }
          .quill-description strong, .quill-description b { font-weight: 700 !important; }
          .quill-description em, .quill-description i { font-style: italic !important; font-synthesis: style !important; }
          .quill-description u { text-decoration: underline !important; }
          .quill-description s { text-decoration: line-through !important; }
          .quill-description a { color: #2563eb !important; text-decoration: underline !important; }

          .quill-description blockquote { border-left: 4px solid #ccc !important; padding-left: 16px !important; margin-bottom: 1em !important; font-style: italic !important; color: #555 !important; display: block !important; }
          .quill-description pre { background-color: #f0f0f0 !important; padding: 10px !important; border-radius: 4px !important; font-family: monospace !important; margin-bottom: 1em !important; overflow-x: auto !important; white-space: pre !important; display: block !important; }
          .quill-description code { background-color: #f0f0f0 !important; padding: 2px 4px !important; border-radius: 3px !important; font-family: monospace !important; }

          .quill-description .ql-align-center { text-align: center !important; }
          .quill-description .ql-align-right { text-align: right !important; }
          .quill-description .ql-align-justify { text-align: justify !important; }

          .quill-description .ql-indent-1 { padding-left: 3em !important; }
          .quill-description .ql-indent-2 { padding-left: 6em !important; }
          .quill-description .ql-indent-3 { padding-left: 9em !important; }
          .quill-description .ql-indent-4 { padding-left: 12em !important; }
          .quill-description .ql-indent-5 { padding-left: 15em !important; }
          .quill-description .ql-indent-6 { padding-left: 18em !important; }
          .quill-description .ql-indent-7 { padding-left: 21em !important; }
          .quill-description .ql-indent-8 { padding-left: 24em !important; }

          .quill-description sub { vertical-align: sub !important; font-size: smaller !important; }
          .quill-description sup { vertical-align: super !important; font-size: smaller !important; }
          
          /* Fix for empty paragraphs */
          .quill-description p:empty { min-height: 1em; }

          /* Font Size */
          .quill-description .ql-size-small { font-size: 0.75em !important; }
          .quill-description .ql-size-large { font-size: 1.5em !important; }
          .quill-description .ql-size-huge { font-size: 2.5em !important; }

          /* Robust Italic */
          .quill-description em, .quill-description i { font-style: italic !important; }
          .quill-description strong em, .quill-description em strong, 
          .quill-description b i, .quill-description i b { font-weight: bold !important; font-style: italic !important; }
        `;
        document.head.appendChild(style);
      }

      card.appendChild(top);

      // bottom block
      const bottom = document.createElement('div');

      // date info
      const dateBlock = document.createElement('div');
      dateBlock.className = 'mb-4';
      const dateLabel = document.createElement('span');
      dateLabel.className = 'text-gray-secondary mb-1 text-xs';
      dateLabel.textContent = dateInfoText;
      if (dateInfoText === 'Осталось') {
        dateLabel.setAttribute('data-i18n', 'time-remaining');
      }
      const dateP = document.createElement('p');
      dateP.className = 'text-black-primary text-sm leading-relaxed whitespace-normal';
      const useVuesaxIcon = isFinished || isRegistered || (olympiad.registration_status || '').toString().toLowerCase().includes('soon');
      const dateIconHTML = useVuesaxIcon
        ? `<img src="/src/assets/images/vuesax.svg" alt="vuesax" class="mb-1 inline-block size-5" />`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="mb-1 inline-block size-5"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clip-rule="evenodd"/></svg>`;
      dateP.innerHTML = `${dateIconHTML} ${dateInfo}`;

      dateBlock.appendChild(dateLabel);
      dateBlock.appendChild(dateP);
      bottom.appendChild(dateBlock);

      // buttons container
      // buttons container (REPLACE old buttons block with this)
      const btns = document.createElement('div');
      btns.className = 'flex items-center gap-3';

      // helper: create "Подробнее" button (external -> _blank, internal -> _self)
      function createDetailButton(url, key, text) {
        const a = document.createElement('a');
        a.href = url || '#';
        a.className = 'inline-flex items-center justify-center w-full px-4 py-2 rounded-lg text-sm font-medium border border-orange-primary bg-white text-orange-primary min-w-[120px] whitespace-nowrap';
        if (key) a.setAttribute('data-i18n', key);
        a.textContent = (window.i18nDict && key && window.i18nDict[key]) || text || 'Подробнее';
        try {
          // treat absolute http(s) as external
          const isExternal = /^https?:\/\//i.test(a.href);
          if (isExternal) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
          else { a.target = '_self'; }
        } catch (e) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
        return a;
      }

      // helper: create register button (internal payments page)
      // function createRegisterButton(olympiadId, key, text) {
      //   const a = document.createElement('a');
      //   a.href = `/participant/payments.html?olympiad=${encodeURIComponent(olympiadId)}`;
      //   a.className = 'inline-flex items-center justify-center w-full px-4 py-2 rounded-lg text-sm font-medium bg-orange-primary text-white min-w-[140px] whitespace-nowrap';
      //   if (key) a.setAttribute('data-i18n', key);
      //   a.textContent = (window.i18nDict && key && window.i18nDict[key]) || text || 'Зарегистрироваться';
      //   return a;
      // }

      // --- button logic ---
      // Priority:
      // - ongoing: show start (if registered) or register
      // - upcoming & canRegister: show "Подробнее" (opens olympiad.url) and "Зарегистрироваться"
      // - fallback: single "Подробнее" (or "Посмотреть результаты" when finished)
      if (isOngoing) {
        // only start/register
        btns.innerHTML = '';
        if (isRegistered) {
          // кнопка "Об олимпиаде" — переходим по olympiad.url
          btns.innerHTML = ''; // очистим
          const aboutBtn = document.createElement('a');
          aboutBtn.href = olympiad.url || '#';
          aboutBtn.target = '_blank'; // открываем в новой вкладке
          aboutBtn.rel = 'noopener noreferrer';
          aboutBtn.className = 'inline-flex items-center justify-center w-full px-4 py-2 rounded-lg text-sm font-medium border border-orange-primary bg-white text-orange-primary min-w-[120px] whitespace-nowrap';
          aboutBtn.textContent = 'Об олимпиаде';
          aboutBtn.setAttribute('data-i18n', 'about.olympiad');
          btns.appendChild(aboutBtn);
          // const startBtn = document.createElement('button');
          // startBtn.addEventListener('click', () => openStartOlympiadModal(olympiad.id));
          // startBtn.textContent = (window.i18nDict && window.i18nDict[keyStartNow]) || startText;
          // startBtn.style.backgroundColor = '#0DB459';
          // startBtn.style.color = '#fff';
          // startBtn.className = 'inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer';
          // btns.appendChild(startBtn);
        } else {
          const registerBtn = createRegisterButton(olympiad, keyRegister, registerText);
          btns.appendChild(registerBtn);
        }
      } else if (isUpcoming && !isRegistered && canRegister) {
        // Предстоящая: показываем Подробнее (по url) + Зарегистрироваться
        btns.innerHTML = '';
        const registerBtn = createRegisterButton(olympiad, keyRegister, registerText);
        btns.appendChild(registerBtn);

        const detailBtn = createDetailButton(olympiad.url || '#', keyMore, moreText);
        btns.appendChild(detailBtn);
      } else {
        // default single detail / view-results
        const detailKey = isFinished ? keyViewResults : keyMore;
        const detailText = isFinished ? viewResultsText : moreText;
        const detailBtn = createDetailButton(olympiad.url || '#', detailKey, detailText);
        if (isFinished) {
          // finished should open internal rating page
          detailBtn.className = 'inline-flex items-center justify-center px-4 py-2 w-full rounded-lg text-sm font-medium border border-orange-primary bg-white text-orange-primary min-w-[120px] whitespace-nowrap'
          detailBtn.href = '/participant/rate-overall.html';
          detailBtn.target = '_self';
        }
        btns.appendChild(detailBtn);
      }

      bottom.appendChild(btns);

      card.appendChild(bottom);

      container.appendChild(card);
    });

    // применим переводы (если словарь загружен)
    if (window.i18nDict && typeof applyTranslations === 'function') {
      try { applyTranslations(window.i18nDict); } catch (e) { console.warn('applyTranslations error', e); }
    }
  } catch (error) {
    console.error('Ошибка загрузки списка олимпиад:', error);
  }
}
/* ---------------- Balance helpers & register interception (improved) ---------------- */

let _balanceCache = { value: null, ts: 0 };
const BALANCE_CACHE_TTL = 15 * 1000; // кешировать баланс 15 секунд

async function getBalance() {
  const now = Date.now();
  if (_balanceCache.value && (now - _balanceCache.ts) < BALANCE_CACHE_TTL) {
    return _balanceCache.value;
  }

  const token = localStorage.getItem('access_token');
  if (!token) throw new Error('Токен не найден');

  const res = await authorizedFetch(
    'https://portal.femo.kz/api/payments/participant/dashboard/balance/',
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error(`Ошибка при получении баланса: ${res.status}`);

  const data = await res.json();

  const balanceInfo = {
    balance: Number(data.balance || 0),
    currency: data.currency || null
  };

  _balanceCache = {
    value: balanceInfo,
    ts: Date.now()
  };

  return balanceInfo;
}
function getOlympiadFeeInfo(olympiad) {
  if (!olympiad) {
    return { price: 0, currency: null };
  }

  const price = Number(olympiad.price || 0);
  const currency = olympiad.currency || null;

  return {
    price: isNaN(price) ? 0 : price,
    currency
  };
}


function getOlympiadFee(olympiad) {
  if (!olympiad) return 0;
  const p = olympiad.price;
  if (p == null || p === '') return 0;
  const n = Number(p);
  return isNaN(n) ? 0 : n;
}

/**
 * Показывает modal_balance и подставляет сообщение с недостающей суммой (если возможно).
 */
function showBalanceModal() {
  const modal = document.getElementById('modal_balance');
  const overlay = document.getElementById('overlayModal') || document.getElementById('overlay');

  if (overlay) {
    overlay.classList.remove('hidden');
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
  }

  // если у тебя есть единая функция открытия модалок
  if (typeof openModal === 'function') {
    openModal('modal_balance');
  }
}

function restoreAnchor(anchorEl, prevHtml = null) {
  if (!anchorEl) return;

  if (prevHtml !== null) {
    anchorEl.innerHTML = prevHtml;
  }

  anchorEl.classList.remove('opacity-60', 'pointer-events-none');
}

async function checkBalanceThenProceed(olympiad, href, anchorEl = null) {
  try {
    const { price, currency: olympiadCurrency } = getOlympiadFeeInfo(olympiad);

    // бесплатная олимпиада
    if (!price || price === 0) {
      window.location.href = href;
      return;
    }

    // UI feedback
    let prevHtml = null;
    if (anchorEl) {
      prevHtml = anchorEl.innerHTML;
      anchorEl.innerHTML = 'Проверка...';
      anchorEl.classList.add('opacity-60', 'pointer-events-none');
    }

    const { balance, currency: balanceCurrency } = await getBalance();

    // ❌ валюта не совпадает
    if (!balanceCurrency || !olympiadCurrency || balanceCurrency !== olympiadCurrency) {
      showBalanceModal();
      restoreAnchor(anchorEl, prevHtml);
      return;
    }

    // ❌ не хватает денег
    if (balance < price) {
      showBalanceModal();
      restoreAnchor(anchorEl, prevHtml);
      return;
    }

    // ✅ всё ок
    restoreAnchor(anchorEl, prevHtml);
    window.location.href = href;

  } catch (err) {
    console.error('Ошибка при проверке баланса:', err);
    restoreAnchor(anchorEl);
    // alert('Не удалось проверить баланс. Повторите попытку.');
  }
}


/* --- createRegisterButton принимает объект olympiad --- */
function createRegisterButton(olympiad, key, text) {
  const a = document.createElement('a');
  a.href = `/participant/payments.html?olympiad=${encodeURIComponent(olympiad?.id)}`;
  a.className = 'inline-flex items-center justify-center w-full px-4 py-2 rounded-lg text-sm font-medium bg-orange-primary text-white min-w-[140px] whitespace-nowrap';
  if (key) a.setAttribute('data-i18n', key);
  a.textContent = (window.i18nDict && key && window.i18nDict[key]) || text || 'Зарегистрироваться';

  // перехват клика: передаём ссылку и сам элемент (для UI)
  a.addEventListener('click', function (e) {
    e.preventDefault();
    checkBalanceThenProceed(olympiad, a.href, a);
  });

  return a;
}


let startOlympiadId = null;

function openStartOlympiadModal(olympiadId) {
  startOlympiadId = olympiadId;
  const modal = document.getElementById('startOlympiadModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}


function closeStartOlympiadModal() {
  startOlympiadId = null;
  const modal = document.getElementById('startOlympiadModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}
// Отменить
document
  .getElementById('cancelStartOlympiad')
  .addEventListener('click', closeStartOlympiadModal);

// Да, начать — глобальный (только один обработчик)
document
  .getElementById('confirmStartOlympiad')
  .addEventListener('click', () => {
    if (!startOlympiadId) {
      console.warn('startOlympiadId не задан — откройте модалку через кнопку "Начать сейчас".');
      return;
    }
    const lang = (document.querySelector('input[name="lan"]:checked') || { value: 'ru' }).value;
    const url = `/participant/list_tasks_olympiad.html?olympiadId=${encodeURIComponent(startOlympiadId)}&lang=${encodeURIComponent(lang)}`;
    // перед редиректом можно закрыть модалку
    closeStartOlympiadModal();
    window.location.href = url;
  });

// 🔥 Клик по пустому месту
const startOlympiadModal = document.getElementById('startOlympiadModal');
startOlympiadModal.addEventListener('click', (e) => {
  if (e.target === startOlympiadModal) {
    closeStartOlympiadModal();
  }
});

