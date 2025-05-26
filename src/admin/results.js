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
      await loadAssignments()
      setupAssignmentFilters()
      await populateCountryFilter()
      await populateOlympiadFilter()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }

  const uploadInput = document.getElementById('upload-xlsx')
  const uploadButton = document.getElementById('upload-button')

  if (uploadButton && uploadInput) {
    uploadButton.addEventListener('click', () => {
      uploadInput.click()
    })

    uploadInput.addEventListener('change', async (event) => {
      const file = event.target.files[0]
      if (!file) return

      const formData = new FormData()
      formData.append('file', file)

      const token = localStorage.getItem('access_token')
      if (!token) {
        alert('Токен не найден. Пожалуйста, войдите заново.')
        return
      }

      try {
        const response = await fetch('https://portal.gradients.academy/results/dashboard/results/import/', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Ошибка загрузки: ${response.status} — ${errorText}`)
        }

        alert('Файл успешно загружен!')
        await loadAssignments() // обновить таблицу после импорта
      } catch (err) {
        console.error('Ошибка при загрузке файла:', err)
        alert('Ошибка при загрузке файла. Проверьте формат и попробуйте снова.')
      }
    })
  }

  const publishButton = document.getElementById('publish-button')

if (publishButton) {
  publishButton.addEventListener('click', async () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      alert('Токен не найден. Пожалуйста, войдите заново.')
      return
    }

    // Собираем все ID из отфильтрованных данных
    const ids = allAssignments.map(item => item.id)

    console.log('Ids',ids)

    if (ids.length === 0) {
      alert('Нет данных для публикации.')
      return
    }

    try {
      const response = await authorizedFetch('https://portal.gradients.academy/results/dashboard/results/publish/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ошибка публикации: ${response.status} — ${errorText}`)
      }

      alert('Результаты успешно опубликованы!')
      await loadAssignments()
    } catch (err) {
      console.error('Ошибка при публикации:', err)
      alert('Ошибка при публикации результатов.')
    }
  })
}

})

let allAssignments = []
let currentAssignmentPage = 1
const assignmentPageSize = 20
let totalAssignmentCount = 0
let resultIdToDelete = null
let resultBeingEditedId = null

const classMap = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eights',
  9: 'nines',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
}

