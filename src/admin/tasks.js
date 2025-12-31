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
  const p = profile && profile.profile ? profile.profile : (profile || {});

  const avatarEl  = document.getElementById('user-avatar');
  const nameEl    = document.getElementById('user-name');
  const roleEl    = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  if (!avatarEl || !nameEl || !roleEl || !welcomeEl) {
    console.warn('renderUserInfo: отсутствуют элементы в DOM для отрисовки профиля');
    return;
  }

  const imgPath = p.image;
  avatarEl.src = imgPath
    ? (imgPath.startsWith('http') ? imgPath : `https://portal.femo.kz${imgPath}`)
    : '/src/assets/images/user-3296.svg';

  // Определяем frontend language для выбора имени (которое может быть на en/ru)
  const storedLang = localStorage.getItem('lang') || 'ru';
  const frontendLang = (storedLang === 'kk') ? 'kz' : storedLang; // устойчиво: если случайно кто-то записал kk
  const fullName = (frontendLang === 'en') ? (p.full_name_en || p.full_name_ru || '') : (p.full_name_ru || p.full_name_en || '');
  nameEl.textContent = fullName;

  const firstName = (fullName.split && fullName.split(' ')[0]) || '';

  const welcomeKeyCandidates = ['welcome.message_admin', 'welcome.message', 'welcome.message_rep'];

  // Находим или создаём span[data-i18n]
  let greetSpan = welcomeEl.querySelector('span[data-i18n]');
  if (!greetSpan) {
    greetSpan = document.createElement('span');
    greetSpan.setAttribute('data-i18n', welcomeKeyCandidates[0]);
    greetSpan.textContent = 'Добро пожаловать,'; // fallback
    welcomeEl.innerHTML = '';
    welcomeEl.appendChild(greetSpan);
    welcomeEl.appendChild(document.createTextNode(' ' + firstName + ' 👋'));
  } else {
    // обновляем имя (не трогаем span текст)
    let node = greetSpan.nextSibling;
    while (node) {
      const next = node.nextSibling;
      node.remove();
      node = next;
    }
    greetSpan.after(document.createTextNode(' ' + firstName + ' 👋'));
  }

  try {
    const dict = window.i18nDict || {};
    const foundKey = welcomeKeyCandidates.find(k => Object.prototype.hasOwnProperty.call(dict, k));
    if (foundKey) greetSpan.dataset.i18n = foundKey;
    if (typeof applyTranslations === 'function') applyTranslations(dict);
  } catch (e) {
    console.warn('renderUserInfo: applyTranslations error', e);
  }

  const roleMap = { administrator: 'Администратор' };
  roleEl.textContent = roleMap[p.role] || p.role || '';

  // Подписка на смену языка (обновит перевод и имя)
  function onLanguageChanged() {
    try {
      const dict = window.i18nDict || {};
      const foundKey = welcomeKeyCandidates.find(k => Object.prototype.hasOwnProperty.call(dict, k));
      if (foundKey) greetSpan.dataset.i18n = foundKey;
      if (typeof applyTranslations === 'function') applyTranslations(dict);

      const langNow = localStorage.getItem('lang') || 'ru';
      const resolvedLang = (langNow === 'kk') ? 'kz' : langNow;
      const newFullName = (resolvedLang === 'en') ? (p.full_name_en || p.full_name_ru || '') : (p.full_name_ru || p.full_name_en || '');
      nameEl.textContent = newFullName;
      let node = greetSpan.nextSibling;
      while (node) {
        const next = node.nextSibling;
        node.remove();
        node = next;
      }
      const newFirst = (newFullName.split && newFullName.split(' ')[0]) || '';
      greetSpan.after(document.createTextNode(' ' + newFirst + ' 👋'));
    } catch (e) {
      console.warn('onLanguageChanged error', e);
    }
  }

  // remove old listeners then add
  try {
    window.removeEventListener('i18n:languageChanged', onLanguageChanged);
    window.addEventListener('i18n:languageChanged', onLanguageChanged);
    window.removeEventListener('i18n:languageReady', onLanguageChanged);
    window.addEventListener('i18n:languageReady', onLanguageChanged);
  } catch (e) {
    // ignore
  }
}

