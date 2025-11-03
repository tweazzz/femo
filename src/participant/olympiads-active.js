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
  const avatarEl  = document.getElementById('user-avatar');
  const nameEl    = document.getElementById('user-name');
  const roleEl    = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  if (!avatarEl || !nameEl || !roleEl || !welcomeEl) {
    console.warn('renderUserInfo: missing DOM elements');
    return;
  }

  const imgPath = profile.image || '';
  avatarEl.src = imgPath
    ? (imgPath.startsWith('http') ? imgPath : `https://portal.femo.kz${imgPath}`)
    : '';

  // name (если хочешь имя на en/ru — решай отдельно)
  nameEl.textContent = profile.full_name_ru || profile.full_name_en || '';

  const firstName = (profile.full_name_ru || profile.full_name_en || '').split(' ')[0] || '';

  // вместо innerHTML — создаём span программно и не ломаем DOM
  // если внутри welcomeEl уже есть span с data-i18n — перезаписываем только его текст
  let greetSpan = welcomeEl.querySelector('span[data-i18n="welcome.message_rep"]');
  if (!greetSpan) {
    greetSpan = document.createElement('span');
    greetSpan.setAttribute('data-i18n', 'welcome.message_rep');
    // английский/русский запасной текст
    greetSpan.textContent = 'Добро пожаловать,';
    // вставляем span в начало h1
    welcomeEl.innerHTML = ''; // очищаем, но затем добавим span and name
    welcomeEl.appendChild(greetSpan);
    welcomeEl.append(document.createTextNode(' ' + firstName + ' 👋'));
  } else {
    // если span уже есть, просто обновляем имя (не трогаем span текст, чтобы i18n мог его заменить)
    // удаляем все текстовые узлы после span и добавляем имя
    // сначала убираем все узлы после span
    let node = greetSpan.nextSibling;
    while (node) {
      const next = node.nextSibling;
      node.remove();
      node = next;
    }
    // добавляем пробел + имя
    greetSpan.after(document.createTextNode(' ' + firstName + ' 👋'));
  }

  // если словарь уже загружен, применим перевод к новому span
  if (window.i18nDict && Object.keys(window.i18nDict).length > 0) {
    try {
      // вызываем applyTranslations для нового span (или всей страницы)
      applyTranslations(window.i18nDict);
    } catch (e) {
      console.warn('applyTranslations error', e);
    }
  } else {
    // если словарь ещё не загружен — ничего не делаем. langInit / setLanguage позже подхватит span.
  }

  const roleMap = { administrator: 'Участник', representative: 'Участник' };
  roleEl.textContent = roleMap[profile.role] || profile.role || '';
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


