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
    const res = await authorizedFetch('https://portal.gradients.academy/users/representative/profile/');
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
      'https://portal.gradients.academy/results/representatives/dashboard/stats/'
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
  const block = document.querySelector('.olympiad-block')
  if (!block) return

  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/results/representatives/dashboard/current-olympiad/'
    )

    if (!res.ok) {
      const errorData = await res.json()
      if (errorData.detail === 'No active Olympiad.') {
        console.warn('Нет активной олимпиады — отображаем заглушку.')

        block.querySelector('p.font-bold').textContent = 'Нет активной олимпиады'
        block.querySelector('p.text-sm').textContent = 'Ожидается запуск'

        const stageBlocks = block.querySelectorAll('.date')
        stageBlocks.forEach((el) => (el.textContent = '—'))

        // Имена этапов тоже подставим явно
        const stageTitleSpans = block.querySelectorAll('.date')
        stageTitleSpans.forEach((dateEl) => {
          const titleSpan = dateEl.previousElementSibling?.querySelector('span.font-bold')
          if (titleSpan) titleSpan.textContent = 'Этап'
        })

        return
      }

      throw new Error('Ошибка при получении текущей олимпиады')
    }

    const olympiad = await res.json()
    console.log('Текущая олимпиада:', olympiad)

    block.querySelector('p.font-bold').textContent = olympiad.title
    block.querySelector('p.text-sm').textContent = olympiad.description

    const stageBlocks = block.querySelectorAll('.date')
    olympiad.stages.forEach((stage, index) => {
      if (stageBlocks[index]) {
        stageBlocks[index].textContent = `${stage.start} - ${stage.end}`
        const stageTitleEl = stageBlocks[index].previousElementSibling
        if (stageTitleEl && stageTitleEl.classList.contains('flex')) {
          stageTitleEl.querySelector('span.font-bold').textContent = stage.name
        }
      }
    })
  } catch (err) {
    console.error('Ошибка при загрузке текущей олимпиады:', err)

    // Безопасный fallback
    block.querySelector('p.font-bold').textContent = 'Нет активной олимпиады'
    block.querySelector('p.text-sm').textContent = 'Ошибка загрузки данных'
    const stageBlocks = block.querySelectorAll('.date')
    stageBlocks.forEach((el) => (el.textContent = '—'))
  }
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
        'https://portal.gradients.academy/results/representatives/dashboard/ranking/'
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


