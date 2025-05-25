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

function renderUserInfo(user) {
  const avatarEl = document.getElementById('user-avatar')
  const nameEl = document.getElementById('user-name')
  const roleEl = document.getElementById('user-role')
  const welcomeEl = document.querySelector('h1.text-xl')

  const defaultAvatar = '/src/assets/images/user_logo.jpg'
  const imgPath = user?.profile?.image

  let finalAvatar = defaultAvatar
  if (imgPath && typeof imgPath === 'string') {
    finalAvatar = imgPath.startsWith('http')
      ? imgPath
      : `https://portal.gradients.academy${imgPath}`
  }

  avatarEl.src = finalAvatar

  nameEl.textContent = user.profile.full_name_ru || ''
  const firstName = user.profile.full_name_ru?.split(' ')[0] || ''
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`

  const roleMap = {
    representative: 'Представитель',
  }
  roleEl.textContent = roleMap[user.profile.role] || user.profile.role || ''
}
// Загружает профиль участника по ?id=…
async function loadParticipantProfile() {
  const params = new URLSearchParams(window.location.search);
  const participantId = params.get('id');

  if (!participantId) {
    console.error('ID участника не передан');
    return;
  }

  try {
    const res = await authorizedFetch(
      `https://portal.gradients.academy/results/representatives/dashboard/participants/${participantId}/profile`
    );
    if (!res.ok) throw new Error(`Не удалось получить профиль: ${res.status}`);

    const profile = await res.json();
    participantProfile = profile; // сохранили в глобальную переменную

    renderParticipantData(profile); // показали данные
  } catch (err) {
    console.error('Ошибка при получении профиля участника:', err);
  }
}
function updateTabsWithParticipantId() {
  const params = new URLSearchParams(window.location.search);
  const participantId = params.get('id');

  if (!participantId) {
    console.warn('ID участника не найден в URL — ссылки не будут обновлены');
    return;
  }

  const tabProgress = document.getElementById('tab-progress');
  const tabPersonal = document.getElementById('tab-personal');
  const tabPayments = document.getElementById('tab-payments');

  if (tabProgress) tabProgress.href = `/representatives/members-progress.html?id=${participantId}`;
  if (tabPersonal) tabPersonal.href = `/representatives/members-personal-data.html?id=${participantId}`;
  if (tabPayments) tabPayments.href = `/representatives/members-payments.html?id=${participantId}`;
}
function renderParticipantData(profile) {
  const {
    full_name_ru,
    full_name_en,
    email,
    country,
    city,
    school,
    grade,
    parent_name_ru,
    parent_name_en,
    parent_phone,
    teacher_name_ru,
    teacher_name_en,
    teacher_phone,
    image_url,
    id
  } = profile;

  // Пока вставим только имя
  const nameHeadingEl = document.getElementById('participant-name-heading');
  const nameLinkEl = document.getElementById('participant-name-link');

  if (nameHeadingEl) nameHeadingEl.textContent = full_name_ru || '—';
  if (nameLinkEl) nameLinkEl.textContent = full_name_ru || '—';

  // Остальные поля пока просто записаны в переменные — будем подключать по мере необходимости
}

async function loadParticipantProgress() {
  const params = new URLSearchParams(window.location.search);
  const participantId = params.get('id');

  if (!participantId) {
    console.error('ID участника не передан');
    return;
  }

  try {
    const res = await authorizedFetch(
      `https://portal.gradients.academy/results/representatives/dashboard/participants/${participantId}/progress`
    );
    if (!res.ok) throw new Error(`Не удалось получить прогресс: ${res.status}`);

    const progress = await res.json();
    renderParticipantProgress(progress);
  } catch (err) {
    console.error('Ошибка при получении прогресса участника:', err);
  }
}
function renderParticipantProgress(progress) {
  const { current_level, current_xp, xp_to_next, xp_today } = progress;

  const levelEl = document.getElementById('level-value');
  const barEl = document.getElementById('progress-bar');
  const xpLeftEl = document.getElementById('xp-to-next');
  const xpTodayEl = document.getElementById('xp-today');

  const progressPercent =
    xp_to_next > 0 ? Math.min((current_xp / xp_to_next) * 100, 100) : 0;
  const xpLeft = Math.max(xp_to_next - current_xp, 0);

  if (levelEl) levelEl.textContent = current_level ?? '—';
  if (barEl) barEl.style.width = `${progressPercent}%`;
  if (xpLeftEl) xpLeftEl.textContent = `${xpLeft} XP`;
  if (xpTodayEl) xpTodayEl.textContent = `${xp_today} XP`;
}
function applyAchievementsData(achievements) {
  achievements.forEach(item => {
    const { code, unlocked, xp_reward, icon } = item;

    const block = document.querySelector(`[data-achievement-code="${code}"]`);
    if (!block) return;

    // 1. Обновляем XP
    const xpEl = block.querySelector('p.text-xs.font-semibold');
    if (xpEl) {
      xpEl.textContent = `${xp_reward} XP`;
    }

    // 2. Обновляем иконку
    // const imgEl = block.querySelector('img');
    // if (imgEl) {
    //   imgEl.src = icon;
    // }

    // 3. Стилизация в зависимости от unlocked
    if (!unlocked) {
      block.classList.add('opacity-50');
    } else {
      block.classList.remove('opacity-50');
    }
  });
}
async function loadParticipantAchievements() {
  const params = new URLSearchParams(window.location.search);
  const participantId = params.get('id');
  if (!participantId) return;

  try {
    const res = await authorizedFetch(
      `https://portal.gradients.academy/results/representatives/dashboard/participants/${participantId}/achievements`
    );
    if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
    const achievements = await res.json();
    applyAchievementsData(achievements);
  } catch (err) {
    console.error('Ошибка загрузки достижений', err);
  }
}


document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user);
  updateTabsWithParticipantId();
  
  try {
    await loadParticipantProfile();
    await loadParticipantAchievements()
    // await loadRepresentativeRanking()
    // await loadParticipantsTrend()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})