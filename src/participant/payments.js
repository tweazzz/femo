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
    initTopUpHandler()
    await loadBalance()
    await loadAssignments()
    await loadActiveOlympiads()
    let sortAscending = true

  const sortHeader = document.getElementById('sort-date-header')
  if (sortHeader) {
    sortHeader.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const dateA = new Date(a.created_at)
        const dateB = new Date(b.created_at)
        return sortAscending ? dateA - dateB : dateB - dateA
      })
      sortAscending = !sortAscending
      renderPaginatedAssignments()
    })}

    if (submitBtn) {
  submitBtn.addEventListener('click', async () => {
    const success = await submitProfileUpdate()
    if (success) {
      toggleModal('modal')         // ✅ открыть модалку
      toggleEditMode(false)        // 🔒 выключить редактирование
    } else {
      alert('Не получилось обновить данные')
    }
  })
}


  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})

function initTopUpHandler() {
  const topUpForm = document.querySelector('#modal form')
  const topUpButton = topUpForm.querySelector('button.btn-orange')

  topUpButton.addEventListener('click', async (e) => {
    e.preventDefault()

    const input = topUpForm.querySelector('input[type="number"]')
    const amount = parseInt(input.value, 10)

    if (isNaN(amount) || amount <= 0) {
      alert('Введите корректную сумму для пополнения.')
      return
    }

  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

    try {
      const response = await authorizedFetch('https://portal.gradients.academy/payments/participant/dashboard/topup/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount })
      })

      const result = await response.json()

      if (response.ok && result.pg_status === 'ok') {
        toggleModal('modal', false)
        location.reload()
      } else {
        alert('Ошибка при пополнении: ' + (result?.pg_status || 'Неизвестная ошибка'))
      }
    } catch (err) {
      console.error('Ошибка запроса:', err)
      alert('Произошла ошибка при отправке запроса.')
    }
  })
}

let allAssignments = []
let currentAssignmentPage = 1
const assignmentPageSize = 5
let totalAssignmentCount = 0

async function loadAssignments(page = 1) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/payments/participant/dashboard/history/`,
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
    console.log('История платежей:', data)
    allAssignments = data.results || data
    totalAssignmentCount = allAssignments.length
    currentAssignmentPage = page

    renderPaginatedAssignments()
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('payments-tbody').innerHTML = `
      <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
    `
  }
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
        <td>${formatDate(task.created_at)}</td>
        <td>${task.description}</td>
        <td>${formatAmount(task.amount)}</td>
        <td><span class="card ${getPaymentStatusClass(task.status)}">${getPaymentStatusLabel(task.status)}</span></td>
        <td>
          <div class="flex justify-between gap-2 *:cursor-pointer">
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
  currentAssignmentPage = page
  renderPaginatedAssignments()
}

function renderPaginatedAssignments() {
  const start = (currentAssignmentPage - 1) * assignmentPageSize
  const end = start + assignmentPageSize
  const pageData = allAssignments.slice(start, end)

  document.getElementById('total-payments-count').textContent =
    allAssignments.length

  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toISOString().split('T')[0] // YYYY-MM-DD
}

function formatAmount(amount) {
  return `${amount > 0 ? '+' : ''}${amount.toLocaleString('ru-RU')} ₸`
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


async function loadBalance() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await authorizedFetch('https://portal.gradients.academy/payments/participant/dashboard/balance/', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error(`Ошибка загрузки баланса: ${response.status}`)
    }

    const data = await response.json()
    const balanceEl = document.querySelector('.balance')
    if (balanceEl) {
      balanceEl.textContent = `${data.balance.toLocaleString('ru-RU')} ₸`
    }
  } catch (err) {
    console.error('Ошибка при загрузке баланса:', err)
  }
}


async function loadActiveOlympiads() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await authorizedFetch('https://portal.gradients.academy/payments/participant/dashboard/active-olympiads', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error(`Ошибка загрузки олимпиад: ${response.status}`)
    }

    const olympiads = await response.json()
    renderActiveOlympiads(olympiads)
  } catch (err) {
    console.error('Ошибка при загрузке активных олимпиад:', err)
  }
}


function renderActiveOlympiads(olympiads) {
  const wrapper = document.querySelector('[data-olympiads-wrapper]')
  if (!wrapper) return

  wrapper.innerHTML = olympiads.length === 0
    ? '<p class="text-gray-500">Нет активных олимпиад</p>'
    : olympiads.map(olymp => `
      <div class="border-default w-full max-w-sm rounded-2xl p-4 mb-4">
        <div class="card ${olymp.is_paid ? 'paid' : 'unpaid'} mb-2">
          ${olymp.is_paid ? 'Оплачено' : 'Не оплачено'}
        </div>
        <p class="mb-4 font-bold">${olymp.title}</p>
        <div class="mb-6 flex *:flex-1">
          <div>
            <p class="text-gray-primary text-xs">Цена</p>
            <div class="text-blue-primary flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/>
              </svg>
              <span class="text-sm">${olymp.price.toLocaleString('ru-RU')} ₸</span>
            </div>
          </div>
          <div>
            <p class="text-gray-primary text-xs">Осталось</p>
            <div class="text-red-primary flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
              </svg>
              <span class="text-sm">${olymp.time_left || '—'}</span>
            </div>
          </div>
        </div>
        ${!olymp.is_paid ? `
          <button class="bg-orange-primary block w-full cursor-pointer rounded-3xl p-1.5 text-center text-white">
            Оплатить участие
          </button>` : ''}
      </div>
    `).join('')
}


function downloadPayment(id) {
  const url = `https://portal.gradients.academy/payments/participant/dashboard/${id}/download`
  const token = localStorage.getItem('access_token') // или где вы его храните

  authorizedFetch(url, {
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


async function submitProfileUpdate() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден')
    return false
  }

  try {
    const form = document.querySelector('form')

    const body = {
      id: Number(form.querySelector('input[name="id"]').value),
      email: form.querySelector('input[name="email"]').value,
      full_name_ru: form.querySelector('input[name="fullname_ru"]').value,
      full_name_en: form.querySelector('input[name="fullname_en"]').value,
      image: document.getElementById('imagePreview').src,
      country: {
        code: 'KZ', // или получай из скрытого поля
        name: form.querySelector('input[name="country"]').value
      },
      city: form.querySelector('input[name="city"]').value,
      school: form.querySelector('input[name="school"]').value,
      grade: reverseGrade(form.querySelector('input[name="class"]').value),
      parent: {
        name_ru: form.querySelector('input[name="parent_name"]').value,
        name_en: form.querySelector('input[name="parent_name_en"]').value || null,
        phone_number: form.querySelector('input[name="parent_phone"]').value
      },
      teacher: {
        name_ru: form.querySelector('input[name="teacher_name"]').value,
        name_en: form.querySelector('input[name="teacher_name_en"]').value || null,
        phone_number: form.querySelector('input[name="teacher_phone"]').value
      }
    }

    const response = await authorizedFetch('http://portal.gradients.academy/users/participant/profile/', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) return false

    return true

  } catch (err) {
    console.error('Ошибка при отправке данных:', err)
    return false
  }
}


function reverseGrade(number) {
  const map = {
    '1': 'first',
    '2': 'second',
    '3': 'third',
    '4': 'fourth',
    '5': 'fifth',
    '6': 'sixth',
    '7': 'seventh',
    '8': 'eighth',
    '9': 'ninth',
    '10': 'tenth',
    '11': 'eleventh'
  }
  return map[number] || ''
}


function toggleModal(id) {
  const modal = document.getElementById(id)
  if (modal) {
    modal.classList.toggle('hidden')
  }
}
