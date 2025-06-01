// participantsDistribution.js

// === 1) Маппинг для классов: метки из <select> → API-значения ===
const gradeMap = {
  '1 класс': 'first',
  '2 класс': 'second',
  '3 класс': 'third',
  '4 класс': 'fourth',
  '5 класс': 'fifth',
  '6 класс': 'sixth',
  '7 класс': 'seventh',
  '8 класс': 'eights',
  '9 класс': 'nines',
  '10 класс': 'tens',
  '11 класс': 'elevens'
};

// === 2) Глобальные переменные для Chart.js-инстансов ===
let distributionChartInstance = null;
let dynamicsChartInstance = null;

// === 3) Фиксированные подписи для оси X (распределение) ===
const FIXED_LABELS = ['0-20', '21-40', '41-60', '61-80', '81-100'];

// === 4) Пагинация для рейтинга ===
let rankingCurrentPage = 1;
const rankingPageSize = 20;
let rankingTotalCount = 0;
let rankingTotalPages = 1;

// === 5) Данные текущей страницы рейтинга и состояния фильтров/сортировки ===
let currentRankingData = [];      // данные, полученные с сервера для текущей страницы
let displayedRankingData = [];    // после фильтрации и сортировки
let currentSortKey = null;        // текущая колонка сортировки
let currentSortAsc = true;        // направление сортировки
let currentNameFilter = '';       // фильтр по имени
let currentGradeFilter = '';      // фильтр по классу для таблицы

// ==================================================================================
//                      ФУНКЦИИ АВТОРИЗАЦИИ И ШАПКИ (HEADER)
// ==================================================================================

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

  const user = JSON.parse(userData);
  const role = user.profile?.role;
  if (role !== 'representative') {
    console.warn(`Пользователь с ролью "${role}" не имеет доступа к админке. Редирект.`);
    window.location.href = '/index.html';
    return null;
  }

  return user;
}