// Функция, которая дергает профиль администратора
async function loadAdminProfile() {
  const token = localStorage.getItem('access_token');
  if (!token) throw new Error('Токен не найден');

  const res = await authorizedFetch(
    'https://portal.femo.kz/api/users/administrator/profile/',
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
      `https://portal.femo.kz/api/assignments/dashboard/?${params.toString()}`,
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
    olympiad: 'Задача по олимпиаде'
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
        <td><span style='width: fit-content !important;' class="card ${getLevelClass(task.level)}">${getTaskLevelLabel(task.level)}</span></td>
        <td><span>${getTaskTypeLabel(task.type)}</span></td>
        <td><span style='width: fit-content !important;' class="card ${getStatusClass(task.status)}">${getTaskStatusLabel(task.status)}</span></td>
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
      `https://portal.femo.kz/api/assignments/dashboard/${taskIdToDelete}/`,
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

// 10. Редактирование задачи

function fillTranslations(task) {
  if (!Array.isArray(task.translations)) return;

  task.translations.forEach(tr => {
    const lang = tr.language;

    const titleInput = document.getElementById(`edit-title-${lang}`);
    if (titleInput) titleInput.value = tr.title || '';

    const descInput = document.getElementById(`edit-desc-${lang}`);
    if (descInput) descInput.value = tr.description || '';
  });
}


function fillCorrectAnswers(task) {
  if (!Array.isArray(task.translations)) return;

  task.translations.forEach(tr => {
    const input = document.getElementById(`answer-${tr.language}-edit`);
    if (input) {
      input.value = tr.correct_answer ?? '';
    }
  });
}


function setTaskType(rawType) {
  const modal = document.getElementById('modalEdit');
  if (!modal) return;

  // 1) СБРОС перед установкой нового типа
  showAllRoles(); // <-- ваша функция сброса

  // нормализуем строку
  const key = String(rawType || '').trim().toLowerCase();

  // явное сопоставление алиасов -> значение value у radio
  const typeMap = {
    // подготовительная задача
    'podg': 'participant',
    'prep': 'participant',
    'participant': 'participant',
    'подготовительная задача': 'participant',

    // задача дня
    'daily': 'representative',
    'day': 'representative',
    'representative': 'representative',
    'задача дня': 'representative',

    // олимпиада
    'olymp': 'olympiad',
    'olympiad': 'olympiad',
    'задача олимпиады': 'olympiad',
  };

  const taskType = typeMap[key] || key;

  // соберём все радио для name="role"
  const radios = modal.querySelectorAll('input[name="role"]');

  // снять активный визуальный класс у всех (если используется)
  radios.forEach(r => r.closest('label')?.classList.remove('btn-option--active'));

  // найти нужный инпут по value
  const target = modal.querySelector(`input[name="role"][value="${taskType}"]`);
  if (target) {
    // кликнуть по нужному радио (надёжно триггерит change)
    target.click();

    const targetLabel = target.closest('label');
    targetLabel?.classList.add('btn-option--active');

    // скрыть все остальные лейблы, оставив видимым только выбранный
    radios.forEach(r => {
      const label = r.closest('label');
      if (!label) return;
      const isSelected = r === target;

      // Ваш фрагмент: скрываем через inline-стиль
      label.style.display = isSelected ? '' : 'none';

      // Для доступности:
      label.setAttribute('aria-hidden', (!isSelected).toString());
      r.tabIndex = isSelected ? 0 : -1;

      // По желанию: убрать/вернуть disabled
      r.disabled = !isSelected ? true : false;
    });

    // Сфокусируем выбранный радио, чтобы не терять контекст
    target.focus({ preventScroll: true });

  } else {
    console.warn('Не найден радио для типа:', rawType, '->', taskType);
    // Если нужный тип не найден — НЕ скрываем варианты,
    // чтобы пользователь мог выбрать вручную.
  }
}

/**
 * Вспомогательная функция для сброса:
 * заново показывает все варианты ролей.
 */
function showAllRoles() {
  const modal = document.getElementById('modalEdit');
  if (!modal) return;

  const radios = modal.querySelectorAll('input[name="role"]');
  radios.forEach(r => {
    const label = r.closest('label');
    if (!label) return;

    // Вернуть видимость
    label.style.display = '';
    label.removeAttribute('aria-hidden');

    // Вернуть навигацию по табу
    r.tabIndex = 0;

    // Вернуть активность
    r.disabled = false;

    // Снять визуальные классы активного состояния, если они остались
    label.classList.remove('btn-option--active');
  });
}
function fillAuthors(task) {
  if (!Array.isArray(task.translations)) return;

  task.translations.forEach(tr => {
    const lang = tr.language;

    const authorInput = document.querySelector(
      `#author-edit-participant input[data-lang="${lang}"]`
    );

    if (authorInput) {
      authorInput.value = tr.author || '';
    }
  });
}


function openEditModal(task) {
  taskBeingEditedId = task.id;
  toggleModal('modalEdit');

  // Общие поля
  document.getElementById('grade-edit-participant').value  = task.grade;
  document.getElementById('level-edit-participant').value  = task.level;
  document.getElementById('points-edit-participant').value = task.points;
  document.getElementById('status-edit-participant').value = task.status;

  // Тип ответа
  const isText = task.answer_type === 'text';
  document.getElementById('answer1-type-edit-participant').checked = !isText;
  document.getElementById('answer2-type-edit-participant').checked = isText;

  // Переводы
  fillTranslations(task);

   // Правильные ответы
  fillCorrectAnswers(task);
  fillAuthors(task);
  // 🔥 тип задачи
  setTaskType(task.type);

  // Вложения
  renderAttachments(task);

//  setTaskType(task.type);
//
//  const olympiadWrapperEdit =
//    document.getElementById('olympiad-edit-select-wrapper');
//
//  toggleOlympiadSelect(
//    olympiadWrapperEdit,
//    task.type
//  );
//
//  // 🔥 выставляем выбранную олимпиаду
//  if (task.type === 'olympiad') {
//    renderOlympiadSelect(olympiadSelectEdit);
//    olympiadSelectEdit.value = task.olympiad?.id ?? '';
//  }
}

const EDIT_FORM_KEY = 'edit-participant';

function renderAttachments(task) {
  attachments[EDIT_FORM_KEY] = {
    ru: [], kk: [], en: [], es: [], de: [], az: [], ka: []
  };

  task.translations.forEach(tr => {
    const lang = tr.language;

    tr.attachments.forEach(att => {
      attachments[EDIT_FORM_KEY][lang].push({
        type: 'server',
        id: att.id,
        title: tr.title,
        url: `https://portal.femo.kz${att.file_url}`,
        removed: false
      });
    });
  });

  renderFiles(EDIT_FORM_KEY, currentLang);
}

document.addEventListener('DOMContentLoaded', () => {
  const radios = document.querySelectorAll('input[name="lang"]');

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      currentLang = radio.value;
      renderFiles('edit-participant', currentLang);
    });
  });
});

