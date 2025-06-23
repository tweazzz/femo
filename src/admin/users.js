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

let allUsers = []
let currentFilters = {
  search: '',
  country: '',
  role: '',
  grade: '',
}

// Загрузка всех пользователей
async function loadAllUsers() {
  try {
    console.log('Загрузка пользователей...')

    const res = await authorizedFetch(
      'https://portal.gradients.academy/users/dashboard/'
    )
    if (!res.ok) {
      throw new Error(`Ошибка HTTP: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    console.log('Получены данные:', data)

    if (!Array.isArray(data)) {
      throw new Error('Ожидался массив пользователей')
    }

    allUsers = data
    initFilters(allUsers)
    applyFilters()
  } catch (err) {
    console.error('Ошибка загрузки:', err)
    const tbody = document.querySelector('tbody')
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-6 py-4 text-center text-red-500">
          ${err.message}
        </td>
      </tr>
    `
  }
}

// Инициализация фильтров
function initFilters(users) {
  // Страны
  const countries = [...new Set(users.map((u) => u.country))].filter(Boolean)
  const countrySelect = document.querySelector('.country-filter')
  countrySelect.innerHTML = `
      <option value="">Все страны</option>
      ${countryList.map((c) => `<option value="${c.code}">${c.name}</option>`).join('')}
    `

  // Роли (уже есть в HTML)

  // Классы
  const grades = [...new Set(users.map((u) => u.grade))].filter(Boolean).sort()
  const gradeSelect = document.querySelector('.grade-filter')
  gradeSelect.innerHTML = `
      <option value="">Все классы</option>
      ${Object.entries(classMap)
        .map(([num, name]) => `<option value="${name}">${num}</option>`)
        .join('')}
    `

  // Навешиваем обработчики
  document.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', () => applyFilters())
  })
}

// Применение фильтров
/*function applyFilters() {
  // Используем конкретный ID инпута
  const searchInput = document.querySelector('#search_by_id_or_name')
  const searchTerm = searchInput.value.toLowerCase()

  const country = document.querySelector('.country-filter').value
  const role = document.querySelector('.role-filter').value
  const grade = document.querySelector('.grade-filter').value

  const filtered = allUsers.filter((user) => {
    // Преобразуем ID в строку и в нижний регистр
    const userIdString = user.id.toString().toLowerCase()
    // Ищем совпадения в имени или ID
    const matchesSearch =
      user.full_name_ru.toLowerCase().includes(searchTerm) ||
      userIdString.includes(searchTerm)

    // Проверяем остальные фильтры
    const matchesCountry = !country || user.country === country
    const matchesRole = !role || user.role === role
    const matchesGrade = !grade || user.grade === grade

    return matchesSearch && matchesCountry && matchesRole && matchesGrade
  })

  renderUsers(filtered)
}*/
async function applyFilters() {
  const searchInput = document.querySelector('#search_by_id_or_name')
  currentFilters.search = searchInput.value.trim().toLowerCase()
  currentFilters.country = document.querySelector('.country-filter').value
  currentFilters.role = document.querySelector('.role-filter').value
  currentFilters.grade = document.querySelector('.grade-filter').value

  try {
    const users = await fetchUsersWithFilters(currentPage)
    renderUsers(users)
    await updateTotalCountAndPagination()
  } catch (err) {
    console.error('Ошибка применения фильтров:', err)
  }
}
const reverseClassMap = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
}
// Отрисовка пользователей
function renderUsers(users) {
  const tbody = document.querySelector('tbody')
  tbody.innerHTML =
    users.length === 0
      ? `
    <tr>
      <td colspan="6" class="px-6 py-4 text-center text-gray-500">
        Пользователи не найдены
      </td>
    </tr>
  `
      : users
          .map((user) => {
            const roleInfo =
              user.role === 'participant'
                ? {
                    class: 'text-blue-primary',
                    label: 'Участник',
                  }
                : {
                    class: 'text-violet-primary',
                    label: 'Представитель',
                  }

            return `
      <tr class="hover:bg-gray-50">
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="flex items-center">
            <img class="h-8 w-8 rounded-full"
              src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=32&h=32&auto=format&fit=crop&q=60"
              alt="" />
            <div class="ml-4">
              <div class="text-sm font-medium text-gray-900">
                ${user.full_name_ru}
              </div>
            </div>
          </div>
        </td>
        <td class="px-6 py-4 text-sm whitespace-nowrap">${user.id}</td>
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="flex items-center">
            <span class="mr-2">${getFlagEmoji(user.country)}</span>
            <span class="text-sm text-gray-900">${user.country}</span>
          </div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="${roleInfo.class} flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium">
            <span class="text-xl">•</span> ${roleInfo.label}
          </span>
        </td>
        <td class="px-6 py-4 text-sm whitespace-nowrap">${reverseClassMap[user.grade] || '—'}</td>
        <td class="px-6 py-4 text-sm whitespace-nowrap">
          <!-- Кнопки действий остаются без изменений -->
            <div class="flex justify-between gap-2 *:cursor-pointer">
            <button type="button" onclick="confirmDeleteUser(${user.id})" class="text-gray-400 hover:text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
            <button type="button" onclick="openEditModal(${user.id})" class="hover:text-blue-primary text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </button>
          </div>
        </td>
        </td>
      </tr>
    `
          })
          .join('')
}

