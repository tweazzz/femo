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
  const avatarEl = document.getElementById('user-avatar');
  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  const defaultAvatar = '/src/assets/images/user_logo.jpg';
  const imgPath = profile?.image;

  let finalAvatar = defaultAvatar;
  if (imgPath && typeof imgPath === 'string') {
    finalAvatar = imgPath.startsWith('http')
      ? imgPath
      : `https://portal.gradients.academy${imgPath}`;
  }

  avatarEl.src = finalAvatar;
  nameEl.textContent = profile.full_name_ru || '';
  const firstName = profile.full_name_ru?.split(' ')[0] || '';
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`;

  const countryCode = profile.country?.code || '';
  roleEl.textContent = `Представитель${countryCode ? ' ' + countryCode : ''}`;
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

async function loadRepresentativeStats() {
  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/api/results/representatives/dashboard/stats/'
    )

    if (!res.ok) {
      throw new Error('Ошибка при получении статистики представителей')
    }

    const data = await res.json()
    console.log('Статистика представителей:', data)

    document.getElementById('total-participants').textContent = data.total_participants
    document.getElementById('average-score').textContent = `${data.average_score}/100`
  } catch (err) {
    console.error('Ошибка при загрузке статистики представителей:', err)
  }
}
async function loadCurrentOlympiad() {
  const block = document.querySelector('.olympiad-block');
  if (!block) return;

  const titleEl = block.querySelector('p.font-bold');
  const descEl = block.querySelector('p.text-sm');
  const stagesContainer = block.querySelector('.stages-container');

  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/api/results/representatives/dashboard/current-olympiad/'
    );
    if (!res.ok) {
      const { detail } = await res.json();
      if (detail === 'No active Olympiad.') {
        throw new Error('NO_OLYMP');
      } else {
        throw new Error('FETCH_ERROR');
      }
    }

    const olympiad = await res.json();
    titleEl.textContent = olympiad.title;
    descEl.textContent = olympiad.description || 'Без описания';

    // очищаем контейнер
    stagesContainer.innerHTML = '';

    // вспомогательная функция для форматирования даты
    const fmt = d => {
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      return `${dd}.${mm}.${d.getFullYear()}`;
    };

    olympiad.stages.forEach((stage, idx) => {
      // 1) Блок этапа
      const stageBlock = document.createElement('div');
      stageBlock.className = 'space-y-1 text-sm';

      const titleP = document.createElement('p');
      titleP.className = 'flex items-center gap-1';

      if (idx === 0) {
        // только у первого этапа — чек-иконка
        titleP.innerHTML = `
          <span class="text-green-primary">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none"
                 viewBox="0 0 24 24" stroke-width="1.5"
                 stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round"
                    d="M9 12.75L11.25 15L15 9.75M21 12a9 9 0 1 1-18 0
                       9 9 0 0 1 18 0Z"/>
            </svg>
          </span>
          <span class="font-bold">${stage.name}</span>
        `;
      } else {
        // у остальных — только название
        titleP.innerHTML = `<span class="font-bold">${stage.name}</span>`;
      }

      const dateP = document.createElement('p');
      dateP.className = 'date';
      const start = new Date(stage.start_date);
      const end   = new Date(stage.end_date);
      dateP.textContent = `${fmt(start)} – ${fmt(end)}`;

      stageBlock.append(titleP, dateP);
      stagesContainer.append(stageBlock);

      // 2) Если не последний этап – вставляем стрелку
      if (idx < olympiad.stages.length - 1) {
        const arrowWrapper = document.createElement('div');
        arrowWrapper.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
               fill="currentColor" class="size-6">
            <path fill-rule="evenodd"
                  d="M16.72 7.72a.75.75 0 0 1 1.06 0l3.75
                     3.75a.75.75 0 0 1 0 1.06l-3.75 3.75a.75.75
                     0 1 1-1.06-1.06l2.47-2.47H3a.75.75 0 0 1
                     0-1.5h16.19l-2.47-2.47a.75.75 0 0 1
                     0-1.06Z"/>
          </svg>
        `;
        stagesContainer.append(arrowWrapper);
      }
    });

  } catch (err) {
    titleEl.textContent = 'Нет активной олимпиады';
    descEl.textContent  = err.message === 'NO_OLYMP'
      ? 'Ожидается запуск'
      : 'Ошибка загрузки данных';
    stagesContainer.innerHTML = '';  // убираем всё
  }
}



