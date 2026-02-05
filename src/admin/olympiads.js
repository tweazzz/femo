console.log('src/admin/olympiads.js loaded')

async function ensureUserAuthenticated() {
  console.log('ensureUserAuthenticated called')
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
let currentEditId = null;
let tomGradesAdd, tomGradesEdit;
let quillAdd, quillEdit; // Quill instances
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
}

function injectQuillStyles() {
  // Inject styles for Quill editor to restore formatting (override Tailwind reset)
  if (!document.getElementById('quill-fixes')) {
    const style = document.createElement('style');
    style.id = 'quill-fixes';
    style.textContent = `
      /* General Editor Font */
      .ql-container, .ql-editor { font-family: 'Inter', sans-serif !important; }

      /* Lists */
      .ql-editor ul { list-style-type: disc !important; padding-left: 1.5em !important; }
      .ql-editor ol { list-style-type: decimal !important; padding-left: 1.5em !important; }
      .ql-editor li { margin-bottom: 0.25em !important; }

      /* Headings */
      .ql-editor h1 { font-size: 2em !important; font-weight: bold !important; margin-bottom: 0.5em !important; margin-top: 0.5em !important; line-height: 1.2 !important; }
      .ql-editor h2 { font-size: 1.5em !important; font-weight: bold !important; margin-bottom: 0.5em !important; margin-top: 0.5em !important; line-height: 1.25 !important; }
      .ql-editor h3 { font-size: 1.17em !important; font-weight: bold !important; margin-bottom: 0.5em !important; margin-top: 0.5em !important; line-height: 1.3 !important; }
      .ql-editor h4 { font-size: 1em !important; font-weight: bold !important; margin-bottom: 0.5em !important; }

      /* Text Formatting */
      .ql-editor p { margin-bottom: 1em !important; line-height: 1.5 !important; }
      .ql-editor strong, .ql-editor b { font-weight: bold !important; }
      .ql-editor em, .ql-editor i { font-style: italic !important; font-synthesis: style !important; }
      .ql-editor u { text-decoration: underline !important; }
      .ql-editor s { text-decoration: line-through !important; }
      .ql-editor a { color: #2563eb !important; text-decoration: underline !important; }

      /* Blockquotes & Code */
      .ql-editor blockquote { border-left: 4px solid #ccc !important; padding-left: 16px !important; margin-bottom: 1em !important; font-style: italic !important; color: #555 !important; }
      .ql-editor pre { background-color: #f0f0f0 !important; padding: 10px !important; border-radius: 4px !important; font-family: monospace !important; margin-bottom: 1em !important; overflow-x: auto !important; }
      .ql-editor code { background-color: #f0f0f0 !important; padding: 2px 4px !important; border-radius: 3px !important; font-family: monospace !important; }

      /* Alignment */
      .ql-editor .ql-align-center { text-align: center !important; }
      .ql-editor .ql-align-right { text-align: right !important; }
      .ql-editor .ql-align-justify { text-align: justify !important; }

      /* Indentation */
      .ql-editor .ql-indent-1 { padding-left: 3em !important; }
      .ql-editor .ql-indent-2 { padding-left: 6em !important; }
      .ql-editor .ql-indent-3 { padding-left: 9em !important; }
      .ql-editor .ql-indent-4 { padding-left: 12em !important; }
      .ql-editor .ql-indent-5 { padding-left: 15em !important; }
      .ql-editor .ql-indent-6 { padding-left: 18em !important; }
      .ql-editor .ql-indent-7 { padding-left: 21em !important; }
      .ql-editor .ql-indent-8 { padding-left: 24em !important; }
      
      /* Sub/Super script */
      .ql-editor sub { vertical-align: sub !important; font-size: smaller !important; }
      .ql-editor sup { vertical-align: super !important; font-size: smaller !important; }

      /* Font Size */
      .ql-editor .ql-size-small { font-size: 0.75em !important; }
      .ql-editor .ql-size-large { font-size: 1.5em !important; }
      .ql-editor .ql-size-huge { font-size: 2.5em !important; }

      /* Robust Italic */
      .ql-editor em, .ql-editor i { font-style: italic !important; font-synthesis: style !important; }
      .ql-editor strong em, .ql-editor em strong, 
      .ql-editor b i, .ql-editor i b { font-weight: bold !important; font-style: italic !important; }
      
      .ql-editor em *, .ql-editor i * { font-style: italic !important; }
    `;
    document.head.appendChild(style);
  }
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

// Отображение имени выбранного файла в Add-модалке
document
  .getElementById('certificate-background')
  .addEventListener('change', function () {
    const file    = this.files[0];
    const display = document.getElementById('file-name-add');

    if (file) {
      const name   = file.name;
      const sizeKB = (file.size / 1024).toFixed(0) + ' KB';

      display.innerHTML = `
        <span class="text-orange-primary flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg"
               fill="none" viewBox="0 0 24 24"
               stroke-width="1.5" stroke="currentColor"
               class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1
                     13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75
                     12 3 3m0 0 3-3m-3 3v-6" />
          </svg>
          ${name} (${sizeKB})
        </span>
      `;
    } else {
      display.textContent = '';
    }
  });


document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded fired in olympiads.js')
  // Inject Quill styles immediately
  injectQuillStyles();

  const user = await ensureUserAuthenticated()
  if (!user) {
    console.warn('User authentication failed')
    return
  }
  console.log('User authenticated:', user)



  const formatAddEl = document.getElementById('format-add');
  if (formatAddEl) {
    if (!formatAddEl.value) formatAddEl.value = 'online'; // дефолт
    updateFormatVisibilityAdd(formatAddEl.value);         // первичная отрисовка
    formatAddEl.addEventListener('change', () => updateFormatVisibilityAdd(formatAddEl.value));
  }
  

  tomGradesAdd = new TomSelect('#grades-add', {
    plugins: ['remove_button'],        // кнопка удаления у каждого тега
    persist: false,
    create: false,
    maxItems: null,                    // неограниченное количество
    placeholder: 'Выберите классы...',
    dropdownDirection: 'bottom',       // dropdown вниз
    copyClassesToDropdown: false,
    // render можно добавить, чтобы менять вид опций/чипов
  });
  if (!tomGradesEdit) {
    tomGradesEdit = new TomSelect('#grades-edit', {
      plugins: ['remove_button'],
      persist: false,
      create: false,
      maxItems: null,
      placeholder: 'Выберите классы...',
    });
  }

  // Initialize Quill Editors
  if (document.getElementById('editor-container-add')) {
    quillAdd = new Quill('#editor-container-add', {
      theme: 'snow',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'size': ['small', false, 'large', 'huge'] }],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          [{ 'header': [1, 2, 3, false] }],
          [{ 'color': [] }, { 'background': [] }],
          [{ 'align': [] }],
          ['link', 'clean']
        ]
      },
      placeholder: '...'
    });
  }

  if (document.getElementById('editor-container-edit')) {
    quillEdit = new Quill('#editor-container-edit', {
      theme: 'snow',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'size': ['small', false, 'large', 'huge'] }],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          [{ 'header': [1, 2, 3, false] }],
          [{ 'color': [] }, { 'background': [] }],
          [{ 'align': [] }],
          ['link', 'clean']
        ]
      },
      placeholder: 'Введите ваше сообщение...'
    });
  }

  // Parallel loading to prevent one blocking the other
  const profilePromise = loadAdminProfile()
    .then(profileData => {
      console.log('Profile loaded')
      renderUserInfo(profileData)
    })
    .catch(err => console.error('Ошибка загрузки профиля:', err));

  const olympiadsPromise = loadOlympiads()
    .then(() => console.log('Olympiads loaded'))
    .catch(err => console.error('Ошибка загрузки олимпиад (в main):', err));

  await Promise.allSettled([profilePromise, olympiadsPromise]);

  attachAddFormListeners();
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
    })
  }

        if (sortHeader2) {
    sortHeader2.addEventListener('click', () => {
      allOlympiads.sort((a, b) => {
        const A = a.id
        const B = b.id
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedTable()
    })
  }


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
    })
  }

            if (sortHeader4) {
    sortHeader4.addEventListener('click', () => {
      allOlympiads.sort((a, b) => {
        const A = a.participant_count
        const B = b.participant_count
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedTable()
    })
  }

  // Removed global try-catch around loading logic
})