let assignmentFilters = {
  search: '',
  country: '',
  grade: '',
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
  if (assignmentFilters.country) params.append('country', assignmentFilters.country)
  if (assignmentFilters.grade) {
      const gradeKey = assignmentFilters.grade
      const gradeValue = classMap[gradeKey]
      if (gradeValue) {
        params.append('grade', gradeValue)
      }
  }
  if (assignmentFilters.olympiad) {
    params.append('olympiad', assignmentFilters.olympiad)
  }


  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/results/dashboard/results/?${params.toString()}`,
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
    document.getElementById('total-results-count').textContent =
      totalAssignmentCount
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('results-tbody').innerHTML = `
      <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
    `
  }
}


function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('results-tbody')
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
        <td>${task.rank}</td>
        <td>${task.participant_name}</td>
        <td>${task.country}</td>
        <td>${Object.keys(classMap).find(key => classMap[key] === task.grade) || task.grade}</td>
        <td>${task.score}</td>
        <td>${task.result}</td>
        <td>
          <div class="flex justify-between gap-2 *:cursor-pointer">
            <button onclick="openDeleteModal('${task.title}', ${task.id})" class="text-gray-400 hover:text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button onclick="handleEditClick(this)" data-task="${encodedTask}"  class="text-gray-400 hover:text-blue-primary">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
              <!-- Загрузить -->
              <button onclick="handleSinglePublish(${task.id})" class="text-gray-400 hover:text-green-500">
                <!-- Upload icon -->
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 12l-4-4m0 0l-4 4m4-4v12" />
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

  document.getElementById('total-results-count').textContent =
    filteredAssignments.length
  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}


function applyAssignmentFilters() {
  assignmentFilters.search =
    document.getElementById('search-participant')?.value.trim() || ''
  assignmentFilters.country = document.getElementById('filter-country')?.value || ''
  assignmentFilters.grade = document.getElementById('filter-grade')?.value || ''
  assignmentFilters.olympiad = document.getElementById('filter-olympiad')?.value || ''

  loadOlympiadSummary(assignmentFilters.olympiad)

  loadAssignments(1) // всегда загружаем первую страницу при изменении фильтров
}


function setupAssignmentFilters() {
  document
    .getElementById('search-participant')
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
}


async function populateCountryFilter() {
  try {
    const response = await authorizedFetch('https://portal.gradients.academy/common/countries/?page=1&page_size=500')
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


async function populateOlympiadFilter() {
  try {
    const response = await authorizedFetch('https://portal.gradients.academy/olympiads/dashboard/')
    if (!response.ok) throw new Error('Ошибка загрузки олимпиад')

    const data = await response.json()
    const select = document.getElementById('filter-olympiad')

    data.results.forEach((olympiad) => {
      const option = document.createElement('option')
      option.value = olympiad.id // используем ID для фильтрации
      option.textContent = olympiad.title // отображаем название
      select.appendChild(option)
    })
  } catch (err) {
    console.error('Не удалось загрузить список олимпиад:', err)
  }
}


async function loadOlympiadSummary(olympiadId) {
  if (!olympiadId) {
    // Очистить карточки, если ничего не выбрано
    document.getElementById('summary-title').textContent = ''
    document.getElementById('summary-period').textContent = ''
    document.getElementById('summary-participants').textContent = ''
    document.getElementById('summary-average').textContent = ''
    return
  }

  try {
    const response = await authorizedFetch(`https://portal.gradients.academy/results/dashboard/results/summary/?olympiad=${olympiadId}`)
    if (!response.ok) throw new Error('Ошибка загрузки сводки')

    const data = await response.json()

    document.getElementById('summary-title').textContent = data.olympiad.title
    document.getElementById('summary-period').textContent = `с ${data.period.start} до ${data.period.end}`
    document.getElementById('summary-participants').textContent = data.participant_count
    document.getElementById('summary-average').textContent = data.average_score
  } catch (err) {
    console.error('Ошибка при загрузке сводной информации:', err)
  }
}


async function exportTableToExcel() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  const allData = []
  let page = 1
  let totalPages = 1

  const params = new URLSearchParams()
  if (assignmentFilters.search) params.append('search', assignmentFilters.search)
  if (assignmentFilters.country) params.append('country', assignmentFilters.country)
  if (assignmentFilters.grade) params.append('grade', classMap[assignmentFilters.grade])
  if (assignmentFilters.olympiad) params.append('olympiad', assignmentFilters.olympiad)

  try {
    do {
      const response = await authorizedFetch(
        `https://portal.gradients.academy/results/dashboard/results/?page=${page}&${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) throw new Error(`Ошибка загрузки: ${response.status}`)

      const data = await response.json()
      allData.push(...data.results)

      const pageSize = 20
      totalPages = Math.ceil(data.count / pageSize)
      page++
    } while (page <= totalPages)

    if (allData.length === 0) {
      alert('Нет данных для экспорта.')
      return
    }

    const worksheetData = [
      ['id', 'participant_id', 'rank', 'participant_name', 'country', 'grade', 'score', 'total_tasks', 'solved_tasks', 'olympiad_id'],
      ...allData.map(item => [
        item.id,
        item.participant_id,
        item.rank,
        item.participant_name,
        item.country,
        Object.keys(classMap).find(key => classMap[key] === item.grade) || item.grade,
        item.score,
        item.result.split("/")[1],
        item.result.split("/")[0],
        item.olympiad_id
      ])
    ]

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results')

    XLSX.writeFile(workbook, 'results.xlsx')
  } catch (err) {
    console.error('Ошибка при экспорте:', err)
    alert('Произошла ошибка при экспорте данных.')
  }
}


async function handleSinglePublish(id) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await authorizedFetch('https://portal.gradients.academy/results/dashboard/results/publish/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: [id] }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ошибка публикации: ${response.status} — ${errorText}`)
    }

    alert(`Результат с ID ${id} успешно опубликован!`)
    await loadAssignments()
  } catch (err) {
    console.error('Ошибка при публикации:', err)
    alert('Ошибка при публикации результата.')
  }
}


