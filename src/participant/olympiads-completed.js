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
  if (!seconds || isNaN(seconds)) return '—';

  const totalMinutes = Math.floor(seconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  // если есть дни — показываем дни
  if (days > 0) {
    return `${days} day: ${hours} hours ${minutes.toString().padStart(2, '0')} minutes`;
  }

  // если меньше суток — показываем просто часы и минуты
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
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
    const response = await authorizedFetch('https://portal.femo.kz/api/olympiads/participant/dashboard/?tab=past', {
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
        else if (endDate) dateInfo = `${Math.max(0, Math.round((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} дня`;
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
      const desc = document.createElement('p');
      desc.className = 'text-gray-primary mb-3 text-sm leading-relaxed whitespace-normal';
      desc.textContent = olympiad.description || '';
      top.appendChild(desc);

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
      const useVuesaxIcon = isFinished || isRegistered || (olympiad.registration_status || '').toString().toLowerCase().includes('soon');
      const dateIconHTML = useVuesaxIcon
        ? `<img src="/src/assets/images/vuesax.svg" alt="vuesax" class="mb-1 inline-block size-5" />`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="mb-1 inline-block size-5"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clip-rule="evenodd"/></svg>`;
      dateP.innerHTML = `${dateIconHTML} ${dateInfo}`;

      dateBlock.appendChild(dateLabel);
      dateBlock.appendChild(dateP);
      bottom.appendChild(dateBlock);

      // buttons container
      const btns = document.createElement('div');
      btns.className = 'flex items-center gap-3';

      // detail button
      const detailBtn = document.createElement('a');
      detailBtn.href = olympiad.url || '#';
      detailBtn.className = 'inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border border-orange-primary bg-white text-orange-primary min-w-[120px] whitespace-nowrap';
      const detailKey = isFinished ? keyViewResults : keyMore;
      const detailText = isFinished ? viewResultsText : moreText;
      detailBtn.setAttribute('data-i18n', detailKey);
      detailBtn.textContent = detailText;
      detailBtn.target = '_blank';
      detailBtn.rel = 'noopener noreferrer';
      btns.appendChild(detailBtn);

      if (isFinished) {
        detailBtn.href = '/participant/rate-overall.html';
        detailBtn.target = '_self'; // чтобы не открывалось в новой вкладке
      }
      
      function getSelectedLanguage() {
          const checked = document.querySelector('input[name="lan"]:checked');
          return checked ? checked.value : 'ru';
      }

      // если ongoing — показываем старт/регистрацию в зависимости от registered
      if (isOngoing) {
        btns.innerHTML = ''; // оставляем только кнопку старта/регистрации
        if (isRegistered) {
          const startBtn = document.createElement('button'); // лучше button, не <a>
          startBtn.addEventListener('click', () => {
            openStartOlympiadModal(olympiad.id);
          });
          startBtn.textContent = (window.i18nDict && window.i18nDict[keyStartNow]) || startText;
          startBtn.style.backgroundColor = '#0DB459';
          startBtn.style.color = '#fff';
          startBtn.className = 'inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer';
          btns.appendChild(startBtn);
        } else {
          const registerBtn = document.createElement('a');
          registerBtn.href = `/participant/payments.html?olympiad=${encodeURIComponent(olympiad.id)}`;
          registerBtn.className = 'inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-orange-primary text-white min-w-[140px] whitespace-nowrap';
          registerBtn.setAttribute('data-i18n', keyRegister);
          registerBtn.textContent = (window.i18nDict && window.i18nDict[keyRegister]) || registerText;
          btns.appendChild(registerBtn);
        }
      } else if (isUpcoming && !isRegistered && canRegister) {
          btns.innerHTML = ''; // 🔥 УБИРАЕМ "Подробнее"

          const registerBtn = document.createElement('a');
          registerBtn.href = `/participant/payments.html?olympiad=${encodeURIComponent(olympiad.id)}`;
          registerBtn.className =
            'inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-orange-primary text-white min-w-[140px] whitespace-nowrap';
          registerBtn.setAttribute('data-i18n', keyRegister);
          registerBtn.textContent = registerText;

          btns.appendChild(registerBtn);
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

