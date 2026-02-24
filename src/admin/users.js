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
    console.warn(`Пользователь с ролью "${role}" не имеет доступа к админке. Редирект.`)
    window.location.href = '/index.html'
    return null
  }

  return user
}

const getTranslatedText = (key, defaultText) => {
return (window.i18nDict && window.i18nDict[key]) || defaultText;
};

// Основная отрисовка профиля
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

  const updateRoleText = () => {
      const roleKey = `role.${p.role}`;
      roleEl.textContent = getTranslatedText(roleKey, p.role === 'administrator' ? 'Администратор' : p.role);
      roleEl.setAttribute('data-i18n', roleKey); // Optional, if we want applyTranslations to handle it later
  };
  updateRoleText();

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
      
      updateRoleText();
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

// Функция, которая дергает профиль администратора
async function loadAdminProfile() {
  const token = localStorage.getItem('access_token');
  if (!token) throw new Error('Токен не найден');

  const res = await authorizedFetch(
    'https://portal.femo.kz/api/users/administrator/profile/',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Ошибка загрузки профиля: ${res.status}`);
  return await res.json();
}

let allUsers = []
let filteredUsers = []
let currentFilters = {
  search: '',
  email: '',
  country: '',
  city: '',
  role: '',
  grade: '',
}

// Загрузка всех пользователей
async function loadAllUsers() {
  try {
    console.log('Загрузка пользователей...')

    const res = await authorizedFetch(
      'https://portal.femo.kz/api/users/dashboard/'
    )
    if (!res.ok) {
      throw new Error(`Ошибка HTTP: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    console.log('Получены данные:', data)

    if (!Array.isArray(data)) {
      throw new Error(getTranslatedText('error.expected_array', 'Ожидался массив пользователей'))
    }

    allUsers = data
    initFilters(allUsers)
    currentPage = 1;
    updateTotalCountAndPagination();
    applyFilters();
  } catch (err) {
    console.error('Ошибка загрузки:', err)
    const tbody = document.querySelector('tbody')
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="px-6 py-4 text-center text-red-500">
          ${err.message}
        </td>
      </tr>
    `
  }
}

// Инициализация фильтров
function initFilters(users) {
  // Страны
  const countries = [...new Set(users.map(u => u.country))].filter(Boolean)
  const countrySelect = document.querySelector('.country-filter')
  countrySelect.innerHTML = `
    <option value="" data-i18n="users.all_countries">Все страны</option>
    ${countries
       .map(c => `<option value="${c}">${c}</option>`)
       .join('')}
  `
  // Города
  const cities = [...new Set(users.map(u => u.city))]
    .filter(Boolean)
    .sort((a, b) => {
        const lang = (localStorage.getItem('lang') || 'ru').toLowerCase();
        const sortLocale = lang === 'en' ? 'en' : (lang === 'kz' || lang === 'kk' ? 'kk' : 'ru');
        return a.localeCompare(b, sortLocale);
    });

  const citySelect = document.querySelector('.city-filter');
  citySelect.innerHTML = `
    <option value="" data-i18n="users.all_cities">Все города</option>
    ${cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
  `;
  // Роли (уже есть в HTML)

  // Классы
  const grades = [...new Set(users.map((u) => u.grade))].filter(Boolean).sort()
  const gradeSelect = document.querySelector('.grade-filter')
  gradeSelect.innerHTML = `
      <option value="" data-i18n="users.all_classes">Все классы</option>
      ${Object.entries(classMap)
        .map(([num, name]) => `<option value="${name}">${num}</option>`)
        .join('')}
    `

  // Навешиваем обработчики
  document.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', () => applyFilters())
  })
}

/* ----------------- applyFilters (заменить текущую) ----------------- */
function applyFilters() {
  // Обновляем текущие фильтры (city — нормализованное значение, т.к. option.value = normalized)
  currentFilters.search = document.querySelector('#search_by_id_or_name')
    .value.trim().toLowerCase();
  currentFilters.email = document.querySelector('#search_by_email')
    ? document.querySelector('#search_by_email').value.trim().toLowerCase()
    : '';
  currentFilters.country = document.querySelector('.country-filter').value;
  currentFilters.city = document.querySelector('.city-filter').value || '';
  currentFilters.role = document.querySelector('.role-filter').value;
  currentFilters.grade = document.querySelector('.grade-filter').value;

  // НЕ СТАВИМ currentPage = 1 здесь — это ломало навигацию при кликах по странице

  const filtered = allUsers.filter(user => {
    const term = currentFilters.search;
    const emailTerm = currentFilters.email;
    const idStr = String(user.id || '');

    const isDigits = /^\d+$/.test(term);

    const matchSearch = isDigits
      ? idStr.includes(term) // если пользователь ввёл только цифры — ищем по id
      : ((user.full_name_ru || '').toLowerCase().includes(term) || idStr.includes(term));

    const matchEmail = !emailTerm || (user.email || '').toLowerCase().includes(emailTerm);

    const matchCountry =
      !currentFilters.country ||
      (user.country || '') === currentFilters.country;

    const matchCity =
      !currentFilters.city ||
      normalize(user.city) === normalize(currentFilters.city);

    const matchRole =
      !currentFilters.role ||
      (user.role || '') === currentFilters.role;

    const matchGrade =
      !currentFilters.grade ||
      (user.grade || '') === currentFilters.grade;

    return matchSearch && matchEmail && matchCountry && matchCity && matchRole && matchGrade;
  });
  
  filteredUsers = filtered; // Сохраняем отфильтрованный список для экспорта

  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  renderUsers(pageItems);

  // и обновляем пагинацию/счётчики
  updateTotalCountAndPagination();
}


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
// Отрисовка пользователей
function getCountryCode(countryName) {
  const map = {
  "Афганистан":"AF","Албания":"AL","Алжир":"DZ","Американское Самоа":"AS","Андорра":"AD","Ангола":"AO","Антигуа и Барбуда":"AG",
  "Аргентина":"AR","Армения":"AM","Аруба":"AW","Австралия":"AU","Австрия":"AT","Азербайджан":"AZ","Багамы":"BS",
  "Бахрейн":"BH","Бангладеш":"BD","Барбадос":"BB","Беларусь":"BY","Белиз":"BZ","Бельгия":"BE","Бенин":"BJ",
  "Бермуды":"BM","Бутан":"BT","Боливия":"BO","Босния и Герцеговина":"BA","Ботсвана":"BW","Бразилия":"BR","Бруней":"BN",
  "Буркина-Фасо":"BF","Бурунди":"BI","Кабо-Верде":"CV","Камбоджа":"KH","Камерун":"CM","Канада":"CA","Центральноафриканская Республика":"CF",
  "Чад":"TD","Чили":"CL","Китай":"CN","Колумбия":"CO","Коморы":"KM","Конго":"CG","Конго (ДРК)":"CD","Коста-Рика":"CR",
  "Кот‑д’Ивуар":"CI","Хорватия":"HR","Куба":"CU","Кипр":"CY","Чехия":"CZ","Дания":"DK","Джибути":"DJ","Доминика":"DM",
  "Доминиканская Республика":"DO","Эквадор":"EC","Египет":"EG","Сальвадор":"SV","Экваториальная Гвинея":"GQ","Эритрея":"ER",
  "Эстония":"EE","Эсватини":"SZ","Эфиопия":"ET","Фиджи":"FJ","Финляндия":"FI","Франция":"FR","Габон":"GA","Гамбия":"GM",
  "Грузия":"GE","Гана":"GH","Греция":"GR","Гренада":"GD","Гватемала":"GT","Гвинея":"GN","Гвинея-Бисау":"GW","Гайана":"GY",
  "Гаити":"HT","Гондурас":"HN","Венгрия":"HU","Исландия":"IS","Индия":"IN","Индонезия":"ID","Иран":"IR","Ирак":"IQ",
  "Ирландия":"IE","Израиль":"IL","Италия":"IT","Ямайка":"JM","Япония":"JP","Иордания":"JO","Казахстан":"KZ","Кения":"KE",
  "Кирибати":"KI","Киргизия":"KG","Кувейт":"KW","Лаос":"LA","Латвия":"LV","Ливан":"LB","Лесото":"LS","Либерия":"LR",
  "Ливия":"LY","Литва":"LT","Люксембург":"LU","Мадагаскар":"MG","Малави":"MW","Малайзия":"MY","Мальдивы":"MV","Мали":"ML",
  "Мальта":"MT","Маршалловы Острова":"MH","Мавритания":"MR","Маврикий":"MU","Мексика":"MX","Микронезия":"FM","Молдова":"MD",
  "Монако":"MC","Монголия":"MN","Черногория":"ME","Марокко":"MA","Мозамбик":"MZ","Мьянма":"MM","Намибия":"NA","Науру":"NR",
  "Непал":"NP","Нидерланды":"NL","Новая Зеландия":"NZ","Никарагуа":"NI","Нигер":"NE","Нигерия":"NG","Северная Корея":"KP",
  "Северная Македония":"MK","Норвегия":"NO","Оман":"OM","Пакистан":"PK","Палау":"PW","Панама":"PA","Папуа — Новая Гвинея":"PG",
  "Парагвай":"PY","Перу":"PE","Филиппины":"PH","Польша":"PL","Португалия":"PT","Катар":"QA","Республика Корея":"KR","Румыния":"RO",
  "Россия":"RU","Руанда":"RW","Сан-Марино":"SM","Сан-Томе и Принсипи":"ST","Саудовская Аравия":"SA","Сенегал":"SN","Сербия":"RS",
  "Сейшелы":"SC","Сьерра-Леоне":"SL","Сингапур":"SG","Словакия":"SK","Словения":"SI","Соломоновы Острова":"SB","Сомали":"SO",
  "Южная Африка":"ZA","Южный Судан":"SS","Испания":"ES","Шри-Ланка":"LK","Судан":"SD","Суринам":"SR","Швеция":"SE","Швейцария":"CH",
  "Сирия":"SY","Таджикистан":"TJ","Танзания":"TZ","Таиланд":"TH","Того":"TG","Тонга":"TO","Тринидад и Тобаго":"TT","Тунис":"TN",
  "Турция":"TR","Туркменистан":"TM","Уганда":"UG","Украина":"UA","Объединённые Арабские Эмираты":"AE","Великобритания":"GB","США":"US",
  "Уругвай":"UY","Узбекистан":"UZ","Вануату":"VU","Ватикан":"VA","Венесуэла":"VE","Вьетнам":"VN","Йемен":"YE","Замбия":"ZM",
  "Зимбабве":"ZW",
  }
  return map[countryName] || ''
}

function getCountryFlagImg(countryName) {
  const code = getCountryCode(countryName).toLowerCase()
  return code
    ? `<img src="https://flagcdn.com/16x12/${code}.png" alt="${countryName}" class="inline-block w-5 h-3 rounded-sm" />`
    : ''
}

const ROLE_I18N_KEYS = {
  participant: 'users.participant',
  representative: 'users.representative'
};

// Простая утилита для безопасного вставления текста в HTML
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Переводит элементы внутри переданного узла, опираясь на window.i18nDict
function translateNode(root) {
  const dict = window.i18nDict || {};
  if (!root) return;
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (!key) return;
    const translated = dict[key];
    if (typeof translated !== 'undefined') {
      // для option и других элементов используем textContent
      el.textContent = translated;
    }
  });
}
function v(val) {
  return val === null || val === undefined || val === ''
    ? '—'
    : escapeHtml(String(val));
}
const languageMap = {
  ru: 'Русский',
  kk: 'Қазақша',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  az: 'Azərbaycanca',
  ka: 'ქართული'
};
function resolveStudyLanguage(value) {
  if (!value) return '';
  if (languageMap[value]) {
    return languageMap[value];
  }
  return value;
}

function renderUsers(users) {
  const tbody = document.querySelector('tbody');
  if (!tbody) return;

  tbody.innerHTML = users.length === 0
    ? `
    <tr>
      <td colspan="12" class="px-6 py-4 text-center text-gray-500" data-i18n="users.empty">
        ${escapeHtml((window.i18nDict && window.i18nDict['users.empty']) || 'Пользователи не найдены')}
      </td>
    </tr>
  `
    : users.map((user) => {
        // роль: класс и i18n-ключ
        const roleKey = ROLE_I18N_KEYS[user.role] || '';
        const roleClass = user.role === 'participant' ? 'text-blue-primary' : 'text-violet-primary';
        // fallback label (если словаря нет)
        const fallbackLabel = user.role === 'participant' ? 'Участник' : 'Представитель';
        const translatedLabel = (window.i18nDict && roleKey && window.i18nDict[roleKey]) || fallbackLabel;

        const roleHtml = `
          <span class="${escapeHtml(roleClass)} flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium"
                data-i18n="${escapeHtml(roleKey)}">
            <span class="text-xl">•</span> ${escapeHtml(translatedLabel)}
          </span>`;

        const avatar = user.image
          ? `<img src="${escapeHtml(user.image)}" alt="${escapeHtml(user.full_name_ru)}" class="h-8 w-8 rounded-full object-cover" />`
          : `<div class="h-8 w-8 rounded-full bg-gray-300"></div>`;

      return `
        <tr class="hover:bg-gray-50">
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center">
              ${avatar}
              <div class="ml-4">
                <div class="text-sm font-medium text-gray-900">
                  ${v(user.full_name_ru)}
                </div>
              </div>
            </div>
          </td>

          <td class="px-6 py-4 text-sm whitespace-nowrap">${v(user.id)}</td>

          <td class="px-6 py-4 text-sm whitespace-nowrap">${v(user.email)}</td>

          <td class="px-6 py-4 whitespace-nowrap">
            <div class="flex items-center gap-1">
              ${getCountryFlagImg(user.country)}
              <span class="text-sm text-gray-900">${v(user.country)}</span>
            </div>
          </td>

          <td class="px-6 py-4 text-sm whitespace-nowrap">${v(user.city)}</td>

          <td class="px-6 py-4 text-sm whitespace-nowrap">${v(user.school)}</td>
          <td class="px-6 py-4 text-sm whitespace-nowrap">${v(resolveStudyLanguage(user.study_language))}</td>
          <td class="px-6 py-4 text-sm whitespace-nowrap">${v(user.parent_full_name_ru)}</td>

          <td class="px-6 py-4 text-sm whitespace-nowrap">${v(user.student_full_name_en)}</td>

          <td class="px-6 py-4 whitespace-nowrap">
            ${roleHtml}
          </td>

          <td class="px-6 py-4 text-sm whitespace-nowrap">${v(reverseClassMap[user.grade])}</td>

          <td class="px-6 py-4 text-sm whitespace-nowrap">
            <div class="flex justify-between gap-2 *:cursor-pointer">
              <button type="button" onclick="confirmDeleteUser(${user.id})" class="text-gray-400 hover:text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
              <button type="button" onclick="openEditModal(${user.id})" class="hover:text-blue-primary text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;

      }).join('');

  // Сразу прогоняем перевод для вставленных элементов (если словарь уже есть)
  translateNode(tbody);

  // Подпишемся на события языка — при смене языка переведём tbody заново.
  // (Если у тебя уже есть глобальные обработчики — этот блок можно убрать, но он безопасен.)
  function onLang() { translateNode(tbody); }
  window.removeEventListener('i18n:languageReady', onLang);
  window.addEventListener('i18n:languageReady', onLang);
  window.removeEventListener('i18n:languageChanged', onLang);
  window.addEventListener('i18n:languageChanged', onLang);
}

