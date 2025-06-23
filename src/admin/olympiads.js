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

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user)

  try {
    await loadOlympiads()

    let sortAscending = true

    const sortHeader = document.getElementById('sort-year-header')
    const sortHeader2 = document.getElementById('sort-id-header')
    const sortHeader3 = document.getElementById('sort-tour-header')
    const sortHeader4 = document.getElementById('sort-participant-header')
    if (sortHeader) {
    sortHeader.addEventListener('click', () => {
      allOlympiads.sort((a, b) => {
        const A = a.year
        const B = b.year
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedTable()
    })}

        if (sortHeader2) {
    sortHeader2.addEventListener('click', () => {
      allOlympiads.sort((a, b) => {
        const A = a.id
        const B = b.id
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedTable()
    })}


    let sortDescriptionAsc = true

            if (sortHeader3) {
    sortHeader3.addEventListener('click', () => {
      allOlympiads.sort((a, b) => {
        const descA = a.type.toLowerCase()
        const descB = b.type.toLowerCase()
        return sortDescriptionAsc ? descA.localeCompare(descB) : descB.localeCompare(descA)

      })
      sortDescriptionAsc = !sortDescriptionAsc
      renderPaginatedTable()
    })}

            if (sortHeader4) {
    sortHeader4.addEventListener('click', () => {
      allOlympiads.sort((a, b) => {
        const A = a.participant_count
        const B = b.participant_count
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedTable()
    })}

  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})

async function loadOlympiads() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await authorizedFetch(
      'https://portal.gradients.academy/olympiads/dashboard/',
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
    console.log(data.results) // <-- Вставь здесь для проверки данных
    renderOlympiadTable(data.results)
    allOlympiads = data.results
    filteredOlympiads = allOlympiads
    renderPaginatedTable()
    setupFilters()
  } catch (err) {
    console.error('Ошибка при загрузке олимпиад:', err)
    document.getElementById('olympiads-tbody').innerHTML = `
      <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
    `
  }
}

function renderOlympiadTable(olympiads) {
  const tbody = document.getElementById('olympiads-tbody')
  if (!tbody) return

  tbody.innerHTML =
    olympiads.length === 0
      ? `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td></tr>`
      : olympiads
          .map(
            (ol) => `
      <tr class="hover:bg-gray-50">
        <td>${ol.id}</td>
        <td>${ol.title}</td>
        <td>${getSeasonLabel(ol.type)}</td>
        <td>${ol.grades.join(', ')}</td>
        <td>${ol.year}</td>
        <td>${ol.participant_count}</td>
        <td>
          <span class="card ${getStatusClass(ol.status)}">${getStatusLabel(ol.status)}</span>
        </td>
        <td>
          <div class="flex justify-between gap-2 *:cursor-pointer">
            <button onclick="openDeleteModal('${ol.title}', ${ol.id})" class="text-gray-400 hover:text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button onclick="openEditModal('${ol.title}', ${ol.id})" class="text-gray-400 hover:text-blue-primary">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `
          )
          .join('')
}

function getSeasonLabel(type) {
  const map = {
    spring: '🌸 Весна',
    summer: '🌍 Лето',
    autumn: '🍂 Осень',
    winter: '❄️ Зима',
  }
  return map[type] || type
}

function getStatusLabel(status) {
  const map = {
    ongoing: 'Идёт сейчас',
    finished: 'Завершено',
    upcoming: 'Скоро',
  }
  return map[status] || status
}

function getStatusClass(status) {
  const map = {
    ongoing: 'ongoing',
    finished: 'finished',
    upcoming: 'upcoming',
  }
  return map[status] || ''
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

let allOlympiads = []

function setupFilters() {
  document
    .getElementById('search-olympiads')
    .addEventListener('input', applyFilters)
  document
    .getElementById('filter-class')
    .addEventListener('change', applyFilters)
  document
    .getElementById('filter-status')
    .addEventListener('change', applyFilters)
}

function applyFilters() {
  const search = document.getElementById('search-olympiads').value.toLowerCase()
  const selectedClass = document.getElementById('filter-class').value
  const selectedStatus = document.getElementById('filter-status').value

  filteredOlympiads = allOlympiads.filter((ol) => {
    const matchesSearch =
      ol.title.toLowerCase().includes(search) || String(ol.id).includes(search)
    const matchesClass = selectedClass
      ? ol.grades.includes(Number(selectedClass))
      : true
    const matchesStatus = selectedStatus ? ol.status === selectedStatus : true
    return matchesSearch && matchesClass && matchesStatus
  })

  currentPage = 1
  renderPaginatedTable()
}

let currentPage = 1
const pageSize = 10

function renderPaginatedTable() {
  const start = (currentPage - 1) * pageSize
  const end = start + pageSize
  const pageData = filteredOlympiads.slice(start, end)

  document.getElementById('total-olympiad-count').textContent =
    filteredOlympiads.length

  renderOlympiadTable(pageData)
  renderPagination()
}

function renderPagination() {
  const container = document.querySelector('.pagination')
  if (!container) return

  const totalPages = Math.max(1, Math.ceil(filteredOlympiads.length / pageSize)) // 👈 гарантирует минимум 1

  let buttons = ''

  for (let i = 1; i <= totalPages; i++) {
    buttons += `
      <button class="${i === currentPage ? 'text-orange-primary border-orange-primary border' : 'text-gray-600'} px-3 py-1 rounded"
        onclick="goToPage(${i})">${i}</button>
    `
  }

  container.innerHTML = `
    <div class="flex items-center gap-1">
      <button onclick="goToPage(${Math.max(1, currentPage - 1)})" class="px-3 py-1">←</button>
      ${buttons}
      <button onclick="goToPage(${Math.min(totalPages, currentPage + 1)})" class="px-3 py-1">→</button>
    </div>
  `
}

function goToPage(page) {
  currentPage = page
  renderPaginatedTable()
}

function openDeleteModal(title, id) {
  olympiadIdToDelete = id

  const modal = document.getElementById('modalDel')
  const overlay = document.getElementById('overlayModal')
  const nameSpan = document.getElementById('olympiad-name-to-delete')

  if (nameSpan) {
    nameSpan.textContent = `"${title}"`
  }

  modal.classList.remove('hidden')
  overlay.classList.remove('hidden')
}

let olympiadIdToDelete = null

async function deleteOlympiad() {
  if (!olympiadIdToDelete) return

  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  const olympiad = allOlympiads.find((ol) => ol.id === olympiadIdToDelete)
  if (olympiad?.status === 'finished') {
    alert('Нельзя удалить завершённую олимпиаду.')
    return
  }

  try {
    const response = await fetch(
      `https://portal.gradients.academy/olympiads/dashboard/${olympiadIdToDelete}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Ошибка удаления: ${response.status}`)
    }

    // Удаляем из массива и обновляем таблицу
    allOlympiads = allOlympiads.filter((ol) => ol.id !== olympiadIdToDelete)
    applyFilters() // обновит filteredOlympiads и таблицу

    closeModal('modalDel')
    closeModal('modalEdit')
  } catch (err) {
    alert(`Ошибка при удалении олимпиады: ${err.message}`)
  }
}

function closeModal(id) {
  const modal = document.getElementById(id)
  const overlay = document.getElementById('overlayModal')

  if (modal) modal.classList.add('hidden')
  if (overlay) overlay.classList.add('hidden')
}

async function openEditModal(title, id) {
  olympiadIdToDelete = id
  const modal = document.getElementById('modalEdit')
  const overlay = document.getElementById('overlayModal')

  try {
    const token = localStorage.getItem('access_token')
    const response = await fetch(`https://portal.gradients.academy/olympiads/dashboard/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Ошибка загрузки олимпиады: ${response.status}`)
    }

    const data = await response.json()

    // Заполнение основных полей
    document.getElementById('name-edit').value = data.title
    document.getElementById('tour-edit').value = {
      spring: 'Весна',
      summer: 'Лето',
      autumn: 'Осень',
      winter: 'Зима',
    }[data.type] || 'Весна'
    document.getElementById('year-edit').value = data.year
    document.getElementById('status-edit').value = data.status
    document.getElementById('link-edit').value = data.website || ''
    document.getElementById('price').value = data.cost || ''
    document.getElementById('disc-edit').value = data.description || ''

    // Классы
    const gradesSelect = document.getElementById('grades-edit')
    Array.from(gradesSelect.options).forEach(option => {
      option.selected = data.grades.includes(parseInt(option.value))
    })

    const stageTemplate = document.getElementById('stage-template-edit')
    const stageContainer = stageTemplate.parentElement
    const addButton = stageContainer.querySelector('.btn-white')

    // Удаляем все клоны, кроме шаблона
    stageContainer.querySelectorAll('.grid:not(#stage-template-edit)').forEach(el => el.remove())

    if (data.stages.length > 0) {
      stageTemplate.classList.add('hidden') // скрываем шаблон

      data.stages.forEach(stage => {
        const clone = stageTemplate.cloneNode(true)
        clone.removeAttribute('id')
        clone.classList.remove('hidden')
        clone.querySelector('.step-name-add').value = stage.name
        clone.querySelector('.date-range-add').value = `${formatDateReverse(stage.start_date)} — ${formatDateReverse(stage.end_date)}`
        stageContainer.insertBefore(clone, stageTemplate.nextSibling)
        flatpickr(clone.querySelector('.date-range-add'), {
          mode: 'range',
          dateFormat: 'd.m.Y',
          locale: flatpickr.l10ns.ru,
        })
      })
    } else {
      stageTemplate.classList.remove('hidden') // показываем пустой, если этапов нет
    }


    // Сертификат
    if (data.certificate_template) {
      document.getElementById('title_certificate-add').value = data.certificate_template.header_text || ''
      document.getElementById('sign-add').value = data.certificate_template.signature_1 || ''
      // Если есть вторая подпись — можно добавить отдельное поле
    }

    modal.classList.remove('hidden')
    overlay.classList.remove('hidden')
  } catch (err) {
    alert(`Ошибка при загрузке олимпиады: ${err.message}`)
  }
}

function formatDateReverse(dateStr) {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}





async function submitOlympiadForm() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  const formData = new FormData()

  // 📌 Общие поля
  const title = document.getElementById('title-add')?.value
  const status = document.getElementById('status-add')?.value
  const typeLabel = document.getElementById('tour-add')?.value
  const typeMap = {
    Весна: 'spring',
    Осень: 'autumn',
    Зима: 'winter',
    Лето: 'summer',
  }

  const type = typeMap[typeLabel] || 'spring'
  const year = document.getElementById('year-add')?.value
  const cost = document.getElementById('price')?.value

  // 📌 Классы
  const gradesSelect = document.getElementById('grades-add')
  const grades = Array.from(gradesSelect.selectedOptions).map((opt) =>
    parseInt(opt.value)
  )
  if (grades.length === 0) {
    alert('Выберите хотя бы один класс')
    return
  }

  // 📌 Этапы
  const stepNames = document.querySelectorAll('.step-name-add')
    const dateRanges = document.querySelectorAll('.date-range-add')
    const stages = []

    for (let i = 0; i < stepNames.length; i++) {
      const range = dateRanges[i]?.value.split(' — ')
      if (stepNames[i].value && range && range.length === 2 && range[0] && range[1]) {
        stages.push({
          name: stepNames[i].value,
          start_date: formatDate(range[0]),
          end_date: formatDate(range[1]),
        })
      }
    }

  console.log('✅ Сформированные stages:', stages)


  // 📌 Сертификат
  const headerText = document.getElementById('title_certificate-add')?.value
  const signature1 = document.getElementById('sign-add')?.value.trim()
  const signature2 = document.getElementById('sign-add')?.value.trim()
  const background = document.getElementById('certificate-background')?.files[0]

  if (!background) {
    alert('Пожалуйста, загрузите фон сертификата.')
    return
  }

  // 🧩 Собираем все поля
  formData.append('title', title)
  formData.append('type', type)
  formData.append('status', status)
  formData.append('year', year)
  formData.append('cost', cost)
  grades.forEach((g) => formData.append('grades', g))
  stages.forEach((stage, index) => {
    formData.append(`stages[${index}].name`, stage.name)
    formData.append(`stages[${index}].start_date`, stage.start_date)
    formData.append(`stages[${index}].end_date`, stage.end_date)
  })

  //  formData.append('certificate_template', JSON.stringify({
  //    header_text: headerText,
  //    signature_1: signature1,
  //    signature_2: signature2
  //  }));
  //
  //  formData.append('certificate_template.background', background);
  formData.append('certificate_template.header_text', headerText)
  formData.append('certificate_template.signature_1', signature1)
  formData.append('certificate_template.signature_2', signature2)
  formData.append('certificate_template.background', background)

  console.log('------ FORM DATA ------')
  for (let pair of formData.entries()) {
    console.log(`${pair[0]}:`, pair[1])
  }

  try {
    const res = await fetch(
      'https://portal.gradients.academy/olympiads/dashboard/',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // Content-Type НЕ указывать вручную — FormData сам выставит
        },
        body: formData,
      }
    )

    if (!res.ok) {
      const error = await res.json()
      throw new Error(JSON.stringify(error))
    }

    alert('Олимпиада успешно добавлена!')
    toggleModal('modalAdd', false)
    await loadOlympiads() // если у тебя есть функция загрузки
  } catch (err) {
    console.error('Ошибка при создании олимпиады:', err)
    alert(`Ошибка: ${err.message}`)
  }
}

