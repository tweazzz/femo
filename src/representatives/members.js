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
  if (role !== 'representative') {
    console.warn(`Пользователь с ролью "${role}" не имеет доступа к админке. Редирект.`)
    window.location.href = '/index.html'
    return null
  }

  return user
}

function renderUserInfo(profile) {
  const avatarEl  = document.getElementById('user-avatar');
  const nameEl    = document.getElementById('user-name');
  const roleEl    = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  if (!avatarEl || !nameEl || !roleEl || !welcomeEl) {
    console.warn('renderUserInfo: missing DOM elements');
    return;
  }

  const imgPath = profile.image || '';
  avatarEl.src = imgPath
    ? (imgPath.startsWith('http') ? imgPath : `https://portal.femo.kz${imgPath}`)
    : '';

  // name (если хочешь имя на en/ru — решай отдельно)
  nameEl.textContent = profile.full_name_ru || profile.full_name_en || '';

  const firstName = (profile.full_name_ru || profile.full_name_en || '').split(' ')[0] || '';

  // вместо innerHTML — создаём span программно и не ломаем DOM
  // если внутри welcomeEl уже есть span с data-i18n — перезаписываем только его текст
  let greetSpan = welcomeEl.querySelector('span[data-i18n="welcome.message_rep"]');
  if (!greetSpan) {
    greetSpan = document.createElement('span');
    greetSpan.setAttribute('data-i18n', 'welcome.message_rep');
    // английский/русский запасной текст
    greetSpan.textContent = 'Добро пожаловать,';
    // вставляем span в начало h1
    welcomeEl.innerHTML = ''; // очищаем, но затем добавим span and name
    welcomeEl.appendChild(greetSpan);
    welcomeEl.append(document.createTextNode(' ' + firstName + ' 👋'));
  } else {
    // если span уже есть, просто обновляем имя (не трогаем span текст, чтобы i18n мог его заменить)
    // удаляем все текстовые узлы после span и добавляем имя
    // сначала убираем все узлы после span
    let node = greetSpan.nextSibling;
    while (node) {
      const next = node.nextSibling;
      node.remove();
      node = next;
    }
    // добавляем пробел + имя
    greetSpan.after(document.createTextNode(' ' + firstName + ' 👋'));
  }

  // если словарь уже загружен, применим перевод к новому span
  if (window.i18nDict && Object.keys(window.i18nDict).length > 0) {
    try {
      // вызываем applyTranslations для нового span (или всей страницы)
      applyTranslations(window.i18nDict);
    } catch (e) {
      console.warn('applyTranslations error', e);
    }
  } else {
    // если словарь ещё не загружен — ничего не делаем. langInit / setLanguage позже подхватит span.
  }

  const roleMap = { administrator: 'Представитель', representative: 'Представитель' };
  roleEl.textContent = roleMap[profile.role] || profile.role || '';
}

async function loadRepresentativeProfileForHeader() {
  try {
    const res = await authorizedFetch('https://portal.femo.kz/api/users/representative/profile/');
    if (!res.ok) throw new Error(`Ошибка загрузки профиля представителя: ${res.status}`);

    const profile = await res.json();
    renderUserInfo(profile);
  } catch (err) {
    console.error('Ошибка при загрузке профиля для шапки:', err);
  }
}

  // 1) Глобальные переменные
  let allParticipants = [];
  let currentPage = 1;
  const pageSize = 20;
  let sortField = null;
  let sortDir = 1;
  let filteredParticipants = [];
  let currentDeleteId = null;
  

  // NEW: ссылки на элементы фильтра и поиска
const searchInput = document.getElementById('search-input');
const gradeSelect = document.getElementById('grade-filter');

  function attachSortHandlers() {
  document.querySelectorAll('th[data-sort-field]').forEach((th) => {
    th.classList.add('cursor-pointer');
    th.addEventListener('click', () => {
      const field = th.dataset.sortField;
      if (sortField === field) {
        sortDir = -sortDir;    // меняем направление
      } else {
        sortField = field;     // новое поле
        sortDir = 1;           // asc
      }
      currentPage = 1;
      updateView();
    });
  });
}

// Заполняем выпадающий список классами
function populateGradesDropdown() {
  const grades = [...new Set(allParticipants.map(u => u.grade).filter(Boolean))];
  gradeSelect.innerHTML = '<option value="">Все классы</option>'
    + grades.map(g => `<option value="${g}">${g}</option>`).join('');
}

// Применяем фильтр поиска + класса
function applyFilters() {
  const term = searchInput.value.trim().toLowerCase();
  const grade = gradeSelect.value;

  filteredParticipants = allParticipants.filter(u => {
    const matchSearch =
      u.full_name.toLowerCase().includes(term) ||
      String(u.id).includes(term);
    const matchGrade = !grade || u.grade === grade;
    return matchSearch && matchGrade;
  });

  currentPage = 1;
  updateView();
}

