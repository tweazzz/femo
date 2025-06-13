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
    await loadDailyTasks();
    renderUserInfo(user)
    await loadDailyTasks()
    await loadAllTasks()
    loadAllTasksWithFilters
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})


const classMap = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eighth',
  9: 'ninth',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
}

const levelMap = {
  'Легкий уровень': 'easy',
  'Средний уровень': 'medium',
  'Сложный уровень': 'hard',
}



async function loadDailyTasks() {
  const token = localStorage.getItem('access_token')

  if (!token) {
    console.warn('Токен не найден')
    return
  }

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/assignments/participant/dashboard/daily`,
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
    renderDailyTasks(data.results)
  } catch (error) {
    console.error('Ошибка загрузки задач дня:', error)
  }
}

function renderDailyTasks(tasks) {
  const container = document.querySelector('.pt-6 .grid')
  container.innerHTML = '' // Очистим старые задачи

  tasks.forEach((task) => {
    const levelMap = {
      easy: 'Легкий',
      medium: 'Средний',
      hard: 'Сложный',
    }

    const levelClassMap = {
      easy: 'text-green-primary bg-green-secondary',
      medium: 'text-orange-primary bg-orange-secondary',
      hard: 'text-red-primary bg-red-secondary',
    }

    const levelClass = levelClassMap[task.level] || 'bg-gray-200'
    const levelText = levelMap[task.level] || task.level

    const taskHTML = `
      <a href="/participant/task.html?id=${task.id}" class="border-default flex items-start space-x-4 rounded-2xl bg-white p-4">
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
            <span class="${levelClass} border-default rounded-xl px-2 py-0.5 text-sm">${levelText}</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="ms-auto size-5">
              <path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="mb-2 flex items-center justify-between text-sm text-gray-600">
            <span>Для ${task.grade} класса</span>
            <p class="${levelClass.split(' ')[0]} flex">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="me-0.5 size-5">
                <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clip-rule="evenodd" />
              </svg>
              <span>${task.time_left}</span>
            </p>
          </div>
          <div class="flex w-full items-center space-x-4">
            <div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div class="h-full w-full rounded-full ${task.solved ? 'bg-gray-primary' : 'bg-orange-500'}" style="width: ${task.solved ? '100%' : '0%'}"></div>
            </div>
            <span class="w-4 text-sm">${task.solved ? '1/1' : '0/1'}</span>
          </div>
        </div>
      </a>
    `

    container.insertAdjacentHTML('beforeend', taskHTML)
  })
}


async function loadAllTasks() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    console.warn('Токен не найден')
    return
  }

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/assignments/participant/dashboard/general`,
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
    renderAllTasks(data.results)
  } catch (error) {
    console.error('Ошибка загрузки всех задач:', error)
  }
}


function renderAllTasks(tasks) {
  const container = document.querySelectorAll('.grid')[1] // Вторая сетка — "Все задачи"
  const classFilter = document.querySelectorAll('.select-filter')[0].value
  const levelFilter = document.querySelectorAll('.select-filter')[1].value
  const showCompleted = document.querySelector('input[type="checkbox"]').checked

  container.innerHTML = ''

  const levelMap = {
    easy: 'Легкий',
    medium: 'Средний',
    hard: 'Сложный',
  }

  const levelClassMap = {
    easy: 'text-green-primary bg-green-secondary',
    medium: 'text-orange-primary bg-orange-secondary',
    hard: 'text-red-primary bg-red-secondary',
  }

  const filteredTasks = tasks.filter((task) => {
    const matchClass = classFilter === 'Все классы' || task.grade === parseInt(classFilter)
    const matchLevel =
      levelFilter === 'Все уровни' ||
      levelMap[task.level] === levelFilter.replace(' уровень', '')
    const matchSolved = !showCompleted || task.solved
    return matchClass && matchLevel && matchSolved
  })

  filteredTasks.forEach((task) => {
    const levelText = levelMap[task.level] || task.level
    const levelClass = levelClassMap[task.level] || 'bg-gray-200'

    const taskHTML = `
      <a href="/participant/task.html?id=${task.id}" class="border-default flex items-start space-x-4 rounded-2xl bg-white p-4">
        <div class="bg-violet-secondary rounded-xl p-2">
          <img src="/src/assets/images/cube.png" alt="cube" />
        </div>
        <div class="w-full">
          <div class="mb-2 flex items-center space-x-2">
            <span class="truncate font-bold">${task.title}</span>
            <span class="bg-orange-secondary border-default text-orange-primary flex items-center rounded-xl px-1 py-0.5 text-sm leading-2 font-bold">
              ${task.points} XP
              <img class="ms-[.125rem] mb-[.125rem] h-4 w-4" src="/src/assets/images/coin.png" alt="coin" />
            </span>
            <span class="${levelClass} border-default rounded-xl px-2 py-0.5 text-sm">${levelText}</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="ms-auto size-5">
              <path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="mb-2 flex items-center justify-between text-sm text-gray-600">
            <span>Для ${task.grade} класса</span>
            <p class="text-gray-primary flex">
              ${task.solved ? 'Сдано' : 'Не сдано'}
            </p>
          </div>
          <div class="flex w-full items-center space-x-4">
            <div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div class="h-full rounded-full ${task.solved ? 'bg-gray-300' : 'bg-orange-500'}" style="width: ${task.solved ? '100%' : '0%'}"></div>
            <span class="w-4 text-sm">${task.solved ? '1/1' : '0/1'}</span>
          </div>
        </div>
      </a>
    `
    container.insertAdjacentHTML('beforeend', taskHTML)
  })
}