const editFileInputs = document.querySelectorAll('#files-edit-participant .file-input');
const editLabelFile = document.getElementById('edit-file-label');

editFileInputs.forEach(inp => {
  inp.addEventListener('change', () =>
    handleEditFilesChange(inp, inp.dataset.lang)
  );
});

editLabelFile.addEventListener('click', () => {
  const activeInput = document.querySelector(
    `#files-edit-participant .file-input[data-lang="${currentLang}"]`
  );
  activeInput?.click();
});


// ОБРАБОТКА ВЫБОРА ФАЙЛОВ
// ----------------------
function handleEditFilesChange(inputEl, lang) {
  const file = inputEl.files[0];
  if (!file) return;

  // помечаем server-файл как удалённый
  attachments[EDIT_FORM_KEY][lang].forEach(item => {
    if (item.type === 'server') item.removed = true;
  });

  // добавляем новый файл
  attachments[EDIT_FORM_KEY][lang].push({
    type: 'local',
    name: file.name,
    file
  });

  inputEl.value = '';
  renderFiles(EDIT_FORM_KEY, lang);
}

async function handleEditClick(button) {
  const raw = button.getAttribute('data-task');
  if (!raw) return;

  let task;
  try {
    const jsonStr = decodeURIComponent(raw.replace(/\+/g, '%20'));
    const parsed = JSON.parse(jsonStr);
    const taskId = parsed.id;

    // получаем полные данные задачи с сервера
    const token = localStorage.getItem('access_token');
    const res = await fetch(`https://portal.femo.kz/api/assignments/dashboard/${taskId}/`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error(`Ошибка загрузки: ${res.status}`);
    task = await res.json();
  } catch (err) {
    console.error('Ошибка при получении задачи:', err);
    alert('Не удалось загрузить задачу для редактирования.');
    return;
  }

  openEditModal(task);
}

async function submitEditTask() {
  const token = localStorage.getItem('access_token');
  if (!token) return alert('Токен не найден');
  if (!taskBeingEditedId) return alert('ID задачи не найден');

  const roleValue = document.querySelector(
    '#modalEdit input[name="role"]:checked'
  )?.value;

  const typeMap = {
    participant: 'preparatory',
    representative: 'daily',
    olympiad: 'olympiad'
  };
  const type = typeMap[roleValue];

  const grade  = document.getElementById('grade-edit-participant')?.value;
  const level  = document.getElementById('level-edit-participant')?.value;
  const points = document.getElementById('points-edit-participant')?.value;
  const status = document.getElementById('status-edit-participant')?.value;
  const answerType =
    document.querySelector('#modalEdit input[name="answer-type"]:checked')?.value;

  // ----------------------
  // Собираем переводы
  // ----------------------
  const translations = [];

  for (let lang of languages) {
    const title = document.getElementById(`edit-title-${lang}`)?.value.trim();
    const author = document.querySelector(
      `#author-edit-participant input[data-lang="${lang}"]`
    )?.value.trim();
    
    const description = document.getElementById(`edit-desc-${lang}`)?.value.trim();
    const correctAnswer =
      document.getElementById(`answer-${lang}-edit`)?.value.trim();

    const files = attachments['edit-participant'][lang];

    if (!title || !author || !description || !correctAnswer) {
      return alert(`Заполните все поля для языка ${languageLabels[lang]}`);
    }

    translations.push({
      language: lang,
      title,
      author,
      description,
      correct_answer: correctAnswer,
      files
    });
  }

  // ----------------------
  // FormData
  // ----------------------
  const fd = new FormData();
  fd.append('type', type);
  fd.append('grade', grade);
  fd.append('level', level);
  fd.append('points', points);
  fd.append('status', status);
  fd.append('answer_type', answerType);

  translations.forEach((tr, idx) => {
    fd.append(`translations[${idx}]language`, tr.language);
    fd.append(`translations[${idx}]title`, tr.title);
    fd.append(`translations[${idx}]author`, tr.author);
    fd.append(`translations[${idx}]description`, tr.description);
    fd.append(`translations[${idx}]correct_answer`, tr.correct_answer);

    tr.files.forEach(fileObj => {
      if (fileObj.type === 'local') {
        fd.append(`translations[${idx}]files`, fileObj.file);
      }
      // server-файлы НЕ отправляем — они уже есть
    });
  });

  // ----------------------
  // Отправка
  // ----------------------
  try {
    const res = await authorizedFetch(
      `https://portal.femo.kz/api/assignments/dashboard/${taskBeingEditedId}/`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      }
    );

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || JSON.stringify(err));
    }

    toggleModal('modalEdit');
    await loadAssignments(currentAssignmentPage);

  } catch (err) {
    console.error(err);
    alert(`Ошибка сохранения: ${err.message}`);
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

const radios = document.querySelectorAll('input[name="lang"]');
const inputs = document.querySelectorAll('.lang-input');
const textareas = document.querySelectorAll('.lang-textarea');
const correct_answer_inputs = document.querySelectorAll('.lang-input-answer');


radios.forEach(radio => {
  radio.addEventListener('change', () => {
    const lang = radio.value;

    // 🔹 Переключаем поля ввода
    inputs.forEach(input => {
      input.style.display = input.dataset.lang === lang ? 'block' : 'none';
    });

    // 🔹 Переключаем поля ввода
    correct_answer_inputs.forEach(input => {
      input.style.display = input.dataset.lang === lang ? 'block' : 'none';
    });

    textareas.forEach(textarea => {
      textarea.style.display = textarea.dataset.lang === lang ? 'block' : 'none';
    });
  });
});

const languages = ["ru", "kk", "en", "es", "de", "az", "ka"];
const languageLabels = {
  ru: 'Русский',
  kk: 'Казахский',
  en: 'Английский',
  es: 'Испанский',
  de: 'Немецкий',
  az: 'Азербайджанский',
  ka: 'Грузинский'
};

// ----------------------
// ХРАНЕНИЕ ФАЙЛОВ
// ----------------------
const attachments = {
  'add-participant': {
    ru: [], kk: [], en: [], es: [], de: [], az: [], ka: []
  },
  'edit-participant': {
    ru: [], kk: [], en: [], es: [], de: [], az: [], ka: []
  }
};

// Текущий язык
let currentLang = 'ru';

// Ключ формы
const formKey = 'add-participant';

// Все input[type=file]
const fileInputs = document.querySelectorAll('#files-add-participant .file-input');

// Label для клика
const labelFile = document.getElementById('file-label');

// ----------------------
// ОБРАБОТКА ВЫБОРА ФАЙЛОВ
// ----------------------
function handleFilesChange(inputEl, formKey, lang) {
  const file = inputEl.files[0];
  if (!file) return;

  // ❗ перезаписываем массив (1 файл на язык)
  attachments[formKey][lang] = [{
    type: 'local',
    name: file.name,
    file
  }];

  inputEl.value = '';
  renderFiles(formKey, lang);
}


// ----------------------
// РЕНДЕР ФАЙЛОВ
// ----------------------
function renderFiles(formKey, lang) {
  const listEl = document.getElementById(`files-list-${formKey}`);
  listEl.innerHTML = '';

  attachments[formKey][lang]
    .filter(item => !item.removed)
    .forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between';

      const link = document.createElement('a');
      link.textContent = item.title || item.name;
      link.className = 'text-orange-primary hover:underline';
      link.href = item.type === 'server' ? item.url : '#';
      link.target = '_blank';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '×';
      btn.className = 'ml-2 text-red-500';

      btn.onclick = () => {
        if (item.type === 'server') {
          item.removed = true;
        } else {
          attachments[formKey][lang].splice(idx, 1);
        }
        renderFiles(formKey, lang);
      };

      row.append(link, btn);
      listEl.appendChild(row);
    });
}



