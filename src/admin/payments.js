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

    // 2) Подтягиваем актуальный профиль по API
    const profileData = await loadAdminProfile();
    // 3) Рисуем шапку
    renderUserInfo(profileData);

  try {
    await loadAssignments()
    setupAssignmentFilters()
    await populateOlympiadFilter()
    applyAssignmentFilters()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})

let allAssignments = []
let currentAssignmentPage = 1
const assignmentPageSize = 20
let totalAssignmentCount = 0
let certificateIdToDelete = null
let certificateBeingEditedId = null

let assignmentFilters = {
  search: '',
  status: '',
  created_at__gte: '',
  created_at__lte: '',
  olympiad: '',
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
  if (assignmentFilters.status)
    params.append('status', assignmentFilters.status)
    if (assignmentFilters.date) {
      const [from, to] = assignmentFilters.date.split(',')
      params.append('created_at__gte', from)
      params.append('created_at__lte', to)
    }


  if (assignmentFilters.olympiad)
    params.append('olympiad', assignmentFilters.olympiad)

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/api/payments/dashboard/?${params.toString()}`,
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
    document.getElementById('total-payments-count').textContent =
      totalAssignmentCount
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('payments-tbody').innerHTML = `
      <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
    `
  }
}

function getPaymentStatusLabel(status) {
  const map = {
    paid: 'Оплачено',
    error: 'Ошибка',
    pending: 'В процессе',
  }
  return map[status] || status
}

function getPaymentStatusClass(status) {
  const map = {
    paid: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    pending: 'bg-purple-100 text-purple-800',
  }
  return map[status] || ''
}


function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('payments-tbody')
  if (!tbody) return

  tbody.innerHTML =
    assignments.length === 0
      ? `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td></tr>`
      : assignments
          .map((task) => {
            const encodedTask = encodeURIComponent(JSON.stringify(task))
            return `
      <tr class="hover:bg-gray-50">
        <td>${task.id}</td>
        <td>${task.participant.id}</td>
        <td>${task.participant.full_name_ru}</td>
        <td>${task.description}</td>
        <td>${formatAmount(task.amount)}</td>
        <td><span class="card ${getPaymentStatusClass(task.status)}">${getPaymentStatusLabel(task.status)}</span></td>
        <td>${formatDate(task.created_at)}</td>
        <td>${" "}</td>
        <td>
          <div class="flex justify-between gap-2 *:cursor-pointer">
            <button onclick="openDeleteModal('${task.title}', ${task.id})" class="text-gray-400 hover:text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
              <button onclick="downloadPayment(${task.id})" data-task="${encodedTask}" class="text-gray-400 hover:text-blue-primary">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v12" />
              </svg>
            </button>
          </div>
        </td>
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
  const pageData = filteredAssignments.slice(start, end)

  document.getElementById('total-payments-count').textContent =
    filteredAssignments.length
  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}

function applyAssignmentFilters() {
  assignmentFilters.search =
    document.getElementById('filter-search')?.value.trim() || ''
  assignmentFilters.status = document.getElementById('filter-status')?.value || ''
  assignmentFilters.olympiad = document.getElementById('filter-olympiad')?.value || ''

  const dateRange = document.getElementById('dateRange')?.value
  if (dateRange && dateRange.includes(' - ')) {
    const [start, end] = dateRange.split(' - ')
    assignmentFilters.created_at__gte = `${start}T00:00:00Z`
    assignmentFilters.created_at__lte = `${end}T23:59:59Z`
  } else {
    assignmentFilters.created_at__gte = ''
    assignmentFilters.created_at__lte = ''
  }
    console.log(assignmentFilters)
  loadSummary(assignmentFilters.search, assignmentFilters.status, assignmentFilters.olympiad, assignmentFilters.created_at__gte, assignmentFilters.created_at__lte)
  loadAssignments(1)
}


function setupAssignmentFilters() {
  document
    .getElementById('filter-search')
    ?.addEventListener('input', applyAssignmentFilters)
  document
    .getElementById('filter-status')
    ?.addEventListener('change', applyAssignmentFilters)
  document
    .getElementById('filter-date')
    ?.addEventListener('change', applyAssignmentFilters)
  document
    .getElementById('filter-olympiad')
    ?.addEventListener('change', applyAssignmentFilters)
}


function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toISOString().split('T')[0] // YYYY-MM-DD
}


async function populateOlympiadFilter() {
  const token = localStorage.getItem('access_token')
  if (!token) return

  try {
    const res = await authorizedFetch('https://portal.gradients.academy/api/olympiads/dashboard/', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const data = await res.json()
    const select = document.getElementById('filter-olympiad')

    if (!select) return

    // Очистим и добавим дефолтный вариант
    select.innerHTML = '<option value="">Все олимпиады</option>'

    data.results.forEach((olympiad) => {
      const option = document.createElement('option')
      option.value = olympiad.id
      option.textContent = olympiad.title
      select.appendChild(option)
    })
  } catch (error) {
    console.error('Ошибка загрузки олимпиад:', error)
  }
}


async function loadSummary(search, status, olympiad, created_at__gte, created_at__lte)
 {
    // Очистить карточки, если ничего не выбрано
    document.getElementById('summary-total_amount').textContent = ''
    document.getElementById('summary-successful_payments').textContent = ''
    document.getElementById('summary-pending_confirmations').textContent = ''
    document.getElementById('summary-payments_with_errors').textContent = ''

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/api/payments/dashboard/?search=${search}&status=${status}&created_at__gte=${created_at__gte}&created_at__lte=${created_at__lte}&olympiad=${olympiad}`
    )
    if (!response.ok) throw new Error('Ошибка загрузки сводки')

    const data = await response.json()

    document.getElementById('summary-total_amount').textContent = data.summary.total_amount + ' ₸'
    document.getElementById('summary-successful_payments').textContent = data.summary.successful_payments
    document.getElementById('summary-pending_confirmations').textContent = data.summary.pending_confirmations
    document.getElementById('summary-payments_with_errors').textContent = data.summary.payments_with_errors
  } catch (err) {
    console.error('Ошибка при загрузке сводной информации:', err)
  }
}


function downloadPayment(id) {
  const url = `https://portal.gradients.academy/api/payments/dashboard/${id}/download`
  const token = localStorage.getItem('access_token') // или где вы его храните

  fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Ошибка при загрузке файла')
      }
      return response.blob()
    })
    .then((blob) => {
      const link = document.createElement('a')
      link.href = window.URL.createObjectURL(blob)
      link.download = `payment_${id}.pdf` // Можно изменить на нужный формат
      document.body.appendChild(link)
      link.click()
      link.remove()
    })
    .catch((error) => {
      alert(`Ошибка: ${error.message}`)
    })
}


function formatAmount(amount) {
  const isPositive = amount > 0
  const formatted = `${isPositive ? '+' : ''}${amount} ₸`
  const colorClass = isPositive ? 'text-green-600' : 'text-red-600'
  return `<span class="${colorClass}">${formatted}</span>`
}

