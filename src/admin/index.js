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
    administrator: 'Администратор',
  }
  roleEl.textContent = roleMap[user.profile.role] || user.profile.role
}

async function loadDashboardSummary() {
  const res = await authorizedFetch(
    'https://portal.gradients.academy/results/dashboard/summary/'
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
      'https://portal.gradients.academy/results/dashboard/current/'
    )

    if (!res.ok) {
      const errorData = await res.json()
      if (errorData.detail === 'No active Olympiad.') {
        console.warn('Нет активной олимпиады — отображаем заглушку.')

        block.querySelector('p.font-bold').textContent = 'Нет активной олимпиады'
        block.querySelector('p.text-sm').textContent = 'Ожидается запуск'

        const stageBlocks = block.querySelectorAll('.date')
        stageBlocks.forEach((el) => (el.textContent = '—'))

        // Имена этапов тоже подставим явно
        const stageTitleSpans = block.querySelectorAll('.date')
        stageTitleSpans.forEach((dateEl) => {
          const titleSpan = dateEl.previousElementSibling?.querySelector('span.font-bold')
          if (titleSpan) titleSpan.textContent = 'Этап'
        })

        return
      }

      throw new Error('Ошибка при получении текущей олимпиады')
    }

    const olympiad = await res.json()
    console.log('Текущая олимпиада:', olympiad)

    block.querySelector('p.font-bold').textContent = olympiad.title
    block.querySelector('p.text-sm').textContent = olympiad.description

    const stageBlocks = block.querySelectorAll('.date')
    olympiad.stages.forEach((stage, index) => {
      if (stageBlocks[index]) {
        stageBlocks[index].textContent = `${stage.start} - ${stage.end}`
        const stageTitleEl = stageBlocks[index].previousElementSibling
        if (stageTitleEl && stageTitleEl.classList.contains('flex')) {
          stageTitleEl.querySelector('span.font-bold').textContent = stage.name
        }
      }
    })
  } catch (err) {
    console.error('Ошибка при загрузке текущей олимпиады:', err)

    // Безопасный fallback
    block.querySelector('p.font-bold').textContent = 'Нет активной олимпиады'
    block.querySelector('p.text-sm').textContent = 'Ошибка загрузки данных'
    const stageBlocks = block.querySelectorAll('.date')
    stageBlocks.forEach((el) => (el.textContent = '—'))
  }
}

async function loadCurrentOlympiadStats() {
  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/results/dashboard/current_stats/'
    )

    if (!res.ok) {
      const errorData = await res.json()
      if (errorData.detail === 'No active Olympiad.') {
        console.warn('Нет активной олимпиады — статистика не будет загружена.')
        return
      }
      throw new Error('Ошибка при получении статистики текущей олимпиады')
    }

    const stats = await res.json()
    console.log('Статистика текущей олимпиады:', stats)

    document.getElementById('participants-count').textContent =
      stats.participants_count
    document.getElementById('countries-list').textContent = stats.countries
      .map(getFlagEmoji)
      .join(', ')
    document.getElementById('new-today').textContent = `+ ${stats.new_today}`
    document.getElementById('paid-count').textContent = stats.paid_count
  } catch (err) {
    console.error('Ошибка при загрузке статистики олимпиады:', err)
  }
}


async function loadParticipantsTrend() {
  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/results/dashboard/trend/'
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

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user)

  try {
    await loadDashboardSummary()
    await loadCurrentOlympiad()
    await loadCurrentOlympiadStats()
    await loadParticipantsTrend()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})