function handleEditClick(button) {
  populateOlympiadSelectInModal();
  populateClassSelectInModal();
  populateCountrySelectInModal();
  const task = JSON.parse(decodeURIComponent(button.dataset.task));
  resultBeingEditedId = task.id;

  document.getElementById('fio').value = task.participant_name || '';
  document.getElementById('olympiad').value = task.olympiad || '';
  document.getElementById('grades').value = task.grade || '';
  document.getElementById('country').value = task.country || '';
  document.getElementById('solved_task').value = task.result.split("/")[0] || '';
  document.getElementById('total_task').value = task.result.split("/")[1] || '';
  document.getElementById('score').value = task.score || '';

  toggleModal('modalEdit', true);
}


document.getElementById('save-edit-button').addEventListener('click', async () => {
  const token = localStorage.getItem('access_token');
  if (!token || !resultBeingEditedId) return;

  const full_name_ru = document.getElementById('fio').value;
  const olympiad = document.getElementById('olympiad').value;
  const grade = document.getElementById('grades').value;
  const country = document.getElementById('country').value;
  const solved_tasks = document.getElementById('solved_task').value;
  const total_tasks = document.getElementById('total_task').value;
  const score = document.getElementById('score').value;

  const body = {
    full_name_ru,
    olympiad,
    grade,
    country,
    solved_tasks,
    total_tasks,
    score,
  };
   console.log('BODY', body)
  try {
    const response = await fetch(`https://portal.gradients.academy/results/dashboard/results/${resultBeingEditedId}/`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ошибка: ${response.status} — ${errorText}`);
    }

    alert('Результат успешно обновлён!');
    toggleModal('modalEdit', false);
    await loadAssignments(); // Или другую нужную функцию загрузки
  } catch (err) {
    console.error('Ошибка при сохранении:', err);
    alert('Ошибка при сохранении результата.');
  }
});


async function populateOlympiadSelectInModal() {
  try {
    const response = await authorizedFetch('https://portal.gradients.academy/olympiads/dashboard/');
    if (!response.ok) throw new Error('Ошибка загрузки олимпиад');

    const data = await response.json();
    const select = document.getElementById('olympiad');

    // Очистить старые опции
    select.innerHTML = '<option value="">Выберите олимпиаду</option>';

    data.results.forEach((olympiad) => {
      const option = document.createElement('option');
      option.value = olympiad.id;
      option.textContent = olympiad.title;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Не удалось загрузить олимпиады для модального окна:', err);
  }
}


function populateClassSelectInModal() {
  const select = document.getElementById('grades');
  if (!select) return;

  select.innerHTML = '<option value="">Выберите класс</option>';

  Object.entries(classMap).forEach(([key, value]) => {
    const option = document.createElement('option');
    option.value = value;         // значение отправляется на сервер
    option.textContent = `${key} класс`; // отображается пользователю
    select.appendChild(option);
  });
}


async function populateCountrySelectInModal() {
  try {
    const response = await authorizedFetch('https://portal.gradients.academy/common/countries/?page=1&page_size=500')
    if (!response.ok) throw new Error('Ошибка загрузки стран')

    const data = await response.json()
    const select = document.getElementById('country') // id внутри модального окна

    if (!select) return;

    select.innerHTML = '<option value="">Выберите страну</option>';

    data.results.forEach((country) => {
      const option = document.createElement('option');
      option.value = country.code;         // value — код страны (например, 'KZ')
      option.textContent = country.name;   // текст — читаемое название
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Не удалось загрузить список стран:', err);
  }
}


function openDeleteModal(title, id) {
  resultIdToDelete = id;
  toggleModal('modalDel', true);
}