// Удобная функция форматирования дат из YYYY-MM-DD в DD.MM.YYYY
function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}




  let allRankingData = []
  let isExpanded = false

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
  
  
  function renderRankingTable(data, expanded = false) {
    const tbody = document.getElementById('ranking-table-body')
    tbody.innerHTML = ''

    if (!data || data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center px-6 py-4 text-gray-500">Нет данных</td>
        </tr>
      `
      return
    }

    const top = data.slice(0, 3)
    const fourth = data.slice(3, 4)
    const bottomTwo = data.slice(-2)

    const visibleRows = expanded ? data : [...top, ...fourth, 'ellipsis', ...bottomTwo]

    visibleRows.forEach((item, index) => {
      if (item === 'ellipsis') {
        tbody.innerHTML += `
          <tr class="text-center">
            <td colspan="7" class="text-orange-primary px-6 py-4 text-2xl">• • •</td>
          </tr>
        `
        return
      }

      const isTopThree = item.rank >= 1 && item.rank <= 3
      const showRank = isTopThree ? '👑' : item.rank

      const row = document.createElement('tr')
      row.className = isTopThree ? '' : (index === data.length - 1 || index === data.length - 2 ? 'bg-orange-secondary' : 'bg-white')

      row.innerHTML = `
        <td class="px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900 text-center">
          ${showRank}
        </td>
        <td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
          ${item.name}
        </td>
        <td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
          ${reverseClassMap[item.grade] || '—'}
        </td>
      
        <td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
          ${item.city}
        </td>
        <td class="px-6 py-4 text-sm font-bold whitespace-nowrap text-orange-500">
          ${item.overall_points}
        </td>
        <td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
          —
        </td>
        <td class="px-6 py-4 text-sm whitespace-nowrap text-gray-900">
          —
        </td>
      `
      tbody.appendChild(row)
    })
  }

  async function loadRepresentativeRanking() {
    try {
      const res = await authorizedFetch(
        'https://portal.gradients.academy/api/results/representatives/dashboard/ranking/'
      )

      if (!res.ok) {
        throw new Error('Ошибка при получении рейтинга представителей')
      }

      const data = await res.json()
      allRankingData = data.results || []

      renderRankingTable(allRankingData, false)

      const link = document.querySelector('[data-show-all]')
      if (link) {
        link.addEventListener('click', (e) => {
          e.preventDefault()
          isExpanded = !isExpanded
          renderRankingTable(allRankingData, isExpanded)
          link.innerHTML = isExpanded
            ? 'Скрыть'
            : `Посмотреть все
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5 ml-1">
                <path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
              </svg>`
        })
      }

    } catch (err) {
      console.error('Ошибка при загрузке рейтинга представителей:', err)
    }
  }

let currentSortDirection = 'asc'

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user)
  document.querySelector('[data-sort-rank]').addEventListener('click', () => {
  if (currentSortDirection === 'asc') {
    currentSortDirection = 'desc'
    allRankingData.sort((a, b) => b.rank - a.rank)
  } else {
    currentSortDirection = 'asc'
    allRankingData.sort((a, b) => a.rank - b.rank)
  }
  renderRankingTable(allRankingData, isExpanded)
})
  try {
    await loadRepresentativeStats()
    await loadCurrentOlympiad()
    await loadRepresentativeRanking()
    await loadRepresentativeProfileForHeader()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})


