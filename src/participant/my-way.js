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
  if (role !== 'participant') {
    console.warn(
      `Пользователь с ролью "${role}" не имеет доступа к участникам. Редирект.`
    )
    window.location.href = '/index.html'
    return null
  }

  return user
}

// 1) Функция для загрузки полного профиля участника
async function loadUserProfile() {
  const res = await authorizedFetch(
    'https://portal.gradients.academy/api/users/participant/profile/'
  );
  if (!res.ok) throw new Error('Не удалось загрузить профиль');
  return await res.json();
}

function renderUserInfo(profile) {
  const avatarEl   = document.getElementById('user-avatar')
  const nameEl     = document.getElementById('user-name')
  const roleEl     = document.getElementById('user-role')
  const welcomeEl  = document.querySelector('h1.text-xl')

  // 1) Картинка
  const imgPath = profile.image
  avatarEl.src = imgPath.startsWith('http')
    ? imgPath
    : `https://portal.gradients.academy${imgPath}`

  // 2) Имя и приветствие
  nameEl.textContent = profile.full_name_ru
  const firstName = profile.full_name_ru.split(' ')[0]
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`

  // 3) Роль (она всегда участник)
  roleEl.textContent = 'Участник'
}
document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  // сначала загрузим детали профиля
  let profile
  try {
    profile = await loadUserProfile()
  } catch (e) {
    console.error(e)
    return
  }
  renderUserInfo(profile)

  try {
    await loadAssignments();
    const data = await loadSummary();
    if (data) updateProgressBar(data.recommendation?.xp_to_next ?? 100);
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})


async function loadSummary() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return null;
  }

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/api/results/participant/dashboard/path/progress`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) throw new Error('Ошибка загрузки сводки');

    const data = await response.json();

    document.getElementById('xp_today').textContent = data.xp_today;
    document.getElementById('current_level').textContent = data.recommendation?.current_level ?? 0;
    document.getElementById('xp_to_next').textContent = data.recommendation?.xp_to_next ?? 100;

    return data; // Теперь функция возвращает данные!
  } catch (err) {
    console.error('Ошибка при загрузке сводной информации:', err);
    return null; // Возвращаем null, если произошла ошибка
  }
}


function updateProgressBar(xpToNext) {
  const progressBar = document.getElementById('progress-bar');
  const progress = Math.max(0, 100 - xpToNext); // Гарантируем, что значение >= 0
  progressBar.style.width = `${progress}%`;
}


let allAssignments = []
let currentAssignmentPage = 1
const assignmentPageSize = 20
let totalAssignmentCount = 0


async function loadAssignments(page = 1) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  const params = new URLSearchParams()
  params.append('page', page)

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/api/results/participant/dashboard/path/results/?${params.toString()}`,
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
    allAssignments = data
    totalAssignmentCount = data.count
    currentAssignmentPage = page

    renderAssignmentTable(allAssignments)
    renderAssignmentPagination()
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('my_way-tbody').innerHTML = `
      <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
    `
  }
}


function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('my_way-tbody')
  const tableContainer = document.getElementById('my_way-table-container') // Добавим id на обертку таблицы
  if (!tbody || !tableContainer) return

  if (assignments.length === 0) {
    tableContainer.classList.add('hidden')
    return
  }

  // Иначе показываем таблицу
  tableContainer.classList.remove('hidden')
  tbody.innerHTML =
    assignments.length === 0
      ? `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td></tr>`
      : assignments
          .map((task) => {
            const encodedTask = encodeURIComponent(JSON.stringify(task))
            return `
      <tr class="hover:bg-gray-50">
        <td>${task.olympiad}</td>
        <td>${task.place}</td>
        <td>${task.score}</td>
        <td>${task.solved}/${task.total}</td>
        <td>
          <div class="flex justify-between gap-2 *:cursor-pointer">
              <button onclick="downloadCertificate(${task.id})" data-task="${encodedTask}" class="text-gray-400 hover:text-blue-primary">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v12" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `
          })
          .join('')
}


function renderAssignmentPagination() {
  const container = document.querySelector('.pagination')
  if (!container) return

  const totalPages = Math.max(
    1,
    Math.ceil(totalAssignmentCount / assignmentPageSize)
  )
  let buttons = ''

  for (let i = 1; i <= totalPages; i++) {
    buttons += `
      <button class="${i === currentAssignmentPage ? 'text-orange-primary border-orange-primary border' : 'text-gray-600'} px-3 py-1 rounded"
        onclick="goToAssignmentPage(${i})">${i}</button>
    `
  }

  container.innerHTML = `
    <div class="flex items-center gap-1">
      <button onclick="goToAssignmentPage(${Math.max(1, currentAssignmentPage - 1)})" class="px-3 py-1">←</button>
      ${buttons}
      <button onclick="goToAssignmentPage(${Math.min(totalPages, currentAssignmentPage + 1)})" class="px-3 py-1">→</button>
    </div>
  `
}

function goToAssignmentPage(page) {
  loadAssignments(page)
}

function renderPaginatedAssignments() {
  const start = (currentAssignmentPage - 1) * assignmentPageSize
  const end = start + assignmentPageSize
  const pageData = filteredAssignments.slice(start, end)

  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}


async function loadAchievements() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }

  try {
    const response = await authorizedFetch(
      `https://portal.gradients.academy/api/results/participant/dashboard/path/achievements`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) throw new Error(`Ошибка загрузки достижений: ${response.status}`);

    const achievements = await response.json();
    renderAchievements(achievements);
  } catch (err) {
    console.error('Ошибка при загрузке достижений:', err);
  }
}

function renderAchievements(achievements) {
  const container = document.querySelector('.grid.gap-5'); // Контейнер для достижений
  if (!container) return;

  container.innerHTML = achievements.map(achievement => `
    <div class="flex items-center gap-6 rounded-2xl p-5 ${achievement.unlocked ? '' : 'grayed'} bg-orange-secondary">
      <img src="https://portal.gradients.academy${achievement.icon}" alt="${achievement.code}" />
      <div class="space-y-0.5">
        <div class="flex items-center gap-1">
          <p>${achievement.code}</p>
          <div class="border-default flex items-center gap-0.5 rounded-2xl bg-white px-1.5">
            <p class="text-orange-primary mt-[.055rem] text-xs font-bold">${achievement.xp_reward} XP</p>
            <img src="/src/assets/images/coin.png" alt="coin" class="h-3.5 w-3.5" />
          </div>
        </div>
        <p class="text-orange-primary text-2xl font-bold">${achievement.title}</p>
      </div>
    </div>
  `).join('');
}

// Вызываем загрузку достижений при загрузке страницы
document.addEventListener('DOMContentLoaded', loadAchievements);