// Вспомогательная функция для флагов
function getFlagEmoji(country) {
  const flags = {
    Казахстан: '🇰🇿',
    Россия: '🇷🇺',
    Узбекистан: '🇺🇿',
  }
  return flags[country] || ''
}

// Обновленный setupSearch с debounce
function setupSearch() {
  const searchInput = document.querySelector('#search_by_id_or_name')
  const emailInput = document.querySelector('#search_by_email')

  const debouncedSearch = debounce(() => {
    // при изменении поискового текста возвращаемся на 1-ю страницу
    currentPage = 1;
    applyFilters();
  }, 500)

  searchInput.addEventListener('input', debouncedSearch)
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      currentPage = 1;
      applyFilters()
    }
  })

  if (emailInput) {
    emailInput.addEventListener('input', debouncedSearch)
    emailInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        currentPage = 1;
        applyFilters()
      }
    })
  }
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

    // 2) Подтягиваем актуальный профиль по API
    const profileData = await loadAdminProfile();
    // 3) Рисуем шапку
    renderUserInfo(profileData);
  setupSearch()

  await populateCountryAndClassOptions()

  try {
    await loadAllUsers();
    await loadAllOlympiadsAndPopulate();
  } catch (err) {
    console.error('Ошибка инициализации:', err)
  }
})

