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
      `https://portal.femo.kz/api/results/representatives/dashboard/participants/${participantId}/profile`
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
    id,
    email,
    full_name_ru,
    full_name_en,
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
    image_url
  } = profile;

  // Вставляем имя в шапку и ссылку
  const nameHeadingEl = document.getElementById('participant-name-heading');
  const nameLinkEl    = document.getElementById('participant-name-link');
  if (nameHeadingEl) nameHeadingEl.textContent = full_name_ru || '—';
  if (nameLinkEl)    nameLinkEl.textContent    = full_name_ru || '—';
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
  // Личные данные
  document.getElementById('profile-id').textContent              = id;
  document.getElementById('profile-email').textContent           = email || '—';
  document.getElementById('profile-full-name-ru').textContent    = full_name_ru || '—';
  document.getElementById('profile-full-name-en').textContent    = full_name_en || '—';
  document.getElementById('profile-country').textContent         = country || '—';
  document.getElementById('profile-city').textContent            = city || '—';
  document.getElementById('profile-school').textContent          = school || '—';
  document.getElementById('profile-grade').textContent           = reverseClassMap[grade] || '—';

  // Фото участника
  const photoEl     = document.getElementById('participant-photo');
  const imageNameEl = document.getElementById('profile-image');
  if (photoEl) {
    photoEl.src = image_url
      ? (image_url.startsWith('http') ? image_url : `https://portal.femo.kz${image_url}`)
      : '/src/assets/images/user_logo.jpg';
  }
  if (imageNameEl) imageNameEl.textContent = image_url
      ? image_url.split('/').pop()
      : '—';

  // Данные родителя
  document.getElementById('parent-fullname').textContent = parent_name_ru ? 'Данные родителя' : '';
  document.getElementById('parent-name-ru').textContent  = parent_name_ru  || '—';
  document.getElementById('parent-name-en').textContent  = parent_name_en  || '—';
  document.getElementById('parent-phone').textContent    = parent_phone    || '—';

  // Данные учителя
  document.getElementById('teacher-name-ru').textContent = teacher_name_ru  || '—';
  document.getElementById('teacher-name-en').textContent = teacher_name_en  || '—';
  document.getElementById('teacher-phone').textContent   = teacher_phone    || '—';
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
      `https://portal.femo.kz/api/results/representatives/dashboard/participants/${participantId}/progress`
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
      `https://portal.femo.kz/api/results/representatives/dashboard/participants/${participantId}/achievements`
    );
    if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
    const achievements = await res.json();
    applyAchievementsData(achievements);
  } catch (err) {
    console.error('Ошибка загрузки достижений', err);
  }
}


// ——————————————————————————————
// 8) Загружаем результаты олимпиад
async function loadParticipantResults() {
  const participantId = new URLSearchParams(location.search).get('id')
  if (!participantId) return
  const res = await authorizedFetch(
    `https://portal.femo.kz/api/results/representatives/dashboard/participants/${participantId}/results`
  )
  if (!res.ok) throw new Error(res.status)
  const results = await res.json()
  renderParticipantResults(results)
}

// 9) Рендерим таблицу результатов и добавляем кнопку скачивания
function renderParticipantResults(results) {
  const tbody = document.querySelector('.table-olympiads tbody')
  tbody.innerHTML = ''
  if (!results.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4">Нет данных</td></tr>`
    return
  }
  const participantId = new URLSearchParams(location.search).get('id')
  results.forEach(r => {
    const tr = document.createElement('tr')
    tr.classList.add('hover:bg-gray-50')
    tr.innerHTML = `
      <td class="p-table">${r.olympiad}</td>
      <td class="p-table">${r.score}</td>
      <td class="p-table">${r.solved}/${r.total}</td>
      <td class="p-table">${r.place}-е</td>
      <td class="p-table">
        <button class="flex items-center gap-1 text-orange-500" 
                onclick="downloadCertificate(${participantId}, ${r.id})">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
               stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9
                     a2.25 2.25 0 0 0 2.25 2.25h9
                     a2.25 2.25 0 0 0 2.25-2.25v-9
                     a2.25 2.25 0 0 0-2.25-2.25H15
                     M9 12l3 3m0 0 3-3m-3 3V2.25"/>
          </svg>
          Скачать
        </button>
      </td>`
    tbody.appendChild(tr)
  })
}

// 10) Скачиваем сертификат
async function downloadCertificate(participantId, olympiadId) {
  try {
    const res = await authorizedFetch(
      `https://portal.femo.kz/api/results/representatives/dashboard/participants/` +
      `${participantId}/certificates/${olympiadId}/download`
    );
    if (!res.ok) throw new Error(res.status)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `certificate_${olympiadId}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Ошибка при скачивании сертификата:', err)
    alert('Не удалось скачать сертификат')
  }
}

// ——————————————————————————————
async function deleteCurrentParticipant() {
  const params = new URLSearchParams(window.location.search);
  const participantId = params.get('id');
  if (!participantId) return alert('ID участника не найден');

  try {
    const res = await authorizedFetch(
      `https://portal.femo.kz/api/results/representatives/dashboard/participants/${participantId}/`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(`Status ${res.status}`);
    alert('Участник успешно удалён');
    // если нужно — редирект на список:
    window.location.href = '/representatives/members.html';
  } catch (err) {
    console.error(err);
    alert('Ошибка при удалении участника: ' + err.message);
  }
}

// после того как определили функцию, вешаем её на кнопку:
document.getElementById('delete-account-btn')?.addEventListener('click', () => {
    deleteCurrentParticipant();
});

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user);
  updateTabsWithParticipantId();
  
  try {
    await loadParticipantProfile();
    await loadParticipantAchievements()
    // await loadParticipantResults() 
    await loadRepresentativeProfileForHeader()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})