async function loadOlympiads() {
  console.log('loadOlympiads called')
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await authorizedFetch(
      'https://portal.femo.kz/api/olympiads/dashboard/',
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
    console.log('API Response:', data)

    let results = []
    if (Array.isArray(data)) {
      results = data
    } else if (data.results && Array.isArray(data.results)) {
      results = data.results
    } else {
      console.warn('Непонятный формат ответа, ожидался массив или объект с results')
      results = []
    }

    renderOlympiadTable(results)
    allOlympiads = results
    filteredOlympiads = allOlympiads
    renderPaginatedTable()
    setupFilters()
  } catch (err) {
    console.error('Ошибка при загрузке олимпиад:', err)
    const tbody = document.getElementById('olympiads-tbody')
    if (tbody) {
        tbody.innerHTML = `
        <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
        `
    }
  }
}

function renderOlympiadTable(olympiads) {
  const tbody = document.getElementById('olympiads-tbody')
  if (!tbody) {
    console.error('Элемент #olympiads-tbody не найден!')
    return
  }

  if (!olympiads || !Array.isArray(olympiads)) {
     console.warn('renderOlympiadTable: olympiads is not an array', olympiads)
     tbody.innerHTML = `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных (ошибка формата)</td></tr>`
     return
  }

  tbody.innerHTML =
    olympiads.length === 0
      ? `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td></tr>`
      : olympiads
          .map(
            (ol) => `
      <tr class="hover:bg-red-50 cursor-pointer">
        <td>${ol.id}</td>
        <td>${ol.title}</td>
        <td>${getSeasonLabel(ol.type)}</td>
        <td>${(ol.grades || []).join(', ')}</td>
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
  const lang = (localStorage.getItem('lang') || 'ru').toLowerCase();
  const map = {
    ru: {
      spring: '🌸 Весна',
      summer: '☀️ Лето',
      autumn: '🍂 Осень',
      winter: '❄️ Зима',
      international: '🌍 Международный'
    },
    en: {
      spring: '🌸 Spring',
      summer: '☀️ Summer',
      autumn: '🍂 Autumn',
      winter: '❄️ Winter',
      international: '🌍 International'
    },
    kz: {
      spring: '🌸 Көктем',
      summer: '☀️ Жаз',
      autumn: '🍂 Күз',
      winter: '❄️ Қыс',
      international: '🌍 Халықаралық'
    }
  };
  
  // Handle 'kk' as 'kz' just in case
  const safeLang = lang === 'kk' ? 'kz' : (map[lang] ? lang : 'ru');
  return map[safeLang][type] || type;
}

function getStatusLabel(status) {
  const lang = (localStorage.getItem('lang') || 'ru').toLowerCase();
  const map = {
    ru: {
      ongoing: 'Идёт сейчас',
      finished: 'Завершено',
      upcoming: 'Скоро',
    },
    en: {
      ongoing: 'Ongoing',
      finished: 'Completed',
      upcoming: 'Upcoming',
    },
    kz: {
      ongoing: 'Қазір өтуде',
      finished: 'Аяқталды',
      upcoming: 'Жақында',
    }
  };

  const safeLang = lang === 'kk' ? 'kz' : (map[lang] ? lang : 'ru');
  return map[safeLang][status] || status;
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

  const url = `https://portal.femo.kz/api/users/dashboard/?${params.toString()}`
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


  try {
    const response = await fetch(
      `https://portal.femo.kz/api/olympiads/dashboard/${olympiadIdToDelete}/`,
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

function unescapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x2F;/g, "/");
}

async function openEditModal(title, id) {
  olympiadIdToDelete = id;
  currentEditId = id;

  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const setVal = (el, v) => { if (el) el.value = v ?? ''; };

  const toDatetimeLocal = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  try {
    const token = localStorage.getItem('access_token');

    const res = await authorizedFetch(
      `https://portal.femo.kz/api/olympiads/dashboard/${id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Инициализируем TomSelect для Edit
    // tomGradesEdit = new TomSelect('#grades-edit', {
    //   plugins: ['remove_button'],
    //   persist: false,
    //   create: false,
    //   maxItems: null,
    //   placeholder: 'Выберите классы...',
    // });
    /* ================= ОСНОВНЫЕ ПОЛЯ ================= */
    setVal(q('#title-edit'), data.title);
    setVal(q('#tour-edit'), data.type);
    setVal(q('#year-edit'), data.year);
    setVal(q('#status-edit'), data.status);
    setVal(q('#link-edit'), data.website);
    setVal(q('#price'), data.cost);
    if (quillEdit) quillEdit.root.innerHTML = unescapeHtml(data.description || '');

    /* ================= ФОРМАТ ================= */
    const formatSelect = q('#format-edit');
    if (formatSelect) {
      formatSelect.value = data.format;
      updateFormatVisibilityEdit(data.format);
      formatSelect.onchange = () => updateFormatVisibilityEdit(formatSelect.value);
    }

    /* ================= ЯЗЫК ================= */
    if (q('#language-edit')) {
      q('#language-edit').value = data.language;
    }


    /* ================= КЛАССЫ (TomSelect) ================= */
    requestAnimationFrame(() => {
      if (tomGradesEdit) {
        tomGradesEdit.clear(true);
        tomGradesEdit.setValue(data.grades.map(String));
        tomGradesEdit.refreshItems();
      }
    });

    // если используется select с id="grades-edit"
    // const gradesSelect = q('#grades-edit');
    // if (gradesSelect) {
    //   qa('option', gradesSelect).forEach(opt => {
    //     opt.selected = data.grades?.includes(Number(opt.value)) ?? false;
    //   });
    //   if (window.tomGradesEdit) tomGradesEdit.refreshItems(); // если TomSelect активен
    // }

    /* ================= ЭТАПЫ ================= */
    const stageContainer = q('#stages-container-edit');
    const stageTemplate  = q('#stage-template-edit');
    const stageAddWrap   = stageContainer.querySelector('.mt-4');

    qa('.stage-block', stageContainer).forEach(e => e.remove());

    if (data.stages?.length) {
      stageTemplate.classList.add('hidden');
      data.stages.forEach(stage => {
        const clone = stageTemplate.cloneNode(true);
        clone.removeAttribute('id');
        clone.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
        clone.classList.remove('hidden');
        clone.classList.add('stage-block');

        setVal(clone.querySelector('.step-name-add'), stage.name);
        const input = clone.querySelector('.date-range-add');
        input.value =
          `${stage.start_date.split('-').reverse().join('.')} — ` +
          `${stage.end_date.split('-').reverse().join('.')}`;

        flatpickr(input, {
          mode: 'range',
          dateFormat: 'd.m.Y',
          locale: flatpickr.l10ns.ru
        });

        stageContainer.insertBefore(clone, stageAddWrap);
      });
    } else {
      stageTemplate.classList.remove('hidden');
    }

    /* ================= СЛОТЫ КЛАССОВ ================= */
    const setups = [
      {
        format: 'online',
        container: q('#edit-classes-container'),
        template: q('#edit-online-class-template'),
        addBtnId: '#add-edit-online-class-btn'
      },
      {
        format: 'offline',
        container: q('#edit-offline-classes-container'),
        template: q('#edit-offline-class-template-edit'),
        addBtnId: '#add-edit-offline-class-btn'
      }
    ];

    // 1) очищаем контейнеры и скрываем шаблоны
    setups.forEach(s => {
      if (!s.template || !s.container) return;
      s.template.classList.add('hidden');
      qa('.class-block', s.container).forEach(e => e.remove());
    });

// 2) добавляем блоки из API
(data.assignment_slots || []).forEach(slot => {
  const s = setups.find(x => x.format === slot.format);
  if (!s || !s.template || !s.container) return;

  // --- Сделаем контейнер видимым, если оффлайн ---
  if (slot.format === 'offline') {
    const editOfflineEl = document.querySelector('.edit-classes-offline');
    if (editOfflineEl) editOfflineEl.classList.remove('hidden');
  }

  const addBtn = s.container.querySelector(s.addBtnId);
  const addWrap = addBtn.closest('div') || s.container;

  const clone = s.template.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  clone.classList.remove('hidden');
  clone.classList.add('class-block');

  const select = clone.querySelector('.edit-class-select');
  if (select) select.value = slot.grade;

  const startInput = clone.querySelector('.edit-start-datetime');
  const endInput = clone.querySelector('.edit-end-datetime');
  if (startInput) startInput.value = toDatetimeLocal(slot.start_at);
  if (endInput) endInput.value = toDatetimeLocal(slot.end_at);

  if (slot.format === 'offline') {
    setVal(clone.querySelector('.edit-offline-class-city'), slot.city);
    setVal(clone.querySelector('.edit-offline-class-address'), slot.address);
  }

  s.container.insertBefore(clone, addWrap);
});


    // 3) если слотов нет — показываем пустой шаблон
    setups.forEach(s => {
      if (!s.template || !s.container) return;
      const hasBlocks = s.container.querySelectorAll('.class-block').length > 0;
      if (!hasBlocks) s.template.classList.remove('hidden');
    });

    /* ================= СЕРТИФИКАТ ================= */
    setVal(q('#certificate-description-edit'), data.certificate_template?.description);
    const fileLabel = q('#file-name-edit');
    if (fileLabel && data.certificate_template?.background) {
      fileLabel.textContent = data.certificate_template.background.split('/').pop();
    }

    /* ================= ПОКАЗ МОДАЛКИ ================= */
    q('#modalEdit').classList.remove('hidden');
    q('#overlayModal').classList.remove('hidden');
    requestAnimationFrame(() => {
      if (tomGradesEdit) {
        tomGradesEdit.refreshOptions(false);
        tomGradesEdit.refreshItems();
      }
    });

  } catch (e) {
    console.error('[openEditModal ERROR]', e);
    alert('Ошибка загрузки олимпиады');
  }
}

// yyyy-mm-dd -> dd.mm.yyyy
function formatDateReverse(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return '';
  return `${d}.${m}.${y}`;
}

const formatEdit = document.getElementById('format-edit');
if (formatEdit) {
  formatEdit.addEventListener('change', () => {
    updateFormatVisibilityEdit(formatEdit.value);
  });
}

// минимальное количество этапов (изменяй на 3 если нужно минимум 3)
const MIN_STAGE_COUNT = 1;

// --- Validation helpers for Add form ---
function isAddFormValid() {
  const titleEl = document.getElementById('title-add');
  const tourEl = document.getElementById('tour-add');
  const yearEl = document.getElementById('year-add');
  const statusEl = document.getElementById('status-add');
  const languageEl = document.getElementById('language-add');
  const priceEl = document.getElementById('price-add');
  const certFileEl = document.getElementById('certificate-background');

  // TomSelect selected grades
  const gradesSelected = tomGradesAdd ? (tomGradesAdd.items || []) : [];

  if (!titleEl || !titleEl.value.trim()) return false;
  if (!tourEl || !tourEl.value) return false;
  if (!gradesSelected.length) return false;
  if (!yearEl || !yearEl.value) return false;
  if (!statusEl || !statusEl.value) return false;

  // Языки — допускаем несколько (select multiple)
  if (!languageEl) return false;
  const selectedLangs = Array.from(languageEl.selectedOptions || []).map(o => o.value).filter(Boolean);
  if (!selectedLangs.length) return false;

  if (!priceEl || priceEl.value === '' || Number(priceEl.value) < 0) return false;
  if (!certFileEl || !certFileEl.files[0]) return false;

  // stages: берём реальные блоки .stage-block (шаблон #stage-template можно учитывать, если он видим)
  let stageBlocks = Array.from(document.querySelectorAll('#stages-container .stage-block'));

  const templateEl = document.getElementById('stage-template');
  if (templateEl && !templateEl.classList.contains('hidden') && !templateEl.classList.contains('stage-block')) {
    stageBlocks.unshift(templateEl);
  }

  if (stageBlocks.length < MIN_STAGE_COUNT) return false;

  for (const block of stageBlocks) {
    const dateInput = block.querySelector('.date-range-add');
    if (!dateInput) return false;
    const raw = (dateInput.value || '').trim();
    if (!raw) return false;
    // принимаем 1 дату (дд.мм.гггг) или диапазон (дд.мм.гггг — дд.мм.гггг)
    const parts = raw.split(/\s*[-–—]\s*/).filter(Boolean);
    if (parts.length < 1 || parts.length > 2) return false;
    // проверяем формат dd.mm.yyyy (грубая проверка точки и длины частей)
    if (!parts[0].includes('.') || parts[0].split('.').length !== 3) return false;
    if (parts.length === 2 && (!parts[1].includes('.') || parts[1].split('.').length !== 3)) return false;
  }
  // --- Проверка top-level date & location только если формат = offline ---
  const formatEl = document.getElementById('format-add');
  if (formatEl && formatEl.value === 'offline') {
    const topDateInput = document.querySelector('.date-single-add');
    const locationInput = document.getElementById('location');

    if (!topDateInput || !topDateInput.value.trim()) return false;
    if (!locationInput || !locationInput.value.trim()) return false;
  }

  return true;
}

// Включает/выключает кнопку "Добавить" в зависимости от валидности формы
function setSubmitAddState() {
  const submitBtn = document.getElementById('submit-add-btn');
  if (!submitBtn) return;

  // true = форма валидна -> кнопку включаем
  const valid = isAddFormValid();
  submitBtn.disabled = !valid;

  // Можно доп. подсветку сделать:
  submitBtn.classList.toggle('opacity-50', !valid);
  submitBtn.classList.toggle('cursor-not-allowed', !valid);
}

function focusFirstInvalid() {
  const titleEl = document.getElementById('title-add');
  if (!titleEl || !titleEl.value.trim()) { alert('Введите название олимпиады'); titleEl && titleEl.focus(); return; }

  const tourEl = document.getElementById('tour-add');
  if (!tourEl || !tourEl.value) { alert('Выберите тур'); tourEl && tourEl.focus(); return; }

  const gradesSelected = tomGradesAdd ? (tomGradesAdd.items || []) : [];
  if (!gradesSelected.length) { alert('Выберите хотя бы один класс'); 
    const control = document.querySelector('#grades-add-ts-control') || document.querySelector('#grades-add');
    control && control.focus();
    return;
  }

  const yearEl = document.getElementById('year-add');
  if (!yearEl || !yearEl.value) { alert('Выберите год'); yearEl && yearEl.focus(); return; }

  const statusEl = document.getElementById('status-add');
  if (!statusEl || !statusEl.value) { alert('Выберите статус олимпиады'); statusEl && statusEl.focus(); return; }

  const languageEl = document.getElementById('language-add');
  if (!languageEl || !languageEl.value) { alert('Выберите язык олимпиады'); languageEl && languageEl.focus(); return; }

  const priceEl = document.getElementById('price-add');
  if (!priceEl || priceEl.value === '' || Number(priceEl.value) < 0) { alert('Укажите корректную стоимость'); priceEl && priceEl.focus(); return; }

  const certFileEl = document.getElementById('certificate-background');
  if (!certFileEl || !certFileEl.files[0]) { alert('Загрузите фон сертификата'); 
    const fileLabel = document.querySelector('label[for="certificate-background"]');
    if (fileLabel) fileLabel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // stages
  const stageBlocks = Array.from(document.querySelectorAll('#stages-container .stage-block'));
  if (stageBlocks.length < MIN_STAGE_COUNT) {
    alert(`Добавьте минимум ${MIN_STAGE_COUNT} этап(а/ов) с заполненными датами`);
    return;
  }
  for (const block of stageBlocks) {
    const dateInput = block.querySelector('.date-range-add');
    const raw = dateInput ? dateInput.value.trim() : '';
    if (!raw) { alert('Заполните период этапа'); dateInput && dateInput.focus(); return; }
    const parts = raw.split('—').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) { alert('Убедитесь, что диапазон даты указан как "дд.мм.гггг — дд.мм.гггг"'); dateInput && dateInput.focus(); return; }
  }
}

// Показывает/скрывает поля даты/локации и секции Online/Offline в МОДАЛКЕ ДОБАВЛЕНИЯ
function updateFormatVisibilityAdd(formatValue) {
  const formatEl = document.getElementById('format-add');
  const v = String(formatValue ?? formatEl?.value ?? 'online').trim().toLowerCase();

  // --- Твоя логика даты/локации (Add) ---
  const dateLabel  = document.querySelector('#modalAdd #olympiad-start-date');
  const dateText   = document.querySelector('#modalAdd .date-single-add:not(.flatpickr-mobile)');
  const dateMobile = document.querySelector('#modalAdd .date-single-add.flatpickr-mobile');

  const dateWrap =
    (dateText && (dateText.closest('.form-control-group') ||
                  dateText.closest('.border-default') ||
                  dateText.closest('div'))) || null;

  const locationEl   = document.getElementById('location');
  const locationWrap = locationEl ? (locationEl.closest('.form-control-group') || locationEl.closest('div')) : null;

  // Если online — скрываем дату/локацию; если offline/hybrid — показываем
  const isOnlineOnly = (v === 'online');
  if (isOnlineOnly) {
    dateLabel?.classList.add('hidden');
    dateWrap?.classList.add('hidden');
    if (dateText)   dateText.disabled = true;
    if (dateMobile) dateMobile.disabled = true;

    locationWrap?.classList.add('hidden');
    if (locationEl) locationEl.disabled = true;
  } else {
    dateLabel?.classList.remove('hidden');
    dateWrap?.classList.remove('hidden');
    if (dateText)   dateText.disabled = false;
    if (dateMobile) dateMobile.disabled = false;

    locationWrap?.classList.remove('hidden');
    if (locationEl) locationEl.disabled = false;
  }

  // --- Новое: видимость секций Add ---
  const addOnlineEl  = document.querySelector('.add-classes-online');
  const addOfflineEl = document.querySelector('.add-classes-offline');

  const showOnline  = (v === 'online'  || v === 'hybrid');
  const showOffline = (v === 'offline' || v === 'hybrid');

  if (addOnlineEl)  addOnlineEl.classList.toggle('hidden', !showOnline);
  if (addOfflineEl) addOfflineEl.classList.toggle('hidden', !showOffline);
}


function updateFormatVisibilityEdit(formatValue) {
  const formatEl = document.getElementById('format-edit');
  const v = String(formatValue ?? formatEl?.value ?? 'online').trim().toLowerCase();

  // --- Твоя логика даты/локации (Edit) ---
  const dateText =
    document.querySelector('#modalEdit .date-single-edit:not(.flatpickr-mobile)') ||
    document.querySelector('#modalEdit #olympiad-start-date-input');

  const dateMobile =
    document.querySelector('#modalEdit .date-single-edit.flatpickr-mobile') ||
    document.querySelector('#modalEdit #olympiad-start-date-input-mobile');

  const startLabel = document.getElementById('olympiad-start-date-edit');
  const dateWrap =
    startLabel?.nextElementSibling ||
    (dateText && (dateText.closest('.form-control-group') || dateText.closest('div'))) ||
    null;

  const locationEl   = document.getElementById('location-edit');
  const locationWrap = locationEl ? (locationEl.closest('.form-control-group') || locationEl.closest('div')) : null;

  const isOnlineOnly = (v === 'online');
  if (isOnlineOnly) {
    startLabel?.classList.add('hidden');
    dateWrap?.classList.add('hidden');
    if (dateText)   dateText.disabled = true;
    if (dateMobile) dateMobile.disabled = true;

    locationWrap?.classList.add('hidden');
    if (locationEl) locationEl.disabled = true;
  } else {
    startLabel?.classList.remove('hidden');
    dateWrap?.classList.remove('hidden');
    if (dateText)   dateText.disabled = false;
    if (dateMobile) dateMobile.disabled = false;

    locationWrap?.classList.remove('hidden');
    if (locationEl) locationEl.disabled = false;
  }

  // --- Новое: видимость секций Edit ---
  const editOnlineEl  = document.querySelector('.edit-classes-online');
  const editOfflineEl = document.querySelector('.edit-classes-offline');

  const showOnline  = (v === 'online'  || v === 'hybrid');
  const showOffline = (v === 'offline' || v === 'hybrid');

  if (editOnlineEl)  editOnlineEl.classList.toggle('hidden', !showOnline);
  if (editOfflineEl) editOfflineEl.classList.toggle('hidden', !showOffline);
}

// Подвяжем слушатели — вызовем setSubmitAddState на input/change
function attachAddFormListeners() {
  const watchSelectors = [
    '#title-add', '#tour-add', '#year-add', '#status-add', '#language-add', '#price-add',
    '#certificate-background'
  ];
  watchSelectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.addEventListener('input', setSubmitAddState);
    el.addEventListener('change', setSubmitAddState);
  });

  if (quillAdd) {
    quillAdd.on('text-change', setSubmitAddState);
  }

  const stagesContainer = document.getElementById('stages-container');
  if (stagesContainer) {
    // делегирование для динамически создаваемых date inputs
    stagesContainer.addEventListener('input', setSubmitAddState);
    stagesContainer.addEventListener('change', setSubmitAddState);
    // если используешь flatpickr — слушаем событие onChange при создании flatpickr для новых полей
  }

  if (tomGradesAdd && typeof tomGradesAdd.on === 'function') {
    tomGradesAdd.on('change', setSubmitAddState);
  } else {
    const nativeGrades = document.getElementById('grades-add');
    if (nativeGrades) nativeGrades.addEventListener('change', setSubmitAddState);
  }

  const certFileEl = document.getElementById('certificate-background');
  if (certFileEl) certFileEl.addEventListener('change', setSubmitAddState);

  const submitBtn = document.getElementById('submit-add-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      if (!isAddFormValid()) {
        focusFirstInvalid();
        return;
      }
      await submitOlympiadForm();
    });
  }

  // первоначальное состояние
  setSubmitAddState();
}

// Вызови attachAddFormListeners() после инициализации tomGradesAdd
// например, внутри DOMContentLoaded сразу после создания tomGradesAdd

// d.d.m.y -> YYYY-MM-DD (оставляем для стадий)
function formatDate(dateStr) {
  const [d, m, y] = dateStr.split('.');
  return `${y}-${m}-${d}`;
}

// НОВАЯ: d.d.m.y -> ISO datetime (00:00:00Z). Используем для start_at.
function formatDateToISO(dateStr) {
  if (!dateStr) return '';
  const [d, m, y] = dateStr.split('.');
  if (!d || !m || !y) return '';
  // Возвращаем UTC midnight (сервер обычно принимает YYYY-MM-DDT00:00:00Z)
  return `${y}-${m}-${d}T00:00:00Z`;
}

let isSubmittingAdd = false;
function localDatetimeToUTC(localValue) {
  if (!localValue) return '';
  const localDate = new Date(localValue);
  if (isNaN(localDate.getTime())) return '';
  return localDate.toISOString(); // Конвертирует в UTC с Z
}
function localDateToStageFormat(localValue) {
  if (!localValue) return '';
  const date = new Date(localValue);
  if (isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`; // YYYY-MM-DD, локальная дата
}

async function submitOlympiadForm() {
  if (isSubmittingAdd) return; // защита от повторного вызова
  isSubmittingAdd = true;

  const submitBtn = document.getElementById('submit-add-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Создание...';
  }

  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    resetSubmitButton();
    return;
  }

  if (!isAddFormValid()) {
    focusFirstInvalid();
    resetSubmitButton();
    return;
  }

  try {
    // --- Формируем FormData (оставляем твою логику) ---
    const formData = new FormData();
    const formatVal = document.getElementById('format-add')?.value.trim().toLowerCase() || 'online';

    formData.append('title', document.getElementById('title-add').value.trim());
    formData.append('type', document.getElementById('tour-add').value);
    formData.append('grades', tomGradesAdd.items.join(','));
    formData.append('year', document.getElementById('year-add').value);
    formData.append('status', document.getElementById('status-add').value);
    formData.append('website', document.getElementById('link-add').value.trim());
    formData.append('cost', document.getElementById('price-add').value);
    formData.append('description', quillAdd ? quillAdd.root.innerHTML : '');
    formData.append('format', formatVal);

    // Языки
    const languageEl = document.getElementById('language-add');
    const selectedLangs = Array.from(languageEl.selectedOptions).map(o => o.value).filter(Boolean);
    selectedLangs.forEach(lang => formData.append('language', lang));

    // Этапы
    const stageBlocks = document.querySelectorAll('#stages-container .stage-block');
    stageBlocks.forEach((block, i) => {
      const name = block.querySelector('.step-name-add')?.value.trim() || '';
      const raw = block.querySelector('.date-range-add')?.value.trim() || '';
      const parts = raw.split(/\s*[-–—]\s*/).filter(Boolean);
      const d1 = parts[0] || '';
      const d2 = parts[1] || parts[0] || '';
      formData.append(`stages[${i}].name`, name);
      formData.append(`stages[${i}].start_date`, localDateToStageFormat(formatDate(d1)));
      formData.append(`stages[${i}].end_date`, localDateToStageFormat(formatDate(d2)));      
    });

    // Сертификат
    formData.append('certificate_template.header_text', document.getElementById('title_certificate-add').value.trim());
    formData.append('certificate_template.description', document.getElementById('certificate-description-add').value.trim());
    const backgroundEl = document.getElementById('certificate-background');
    if (backgroundEl.files[0]) {
      formData.append('certificate_template.background', backgroundEl.files[0]);
    }

    // Слоты (online/offline/hybrid)
    let slotIndex = 0;
    if (formatVal === 'online' || formatVal === 'hybrid') {
      document.querySelectorAll('.add-classes-online .class-block').forEach(block => {
        formData.append(`assignment_slots[${slotIndex}].grade`, block.querySelector('.class-select')?.value || '');
        formData.append(`assignment_slots[${slotIndex}].format`, 'online');
        formData.append(`assignment_slots[${slotIndex}].start_at`, localDatetimeToUTC(block.querySelector('.start-datetime')?.value) || '');
        formData.append(`assignment_slots[${slotIndex}].end_at`, localDatetimeToUTC(block.querySelector('.end-datetime')?.value) || '');
        slotIndex++;
      });
    }
    if (formatVal === 'offline' || formatVal === 'hybrid') {
      document.querySelectorAll('.add-classes-offline .class-block').forEach(block => {
        formData.append(`assignment_slots[${slotIndex}].grade`, block.querySelector('.class-select')?.value || '');
        formData.append(`assignment_slots[${slotIndex}].format`, 'offline');
        formData.append(`assignment_slots[${slotIndex}].start_at`, localDatetimeToUTC(block.querySelector('.start-datetime')?.value) || '');
        formData.append(`assignment_slots[${slotIndex}].end_at`, localDatetimeToUTC(block.querySelector('.end-datetime')?.value) || '');
        formData.append(`assignment_slots[${slotIndex}].city`, block.querySelector('.offline-class-city-add')?.value || '');
        formData.append(`assignment_slots[${slotIndex}].address`, block.querySelector('.offline-class-address-add')?.value || '');
        slotIndex++;
      });
    }

    // --- Отправка ---
    const res = await fetch('https://portal.femo.kz/api/olympiads/dashboard/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || JSON.stringify(data));

    alert('Олимпиада успешно создана!');
    window.location.reload();
  } catch (err) {
    alert(`Ошибка при создании олимпиады: ${err.message}`);
  } finally {
    resetSubmitButton();
  }
}

function resetSubmitButton() {
  const submitBtn = document.getElementById('submit-add-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Добавить олимпиаду';
  }
  isSubmittingAdd = false;
}

// Утилита: «дд.мм.гггг» → «гггг‑мм‑дд»
function formatDate(dateStr) {
  const [d, m, y] = dateStr.split('.')
  return `${y}-${m}-${d}`
}

function addStageBlock() {
  const container = document.getElementById('stages-container');
  const template  = document.getElementById('stage-template');
  if (!container || !template) return;

  const clone = template.cloneNode(true);
  clone.removeAttribute('id');
  clone.classList.remove('hidden');
  clone.classList.add('stage-block');

  // очистим значения (input, textarea, select)
  clone.querySelectorAll('input, textarea, select').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else el.value = '';
  });

  // вставляем перед обёрткой с кнопкой
  const btnWrapper = container.querySelector('.mt-4');
  container.insertBefore(clone, btnWrapper);

  // инициализируем flatpickr
  const dateEl = clone.querySelector('.date-range-add');
  if (dateEl) {
    flatpickr(dateEl, {
      mode: 'range',
      dateFormat: 'd.m.Y',
      locale: flatpickr.l10ns.ru,
    });
  }
}

function addStageBlockEdit() {
  const container = document.getElementById('stages-container-edit');
  const template  = document.getElementById('stage-template-edit');
  if (!container || !template) return;

  const clone = template.cloneNode(true);
  clone.removeAttribute('id');
  clone.classList.remove('hidden');
  clone.classList.add('stage-block');

  clone.querySelectorAll('input, textarea, select').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else el.value = '';
  });

  const btnWrapper = container.querySelector('.mt-4');
  container.insertBefore(clone, btnWrapper);

  const dateEl = clone.querySelector('.date-range-add');
  if (dateEl) {
    flatpickr(dateEl, {
      mode: 'range',
      dateFormat: 'd.m.Y',
      locale: flatpickr.l10ns.ru,
    });
  }
}