// Вспомогательная функция для флагов
function getFlagEmoji(country) {
  const flags = {
    Казахстан: '🇰🇿',
    Россия: '🇷🇺',
    Узбекистан: '🇺🇿',
  }
  return flags[country] || ''
}

// Обновленный setupSearch с debounce
function setupSearch() {
  const searchInput = document.querySelector('#search_by_id_or_name')
  const debouncedSearch = debounce(() => applyFilters(), 500)

  searchInput.addEventListener('input', debouncedSearch)
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') applyFilters()
  })
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user)
  setupSearch()

  await populateCountryAndClassOptions()

  try {
    await loadAllUsers()
  } catch (err) {
    console.error('Ошибка инициализации:', err)
  }
})

// Функция debounce
function debounce(func, delay) {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func.apply(this, args), delay)
  }
}

async function downloadAllUsersExcel() {
  try {
    const token = localStorage.getItem('access_token')

    if (!token) {
      console.error('Токен не найден в localStorage')
      return
    }

    const response = await fetch(
      'https://portal.gradients.academy/users/dashboard/export/',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(
        `Ошибка скачивания файла: ${response.status} ${response.statusText}`
      )
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = 'users.xlsx' // можно адаптировать имя
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Ошибка при скачивании файла:', err)
  }
}

const pageSize = 20
let currentPage = 1
let totalUserCount = 0

async function fetchUsersWithFilters(page = 1, size = pageSize) {
  const params = new URLSearchParams()

  // Применяем фильтры
  if (currentFilters.search) params.append('search', currentFilters.search)
  if (currentFilters.country) params.append('country', currentFilters.country)
  if (currentFilters.role) params.append('role', currentFilters.role)
  if (currentFilters.grade) params.append('grade', currentFilters.grade)

  params.append('page', page)
  params.append('page_size', size)

  const url = `https://portal.gradients.academy/users/dashboard/?${params.toString()}`
  const res = await authorizedFetch(url)

  if (!res.ok) throw new Error(`Ошибка HTTP: ${res.status}`)

  const data = await res.json()
  return data
}

async function updateTotalCountAndPagination() {
  const params = new URLSearchParams()

  if (currentFilters.search) params.append('search', currentFilters.search)
  if (currentFilters.country) params.append('country', currentFilters.country)
  if (currentFilters.role) params.append('role', currentFilters.role)
  if (currentFilters.grade) params.append('grade', currentFilters.grade)

  // Максимальный page_size, чтобы просто получить общее число
  params.append('page', 1)
  params.append('page_size', 50)

  const url = `https://portal.gradients.academy/users/dashboard/?${params.toString()}`
  const res = await authorizedFetch(url)

  if (!res.ok)
    throw new Error('Не удалось получить общее количество пользователей')

  const users = await res.json()
  totalUserCount = users.length

  document.getElementById('total-users-count').textContent = totalUserCount

  renderPaginationControls(totalUserCount)
}

function renderPaginationControls(totalCount) {
  const paginationContainer = document.getElementById('pagination')
  paginationContainer.innerHTML = ''

  const totalPages = Math.ceil(totalCount / pageSize)

  // Стрелка "назад"
  const prevBtn = document.createElement('button')
  prevBtn.innerHTML = '&larr;'
  prevBtn.className = 'px-3 py-1 border rounded'
  prevBtn.disabled = currentPage === 1
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--
      applyFilters()
    }
  })
  paginationContainer.appendChild(prevBtn)

  // Номера страниц
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button')
    btn.textContent = i
    btn.className = `px-3 py-1 border rounded ${
      i === currentPage
        ? 'border-orange-primary text-orange-primary'
        : 'text-gray-600 hover:bg-gray-50'
    }`
    btn.addEventListener('click', () => {
      currentPage = i
      applyFilters()
    })
    paginationContainer.appendChild(btn)
  }

  // Стрелка "вперёд"
  const nextBtn = document.createElement('button')
  nextBtn.innerHTML = '&rarr;'
  nextBtn.className = 'px-3 py-1 border rounded'
  nextBtn.disabled = currentPage === totalPages
  nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++
      applyFilters()
    }
  })
  paginationContainer.appendChild(nextBtn)
}