// Функция debounce
function debounce(func, delay) {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func.apply(this, args), delay)
  }
}

async function downloadAllUsersExcel() {
  try {
    if (!filteredUsers || filteredUsers.length === 0) {
      alert(window.i18nDict && window.i18nDict['users.empty_export'] || 'Нет данных для экспорта');
      return;
    }

    // Определяем текущую олимпиаду (если выбрана)
    const olympiadSelect = document.querySelector('.olympiad-filter');
    const selectedOlympiadId = olympiadSelect ? olympiadSelect.value : '';
    let selectedOlympiadName = '';
    if (selectedOlympiadId && window._femo_olympiads) {
      const o = window._femo_olympiads.find(x => String(x.id) === String(selectedOlympiadId));
      if (o) selectedOlympiadName = o.title || '';
    }

    // Формируем CSV
    // Поля: ID, ФИО, Email, Страна, Город, Школа, Язык, Роль, Класс, Олимпиада
    // Можно добавить: Родитель, Телефон и т.д.
    
    const headers = [
      'ID', 
      'Full Name', 
      'Email', 
      'Country', 
      'City', 
      'School', 
      'Study Language', 
      'Role', 
      'Grade', 
      'Olympiad',
      'Parent Name',
      'Phone'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [headers.join(',')];

    for (const u of filteredUsers) {
      const gradeNum = reverseClassMap[u.grade] || u.grade || '';
      // Если у юзера есть поле olympiad, берем его, иначе если выбрана олимпиада в фильтре - используем её
      const olympiadVal = u.olympiad_title || u.olympiad || selectedOlympiadName || '';

      const row = [
        u.id,
        u.full_name_ru || u.full_name_en || '',
        u.email,
        u.country,
        u.city,
        u.school,
        u.study_language,
        u.role,
        gradeNum,
        olympiadVal,
        u.parent_name_ru || '',
        u.phone_number || ''
      ].map(escapeCsv).join(',');
      
      csvRows.push(row);
    }

    const csvString = '\uFEFF' + csvRows.join('\n'); // BOM for Excel
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `users_export_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

  } catch (err) {
    console.error('Ошибка при экспорте:', err);
    alert('Ошибка экспорта данных');
  }
}

const pageSize = 20
let currentPage = 1
let totalUserCount = 0


/* ----------------- updateTotalCountAndPagination (заменить текущую) ----------------- */
function updateTotalCountAndPagination() {
  // Считаем, сколько элементов осталось после фильтрации (включая city)
  const totalCount = allUsers.filter(user => {
    const term = currentFilters.search || '';
    const idStr = String(user.id || '');

    const matchSearch =
      (user.full_name_ru || '').toLowerCase().includes(term) ||
      idStr.includes(term);

    const matchCountry =
      !currentFilters.country ||
      (user.country || '') === currentFilters.country;

    const matchCity =
      !currentFilters.city ||
      normalize(user.city) === normalize(currentFilters.city);

    const matchRole =
      !currentFilters.role ||
      (user.role || '') === currentFilters.role;

    const matchGrade =
      !currentFilters.grade ||
      (user.grade || '') === currentFilters.grade;

    return matchSearch && matchCountry && matchCity && matchRole && matchGrade;
  }).length;

  totalUserCount = totalCount;
  const countEl = document.getElementById('total-users-count');
  if (countEl) countEl.textContent = totalCount;
  renderPaginationControls(totalCount);
}
function renderPaginationControls(totalCount) {
  const container = document.getElementById('pagination');
  container.innerHTML = '';
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize)); // минимум 1 для корректного отображения

  // Clamp currentPage в допустимый диапазон
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  // Кнопка «←»
  const prev = document.createElement('button');
  prev.innerHTML = '&larr;';
  prev.disabled = currentPage === 1 || totalCount === 0;
  prev.className = 'px-3 py-1 border rounded';
  prev.onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      applyFilters();
      // updateTotalCountAndPagination будет вызван внутри applyFilters уже
    }
  };
  container.appendChild(prev);

  // Номера — показываем все (если нужно позже можно сделать окно пагинации)
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = `px-3 py-1 border rounded ${
      i === currentPage
        ? 'border-orange-primary text-orange-primary'
        : 'text-gray-600 hover:bg-gray-50'
    }`;
    btn.onclick = () => {
      if (currentPage === i) return;
      currentPage = i;
      applyFilters();
    };
    container.appendChild(btn);
  }

  // Кнопка «→»
  const next = document.createElement('button');
  next.innerHTML = '&rarr;';
  next.disabled = currentPage === totalPages || totalCount === 0;
  next.className = 'px-3 py-1 border rounded';
  next.onclick = () => {
    if (currentPage < totalPages) {
      currentPage++;
      applyFilters();
    }
  };
  container.appendChild(next);
}


async function addUser(formId, role = 'participant') {
  const form = document.getElementById(formId)
  const formData = new FormData(form)
  // найдём инпут класса и возьмём из него code
  const classInput = form.querySelector('input[name="class"]');
  const gradeCode = classInput?.dataset.code || classInput?.value;

  const data = {
    email: formData.get('email'),
    password: form.querySelector('#password')?.value || '',
    full_name_ru: formData.get('fullname'),
    country: getCountryCode(formData.get('country')) || formData.get('country'),
    city: formData.get('city') || '',
    school: formData.get('school') || '',
    grade: gradeCode,
    parent_name_ru: formData.get('parent_name') || '',
    parent_phone_number: formData.get('parent_phone') || '',
    teacher_name_ru: formData.get('teacher_name') || '',
    teacher_phone_number: formData.get('teacher_phone') || '',
    phone_number: formData.get('phone_number') || '',
    role: role,
  }

  try {
    const token = localStorage.getItem('access_token')
    if (!token) {
      throw new Error('Токен не найден в localStorage')
    }

    const response = await fetch(
      'https://portal.femo.kz/api/users/dashboard/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      }
    )

    const responseBody = await response.json()

    if (!response.ok) {
      throw new Error(responseBody.detail || JSON.stringify(responseBody))
    }

    alert('Пользователь успешно добавлен!')
    form.reset()

    // Скрываем модалку
    const modal = document.getElementById('modalAdd')
    if (modal) {
      modal.classList.add('hidden')
      modal.style.pointerEvents = 'auto'
    }
    location.reload()

    // Скрываем оверлей, если он есть
    const overlay =
      document.querySelector('.overlay') ||
      document.querySelector('.modal-overlay')
    document.querySelector('.modal-backdrop')
    if (overlay) {
      overlay.classList.add('hidden')
      overlay.style.pointerEvents = 'none'
    }

    // Снимаем блокировку скролла и взаимодействия с body
    document.body.classList.remove('modal-open', 'no-scroll', 'overflow-hidden')
    document.body.style.overflow = ''
    document.body.style.pointerEvents = 'auto'
  } catch (error) {
    alert(`Ошибка: ${error.message}`)
  }
}

// document.addEventListener('DOMContentLoaded', () => {
//   document
//     .getElementById('participant-form')
//     .addEventListener('submit', (e) => {
//       e.preventDefault()
//       addUser('participant-form', 'participant')
//     })

//   document
//     .getElementById('representative-form')
//     .addEventListener('submit', (e) => {
//       e.preventDefault()
//       addUser('representative-form', 'representative')
//     })
// })

async function deleteUser(userId) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await fetch(
      `https://portal.femo.kz/api/users/dashboard/${userId}/`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Ошибка удаления: ${response.statusText}`)
    }

    alert('Пользователь успешно удален')
    await loadAllUsers() // Перезагрузка списка
  } catch (err) {
    console.error('Ошибка при удалении пользователя:', err)
    alert('Не удалось удалить пользователя')
  }
}

