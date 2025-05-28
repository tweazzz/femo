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

let dynamicsChartInstance = null;

async function loadParticipantsDynamics() {
  try {
    const res = await authorizedFetch('https://portal.gradients.academy/results/representatives/dashboard/participants/dynamics');
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
      'https://portal.gradients.academy/results/representatives/dashboard/participants/summary'
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


document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user);
  
  try {
    loadParticipantsDynamics();
    await loadParticipantsSummary();
    await loadRepresentativeProfileForHeader();
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})