async function addUser(formId, role = 'participant') {
  const form = document.getElementById(formId)
  const formData = new FormData(form)

  const data = {
    email: formData.get('email'),
    password: form.querySelector('#password')?.value || '',
    full_name_ru: formData.get('fullname'),
    country:
      formData.get('country') === 'Казахстан' ? 'KZ' : formData.get('country'),
    city: formData.get('city') || '',
    school: formData.get('school') || '',
    grade: formData.get('class') || '',
    parent_name_ru: formData.get('parent_name') || '',
    parent_phone_number: formData.get('parent_phone') || '',
    teacher_name_ru: formData.get('teacher_name') || '',
    teacher_phone_number: formData.get('teacher_phone') || '',
    phone_number: formData.get('phone_number') || '',
    role: role,
  }

  try {
    const token = localStorage.getItem('access_token')
    if (!token) {
      throw new Error('Токен не найден в localStorage')
    }

    const response = await fetch(
      'https://portal.gradients.academy/users/dashboard/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      }
    )

    const responseBody = await response.json()

    if (!response.ok) {
      throw new Error(responseBody.detail || JSON.stringify(responseBody))
    }

    alert('Пользователь успешно добавлен!')
    form.reset()

    // Скрываем модалку
    const modal = document.getElementById('modalAdd')
    if (modal) {
      modal.classList.add('hidden')
      modal.style.pointerEvents = 'auto'
    }

    // Скрываем оверлей, если он есть
    const overlay =
      document.querySelector('.overlay') ||
      document.querySelector('.modal-overlay')
    document.querySelector('.modal-backdrop')
    if (overlay) {
      overlay.classList.add('hidden')
      overlay.style.pointerEvents = 'none'
    }

    // Снимаем блокировку скролла и взаимодействия с body
    document.body.classList.remove('modal-open', 'no-scroll', 'overflow-hidden')
    document.body.style.overflow = ''
    document.body.style.pointerEvents = 'auto'
  } catch (error) {
    alert(`Ошибка: ${error.message}`)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('participant-form')
    .addEventListener('submit', (e) => {
      e.preventDefault()
      addUser('participant-form', 'participant')
    })

  document
    .getElementById('representative-form')
    .addEventListener('submit', (e) => {
      e.preventDefault()
      addUser('representative-form', 'representative')
    })
})

async function deleteUser(userId) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await fetch(
      `https://portal.gradients.academy/users/dashboard/${userId}/`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Ошибка удаления: ${response.statusText}`)
    }

    alert('Пользователь успешно удален')
    await loadAllUsers() // Перезагрузка списка
  } catch (err) {
    console.error('Ошибка при удалении пользователя:', err)
    alert('Не удалось удалить пользователя')
  }
}

let userIdToDelete = null

function handleDeleteConfirmed() {
  if (userIdToDelete !== null) {
    deleteUser(userIdToDelete)
    userIdToDelete = null

    // Закрываем модальное окно
    toggleModal('modalDel', false)
  }
}

function confirmDeleteUser(id, fullName = null) {
  userIdToDelete = id

  const nameEl = document.getElementById('delete-user-name')

  if (nameEl) {
    if (fullName) {
      nameEl.textContent = fullName
    } else {
      const user = allUsers.find((u) => u.id === id)
      nameEl.textContent = user ? user.full_name_ru : ''
    }
  }

  toggleModal('modalDel', true)
}

function confirmDeleteUserFromEdit() {
  const modal = document.getElementById('modalEdit')
  const form = modal.querySelector('form:not(.hidden)')
  const fullName = form.querySelector('input[name="fullname"]').value
  const emailInput = form.querySelector('input[name="email"]')
  const userId = emailInput?.dataset.userId

  if (!userId) {
    alert('ID пользователя не найден')
    return
  }

  confirmDeleteUser(parseInt(userId), fullName)
}

async function updateUserFromEditForm() {
  const modal = document.getElementById('modalEdit')
  const form = modal.querySelector('form:not(.hidden)')
  if (!form) {
    alert('Форма не найдена')
    return
  }

  const emailInput = form.querySelector('input[name="email"]')
  const userId = emailInput?.dataset.userId
  if (!userId) {
    alert('ID пользователя не найден')
    return
  }

  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  const isParticipant = form.id === 'participant-form-edit'
  const data = {
    email: emailInput.value,
    password: form.querySelector('#password')?.value || '',
    full_name_ru: form.querySelector('input[name="fullname"]').value,
    country: form.querySelector('input[name="country"]').value,
  }

  if (isParticipant) {
    data.city = form.querySelector('input[name="city"]').value
    data.school = form.querySelector('input[name="school"]').value
    data.grade = form.querySelector('input[name="class"]').value
    data.parent_name_ru = form.querySelector('input[name="parent_name"]').value
    data.parent_phone_number = form.querySelector(
      'input[name="parent_phone"]'
    ).value
    data.teacher_name_ru = form.querySelector(
      'input[name="teacher_name"]'
    ).value
    data.teacher_phone_number = form.querySelector(
      'input[name="teacher_phone"]'
    ).value
  }

  try {
    const response = await fetch(
      `https://portal.gradients.academy/users/dashboard/${userId}/`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      }
    )

    const responseBody = await response.json()
    if (!response.ok) {
      throw new Error(responseBody.detail || JSON.stringify(responseBody))
    }

    alert('Пользователь успешно обновлён!')
    toggleModal('modalEdit', false)
    await loadAllUsers()
  } catch (error) {
    alert(`Ошибка при обновлении: ${error.message}`)
  }
}