async function loadOlympiadCards() {
      const token = localStorage.getItem('access_token');
      if (!token) {
        alert('Токен не найден. Пожалуйста, войдите заново.');
        return;
      }
    
      try {
        const response = await authorizedFetch('https://portal.femo.kz/api/olympiads/participant/dashboard/?tab=active', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
    
        if (!response.ok) throw new Error(`Ошибка загрузки олимпиад: ${response.status}`);
    
        const data = await response.json();
    
        const container = document.querySelector('.grid');
        container.innerHTML = ''; // Очистить перед добавлением
    
        data.results.forEach(olympiad => {
          const card = document.createElement('div');
          card.className = 'border-default flex flex-col justify-between rounded-xl bg-white p-4 min-h-[220px]';
    
          // Определяем цвет статуса
          let statusClass = '';
          if (olympiad.status === 'Завершена') statusClass = 'bg-green-100 text-green-primary';
          else if (olympiad.status === 'Регистрация открыта') statusClass = 'bg-orange-100 text-orange-primary';
          else if (olympiad.status === 'Идет сейчас') statusClass = 'bg-red-100 text-red-primary';
          else if (olympiad.status === 'Регистрация скоро откроется') statusClass = 'bg-grey-100 text-grey-primary';
          else if (olympiad.status === 'Вы участвуете') statusClass = 'bg-green-100 text-green-primary';
    
          // Даты / инфо
          let dateInfoText = '';
          let dateInfo = '';
          const startDate = olympiad.first_start_date ? new Date(olympiad.first_start_date) : null;
          const endDate = olympiad.last_end_date ? new Date(olympiad.last_end_date) : null;
    
          if (olympiad.status === 'Завершена') {
            dateInfoText = 'Даты олимпиады';
            dateInfo = (startDate && endDate) ? `${formatDate(olympiad.first_start_date)} - ${formatDate(olympiad.last_end_date)}` : '—';
          } else if (olympiad.status === 'Регистрация открыта') {
            dateInfoText = 'Осталось';
            dateInfo = olympiad.time_left || (endDate ? `${Math.max(0, Math.round((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} дней` : '—');
          } else if (olympiad.status === 'Идет сейчас') {
            dateInfoText = 'Осталось';
            dateInfo = olympiad.time_left || (endDate ? `${Math.max(0, Math.round((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} дней` : '—');
          } else if (olympiad.status === 'Регистрация скоро откроется') {
            dateInfoText = 'Откроется';
            dateInfo = startDate ? formatDate(olympiad.first_start_date) : '—';
          } else if (olympiad.status === 'Вы участвуете') {
            dateInfoText = 'Олимпиада начнется';
            dateInfo = startDate ? formatDate(olympiad.first_start_date) : '—';
          } else {
            dateInfoText = '';
            dateInfo = olympiad.time_left || '';
          }
    
          // Основной текст кнопки (например "Подробнее" или "Посмотреть результаты")
          const buttonText = olympiad.status === 'Завершена' ? 'Посмотреть результаты' : 'Подробнее';
    
          const useVuesaxIcon = ['Завершена', 'Вы участвуете', 'Регистрация скоро откроется'].includes(olympiad.status);
          const iconHTML = useVuesaxIcon
            ? `<img src="/src/assets/images/vuesax.svg" alt="vuesax" class="mb-1 inline-block size-5" />`
            : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="mb-1 inline-block size-5">
                <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clip-rule="evenodd"/>
              </svg>`;
    
          // Кнопки:
          // detailButton: белый фон, оранжевый текст (ссылка на olympiad.url или '#')
          const detailButtonHTML = `<a href="${olympiad.url || '#'}" class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border border-orange-primary bg-white text-orange-primary min-w-[120px] whitespace-nowrap">${buttonText}</a>`;
    
          // registerButton: оранжевая кнопка (ведёт на оплату)
          const registerButtonHTML = `<a href="/participant/payments.html" class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-orange-primary text-white min-w-[140px] whitespace-nowrap">Зарегистрироваться</a>`;
    
          // startButton: оранжевая кнопка (ведёт на задания)
          const startButtonHTML = `<a href="/participant/tasks.html" class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-orange-primary text-white min-w-[140px] whitespace-nowrap">Начать сейчас</a>`;
    
          // Вставляем кнопки по логике:
          // - если Идет сейчас + registered === true -> только startButton
          // - если Идет сейчас + registered === false -> detailButton + registerButton
          // - иначе -> detailButton
          let buttonsHTML = '';
          if (olympiad.status === 'Идет сейчас') {
            if (olympiad.registered === true) {
              buttonsHTML = `<div class="flex items-center gap-3">${startButtonHTML}</div>`;
            } else {
              buttonsHTML = `<div class="flex items-center gap-3">${detailButtonHTML}${registerButtonHTML}</div>`;
            }
          } else {
            // другие статусы
            buttonsHTML = `<div class="flex items-center gap-3">${detailButtonHTML}</div>`;
          }
    
          card.innerHTML = `
            <div>
              <div class="${statusClass} mb-2 w-fit rounded-full px-2 py-1 text-xs">
                ${olympiad.status}
              </div>
              <h3 class="mb-1 text-lg font-semibold break-words">${olympiad.title}</h3>
              <p class="text-gray-primary mb-3 text-sm leading-relaxed whitespace-normal">Тур: ${olympiad.tour_type}</p>
            </div>
    
            <div>
              <div class="mb-4">
                <span class="text-gray-secondary mb-1 text-xs">${dateInfoText}</span>
                <p class="text-black-primary text-sm leading-relaxed whitespace-normal">${iconHTML} ${dateInfo}</p>
              </div>
    
              ${buttonsHTML}
            </div>
          `;
    
          container.appendChild(card);
        });
    
      } catch (error) {
        console.error('Ошибка загрузки списка олимпиад:', error);
      }
}
    
    
    