let userIdToDelete = null

function handleDeleteConfirmed() {
  if (userIdToDelete !== null) {
    deleteUser(userIdToDelete)
    userIdToDelete = null

    // Закрываем модальное окно
    toggleModal('modalDel', false)
  }
}

function confirmDeleteUser(id, fullName = null) {
  userIdToDelete = id

  const nameEl = document.getElementById('delete-user-name')

  if (nameEl) {
    if (fullName) {
      nameEl.textContent = fullName
    } else {
      const user = allUsers.find((u) => u.id === id)
      nameEl.textContent = user ? user.full_name_ru : ''
    }
  }

  toggleModal('modalDel', true)
}

function confirmDeleteUserFromEdit() {
  const modal = document.getElementById('modalEdit')
  const form = modal.querySelector('form:not(.hidden)')
  const fullName = form.querySelector('input[name="fullname"]').value
  const emailInput = form.querySelector('input[name="email"]')
  const userId = emailInput?.dataset.userId

  if (!userId) {
    alert('ID пользователя не найден')
    return
  }

  confirmDeleteUser(parseInt(userId), fullName)
}

function resolveBalanceValue(user) {
  const raw =
    user?.balance ??
    user?.wallet?.balance ??
    user?.wallet_balance ??
    user?.account_balance ??
    user?.profile?.balance ??
    user?.balance_amount ??
    user?.balance_value ??
    user?.balance?.amount ??
    user?.wallet?.amount
  const num = Number(raw ?? 0)
  return Number.isFinite(num) ? num : 0
}

