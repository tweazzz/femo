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
    console.warn(
      `Пользователь с ролью "${role}" не имеет доступа к админке. Редирект.`
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
    administrator: 'Администратор',
  }
  roleEl.textContent = roleMap[user.profile.role] || user.profile.role
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user)

  try {
    await loadGlobalStats() // 👈 добавили вызов функции загрузки статистики
     await loadAssignments()
     setupAssignmentFilters()
     populateCountryFilter()

     let sortAscending = true

    const sortHeader = document.getElementById('sort-scoretask-header')
    const sortHeader2 = document.getElementById('sort-rank-header')
    const sortHeader3 = document.getElementById('sort-score-header')
    const sortHeader4 = document.getElementById('sort-scorerew-header')
    const sortHeader5 = document.getElementById('sort-allscore-header')
    if (sortHeader) {
    sortHeader.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const A = a.olympiad_score
        const B = b.olympiad_score
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedAssignments()
    })}

        if (sortHeader2) {
    sortHeader2.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const A = a.rank
        const B = b.rank
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedAssignments()
    })}

        if (sortHeader3) {
    sortHeader3.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const A = a.olympiad_score
        const B = b.olympiad_score
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedAssignments()
    })}

            if (sortHeader4) {
    sortHeader4.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const A = a.reward_score
        const B = b.reward_score
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedAssignments()
    })}

            if (sortHeader5) {
    sortHeader5.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const A = a.total_score
        const B = b.total_score
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedAssignments()
    })}
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})

async function loadGlobalStats() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    console.warn('Токен не найден. Пропускаем загрузку статистики.')
    return
  }

  try {
    const response = await fetch(
      'https://portal.gradients.academy/results/dashboard/results/stats/',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Ошибка загрузки статистики: ${response.status}`)
    }

    const data = await response.json()

    // Записываем данные в карточки
    document.getElementById('participants').textContent =
      data.total_participants ?? '—'
    document.getElementById('average_score').textContent =
      data.average_score?.toFixed(2) ?? '—'
  } catch (err) {
    console.error('Ошибка при загрузке общей статистики:', err)
  }
}

let allAssignments = []
let currentAssignmentPage = 1
const assignmentPageSize = 20
let totalAssignmentCount = 0

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

let assignmentFilters = {
  search: '',
  country: '',
  grade: '',
}

async function loadAssignments(page = 1) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  const params = new URLSearchParams()
  params.append('page', page)
  if (assignmentFilters.search)
    params.append('search', assignmentFilters.search)
  if (assignmentFilters.country)
    params.append('country', assignmentFilters.country)
  if (assignmentFilters.grade)
    params.append('grade', assignmentFilters.grade)

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/results/dashboard/participants/?${params.toString()}`,
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

    renderAssignmentTable(allAssignments)
    renderAssignmentPagination()
    document.getElementById('total-resoverall-count').textContent =
      totalAssignmentCount
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('resoverall-tbody').innerHTML = `
      <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
    `
  }
}


function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('resoverall-tbody')
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
        <td>${task.full_name_ru}</td>
        <td>${task.country}</td>
        <td>${Object.keys(classMap).find((key) => classMap[key] === task.grade) || task.grade}</td>
        <td>${task.olympiad_score}</td>
        <td>${task.olympiad_score}</td>
        <td>${task.reward_score}</td>
        <td>${task.total_score}</td>
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

  document.getElementById('total-resoverall-count').textContent =
    allAssignments.length
  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}

function applyAssignmentFilters() {
  assignmentFilters.search =
    document.getElementById('filter-search')?.value.trim() || ''
  assignmentFilters.country = document.getElementById('filter-country')?.value || ''
  assignmentFilters.grade = document.getElementById('filter-grade')?.value || ''

  loadAssignments(1)
}


function setupAssignmentFilters() {
  document
    .getElementById('filter-search')
    ?.addEventListener('input', applyAssignmentFilters)
  document
    .getElementById('filter-country')
    ?.addEventListener('change', applyAssignmentFilters)
  document
    .getElementById('filter-grade')
    ?.addEventListener('change', applyAssignmentFilters)
}


async function populateCountryFilter() {
  try {
    const response = await authorizedFetch(
      'https://portal.gradients.academy/common/countries/?page=1&page_size=500'
    );

    if (!response.ok) throw new Error(`Ошибка загрузки стран: ${response.status}`);

    const data = await response.json();

    const select = document.getElementById('filter-country');

    if (!select) {
      console.error('Не найден элемент #filter-country');
      return;
    }

    // Очистка списка перед заполнением
    select.innerHTML = '<option value="">Все страны</option>';

    // Заполняем список стран
    data.results.forEach((country) => {
      const option = document.createElement('option');
      option.value = country.code;
      option.textContent = country.name;
      select.appendChild(option);
    });

  } catch (err) {
    console.error('Не удалось загрузить список стран:', err);
  }
}