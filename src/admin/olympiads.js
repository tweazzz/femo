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
let currentEditId = null;
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

  const imgPath = p.image || '';
  avatarEl.src = imgPath
    ? (imgPath.startsWith('http') ? imgPath : `https://portal.femo.kz${imgPath}`)
    : '';

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
let tomGradesAdd, tomGradesEdit;
document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

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
    // Инициализируем TomSelect для Edit
  tomGradesEdit = new TomSelect('#grades-edit', {
    plugins: ['remove_button'],
    persist: false,
    create: false,
    maxItems: null,
    placeholder: 'Выберите классы...',
  });
  try {
        // 2) Подтягиваем актуальный профиль по API
    const profileData = await loadAdminProfile();
    // 3) Рисуем шапку
    renderUserInfo(profileData);
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
      <tr class="hover:bg-red-50 cursor-pointer">
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
    summer: '☀️ Лето',
    autumn: '🍂 Осень',
    winter: '❄️ Зима',
    international: '🌍 Международный'
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
  if (olympiad?.status === 'finished') {
    alert('Нельзя удалить завершённую олимпиаду.')
    return
  }

  try {
    const response = await fetch(
      `https://portal.femo.kz/api/olympiads/dashboard/${olympiadIdToDelete}`,
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
  olympiadIdToDelete = id;
  currentEditId = id;
  const modal = document.getElementById('modalEdit')
  const overlay = document.getElementById('overlayModal')

  try {
    const token = localStorage.getItem('access_token')
    const response = await authorizedFetch(`https://portal.femo.kz/api/olympiads/dashboard/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Ошибка загрузки олимпиады: ${response.status}`)
    }

    const data = await response.json()
    // Очистим tomSelect и добавим нужные элементы
    tomGradesEdit.clear(); 
    if (Array.isArray(data.grades) && data.grades.length) {
      data.grades.forEach(g => {
        // TomSelect требует строковое значение, поэтому приводим к строке
        tomGradesEdit.addItem(String(g));
      });
    }
    // Заполнение основных полей
    document.getElementById('title-edit').value = data.title
    document.getElementById('tour-edit').value = data.type || 'spring';
    document.getElementById('year-edit').value = data.year
    document.getElementById('status-edit').value = data.status
    document.getElementById('link-edit').value = data.website || ''
    document.getElementById('price').value = data.cost || ''
    document.getElementById('disc-edit').value = data.description || ''
    // Язык олимпиады
    // --- Язык: поддерживаем массив languages (если пришёл) ---
    const langSelect = document.getElementById('language-edit');
    if (langSelect) {
      // Если API вернул data.languages (массив) — ставим их, иначе пробуем data.language
      if (Array.isArray(data.languages) && data.languages.length) {
        Array.from(langSelect.options).forEach(opt => {
          opt.selected = data.languages.includes(opt.value);
        });
      } else {
        langSelect.value = data.language || 'kazakh';
      }
    }

    // --- Этапы: очистка и рендер ---
    const stageTemplate = document.getElementById('stage-template-edit');
    const stageContainer = stageTemplate.parentElement;
    // Удаляем все реальные блоки (оставляем шаблон)
    stageContainer.querySelectorAll('.stage-block').forEach(el => el.remove());

    if (data.stages && data.stages.length > 0) {
      // скрываем шаблон-пустышку
      stageTemplate.classList.add('hidden');

      data.stages.forEach(stage => {
        const clone = stageTemplate.cloneNode(true);
        clone.removeAttribute('id');
        clone.classList.remove('hidden');
        clone.classList.add('stage-block');

        const nameEl = clone.querySelector('.step-name-add');
        if (nameEl) nameEl.value = stage.name || '';

        const dateEl = clone.querySelector('.date-range-add');
        if (dateEl) {
          // Если даты одинаковы — показываем одну дату, иначе — диапазон
          const from = formatDateReverse(stage.start_date || '');
          const to   = formatDateReverse(stage.end_date || '');
          if (from && to && from === to) {
            dateEl.value = from;
          } else if (from && to) {
            dateEl.value = `${from} — ${to}`;
          } else {
            dateEl.value = from || to || '';
          }
        }

        // вставляем перед кнопкой
        const btnWrapper = stageContainer.querySelector('.mt-4');
        stageContainer.insertBefore(clone, btnWrapper);

        // инициализируем flatpickr (mode: range, но пользователь может выбрать одну дату)
        if (dateEl) {
          flatpickr(dateEl, {
            mode: 'range',
            dateFormat: 'd.m.Y',
            locale: flatpickr.l10ns.ru,
            allowInput: true,
          });
        }
      });
    } else {
      // если этапов нет — показываем пустой шаблон
      stageTemplate.classList.remove('hidden');
    }


  // Сертификат
  if (data.certificate_template) {
    // заголовок уже есть:
    document.getElementById('title_certificate-add').value =
      data.certificate_template.header_text || '';

    // вот теперь описание:
    const certDescEl = document.getElementById('certificate-description-edit');
    if (certDescEl) {
      certDescEl.value = data.certificate_template.description || '';
    }
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

  return true;
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

// Подвяжем слушатели — вызовем setSubmitAddState на input/change
function attachAddFormListeners() {
  const watchSelectors = [
    '#title-add', '#tour-add', '#year-add', '#status-add', '#language-add', '#price-add',
    '#certificate-background', '#disc-add'
  ];
  watchSelectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.addEventListener('input', setSubmitAddState);
    el.addEventListener('change', setSubmitAddState);
  });

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


async function submitOlympiadForm() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }
  if (!isAddFormValid()) {
    focusFirstInvalid();
    return;
  }

  // --- Общая информация ---
  const titleEl       = document.getElementById('title-add');
  const typeEl        = document.getElementById('tour-add');
  const gradesSelect  = document.getElementById('grades-add');
  const yearEl        = document.getElementById('year-add');
  const statusEl      = document.getElementById('status-add');
  const websiteEl     = document.getElementById('link-add');
  const costEl        = document.getElementById('price-add');
  const descriptionEl = document.getElementById('disc-add');
  const languageEl    = document.getElementById('language-add');

  const rawAdd = tomGradesAdd.items || [];
  const gradesArr = rawAdd.map(v => String(v));

  // --- Stages: собираем .stage-block и видимый шаблон, если есть ---
  const stages = [];
  let stageNodes = Array.from(document.querySelectorAll('#stages-container .stage-block'));
  const templateAdd = document.getElementById('stage-template');
  if (templateAdd && !templateAdd.classList.contains('hidden') && !templateAdd.classList.contains('stage-block')) {
    stageNodes.unshift(templateAdd);
  }

  for (const block of stageNodes) {
    const nameEl = block.querySelector('.step-name-add');
    const dateEl = block.querySelector('.date-range-add');

    const name = nameEl ? nameEl.value.trim() : '';
    const raw  = dateEl ? dateEl.value.trim() : '';

    if (!raw) {
      alert(`Укажите период для этапа "${name || 'без названия'}"`);
      throw new Error('stage validation failed');
    }

    // Разрешаем одну дату или диапазон
    const parts = raw.split(/\s*[-–—]\s*/).map(s => s.trim()).filter(Boolean);
    const d1 = parts[0] || '';
    const d2 = parts[1] || parts[0] || ''; // если только одна — дублируем
    stages.push({
      name,
      start_date: formatDate(d1),
      end_date: formatDate(d2),
    });
  }

  if (stages.length === 0) {
    alert('Добавьте хотя бы один этап');
    return;
  }

  // --- Certificate ---
  const headerEl       = document.getElementById('title_certificate-add');
  const certDescEl     = document.getElementById('certificate-description-add');
  const backgroundEl   = document.getElementById('certificate-background');
  if (!backgroundEl.files[0]) {
    alert('Пожалуйста, загрузите фон сертификата.');
    return;
  }

  // --- Languages: support multiple selections ---
  const selectedLangs = Array.from(languageEl.selectedOptions || []).map(o => o.value).filter(Boolean);
  if (!selectedLangs.length) {
    alert('Выберите хотя бы один язык олимпиады');
    return;
  }

  // --- Собираем FormData ---
  const formData = new FormData();
  formData.append('title',                      titleEl.value.trim());
  formData.append('type',                       typeEl.value);
  formData.append('grades',                     gradesArr.join(','));
  formData.append('year',                       yearEl.value);
  formData.append('status',                     statusEl.value);
  formData.append('website',                    websiteEl.value.trim());
  formData.append('cost',                       costEl.value);
  formData.append('description',                descriptionEl.value.trim());

  // Для совместимости: отправляем первое как single "language"
  formData.append('language', selectedLangs[0]);
  // И отправляем все как массив languages[]
  selectedLangs.forEach(lang => formData.append('language', lang));

  // Stages
  stages.forEach((st, i) => {
    formData.append(`stages[${i}].name`,       st.name);
    formData.append(`stages[${i}].start_date`, st.start_date);
    formData.append(`stages[${i}].end_date`,   st.end_date);
  });

  formData.append('certificate_template.header_text',  headerEl.value.trim());
  formData.append('certificate_template.description',  certDescEl.value.trim());
  formData.append('certificate_template.background',   backgroundEl.files[0]);

  // --- Отправка POST ---
  try {
    const res = await fetch(
      'https://portal.femo.kz/api/olympiads/dashboard/',
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    formData,
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.error('Ошибка сервера при создании:', data);
      throw new Error(data.detail || JSON.stringify(data));
    }
    alert('Олимпиада успешно создана! Страница будет перезагружена.');
    window.location.reload();
  } catch (err) {
    console.error('Ошибка при создании олимпиады:', err);
    alert(`Не удалось создать олимпиаду: ${err.message}`);
  }
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
const addBtn = document.querySelector('#modalAdd .btn-white');
if (addBtn) addBtn.addEventListener('click', addStageBlock);

const addBtnEdit = document.querySelector('#modalEdit .btn-white');
if (addBtnEdit) addBtnEdit.addEventListener('click', addStageBlockEdit);



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


async function updateOlympiadForm(olympiadId) {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Пожалуйста, войдите заново.');
    return;
  }

  const title       = document.getElementById('title-edit').value.trim();
  const type        = document.getElementById('tour-edit').value;
  const gradesArr = tomGradesEdit.items || [];
  const year        = document.getElementById('year-edit').value;
  const status      = document.getElementById('status-edit').value;
  const website     = document.getElementById('link-edit').value.trim();
  const cost        = document.getElementById('price').value;
  const description = document.getElementById('disc-edit').value.trim();
  const languageEl  = document.getElementById('language-edit');

  // Stages сбор (учитываем .stage-block и видимый шаблон)
  const stages = [];
  let stageNodesEdit = Array.from(document.querySelectorAll('#stages-container-edit .stage-block'));

  const templateEdit = document.getElementById('stage-template-edit');
  if (templateEdit && !templateEdit.classList.contains('hidden') && !templateEdit.classList.contains('stage-block')) {
    stageNodesEdit.unshift(templateEdit);
  }

  for (const block of stageNodesEdit) {
    const nameEl = block.querySelector('.step-name-add');
    const dateEl = block.querySelector('.date-range-add');
    const name = nameEl ? nameEl.value.trim() : '';
    const raw = dateEl ? dateEl.value.trim() : '';

    if (!raw) {
      alert(`Укажите период для этапа "${name || 'без названия'}"`);
      throw new Error('stage validation failed (edit)');
    }

    const parts = raw.split(/\s*[-–—]\s*/).map(s => s.trim()).filter(Boolean);
    const d1 = parts[0] || '';
    const d2 = parts[1] || parts[0] || '';
    stages.push({ name, start_date: formatDate(d1), end_date: formatDate(d2) });
  }

  // Certificate fields
  const headerText      = document.querySelector('input[name="title_certificate"]').value.trim();
  const certDescriptionEl = document.getElementById('certificate-description-edit');
  const certDescription = certDescriptionEl ? certDescriptionEl.value.trim() : '';
  const backgroundFile  = document.getElementById('certificate-background-edit').files[0];

  // Languages: multiple
  const selectedLangs = Array.from(languageEl.selectedOptions || []).map(o => o.value).filter(Boolean);
  if (!selectedLangs.length) {
    alert('Выберите хотя бы один язык');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('type', type);
  formData.append('grades', gradesArr.join(','));
  formData.append('year', year);
  formData.append('status', status);
  formData.append('website', website);
  formData.append('cost', cost);
  formData.append('description', description);

  // backwards-compatible single language
  formData.append('language', selectedLangs[0]);
  // multiple languages entries
  selectedLangs.forEach(lang => formData.append('languages', lang));

  stages.forEach((st, i) => {
    formData.append(`stages[${i}].name`,       st.name);
    formData.append(`stages[${i}].start_date`, st.start_date);
    formData.append(`stages[${i}].end_date`,   st.end_date);
  });

  formData.append('certificate_template.header_text', headerText);
  formData.append('certificate_template.description', certDescription);
  if (backgroundFile) {
    formData.append('certificate_template.background', backgroundFile);
  }

  // PUT request
  const res = await authorizedFetch(
    `https://portal.femo.kz/api/olympiads/dashboard/${olympiadId}/`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
  alert('Олимпиада успешно обновлена!');
  toggleModal('modalEdit', false);
  await loadOlympiads();
  window.location.reload();
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
      `https://portal.femo.kz/api/olympiads/dashboard/${id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();

    // 1) Заголовок модалки: кликабельная ссылка
    const titleLinkHtml = `<a href="${data.website}" target="_blank" class="text-blue-600 underline">${data.title}</a>`;
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
    document.getElementById('view-field-description').textContent = data.description || '—';

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