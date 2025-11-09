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
  '8 класс': 'eighth',
  '9 класс': 'ninth',
  '10 класс': 'tenth',
  '11 класс': 'eleventh'
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

  const roleMap = { representative: 'Представитель' };
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

// ==================================================================================
//                    Загрузка списка олимпиад для ЧАРТОВ (id="olympiad-filter")
// ==================================================================================

async function loadChartOlympiads() {
  try {
    let allOlympiads = [];
    let url = 'https://portal.femo.kz/api/common/olympiads/';
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
    let url = 'https://portal.femo.kz/api/common/olympiads/';
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
    const url = `https://portal.femo.kz/api/results/representatives/dashboard/participants/distribution/?grade=${gradeParam}&olympiad_id=${olympiadId}`;
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
      'https://portal.femo.kz/api/results/representatives/dashboard/participants/dynamics'
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
    const url = `https://portal.femo.kz/api/results/representative/dashboard/olympiads/${olympiadId}/summary`;
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
    const url = `https://portal.femo.kz/api/results/representative/dashboard/olympiads/${olympiadId}/ranking?page=${page}&page_size=${rankingPageSize}`;
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
    // Маппинг для класса по рангу
  const grades = {
    '1': 'first',
    '2': 'second',
    '3': 'third',
    '4': 'fourth',
    '5': 'fifth',
    '6': 'sixth',
    '7': 'seventh',
    '8': 'eighth',
    '9': 'ninth',
    '10': 'tenth',
    '11': 'eleventh'
  };
    // И обратный маппинг «текстовый класс → число»
  const gradeToNum = Object.fromEntries(
    Object.entries(grades).map(([num, cls]) => [cls, num])
  );

  // SVG-коронка (можно заменить на любой другой SVG)
  const crownSvg = `
        <svg width="35" height="27" viewBox="0 0 35 27" fill="none" class="inline-block align-middle xmlns="http://www.w3.org/2000/svg">
        <path d="M34.0081 13.5246L32.6656 16.4735L28.4555 25.7209L6.42753 25.6562L0.953125 13.4212L1.83946 12.9685C1.83946 12.9685 3.32537 17.3012 6.15381 17.4823C8.98225 17.6504 8.90405 13.1237 8.90405 13.1237L9.1517 13.0461L9.42542 12.9556C9.42542 12.9556 10.5855 15.8656 12.6058 15.3224C14.6261 14.7792 15.5906 11.5329 16.1641 7.85979C16.7377 4.19963 16.9201 1.94922 16.9201 1.94922H18.0672C18.0672 1.94922 18.2366 4.1867 18.784 7.85979C19.3315 11.52 20.283 14.7792 22.3033 15.3353C22.3163 15.3353 22.3163 15.3353 22.3294 15.3353C24.3367 15.8656 25.5097 12.9814 25.5097 12.9814L26.0311 13.1496C26.0311 13.1496 26.005 14.1972 26.2918 15.2577C26.5394 16.1889 27.0348 17.146 27.9863 17.4305C28.2078 17.4952 28.4685 17.534 28.7553 17.5211C31.5968 17.3659 33.1087 13.0461 33.1087 13.0461L34.0081 13.5246Z" fill="#FEC272"/>
        <path d="M13.3487 25.6818L6.42753 25.656L0.953125 13.4209L1.83946 12.9683C1.83946 12.9683 3.32537 17.301 6.15381 17.482C8.98225 17.6502 8.90405 13.1235 8.90405 13.1235L9.1517 13.0459L13.3487 25.6818Z" fill="#FFB96C"/>
        <path d="M26.3168 15.2964L18.6005 25.6949L14.625 25.682L22.3674 15.374C24.3747 15.9043 25.5477 13.0201 25.5477 13.0201L26.0691 13.1883C26.0561 13.1883 26.03 14.223 26.3168 15.2964Z" fill="#FFD39F"/>
        <path d="M34.008 13.5247L32.6655 16.4735L25.8094 25.7209L21.834 25.708L28.0122 17.4694C28.2338 17.5341 28.4945 17.5729 28.7813 17.5599C31.6227 17.4047 33.1347 13.085 33.1347 13.085L34.008 13.5247Z" fill="#FFD39F"/>
        <path d="M35.1144 12.826C35.1144 12.9941 35.0883 13.1493 35.0232 13.2916C34.8276 13.8219 34.3193 14.197 33.7197 14.197C32.9507 14.197 32.3251 13.5762 32.3381 12.8131C32.3381 12.6837 32.3642 12.5415 32.3902 12.4251C32.5597 11.856 33.0941 11.4421 33.7328 11.4421C34.4887 11.4551 35.1144 12.0759 35.1144 12.826Z" fill="#FFB96C"/>
        <path d="M35.1148 12.826C35.1148 12.9941 35.0887 13.1493 35.0236 13.2916C34.7498 13.6149 34.3327 13.8089 33.8765 13.8089C33.0814 13.8089 32.4297 13.1881 32.3906 12.4121C32.5601 11.8431 33.0945 11.4292 33.7332 11.4292C34.4891 11.4551 35.1148 12.0759 35.1148 12.826Z" fill="#FEC272"/>
        <path d="M34.5807 12.2442C34.5807 12.3218 34.5677 12.3865 34.5416 12.4511C34.4504 12.6969 34.2158 12.865 33.9421 12.865C33.5901 12.865 33.3164 12.5805 33.3164 12.2313C33.3164 12.1666 33.3294 12.1149 33.3425 12.0502C33.4207 11.7915 33.6683 11.5975 33.9551 11.5975C34.307 11.6234 34.5938 11.9079 34.5807 12.2442Z" fill="#FFD39F"/>
        <path d="M2.77651 12.7356C2.77651 12.9037 2.75044 13.0589 2.68527 13.2012C2.48975 13.7314 1.98141 14.1065 1.38184 14.1065C0.612813 14.1065 -0.0128343 13.4857 0.000200034 12.7226C0.000200034 12.5933 0.0262678 12.451 0.0523364 12.3346C0.221782 11.7656 0.756189 11.3517 1.39487 11.3517C2.16389 11.3517 2.77651 11.9725 2.77651 12.7356Z" fill="#FFB96C"/>
        <path d="M2.7769 12.7354C2.7769 12.9036 2.75084 13.0588 2.68566 13.201C2.41194 13.5244 1.99485 13.7184 1.53865 13.7184C0.743553 13.7184 0.0918373 13.0976 0.0527344 12.3216C0.22218 11.7525 0.756587 11.3386 1.39527 11.3386C2.16429 11.3516 2.7769 11.9724 2.7769 12.7354Z" fill="#FEC272"/>
        <path d="M2.25456 12.1534C2.25456 12.231 2.24153 12.2957 2.21546 12.3603C2.12422 12.6061 1.8896 12.7742 1.61588 12.7742C1.26395 12.7742 0.990234 12.4897 0.990234 12.1405C0.990234 12.0758 1.00327 12.0241 1.0163 11.9594C1.09451 11.7007 1.34216 11.5067 1.62891 11.5067C1.98084 11.5196 2.25456 11.8042 2.25456 12.1534Z" fill="#FFD39F"/>
        <path d="M27.1632 12.684C27.1632 12.8522 27.1372 13.0074 27.072 13.1496C26.8765 13.6799 26.3681 14.055 25.7686 14.055C24.9995 14.055 24.3739 13.4342 24.3869 12.6711C24.3869 12.5418 24.413 12.3995 24.4391 12.2831C24.6085 11.714 25.1429 11.3002 25.7816 11.3002C26.5506 11.3002 27.1632 11.921 27.1632 12.684Z" fill="#FFB96C"/>
        <path d="M27.1636 12.6839C27.1636 12.8521 27.1376 13.0073 27.0724 13.1495C26.7987 13.4729 26.3816 13.6669 25.9254 13.6669C25.1303 13.6669 24.4786 13.0461 24.4395 12.2701C24.6089 11.701 25.1433 11.2871 25.782 11.2871C26.551 11.3 27.1636 11.9208 27.1636 12.6839Z" fill="#FEC272"/>
        <path d="M26.6413 12.1021C26.6413 12.1797 26.6282 12.2444 26.6022 12.309C26.5109 12.5548 26.2763 12.7229 26.0026 12.7229C25.6507 12.7229 25.377 12.4384 25.377 12.0892C25.377 12.0245 25.39 11.9728 25.403 11.9081C25.4812 11.6494 25.7289 11.4554 26.0156 11.4554C26.3545 11.4684 26.6413 11.7529 26.6413 12.1021Z" fill="#FFD39F"/>
        <path d="M10.5851 12.632C10.5851 12.8002 10.559 12.9554 10.4939 13.0976C10.2983 13.6279 9.79001 14.003 9.19043 14.003C8.42141 14.003 7.79576 13.3822 7.80879 12.6191C7.80879 12.4898 7.83486 12.3475 7.86093 12.2311C8.03038 11.662 8.56478 11.2482 9.20347 11.2482C9.97249 11.2482 10.5981 11.869 10.5851 12.632Z" fill="#FFB96C"/>
        <path d="M10.5855 12.6322C10.5855 12.8003 10.5594 12.9555 10.4943 13.0978C10.2205 13.4211 9.80344 13.6151 9.34724 13.6151C8.55215 13.6151 7.90043 12.9943 7.86133 12.2183C8.03077 11.6492 8.56518 11.2354 9.20386 11.2354C9.97288 11.2483 10.5985 11.8691 10.5855 12.6322Z" fill="#FEC272"/>
        <path d="M10.0632 12.0501C10.0632 12.1277 10.0501 12.1924 10.0241 12.257C9.93281 12.5028 9.6982 12.6709 9.42447 12.6709C9.07255 12.6709 8.79883 12.3864 8.79883 12.0372C8.79883 11.9725 8.81186 11.9208 8.8249 11.8561C8.9031 11.5974 9.15075 11.4034 9.43751 11.4034C9.78943 11.4164 10.0632 11.7009 10.0632 12.0501Z" fill="#FFD39F"/>
        <path d="M18.9132 2.00058C18.9132 2.16871 18.8872 2.32391 18.822 2.46618C18.6265 2.99645 18.1181 3.37152 17.5186 3.37152C16.7495 3.37152 16.1239 2.75071 16.1369 1.98764C16.1369 1.85831 16.163 1.71604 16.1891 1.59964C16.3585 1.03057 16.8929 0.616699 17.5316 0.616699C18.2876 0.629633 18.9132 1.23751 18.9132 2.00058Z" fill="#FFB96C"/>
        <path d="M18.9136 2.00081C18.9136 2.16895 18.8876 2.32415 18.8224 2.46642C18.5487 2.78975 18.1316 2.98375 17.6754 2.98375C16.8803 2.98375 16.2286 2.36295 16.1895 1.58694C16.3589 1.01787 16.8933 0.604004 17.532 0.604004C18.288 0.629871 18.9136 1.23774 18.9136 2.00081Z" fill="#FEC272"/>
        <path d="M18.3913 1.41889C18.3913 1.49649 18.3782 1.56115 18.3522 1.62582C18.2609 1.87156 18.0263 2.03969 17.7526 2.03969C17.4007 2.03969 17.127 1.75516 17.127 1.40595C17.127 1.34129 17.14 1.28955 17.153 1.22489C17.2312 0.966218 17.4789 0.772217 17.7656 0.772217C18.1045 0.798084 18.3913 1.08262 18.3913 1.41889Z" fill="#FFD39F"/>
        <path d="M29.9919 25.4879C29.9919 25.7337 29.8876 25.9665 29.7312 26.1475C29.5748 26.3157 29.3532 26.4321 29.0925 26.4579C27.8934 26.5614 25.5602 26.7295 22.6796 26.8071C18.8736 26.9106 16.0321 26.8977 12.187 26.7813C9.30644 26.6907 6.98634 26.4967 5.77415 26.3933C5.5265 26.3674 5.30491 26.251 5.13547 26.0829C4.97906 25.9147 4.87478 25.6819 4.88782 25.4233C4.88782 24.9318 5.25278 24.5179 5.74808 24.4662C6.50407 24.3757 7.78143 24.2463 9.6714 24.1429C12.7736 23.9747 22.0931 24.0006 25.2083 24.1946C27.0983 24.311 28.3756 24.4403 29.1316 24.5438C29.6269 24.5826 29.9919 25.0094 29.9919 25.4879Z" fill="#FFB96C"/>
        <path d="M29.8622 25.2164C29.8622 25.3716 29.771 25.5268 29.6146 25.6303C29.4582 25.7337 29.2366 25.8113 28.9889 25.8243C27.8028 25.8889 25.4957 25.9924 22.6412 26.0441C18.8743 26.1088 16.0719 26.0959 12.2529 26.0183C9.39838 25.9536 7.10434 25.8372 5.91822 25.7596C5.67057 25.7467 5.44899 25.6691 5.29257 25.5656C5.13616 25.4492 5.04492 25.3069 5.04492 25.1517C5.04492 24.8413 5.40988 24.5827 5.89215 24.5439C6.63511 24.4921 7.91247 24.4145 9.77637 24.3499C12.8525 24.2464 22.0677 24.2723 25.1438 24.4016C27.0077 24.4792 28.272 24.5697 29.028 24.6215C29.4973 24.6344 29.8622 24.906 29.8622 25.2164Z" fill="#FEC272"/>
        <path d="M21.3906 16.9388L21.3776 21.4267L19.7613 23.0951L15.4339 23.0822L13.8438 21.4008L13.8568 16.9129L15.46 15.2574L19.7874 15.2704L21.3906 16.9388Z" fill="#FFB26C"/>
        <path d="M21.0396 16.7835L21.0266 20.8704L19.5668 22.3707H15.6434L14.1836 20.8446L14.1966 16.7576L15.6565 15.2573H19.5928L21.0396 16.7835Z" fill="#FF97C9"/>
        <path d="M15.6565 15.2573L15.6434 22.3707L14.1836 20.8446L14.1966 16.7576L15.6565 15.2573Z" fill="#EF50AB"/>
        <path d="M21.0393 16.7833L21.0262 20.8703L19.5664 22.3706L19.5925 15.2572L21.0393 16.7833Z" fill="#FFC0E1"/>
        <path d="M15.6556 15.2572L19.5659 22.3706H15.6426L15.6556 15.2572Z" fill="#F46CB4"/>
        <path d="M18.504 21.0019H17.652V18.0979L16.986 18.7759L16.5 18.2659L17.76 16.9999H18.504V21.0019Z" fill="white"/>
        <path d="M25.8745 22.4356C26.652 22.4356 27.2822 21.8102 27.2822 21.0388C27.2822 20.2673 26.652 19.642 25.8745 19.642C25.097 19.642 24.4668 20.2673 24.4668 21.0388C24.4668 21.8102 25.097 22.4356 25.8745 22.4356Z" fill="#FFB26C"/>
        <path d="M27.1256 20.8579C27.1256 21.0002 27.0995 21.1425 27.0473 21.2718C26.8779 21.7374 26.4347 22.0608 25.9134 22.0608C25.2486 22.0608 24.7012 21.5176 24.7012 20.8579C24.7012 20.7415 24.7142 20.6251 24.7533 20.5217C24.8967 20.0302 25.3659 19.6681 25.9134 19.6681C26.5911 19.6551 27.1256 20.1983 27.1256 20.8579Z" fill="#EF50AB"/>
        <path d="M27.1261 20.8577C27.1261 21 27.1001 21.1423 27.0479 21.2716C26.8133 21.5561 26.4484 21.7243 26.0573 21.7243C25.3665 21.7243 24.806 21.194 24.7539 20.5085C24.8973 20.017 25.3665 19.6549 25.914 19.6549C26.5917 19.6549 27.1261 20.1981 27.1261 20.8577Z" fill="#F46CB4"/>
        <path d="M26.6685 20.3535C26.6685 20.4182 26.6554 20.4828 26.6294 20.5346C26.5512 20.7415 26.3556 20.8967 26.108 20.8967C25.8082 20.8967 25.5605 20.651 25.5605 20.3535C25.5605 20.3018 25.5736 20.25 25.5866 20.1983C25.6518 19.9784 25.8603 19.8103 26.121 19.8103C26.4208 19.8103 26.6685 20.056 26.6685 20.3535Z" fill="#FF97C9"/>
        <path d="M9.04637 22.3837C9.82383 22.3837 10.4541 21.7583 10.4541 20.9869C10.4541 20.2155 9.82383 19.5901 9.04637 19.5901C8.26892 19.5901 7.63867 20.2155 7.63867 20.9869C7.63867 21.7583 8.26892 22.3837 9.04637 22.3837Z" fill="#FFB26C"/>
        <path d="M10.2584 20.8058C10.2584 20.9481 10.2323 21.0904 10.1802 21.2197C10.0107 21.6853 9.56754 22.0086 9.04617 22.0086C8.38142 22.0086 7.83398 21.4654 7.83398 20.8058C7.83398 20.6894 7.84702 20.573 7.88612 20.4696C8.0295 19.9781 8.49873 19.6159 9.04617 19.6159C9.71092 19.603 10.2584 20.1462 10.2584 20.8058Z" fill="#EF50AB"/>
        <path d="M10.259 20.8061C10.259 20.9483 10.2329 21.0906 10.1808 21.2199C9.94614 21.5045 9.58118 21.6726 9.19015 21.6726C8.49933 21.6726 7.93886 21.1423 7.88672 20.4569C8.0301 19.9654 8.49933 19.6033 9.04677 19.6033C9.71152 19.6033 10.259 20.1465 10.259 20.8061Z" fill="#F46CB4"/>
        <path d="M9.80127 20.3014C9.80127 20.3661 9.78824 20.4307 9.76217 20.4825C9.68397 20.6894 9.48845 20.8446 9.2408 20.8446C8.94101 20.8446 8.69336 20.5989 8.69336 20.3014C8.69336 20.2497 8.70639 20.1979 8.71943 20.1462C8.7846 19.9263 8.99315 19.7582 9.25383 19.7582C9.55362 19.7582 9.80127 20.0039 9.80127 20.3014Z" fill="#FF97C9"/>
        </svg>
    `;
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
    if (idx < 3) {
      // 2) Вставляем SVG как HTML, а не текст
      countryRankCell.innerHTML = crownSvg;
    } else {
      countryRankCell.textContent = item.country_rank;
    }
    tr.appendChild(countryRankCell);

    // Имя участника
    const nameCell = document.createElement('td');
    nameCell.textContent = item.full_name;
    tr.appendChild(nameCell);

    // === Класс участника ===
    const gradeCell = document.createElement('td');
    gradeCell.classList.add('text-center');

    // 1) чиним цифру:
    const num = gradeToNum[item.grade] || item.grade;
    gradeCell.textContent = num;

    // 2) и добавляем CSS-класс, если он есть в маппинге
    const cls = grades[num];
    if (cls) {
      gradeCell.classList.add(cls);
    }

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
        const url = `https://portal.femo.kz/api/results/representative/dashboard/olympiads/${olyId}/ranking/download`;
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