function renderUserInfo(profile) {
  const avatarEl = document.getElementById('user-avatar');
  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  const defaultAvatar = '/src/assets/images/user_logo.jpg';
  const imgPath = profile?.image;

  let finalAvatar = defaultAvatar;
  if (imgPath && typeof imgPath === 'string') {
    finalAvatar = imgPath.startsWith('http') ? imgPath : `https://portal.gradients.academy${imgPath}`;
  }

  if (avatarEl) avatarEl.src = finalAvatar;
  if (nameEl) nameEl.textContent = profile.full_name_ru || '';
  const firstName = profile.full_name_ru?.split(' ')[0] || '';
  if (welcomeEl) welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`;

  const countryCode = profile.country?.code || '';
  if (roleEl) roleEl.textContent = `Представитель${countryCode ? ' ' + countryCode : ''}`;
}

async function loadRepresentativeProfileForHeader() {
  try {
    const res = await authorizedFetch('https://portal.gradients.academy/users/representative/profile/');
    if (!res.ok) throw new Error(`Ошибка загрузки профиля представителя: ${res.status}`);
    const profile = await res.json();
    renderUserInfo(profile);
  } catch (err) {
    console.error('Ошибка при загрузке профиля для шапки:', err);
  }
}

// ==================================================================================
//                    Загрузка списка олимпиад для ЧАРТОВ (id="olympiad-filter")
// ==================================================================================

async function loadChartOlympiads() {
  try {
    let allOlympiads = [];
    let url = 'https://portal.gradients.academy/common/olympiads/';
    while (url) {
      const res = await authorizedFetch(url);
      if (!res.ok) {
        throw new Error(`Ошибка при загрузке олимпиад для чартов: ${res.status}`);
      }
      const json = await res.json();
      allOlympiads.push(...json.results);
      url = json.next;
    }
    fillChartOlympiadSelect(allOlympiads);
  } catch (err) {
    console.error('Ошибка loadChartOlympiads:', err);
  }
}

function fillChartOlympiadSelect(olympiads) {
  const select = document.getElementById('olympiad-filter');
  if (!select) return;
  select.innerHTML = '<option value="">Выбрать олимпиаду (для чартов)</option>';
  olympiads.forEach(o => {
    const option = document.createElement('option');
    option.value = o.id;
    option.textContent = o.title;
    select.appendChild(option);
  });
}

// ==================================================================================
//                    Загрузка списка олимпиад для SUMMARY (id="summary-olympiad-filter")
// ==================================================================================

async function loadSummaryOlympiads() {
  try {
    let allOlympiads = [];
    let url = 'https://portal.gradients.academy/common/olympiads/';
    while (url) {
      const res = await authorizedFetch(url);
      if (!res.ok) {
        throw new Error(`Ошибка при загрузке олимпиад для summary: ${res.status}`);
      }
      const json = await res.json();
      allOlympiads.push(...json.results);
      url = json.next;
    }
    fillSummaryOlympiadSelect(allOlympiads);
  } catch (err) {
    console.error('Ошибка loadSummaryOlympiads:', err);
  }
}

function fillSummaryOlympiadSelect(olympiads) {
  const select = document.getElementById('summary-olympiad-filter');
  if (!select || olympiads.length === 0) return;
  select.innerHTML = '';
  olympiads.forEach((o, idx) => {
    const option = document.createElement('option');
    option.value = o.id;
    option.textContent = o.title;
    if (idx === 0) option.selected = true;
    select.appendChild(option);
  });
  // Сразу загрузить данные для первой олимпиады
  loadOlympiadSummary(olympiads[0].id);
  loadOlympiadRanking(olympiads[0].id, 1);
}

// ==================================================================================
//                       Загрузка данных распределения и построение графика
// ==================================================================================

async function loadDistributionData() {
  const gradeSelect = document.getElementById('grade-filter');
  const chartSelect = document.getElementById('olympiad-filter');
  if (!gradeSelect || !chartSelect) return;

  const gradeLabel = gradeSelect.value;
  const olympiadId = chartSelect.value;

  if (!gradeLabel || !olympiadId) {
    if (distributionChartInstance) {
      distributionChartInstance.destroy();
      distributionChartInstance = null;
    }
    return;
  }

  const gradeParam = gradeMap[gradeLabel];
  if (!gradeParam) return;

  try {
    const url = `https://portal.gradients.academy/results/representatives/dashboard/participants/distribution/?grade=${gradeParam}&olympiad_id=${olympiadId}`;
    const res = await authorizedFetch(url);
    if (!res.ok) throw new Error(`Ошибка loadDistributionData: ${res.status}`);
    const data = await res.json();

    const distributionArray = Array.isArray(data) && data.length
      ? data[0].distribution
      : [];
    const counts = FIXED_LABELS.map((_, idx) => {
      const entry = distributionArray[idx];
      return entry ? entry.count : 0;
    });

    renderDistributionChart(FIXED_LABELS, counts);
  } catch (err) {
    console.error('Ошибка loadDistributionData:', err);
  }
}

function renderDistributionChart(labels, data) {
  const canvas = document.getElementById('participantsChart2');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (distributionChartInstance) {
    distributionChartInstance.destroy();
  }

  distributionChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(l => l + ' %'),
      datasets: [{
        label: 'Количество участников',
        data: data,
        backgroundColor: 'rgba(54, 162, 235, 1)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
        borderSkipped: false,
        borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 10, bottomRight: 10 },
        barThickness: 25,
        maxBarThickness: 25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: false } },
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: {
            callback: value => (value === 0 ? 0 : value + ' участников')
          },
          stepSize: 20,
          precision: 0,
          autoSkip: false
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      }
    }
  });
}

// ==================================================================================
//                         Загрузка динамики участников и «линейный» чарт
// ==================================================================================

async function loadParticipantsDynamics() {
  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/results/representatives/dashboard/participants/dynamics'
    );
    if (!res.ok) throw new Error(`Ошибка loadParticipantsDynamics: ${res.status}`);
    const data = await res.json();

    const labels = data.map(d => d.year.toString());
    const values = data.map(d => d.count);

    renderDynamicsChart(labels, values);
  } catch (err) {
    console.error('Ошибка loadParticipantsDynamics:', err);
  }
}

