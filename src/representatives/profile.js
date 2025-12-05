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
let selectedImageFile = null;
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

async function loadRepresentativeProfile() {
  try {
    const res = await authorizedFetch('https://portal.femo.kz/api/users/representative/profile/');
    if (!res.ok) throw new Error(`Ошибка загрузки профиля представителя: ${res.status}`);

    const data = await res.json();

    // 👉 Обновляем шапку
    renderUserInfo(data);

    // 👉 Обновляем карточку профиля
    document.getElementById('rep-id').textContent = data.id ?? '—';
    document.getElementById('rep-email').textContent = data.email ?? '—';
    document.getElementById('rep-full-name-ru').textContent = data.full_name_ru ?? '—';
    document.getElementById('rep-full-name-en').textContent = data.full_name_en ?? '—';
    document.getElementById('rep-country').textContent = data.country?.name ?? '—';

    const previewEl = document.getElementById('imagePreview');
    const fileNameEl = document.getElementById('fileName');

    if (data.image) {
      const imageUrl = data.image.startsWith('http')
        ? data.image
        : `https://portal.femo.kz${data.image}`;
      previewEl.src = imageUrl;
      fileNameEl.textContent = data.image.split('/').pop();
    } else {
      previewEl.src = '/src/assets/images/man.png';
      fileNameEl.textContent = '—';
    }

    await fillRepresentativeForm(data);
  } catch (err) {
    console.error('Ошибка при получении данных представителя:', err);
  }
}


function fillRepresentativeForm(data) {
  const form = document.getElementById('participant-form');
  if (!form) return;

  form.elements['email'].value = data.email || '';
  form.elements['fullname'].value = data.full_name_ru || '';
  form.elements['fullname_eng'].value = data.full_name_en || '';
  if (data.country?.code) {
    form.elements['country'].value = data.country.code;
  } else {
    form.elements['country'].value = '';
  }
}


let countriesList = [];

async function loadCountries() {
  try {
    const res = await fetch('https://portal.femo.kz/api/common/countries');
    if (!res.ok) throw new Error(`Ошибка загрузки стран: ${res.status}`);

    const data = await res.json();
    countriesList = data.results;
  } catch (err) {
    console.error('Ошибка при загрузке списка стран:', err);
  }
}

document
  .getElementById('participant-form')
  .addEventListener('submit', async function (e) {
    e.preventDefault();
    const form = this;
    const email  = form.elements['email'].value.trim();
    const fullRu = form.elements['fullname'].value.trim();
    const fullEn = form.elements['fullname_eng'].value.trim();
    const countryCode = form.elements['country'].value;

    // 1) Формируем FormData на основе формы
    const formData = new FormData(form);

    // 2) Перезаписываем текстовые поля (файл в formData уже есть автоматически)
    formData.set('email', email);
    formData.set('full_name_ru', fullRu);
    formData.set('full_name_en', fullEn);
    formData.set('country', countryCode);

    // 3) Отладочное логирование
    console.log('▶️ formData entries:');
    for (let [k, v] of formData.entries()) {
      console.log(k, v);
    }

    try {
      const res = await authorizedFetch(
        'https://portal.femo.kz/api/users/representative/profile/',
        {
          method: 'PATCH',
          body: formData,
        }
      );
      if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
      alert('Данные успешно обновлены');
      toggleModal('modalEdit');
      await loadRepresentativeProfile();
    } catch (err) {
      console.error('Ошибка при сохранении данных:', err);
      alert('Не удалось сохранить изменения');
    }
  });




// PROFILE SETTINGS!


document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  // ─── 1) ГАРАНТИРОВАННОЕ навешивание слушателя ───
  const imageInputEl = document.getElementById('imageInput')
  const fileNameEl   = document.getElementById('fileName')
  console.log('DOM loaded, imageInputEl=', imageInputEl, 'fileNameEl=', fileNameEl)
  if (imageInputEl && fileNameEl) {
    imageInputEl.addEventListener('change', (e) => {
      selectedImageFile = e.target.files[0] || null
      console.log('📂 selectedImageFile=', selectedImageFile)
      fileNameEl.textContent = selectedImageFile
        ? selectedImageFile.name
        : '—'
    })
  } else {
    console.error('❌ imageInputEl или fileNameEl не найдены!')
  }

  // ─── 2) дальше уже ваша логика ───
  populateCountrySelect();
  renderUserInfo(user)

  try {
    await loadRepresentativeProfile()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})



function populateCountrySelect() {
  const select = document.getElementById("country");
  select.innerHTML = '<option value="">Выберите страну</option>';

  for (const [name, code] of Object.entries(countryMap)) {
      const option = document.createElement("option");
      option.value = code;         // отправляется
      option.textContent = name;   // отображается
      select.appendChild(option);
  }
}