function hasBalanceValue(user) {
  return (
    user?.balance != null ||
    user?.wallet?.balance != null ||
    user?.wallet_balance != null ||
    user?.account_balance != null ||
    user?.profile?.balance != null ||
    user?.balance_amount != null ||
    user?.balance_value != null ||
    user?.balance?.amount != null ||
    user?.wallet?.amount != null
  )
}

function setBalanceInputValue(input, user) {
  if (!input) return
  input.value = resolveBalanceValue(user)
}

async function updateUserFromEditForm() {
  const modal = document.getElementById('modalEdit')
  const form = modal.querySelector('form:not(.hidden)')
  if (!form) {
    alert('Форма не найдена')
    return
  }

  const emailInput = form.querySelector('input[name="email"]')
  const userId = emailInput?.dataset.userId || modal?.dataset?.userId
  if (!userId) {
    alert('ID пользователя не найден')
    return
  }

  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  const isParticipant = form.id === 'participant-form-edit'
  const countryName = form.querySelector('input[name="country"]').value;
  const data = {
    email: emailInput.value,
    full_name_ru: form.querySelector('input[name="fullname"]').value,
    country: getCountryCode(countryName) || countryName,
  }
  const balanceInput = form.querySelector('input[name="balance"]')
  let balanceValue = null
  if (isParticipant && balanceInput && balanceInput.value !== '') {
    const parsedBalance = Number(balanceInput.value)
    if (Number.isFinite(parsedBalance)) {
      balanceValue = parsedBalance
      data.balance = parsedBalance
      data.account_balance = parsedBalance
      data.wallet_balance = parsedBalance
      data.wallet = { balance: parsedBalance, amount: parsedBalance }
    }
  }

  if (isParticipant) {
    data.city = form.querySelector('input[name="city"]').value
    data.school = form.querySelector('input[name="school"]').value
    const classInput = form.querySelector('input[name="class"]');
    data.grade = classInput.dataset.code
               || classMap[classInput.value]
               || classInput.value;
    data.parent_name_ru = form.querySelector('input[name="parent_name"]').value
    data.parent_phone_number = form.querySelector(
      'input[name="parent_phone"]'
    ).value
    data.teacher_name_ru = form.querySelector(
      'input[name="teacher_name"]'
    ).value
    data.teacher_phone_number = form.querySelector(
      'input[name="teacher_phone"]'
    ).value
  }

  try {
    const response = await authorizedFetch(
      `https://portal.femo.kz/api/users/dashboard/${userId}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    )

    const responseBody = await response.json()
    if (!response.ok) {
      throw new Error(responseBody.detail || JSON.stringify(responseBody))
    }

    alert('Пользователь успешно обновлён!')
    toggleModal('modalEdit', false)
    if (responseBody && typeof responseBody === 'object') {
      const targetId = Number(userId)
      const index = allUsers.findIndex((item) => item.id === targetId)
      if (index !== -1) {
        allUsers[index] = { ...allUsers[index], ...responseBody }
        if (balanceValue !== null) {
          allUsers[index].balance = balanceValue
          allUsers[index].account_balance = balanceValue
        }
      }
    }
    // Обновляем фильтры и таблицу локально, чтобы не перезатирать данные (в том числе баланс)
    // старым списком с сервера, где баланса может не быть.
    initFilters(allUsers)
    applyFilters()
  } catch (error) {
    alert(`Ошибка при обновлении: ${error.message}`)
  }
}

function openEditModal(userId) {
  const user = allUsers.find((u) => u.id === userId)
  if (!user) {
    alert('Пользователь не найден')
    return
  }
  const modal = document.getElementById('modalEdit')
  if (modal) modal.dataset.userId = String(user.id)

  const role = user.role === 'representative' ? 'representative' : 'participant'

  // Установить переключатель роли
  const roleRadio = document.querySelector(
    `#modalEdit input[name="role"][value="${role}"]`
  )
  if (roleRadio) roleRadio.checked = true

  // Показать нужную форму
  document.querySelectorAll('#modalEdit .role-form').forEach((form) => {
    form.classList.add('hidden')
  })
  const activeForm = document.getElementById(`${role}-form-edit`)
  activeForm.classList.remove('hidden')

  document
    .querySelectorAll('#modalEdit input[name="email"]')
    .forEach((input) => {
      input.setAttribute('data-user-id', user.id)
    })

  // Установить значения в форму
  const email = activeForm.querySelector('input[name="email"]')
  if (email) {
    email.value = user.email
    email.setAttribute('data-user-id', user.id)
  }

  const fullName = activeForm.querySelector('input[name="fullname"]')
  if (fullName) fullName.value = user.full_name_ru

  const country = activeForm.querySelector('input[name="country"]')
  if (country) country.value = user.country

  const balanceInput = activeForm.querySelector('input[name="balance"]')
  if (role === 'participant' && balanceInput) {
    setBalanceInputValue(balanceInput, user)
  }

  if (role === 'participant') {
    // Делаем GET-запрос, чтобы получить полные данные
    authorizedFetch(`https://portal.femo.kz/api/users/dashboard/${userId}/`)
      .then(res => {
        if (!res.ok) throw new Error('Ошибка загрузки пользователя')
        return res.json()
      })
      .then(user => {
        activeForm.querySelector('input[name="city"]').value = user.city || ''
        activeForm.querySelector('input[name="school"]').value = user.school || ''
        const classInput = activeForm.querySelector('input[name="class"]');
        classInput.value = reverseClassMap[user.grade] || '';
        // и сразу же сохраняем в data-code оригинальное слово,
        // чтобы при отправке на сервер ушло именно 'first', 'second' и т.д.
        classInput.dataset.code = user.grade || '';
        activeForm.querySelector('input[name="parent_name"]').value = user.parent_name_ru || ''
        activeForm.querySelector('input[name="parent_phone"]').value = user.parent_phone_number || ''
        activeForm.querySelector('input[name="teacher_name"]').value = user.teacher_name_ru || ''
        activeForm.querySelector('input[name="teacher_phone"]').value = user.teacher_phone_number || ''
        
        // Если сервер вернул объект с балансом — обновляем инпут.
        // НО: если сервер вернул 0 (или пусто), а у нас локально есть значение (например, только что сохранили),
        // то не перезатираем его нулём.
        if (balanceInput) {
          const serverBalance = resolveBalanceValue(user)
          // Ищем локального пользователя, чтобы проверить, есть ли у нас "оптимистичное" значение
          const localUser = allUsers.find(u => u.id === userId)
          const localBalance = localUser ? resolveBalanceValue(localUser) : 0

          // Если сервер вернул 0, а локально у нас > 0, считаем, что сервер еще не обновился/не вернул данные
          if (serverBalance === 0 && localBalance > 0) {
            console.warn('Server returned balance 0, keeping local value:', localBalance)
          } else if (hasBalanceValue(user)) {
            setBalanceInputValue(balanceInput, user)
          }
        }
      })
      .catch(err => {
        console.error(err)
        alert('Не удалось загрузить полные данные участника.')
      })
  }

  toggleModal('modalEdit', true)
}


let countryList = []

const classMap = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eighth',
  9: 'ninth',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
}

