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
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})

let allAssignments = []
let currentAssignmentPage = 1
const assignmentPageSize = 20
let totalAssignmentCount = 0
let taskIdToDelete = null
let taskBeingEditedId = null

let assignmentFilters = {
  search: '',
  grade: '',
  level: '',
  type: '',
  status: '',
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
  if (assignmentFilters.grade) params.append('grade', assignmentFilters.grade)
  if (assignmentFilters.level) params.append('level', assignmentFilters.level)
  if (assignmentFilters.type) params.append('type', assignmentFilters.type)
  if (assignmentFilters.status)
    params.append('status', assignmentFilters.status)

  try {
    const response = await fetch(
      `https://portal.gradients.academy/assignments/dashboard/?${params.toString()}`,
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
    document.getElementById('total-assignments-count').textContent =
      totalAssignmentCount
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('assignments-tbody').innerHTML = `
      <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
    `
  }
}

function getTaskStatusLabel(status) {
  const map = {
    draft: 'Черновик',
    active: 'Активно',
    archived: 'Архив',
    pending: 'Ожидает публикации',
  }
  return map[status] || status
}

function getStatusClass(status) {
  const map = {
    draft: 'bg-purple-100 text-purple-800', // Фиолетовый для Черновик
    active: 'bg-green-100 text-green-800', // Зелёный для Активно
    archived: 'bg-gray-200 text-gray-600', // Серый для Архив
    pending: 'bg-blue-100 text-blue-800', // Синий для Ожидает публикации
  }
  return map[status] || ''
}

function getTaskTypeLabel(type) {
  const map = {
    daily: 'Задача дня',
    preparatory: 'Подготовительная',
  }
  return map[type] || type
}

function getTaskLevelLabel(level) {
  const map = {
    easy: 'Легкий',
    medium: 'Средний',
    hard: 'Сложный',
  }
  return map[level] || level
}

function getLevelClass(status) {
  const map = {
    easy: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    hard: 'bg-red-200 text-red-600',
  }
  return map[status] || ''
}

function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('assignments-tbody')
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
        <td>${task.title}</td>
        <td>${task.grade}</td>
        <td>${task.deadline || ''}</td>
        <td><span class="card ${getLevelClass(task.level)}">${getTaskLevelLabel(task.level)}</span></td>
        <td><span>${getTaskTypeLabel(task.type)}</span></td>
        <td><span class="card ${getStatusClass(task.status)}">${getTaskStatusLabel(task.status)}</span></td>
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

  document.getElementById('total-assignments-count').textContent =
    filteredAssignments.length
  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}

function applyAssignmentFilters() {
  assignmentFilters.search =
    document.getElementById('search-assignments')?.value.trim() || ''
  assignmentFilters.grade = document.getElementById('filter-class')?.value || ''
  assignmentFilters.level = document.getElementById('filter-level')?.value || ''
  assignmentFilters.type = document.getElementById('filter-type')?.value || ''
  assignmentFilters.status =
    document.getElementById('filter-status')?.value || ''
console.log('Фильтры применены:', assignmentFilters)
  loadAssignments(1) // всегда загружаем первую страницу при изменении фильтров
}

function setupAssignmentFilters() {
  document
    .getElementById('search-assignments')
    ?.addEventListener('input', applyAssignmentFilters)
  document
    .getElementById('filter-class')
    ?.addEventListener('change', applyAssignmentFilters)
  document
    .getElementById('filter-level')
    ?.addEventListener('change', applyAssignmentFilters)
  document
    .getElementById('filter-type')
    ?.addEventListener('change', applyAssignmentFilters)
  document
    .getElementById('filter-status')
    ?.addEventListener('change', applyAssignmentFilters)
}

function openDeleteModal(taskTitle, taskId) {
  taskIdToDelete = taskId

  const modal = document.getElementById('modalDel')
  const textBlock = modal.querySelector('.modal-task-title')

  if (textBlock) {
    textBlock.textContent = `Вы точно уверены, что хотите удалить задачу "${taskTitle}"?`
  }

  toggleModal('modalDel')
}

async function deleteTask() {
  if (!taskIdToDelete) return

  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await fetch(
      `https://portal.gradients.academy/assignments/dashboard/${taskIdToDelete}/`,
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

    toggleModal('modalDel')
    await loadAssignments(currentAssignmentPage)
  } catch (err) {
    console.error('Ошибка при удалении задачи:', err)
    alert('Не удалось удалить задачу.')
  }
}

