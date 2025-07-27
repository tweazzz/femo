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
  if (role !== 'administrator') {
    console.warn(`Пользователь с ролью "${role}" не имеет доступа к админке. Редирект.`)
    window.location.href = '/index.html'
    return null
  }

  return user
}

// Основная отрисовка профиля
function renderUserInfo(profile) {
  const avatarEl  = document.getElementById('user-avatar');
  const nameEl    = document.getElementById('user-name');
  const roleEl    = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  const imgPath = profile.image || '';
  avatarEl.src = imgPath.startsWith('http')
    ? imgPath
    : `https://portal.gradients.academy${imgPath}`;

  nameEl.textContent    = profile.full_name_ru || '';
  const firstName       = (profile.full_name_ru || '').split(' ')[0];
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`;

  const roleMap = { administrator: 'Администратор' };
  roleEl.textContent = roleMap[profile.role] || profile.role;
}

async function loadDashboardSummary() {
  const res = await authorizedFetch(
    'https://portal.gradients.academy/api/results/dashboard/summary/'
  )
  if (!res.ok) throw new Error('Ошибка при получении данных')

  const summary = await res.json()

  document.getElementById('registered-count').textContent =
    summary.registered_count
  document.getElementById('active-olympiads').textContent =
    summary.active_olympiads
  document.getElementById('average-score').textContent = summary.average_score
  document.getElementById('total-tasks').textContent = summary.total_tasks

  console.log('Данные дашборда успешно загружены:', summary)
}

async function loadCurrentOlympiad() {
  const block = document.querySelector('.olympiad-block')
  if (!block) return

  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/api/results/dashboard/current/'
    )
    const detailsBtn = block.querySelector('a.btn-base')

    if (!res.ok) {
      const errorData = await res.json()
      if (errorData.detail === 'No active Olympiad.') {
        console.warn('Нет активной олимпиады — отображаем заглушку.')

        block.querySelector('p.font-bold').textContent = 'Нет активной олимпиады'
        block.querySelector('p.text-sm').textContent = 'Ожидается запуск'
        block.querySelectorAll('.date').forEach(el => el.textContent = '—')
        block.querySelectorAll('.date').forEach(dateEl => {
          const titleSpan = dateEl.previousElementSibling?.querySelector('span.font-bold')
          if (titleSpan) titleSpan.textContent = 'Этап'
        })

        // Опционально: отключить кнопку
        if (detailsBtn) {
          detailsBtn.removeAttribute('href')
          detailsBtn.classList.add('opacity-50', 'pointer-events-none')
        }
        return
      }
      throw new Error('Ошибка при получении текущей олимпиады')
    }

    // --- УСПЕШНЫЙ ответ ---
    const olympiad = await res.json()
    console.log('Текущая олимпиада:', olympiad)

    block.querySelector('p.font-bold').textContent = olympiad.title
    block.querySelector('p.text-sm').textContent = olympiad.description
    block.querySelectorAll('.date').forEach((el, i) => {
      const stage = olympiad.stages[i]
      if (stage) {
        el.textContent = `${stage.start} - ${stage.end}`
        const titleEl = el.previousElementSibling
        if (titleEl?.classList.contains('flex')) {
          titleEl.querySelector('span.font-bold').textContent = stage.name
        }
      }
    })

    // Ставим ссылку на сайт олимпиады
    if (detailsBtn && olympiad.website) {
      console.log('Сайт олимпиады:', olympiad.website)
      detailsBtn.href = olympiad.website
      detailsBtn.target = '_blank'
    } else {
      console.warn('Кнопка не найдена или нет поля website в ответе')
    }

  } catch (err) {
    console.error('Ошибка при загрузке текущей олимпиады:', err)
    // общий фоллбэк
    block.querySelector('p.font-bold').textContent = 'Нет активной олимпиады'
    block.querySelector('p.text-sm').textContent = 'Ошибка загрузки данных'
    block.querySelectorAll('.date').forEach(el => el.textContent = '—')
  }
}

async function loadCurrentOlympiadStats() {
  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/api/results/dashboard/current_stats/'
    )
    if (!res.ok) {
      const { detail } = await res.json()
      if (detail === 'No active Olympiad.') {
        console.warn('Нет активной олимпиады — статистика не будет загружена.')
        return
      }
      throw new Error('Ошибка при получении статистики текущей олимпиады')
    }

    const stats = await res.json()
    console.log('Статистика текущей олимпиады:', stats)

    document.getElementById('participants-count').textContent = stats.participants_count ?? 0
    document.getElementById('paid-count').      textContent = stats.paid_count        ?? 0
    document.getElementById('new-today').        textContent = `+ ${stats.new_today ?? 0}`

    // маленькие флажки
    const FLAG_WIDTH  = 16
    const FLAG_HEIGHT = 12
    function countryFlagImgTag(cc) {
      const code = cc.toLowerCase()
      return `<img
        src="https://flagcdn.com/${FLAG_WIDTH}x${FLAG_HEIGHT}/${code}.png"
        alt="${cc} flag"
        width="${FLAG_WIDTH}"
        height="${FLAG_HEIGHT}"
        class="inline-block"
      />`
    }

    const countriesListEl = document.getElementById('countries-list')
    if (Array.isArray(stats.countries) && stats.countries.length) {
      countriesListEl.innerHTML = stats.countries.map(countryFlagImgTag).join('')
    } else {
      countriesListEl.textContent = '—'
    }

  } catch (err) {
    console.error('Ошибка при загрузке статистики олимпиады:', err)
  }
}



async function loadParticipantsTrend() {
  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/api/results/dashboard/trend/'
    )
    if (!res.ok)
      throw new Error('Ошибка при получении данных тренда участников')

    const trendData = await res.json()
    console.log('Данные тренда участников:', trendData)

    // Преобразуем данные для графика
    const labels = trendData.map((item) => String(item.year))
    const counts = trendData.map((item) => item.count)

    console.log('labels:', labels)
    console.log('counts:', counts)


    // Обновляем график
    const ctx = document.getElementById('participantsChart').getContext('2d')

    // Если график уже создан, обновим его данные, иначе создадим новый
    if (window.participantsChartInstance) {
      window.participantsChartInstance.data.labels = labels
      window.participantsChartInstance.data.datasets[0].data = counts
      window.participantsChartInstance.update()
    } else {
      window.participantsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              data: counts,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              borderWidth: 1,
              pointRadius: 3,
              pointHoverRadius: 10,
              pointBackgroundColor: '#fff',
              tension: 0.6,
              fill: true,
              borderCapStyle: 'round',
              borderJoinStyle: 'round',
              pointStyle: 'circle',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              suggestedMax: Math.max(...counts) + 10,
              ticks: {
                callback: (value) => (value === 0 ? 0 : value + ' участников'),
                stepSize: 20,
              },
              precision: 0,
              autoSkip: false,
            },
            x: {
              grid: { display: false },
              ticks: { autoSkip: false },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false },
          },
        },
      })
    }
  } catch (err) {
    console.error('Ошибка при загрузке тренда участников:', err)
  }
}

// Функция, которая дергает профиль администратора
async function loadAdminProfile() {
  const token = localStorage.getItem('access_token');
  if (!token) throw new Error('Токен не найден');

  const res = await authorizedFetch(
    'https://portal.gradients.academy/api/users/administrator/profile/',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Ошибка загрузки профиля: ${res.status}`);
  return await res.json();
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  try {
    // 2) Подтягиваем актуальный профиль по API
    const profileData = await loadAdminProfile();
    // 3) Рисуем шапку
    renderUserInfo(profileData);
    await loadDashboardSummary()
    await loadCurrentOlympiad()
    await loadCurrentOlympiadStats()
    await loadParticipantsTrend()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})