function formatDate(dateStr) {
  const [d, m, y] = dateStr.split('.')
  return `${y}-${m}-${d}`
}


function addStageBlock() {
  const template = document.getElementById('stage-template')
  if (!template) {
    console.error('Шаблон этапа не найден!')
    return
  }


  const clone = template.cloneNode(true)
  clone.removeAttribute('id') // чтобы не было дубликатов ID
  // Очистка значений
  clone.querySelectorAll('select, input').forEach(el => el.value = '')

  // Добавление в контейнер
  template.parentElement.insertBefore(clone, template.nextSibling)

  // Инициализация flatpickr
  flatpickr(clone.querySelector('.date-range-add'), {
    mode: 'range',
    dateFormat: 'd.m.Y',
    locale: flatpickr.l10ns.ru,
  })
}


function addStageBlockEdit() {
  const template = document.getElementById('stage-template-edit')
  if (!template) {
    console.error('Шаблон этапа не найден!')
    return
  }


  const clone = template.cloneNode(true)
  clone.removeAttribute('id') // чтобы не было дубликатов ID
  // Очистка значений
  clone.querySelectorAll('select, input').forEach(el => el.value = '')

  // Добавление в контейнер
  template.parentElement.insertBefore(clone, template.nextSibling)

  // Инициализация flatpickr
  flatpickr(clone.querySelector('.date-range-add'), {
    mode: 'range',
    dateFormat: 'd.m.Y',
    locale: flatpickr.l10ns.ru,
  })
}

