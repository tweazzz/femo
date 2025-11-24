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


// helper: slugify for fallback keys
function slugify(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/\-+/g, '-')
    .replace(/^\-+|\-+$/g, '');
}

async function loadOlympiadCards() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }

  // подстрой эти мапы если нужно (ключи i18n из твоего JSON)
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
    const response = await authorizedFetch('https://portal.femo.kz/api/olympiads/participant/dashboard/?tab=past', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error(`Ошибка загрузки олимпиад: ${response.status}`);

    const data = await response.json();
    const container = document.querySelector('.grid');
    if (!container) throw new Error('Container .grid не найден в DOM');
    container.innerHTML = ''; // Очистить перед добавлением

    data.results.forEach(olympiad => {
      const statusRaw = (olympiad.status || '').toString();
      const tourRaw = (olympiad.tour_type || '').toString();

      const statusKey = statusI18nMap[statusRaw] || `olympiads.status-${slugify(statusRaw)}`;
      const tourKey = tourTypeI18nMap[tourRaw] || `olympiads.tour-${slugify(tourRaw)}`;

      // Нормализуем для проверки "завершен"
      const statusNorm = statusRaw.trim().toLowerCase();
      const isFinished = statusNorm.includes('заверш'); // покрывает "Завершена", "Завершено" и т.п.

      // Определяем классы по статусу (твоя логика)
      let statusClass = '';
      if (statusRaw === 'Завершена' || statusRaw === 'Вы участвуете') statusClass = 'bg-green-100 text-green-primary';
      else if (statusRaw === 'Регистрация открыта') statusClass = 'bg-orange-100 text-orange-primary';
      else if (statusRaw === 'Идет сейчас') statusClass = 'bg-red-100 text-red-primary';
      else if (statusRaw === 'Регистрация скоро откроется') statusClass = 'bg-grey-100 text-grey-primary';

      // Даты / инфо
      let dateInfoText = '';
      let dateInfo = '';
      const startDate = olympiad.first_start_date ? new Date(olympiad.first_start_date) : null;
      const endDate = olympiad.last_end_date ? new Date(olympiad.last_end_date) : null;
      if (statusRaw === 'Завершена') {
        dateInfoText = 'Даты олимпиады';
        dateInfo = (startDate && endDate) ? `${formatDate(olympiad.first_start_date)} - ${formatDate(olympiad.last_end_date)}` : '—';
      } else if (statusRaw === 'Регистрация открыта' || statusRaw === 'Идет сейчас') {
        dateInfoText = 'Осталось';
        if (olympiad.time_left) dateInfo = olympiad.time_left;
        else if (endDate) dateInfo = `${Math.max(0, Math.round((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} дней`;
        else dateInfo = '—';
      } else if (statusRaw === 'Регистрация скоро откроется') {
        dateInfoText = 'Откроется';
        dateInfo = startDate ? formatDate(olympiad.first_start_date) : '—';
      } else if (statusRaw === 'Вы участвуете') {
        dateInfoText = 'Олимпиада начнется';
        dateInfo = startDate ? formatDate(olympiad.first_start_date) : '—';
      } else {
        dateInfoText = '';
        dateInfo = olympiad.time_left || '';
      }

      // Подготовим i18n-ключи для кнопок (ты прислал эти ключи в JSON)
      // "olympiads.start_now", "olympiads.podrobnee_btn", "olympiads.view-results"
      const keyStartNow = 'olympiads.start_now';
      const keyMore = 'olympiads.podrobnee_btn';
      const keyViewResults = 'olympiads.view-results';
      const keyRegister = 'olympiads.registrate_btn' /* если у тебя другой ключ, поменяй */;

      // Тексты кнопок: берем из window.i18nDict если есть, иначе fallback на русские
      const startText = (window.i18nDict && window.i18nDict[keyStartNow]) || 'Начать сейчас';
      const moreText = (window.i18nDict && window.i18nDict[keyMore]) || 'Подробнее';
      const viewResultsText = (window.i18nDict && window.i18nDict[keyViewResults]) || 'Посмотреть результаты';
      const registerText = (window.i18nDict && window.i18nDict[keyRegister]) || 'Зарегистрироваться';

      // создаём карточку безопасно
      const card = document.createElement('div');
      card.className = 'border-default flex flex-col justify-between rounded-xl bg-white p-4 min-h-[220px]';

      // top block
      const top = document.createElement('div');

      // статус (с svg для "Завершена")
      const statusEl = document.createElement('div');
      statusEl.className = `${statusClass} mb-2 w-fit rounded-full px-2 py-1 text-xs flex items-center gap-1`;
      statusEl.setAttribute('data-i18n', statusKey);
      if (isFinished) {
        // небольшой svg check
        statusEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" class="inline-block"><path d="M6 11C8.75 11 11 8.75 11 6C11 3.25 8.75 1 6 1C3.25 1 1 3.25 1 6C1 8.75 3.25 11 6 11Z" stroke="#0DB459" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.875 5.99996L5.29 7.41496L8.125 4.58496" stroke="#0DB459" stroke-linecap="round" stroke-linejoin="round"/></svg> ${statusRaw}`;
      } else {
        statusEl.textContent = statusRaw;
      }
      top.appendChild(statusEl);

      // title
      const h3 = document.createElement('h3');
      h3.className = 'mb-1 text-lg font-semibold break-words';
      h3.textContent = olympiad.title || '';
      top.appendChild(h3);

      // tour with data-i18n on span
      const pTour = document.createElement('p');
      pTour.className = 'text-gray-primary mb-3 text-sm leading-relaxed whitespace-normal';
      const tourLabel = document.createTextNode('Тур: ');
      const tourSpan = document.createElement('span');
      tourSpan.setAttribute('data-i18n', tourKey);
      tourSpan.textContent = tourRaw;
      pTour.appendChild(tourLabel);
      pTour.appendChild(tourSpan);
      top.appendChild(pTour);

      card.appendChild(top);

      // bottom block
      const bottom = document.createElement('div');

      // date info
      const dateBlock = document.createElement('div');
      dateBlock.className = 'mb-4';
      const dateLabel = document.createElement('span');
      dateLabel.className = 'text-gray-secondary mb-1 text-xs';
      dateLabel.textContent = dateInfoText;
      const dateP = document.createElement('p');
      dateP.className = 'text-black-primary text-sm leading-relaxed whitespace-normal';
      // icon (simple)
      const useVuesaxIcon = ['Завершена', 'Вы участвуете', 'Регистрация скоро откроется'].includes(statusRaw);
      const iconHTML = useVuesaxIcon
        ? `<img src="/src/assets/images/vuesax.svg" alt="vuesax" class="mb-1 inline-block size-5" />`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="mb-1 inline-block size-5"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clip-rule="evenodd"/></svg>`;
      dateP.innerHTML = `${iconHTML} ${dateInfo}`;

      dateBlock.appendChild(dateLabel);
      dateBlock.appendChild(dateP);
      bottom.appendChild(dateBlock);

      // buttons container
      const btns = document.createElement('div');
      btns.className = 'flex items-center gap-3';

      // decide which detail button (view-results if finished, otherwise more)
      const detailBtn = document.createElement('a');
      detailBtn.href = olympiad.url || '#';
      detailBtn.className = 'inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border border-orange-primary bg-white text-orange-primary min-w-[120px] whitespace-nowrap';
      const detailKey = isFinished ? keyViewResults : keyMore;
      const detailText = isFinished ? viewResultsText : moreText;
      detailBtn.setAttribute('data-i18n', detailKey);
      detailBtn.textContent = detailText;
      btns.appendChild(detailBtn);

      // If ongoing & not registered -> show register; if ongoing & registered -> show start
      if (statusRaw === 'Идет сейчас') {
        if (olympiad.registered === true) {
          const startBtn = document.createElement('a');
          startBtn.href = '/participant/tasks.html';
          startBtn.className = 'inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-orange-primary text-white min-w-[140px] whitespace-nowrap';
          startBtn.setAttribute('data-i18n', keyStartNow);
          startBtn.textContent = startText;
          btns.appendChild(startBtn);
        } else {
          const registerBtn = document.createElement('a');
          registerBtn.href = `/participant/payments.html?olympiad=${encodeURIComponent(olympiad.id)}`;
          registerBtn.className = 'inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-orange-primary text-white min-w-[140px] whitespace-nowrap';
          registerBtn.setAttribute('data-i18n', keyRegister);
          registerBtn.textContent = registerText;
          btns.appendChild(registerBtn);
        }
      } else {
        // for other statuses we may still want a register button if appropriate
        // here we append no extra button (only detail). If you want register for other statuses — add logic.
      }

      bottom.appendChild(btns);
      card.appendChild(bottom);

      container.appendChild(card);
    });

    // если словарь уже загружен — применим translate
    if (window.i18nDict && typeof applyTranslations === 'function') {
      try { applyTranslations(window.i18nDict); } catch (e) { console.warn('applyTranslations error', e); }
    }
  } catch (error) {
    console.error('Ошибка загрузки списка олимпиад:', error);
  }
}


