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

  try {
    // 2) Подтягиваем актуальный профиль по API
    const profileData = await loadAdminProfile();
    // 3) Рисуем шапку
    renderUserInfo(profileData);
    await loadAssignments()
    setupAssignmentFilters()

    let sortAscending = true

      const sortHeader = document.getElementById('sort-date-header')
      if (sortHeader) {
        sortHeader.addEventListener('click', () => {
          allAssignments.sort((a, b) => {
            const dateA = new Date(a.date)
            const dateB = new Date(b.date)
            return sortAscending ? dateA - dateB : dateB - dateA
          })
          sortAscending = !sortAscending
          renderPaginatedAssignments()
        })}

    const sortHeader2 = document.getElementById('sort-rank-header')

        if (sortHeader2) {
    sortHeader2.addEventListener('click', () => {
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

let allAssignments = []
let currentAssignmentPage = 1
const assignmentPageSize = 20
let totalAssignmentCount = 0
let certificateIdToDelete = null
let certificateBeingEditedId = null

let assignmentFilters = {
  search: '',
  category: '',
  status: '',
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
  if (assignmentFilters.category)
    params.append('category', assignmentFilters.category)
  if (assignmentFilters.status) params.append('status', assignmentFilters.status)
  if (assignmentFilters.olympiad)
    params.append('olympiad', assignmentFilters.olympiad)

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/api/certificates/dashboard/?${params.toString()}`,
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
    populateOlympiadFilter(allAssignments)
    totalAssignmentCount = data.count
    currentAssignmentPage = page

    renderAssignmentTable(allAssignments)
    renderAssignmentPagination()
    document.getElementById('total-certificates-count').textContent =
      totalAssignmentCount
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('certificates-tbody').innerHTML = `
      <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
    `
  }
}

function getCertificateCategoryLabel(category) {
  const map = {
    participant: 'Участник',
    winner: 'Победитель',
  }
  return map[category] || category
}

function getCertificateCategoryClass(category) {
  const map = {
    participant: 'bg-blue-100 text-blue-800',
    winner: 'bg-yellow-100 text-yellow-800',
  }
  return map[category] || ''
}

function getCertificateStatusLabel(status) {
  const map = {
    sent: 'Отправлен',
    not_sent: 'Не отправлен',
  }
  return map[status] || status
}

function getCertificateStatusClass(status) {
  const map = {
    sent: 'bg-green-100 text-green-800',
    not_sent: 'bg-grey-100 text-grey-800',
  }
  return map[status] || ''
}


function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('certificates-tbody')
  if (!tbody) return

  tbody.innerHTML =
    assignments.length === 0
      ? `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td></tr>`
      : assignments
          .map((task) => {
            const encodedTask = encodeURIComponent(JSON.stringify(task))
            return `
      <tr class="hover:bg-gray-50">
        <td>
          <label class="flex cursor-pointer items-center justify-center">
            <input type="checkbox" class="peer hidden" value="${task.id}" />
            <div
              class="flex h-5 w-5 items-center justify-center rounded-md border-1 border-orange-500 text-transparent transition-all peer-checked:border-orange-500 peer-checked:bg-orange-500 peer-checked:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                class="size-5"
              >
                <path
                  fill-rule="evenodd"
                  d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
          </label>
        </td>
        <td>${((task.place === 1) || (task.place === 2) || (task.place === 3)) ? task.place+'👑' : task.place}</td>
        <td>${task.participant_name}</td>
        <td>${task.olympiad_title}</td>
        <td><span class="card ${getCertificateCategoryClass(task.category)}">${getCertificateCategoryLabel(task.category)}</span></td>
        <td><span class="card ${getCertificateStatusClass(task.status)}">${getCertificateStatusLabel(task.status)}</span></td>
        <td>${task.date}</td>
        <td>
          <div class="flex justify-between gap-2 *:cursor-pointer">
            <button onclick="openDeleteModal('${task.title}', ${task.id})" class="text-gray-400 hover:text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
              <button onclick="downloadCertificate(${task.id})" data-task="${encodedTask}" class="text-gray-400 hover:text-blue-primary">
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
  const pageData = allAssignments.slice(start, end)
    console.log(allAssignments.length)
  document.getElementById('total-сertificates-count').textContent =
    allAssignments.length
  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}

function applyAssignmentFilters() {
  assignmentFilters.search =
    document.getElementById('filter-search')?.value.trim() || ''
  assignmentFilters.category = document.getElementById('filter-category')?.value || ''
  assignmentFilters.status = document.getElementById('filter-status')?.value || ''
  assignmentFilters.olympiad = document.getElementById('filter-olympiad')?.value || ''

  loadAssignments(1) // всегда загружаем первую страницу при изменении фильтров
}

function setupAssignmentFilters() {
  document
    .getElementById('filter-search')
    ?.addEventListener('input', applyAssignmentFilters)
  document
    .getElementById('filter-category')
    ?.addEventListener('change', applyAssignmentFilters)
  document
    .getElementById('filter-status')
    ?.addEventListener('change', applyAssignmentFilters)
  document
    .getElementById('filter-olympiad')
    ?.addEventListener('change', applyAssignmentFilters)
}


function populateOlympiadFilter(assignments) {
  const olympiadSelect = document.getElementById('filter-olympiad')
  if (!olympiadSelect) return

  // Сохраняем выбранное значение, чтобы не сбрасывалось при обновлении
  const currentValue = olympiadSelect.value

  // Получаем уникальные названия олимпиад
  const uniqueOlympiads = [
    ...new Set(assignments.map((a) => a.olympiad_title).filter(Boolean)),
  ]

  // Очищаем список
  olympiadSelect.innerHTML = `<option value="">Выбрать олимпиаду</option>`

  // Добавляем новые опции
  uniqueOlympiads.forEach((title) => {
    const option = document.createElement('option')
    option.value = title
    option.textContent = title
    olympiadSelect.appendChild(option)
  })

  // Восстанавливаем значение, если оно всё ещё валидно
  if (uniqueOlympiads.includes(currentValue)) {
    olympiadSelect.value = currentValue
  }
}


async function handlePublishClick() {
  // Собираем выбранные ID
  const checkedBoxes = document.querySelectorAll(
    '#certificates-tbody input[type="checkbox"]:checked'
  )
  const ids = Array.from(checkedBoxes).map((el) => Number(el.value))

  if (ids.length === 0) {
    alert('Выберите хотя бы один сертификат для публикации.')
    return
  }

    // Показываем количество в модалке
    document.getElementById('sent-certificates-count').textContent =
      `${ids.length} сертификат${getCertificateWordForm(ids.length)}`

    // Показываем модалку
    toggleModal('modalCertificate')


  // Делаем POST-запрос
  try {
    const token = localStorage.getItem('access_token')
    const response = await authorizedFetch(
      'https://portal.gradients.academy/api/certificates/dashboard/publish/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids }),
      }
    )

    if (!response.ok) {
      throw new Error(`Ошибка публикации: ${response.status}`)
    }

    const result = await response.json()
    console.log('Результат публикации:', result)

    // Обновляем список сертификатов
    await loadAssignments(currentAssignmentPage)
  } catch (err) {
    console.error('Ошибка при публикации:', err)
    alert('Произошла ошибка при публикации. Проверьте консоль.')
  }
}


function getCertificateWordForm(count) {
  const lastDigit = count % 10
  const lastTwo = count % 100

  if (lastTwo >= 11 && lastTwo <= 14) return 'ов'
  if (lastDigit === 1) return ''
  if (lastDigit >= 2 && lastDigit <= 4) return 'а'
  return 'ов'
}


function downloadCertificate(id) {
  const url = `https://portal.gradients.academy/api/certificates/dashboard/${id}/download`
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
      link.download = `certificate_${id}.pdf` // Можно изменить на нужный формат
      document.body.appendChild(link)
      link.click()
      link.remove()
    })
    .catch((error) => {
      alert(`Ошибка: ${error.message}`)
    })
}