document.querySelector('#modalAdd .btn-white').addEventListener('click', addStageBlock)
document.querySelector('#modalEdit .btn-white').addEventListener('click', addStageBlockEdit)


document
  .getElementById('certificate-background-edit')
  .addEventListener('change', function () {
    const file = this.files[0]
    const display = document.getElementById('file-name-edit')

    if (file) {
      const name = file.name
      const sizeKB = (file.size / 1024).toFixed(0) + ' KB'

      display.innerHTML = `
        <span class="text-orange-primary flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          ${name} (${sizeKB})
        </span>
      `
    } else {
      display.textContent = ''
    }
  })


async function updateOlympiadForm() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  const formData = new FormData()
  const title = document.getElementById('name-edit')?.value
  const status = document.getElementById('status-edit')?.value
  const typeLabel = document.getElementById('tour-edit')?.value
  const typeMap = {
    Весна: 'spring',
    Осень: 'autumn',
    Зима: 'winter',
    Лето: 'summer',
  }
  const type = typeMap[typeLabel] || 'spring'
  const year = document.getElementById('year-edit')?.value
  const cost = document.getElementById('price')?.value
  const link = document.getElementById('link-edit')?.value
  const description = document.getElementById('disc-edit')?.value

  const gradesSelect = document.getElementById('grades-edit')
  const grades = Array.from(gradesSelect.selectedOptions).map(opt => parseInt(opt.value))
  if (grades.length === 0) {
    alert('Выберите хотя бы один класс')
    return
  }

  const stepNames = document.querySelectorAll('#modalEdit .step-name-add')
  const dateRanges = document.querySelectorAll('#modalEdit .date-range-add')
  const stages = []
  for (let i = 0; i < stepNames.length; i++) {
    const range = dateRanges[i]?.value.split(' — ')
    if (stepNames[i].value && range && range.length === 2 && range[0] && range[1]) {
      stages.push({
        name: stepNames[i].value,
        start_date: formatDate(range[0]),
        end_date: formatDate(range[1]),
      })
    }
  }

  const headerText = document.getElementById('title_certificate-add')?.value
  const signature1 = document.getElementById('sign-edit1')?.value.trim()
  const signature2 = document.getElementById('sign-edit2')?.value.trim()
  const background = document.getElementById('certificate-background-edit')?.files[0]

  formData.append('title', title)
  formData.append('type', type)
  formData.append('status', status)
  formData.append('year', year)
  formData.append('cost', cost)
  formData.append('website', link)
  formData.append('description', description)
  grades.forEach(g => formData.append('grades', g))
  stages.forEach((stage, index) => {
    formData.append(`stages[${index}].name`, stage.name)
    formData.append(`stages[${index}].start_date`, stage.start_date)
    formData.append(`stages[${index}].end_date`, stage.end_date)
  })
  formData.append('certificate_template.header_text', headerText)
  formData.append('certificate_template.signature_1', signature1)
  formData.append('certificate_template.signature_2', signature2)
  if (background) {
    formData.append('certificate_template.background', background)
  }

  try {
    const res = await fetch(`https://portal.gradients.academy/olympiads/dashboard/${olympiadIdToDelete}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(JSON.stringify(error))
    }
    alert('Олимпиада успешно обновлена!')
    toggleModal('modalEdit', false)
    await loadOlympiads()
  } catch (err) {
    console.error('Ошибка при обновлении олимпиады:', err)
    alert(`Ошибка: ${err.message}`)
  }
}