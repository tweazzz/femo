document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  if (!form) return;

  // контейнер для сообщений под формой
  let messageContainer = document.createElement('div');
  messageContainer.className = 'mt-4 text-center text-sm font-medium';
  form.parentNode.insertBefore(messageContainer, form.nextSibling);

  // Находим селекты по id/name
  const roleSelect = document.getElementById('role') || document.querySelector('select[name="role"]');
  const countrySelect = document.getElementById('country') || document.querySelector('select[name="country"]');

  if (!roleSelect || !countrySelect) {
    console.error('Не найдены селекты role или country.');
    messageContainer.textContent = 'Ошибка: не найдены поля формы.';
    messageContainer.classList.add('text-red-500');
    return;
  }

  // Маппинг ISO alpha-2 -> название страны на русском (вручную)
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

  // Функция заполнения селекта странами (названия берутся из COUNTRIES_RU)
  const populateCountrySelect = (mapping) => {
    countrySelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    countrySelect.appendChild(placeholder);

    // Создаём массив из объектов для сортировки по названию
    const items = Object.keys(mapping).map(code => ({ code, name: mapping[code] || code }));

    items.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));

    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it.code; // KZ
      opt.textContent = it.name; // Казахстан
      countrySelect.appendChild(opt);
    }
  };

  // Заполняем селект только из локального маппинга (без запросов к API)
  populateCountrySelect(COUNTRIES_RU);

  // Отправка формы: формируем тело как в твоём curl (country в корне)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = form.querySelector('input[type="email"]');
    const nameInput = form.querySelector('input[type="text"]');
    const passwordInput = form.querySelector('input[type="password"]');

    const roleValue = roleSelect.value;
    const email = emailInput ? emailInput.value.trim() : '';
    const fullName = nameInput ? nameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const countryCode = countrySelect.value;

    messageContainer.textContent = '';
    messageContainer.classList.remove('text-red-500', 'text-green-600');

    if (!roleValue || !email || !fullName || !password || !countryCode) {
      messageContainer.textContent = 'Пожалуйста, заполните все поля корректно (включая страну).';
      messageContainer.classList.add('text-red-500');
      return;
    }

    const payload = {
      email,
      password,
      country: countryCode, // отправляем код (например "KZ")
      profile: {
        full_name_ru: fullName,
        role: roleValue
      }
    };

    try {
      const response = await fetch('https://portal.femo.kz/api/users/registration/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errMsg = data?.detail || data?.message || 'Произошла ошибка при регистрации.';
        messageContainer.textContent = errMsg;
        messageContainer.classList.add('text-red-500');
        return;
      }

      messageContainer.textContent = 'Регистрация прошла успешно!';
      messageContainer.classList.add('text-green-600');
      setTimeout(() => { window.location.href = 'index.html'; }, 1500);
    } catch (error) {
      console.error('Ошибка при отправке:', error);
      messageContainer.textContent = 'Ошибка соединения с сервером.';
      messageContainer.classList.add('text-red-500');
    }
  });
});