// привязки (если их ещё нет — оставь; если уже есть, дублирование не нужно)
const addBtn = document.getElementById('add-stage-btn');
if (addBtn) addBtn.addEventListener('click', (e) => { e.preventDefault(); addStageBlock(); });

const addBtnEdit = document.getElementById('add-stage-btn-edit');
if (addBtnEdit) addBtnEdit.addEventListener('click', (e) => { e.preventDefault(); addStageBlockEdit(); });

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


  let isSubmittingEdit = false;

  async function updateOlympiadForm(olympiadId) {
    if (isSubmittingEdit) return; // защита от двойного клика
    isSubmittingEdit = true;
  
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        alert('Пожалуйста, войдите заново.');
        return;
      }
  
      // --- Основные поля ---
      const title = document.getElementById('title-edit')?.value.trim() || '';
      const type = document.getElementById('tour-edit')?.value || '';
      const gradesArr = tomGradesEdit?.items || [];
      const year = document.getElementById('year-edit')?.value || '';
      const status = document.getElementById('status-edit')?.value || '';
      const website = document.getElementById('link-edit')?.value.trim() || '';
      const cost = document.getElementById('price')?.value || '';
      const description = quillEdit ? quillEdit.root.innerHTML : '';
      const languageEl = document.getElementById('language-edit');
      const formatVal = document.getElementById('format-edit')?.value.trim().toLowerCase() || 'online';
  
      // --- Дата и локация ---
      const mobileDateInput = document.querySelector('#modalEdit .date-single-edit.flatpickr-mobile');
      const textDateInput = document.querySelector('#modalEdit .date-single-edit:not(.flatpickr-mobile)');
      const rawDate = (mobileDateInput?.value || textDateInput?.value || '').trim();
      let startAtToSend = '';
      if (rawDate) {
        startAtToSend = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
          ? `${rawDate}T00:00:00Z`
          : formatDateToISO(rawDate);
      }
  
      const locationToSend = (formatVal === 'offline' || formatVal === 'hybrid')
        ? (document.getElementById('location-edit')?.value || '').trim()
        : '';
  
      // --- Языки ---
      const selectedLangs = Array.from(languageEl?.selectedOptions || []).map(o => o.value).filter(Boolean);
      if (!selectedLangs.length) {
        alert('Выберите хотя бы один язык');
        return;
      }
  
      // --- Этапы ---
      const stages = [];
      const stageNodesEdit = Array.from(document.querySelectorAll('#stages-container-edit .stage-block'));
      for (const block of stageNodesEdit) {
        const name = block.querySelector('.step-name-add')?.value.trim() || '';
        const raw = block.querySelector('.date-range-add')?.value.trim() || '';
        if (!raw) {
          alert(`Укажите период для этапа "${name || 'без названия'}"`);
          return;
        }
        const parts = raw.split(/\s*[-–—]\s*/).map(s => s.trim()).filter(Boolean);
        const d1 = parts[0] || '';
        const d2 = parts[1] || parts[0] || '';
        stages.push({ name, start_date: formatDate(d1), end_date: formatDate(d2) });
      }
  
      // --- Сертификат ---
      const headerText = document.getElementById('title_certificate')?.value.trim() || '';
      if (!headerText) {
        alert('Введите текст заголовка сертификата');
        return;
      }
      const certDescription = document.getElementById('certificate-description-edit')?.value.trim() || '';
      const backgroundFile = document.getElementById('certificate-background-edit')?.files[0];
  
      // --- Формируем FormData ---
      const formData = new FormData();
      formData.append('format', formatVal);
      if (startAtToSend) formData.append('start_at', startAtToSend);
      if (locationToSend) formData.append('location', locationToSend);
  
      formData.append('title', title);
      formData.append('type', type);
      formData.append('grades', gradesArr.join(','));
      formData.append('year', year);
      formData.append('status', status);
      formData.append('website', website);
      formData.append('cost', cost);
      formData.append('description', description);
  
      formData.append('language', selectedLangs[0]);
      selectedLangs.forEach(lang => formData.append('languages', lang));
  
      stages.forEach((st, i) => {
        formData.append(`stages[${i}].name`, st.name);
        formData.append(`stages[${i}].start_date`, st.start_date);
        formData.append(`stages[${i}].end_date`, st.end_date);
      });
  
      formData.append('certificate_template.header_text', headerText);
      formData.append('certificate_template.description', certDescription);
      if (backgroundFile) formData.append('certificate_template.background', backgroundFile);
  
      // --- Слоты ---
      let slotIndex = 0;
  
      // Онлайн
      if (formatVal === 'online' || formatVal === 'hybrid') {
        const onlineBlocks = document.querySelectorAll('.edit-classes-online .class-block');
        onlineBlocks.forEach(block => {
          formData.append(`assignment_slots[${slotIndex}].grade`, block.querySelector('.edit-class-select')?.value || '');
          formData.append(`assignment_slots[${slotIndex}].format`, 'online');
          formData.append(`assignment_slots[${slotIndex}].start_at`, block.querySelector('.edit-start-datetime')?.value || '');
          formData.append(`assignment_slots[${slotIndex}].end_at`, block.querySelector('.edit-end-datetime')?.value || '');
          slotIndex++;
        });
      }
  
      // Оффлайн
      if (formatVal === 'offline' || formatVal === 'hybrid') {
        const offlineBlocks = document.querySelectorAll('.edit-classes-offline .class-block');
        offlineBlocks.forEach(block => {
          formData.append(`assignment_slots[${slotIndex}].grade`, block.querySelector('.edit-class-select')?.value || '');
          formData.append(`assignment_slots[${slotIndex}].format`, 'offline');
          formData.append(`assignment_slots[${slotIndex}].start_at`, block.querySelector('.edit-start-datetime')?.value || '');
          formData.append(`assignment_slots[${slotIndex}].end_at`, block.querySelector('.edit-end-datetime')?.value || '');
          formData.append(`assignment_slots[${slotIndex}].city`, block.querySelector('.edit-offline-class-city')?.value || '');
          formData.append(`assignment_slots[${slotIndex}].address`, block.querySelector('.edit-offline-class-address')?.value || '');
          slotIndex++;
        });
      }
  
      // --- PUT запрос ---
      const res = await fetch(`https://portal.femo.kz/api/olympiads/dashboard/${olympiadId}/`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
  
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
  
      alert('Олимпиада успешно обновлена!');
      toggleModal('modalEdit', false);
      await loadOlympiads();
      window.location.reload();
  
    } catch (err) {
      alert(`Ошибка при обновлении олимпиады: ${err.message}`);
    } finally {
      isSubmittingEdit = false;
    }
  }

