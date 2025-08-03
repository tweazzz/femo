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

let participantProfile = null; 

function renderUserInfo(profile) {
  const avatarEl  = document.getElementById('user-avatar');
  const nameEl    = document.getElementById('user-name');
  const roleEl    = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  // --- аватар, имя, приветствие (как было) ---
  const defaultAvatar = '/src/assets/images/user_logo.jpg';
  const imgPath       = profile?.image;
  let finalAvatar = defaultAvatar;
  if (imgPath && typeof imgPath === 'string') {
    finalAvatar = imgPath.startsWith('http')
      ? imgPath
      : `https://portal.gradients.academy${imgPath}`;
  }
  avatarEl.src        = finalAvatar;
  nameEl.textContent  = profile.full_name_ru || '';
  const firstName     = profile.full_name_ru?.split(' ')[0] || '';
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`;

  // --- роль + флаг ---
  // Очищаем контейнер
  roleEl.innerHTML = '';

  // Спан для текста
  const span = document.createElement('span');
  span.textContent = 'Представитель';
  // inline-block и выравнивание по средней линии
  span.className = 'inline-block align-middle';
  roleEl.appendChild(span);

  // Флаг, если есть
  const country = profile.country;
  if (country?.code) {
    const code    = country.code.toLowerCase();
    const flagUrl = `https://flagcdn.com/16x12/${code}.png`;
    const img = document.createElement('img');
    img.src       = flagUrl;
    img.alt       = `Флаг ${country.name}`;
    // inline-block, выравнивание по средней линии, отступ слева
    img.className = 'inline-block align-middle ml-1';
    roleEl.appendChild(img);
  }
}

async function loadRepresentativeProfileForHeader() {
  try {
    const res = await authorizedFetch('https://portal.gradients.academy/api/users/representative/profile/');
    if (!res.ok) throw new Error(`Ошибка загрузки профиля представителя: ${res.status}`);

    const profile = await res.json();
    renderUserInfo(profile);
  } catch (err) {
    console.error('Ошибка при загрузке профиля для шапки:', err);
  }
}

let dynamicsChartInstance = null;

async function loadParticipantsDynamics() {
  try {
    const res = await authorizedFetch('https://portal.gradients.academy/api/results/representatives/dashboard/participants/dynamics');
    if (!res.ok) throw new Error(`Ошибка загрузки динамики: ${res.status}`);

    const data = await res.json();

    const labels = data.map(d => d.year.toString());
    const values = data.map(d => d.count);

    renderDynamicsChart(labels, values);
  } catch (err) {
    console.error('Ошибка при загрузке динамики участников:', err);
  }
}

function renderDynamicsChart(labels, values) {
  const ctx = document.getElementById('participantsChart').getContext('2d');

  if (dynamicsChartInstance) {
    dynamicsChartInstance.destroy();
  }

  dynamicsChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        borderWidth: 1,
        pointRadius: 3,
        pointHoverRadius: 10,
        pointBackgroundColor: '#fff',
        tension: 0.6,
        fill: true,
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        pointStyle: 'circle',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: {
            callback: (value) => value === 0 ? 0 : `${value} участников`
          },
          stepSize: 20,
          precision: 0,
          autoSkip: false,
        },
        x: {
          grid: { display: false },
          ticks: { autoSkip: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
        }
      }
    }
  });
}
async function loadParticipantsSummary() {
  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/api/results/representatives/dashboard/participants/summary'
    );
    if (!res.ok) throw new Error(`Ошибка при загрузке summary: ${res.status}`);

    const summary = await res.json();

    // Заполняем карточки
    document.getElementById('summary-avg-score').textContent =
      summary.avg_total_score ?? '—';

    document.getElementById('summary-above-half').textContent =
      `${summary.above_half.count} (${summary.above_half.percent}%)`;

    document.getElementById('summary-top100').textContent =
      `${summary.top100_count.country} из ${summary.top100_count.global}`;

    document.getElementById('summary-tasks-percent').textContent =
      `${summary.tasks_completion_percent}%`;
  } catch (err) {
    console.error('Ошибка при получении summary данных:', err);
  }
}

let chartInstance = null;

// 1. Загружаем список фильтров