function openEditModal(userId) {
  const user = allUsers.find((u) => u.id === userId)
  if (!user) {
    alert('Пользователь не найден')
    return
  }

  const role = user.role === 'representative' ? 'representative' : 'participant'

  // Установить переключатель роли
  const roleRadio = document.querySelector(
    `#modalEdit input[name="role"][value="${role}"]`
  )
  if (roleRadio) roleRadio.checked = true

  // Показать нужную форму
  document.querySelectorAll('#modalEdit .role-form').forEach((form) => {
    form.classList.add('hidden')
  })
  const activeForm = document.getElementById(`${role}-form-edit`)
  activeForm.classList.remove('hidden')

  // Установить значения в форму
  const email = activeForm.querySelector('input[name="email"]')
  if (email) {
    email.value = user.email
    email.setAttribute('data-user-id', user.id)
  }

  const fullName = activeForm.querySelector('input[name="fullname"]')
  if (fullName) fullName.value = user.full_name_ru

  const country = activeForm.querySelector('input[name="country"]')
  if (country) country.value = user.country

  if (role === 'participant') {
    activeForm.querySelector('input[name="city"]').value = user.city || ''
    activeForm.querySelector('input[name="school"]').value = user.school || ''
    activeForm.querySelector('input[name="class"]').value = user.grade || ''
    activeForm.querySelector('input[name="parent_name"]').value =
      user.parent_name_ru || ''
    activeForm.querySelector('input[name="parent_phone"]').value =
      user.parent_phone_number || ''
    activeForm.querySelector('input[name="teacher_name"]').value =
      user.teacher_name_ru || ''
    activeForm.querySelector('input[name="teacher_phone"]').value =
      user.teacher_phone_number || ''
  }

  toggleModal('modalEdit', true)
}

let countryList = []

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

async function populateCountryAndClassOptions() {
  try {
    // Загрузка стран
    const res = await fetch(
      'https://portal.gradients.academy/common/countries/?page=1&page_size=500'
    )
    const data = await res.json()
    const countries = data.results
    countryList = data.results

    const countryInputs = document.querySelectorAll('input[name="country"]')
    countryInputs.forEach((input) => {
      const datalistId = input.id + '-list'
      input.setAttribute('list', datalistId)

      let datalist = document.getElementById(datalistId)
      if (!datalist) {
        datalist = document.createElement('datalist')
        datalist.id = datalistId
        document.body.appendChild(datalist)
      }

      datalist.innerHTML = countries
        .map((c) => `<option value="${c.name}" data-code="${c.code}"></option>`)
        .join('')

      // Обработчик выбора страны
      input.addEventListener('change', () => {
        const selected = countries.find((c) => c.name === input.value)
        if (selected) {
          input.value = selected.code
        }
      })
    })

    // Классы

    const classInputs = document.querySelectorAll('input[name="class"]')
    classInputs.forEach((input) => {
      const datalistId = input.id + '-list'
      input.setAttribute('list', datalistId)

      let datalist = document.getElementById(datalistId)
      if (!datalist) {
        datalist = document.createElement('datalist')
        datalist.id = datalistId
        document.body.appendChild(datalist)
      }

      datalist.innerHTML = Object.keys(classMap)
        .map((num) => `<option value="${num}"></option>`)
        .join('')

      // Обработчик выбора класса
      input.addEventListener('change', () => {
        const selected = classMap[input.value]
        if (selected) {
          input.value = selected
        }
      })
    })
  } catch (err) {
    console.error('Ошибка загрузки стран или классов:', err)
  }
}