// Делегируем клик по документу
document.addEventListener('click', function (e) {
  const tr = e.target.closest('tr');
  // Если клик не по <tr> или кликнули на кнопку внутри — выходим
  if (!tr || e.target.closest('button')) return;

  const idCell = tr.querySelector('td');
  if (!idCell) return;

  const olympiadId = parseInt(idCell.textContent.trim(), 10);
  openViewModal(olympiadId);
});

async function openViewModal(id) {
  try {
    const token = localStorage.getItem('access_token');
    const res = await authorizedFetch(
      `https://portal.femo.kz/api/olympiads/dashboard/${id}/`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    // 1) Заголовок модалки: кликабельная ссылка
    const titleLinkHtml = `<a href="${data.website}" target="_blank" class="text-blue-600 underline" style='text-decoration: none; color: inherit; '>${data.title}</a>`;
    document.getElementById('view-title').innerHTML       = titleLinkHtml;
    document.getElementById('view-field-title').innerHTML = titleLinkHtml;

    // 2) Общая информация
    const TOUR_MAP = {
      spring:        '🌸 Весна',
      autumn:        '🍂 Осень',
      winter:        '❄️ Зима',
      summer:        '☀️ Лето',
      international: '🌍 Международный',
    };
    // language: если пришёл массив languages — показываем все, иначе single language
    const LANG_MAP = {
      kazakh:  'Казахский',
      russian: 'Русский',
      english: 'Английский',
    };
    let langsToShow = [];
    if (Array.isArray(data.languages) && data.languages.length) {
      langsToShow = data.languages;
    } else if (data.language) {
      langsToShow = [data.language];
    }
    document.getElementById('view-field-language').textContent = langsToShow.map(l => LANG_MAP[l] || l).join(', ') || '—';

    document.getElementById('view-field-type').textContent        = TOUR_MAP[data.type] || data.type;
    document.getElementById('view-field-grades').textContent      = data.grades.join(', ');
    document.getElementById('view-field-year').textContent        = data.year;
    document.getElementById('view-field-status').textContent      = getStatusLabel(data.status);
    document.getElementById('view-link-website').href             = data.website;
    document.getElementById('view-link-website').textContent      = data.website;
    document.getElementById('view-field-cost').textContent        = data.cost;
    document.getElementById('view-field-language').textContent    = LANG_MAP[data.language] || data.language;
    document.getElementById('view-field-description').innerHTML   = data.description || '—';

    // 3) Этапы
    const stageLabelMap = {
      registration: 'Регистрация',
      stage1:       'Этап 1',
      stage2:       'Этап 2',
      final:        'Финал',
    };
    document.getElementById('view-stages').innerHTML = data.stages
      .map(s => {
        const label = stageLabelMap[s.name] || s.name;
        const from  = formatDateReverse(s.start_date);
        const to    = formatDateReverse(s.end_date);
        return `<li>${label}: ${from} — ${to}</li>`;
      })
      .join('');

      const cert = data.certificate_template || {};
      document.getElementById('view-cert-header').textContent      = cert.header_text || '—';
      document.getElementById('view-cert-description').textContent = cert.description || '—';

      // вытаскиваем имя файла и URL из ответа
      const bgUrl    = cert.background || '';
      const fileName = bgUrl.split('/').pop() || '—';

      // находим контейнер <dd> вокруг <img id="view-cert-background">
      const bgDd = document.getElementById('view-cert-background-dd');

      // заменяем содержимое на ссылку
      bgDd.innerHTML = `
        <a href="${bgUrl}" target="_blank" class="text-orange-primary flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
              stroke-width="1.5" stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5
                    A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 
                    0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6" />
          </svg>
          ${fileName}
        </a>
      `;
    // Показываем
    document.getElementById('modalView').classList.remove('hidden');
    document.getElementById('overlayModal').classList.remove('hidden');

  } catch (err) {
    alert('Не удалось загрузить данные: ' + err.message);
  }
}


function closeViewModal() {
  document.getElementById('modalView').classList.add('hidden');
  document.getElementById('overlayModal').classList.add('hidden');
}

/* ====== Утилиты для добавления блока класса (Add / Edit) ====== */
function insertClassBlock(containerEl, templateEl) {
  if (!containerEl || !templateEl) {
    console.warn('insertClassBlock: container или template не найдены', containerEl, templateEl);
    return null;
  }

  // Клонируем шаблон
  const clone = templateEl.cloneNode(true);

  // Убираем id'шники, чтобы не было дублей
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

  // Показываем и помечаем как рабочий блок
  clone.classList.remove('hidden');
  clone.classList.add('class-block');

  // Очистим значения input/select/textarea внутри клона
  clone.querySelectorAll('input, textarea, select').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else el.value = '';
  });

  // Вставляем перед обёрткой с кнопкой (если есть .mt-4), иначе в конец контейнера
  const btnWrapper = containerEl.querySelector('.mt-4') || containerEl;
  containerEl.insertBefore(clone, btnWrapper);

  return clone;
}

