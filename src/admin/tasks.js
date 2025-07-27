// main.js

// 1. Проверка аутентификации
async function ensureUserAuthenticated() {
  let userData = localStorage.getItem('user');

  if (!userData) {
    console.warn('user не найден в localStorage. Пробуем обновить access_token...');
    const newAccessToken = await refreshAccessToken();
    console.log('Результат refreshAccessToken:', newAccessToken);

    if (!newAccessToken) {
      console.warn('refreshAccessToken вернул null. Перенаправление на /index.html');
      window.location.href = '/index.html';
      return null;
    }

    userData = localStorage.getItem('user');
    if (!userData) {
      console.warn('user всё ещё не найден после обновления токена. Редирект.');
      window.location.href = '/index.html';
      return null;
    }
  }

  let user;
  try {
    user = JSON.parse(userData);
  } catch (err) {
    console.error('Ошибка парсинга user из localStorage:', err);
    window.location.href = '/index.html';
    return null;
  }

  // Проверяем роль
  const role = user.profile?.role;
  if (role !== 'administrator') {
    console.warn(`Пользователь с ролью "${role}" не имеет доступа к админке. Редирект.`);
    window.location.href = '/index.html';
    return null;
  }

  return user;
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


// 3. Глобальные переменные для заданий
let allAssignments = [];
let currentAssignmentPage = 1;
const assignmentPageSize = 20;
let totalAssignmentCount = 0;
let taskIdToDelete = null;
let taskBeingEditedId = null;

let assignmentFilters = {
  search: '',
  grade: '',
  level: '',
  type: '',
  status: ''
};

// 4. Загрузка заданий с сервера
async function loadAssignments(page = 1) {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }

  const params = new URLSearchParams();
  params.append('page', page);
  if (assignmentFilters.search) params.append('search', assignmentFilters.search);
  if (assignmentFilters.grade) params.append('grade', assignmentFilters.grade);
  if (assignmentFilters.level) params.append('level', assignmentFilters.level);
  if (assignmentFilters.type) params.append('type', assignmentFilters.type);
  if (assignmentFilters.status) params.append('status', assignmentFilters.status);

  try {
    const response = await fetch(
      `https://portal.gradients.academy/api/assignments/dashboard/?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Ошибка загрузки: ${response.status}`);
    }

    const data = await response.json();
    allAssignments = data.results || [];
    totalAssignmentCount = data.count || 0;
    currentAssignmentPage = page;

    renderAssignmentTable(allAssignments);
    renderAssignmentPagination();
    const totalCountEl = document.getElementById('total-assignments-count');
    if (totalCountEl) {
      totalCountEl.textContent = totalAssignmentCount;
    }
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err);
    const tbody = document.getElementById('assignments-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
      `;
    }
  }
}

// Вспомогательные функции для статусов, уровней и т.п.
function getTaskStatusLabel(status) {
  const map = {
    draft: 'Черновик',
    active: 'Активно',
    archived: 'Архив',
    pending: 'Ожидает публикации',
  };
  return map[status] || status;
}

function getStatusClass(status) {
  const map = {
    draft: 'bg-purple-100 text-purple-800',
    active: 'bg-green-100 text-green-800',
    archived: 'bg-gray-200 text-gray-600',
    pending: 'bg-blue-100 text-blue-800',
  };
  return map[status] || '';
}

function getTaskTypeLabel(type) {
  const map = {
    daily: 'Задача дня',
    preparatory: 'Подготовительная',
  };
  return map[type] || type;
}

function getTaskLevelLabel(level) {
  const map = {
    easy: 'Легкий',
    medium: 'Средний',
    hard: 'Сложный',
  };
  return map[level] || level;
}

function getLevelClass(level) {
  const map = {
    easy: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    hard: 'bg-red-200 text-red-600',
  };
  return map[level] || '';
}

// 5. Рендер таблицы заданий
function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('assignments-tbody');
  if (!tbody) return;

  if (!assignments || assignments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td></tr>`;
    return;
  }

  tbody.innerHTML = assignments
    .map((task) => {
      // Кодируем задачу в data-task для редактирования
      const encodedTask = encodeURIComponent(JSON.stringify(task));
      const deadline = task.deadline || '';
      return `
      <tr class="hover:bg-gray-50">
        <td>${task.id}</td>
        <td>${task.title}</td>
        <td>${task.grade}</td>
        <td>${deadline}</td>
        <td><span class="card ${getLevelClass(task.level)}">${getTaskLevelLabel(task.level)}</span></td>
        <td><span>${getTaskTypeLabel(task.type)}</span></td>
        <td><span class="card ${getStatusClass(task.status)}">${getTaskStatusLabel(task.status)}</span></td>
        <td>
          <div class="flex justify-between gap-2">
            <button onclick="openDeleteModal('${task.title.replace(/'/g, "\\'")}', ${task.id})" class="text-gray-400 hover:text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button onclick="handleEditClick(this)" data-task="${encodedTask}" class="text-gray-400 hover:text-blue-primary">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
      `;
    })
    .join('');
}

