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
    'https://portal.femo.kz/api/users/participant/profile/'
  );
  if (!res.ok) throw new Error('Не удалось загрузить профиль');
  return await res.json();
}
let currentUserFullName = '';
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

  const imgPath = p.image;
  avatarEl.src = imgPath
    ? (imgPath.startsWith('http') ? imgPath : `https://portal.femo.kz${imgPath}`)
    : '/src/assets/images/user-3296.svg';
  
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

  const roleMap = { participant: 'Представитель' };
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
  currentUserFullName = profile.full_name_ru
  renderUserInfo(profile)

  try {
    await loadAssignments()
    setupAssignmentFilters()
    const data = await loadSummary();
    if (data) updateProgressBar(data.recommendation?.xp_to_next ?? 100);
    populateCountryFilter()
    let sortAscending = true

      const sortHeader = document.getElementById('sort-rank-header')

        if (sortHeader) {
    sortHeader.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const A = a.rank
        const B = b.rank
        return sortAscending ? A - B : B - A
      })
      sortAscending = !sortAscending
      renderPaginatedAssignments()
    })}
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
      `https://portal.femo.kz/api/results/participant/dashboard/ranking/summary/`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) throw new Error('Ошибка загрузки сводки');

    const data = await response.json();

    document.getElementById('assignment_points').textContent = data.assignment_points;
    document.getElementById('assignments_percent').textContent = data.assignments_percent;
    document.getElementById('olympiad_points').textContent = data.olympiad_points;
    document.getElementById('olympiad_percentile').textContent = data.olympiad_percentile;
    document.getElementById('total_points').textContent = data.total_points;
    document.getElementById('total_percentile').textContent = data.total_percentile;
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


let assignmentFilters = {
  search: '',
  country: '',
  grade: '',
}

async function loadAssignments(page = 1) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  const params = new URLSearchParams()
  params.append('page', page)
  if (assignmentFilters.search)
    params.append('search', assignmentFilters.search)
  if (assignmentFilters.country)
    params.append('country', assignmentFilters.country)
  if (assignmentFilters.grade)
    params.append('grade', assignmentFilters.grade)

  try {
    const response = await authorizedFetch(
      `https://portal.femo.kz/api/results/participant/dashboard/ranking/global/?${params.toString()}`,
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
    allAssignments = data.results
    totalAssignmentCount = data.count
    currentAssignmentPage = page

    renderAssignmentTable(allAssignments)
    renderAssignmentPagination()
    document.getElementById('total-rateoverall-count').textContent =
      totalAssignmentCount
  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('rateoverall-tbody').innerHTML = `
      <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
    `
  }
}

const classMap = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eights',
  9: 'ninth',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
}


// 3) Модифицированная функция рендера таблицы
function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('rateoverall-tbody');
  if (!tbody) return;
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
  // Если нет данных
  if (assignments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td>
      </tr>
    `;
    return;
  }

  // Иначе отображаем задания
  tbody.innerHTML = assignments
    .map((task) => {
      // подсветка, если это текущий пользователь
      const highlight = task.full_name === currentUserFullName
        ? 'style="background-color: #FEF1E4"'
        : '';

      return `
        <tr ${highlight} class="hover:bg-gray-50">
          <td>
            ${[1,2,3].includes(task.rank)
              ? crownSvg
              : task.rank}
          </td>
          <td>${task.full_name}</td>
          <td>
            ${Object.keys(classMap)
              .find((key) => classMap[key] === task.grade)
            || task.grade}
          </td>
          <td>${task.country.name}</td>
          <td class="text-orange-primary font-bold">${task.total_points}</td>
          <td>${task.olympiad_points}</td>
          <td>${task.assignment_points}</td>
        </tr>
      `;
    })
    .join('');
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
  const pageData = allAssignments.slice(start, end)

  document.getElementById('total-rateoverall-count').textContent =
    allAssignments.length
  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}

function applyAssignmentFilters() {
  assignmentFilters.search =
    document.getElementById('filter-search')?.value.trim() || ''
  assignmentFilters.country =
    document.getElementById('filter-country')?.value || ''
  assignmentFilters.grade = document.getElementById('filter-grade')?.value || ''

  loadAssignments(1)
}


function setupAssignmentFilters() {
  document
    .getElementById('filter-search')
    ?.addEventListener('input', applyAssignmentFilters)
  document
    .getElementById('filter-country')
    ?.addEventListener('change', applyAssignmentFilters)
  document
    .getElementById('filter-grade')
    ?.addEventListener('change', applyAssignmentFilters)

}


async function populateCountryFilter() {
  try {
    const response = await authorizedFetch(
      'https://portal.femo.kz/api/common/countries/?page=1&page_size=500'
    );

    if (!response.ok) throw new Error(`Ошибка загрузки стран: ${response.status}`);

    const data = await response.json();

    const select = document.getElementById('filter-country');

    if (!select) {
      console.error('Не найден элемент #filter-country');
      return;
    }

    // Очистка списка перед заполнением
    select.innerHTML = '<option value="" data-i18n="rate.all_country">Все страны</option>';

    // Заполняем список стран
    data.results.forEach((country) => {
      const option = document.createElement('option');
      option.value = country.code;
      option.textContent = country.name;
      select.appendChild(option);
    });

  } catch (err) {
    console.error('Не удалось загрузить список стран:', err);
  }
}