// Вешаем обработчики на поле поиска и дропдаун
function attachFilterHandlers() {
  searchInput.addEventListener('input', () => {
    clearTimeout(window._searchDebounce);
    window._searchDebounce = setTimeout(applyFilters, 300);
  });
  gradeSelect.addEventListener('change', applyFilters);
}


  // 2) Загрузка всех участников
  async function loadParticipants() {
    try {
      const res = await authorizedFetch(
        'https://portal.femo.kz/api/results/representatives/dashboard/participants'
      );
      if (!res.ok) throw new Error('Ошибка загрузки участников');

      const json = await res.json();
      allParticipants = json.results || [];

    filteredParticipants = allParticipants.slice();
    populateGradesDropdown();
    attachFilterHandlers();
      // 3) Обновляем надпись «Всего N участников»
      document.getElementById('participants-count').textContent =
        `Всего ${json.count} участников`;

      // 4) Рисуем таблицу и пагинацию
      attachSortHandlers();
      currentPage = 1;
      renderTable();
      renderPagination();
    } catch (err) {
      console.error(err);
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
  
  // 5) Рендерим строки таблицы для текущей страницы
function renderTable() {
    const tbody = document.getElementById('participants-tbody');
    tbody.innerHTML = '';
    
    let data = filteredParticipants.slice();
    if (sortField) {
    data.sort((a, b) => {
        let va = a[sortField], vb = b[sortField];
        if (typeof va === 'string') {
        return sortDir * va.localeCompare(vb || '');
        }
        va = va ?? 0; vb = vb ?? 0;
        return sortDir * (va - vb);
    });
    }
    const dataSource = filteredParticipants;
    const start = (currentPage - 1) * pageSize;
    const pageItems = data.slice(start, start + pageSize);

    if (pageItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-gray-500">
            Нет участников на этой странице
          </td>
        </tr>`;
      return;
    }

    for (const user of pageItems) {
      const tr = document.createElement('tr');
      tr.classList.add('hover:bg-gray-50');
      tr.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">
          <a href="members-progress.html?id=${user.id}" class="flex items-center">
          <div class="flex items-center">
            <img
              class="h-8 w-8 rounded-full"
              src="${user.image || '/src/assets/images/user_logo.jpg'}"
              alt="avatar"
            />
            <div class="ml-4">
              <div class="text-sm font-medium text-gray-900">
                ${user.full_name}
              </div>
            </div>
          </div>
          </a>
        </td>
        <td class="px-6 py-4 text-sm whitespace-nowrap">${user.id}</td>
        <td class="px-6 py-4 text-sm whitespace-nowrap">${reverseClassMap[user.grade] || '—'}</td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="text-sm text-gray-900">${user.city || ''}</span>
        </td>
        <td class="px-6 py-4 text-sm whitespace-nowrap" style="color: orange; font-weight: bold">
          ${user.scores ?? 0}
        </td>
        <td class="px-6 py-4 text-sm whitespace-nowrap">
          <div class="flex justify-between gap-2">
            <button class="text-gray-400 hover:text-red-500"
        onclick="openDeleteModal(${user.id})">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none"
                   viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button class="hover:text-blue-primary text-gray-400" onclick="toggleModal('modalEdit')">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none"
                   viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  // 6) Рендер пагинации: ‹ [1][2][3] ›
function renderPagination() {
  const container = document.getElementById('pagination-container');
  container.innerHTML = '';

  const total = filteredParticipants.length;
  const totalPages = Math.ceil(total / pageSize);

  // Если вообще нет участников
  if (totalPages === 0) {
    return;
  }

  // Кнопка «‹»
  const prev = document.createElement('button');
  prev.className = 'cursor-pointer px-3 py-1';
  prev.textContent = '‹';
  prev.disabled = currentPage === 1;
  prev.onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      updateView();
    }
  };
  container.appendChild(prev);

  // Номера страниц (от 1 до totalPages)
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = i === currentPage
      ? 'border-orange-primary text-orange-primary rounded border-1 px-3 py-1'
      : 'px-3 py-1 text-gray-600 hover:bg-gray-50';
    btn.onclick = () => {
      if (currentPage !== i) {
        currentPage = i;
        updateView();
      }
    };
    container.appendChild(btn);
  }

  // Кнопка «›»
  const next = document.createElement('button');
  next.className = 'cursor-pointer px-3 py-1';
  next.textContent = '›';
  next.disabled = currentPage === totalPages;
  next.onclick = () => {
    if (currentPage < totalPages) {
      currentPage++;
      updateView();
    }
  };
  container.appendChild(next);

  // И надпись «Всего N участников»
  document.getElementById('participants-count').textContent =
    `Всего ${total} участников`;
}

  // 7) Помощник, чтобы обновить сразу таблицу + пагинацию
  function updateView() {
    renderTable();
    renderPagination();
  }
function openDeleteModal(id) {
  currentDeleteId = id;
  toggleModal('modalDel');
}
// download
document.getElementById('export-btn').addEventListener('click', async () => {
  try {
    const res = await authorizedFetch(
      'https://portal.femo.kz/api/results/representatives/dashboard/participants/export/'
    );
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);

    // получаем файл
    const blob = await res.blob();
    // создаём ссылку и скачиваем
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // можно задать имя файла
    a.download = 'participants_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Ошибка при экспорте участников:', err);
    alert('Не удалось скачать данные. Попробуйте позже.');
  }
});
document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
  if (!currentDeleteId) return;
  try {
    const res = await authorizedFetch(
    `https://portal.femo.kz/api/results/representatives/dashboard/participants/${currentDeleteId}/`,
    { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    toggleModal('modalDel');       // закрываем модалку
    await loadParticipants();      // перезагружаем список
  } catch (err) {
    console.error('Ошибка при удалении участника:', err);
    alert('Не удалось удалить участника');
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user)

  try {
    await loadParticipants();
    await loadRepresentativeProfileForHeader();
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})