// 6. Пагинация
function renderAssignmentPagination() {
  const container = document.querySelector('.pagination');
  if (!container) return;

  const totalPages = Math.max(1, Math.ceil(totalAssignmentCount / assignmentPageSize));
  let buttonsHtml = '';

  for (let i = 1; i <= totalPages; i++) {
    const activeClass = i === currentAssignmentPage ? 'text-orange-primary border-orange-primary border' : 'text-gray-600';
    buttonsHtml += `
      <button class="${activeClass} px-3 py-1 rounded" onclick="goToAssignmentPage(${i})">${i}</button>
    `;
  }

  container.innerHTML = `
    <div class="flex items-center gap-1">
      <button onclick="goToAssignmentPage(${Math.max(1, currentAssignmentPage - 1)})" class="px-3 py-1">←</button>
      ${buttonsHtml}
      <button onclick="goToAssignmentPage(${Math.min(totalPages, currentAssignmentPage + 1)})" class="px-3 py-1">→</button>
    </div>
  `;
}

function goToAssignmentPage(page) {
  // При необходимости проверить диапазон
  if (page < 1) page = 1;
  loadAssignments(page);
}

// 7. Фильтры
function applyAssignmentFilters() {
  assignmentFilters.search = document.getElementById('search-assignments')?.value.trim() || '';
  assignmentFilters.grade = document.getElementById('filter-class')?.value || '';
  assignmentFilters.level = document.getElementById('filter-level')?.value || '';
  assignmentFilters.type = document.getElementById('filter-type')?.value || '';
  assignmentFilters.status = document.getElementById('filter-status')?.value || '';

  loadAssignments(1);
}

function setupAssignmentFilters() {
  document.getElementById('search-assignments')?.addEventListener('input', applyAssignmentFilters);
  document.getElementById('filter-class')?.addEventListener('change', applyAssignmentFilters);
  document.getElementById('filter-level')?.addEventListener('change', applyAssignmentFilters);
  document.getElementById('filter-type')?.addEventListener('change', applyAssignmentFilters);
  document.getElementById('filter-status')?.addEventListener('change', applyAssignmentFilters);
}

// 8. Удаление задачи: открытие и выполнение
function openDeleteModal(taskTitle, taskId) {
  taskIdToDelete = taskId;
  const modal = document.getElementById('modalDel');
  if (!modal) return;
  const textBlock = modal.querySelector('.modal-task-title');
  if (textBlock) {
    textBlock.textContent = `Вы точно уверены, что хотите удалить задачу "${taskTitle}"?`;
  }
  toggleModal('modalDel');
}

