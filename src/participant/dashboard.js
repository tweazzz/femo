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
    await loadAssignments()

    await loadSummary()
    await loadMyTasks()

    const buttons = document.querySelectorAll('.chart-tab')

      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          // Удалить активный класс со всех
          buttons.forEach((b) => b.classList.remove('active'))

          // Добавить активный класс текущей кнопке
          btn.classList.add('active')

          // Вызывать обновление графика
          const period = btn.id // id совпадает с параметром: week, month, year
          loadParticipantsTrend(period)
        })
      })

      // Начальная загрузка графика
      loadParticipantsTrend('week')

      let sortAscending = true

  const sortHeader = document.getElementById('sort-rank-header')
  if (sortHeader) {
    sortHeader.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const A = a.rank
        const B = b.rank
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedAssignments()
    })}
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})

async function loadSummary()
 {
    // Очистить карточки, если ничего не выбрано
    document.getElementById('summary-olympiads_count').textContent = ''
    document.getElementById('summary-total_points').textContent = ''
    document.getElementById('summary-best_rank').textContent = ''
    document.getElementById('summary-unsolved_tasks').textContent = ''

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/api/users/participant/dashboard/summary/`
    )
    if (!response.ok) throw new Error('Ошибка загрузки сводки')

    const data = await response.json()

    document.getElementById('summary-olympiads_count').textContent = data.olympiads_count
    document.getElementById('summary-total_points').textContent = data.total_points
    document.getElementById('summary-best_rank').textContent = data.best_rank
    document.getElementById('summary-unsolved_tasks').textContent = data.unsolved_tasks
  } catch (err) {
    console.error('Ошибка при загрузке сводной информации:', err)
  }
}


async function loadParticipantsTrend(period = 'week') {
  try {
    const res = await authorizedFetch(
      `https://portal.gradients.academy/api/users/participant/dashboard/activity/?period=${period}`
    )
    if (!res.ok) throw new Error('Ошибка при получении данных тренда участников')

    const trendData = await res.json()

    const labels = trendData.map((item) => String(item.date))
    const counts = trendData.map((item) => item.count)

    const ctx = document.getElementById('myChart1').getContext('2d')

    if (window.participantsChartInstance) {
      window.participantsChartInstance.data.labels = labels
      window.participantsChartInstance.data.datasets[0].data = counts
      window.participantsChartInstance.update()
    } else {
      window.participantsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
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
                callback: (value) => (value === 0 ? 0 : value),
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


let allAssignments = []
let currentAssignmentPage = 1
const assignmentPageSize = 20
let totalAssignmentCount = 0


async function loadAssignments(page = 1) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  const params = new URLSearchParams()
  params.append('page', page)

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/api/users/participant/dashboard/global/`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Ошибка загрузки: ${response.status}`)
    }

    const data = await response.json()
    allAssignments = data.results
    totalAssignmentCount = data.count
    currentAssignmentPage = page

    renderPaginatedAssignments()
    document.getElementById('total-rank-count').textContent =
      totalAssignmentCount
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('ranking-tbody').innerHTML = `
      <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
    `
  }
}


const classMap = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eights',
  9: 'ninth',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
}


function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('ranking-tbody')
  if (!tbody) return

  tbody.innerHTML =
    assignments.length === 0
      ? `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td></tr>`
      : assignments
          .map((task) => {
            const encodedTask = encodeURIComponent(JSON.stringify(task))
            return `
      <tr class="hover:bg-gray-50">
        <td>${((task.rank === 1) || (task.rank === 2) || (task.rank === 3)) ? task.rank+'👑' : task.rank}</td>
        <td>${task.full_name}</td>
        <td>${Object.keys(classMap).find((key) => classMap[key] === task.grade) || task.grade}</td>
        <td>${task.country.name}</td>
        <td>${task.total_points}</td>
        <td>${task.olympiad_points}</td>
        <td>${task.assignment_points}</td>
      </tr>
    `
          })
          .join('')
}


