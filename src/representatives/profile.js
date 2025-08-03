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
  const avatarEl  = document.getElementById('user-avatar');
  const nameEl    = document.getElementById('user-name');
  const roleEl    = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  // --- аватар, имя, приветствие (как было) ---
  const defaultAvatar = '/src/assets/images/user_logo.jpg';
  const imgPath       = profile?.image;
  let finalAvatar = defaultAvatar;
  if (imgPath && typeof imgPath === 'string') {
    finalAvatar = imgPath.startsWith('http')
      ? imgPath
      : `https://portal.gradients.academy${imgPath}`;
  }
  avatarEl.src        = finalAvatar;
  nameEl.textContent  = profile.full_name_ru || '';
  const firstName     = profile.full_name_ru?.split(' ')[0] || '';
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`;

  // --- роль + флаг ---
  // Очищаем контейнер
  roleEl.innerHTML = '';

  // Спан для текста
  const span = document.createElement('span');
  span.textContent = 'Представитель';
  // inline-block и выравнивание по средней линии
  span.className = 'inline-block align-middle';
  roleEl.appendChild(span);

  // Флаг, если есть
  const country = profile.country;
  if (country?.code) {
    const code    = country.code.toLowerCase();
    const flagUrl = `https://flagcdn.com/16x12/${code}.png`;
    const img = document.createElement('img');
    img.src       = flagUrl;
    img.alt       = `Флаг ${country.name}`;
    // inline-block, выравнивание по средней линии, отступ слева
    img.className = 'inline-block align-middle ml-1';
    roleEl.appendChild(img);
  }
}

async function loadRepresentativeProfile() {
  try {
    const res = await authorizedFetch('https://portal.gradients.academy/api/users/representative/profile/');
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
        : `https://portal.gradients.academy${data.image}`;
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
  form.elements['country'].value = data.country?.name || '';
}


let countriesList = [];

async function loadCountries() {
  try {
    const res = await fetch('https://portal.gradients.academy/api/common/countries');
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
    const countryName = form.elements['country'].value.trim();
    const countryCode = countryMap[countryName] || '';

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
        'https://portal.gradients.academy/api/users/representative/profile/',
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
  await loadCountries()
  renderUserInfo(user)

  try {
    await loadRepresentativeProfile()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})