function renderDynamicsChart(labels, values) {
  const canvas = document.getElementById('participantsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

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
        pointStyle: 'circle'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: { callback: value => (value === 0 ? 0 : `${value} участников`) },
          stepSize: 20,
          precision: 0,
          autoSkip: false
        },
        x: { grid: { display: false }, ticks: { autoSkip: false } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      }
    }
  });
}

// ==================================================================================
//                      Загрузка и отрисовка summary-карточек (отдельно)
// ==================================================================================

const MONTH_NAMES = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

function formatDateRange(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day1 = start.getDate();
  const month1 = MONTH_NAMES[start.getMonth()];
  const day2 = end.getDate();
  const month2 = MONTH_NAMES[end.getMonth()];
  const yearShort = String(end.getFullYear()).slice(-2);

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${day1}–${day2} ${month1} ${yearShort}г.`;
  } else {
    return `${day1} ${month1} – ${day2} ${month2} ${yearShort}г.`;
  }
}

async function loadOlympiadSummary(olympiadId) {
  if (!olympiadId) {
    clearSummaryCards();
    return;
  }
  try {
    const url = `https://portal.gradients.academy/results/representative/dashboard/olympiads/${olympiadId}/summary`;
    const res = await authorizedFetch(url);
    if (!res.ok) throw new Error(`Ошибка loadOlympiadSummary: ${res.status}`);
    const data = await res.json();
    fillSummaryCards(data);
  } catch (err) {
    console.error('Ошибка loadOlympiadSummary:', err);
    clearSummaryCards();
  }
}

function clearSummaryCards() {
  const titleP = document.querySelector('#summary-title p.text-blue-primary');
  if (titleP) titleP.textContent = '';

  const datesP = document.querySelector('#summary-dates p.text-red-primary');
  if (datesP) datesP.textContent = '';

  const participantsP = document.querySelector('#summary-participants p.text-violet-primary');
  if (participantsP) participantsP.textContent = '';

  const avgScoreP = document.querySelector('#summary-avg-score p.text-orange-primary');
  if (avgScoreP) avgScoreP.textContent = '';
}

function fillSummaryCards(summary) {
  const titleP = document.querySelector('#summary-title p.text-blue-primary');
  if (titleP) {
    titleP.textContent = summary.title;
  }

  const datesP = document.querySelector('#summary-dates p.text-red-primary');
  if (datesP) {
    datesP.textContent = formatDateRange(summary.start_date, summary.end_date);
  }

  const participantsP = document.querySelector('#summary-participants p.text-violet-primary');
  if (participantsP) {
    participantsP.textContent = summary.participants_count;
  }

  const avgScoreP = document.querySelector('#summary-avg-score p.text-orange-primary');
  if (avgScoreP) {
    avgScoreP.textContent = summary.avg_score;
  }
}

// ==================================================================================
//                      Загрузка и отрисовка рейтинга участников (таблица) с пагинацией,
//                       фильтром, поиском и сортировкой
// ==================================================================================