function renderAssignmentPagination() {
  const container = document.querySelector('.pagination')
  if (!container) return

  const totalPages = Math.max(
    1,
    Math.ceil(totalAssignmentCount / assignmentPageSize)
  )
  let buttons = ''

  for (let i = 1; i <= totalPages; i++) {
    buttons += `
      <button class="${i === currentAssignmentPage ? 'text-orange-primary border-orange-primary border' : 'text-gray-600'} px-3 py-1 rounded"
        onclick="goToAssignmentPage(${i})">${i}</button>
    `
  }

  container.innerHTML = `
    <div class="flex items-center gap-1">
      <button onclick="goToAssignmentPage(${Math.max(1, currentAssignmentPage - 1)})" class="px-3 py-1">←</button>
      ${buttons}
      <button onclick="goToAssignmentPage(${Math.min(totalPages, currentAssignmentPage + 1)})" class="px-3 py-1">→</button>
    </div>
  `
}

function goToAssignmentPage(page) {
  loadAssignments(page)
}

function renderPaginatedAssignments() {
  const start = (currentAssignmentPage - 1) * assignmentPageSize
  const end = start + assignmentPageSize
  const pageData = allAssignments.slice(start, end)

  document.getElementById('total-rank-count').textContent =
    allAssignments.length
  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}


async function loadMyTasks() {
  const container = document.querySelector('.tasks')
  if (!container) return

  container.innerHTML = '' // Очистка перед загрузкой
  try {
    const response = await authorizedFetch(
      'https://portal.gradients.academy/api/users/participant/dashboard/my-tasks'
    )
    if (!response.ok) throw new Error('Ошибка загрузки задач')

    const tasks = await response.json()

    if (tasks.length === 0) {
      container.innerHTML = '<p class="text-gray-500">Нет доступных задач</p>'
      return
    }

    tasks.forEach((task) => {
      const levelClass = {
        easy: 'card easy',
        medium: 'card medium',
        hard: 'card hard',
      }[task.level] || 'card'

      const timeLeft =
        task.time_left === 'expired'
          ? '<span class="text-red-primary">Время истекло</span>'
          : task.time_left.replace(/&nbsp;/g, ' ')

      const taskHTML = `
        <a href="#" class="border-default flex items-start space-x-4 rounded-2xl bg-white p-4">
          <div class="bg-violet-secondary rounded-xl p-2">
            <img src="/src/assets/images/cube.png" alt="cube" />
          </div>
          <div class="w-full">
            <div class="mb-2 flex items-center space-x-2">
              <span class="font-bold">${task.title}</span>
              <span class="bg-orange-secondary border-default text-orange-primary flex items-center rounded-xl px-1 py-0.5 text-sm leading-2 font-bold">
                ${task.base_points} XP
                <img class="ms-[.125rem] mb-[.125rem] h-4 w-4" src="/src/assets/images/coin.png" alt="coin" />
              </span>
              <span class="${levelClass}">${task.level === 'easy' ? 'Легкий' : task.level === 'medium' ? 'Средний' : 'Сложный'}</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="ms-auto size-5">
                <path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="mb-2 flex items-center justify-between text-sm text-gray-600">
              <span>Для ${task.grade} класса</span>
              <p class="flex items-center gap-1">${timeLeft}</p>
            </div>
            <div class="flex w-full items-center space-x-4">
              <div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div class="h-full bg-orange-500 rounded-full" style="width: ${task.solved ? '100%' : '0%'}"></div>
              </div>
              <span class="w-4 text-sm">${task.solved ? '1/1' : '0/1'}</span>
            </div>
          </div>
        </a>
      `
      container.insertAdjacentHTML('beforeend', taskHTML)
    })
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    container.innerHTML = `<p class="text-red-500">Ошибка загрузки задач</p>`
  }
}