// ----------------------
// ПОДПИСЫВАЕМСЯ НА onchange для input[type=file]
// ----------------------
fileInputs.forEach(inp => {
  const lang = inp.dataset.lang;
  inp.addEventListener('change', () => handleFilesChange(inp, formKey, lang));
});

// ----------------------
// КЛИК ПО LABEL → открыть активный input
// ----------------------
labelFile.addEventListener('click', () => {
  const activeInput = document.querySelector(`.file-input[data-lang="${currentLang}"]`);
  activeInput.click();
});

// ----------------------
// ОТПРАВКА НОВОЙ ЗАДАЧИ
// ----------------------
async function submitNewTask() {
  const token = localStorage.getItem('access_token');
  if (!token) return alert('Токен не найден. Пожалуйста, войдите заново.');

  const activeForm = document.getElementById('participant-form');
  if (!activeForm) return alert('Форма не выбрана.');

  const role = document.querySelector('input[name="role"]:checked')?.value;
  const typeMap = { representative: 'daily', participant: 'preparatory', olympiad: 'olympiad' };
  const type = typeMap[role] ?? null;

  const grade = activeForm.querySelector('select[id^="grade"]')?.value;
  const level = activeForm.querySelector('select[id^="level"]')?.value;
  const points = activeForm.querySelector('select[id^="points"]')?.value;
  const status = activeForm.querySelector('select[id^="status"]')?.value;

  const answerTypeValue = document.querySelector('input[name="answer-type"]:checked')?.value;

  // ----------------------
  // Собираем переводы
  // ----------------------
  let translations = [];
  for (let lang of languages) {
    const title = activeForm.querySelector(`input[data-lang="${lang}"]`)?.value.trim() || "";
    const author = activeForm.querySelector(
      `#author-add-participant input[data-lang="${lang}"]`
    )?.value.trim() || "";
    const description = activeForm.querySelector(`textarea[data-lang="${lang}"]`)?.value.trim() || "";
    const correctAnswer = activeForm.querySelector(`#answer-add-participant input[data-lang="${lang}"]`)?.value.trim() || "";
    const files = attachments[formKey]?.[lang];

    if (!title || !author || !description || !correctAnswer) {
      return alert(`Пожалуйста, заполните все поля для языка ${languageLabels[lang]}`);
    }

    translations.push({ language: lang, title, author, description, correct_answer: correctAnswer, files });
  }

  // ----------------------
  // Формируем FormData
  // ----------------------
  const fd = new FormData();
  fd.append('type', type);
  fd.append('grade', grade);
  fd.append('level', level);
  fd.append('points', points);
  fd.append('status', status);
  fd.append('answer_type', answerTypeValue);

  translations.forEach((trans, idx) => {
      fd.append(`translations[${idx}]language`, trans.language);
      fd.append(`translations[${idx}]title`, trans.title);
      fd.append(`translations[${idx}]author`, trans.author);
      fd.append(`translations[${idx}]description`, trans.description);
      fd.append(`translations[${idx}]correct_answer`, trans.correct_answer);

      trans.files.forEach(fileObj => {
        fd.append(`translations[${idx}]files`, fileObj.file); // <-- именно так
      });
  });

  // ----------------------
  // Отправка
  // ----------------------
  let url = 'https://portal.femo.kz/api/assignments/dashboard/';

  if (type === 'olympiad') {
    const olympiad_id = document.getElementById('olympiad-add-participant')?.value;
    if (!olympiad_id) return alert('Пожалуйста, выберите олимпиаду');
    url = `https://portal.femo.kz/api/olympiads/dashboard/${olympiad_id}/assignments/`;
  }

  try {
    const response = await authorizedFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }, // НЕ ставим Content-Type
      body: fd
    });
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || `Ошибка ${response.status}`);
    }
    toggleModal('modalAdd');
    await loadAssignments(1);
  } catch (err) {
    console.error('Ошибка при добавлении задачи:', err);
    alert(`Не удалось добавить задачу: ${err.message}`);
  }
}



