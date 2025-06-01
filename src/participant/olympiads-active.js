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

function renderUserInfo(user) {
  const avatarEl = document.getElementById('user-avatar')
  const nameEl = document.getElementById('user-name')
  const roleEl = document.getElementById('user-role')
  const welcomeEl = document.querySelector('h1.text-xl')

  const imgPath = user.profile.image
  avatarEl.src = imgPath.startsWith('http')
    ? imgPath
    : `https://portal.gradients.academy${imgPath}`

  nameEl.textContent = user.profile.full_name_ru
  const firstName = user.profile.full_name_ru.split(' ')[0]
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`

  const roleMap = {
    participant: 'Участник',
  }
  roleEl.textContent = roleMap[user.profile.role] || user.profile.role
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user)

  try {
    await loadOlympiadCards()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})



async function loadOlympiadCards() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }

  try {
    const response = await authorizedFetch('https://portal.gradients.academy/olympiads/participant/dashboard/?tab=active', {
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
      card.className = 'border-default flex flex-col rounded-xl bg-white p-4';

      // Определяем цвет статуса
      let statusClass = '';
      if (olympiad.status == 'Завершена') statusClass = 'bg-green-100 text-green-primary';
      if (olympiad.status == 'Регистрация открыта') statusClass = 'bg-orange-100 text-orange-primary';
      if (olympiad.status == 'Идет сейчас') statusClass = 'bg-red-100 text-red-primary';
      if (olympiad.status == 'Регистрация скоро откроется') statusClass = 'bg-grey-100 text-grey-primary';
      if (olympiad.status == 'Вы участвуете') statusClass = 'bg-green-100 text-green-primary';

        // Определяем текст для даты олимпиады
      if (olympiad.status == 'Завершена') dateInfoText =`Даты олимпиады`
      if (olympiad.status == 'Завершена') dateInfo =`${olympiad.first_start_date} - ${olympiad.last_end_date}`
      if (olympiad.status == 'Регистрация открыта') dateInfoText =`Осталось`
      if (olympiad.status == 'Регистрация открыта') dateInfo =`${Math.round(Date(olympiad.last_end_date)-Date(olympiad.first_start_date))/ (1000 * 60 * 60 * 24)} дней`
      if (olympiad.status == 'Идет сейчас') dateInfoText =`Осталось`
      if (olympiad.status == 'Идет сейчас') dateInfo =`${Math.round(Date(olympiad.last_end_date)-Date(olympiad.first_start_date))/ (1000 * 60 * 60 * 24)} дней`
      if (olympiad.status == 'Регистрация скоро откроется') dateInfoText =`Откроется`
      if (olympiad.status == 'Регистрация скоро откроется') dateInfo =`${olympiad.first_start_date}`
      if (olympiad.status == 'Вы участвуете') dateInfoText =`Олимпиада начнется`
      if (olympiad.status == 'Вы участвуете') dateInfo =`${olympiad.first_start_date}`


      card.innerHTML = `
        <div class="${statusClass} mb-2 w-fit rounded-full px-2 py-1 text-xs">
          ${olympiad.status}
        </div>
        <h3 class="mb-1 text-lg font-semibold">${olympiad.title}</h3>
        <p class="text-gray-primary mb-3 text-sm">Тур: ${olympiad.tour_type}</p>
        <div class="mt-auto mb-4 flex">
          <div>
            <span class="text-gray-secondary mb-1 text-xs">${dateInfoText}</span>
            <p class="text-orange-primary text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="mb-1 inline-block size-5">
                <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clip-rule="evenodd"/>
              </svg>
              ${dateInfo}
            </p>
          </div>
        </div>
        <a href="${olympiad.url}" class="btn-base">Подробнее</a>
      `;

      container.appendChild(card);
    });

  } catch (error) {
    console.error('Ошибка загрузки списка олимпиад:', error);
  }
}