/* ====== Привязка для Edit-модалки (куда относится add-edit-online-class-btn) ====== */
(function attachEditClassAdders() {
  try {
    // Онлайн (edit)
    const editOnlineContainer = document.getElementById('edit-classes-container');
    const editOnlineTemplate  = document.getElementById('edit-online-class-template');
    const addEditOnlineBtn    = document.getElementById('add-edit-online-class-btn');

    if (addEditOnlineBtn) {
      addEditOnlineBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const newBlock = insertClassBlock(editOnlineContainer, editOnlineTemplate);
        // если нужно — можно сфокусировать первый input/select внутри:
        if (newBlock) {
          const sel = newBlock.querySelector('select, input, textarea');
          sel && sel.focus();
        }
      });
    }

    // Оффлайн (edit) — аналогично (если у вас есть такие элементы)
    const editOfflineContainer = document.getElementById('edit-offline-classes-container');
    const editOfflineTemplate  = document.getElementById('edit-offline-class-template-edit'); // проверьте точный ID шаблона
    const addEditOfflineBtn    = document.getElementById('add-edit-offline-class-btn');

    if (addEditOfflineBtn) {
      addEditOfflineBtn.addEventListener('click', (e) => {
        e.preventDefault();
        insertClassBlock(editOfflineContainer, editOfflineTemplate);
      });
    }
  } catch (err) {
    console.error('attachEditClassAdders error', err);
  }
})();

/* ====== Привязка для Add-модалки (если хотите также там) ======
   Примеры ID: #add-online-class-btn, #add-offline-class-btn, шаблон #class-template, #offline-class-template
*/
(function attachAddClassAdders() {
  try {
    const addOnlineContainer = document.querySelector('.add-classes-online'); // или явный ID
    const addOnlineTemplate  = document.getElementById('class-template');      // проверьте ID шаблона
    const addOnlineBtn       = document.getElementById('add-online-class-btn');

    if (addOnlineBtn) {
      addOnlineBtn.addEventListener('click', (e) => {
        e.preventDefault();
        insertClassBlock(addOnlineContainer, addOnlineTemplate);
      });
    }

    const addOfflineContainer = document.querySelector('.add-classes-offline');
    const addOfflineTemplate  = document.getElementById('offline-class-template'); // проверьте ID шаблона
    const addOfflineBtn       = document.getElementById('add-offline-class-btn');

    if (addOfflineBtn) {
      addOfflineBtn.addEventListener('click', (e) => {
        e.preventDefault();
        insertClassBlock(addOfflineContainer, addOfflineTemplate);
      });
    }
  } catch (err) {
    console.error('attachAddClassAdders error', err);
  }
})();
