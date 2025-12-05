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
// 1) Функция для загрузки полного профиля участника
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
function fillCountryDropdown() {
  const select = document.getElementById("country");
  if (!select) return;

  select.innerHTML = '<option value="">Выберите страну</option>';

  for (const [name, code] of Object.entries(countryMap)) {
    const option = document.createElement("option");
    option.value = code;        // --- отправляется
    option.textContent = name;  // --- отображается
    select.appendChild(option);
  }
}





document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  fillCountryDropdown();
  // сначала загрузим детали профиля
  let profile
  try {
    profile = await loadUserProfile()
  } catch (e) {
    console.error(e)
    return
  }
  renderUserInfo(profile)

  // остальной код...
})

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await authorizedFetch('https://portal.femo.kz/api/users/participant/profile/', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) throw new Error('Ошибка запроса профиля')

    const data = await response.json()
    fillProfileData(data)

    // Назначаем обработчики
    const editBtn = document.getElementById('edit-button')
    const cancelBtn = document.getElementById('cancel-button')
    const submitBtn = document.getElementById('submit-button')

    if (editBtn) {
      editBtn.addEventListener('click', () => {

        console.log('Кнопка Редактировать нажата');

        toggleEditMode(true)
      })
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        toggleEditMode(false)
      })
    }

    // Один раз — заблокировать всё и скрыть кнопки
    toggleEditMode(false)

  } catch (error) {
    console.error('Ошибка при получении профиля:', error)
  }
})

function fillProfileData(data) {
  document.querySelector('input[name="id"]').value = data.id || ''
  document.querySelector('input[name="email"]').value = data.email || ''
  document.querySelector('input[name="fullname_ru"]').value = data.full_name_ru || ''
  document.querySelector('input[name="fullname_en"]').value = data.full_name_en || ''
  document.getElementById('country').value = data.country?.code || '';
  document.querySelector('input[name="city"]').value = data.city || ''
  document.querySelector('input[name="school"]').value = data.school || ''
  document.querySelector('input[name="class"]').value = convertGrade(data.grade) || ''

  document.querySelector('input[name="parent_name"]').value = data.parent?.name_ru || ''
  document.querySelector('input[name="parent_name_en"]').value = data.parent?.name_en || ''
  document.querySelector('input[name="parent_phone"]').value = data.parent?.phone_number || ''

  document.querySelector('input[name="teacher_name"]').value = data.teacher?.name_ru || ''
  document.querySelector('input[name="teacher_name_en"]').value = data.teacher?.name_en || ''
  document.querySelector('input[name="teacher_phone"]').value = data.teacher?.phone_number || ''

  const img = document.getElementById('imagePreview')
  if (img && data.image) {
    img.src = data.image
    img.classList.remove('bg-gray-50')
    const fileNameEl = document.getElementById('fileName')
    if (fileNameEl) fileNameEl.textContent = getFileNameFromUrl(data.image)
  }

  // ID участника — только для чтения
  const idInput = document.querySelector('input[name="id"]')
  if (idInput) {
    idInput.readOnly = true
    idInput.disabled = true
  }
}

function toggleEditMode(enable = true) {
  setFormDisabled(!enable)

  const cancelBtn = document.getElementById('cancel-button')
  const submitBtn = document.getElementById('submit-button')
  const editBtn = document.getElementById('edit-button')

  if (cancelBtn) cancelBtn.style.display = enable ? 'inline-flex' : 'none'
  if (submitBtn) submitBtn.style.display = enable ? 'inline-flex' : 'none'
  if (editBtn) editBtn.style.display = enable ? 'none' : 'inline-flex'
}




function setFormDisabled(state = true) {
  const form = document.querySelector('form')
  const inputs = form.querySelectorAll('input, select, textarea')

  inputs.forEach((el) => {
    if (el.name !== 'id') {
      el.disabled = state
    }
  })
}


function convertGrade(grade) {
  const map = {
    first: '1',
    second: '2',
    third: '3',
    fourth: '4',
    fifth: '5',
    sixth: '6',
    seventh: '7',
    eighth: '8',
    ninth: '9',
    tenth: '10',
    eleventh: '11',
  }
  return map[grade?.toLowerCase()] || ''
}

function getFileNameFromUrl(url) {
  return url.split('/').pop()
}