async function loadOlympiadRanking(olympiadId, page = 1) {
  const tbody = document.querySelector('.table-overall tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!olympiadId) return;

  try {
    const url = `https://portal.gradients.academy/results/representative/dashboard/olympiads/${olympiadId}/ranking?page=${page}&page_size=${rankingPageSize}`;
    const res = await authorizedFetch(url);
    if (!res.ok) throw new Error(`Ошибка loadOlympiadRanking: ${res.status}`);
    const json = await res.json();
    const data = json.results;
    rankingTotalCount = json.count;
    rankingTotalPages = Math.ceil(rankingTotalCount / rankingPageSize);
    rankingCurrentPage = page;

    // Обновляем "Всего X участников"
    const totalCountEl = document.getElementById('total-count');
    if (totalCountEl) {
      totalCountEl.textContent = `Всего ${rankingTotalCount} участников`;
    }

    currentRankingData = data;
    applyFiltersAndSorting();

    renderPaginationControls();
  } catch (err) {
    console.error('Ошибка loadOlympiadRanking:', err);
  }
}

function applyFiltersAndSorting() {
  let arr = currentRankingData.slice();

  // Фильтр по имени
  if (currentNameFilter.trim() !== '') {
    const needle = currentNameFilter.trim().toLowerCase();
    arr = arr.filter(item => item.full_name.toLowerCase().includes(needle));
  }

  // Фильтр по классу
  if (currentGradeFilter) {
    const gradeParam = gradeMap[currentGradeFilter];
    if (gradeParam) {
      arr = arr.filter(item => item.grade === gradeParam);
    }
  }

  // Сортировка
  if (currentSortKey) {
    arr.sort((a, b) => {
      let av = a[currentSortKey];
      let bv = b[currentSortKey];

      if (currentSortKey === 'global_rank' || currentSortKey === 'country_rank' ||
          currentSortKey === 'olympiad_score' || currentSortKey === 'total_score' ||
          currentSortKey === 'solved_tasks') {
        av = Number(av);
        bv = Number(bv);
      }

      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();

      if (av < bv) return currentSortAsc ? -1 : 1;
      if (av > bv) return currentSortAsc ? 1 : -1;
      return 0;
    });
  }

  displayedRankingData = arr;
  renderRankingRows();
}

function renderRankingRows() {
  const tbody = document.querySelector('.table-overall tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  displayedRankingData.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.classList.add('hover:bg-gray-50');

    // Глобальный ранг
    const globalRankCell = document.createElement('td');
    globalRankCell.className = 'text-center';
    globalRankCell.textContent = item.global_rank;
    tr.appendChild(globalRankCell);

    // Ранг в стране: корона для топ-3
    const countryRankCell = document.createElement('td');
    countryRankCell.className = 'text-center';
    countryRankCell.textContent = (idx < 3) ? '👑' : item.country_rank;
    tr.appendChild(countryRankCell);

    // Имя участника
    const nameCell = document.createElement('td');
    nameCell.textContent = item.full_name;
    tr.appendChild(nameCell);

    // Класс: переводим обратно в метку
    const gradeCell = document.createElement('td');
    gradeCell.className = 'text-center';
    gradeCell.textContent = item.grade; // Было: преобразование через gradeMap
    tr.appendChild(gradeCell);

    // Баллы за олимпиаду
    const scoreCell = document.createElement('td');
    scoreCell.className = 'text-center';
    scoreCell.textContent = item.olympiad_score;
    tr.appendChild(scoreCell);

    // Результат: solved_tasks/total_tasks
    const resultCell = document.createElement('td');
    resultCell.className = 'text-center';
    resultCell.textContent = `${item.solved_tasks}/${item.total_tasks}`;
    tr.appendChild(resultCell);

    // Общие Баллы
    const totalCell = document.createElement('td');
    totalCell.className = 'text-center';
    totalCell.textContent = item.total_score;
    tr.appendChild(totalCell);

    tbody.appendChild(tr);
  });
}

