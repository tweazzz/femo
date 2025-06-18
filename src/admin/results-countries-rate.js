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
    await loadCountryList()
    await loadCountryRanking()
    await loadOlympiadList()
    await loadAverageChart();
    await loadSuccessRateChart();

  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})


const gradeMap = {
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
}
let allCountriesData = []

async function loadCountryRanking() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    console.warn('Нет access_token. Редирект...')
    window.location.href = '/index.html'
    return
  }

  try {
    const response = await authorizedFetch('https://portal.gradients.academy/results/dashboard/countries/ranking/', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) throw new Error('Ошибка при получении данных')

    const data = await response.json()

    // Обновление summary
    document.getElementById('total-countries').textContent = data.summary.total_countries
    document.getElementById('average-score').textContent = data.summary.average_score
    const top = data.summary.top_country
    document.getElementById('top-country').textContent = `${getCountryName(top.country)} (${top.average_score})`

    // Сохраняем и отрисовываем таблицу
    allCountriesData = data.countries
    renderCountryTable(allCountriesData)

  } catch (err) {
    console.error('Ошибка при загрузке рейтинга стран:', err)
  }
}



let countryMap = {}

async function loadCountryList() {
  try {
    const response = await authorizedFetch('https://portal.gradients.academy/common/countries/?page=1&page_size=500')
    if (!response.ok) throw new Error('Ошибка при загрузке списка стран')
    const data = await response.json()
    const select = document.getElementById('country-filter')
    data.results.forEach((country) => {
      countryMap[country.code] = country.name
      const option = document.createElement('option')
      option.value = country.code
      option.textContent = country.name
      select.appendChild(option)
    })
  } catch (err) {
    console.error('Ошибка при загрузке стран:', err)
  }
}



function getCountryName(code) {
  return countryMap[code] || code
}


function getFlagEmoji(countryCode) {
  return countryCode
    .toUpperCase()
    .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt()))
}


function renderCountryTable(data) {
  const tbody = document.getElementById('countries-table-body')
  tbody.innerHTML = ''
  data.forEach((c) => {
    const row = document.createElement('tr')
    row.classList.add('hover:bg-gray-50')
    row.setAttribute('data-country', c.country)

    row.innerHTML = `
      <td>${getFlagEmoji(c.country)} ${getCountryName(c.country)}</td>
      <td>${c.average_score}</td>
      <td>${c.participant_count}</td>
      <td>${c.top_100_count}</td>
      <td>${c.olympiads_count}</td>
      <td>
        <div class="flex justify-between gap-2 *:cursor-pointer">
          <button onclick="editCountry('${c.country}')" class="text-gray-400 hover:text-blue-500">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
      </td>
    `
    tbody.appendChild(row)
  })
}


document.getElementById('country-filter').addEventListener('change', function () {
  const selected = this.value
  const rows = document.querySelectorAll('#countries-table-body tr')

  const summaryCards = document.getElementById('summary-cards')
  const rankingTable = document.getElementById('country-ranking-table')


  rows.forEach(row => {
    const code = row.getAttribute('data-country')
    const match = selected === 'all' || code === selected
    row.style.display = match ? '' : 'none'
  })

    if (selected !== 'all') {
        editCountry(selected)
        summaryCards.classList.add('hidden')
        rankingTable.classList.add('hidden')
    }
    else {
        summaryCards.classList.remove('hidden')
        rankingTable.classList.remove('hidden')
    }
})

let currentCountryCode = null
async function editCountry(code) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    console.warn('Нет access_token. Редирект...')
    window.location.href = '/index.html'
    return
  }

      currentCountryCode = code
  await fetchParticipants()

  try {
    const response = await authorizedFetch(`https://portal.gradients.academy/results/dashboard/countries/participants/?country=${code}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) throw new Error('Ошибка при получении участников')

    const data = await response.json()
    console.log(data)
    const tbody = document.getElementById('participants-table-body')
    const section = document.getElementById('participants-section')


    if (!tbody || !section) {
        console.error('Не найден контейнер для участников')
        return
    }


    tbody.innerHTML = ''
    data.results.forEach((p, index) => {
      const row = document.createElement('tr')
      row.innerHTML = `
        <td class="p-3">${p.id}</td>
        <td class="p-3">${p.rank}</td>
        <td class="p-3">${p.full_name_ru}</td>
        <td class="p-3">${getGradeName(p.grade)}</td>
        <td class="p-3">${p.olympiad_score}</td>
        <td class="p-3">${p.reward_score}</td>
        <td class="p-3 font-bold text-orange-primary">${p.total_score}</td>
      `
      tbody.appendChild(row)
    })

    section.classList.remove('hidden')

  } catch (err) {
    console.error('Ошибка при загрузке участников:', err)
  }
}


function getGradeName(code) {
  const map = {
    first: '1 класс',
    second: '2 класс',
    third: '3 класс',
    fourth: '4 класс',
    fifth: '5 класс',
    sixth: '6 класс',
    seventh: '7 класс',
    eighth: '8 класс',
    ninth: '9 класс',
    tenth: '10 класс',
    eleventh: '11 класс'
  }
  return map[code] || code
}


document.getElementById('participant-search').addEventListener('input', debounce(async function () {
  const query = this.value.trim()
  const countryCode = currentCountryCode // переменная, которую нужно сохранить при вызове editCountry

  if (!countryCode) return

  try {
    const token = localStorage.getItem('access_token')
    const url = `https://portal.gradients.academy/results/dashboard/countries/participants/?country=${countryCode}&search=${encodeURIComponent(query)}`
    const response = await authorizedFetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) throw new Error('Ошибка при поиске участников')

    const data = await response.json()
    renderParticipants(data.results)

  } catch (err) {
    console.error('Ошибка при поиске участников:', err)
  }
}, 300)) // debounce 300ms


