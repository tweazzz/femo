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
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})


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
      `https://portal.gradients.academy/certificates/participant/dashboard/?${params.toString()}`,
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
    document.getElementById('total-certificate-count').textContent =
      totalAssignmentCount
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('certificate-tbody').innerHTML = `
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


function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('certificate-tbody')
  const noCertificatesEl = document.getElementById('no-certificates')
  const tableContainer = document.getElementById('certificate-table-container') // Добавим id на обертку таблицы
  if (!tbody || !noCertificatesEl || !tableContainer) return

  if (assignments.length === 0) {
    // Показываем заглушку
    noCertificatesEl.classList.remove('hidden')
    tableContainer.classList.add('hidden')
    return
  }

  // Иначе показываем таблицу и скрываем заглушку
  noCertificatesEl.classList.add('hidden')
  tableContainer.classList.remove('hidden')
  tbody.innerHTML =
    assignments.length === 0
      ? `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td></tr>`
      : assignments
          .map((task) => {
            const encodedTask = encodeURIComponent(JSON.stringify(task))
            return `
      <tr class="hover:bg-gray-50">
        <td>${task.olympiad}</td>
        <td>${task.date_received}</td>
        <td><span class="card ${getCertificateCategoryClass(task.category)}">${getCertificateCategoryLabel(task.category)}</span></td>
        <td>${((task.place === 1) || (task.place === 2) || (task.place === 3)) ? task.place+'👑' : task.place}</td>
        <td>
          <div class="flex justify-between gap-2 *:cursor-pointer">
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
  const pageData = filteredAssignments.slice(start, end)

  document.getElementById('total-certificate-count').textContent =
    filteredAssignments.length
  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}


function downloadCertificate(id) {
  const url = `https://portal.gradients.academy/certificates/participant/dashboard/${id}/download`
  const token = localStorage.getItem('access_token')

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