async function deleteTask() {
  if (!taskIdToDelete) return;
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }
  try {
    const response = await fetch(
      `https://portal.gradients.academy/api/assignments/dashboard/${taskIdToDelete}/`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Ошибка удаления: ${response.status}`);
    }
    toggleModal('modalDel');
    await loadAssignments(currentAssignmentPage);
  } catch (err) {
    console.error('Ошибка при удалении задачи:', err);
    alert('Не удалось удалить задачу.');
  }
}

// Глобальный объект для хранения файлов по формам
const attachments = {
  'add-participant': [],
  'edit-participant': []
};
// 9. Добавление новой задачи
async function submitNewTask() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }

  const activeForm = document.getElementById('participant-form');
  if (!activeForm) {
    alert('Форма не выбрана.');
    return;
  }

  // Тип задачи по роли
  const type = document.querySelector('input[name="role"]:checked')?.value === 'representative'
    ? 'daily'
    : 'preparatory';

  // Сбор полей
  const title = activeForm.querySelector('#title-add-participant').value.trim();
  const grade = activeForm.querySelector('select[id^="grade"]')?.value;
  const level = activeForm.querySelector('select[id^="level"]')?.value;
  const points = activeForm.querySelector('select[id^="points"]')?.value;
  const status = activeForm.querySelector('select[id^="status"]')?.value;
  const description = activeForm.querySelector('textarea')?.value.trim();
  const answerType = activeForm.querySelector('input[name="answer-type"]:checked')?.value || 'number';
  const correctAnswer = activeForm.querySelector('input[name="answer"]')?.value.trim();

  // Валидация
  if (!title || !grade || !level || !points || !status || !description || !correctAnswer) {
    alert('Пожалуйста, заполните все обязательные поля.');
    return;
  }

  // Формируем FormData
  const fd = new FormData();
  fd.append('type', type);
  fd.append('title', title);
  fd.append('grade', grade);
  fd.append('level', level);
  fd.append('points', points);
  fd.append('status', status);
  fd.append('description', description);
  fd.append('answer_type', answerType);
  fd.append('correct_answer', correctAnswer);

  // Добавляем файлы, если есть
  attachments['add-participant'].forEach(file => {
    fd.append('attachments', file);
  });

  try {
    const response = await fetch(
      'https://portal.gradients.academy/api/assignments/dashboard/',
      {
        method: 'POST',
        headers: {
          // Не указываем Content-Type — браузер сам выставит multipart/form-data
          Authorization: `Bearer ${token}`,
        },
        body: fd,
      }
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `Ошибка ${response.status}`);
    }
    toggleModal('modalAdd');
    await loadAssignments(1);
  } catch (err) {
    console.error('Ошибка при добавлении задачи:', err);
    alert(`Не удалось добавить задачу: ${err.message}`);
  }
}

// 10. Редактирование задачи
function openEditModal(task) {
  // сохраняем ID задачи
  taskBeingEditedId = task.id;

  // показываем модалку редактирования
  toggleModal('modalEdit');

  // заполняем поля формы participant-form2 по жёстко прописанным id
  document.getElementById('title-edit-participant').value       = task.title || '';
  document.getElementById('grade-edit-participant').value       = task.grade  || '';
  document.getElementById('level-edit-participant').value       = task.level  || '';
  document.getElementById('points-edit-participant').value      = task.points || '';
  document.getElementById('status-edit-participant').value      = task.status || '';
  document.getElementById('desc-edit-participant').value        = task.description || '';
  document.getElementById('answer-edit-participant').value      = task.correct_answer || '';

  // radios: number/text
  const isText = task.answer_type === 'text';
  document.getElementById('answer1-type-edit-participant').checked = !isText;
  document.getElementById('answer2-type-edit-participant').checked = isText;
}


function handleEditClick(button) {
  const raw = button.getAttribute('data-task');
  if (!raw) {
    console.error('handleEditClick: data-task не найден на', button);
    return;
  }

  let jsonStr;
  try {
    // Заменим + на %20 (если вдруг встретятся) и прогоняем через decodeURIComponent
    jsonStr = decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch (decodeErr) {
    console.error('Не удалось декодировать raw data-task:', decodeErr, 'raw:', raw);
    alert('Ошибка при чтении данных задачи.');
    return;
  }

  let task;
  try {
    task = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('Ошибка при разборе JSON задачи:', parseErr, 'jsonStr:', jsonStr);
    alert('Не удалось открыть задачу для редактирования.');
    return;
  }

  openEditModal(task);
}




async function submitEditTask() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }
  if (!taskBeingEditedId) {
    alert('ID редактируемой задачи не определён.');
    return;
  }

  const form = document.getElementById('participant-form2'); // или ваш селектор

    // 1) Считываем role
  const roleValue = document.querySelector(
    '#modalEdit input[name="role"]:checked'
  ).value; // "participant" или "representative"

  // 2) Мапим в то, что ждёт бэк
  const typeMap = {
    participant:   'preparatory',
    representative: 'daily'
  };
  const type = typeMap[roleValue];
  // Сбор полей из формы редактирования
  const title = form.querySelector('#title-edit-participant').value.trim();
  const grade = form.querySelector('select[id^="grade"]')?.value;
  const level = form.querySelector('select[id^="level"]')?.value;
  const points = form.querySelector('select[id^="points"]')?.value;
  const status = form.querySelector('select[id^="status"]')?.value;
  const description = form.querySelector('textarea')?.value.trim();
  const answerType = form.querySelector('input[name="answer-type"]:checked')?.value || 'number';
  const correctAnswer = form.querySelector('input[name="answer"]')?.value.trim();

  // Валидация
  if (!title || !grade || !level || !points || !status || !description || !correctAnswer) {
    alert('Пожалуйста, заполните все обязательные поля.');
    return;
  }

  // Формируем FormData
  const fd = new FormData();
  fd.append('type', type);
  fd.append('title', title);
  fd.append('grade', grade);
  fd.append('level', level);
  fd.append('points', points);
  fd.append('status', status);
  fd.append('description', description);
  fd.append('answer_type', answerType);
  fd.append('correct_answer', correctAnswer);

  // И — самое главное — прикрепляем все файлы из attachments['edit-participant']
  attachments['edit-participant'].forEach(file => {
    fd.append('attachments', file);
  });

  try {
    console.log('Кидаем на сервер файлы:', attachments['edit-participant']);
    const res = await fetch(
      `https://portal.gradients.academy/api/assignments/dashboard/${taskBeingEditedId}/`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          // НЕ указываем Content-Type — браузер автоматически поставит multipart/form-data
        },
        body: fd,
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || JSON.stringify(err));
    }
    toggleModal('modalEdit');
    await loadAssignments(currentAssignmentPage);
  } catch (err) {
    console.error('Ошибка при редактировании задачи:', err);
    alert(`Не удалось обновить задачу: ${err.message}`);
  }
}