function renderAllTasks(tasks) {
  const container = document.querySelectorAll('.grid')[1] // Вторая сетка — "Все задачи"
  const classFilter = document.querySelectorAll('.select-filter')[0].value
  const levelFilter = document.querySelectorAll('.select-filter')[1].value
  const showCompleted = document.querySelector('input[type="checkbox"]').checked

  container.innerHTML = ''

  const levelMap = {
    easy: 'Легкий',
    medium: 'Средний',
    hard: 'Сложный',
  }

  const levelClassMap = {
    easy: 'text-green-primary bg-green-secondary',
    medium: 'text-orange-primary bg-orange-secondary',
    hard: 'text-red-primary bg-red-secondary',
  }

  const filteredTasks = tasks.filter((task) => {
    const matchClass = classFilter === 'Все классы' || task.grade === parseInt(classFilter)
    const matchLevel =
      levelFilter === 'Все уровни' ||
      levelMap[task.level] === levelFilter.replace(' уровень', '')
    const matchSolved = !showCompleted || task.solved
    return matchClass && matchLevel && matchSolved
  })

  filteredTasks.forEach((task) => {
    const levelText = levelMap[task.level] || task.level
    const levelClass = levelClassMap[task.level] || 'bg-gray-200'

    const taskHTML = `
      <a href="/participant/task.html?id=${task.id}" class="border-default flex items-start space-x-4 rounded-2xl bg-white p-4">
        <div class="bg-violet-secondary rounded-xl p-2">
          <img src="/src/assets/images/cube.png" alt="cube" />
        </div>
        <div class="w-full">
          <div class="mb-2 flex items-center space-x-2">
            <span class="truncate font-bold">${task.title}</span>
            <span class="bg-orange-secondary border-default text-orange-primary flex items-center rounded-xl px-1 py-0.5 text-sm leading-2 font-bold">
              ${task.points} XP
              <img class="ms-[.125rem] mb-[.125rem] h-4 w-4" src="/src/assets/images/coin.png" alt="coin" />
            </span>
            <span class="${levelClass} border-default rounded-xl px-2 py-0.5 text-sm">${levelText}</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="ms-auto size-5">
              <path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="mb-2 flex items-center justify-between text-sm text-gray-600">
            <span>Для ${task.grade} класса</span>
            <p class="text-gray-primary flex">
              ${task.solved ? 'Сдано' : 'Не сдано'}
            </p>
          </div>
          <div class="flex w-full items-center space-x-4">
            <div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div class="${task.solved ? 'bg-gray-primary' : 'bg-orange-500'} h-full rounded-full" style="width: ${task.solved ? '100%' : '0%'}"></div>
            </div>
            <span class="w-4 text-sm">${task.solved ? '1/1' : '0/1'}</span>
          </div>
        </div>
      </a>
    `
    container.insertAdjacentHTML('beforeend', taskHTML)
  })
}


document.querySelectorAll('.select-filter, input[type="checkbox"]').forEach((el) => {
  el.addEventListener('change', () => {
    loadAllTasks()
  })
})


async function loadAllTasksWithFilters() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    console.warn('Токен не найден')
    return
  }

  const classSelect = document.querySelectorAll('.select-filter')[0]
  const levelSelect = document.querySelectorAll('.select-filter')[1]
  const solvedCheckbox = document.querySelector('input[type="checkbox"]')

  const selectedClass = classSelect.value
  const selectedLevel = levelSelect.value
  const solvedOnly = solvedCheckbox.checked

  const params = new URLSearchParams()

  if (selectedClass !== 'Все классы') {
    const gradeNumber = parseInt(selectedClass)
    const gradeCode = classMap[gradeNumber]
    if (gradeCode) params.append('grade', gradeCode)
  }

  if (selectedLevel !== 'Все уровни') {
    const levelCode = levelMap[selectedLevel]
    if (levelCode) params.append('level', levelCode)
  }

  params.append('solved_only', solvedOnly)

  const url = `https://portal.gradients.academy/assignments/participant/dashboard/general/?${params.toString()}`

  try {
    const response = await authorizedFetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Ошибка загрузки: ${response.status}`)
    }

    const data = await response.json()
    renderAllTasks(data.results)
  } catch (error) {
    console.error('Ошибка загрузки всех задач с фильтрами:', error)
  }
}


document.querySelectorAll('.select-filter, input[type="checkbox"]').forEach((el) => {
  el.addEventListener('change', () => {
    loadAllTasksWithFilters()
  })
})