function populateCountryAndClassOptions() {
  const countryMap = {
    "Афганистан":"AF","Албания":"AL","Алжир":"DZ","Американское Самоа":"AS","Андорра":"AD","Ангола":"AO","Антигуа и Барбуда":"AG",
    "Аргентина":"AR","Армения":"AM","Аруба":"AW","Австралия":"AU","Австрия":"AT","Азербайджан":"AZ","Багамы":"BS",
    "Бахрейн":"BH","Бангладеш":"BD","Барбадос":"BB","Беларусь":"BY","Белиз":"BZ","Бельгия":"BE","Бенин":"BJ",
    "Бермуды":"BM","Бутан":"BT","Боливия":"BO","Босния и Герцеговина":"BA","Ботсвана":"BW","Бразилия":"BR","Бруней":"BN",
    "Буркина-Фасо":"BF","Бурунди":"BI","Кабо-Верде":"CV","Камбоджа":"KH","Камерун":"CM","Канада":"CA","Центральноафриканская Республика":"CF",
    "Чад":"TD","Чили":"CL","Китай":"CN","Колумбия":"CO","Коморы":"KM","Конго":"CG","Конго (ДРК)":"CD","Коста-Рика":"CR",
    "Кот‑д’Ивуар":"CI","Хорватия":"HR","Куба":"CU","Кипр":"CY","Чехия":"CZ","Дания":"DK","Джибути":"DJ","Доминика":"DM",
    "Доминиканская Республика":"DO","Эквадор":"EC","Египет":"EG","Сальвадор":"SV","Экваториальная Гвинея":"GQ","Эритрея":"ER",
    "Эстония":"EE","Эсватини":"SZ","Эфиопия":"ET","Фиджи":"FJ","Финляндия":"FI","Франция":"FR","Габон":"GA","Гамбия":"GM",
    "Грузия":"GE","Гана":"GH","Греция":"GR","Гренада":"GD","Гватемала":"GT","Гвинея":"GN","Гвинея-Бисау":"GW","Гайана":"GY",
    "Гаити":"HT","Гондурас":"HN","Венгрия":"HU","Исландия":"IS","Индия":"IN","Индонезия":"ID","Иран":"IR","Ирак":"IQ",
    "Ирландия":"IE","Израиль":"IL","Италия":"IT","Ямайка":"JM","Япония":"JP","Иордания":"JO","Казахстан":"KZ","Кения":"KE",
    "Кирибати":"KI","Киргизия":"KG","Кувейт":"KW","Лаос":"LA","Латвия":"LV","Ливан":"LB","Лесото":"LS","Либерия":"LR",
    "Ливия":"LY","Литва":"LT","Люксембург":"LU","Мадагаскар":"MG","Малави":"MW","Малайзия":"MY","Мальдивы":"MV","Мали":"ML",
    "Мальта":"MT","Маршалловы Острова":"MH","Мавритания":"MR","Маврикий":"MU","Мексика":"MX","Микронезия":"FM","Молдова":"MD",
    "Монако":"MC","Монголия":"MN","Черногория":"ME","Марокко":"MA","Мозамбик":"MZ","Мьянма":"MM","Намибия":"NA","Науру":"NR",
    "Непал":"NP","Нидерланды":"NL","Новая Зеландия":"NZ","Никарагуа":"NI","Нигер":"NE","Нигерия":"NG","Северная Корея":"KP",
    "Северная Македония":"MK","Норвегия":"NO","Оман":"OM","Пакистан":"PK","Палау":"PW","Панама":"PA","Папуа — Новая Гвинея":"PG",
    "Парагвай":"PY","Перу":"PE","Филиппины":"PH","Польша":"PL","Португалия":"PT","Катар":"QA","Республика Корея":"KR","Румыния":"RO",
    "Россия":"RU","Руанда":"RW","Сан-Марино":"SM","Сан-Томе и Принсипи":"ST","Саудовская Аравия":"SA","Сенегал":"SN","Сербия":"RS",
    "Сейшелы":"SC","Сьерра-Леоне":"SL","Сингапур":"SG","Словакия":"SK","Словения":"SI","Соломоновы Острова":"SB","Сомали":"SO",
    "Южная Африка":"ZA","Южный Судан":"SS","Испания":"ES","Шри-Ланка":"LK","Судан":"SD","Суринам":"SR","Швеция":"SE","Швейцария":"CH",
    "Сирия":"SY","Таджикистан":"TJ","Танзания":"TZ","Таиланд":"TH","Того":"TG","Тонга":"TO","Тринидад и Тобаго":"TT","Тунис":"TN",
    "Турция":"TR","Туркменистан":"TM","Уганда":"UG","Украина":"UA","Объединённые Арабские Эмираты":"AE","Великобритания":"GB","США":"US",
    "Уругвай":"UY","Узбекистан":"UZ","Вануату":"VU","Ватикан":"VA","Венесуэла":"VE","Вьетнам":"VN","Йемен":"YE","Замбия":"ZM",
    "Зимбабве":"ZW",
  };

  // Страны
  document.querySelectorAll('input[name="country"]').forEach(input => {
    const datalistId = input.id + '-list';
    input.setAttribute('list', datalistId);

    let datalist = document.getElementById(datalistId);
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = datalistId;
      document.body.appendChild(datalist);
    }

    datalist.innerHTML = Object.entries(countryMap)
      .map(([name, code]) => `<option value="${name}" data-code="${code}"></option>`)
      .join('');

    input.addEventListener('change', () => {
      const code = countryMap[input.value];
      if (code) {
        input.dataset.code = code;
      } else {
        delete input.dataset.code;
      }
    });
  });

  // Классы
  document.querySelectorAll('input[name="class"]').forEach(input => {
    const datalistId = input.id + '-list';
    input.setAttribute('list', datalistId);

    let datalist = document.getElementById(datalistId);
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = datalistId;
      document.body.appendChild(datalist);
    }

    datalist.innerHTML = Object.entries(classMap)
      .map(([num, name]) => `<option value="${num}" data-code="${name}"></option>`)
      .join('');

    input.addEventListener('change', () => {
      const opt = Array.from(datalist.options)
        .find(o => o.value === input.value);
      if (opt) {
        input.dataset.code = opt.dataset.code;
      } else {
        delete input.dataset.code;
      }
    });
  });
}

