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
    setupAssignmentFilters()
    loadOlympiadFilter()
    populateCountryFilter()
    const data = await loadSummary();
    if (data) updateProgressBar(data.recommendation?.xp_to_next ?? 100);
    let sortAscending = true

      const sortHeader = document.getElementById('sort-rank-header')

        if (sortHeader) {
    sortHeader.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const A = a.place
        const B = b.place
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
   const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

    // Очистить карточки, если ничего не выбрано
    document.getElementById('assignment_points').textContent = ''
    document.getElementById('assignments_percent').textContent = ''
    document.getElementById('olympiad_points').textContent = ''
    document.getElementById('olympiad_percentile').textContent = ''
    document.getElementById('total_points').textContent = ''
    document.getElementById('total_percentile').textContent = ''
    document.getElementById('current_level').textContent = ''
    document.getElementById('xp_to_next').textContent = ''

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/results/participant/dashboard/ranking/summary/`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) throw new Error('Ошибка загрузки сводки')

    const data = await response.json()

    document.getElementById('assignment_points').textContent = data.assignment_points
    document.getElementById('assignments_percent').textContent = data.assignments_percent
    document.getElementById('olympiad_points').textContent = data.olympiad_points
    document.getElementById('olympiad_percentile').textContent = data.olympiad_percentile
    document.getElementById('total_points').textContent = data.total_points
    document.getElementById('total_percentile').textContent = data.total_percentile
    document.getElementById('current_level').textContent = data.recommendation.current_level ?? 0
    document.getElementById('xp_to_next').textContent = data.recommendation.xp_to_next
  return data; // Теперь функция возвращает данные!
  } catch (err) {
    console.error('Ошибка при загрузке сводной информации:', err);
    return null; // Возвращаем null, если произошла ошибка
  }
}


function updateProgressBar(xpToNext) {
  const progressBar = document.getElementById('progress-bar');
  const progress = Math.max(0, 100 - xpToNext); // Гарантируем, что значение >= 0
  progressBar.style.width = `${progress}%`;
}


let allAssignments = []
let currentAssignmentPage = 1
const assignmentPageSize = 20
let totalAssignmentCount = 0


let assignmentFilters = {
  search: '',
  country: '',
  grade: '',
  olympiad: ''
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
    if (assignmentFilters.olympiad)
    params.append('olympiad_id', assignmentFilters.olympiad)

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/results/participant/dashboard/ranking/olympiad/?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Для начала необходимо выбрать олимпиаду!`)
    }

    const data = await response.json()
    allAssignments = data.results
    totalAssignmentCount = data.count
    currentAssignmentPage = page
    console.log(data)
    renderAssignmentTable(allAssignments)
    renderAssignmentPagination()
    document.getElementById('total-rateolympiad-count').textContent =
      totalAssignmentCount
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('rateolympiad-tbody').innerHTML = `
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
  const tbody = document.getElementById('rateolympiad-tbody')
  if (!tbody) return

  tbody.innerHTML =
    assignments.length === 0
      ? `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td></tr>`
      : assignments
          .map((task) => {
            const encodedTask = encodeURIComponent(JSON.stringify(task))
            return `
      <tr class="hover:bg-gray-50">
        <td>${((task.place === 1) || (task.place === 2) || (task.place === 3)) ? task.place+'👑' : task.place}</td>
        <td>${task.full_name}</td>
        <td>${Object.keys(classMap).find((key) => classMap[key] === task.grade) || task.grade}</td>
        <td>${task.country.name}</td>
        <td>${task.olympiad_points}</td>
        <td>${task.result}</td>
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

  document.getElementById('total-rateolympiad-count').textContent =
    allAssignments.length
  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}

function applyAssignmentFilters() {
  assignmentFilters.search =
    document.getElementById('filter-search')?.value.trim() || ''
  assignmentFilters.country =
    document.getElementById('filter-country')?.value || ''
  assignmentFilters.grade = document.getElementById('filter-grade')?.value || ''
    document.getElementById('filter-olympiad')?.value || ''
  assignmentFilters.olympiad = document.getElementById('filter-olympiad')?.value || ''
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
   document
    .getElementById('filter-olympiad')
    ?.addEventListener('change', applyAssignmentFilters)
     loadAssignments(1);
}


async function populateCountryFilter() {
  try {
    const response = await authorizedFetch(
      'https://portal.gradients.academy/common/countries/?page=1&page_size=500'
    )
    if (!response.ok) throw new Error('Ошибка загрузки стран')

    const data = await response.json()
    const select = document.getElementById('filter-country')

    data.results.forEach((country) => {
      const option = document.createElement('option')
      option.value = country.code // фильтрация по коду
      option.textContent = country.name // отображается название
      select.appendChild(option)
    })
  } catch (err) {
    console.error('Не удалось загрузить список стран:', err)
  }
}


async function loadOlympiadFilter() {
    const token = localStorage.getItem('access_token')

  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }
  const select = document.getElementById('filter-olympiad');
  if (!select) return;

  try {
    const response = await authorizedFetch(
      'https://portal.gradients.academy/olympiads/participant/dashboard/',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
    if (!response.ok) throw new Error(`Ошибка загрузки олимпиад: ${response.status}`);

    const data = await response.json();

    // Очистка перед заполнением
    select.innerHTML = '';

    // Устанавливаем значение по умолчанию (первая олимпиада)
    let defaultOlympiadId = data.results.length > 0 ? data.results[0].id : '';

    // Заполняем список
    select.innerHTML = `
      ${data.results.map(olympiad => `<option value="${olympiad.id}">${olympiad.title}</option>`).join('')}
    `;

    // Устанавливаем первое значение
    select.value = defaultOlympiadId;
    assignmentFilters.olympiad = defaultOlympiadId;

  } catch (error) {
    console.error('Ошибка при загрузке списка олимпиад:', error);
  }
}
