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
//    await loadDailyTasks();

  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})


async function loadTaskDetails() {
  const urlParams = new URLSearchParams(window.location.search)
  const taskId = urlParams.get('id')
  const source = urlParams.get('source') // 'daily' или 'general'

  if (!taskId || !source) {
    console.error('Не указан id или source задачи в URL')
    return
  }

  const endpoint = `https://portal.gradients.academy/assignments/participant/dashboard/${taskId}/${source}`

  try {
    const token = JSON.parse(localStorage.getItem('user'))?.tokens?.access
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) throw new Error('Ошибка при получении задачи')

    const task = await response.json()
    renderTask(task)
  } catch (err) {
    console.error('Ошибка загрузки задачи:', err)
  }
}

function renderTask(task) {
  document.querySelector('h2.text-2xl').textContent = task.title
  document.querySelector('p.text-gray-600').textContent = `${task.grade} класс`

  const descriptionEl = document.querySelector('.text.border-gray-border')
  descriptionEl.innerHTML = `<p>${task.description}</p>`

  const deadlineEl = document.querySelector('.text-primary')
  const deadlineDate = new Date(task.deadline)
  deadlineEl.textContent = deadlineDate.toLocaleString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  const timeLeftEl = document.querySelector('.timer')
  timeLeftEl.innerHTML = `<span class="border-default bg-orange-secondary rounded-sm p-2.5">${task.time_left}</span>`

  const levelMap = {
    easy: 'Лёгкий',
    medium: 'Средний',
    hard: 'Сложный',
  }
  document.querySelector('.d-level').textContent = levelMap[task.level] || task.level

  document.querySelectorAll('.text-gray-primary + span')[0].textContent = `${task.base_points} XP 🟢`
  document.querySelectorAll('.text-gray-primary + span')[1].textContent = `${task.bonus_points} XP 🔵`

  const statusEl = document.querySelector('.card.archive')
  if (statusEl) statusEl.textContent = task.status

  const attachmentsContainer = document.querySelector('.space-y-3')
  attachmentsContainer.innerHTML = ''
  task.attachments.forEach(file => {
    const link = document.createElement('a')
    link.href = file.url
    link.className = 'text-orange-primary flex items-center gap-2'
    link.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      ${file.name}
    `
    attachmentsContainer.appendChild(link)
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user)
  await loadTaskDetails()
})