function renderPaginationControls() {
  const pagesContainer = document.getElementById('pagination-pages');
  const prevBtn = document.getElementById('pagination-prev');
  const nextBtn = document.getElementById('pagination-next');

  if (!pagesContainer || !prevBtn || !nextBtn) return;
  pagesContainer.innerHTML = '';

  const maxButtons = 5;
  let startPage = Math.max(1, rankingCurrentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(rankingTotalPages, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    const btn = document.createElement('button');
    btn.className = `px-3 py-1 ${p === rankingCurrentPage ? 'border-orange-primary text-orange-primary rounded border' : 'text-gray-600 hover:bg-gray-50'}`;
    btn.textContent = p;
    btn.addEventListener('click', () => {
      if (p !== rankingCurrentPage) {
        const summarySelect = document.getElementById('summary-olympiad-filter');
        if (summarySelect) {
          loadOlympiadRanking(summarySelect.value, p);
        }
      }
    });
    pagesContainer.appendChild(btn);
  }

  if (rankingCurrentPage <= 1) {
    prevBtn.disabled = true;
    prevBtn.classList.add('opacity-50', 'cursor-not-allowed');
  } else {
    prevBtn.disabled = false;
    prevBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    prevBtn.onclick = () => {
      const summarySelect = document.getElementById('summary-olympiad-filter');
      if (summarySelect) {
        loadOlympiadRanking(summarySelect.value, rankingCurrentPage - 1);
      }
    };
  }

  if (rankingCurrentPage >= rankingTotalPages) {
    nextBtn.disabled = true;
    nextBtn.classList.add('opacity-50', 'cursor-not-allowed');
  } else {
    nextBtn.disabled = false;
    nextBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    nextBtn.onclick = () => {
      const summarySelect = document.getElementById('summary-olympiad-filter');
      if (summarySelect) {
        loadOlympiadRanking(summarySelect.value, rankingCurrentPage + 1);
      }
    };
  }
}

// ==================================================================================
//                      ОБРАБОТЧИКИ ФИЛЬТРОВ, ПОИСК И СОРТИРОВКА
// ==================================================================================

document.getElementById('search-name')?.addEventListener('input', (e) => {
  currentNameFilter = e.target.value;
  applyFiltersAndSorting();
});

document.getElementById('filter-grade')?.addEventListener('change', (e) => {
  currentGradeFilter = e.target.value;
  applyFiltersAndSorting();
});

document.querySelectorAll('th[data-sort-key]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.getAttribute('data-sort-key');
    if (currentSortKey === key) {
      currentSortAsc = !currentSortAsc;
    } else {
      currentSortKey = key;
      currentSortAsc = true;
    }
    applyFiltersAndSorting();
  });
});

// ==================================================================================
//                           СКАЧИВАНИЕ РЕЗУЛЬТАТОВ
// ==================================================================================

document.getElementById('download-ranking')?.addEventListener('click', async () => {
  const summarySelect = document.getElementById('summary-olympiad-filter');
  if (summarySelect) {
    const olyId = summarySelect.value;
    if (olyId) {
      try {
        const url = `https://portal.gradients.academy/results/representative/dashboard/olympiads/${olyId}/ranking/download`;
        const response = await authorizedFetch(url);
        
        if (!response.ok) {
          throw new Error(`Ошибка скачивания: ${response.status}`);
        }

        // Получаем имя файла из заголовка
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `ranking_${olyId}.xlsx`;
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="(.+)"/);
          if (filenameMatch) filename = filenameMatch[1];
        }

        // Создаем blob и скачиваем файл
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        
      } catch (error) {
        console.error('Ошибка при скачивании:', error);
        alert('Не удалось скачать файл. Попробуйте позже.');
      }
    }
  }
});

// ==================================================================================
//                           Навешивание слушателей после DOMContentLoaded
// ==================================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Проверяем авторизацию и рендерим шапку
  const user = await ensureUserAuthenticated();
  if (!user) return;
  renderUserInfo(user.profile);
  loadRepresentativeProfileForHeader();

  // 2. Сразу загружаем динамику участников
  loadParticipantsDynamics();

  // 3. Загружаем список олимпиад для ЧАРТОВ и навешиваем слушатель
  loadChartOlympiads();
  const chartSelect = document.getElementById('olympiad-filter');
  if (chartSelect) {
    chartSelect.addEventListener('change', () => {
      loadDistributionData();
    });
  }

  // 4. Загружаем список олимпиад для SUMMARY и сразу выбираем первую
  loadSummaryOlympiads();
  const summarySelect = document.getElementById('summary-olympiad-filter');
  if (summarySelect) {
    summarySelect.addEventListener('change', function () {
      loadOlympiadSummary(this.value);
      loadOlympiadRanking(this.value, 1);
    });
  }

  // 5. Навешиваем слушатель для фильтра «класс» (если он есть)
  const gradeSelect = document.getElementById('grade-filter');
  if (gradeSelect) {
    gradeSelect.addEventListener('change', loadDistributionData);
  }
});