// 11. Функция toggleModal, если ещё нет
window.toggleModal = function(modalId) {
  const overlay = document.getElementById('overlayModal');
  const modal = document.getElementById(modalId);
  if (!overlay || !modal) return;
  const isHidden = overlay.classList.contains('hidden');
  if (isHidden) {
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
    modal.classList.add('hidden');
  }
};
// Закрытие по оверлею, если есть
document.getElementById('overlayModal')?.addEventListener('click', () => toggleModal('modalDel'));

// 12. Инициализация после загрузки документа
document.addEventListener('DOMContentLoaded', async () => {
  // 1) Проверяем и получаем user
const user = await ensureUserAuthenticated()
  if (!user) return

    // 2) Подтягиваем актуальный профиль по API
    const profileData = await loadAdminProfile();
    // 3) Рисуем шапку
    renderUserInfo(profileData);

  try {
    await loadAssignments()
    setupAssignmentFilters()

    let sortAscending = true

    const sortHeader = document.getElementById('sort-id-header')
    const sortHeader2 = document.getElementById('sort-name-header')
    if (sortHeader) {
    sortHeader.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const A = a.id
        const B = b.id
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedAssignments()
    })}

    let sortDescriptionAsc = true

            if (sortHeader2) {
    sortHeader2.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const descA = a.title.toLowerCase()
        const descB = b.title.toLowerCase()
        return sortDescriptionAsc ? descA.localeCompare(descB) : descB.localeCompare(descA)

      })
      sortDescriptionAsc = !sortDescriptionAsc
      renderPaginatedAssignments()
    })}
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }

  // Если нужно: инициализировать уведомления или другие модули
  // initNotifications();  // например, если есть функция для уведомлений
});


function renderPaginatedAssignments() {
  const start = (currentAssignmentPage - 1) * assignmentPageSize
  const end = start + assignmentPageSize
  const pageData = allAssignments.slice(start, end)

  document.getElementById('total-assignments-count').textContent =
    allAssignments.length
  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}