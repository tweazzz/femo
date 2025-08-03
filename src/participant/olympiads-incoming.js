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
    'https://portal.gradients.academy/api/users/participant/profile/'
  );
  if (!res.ok) throw new Error('Не удалось загрузить профиль');
  return await res.json();
}

function renderUserInfo(profile) {
  const avatarEl   = document.getElementById('user-avatar')
  const nameEl     = document.getElementById('user-name')
  const roleEl     = document.getElementById('user-role')
  const welcomeEl  = document.querySelector('h1.text-xl')

  // 1) Картинка
  const imgPath = profile.image
  avatarEl.src = imgPath.startsWith('http')
    ? imgPath
    : `https://portal.gradients.academy${imgPath}`

  // 2) Имя и приветствие
  nameEl.textContent = profile.full_name_ru
  const firstName = profile.full_name_ru.split(' ')[0]
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`

  // 3) Роль (она всегда участник)
  roleEl.textContent = 'Участник'
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
    // 1) Собираем все страницы из API
    let url = 'https://portal.gradients.academy/api/olympiads/participant/dashboard/?tab=upcoming';
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

    // 2) Очищаем контейнер и рисуем карточки
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
      }

      // статус → текст даты
      if (olympiad.status === 'Завершена') {
        dateInfoText = 'Даты олимпиады';
        dateInfo     = `${formatDate(olympiad.first_start_date)} — ${formatDate(olympiad.last_end_date)}`;
      } else if (olympiad.status === 'Регистрация открыта' ||
                 olympiad.status === 'Идет сейчас') {
        dateInfoText = 'Осталось';
        const daysLeft = Math.round(
          (new Date(olympiad.last_end_date) - new Date()) / (1000 * 60 * 60 * 24)
        );
        dateInfo = `${daysLeft} дней`;
      } else if (olympiad.status === 'Регистрация скоро откроется') {
        dateInfoText = 'Откроется';
        dateInfo     = formatDate(olympiad.first_start_date);
      } else if (olympiad.status === 'Вы участвуете') {
        dateInfoText = 'Олимпиада начнётся';
        dateInfo     = formatDate(olympiad.first_start_date);
      }

      // текст кнопки
      const buttonText = olympiad.status === 'Завершена'
        ? 'Посмотреть результаты'
        : 'Подробнее';

      // иконка
      const useVuesaxIcon = ['Завершена','Вы участвуете','Регистрация скоро откроется']
        .includes(olympiad.status);
      const iconHTML = useVuesaxIcon
        ? `<img src="/src/assets/images/vuesax.svg" alt="vuesax" class="mb-1 inline-block h-5 w-5" />`
        : `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor"
                viewBox="0 0 20 20" class="mb-1 inline-block h-5 w-5">
             <path fill-rule="evenodd"
                   d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5
                      c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
                   clip-rule="evenodd"/>
           </svg>`;

      // создаём карточку
      const card = document.createElement('div');
      card.className = 'border-default flex flex-col rounded-xl bg-white p-4';

      card.innerHTML = `
        <div class="${statusClass} mb-2 w-fit rounded-full px-2 py-1 text-xs">
          ${olympiad.status}
        </div>
        <h3 class="mb-1 text-lg font-semibold">${olympiad.title}</h3>
        <p class="text-gray-primary mb-3 text-sm">Тур: ${olympiad.tour_type}</p>
        <div class="mt-auto mb-4 flex">
          <div>
            <span class="text-gray-secondary mb-1 text-xs">${dateInfoText}</span>
            <p class="text-black-primary text-sm flex items-center gap-1">
              ${iconHTML}
              ${dateInfo}
            </p>
          </div>
        </div>
        <a href="${olympiad.url}" class="btn-base">
          ${buttonText}
        </a>
      `;

      container.appendChild(card);
    });

  } catch (error) {
    console.error('Ошибка загрузки списка олимпиад:', error);
  }
}