// ----------------------
// ПЕРЕКЛЮЧЕНИЕ ЯЗЫКА
// ----------------------
radios.forEach(radio => {
  radio.addEventListener('change', () => {
    const lang = radio.value;
    currentLang = lang;

    // ничего НЕ показываем
    // inputs остаются скрытыми

    // очищаем input, чтобы он был пустым
    const activeInput = document.querySelector(`.file-input[data-lang="${lang}"]`);
    activeInput.value = '';

    renderFiles(formKey, lang);
  });
});



const olympiadSelect = document.getElementById('olympiad-add-participant');
//const olympiadSelectEdit = document.getElementById('olympiad-edit-participant');
const roleInputs = document.querySelectorAll('input[name="role"]');
let olympiadsData = []; // сюда сохраняем данные

function renderOlympiadSelect(selectEl) {
  if (!selectEl || selectEl.dataset.rendered === '1') return;

  selectEl.innerHTML = '';

  olympiadsData.forEach(item => {
    selectEl.insertAdjacentHTML(
      'beforeend',
      `<option value="${item.id}">${item.title}</option>`
    );
  });

  selectEl.dataset.rendered = '1'; // локальный флаг
}

olympiadSelect.addEventListener('focus', () => {
  renderOlympiadSelect(olympiadSelect);
});