function renderParticipants(participants) {
  const tbody = document.getElementById('participants-table-body')
  if (!tbody) return

  tbody.innerHTML = ''
  participants.forEach((p) => {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td class="p-3">${p.id}</td>
      <td class="p-3">${p.rank}</td>
      <td class="p-3">${p.full_name_ru}</td>
      <td class="p-3">${getGradeName(p.grade)}</td>
      <td class="p-3">${p.olympiad_score}</td>
      <td class="p-3">${p.reward_score}</td>
      <td class="p-3 font-bold text-orange-primary">${p.total_score}</td>
    `
    tbody.appendChild(row)
  })
}


function debounce(func, delay) {
  let timeout
  return function (...args) {
    clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(this, args), delay)
  }
}


async function fetchParticipants() {
  const token = localStorage.getItem('access_token')
  if (!token || !currentCountryCode) return

  const search = document.getElementById('participant-search')?.value.trim() || ''
    const gradeRaw = document.getElementById('grade-filter')?.value || ''
    const grade = gradeMap[gradeRaw] || ''
  const olympiad = document.getElementById('olympiad-filter')?.value || ''

  const params = new URLSearchParams()
  params.append('country', currentCountryCode)
  if (search) params.append('search', search)
  if (grade) params.append('grade', grade)
  if (olympiad) params.append('results__olympiad', olympiad)
  console.log('grade is', grade)
  try {
    const response = await authorizedFetch(`https://portal.gradients.academy/results/dashboard/countries/participants/?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) throw new Error('Ошибка при загрузке участников')

    const data = await response.json()
    console.log(data.results)
    renderParticipants(data.results)

    const section = document.getElementById('participants-section')
    if (section) section.classList.remove('hidden')

  } catch (err) {
    console.error('Ошибка при загрузке участников:', err)
  }
}


document.getElementById('participant-search').addEventListener('input', debounce(fetchParticipants, 300))
document.getElementById('grade-filter').addEventListener('change', fetchParticipants)
document.getElementById('olympiad-filter').addEventListener('change', fetchParticipants)


async function loadOlympiadList() {
  const token = localStorage.getItem('access_token')
  if (!token) return

  try {
    const response = await authorizedFetch('https://portal.gradients.academy/olympiads/dashboard/', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) throw new Error('Ошибка при загрузке олимпиад')

    const data = await response.json()
    const select = document.getElementById('olympiad-filter')

    const select1 = document.getElementById('chart-olympiad-filter-1');
    const select2 = document.getElementById('chart-olympiad-filter-2');

    [select1, select2].forEach(select => {
      if (select) {
        select.innerHTML = '<option value="">Выбрать олимпиаду</option>';
        data.results.forEach((olympiad) => {
          const option = document.createElement('option');
          option.value = olympiad.id;
          option.textContent = olympiad.title;
          select.appendChild(option);
        });
      }
    });



    if (!select) return

    // Очищаем и добавляем дефолтный пункт
    select.innerHTML = '<option value="">Выбрать олимпиаду</option>'

    data.results.forEach((olympiad) => {
      const option = document.createElement('option')
      option.value = olympiad.id
      option.textContent = olympiad.title
      select.appendChild(option)
    })

  } catch (err) {
    console.error('Ошибка при загрузке списка олимпиад:', err)
  }
}


async function loadChartsWithCountryNames() {
  const token = localStorage.getItem("access_token");
  if (!token) return;

  try {
    // Получаем список стран
    const countryRes = await fetch("https://portal.gradients.academy/common/countries/?page=1&page_size=300", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const countryData = await countryRes.json();
    const countryMap = {};
    countryData.results.forEach(c => {
      countryMap[c.code] = c.name;
    });

    // Получаем данные графиков
    const olympiadId1 = document.getElementById("chart-olympiad-filter-1")?.value;
    const olympiadId2 = document.getElementById("chart-olympiad-filter-2")?.value;

    const url = new URL("https://portal.gradients.academy/results/dashboard/countries/charts/");
    if (olympiadId1) url.searchParams.append("olympiad", olympiadId1);

    const chartRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    const chartData = await chartRes.json();

    // Обновляем график среднего балла
    const averageLabels = chartData.average_by_country.map(item => countryMap[item.country] || item.country);
    const averageScores = chartData.average_by_country.map(item => parseFloat(item.average_score));
    averageChart.data.labels = averageLabels;
    averageChart.data.datasets[0].data = averageScores;
    averageChart.update();

    // Обновляем график процента успеха
    const resultsContainer = document.getElementById("resultsContainer");
    resultsContainer.innerHTML = "";
    chartData.success_rate_by_country.forEach(item => {
      const percent = parseFloat(item.success_rate) * 100;
      const name = countryMap[item.country] || item.country;
      const div = document.createElement("div");
      div.className = "flex flex-col sm:flex-row justify-between gap-1 sm:gap-4 sm:items-center p-3";
      div.innerHTML = `
        <p class="font-medium w-26 text-start">${name}</p>
        <div class="w-full flex items-center justify-between gap-4">
          <div class="w-full rounded-2xl bg-white flex h-2">
            <div style="width: ${percent}%" class="bg-green-primary h-full rounded-2xl"></div>
          </div>
          <span>${percent.toFixed(1)}%</span>
        </div>
      `;
      resultsContainer.appendChild(div);
    });

  } catch (err) {
    console.error("Ошибка при загрузке графиков:", err);
  }
}


document.getElementById("chart-olympiad-filter-1")?.addEventListener("change", loadAverageChart);
document.getElementById("chart-olympiad-filter-2")?.addEventListener("change", loadSuccessRateChart);


async function loadAverageChart() {
  const token = localStorage.getItem("access_token");
  if (!token) return;

  const olympiadId = document.getElementById("chart-olympiad-filter-1")?.value;
  const url = new URL("https://portal.gradients.academy/results/dashboard/countries/charts/");
  if (olympiadId) url.searchParams.append("olympiad", olympiadId);

  const countryRes = await fetch("https://portal.gradients.academy/common/countries/?page=1&page_size=300", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const countryData = await countryRes.json();
  const countryMap = {};
  countryData.results.forEach(c => countryMap[c.code] = c.name);

  const chartRes = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });
  const chartData = await chartRes.json();

  const averageLabels = chartData.average_by_country.map(item => countryMap[item.country] || item.country);
  const averageScores = chartData.average_by_country.map(item => parseFloat(item.average_score));

  averageChart.data.labels = averageLabels;
  averageChart.data.datasets[0].data = averageScores;
  averageChart.update();
}


async function loadSuccessRateChart() {
  const token = localStorage.getItem("access_token");
  if (!token) return;

  const olympiadId = document.getElementById("chart-olympiad-filter-2")?.value;
  const url = new URL("https://portal.gradients.academy/results/dashboard/countries/charts/");
  if (olympiadId) url.searchParams.append("olympiad", olympiadId);

  const countryRes = await fetch("https://portal.gradients.academy/common/countries/?page=1&page_size=300", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const countryData = await countryRes.json();
  const countryMap = {};
  countryData.results.forEach(c => countryMap[c.code] = c.name);

  const chartRes = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });
  const chartData = await chartRes.json();

  const resultsContainer = document.getElementById("resultsContainer");
  resultsContainer.innerHTML = "";

  if (chartData.success_rate_by_country.length === 0) {
    resultsContainer.innerHTML = "<p class='text-gray-500'>Нет данных для выбранной олимпиады.</p>";
    return;
  }

  chartData.success_rate_by_country.forEach(item => {
    const percent = parseFloat(item.success_rate) * 100;
    const name = countryMap[item.country] || item.country;
    const div = document.createElement("div");
    div.className = "flex flex-col sm:flex-row justify-between gap-1 sm:gap-4 sm:items-center p-3";
    div.innerHTML = `
      <p class="font-medium w-26 text-start">${name}</p>
      <div class="w-full flex items-center justify-between gap-4">
        <div class="w-full rounded-2xl bg-white flex h-2">
          <div style="width: ${percent}%" class="bg-green-primary h-full rounded-2xl"></div>
        </div>
        <span>${percent.toFixed(1)}%</span>
      </div>
    `;
    resultsContainer.appendChild(div);
  });
}