async function loadDistributionOptions() {
  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/api/results/representatives/dashboard/participants/distribution/'
    );
    if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
    const data = await res.json();

    const olympiadsMap = new Map();
    const gradesSet = new Set();

    data.forEach(entry => {
      olympiadsMap.set(entry.olympiad.id, entry.olympiad.title);
      gradesSet.add(entry.grade);
    });

    fillOlympiadSelect(Array.from(olympiadsMap.entries()));
    fillGradeSelect(Array.from(gradesSet));
  } catch (err) {
    console.error('Ошибка загрузки фильтров:', err);
  }
}

// 2. Заполняем select для классов (без маппинга)

function fillGradeSelect(grades) {
  const select = document.getElementById('grade-filter');
  select.innerHTML = '<option value="">Все классы</option>';

  grades.forEach(grade => {
    const option = document.createElement('option');
    option.value = grade;
    option.textContent = grade;
    select.appendChild(option);
  });
}

// 3. Заполняем select для олимпиад
function fillOlympiadSelect(olympiads) {
  const select = document.getElementById('olympiad-filter');
  select.innerHTML = '<option value="">Выбрать олимпиаду</option>';

  olympiads.forEach(([id, title]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = title;
    select.appendChild(option);
  });
}

// 4. Загружаем данные для графика
async function loadDistributionData() {
  const olympiadId = document.getElementById('olympiad-filter').value;
  const grade = document.getElementById('grade-filter').value;

  if (!olympiadId || !grade) return;

  try {
    const url = `https://portal.gradients.academy/api/results/representatives/dashboard/participants/distribution/?grade=${grade}&olympiad_id=${olympiadId}`;
    const res = await authorizedFetch(url);
    if (!res.ok) throw new Error(`Ошибка: ${res.status}`);

    const data = await res.json();
    const counts = Array.isArray(data) && data.length
    ? data[0].distribution.map(d => d.count)
    : [];

    renderChart(counts);
  } catch (err) {
    console.error('Ошибка загрузки данных распределения:', err);
  }
}

// 5. Рендерим график
function renderChart(data) {
  const ctx = document.getElementById('participantsChart2').getContext('2d');

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'],
      datasets: [{
        label: 'Количество участников',
        data,
        backgroundColor: 'rgba(54, 162, 235, 1)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
        borderRadius: 10,
        barThickness: 25,
        maxBarThickness: 25,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: {
            callback: val => val === 0 ? 0 : `${val} участников`
          },
          stepSize: 20,
          precision: 0
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      }
    }
  });
}

let currentResults = []        // массив текущих участников
const sortDirections = {}      // хранит направление сортировки для полей
let currentPage = 1
let currentSearch = ''
let currentGrade = ''
let searchTimer = null

document.addEventListener('DOMContentLoaded', async () => {

  // 1) Вешаем фильтры
  const searchInput = document.querySelector('.search-input')
  const gradeSelect = document.querySelector('.grade-select')
  // 1. Проверяем авторизацию
  const user = await ensureUserAuthenticated()
  if (!user) {
    return // ensureUserAuthenticated сам сделает редирект
  }

  // 2. Рендерим шапку
  renderUserInfo(user.profile)

    // Поиск по имени (debounce 300 мс)
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      currentSearch = searchInput.value.trim()
      loadParticipantRanking(1)
    }, 300)
  })
    // Фильтр по классу
  gradeSelect.addEventListener('change', () => {
    currentGrade = gradeSelect.value
    loadParticipantRanking(1)
  })
  // 3. Подключаем фильтры
  document.getElementById('grade-filter')
    .addEventListener('change', loadDistributionData)
  document.getElementById('olympiad-filter')
    .addEventListener('change', loadDistributionData)

  // 4. Параллельно грузим остальное
  loadRepresentativeProfileForHeader()
  loadParticipantsDynamics()
  loadParticipantsSummary()
  loadDistributionOptions()

  // 5. Грузим первую страницу рейтинга
  await loadParticipantRanking(1)

  // 6. Навешиваем сортировку (только один раз, после того как currentResults уже есть)
  initSorting()
})

