document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  if (!form) return;

  // --- success popup (small) ---
  const successBanner = document.createElement('div');
  successBanner.setAttribute('aria-live', 'polite');

  // начальные классы: маленький светло-зелёный блок, тёмно-зелёный текст.
  // Скрыт визуально через opacity и поднят вверх (-translate-y-6). При показе убираем эти классы.
  successBanner.className =
    'fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-md bg-green-100 text-green-800 shadow-md flex items-center gap-3 text-sm font-semibold -translate-y-6 opacity-0 pointer-events-none transition-all duration-300';

  successBanner.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.707a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
    </svg>
    <span class="success-text"></span>
  `;
  document.body.insertBefore(successBanner, document.body.firstChild);

  // контейнер для сообщений под формой (будет использоваться для ошибок)
  let messageContainer = document.createElement('div');
  messageContainer.className = 'mt-4 text-center text-sm font-medium';
  form.parentNode.insertBefore(messageContainer, form.nextSibling);

  // селекты
  const roleSelect = document.getElementById('role') || document.querySelector('select[name="role"]');
  const countrySelect = document.getElementById('country') || document.querySelector('select[name="country"]');

  if (!roleSelect || !countrySelect) {
    console.error('Не найдены селекты role или country.');
    messageContainer.textContent = 'Ошибка: не найдены поля формы.';
    messageContainer.classList.add('text-red-500');
    return;
  }

  // Полный маппинг стран (вставлен полностью)
  const COUNTRIES_RU = {
    "AF":"Афганистан","AL":"Албания","DZ":"Алжир","AS":"Американское Самоа","AD":"Андорра","AO":"Ангола","AI":"Ангилья",
    "AQ":"Антарктида","AG":"Антигуа и Барбуда","AR":"Аргентина","AM":"Армения","AW":"Аруба","AU":"Австралия","AT":"Австрия","AZ":"Азербайджан",
    "BS":"Багамы","BH":"Бахрейн","BD":"Бангладеш","BB":"Барбадос","BY":"Беларусь","BE":"Бельгия","BZ":"Белиз","BJ":"Бенин","BM":"Бермуды","BT":"Бутан",
    "BO":"Боливия","BQ":"Бонэйр, Синт-Эстатиус и Саба","BA":"Босния и Герцеговина","BW":"Ботсвана","BV":"Остров Буве","BR":"Бразилия","IO":"Британская территория в Индийском океане",
    "BN":"Бруней","BG":"Болгария","BF":"Буркина-Фасо","BI":"Бурунди",
    "KH":"Камбоджа","CM":"Камерун","CA":"Канада","CV":"Кабо-Верде","KY":"Каймановы острова","CF":"Центральноафриканская Республика","TD":"Чад","CL":"Чили","CN":"Китай","CX":"Остров Рождества","CC":"Кокосовые (Килинг) острова",
    "CO":"Колумбия","KM":"Коморы","CG":"Республика Конго","CD":"Демократическая Республика Конго","CK":"Острова Кука","CR":"Коста-Рика","CI":"Кот-д’Ивуар","HR":"Хорватия","CU":"Куба","CW":"Кюрасао","CY":"Кипр","CZ":"Чехия",
    "DK":"Дания","DJ":"Джибути","DM":"Доминика","DO":"Доминиканская Республика","EC":"Эквадор","EG":"Египет","SV":"Сальвадор","GQ":"Экваториальная Гвинея","ER":"Эритрея","EE":"Эстония","SZ":"Эсватини","ET":"Эфиопия",
    "FK":"Фолклендские острова","FO":"Фарерские острова","FJ":"Фиджи","FI":"Финляндия","FR":"Франция","GF":"Французская Гвиана","PF":"Французская Полинезия","TF":"Французские Южные территории",
    "GA":"Габон","GM":"Гамбия","GE":"Грузия","DE":"Германия","GH":"Гана","GI":"Гибралтар","GR":"Греция","GL":"Гренландия","GD":"Гренада","GP":"Гваделупа","GU":"Гуам","GT":"Гватемала","GG":"Гернси",
    "GN":"Гвинея","GW":"Гвинея-Бисау","GY":"Гайана",
    "HT":"Гаити","HM":"Остров Херд и острова Макдональд","VA":"Ватикан","HN":"Гондурас","HK":"Гонконг","HU":"Венгрия",
    "IS":"Исландия","IN":"Индия","ID":"Индонезия","IR":"Иран","IQ":"Ирак","IE":"Ирландия","IM":"Остров Мэн","IL":"Израиль","IT":"Италия",
    "JM":"Ямайка","JP":"Япония","JE":"Джерси","JO":"Иордания",
    "KZ":"Казахстан","KE":"Кения","KI":"Кирибати","KP":"Северная Корея","KR":"Южная Корея","KW":"Кувейт","KG":"Киргизия",
    "LA":"Лаос","LV":"Латвия","LB":"Ливан","LS":"Лесото","LR":"Либерия","LY":"Ливия","LI":"Лихтенштейн","LT":"Литва","LU":"Люксембург",
    "MO":"Макао","MG":"Мадагаскар","MW":"Малави","MY":"Малайзия","MV":"Мальдивы","ML":"Мали","MT":"Мальта","MH":"Маршалловы Острова","MQ":"Мартиника","MR":"Мавритания","MU":"Маврикий","YT":"Майотта","MX":"Мексика",
    "FM":"Микронезия","MD":"Молдова","MC":"Монако","MN":"Монголия","ME":"Черногория","MS":"Монтсеррат","MA":"Марокко","MZ":"Мозамбик","MM":"Мьянма",
    "NA":"Намибия","NR":"Науру","NP":"Непал","NL":"Нидерланды","NC":"Новая Каледония","NZ":"Новая Зеландия","NI":"Никарагуа","NE":"Нигер","NG":"Нигерия","NU":"Ниуэ","NF":"Остров Норфолк","MK":"Северная Македония","MP":"Северные Марианские острова","NO":"Норвегия","OM":"Оман",
    "PK":"Пакистан","PW":"Палау","PS":"Палестина","PA":"Панама","PG":"Папуа — Новая Гвинея","PY":"Парагвай","PE":"Перу","PH":"Филиппины","PN":"Питкэрн","PL":"Польша","PT":"Португалия","PR":"Пуэрто-Рико","QA":"Катар",
    "RE":"Реюньон","RO":"Румыния","RU":"Россия","RW":"Руанда",
    "BL":"Сен-Бартелеми","SH":"Острова Святой Елены, Вознесения и Тристан-да-Кунья","KN":"Сент-Китс и Невис","LC":"Сент-Люсия","MF":"Сен-Мартен","PM":"Сен-Пьер и Микелон","VC":"Сент-Винсент и Гренадины",
    "WS":"Самоа","SM":"Сан-Марино","ST":"Сан-Томе и Принсипи","SA":"Саудовская Аравия","SN":"Сенегал","RS":"Сербия","SC":"Сейшельские Острова","SL":"Сьерра-Леоне","SG":"Сингапур","SX":"Синт-Мартен","SK":"Словакия","SI":"Словения","SB":"Соломоновы Острова","SO":"Сомали","ZA":"Южно-Африканская Республика","GS":"Южная Георгия и Южные Сандвичевы острова","SS":"Южный Судан","ES":"Испания",
    "LK":"Шри-Ланка","SD":"Судан","SR":"Суринам","SJ":"Шпицберген и Ян-Майен","SE":"Швеция","CH":"Швейцария","SY":"Сирия","TW":"Тайвань","TJ":"Таджикистан","TZ":"Танзания","TH":"Таиланд","TL":"Восточный Тимор","TG":"Того","TK":"Токелау","TO":"Тонга","TT":"Тринидад и Тобаго","TN":"Тунис","TR":"Турция","TM":"Туркменистан","TC":"Тёркс и Кайкос","TV":"Тувалу","UG":"Уганда","UA":"Украина","AE":"Объединённые Арабские Эмираты","GB":"Великобритания","US":"Соединённые Штаты","UM":"Малые отдалённые острова США","UY":"Уругвай","UZ":"Узбекистан",
    "VU":"Вануату","VE":"Венесуэла","VN":"Вьетнам","VG":"Британские Виргинские острова","VI":"Виргинские острова (США)","WF":"Уоллис и Футуна","EH":"Западная Сахара","YE":"Йемен","ZM":"Замбия","ZW":"Зимбабве"
  };

  const submitButton = form.querySelector('button[type="submit"]');

  const populateCountrySelect = (mapping) => {
    countrySelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Выберите страну';
    placeholder.disabled = true;
    placeholder.selected = true;
    countrySelect.appendChild(placeholder);

    const items = Object.keys(mapping).map(code => ({ code, name: mapping[code] || code }));
    items.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));

    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it.code;
      opt.textContent = it.name;
      countrySelect.appendChild(opt);
    }
  };

  populateCountrySelect(COUNTRIES_RU);

  const isSelectChosen = (select) => {
    if (!select) return false;
    const placeholder = select.querySelector('option[value=""]');
    if (placeholder) return select.selectedIndex > 0;
    return !!select.value;
  };

  // show/hide popup with slide-down animation
  const showSuccessBanner = (text, visibleMs = 1500) => {
    const textNode = successBanner.querySelector('.success-text');
    if (textNode) textNode.textContent = text;

    // показ: убираем "скрывающие" классы и даём элементу pointer events
    successBanner.classList.remove('-translate-y-6', 'opacity-0', 'pointer-events-none');
    successBanner.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');

    // очистим предыдущий таймаут если есть
    clearTimeout(successBanner._hideTimeout);

    // через visibleMs делаем обратную анимацию (скрываем)
    successBanner._hideTimeout = setTimeout(() => {
      successBanner.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
      successBanner.classList.add('-translate-y-6', 'opacity-0', 'pointer-events-none');
    }, visibleMs);
  };

  // helper: снимаем фокус и ждём, чтобы значения зафиксировались
  const ensureValuesCommitted = async () => {
    try {
      const active = document.activeElement;
      if (active && form.contains(active)) active.blur();
      document.body.focus();
      await new Promise(res => setTimeout(res, 50));
    } catch (err) {
      console.warn('ensureValuesCommitted error', err);
    }
  };

  const findInputs = (form) => {
    const emailInput = form.querySelector('input[name="email"], input#email, input[type="email"], input[placeholder*="@"]');
    const nameInput = form.querySelector('input[name="full_name_ru"], input[name="full_name"], input[id="full_name"], input[id="name"], input[placeholder*="ФИО"], input[type="text"]');
    const passwordInput = form.querySelector('input[name="password"], input#password, input[type="password"]');
    return { emailInput, nameInput, passwordInput };
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await ensureValuesCommitted();
  
    // очистим ошибки
    messageContainer.textContent = '';
    messageContainer.classList.remove('text-red-500', 'text-green-600');
  
    const { emailInput, nameInput, passwordInput } = findInputs(form);
  
    if (passwordInput && !passwordInput.name) {
      passwordInput.name = 'password_temp_for_read';
    }
  
    const roleValue = roleSelect ? roleSelect.value : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const fullName = nameInput ? nameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const countryCode = countrySelect ? countrySelect.value : '';
  
    if (!isSelectChosen(roleSelect) || !email || !fullName || !password || !isSelectChosen(countrySelect)) {
      messageContainer.textContent = 'Пожалуйста, заполните все поля корректно (включая страну).';
      messageContainer.classList.add('text-red-500');
      const maybePassword = form.querySelector('input[name="password_temp_for_read"]');
      if (maybePassword) maybePassword.removeAttribute('name');
      return;
    }
  
    if (submitButton) submitButton.disabled = true;
  
    const regPayload = {
      email,
      password,
      country: countryCode,
      profile: {
        full_name_ru: fullName,
        role: roleValue
      }
    };
  
    try {
      // 1) регистрация
      const response = await fetch('https://portal.femo.kz/api/users/registration/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regPayload)
      });
  
      const data = await response.json().catch(() => null);
  
      if (!response.ok) {
        const errMsg = data?.detail || data?.message || 'Произошла ошибка при регистрации.';
        messageContainer.textContent = errMsg;
        messageContainer.classList.add('text-red-500');
        return;
      }
  
      // 2) регистрация успешна — теперь логинимся, чтобы получить access_token
      const tokenResp = await fetch('https://portal.femo.kz/api/users/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
  
      const tokenData = await tokenResp.json().catch(() => null);
  
      if (!tokenResp.ok) {
        // регистрация прошла, но логин не удался — покажем сообщение, но всё равно сохраним профиль без токена
        console.warn('Token fetch failed', tokenData);
        messageContainer.textContent = tokenData?.detail || 'Регистрация успешна, но не удалось получить токен. Войдите вручную.';
        messageContainer.classList.add('text-red-500');
        // можно продолжить — но не редиректим в автоматическом режиме
        return;
      }
  
      // Попытка извлечь access token из возможных ключей
      const possibleTokenKeys = ['access_token', 'access', 'token', 'auth_token', 'key'];
      let accessToken = null;
      if (tokenData && typeof tokenData === 'object') {
        for (const k of possibleTokenKeys) {
          if (tokenData[k]) { accessToken = tokenData[k]; break; }
        }
        // иногда токен внутри data
        if (!accessToken && tokenData.data && typeof tokenData.data === 'object') {
          for (const k of possibleTokenKeys) {
            if (tokenData.data[k]) { accessToken = tokenData.data[k]; break; }
          }
        }
      }
  
      if (!accessToken) {
        messageContainer.textContent = 'Токен не получен от сервера после логина.';
        messageContainer.classList.add('text-red-500');
        return;
      }
  
      // 3) сохраняем access_token в localStorage (и совместимый ключ token)
      try {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('token', accessToken);
      } catch (err) {
        console.warn('Не удалось сохранить токен в localStorage', err);
      }
  
      // 4) сохраним минимальную информацию о пользователе
      const userInfo = {
        email,
        full_name_ru: fullName,
        role: roleValue,
        country: countryCode,
        id: data?.id || data?.user?.id || data?.data?.id || null
      };
      try {
        localStorage.setItem('user', JSON.stringify(userInfo));
      } catch (err) {
        console.warn('Не удалось сохранить user в localStorage', err);
      }
  
      // 5) поведение для role === 'participant'
      if (roleValue === 'participant') {
        // НЕ кладём пароль в localStorage. Если нужен временный пароль — в sessionStorage (но лучше не хранить)
        try {
          // Сохраняем pending participant с токеном и id — чтобы продолжить профиль
          const pending = {
            email,
            full_name_ru: fullName,
            country: countryCode,
            role: roleValue,
            access_token: accessToken,
            id: userInfo.id,
            __saved_at: Date.now()
          };
          localStorage.setItem('pending_participant', JSON.stringify(pending));
        } catch (err) {
          console.error('Не удалось сохранить pending_participant', err);
        }
  
        showSuccessBanner('Регистрация и логин прошли успешно. Продолжите профиль участника...', 900);
        setTimeout(() => { window.location.href = 'participant/register.html'; }, 900);
        return;
      }
  
      // 6) если не participant — обычный успех и редирект (например в профиль)
      showSuccessBanner('Регистрация и вход выполнены. Перенаправляем...', 900);
      setTimeout(() => { window.location.href = '/participant/dashboard.html'; }, 900);
  
    } catch (error) {
      console.error('Ошибка при отправке:', error);
      messageContainer.textContent = 'Ошибка соединения с сервером.';
      messageContainer.classList.add('text-red-500');
    } finally {
      if (submitButton) submitButton.disabled = false;
      const maybePassword = form.querySelector('input[name="password_temp_for_read"]');
      if (maybePassword) maybePassword.removeAttribute('name');
    }
  });
  
  
}); // DOMContentLoaded
