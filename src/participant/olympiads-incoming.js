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
  const avatarEl   = document.getElementById('user-avatar');
  const nameEl     = document.getElementById('user-name');
  const roleEl     = document.getElementById('user-role');
  const welcomeEl  = document.querySelector('h1.text-xl');

  // Безопасный путь к картинке: если нет — используем заглушку
  const imgPath = profile && profile.image ? profile.image : null;
  if (imgPath && typeof imgPath === 'string') {
    avatarEl.src = imgPath.startsWith('http')
      ? imgPath
      : `https://portal.femo.kz${imgPath}`;
  } else {
    // вставь тут свой путь к дефолтной аватарке или пустую картинку
    avatarEl.src = '/src/assets/images/default-avatar.png'; // <- поменяй если нужно
  }

  // Имя (берём безопасно: русское, английское, либо fallback)
  const fullNameRu = (profile && (profile.full_name_ru || profile.full_name_en || profile.full_name)) || '';
  nameEl.textContent = fullNameRu || 'Пользователь';

  // безопасно отделяем firstName
  const firstName = fullNameRu ? fullNameRu.split(' ')[0] : 'Привет';
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`;

  // Роль
  roleEl.textContent = 'Участник';
}


document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

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
        // Собираем все страницы из API
        let url = 'https://portal.femo.kz/api/olympiads/participant/dashboard/?tab=upcoming';
        const allOlympiads = [];
        while (url) {
          const resp = await authorizedFetch(url, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!resp.ok) {
            throw new Error(`Ошибка загрузки олимпиад: ${resp.status}`);
          }
          const page = await resp.json();
          allOlympiads.push(...page.results);
          url = page.next;  // URL следующей страницы или null
        }
    
        // Очищаем контейнер и рисуем карточки
        const container = document.querySelector('.grid');
        container.innerHTML = '';
    
        allOlympiads.forEach(olympiad => {
          // Вспомогательные переменные
          let dateInfoText = '';
          let dateInfo     = '';
          let statusClass  = '';
    
          // статус → CSS-класс
          switch (olympiad.status) {
            case 'Завершена':
            case 'Вы участвуете':
              statusClass = 'bg-green-100 text-green-primary';
              break;
            case 'Регистрация открыта':
              statusClass = 'bg-orange-100 text-orange-primary';
              break;
            case 'Идет сейчас':
              statusClass = 'bg-red-100 text-red-primary';
              break;
            case 'Регистрация скоро откроется':
              statusClass = 'bg-grey-100 text-grey-primary';
              break;
            default:
              statusClass = '';
          }
    
          // безопасно парсим даты
          const startDate = olympiad.first_start_date ? new Date(olympiad.first_start_date) : null;
          const endDate   = olympiad.last_end_date  ? new Date(olympiad.last_end_date)  : null;
    
          // статус → текст даты
          if (olympiad.status === 'Завершена') {
            dateInfoText = 'Даты олимпиады';
            dateInfo     = (startDate && endDate) ? `${formatDate(olympiad.first_start_date)} — ${formatDate(olympiad.last_end_date)}` : '—';
          } else if (olympiad.status === 'Регистрация открыта' || olympiad.status === 'Идет сейчас') {
            dateInfoText = 'Осталось';
            if (olympiad.time_left) {
              dateInfo = olympiad.time_left;
            } else if (endDate) {
              const daysLeft = Math.max(0, Math.round((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
              dateInfo = `${daysLeft} дней`;
            } else {
              dateInfo = '—';
            }
          } else if (olympiad.status === 'Регистрация скоро откроется') {
            dateInfoText = 'Откроется';
            dateInfo     = startDate ? formatDate(olympiad.first_start_date) : '—';
          } else if (olympiad.status === 'Вы участвуете') {
            dateInfoText = 'Олимпиада начнётся';
            dateInfo     = startDate ? formatDate(olympiad.first_start_date) : '—';
          } else {
            dateInfoText = '';
            dateInfo = olympiad.time_left || '';
          }
    
          // тексты/иконка
          const buttonText = olympiad.status === 'Завершена' ? 'Посмотреть результаты' : 'Подробнее';
          const useVuesaxIcon = ['Завершена','Вы участвуете','Регистрация скоро откроется'].includes(olympiad.status);
          const iconHTML = useVuesaxIcon
            ? `<img src="/src/assets/images/vuesax.svg" alt="vuesax" class="mb-1 inline-block h-5 w-5" />`
            : `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor"
                    viewBox="0 0 20 20" class="mb-1 inline-block h-5 w-5">
                 <path fill-rule="evenodd"
                       d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5
                          c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
                       clip-rule="evenodd"/>
               </svg>`;
    
          // создаём карточку (чтобы текст не "зажимался")
          const card = document.createElement('div');
          card.className = 'border-default flex flex-col justify-between rounded-xl bg-white p-4 min-h-[200px]';
    
          // Кнопки: detail (белая/оранжевая) и (опционально) register (оранжевая)
          const detailButtonHTML = `<a href="${olympiad.url || '#'}" class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border border-orange-primary bg-white text-orange-primary min-w-[120px] whitespace-nowrap">${buttonText}</a>`;
          // Пробрасываем id в query param удобнее
          const registerButtonHTML = `<a href="/participant/payments.html?olympiad=${encodeURIComponent(olympiad.id)}" class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-orange-primary text-white min-w-[140px] whitespace-nowrap">Зарегистрироваться</a>`;
    
          // Показываем register только если registered === false (иначе только detail)
          let buttonsHTML = `<div class="flex items-center gap-3">${detailButtonHTML}</div>`;
          if (olympiad.registered === false) {
            buttonsHTML = `<div class="flex items-center gap-3">${detailButtonHTML}${registerButtonHTML}</div>`;
          }
    
          card.innerHTML = `
            <div>
              <div class="${statusClass} mb-2 w-fit rounded-full px-2 py-1 text-xs">${olympiad.status}</div>
              <h3 class="mb-1 text-lg font-semibold break-words">${olympiad.title}</h3>
              <p class="text-gray-primary mb-3 text-sm leading-relaxed whitespace-normal">Тур: ${olympiad.tour_type}</p>
            </div>
    
            <div>
              <div class="mb-4">
                <span class="text-gray-secondary mb-1 text-xs">${dateInfoText}</span>
                <p class="text-black-primary text-sm flex items-center gap-1 leading-relaxed whitespace-normal">
                  ${iconHTML}
                  ${dateInfo}
                </p>
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
    