/** Загрузка и отброс пагинации/сортировки */
async function loadParticipantRanking(page = 1) {
  currentPage = page
  const tbody = document.querySelector('.table-overall tbody')
  const countEl = document.querySelector('.pagination-info')
  const pagesContainer = document.querySelector('.pagination-pages')
  const prevBtn = document.querySelector('.pagination-prev')
  const nextBtn = document.querySelector('.pagination-next')

  if (!tbody) return

  tbody.innerHTML = ''
  if (pagesContainer) pagesContainer.innerHTML = ''

  try {
    // Собираем query-параметры
    const params = new URLSearchParams()
    params.set('page', page)
    if (currentSearch) params.set('search', currentSearch)
    if (currentGrade) params.set('grade', currentGrade)

    const url = `https://portal.gradients.academy/api/results/representatives/dashboard/participants/ranking/?${params.toString()}`
    const res = await authorizedFetch(url)
    if (!res || !res.ok) {
      console.error(`Ошибка ${res?.status} при загрузке рейтинга`)
      return
    }

    const { count, next, previous, results } = await res.json()
    currentResults = results
    renderTableBody(results)

    // пагинация
    countEl && (countEl.textContent = `Всего ${count} участников`)
    if (pagesContainer) {
      const totalPages = Math.ceil(count / 20)
      for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button')
        btn.textContent = i
        btn.className = i === page
          ? 'border-orange-primary text-orange-primary rounded border-1 px-3 py-1'
          : 'text-gray-600 hover:bg-gray-50 px-3 py-1'
        btn.onclick = () => loadParticipantRanking(i)
        pagesContainer.appendChild(btn)
      }
    }
    if (prevBtn) prevBtn.disabled = !previous, prevBtn.onclick = () => previous && loadParticipantRanking(page - 1)
    if (nextBtn) nextBtn.disabled = !next,     nextBtn.onclick = () => next && loadParticipantRanking(page + 1)
  } catch (err) {
    console.error('Ошибка при загрузке рейтинга:', err)
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
function renderTableBody(data) {
  const tbody = document.querySelector('.table-overall tbody')
  tbody.innerHTML = ''
  data.forEach(p => {
    const tr = document.createElement('tr')
    tr.className = 'hover:bg-gray-50'
    tr.innerHTML = `
      <td class="text-center">${p.rank}</td>
      <td class="text-center">${p.country_rank}</td>
      <td>${p.full_name}</td>
      <td class="text-center">${reverseClassMap[p.grade] || '—'}</td>
      <td class="text-center">${p.olympiad_score ?? 0}</td>
      <td class="text-center">${p.task_score ?? 0}</td>
      <td class="text-center">${p.total_score ?? 0}</td>
    `
    tbody.appendChild(tr)
  })
}

/** Навешивает событие сортировки на все th.sortable */
function initSorting() {
  document.querySelectorAll('.table-overall thead th.sortable').forEach(th => {
    const field = th.dataset.field
    if (!field) return
    sortDirections[field] = 'asc'
    th.style.cursor = 'pointer'
    th.addEventListener('click', () => {
      const dir = sortDirections[field] === 'asc' ? 'desc' : 'asc'
      sortDirections[field] = dir
      sortAndRender(field, dir)
      updateHeaderIndicators(field, dir)
    })
  })
}

/** Сортируем currentResults и рендерим их */
function sortAndRender(field, dir) {
  const sorted = [...currentResults].sort((a, b) => {
    const aV = a[field] ?? 0
    const bV = b[field] ?? 0
    if (typeof aV === 'string') {
      return dir === 'asc' ? aV.localeCompare(bV) : bV.localeCompare(aV)
    }
    return dir === 'asc' ? aV - bV : bV - aV
  })
  renderTableBody(sorted)
}

/** Показываем направление стрелки только на активном столбце */
function updateHeaderIndicators(activeField, dir) {
  document.querySelectorAll('.table-overall thead th.sortable').forEach(th => {
    const icon = th.querySelector('svg.size-4')
    if (!icon) return
    if (th.dataset.field === activeField) {
      icon.style.transform = dir === 'asc' ? 'rotate(180deg)' : 'rotate(0deg)'
      icon.style.transition = 'transform .2s'
    } else {
      icon.style.transform = ''
    }
  })
}


// Сразу после initSorting() или в конце DOMContentLoaded:
document.getElementById('download-btn')?.addEventListener('click', async () => {
  try {
    // отправляем авторизованный запрос за файлом
    const res = await authorizedFetch(
      'https://portal.gradients.academy/api/results/representatives/dashboard/participants/ranking/download'
    );
    if (!res || !res.ok) {
      throw new Error(`Download error: ${res?.status}`);
    }

    // получаем blob и создаём ссылку для скачивания
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Можно подставить имя
    a.download = 'ranking.csv';  // или .xlsx, как вернёт бэкенд
    document.body.appendChild(a);
    a.click();

    // чистим
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Ошибка при скачивании результатов:', err);
    alert('Не удалось скачать результаты. Попробуйте позже.');
  }
});