//olympiadSelectEdit.addEventListener('focus', () => {
//  renderOlympiadSelect(olympiadSelectEdit);
//});


async function preloadOlympiads() {
  try {
    const res = await authorizedFetch(
      'https://portal.femo.kz/api/olympiads/dashboard/'
    );
    const data = await res.json();
    olympiadsData = data.results || [];
  } catch (err) {
    console.error('Ошибка предзагрузки олимпиад:', err);
  }
}

preloadOlympiads();

function toggleOlympiadSelect(wrapperEl, role) {
  if (!wrapperEl) return;

  if (role === 'olympiad') {
    wrapperEl.classList.remove('hidden');
  } else {
    wrapperEl.classList.add('hidden');
  }
}

// Ставим Подготовительную задачу по умолчанию при загрузке
window.addEventListener('DOMContentLoaded', () => {
  const defaultRole =
    document.querySelector('input[name="role"][value="participant"]');

  if (defaultRole) defaultRole.checked = true;

  toggleOlympiadSelect(
    olympiadWrapperAdd,
    'participant'
  );
});

const olympiadWrapperAdd =
  document.getElementById('olympiad-select-wrapper');

roleInputs.forEach(radio => {
  radio.addEventListener('change', () => {
    toggleOlympiadSelect(
      olympiadWrapperAdd,
      radio.value
    );

    // 🔥 если выбрали олимпиаду — рендерим список
    if (radio.value === 'olympiad') {
      renderOlympiadSelect(olympiadSelect);
    }
  });
});