/* ---------------------- Утилиты для запросов с пагинацией ---------------------- */
/**
 * Загружает все страницы API, если ответ содержит { results, next }.
 * Если ответ — простой массив, вернёт его.
 * @param {string} url абсолютный или относительный URL
 * @returns {Promise<Array>}
 */
async function fetchAllPages(url) {
  const items = [];
  let next = url;
  while (next) {
    const res = await authorizedFetch(next);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} при загрузке ${next}`);
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      // API вернул массив — добавляем и выходим
      items.push(...data);
      break;
    }
    if (data && Array.isArray(data.results)) {
      items.push(...data.results);
      // data.next может быть относительным или абсолютным
      next = data.next;
    } else {
      // неожиданный формат — завершаем
      break;
    }
  }
  return items;
}

/* ---------------------- Загрузка и populate для олимпиад ---------------------- */
/**
 * Загружает все олимпиады (с пагинацией) и наполняет селект .olympiad-filter
 */
async function loadAllOlympiadsAndPopulate() {
  try {
    const url = 'https://portal.femo.kz/api/olympiads/dashboard/';
    const olympiads = await fetchAllPages(url); // массив объектов olympiad

    // сохранить в window для отладки/доступа при необходимости
    window._femo_olympiads = olympiads;

    const select = document.querySelector('.olympiad-filter');
    if (!select) {
      console.warn('Не найден селект .olympiad-filter — добавь его в HTML.');
      return;
    }

    // build options: пустой + список
    const optionsHtml = [
      `<option value="">${(window.i18nDict && window.i18nDict['users.all_olympiads']) || 'Все олимпиады'}</option>`,
      ...olympiads.map(o => {
        const title = o.title || ('#' + o.id);
        const year = o.year ? ` (${o.year})` : '';
        // value = id (строка)
        return `<option value="${String(o.id)}">${escapeHtml(title + year)}</option>`;
      })
    ].join('');

    select.innerHTML = optionsHtml;

    // при смене olympiad — грузим пользователей с параметром olympiad
    select.removeEventListener('change', onOlympiadChanged);
    select.addEventListener('change', onOlympiadChanged);

    // если словарь уже есть — переведём
    if (Object.keys(window.i18nDict || {}).length) translateNode(select);
  } catch (err) {
    console.error('Ошибка загрузки олимпиад:', err);
  }
}

/**
 * Обработчик смены селекта олимпиад
 */
async function onOlympiadChanged(e) {
  const select = e.target;
  const val = select.value;
  currentPage = 1;

  try {
    if (!val) {
      // пусто — загружаем всех пользователей (локальный fetch)
      await loadAllUsers();
      return;
    }

    await loadUsersByOlympiad(val);
  } catch (err) {
    console.error('onOlympiadChanged error:', err);
    // на ошибке можно откатиться к полному списку
    await loadAllUsers();
  }
}

/* ---------------------- Загрузка пользователей по олимпиаде ---------------------- */
/**
 * Загружает пользователей, отфильтрованных по олимпиады (olympiad id),
 * поддерживая как массивную, так и paginated-форму ответа.
 */
async function loadUsersByOlympiad(olympiadId) {
  try {
    const url = `https://portal.femo.kz/api/users/dashboard/?olympiad=${encodeURIComponent(olympiadId)}`;
    // используем ту же fetchAllPages — если ответ прост: массив -> он вернёт его; если paginated -> тоже вернёт все результаты
    const users = await fetchAllPages(url);

    if (!Array.isArray(users)) {
      throw new Error('Ожидался массив пользователей от сервера');
    }

    allUsers = users;
    // Пересоздаём фильтры и показываем первую страницу
    initFilters(allUsers);
    currentPage = 1;
    updateTotalCountAndPagination();
    applyFilters();
  } catch (err) {
    console.error('Ошибка загрузки пользователей по олимпиаде:', err);
    throw err;
  }
}