async function submitNewTask() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  const activeForm = document.querySelector('.role-form:not(.hidden)')
  if (!activeForm) {
    alert('Форма не выбрана.')
    return
  }

  const type =
    document.querySelector('input[name="role"]:checked')?.value ===
    'representative'
      ? 'daily'
      : 'preparatory'

  const title = activeForm.querySelector('input[type="text"]')?.value.trim()
  const grade = activeForm.querySelector('select[id^="grade"]')?.value
  const level = activeForm.querySelector('select[id^="level"]')?.value
  const points = activeForm.querySelector('select[id^="points"]')?.value
  const status = activeForm.querySelector('select[id^="status"]')?.value
  const description = activeForm.querySelector('textarea')?.value.trim()
  const answerType =
    activeForm.querySelector('input[name="answer-type"]:checked')?.value ||
    'number'
  const correctAnswer = activeForm
    .querySelector('input[name="answer"]')
    ?.value.trim()

  if (
    !title ||
    !grade ||
    !level ||
    !points ||
    !status ||
    !description ||
    !correctAnswer
  ) {
    alert('Пожалуйста, заполните все обязательные поля.')
    return
  }

  const taskData = {
    type,
    title,
    grade,
    level,
    points,
    description,
    answer_type: answerType,
    correct_answer: correctAnswer,
    status,
  }

  console.log('taskData:', taskData)

  try {
    const response = await fetch(
      'https://portal.gradients.academy/assignments/dashboard/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(taskData),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(
        errorData.detail || `Ошибка при добавлении задачи: ${response.status}`
      )
    }

    toggleModal('modalAdd')
    await loadAssignments(1)
  } catch (err) {
    console.error('Ошибка при добавлении задачи:', err)
    alert(`Не удалось добавить задачу: ${err.message}`)
  }
}

function openEditModal(task) {
  const isRepresentative = task.type === 'daily'
  const type = isRepresentative ? 'representative' : 'participant'

  taskBeingEditedId = task.id // <— сохраняем ID задачи

  document
    .querySelectorAll('#modalEdit .role-form')
    .forEach((form) => form.classList.add('hidden'))
  document.getElementById(`${type}-form2`).classList.remove('hidden')

  document
    .querySelectorAll('#modalEdit input[name="role"]')
    .forEach((input) => {
      input.checked = input.value === type
    })

  document.getElementById(`title-edit-${type}`).value = task.title || ''
  document.getElementById(`grade-edit-${type}`).value = task.grade || ''
  document.getElementById(`level-edit-${type}`).value = task.level || ''
  document.getElementById(`points-edit-${type}`).value = task.points || ''
  document.getElementById(`status-edit-${type}`).value = task.status || ''
  document.getElementById(`desc-edit-${type}`).value = task.description || ''
  document.getElementById(`answer-edit-${type}`).value =
    task.correct_answer || ''

  const isText = task.answer_type === 'text'
  document.getElementById(`answer1-type-edit-${type}`).checked = !isText
  document.getElementById(`answer2-type-edit-${type}`).checked = isText

  toggleModal('modalEdit')
}


function handleEditClick(button) {
  try {
    const task = JSON.parse(decodeURIComponent(button.dataset.task))
    openEditModal(task)
  } catch (err) {
    console.error('Ошибка при разборе данных задачи:', err)
    alert('Не удалось открыть задачу для редактирования.')
  }
}

async function submitEditTask() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  if (!taskBeingEditedId) {
    alert('ID задачи для редактирования не найден.')
    return
  }

  const activeForm = document.querySelector(
    '#modalEdit .role-form:not(.hidden)'
  )
  const type = document.querySelector(
    '#modalEdit input[name="role"]:checked'
  )?.value

  const title = activeForm.querySelector('input[type="text"]')?.value.trim()
  const grade = activeForm.querySelector('select[id^="grade"]')?.value
  const level = activeForm.querySelector('select[id^="level"]')?.value
  const points = activeForm.querySelector('select[id^="points"]')?.value
  const status = activeForm.querySelector('select[id^="status"]')?.value
  const description = activeForm.querySelector('textarea')?.value.trim()
  const answerType =
    activeForm.querySelector('input[name="answer-type"]:checked')?.value ||
    'number'
  const correctAnswer = activeForm
    .querySelector('input[name="answer"]')
    ?.value.trim()

  if (
    !title ||
    !grade ||
    !level ||
    !points ||
    !status ||
    !description ||
    !correctAnswer
  ) {
    alert('Пожалуйста, заполните все обязательные поля.')
    return
  }

  const updatedTask = {
    type: type === 'representative' ? 'daily' : 'preparatory',
    title,
    grade,
    level,
    points,
    description,
    answer_type: answerType,
    correct_answer: correctAnswer,
    status,
  }

  console.log('updatedTask', updatedTask)

  try {
    const response = await fetch(
      `https://portal.gradients.academy/assignments/dashboard/${taskBeingEditedId}/`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatedTask),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(
        errorData.detail || `Ошибка сохранения: ${response.status}`
      )
    }

    toggleModal('modalEdit')
    await loadAssignments(currentAssignmentPage)
  } catch (err) {
    console.error('Ошибка при обновлении задачи:', err)
    alert(`Не удалось обновить задачу: ${err.message}`)
  }
}