// --- Вспомогательная: переводит элементы внутри node по data-i18n из window.i18nDict ---
function translateNode(node) {
  const dict = window.i18nDict || {};
  if (!node) return;
  node.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (!key) return;
    const translated = dict[key];
    if (typeof translated !== 'undefined') {
      // Для option важно менять textContent
      if (el.tagName.toLowerCase() === 'option') el.textContent = translated;
      else el.textContent = translated;
    }
  });
}

// утилита нормализации (вставь рядом с другими утилитами)
function normalize(val) {
  return (val || '').toString().trim().toLowerCase();
}

/* ----------------- initFilters (заменить текущую) ----------------- */
function initFilters(users) {
  const dict = window.i18nDict || {};

  // --- Страны (как было) ---
  const countries = [...new Set(users.map(u => u.country))].filter(Boolean);
  const countrySelect = document.querySelector('.country-filter');
  if (countrySelect) {
    const label = dict['users.all_countries'] || 'Все страны';
    countrySelect.innerHTML = `
      <option value="" data-i18n="users.all_countries">${label}</option>
      ${countries.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
    `;
    if (Object.keys(dict).length) translateNode(countrySelect);
  }

  // --- Города: группируем по normalize, показываем читабельный вариант ---
  const cityMap = new Map(); // key: normalized -> value: first-seen original
  users.forEach(u => {
    if (u.city) {
      const norm = normalize(u.city);
      if (norm && !cityMap.has(norm)) {
        cityMap.set(norm, u.city.toString().trim());
      }
    }
  });

  // Сортируем по видимому названию (localeCompare с 'ru' лучше для кириллицы)
  const cityEntries = Array.from(cityMap.entries())
    .sort((a, b) => a[1].localeCompare(b[1], 'ru'));

  const citySelect = document.querySelector('.city-filter');
  if (citySelect) {
    const label = dict['users.all_cities'] || 'Все города';
    citySelect.innerHTML = `
      <option value="">${escapeHtml(label)}</option>
      ${cityEntries.map(([norm, display]) => `<option value="${escapeHtml(norm)}">${escapeHtml(display)}</option>`).join('')}
    `;
    if (Object.keys(dict).length) translateNode(citySelect);
  }

  // --- Классы (как было) ---
  const grades = [...new Set(users.map((u) => u.grade))].filter(Boolean).sort();
  const gradeSelect = document.querySelector('.grade-filter');
  if (gradeSelect) {
    const label = dict['users.all_classes'] || 'Все классы';
    gradeSelect.innerHTML = `
      <option value="" data-i18n="users.all_classes">${label}</option>
      ${Object.entries(classMap).map(([num, name]) => `<option value="${escapeHtml(name)}">${escapeHtml(num)}</option>`).join('')}
    `;
    if (Object.keys(dict).length) translateNode(gradeSelect);
  }

  // Навешиваем обработчики (убираем старые чтобы не дублировались)
  document.querySelectorAll('select').forEach((select) => {
    select.removeEventListener('change', applyFilters);
    select.addEventListener('change', () => {
      currentPage = 1;
      applyFilters();
    });
  });
}


// Простая утилита для безопасного вставления текста в HTML (предотвращает XSS при вставке значений)
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- Подписываемся на событие готовности словаря (если словарь придёт позже) ---
window.addEventListener('i18n:languageReady', () => {
  // переведём фильтры если они уже в DOM
  const countrySelect = document.querySelector('.country-filter');
  const gradeSelect = document.querySelector('.grade-filter');
  translateNode(countrySelect);
  translateNode(gradeSelect);
});
window.addEventListener('i18n:languageChanged', () => {
  const countrySelect = document.querySelector('.country-filter');
  const gradeSelect = document.querySelector('.grade-filter');
  translateNode(countrySelect);
  translateNode(gradeSelect);
});
