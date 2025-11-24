// admin.js — исправленный скрипт шапки/настроек администратора
// Важно: этот файл предполагает наличие refreshAccessToken(), authorizedFetch() и changeLanguageAndReload().

async function ensureUserAuthenticated() {
  let userData = localStorage.getItem('user');

  if (!userData) {
    console.warn('user не найден в localStorage. Пробуем обновить access_token...');
    if (typeof refreshAccessToken === 'function') {
      const newAccessToken = await refreshAccessToken();
      console.log('Результат refreshAccessToken:', newAccessToken);
    } else {
      console.warn('refreshAccessToken() не определён!');
    }

    userData = localStorage.getItem('user');
    if (!userData) {
      console.warn('user всё ещё не найден после обновления токена. Редирект.');
      window.location.href = '/index.html';
      return null;
    }
  }

  let user;
  try {
    user = JSON.parse(userData);
  } catch (e) {
    console.error('Ошибка парсинга localStorage.user', e);
    return null;
  }

  const role = user.profile?.role;
  if (role !== 'administrator') {
    console.warn(`Пользователь с ролью "${role}" не имеет доступа. Редирект.`);
    window.location.href = '/index.html';
    return null;
  }

  return user;
}

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

  const roleMap = { administrator: 'Администратор' };
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

async function loadAdminProfile() {
  const token = localStorage.getItem('access_token');
  if (!token) throw new Error('Токен не найден');

  const res = await authorizedFetch('https://portal.femo.kz/api/users/administrator/profile/', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Ошибка загрузки профиля: ${res.status}`);
  return await res.json();
}

async function loadUserSettings() {
  const token = localStorage.getItem('access_token');
  if (!token) return;

  try {
    const response = await authorizedFetch('https://portal.femo.kz/api/users/settings/', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Ошибка загрузки настроек');

    const settings = await response.json();

    // Нормализуем серверный язык: если сервер вернул 'kk' или 'kz' -> используем frontend 'kz'
    const serverLang = (settings.language === 'kk' || settings.language === 'kz') ? 'kz' : (settings.language || '');

    // Устанавливаем радиокнопку (значения в input должны быть 'kz'|'en'|'ru')
    const langInput = document.querySelector(`input[name="lang"][value="${serverLang}"]`);
    if (langInput) langInput.checked = true;

    // Установим чекбоксы уведомлений (рекомендуется data-notify-key в input)
    const notifyMap = {
      notify_results: ['О результатах', 'notification.results'],
      notify_tasks: ['О задачах', 'notification.tasks'],
      notify_olympiads: ['О олимпиадах', 'notification.olympiads'],
      notify_profile: ['О профиле', 'notification.profile'],
      notify_payments: ['О статусе оплаты']
    };

    Object.keys(notifyMap).forEach(key => {
      const checkboxByKey = document.querySelector(`input[type="checkbox"][data-notify-key="${key}"]`);
      if (checkboxByKey) {
        checkboxByKey.checked = !!settings[key];
        return;
      }
      const labelTexts = notifyMap[key];
      const labels = Array.from(document.querySelectorAll('label'));
      for (const lbl of labels) {
        const txt = (lbl.textContent || '').trim();
        if (labelTexts.some(t => txt.includes(t))) {
          const cb = lbl.querySelector('input[type="checkbox"]');
          if (cb) cb.checked = !!settings[key];
          break;
        }
      }
    });

  } catch (error) {
    console.error('Ошибка при загрузке настроек:', error);
  }
}

async function updateUserSettings(updatedFields = {}) {
  const token = localStorage.getItem('access_token');
  if (!token) {
    console.warn('updateUserSettings: токен отсутствует');
    return;
  }

  try {
    // Собираем поля из DOM
    const languageRaw = document.querySelector('input[name="lang"]:checked')?.value;
    // === ВАЖНО: отправляем на бэкенд 'kz' для казахского (сервер требует 'kz', НЕ 'kk') ===
    const languageToSend = (languageRaw === 'kz') ? 'kz' : (languageRaw === 'en' ? 'en' : (languageRaw === 'ru' ? 'ru' : null));

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const settingsPayload = {
      language: languageToSend,
      notify_results: false,
      notify_tasks: false,
      notify_olympiads: false,
      notify_profile: false,
      notify_payments: false
    };

    checkboxes.forEach((checkbox) => {
      const key = checkbox.dataset?.notifyKey;
      if (key && Object.prototype.hasOwnProperty.call(settingsPayload, key)) {
        settingsPayload[key] = checkbox.checked;
        return;
      }
      const label = checkbox.closest('label');
      if (!label) return;
      const text = label.textContent.trim();
      if (text.includes('О результатах')) settingsPayload.notify_results = checkbox.checked;
      if (text.includes('О задачах')) settingsPayload.notify_tasks = checkbox.checked;
      if (text.includes('О олимпиадах')) settingsPayload.notify_olympiads = checkbox.checked;
      if (text.includes('О профиле')) settingsPayload.notify_profile = checkbox.checked;
      if (text.includes('О статусе оплаты')) settingsPayload.notify_payments = checkbox.checked;
    });

    const body = Object.assign({}, settingsPayload, updatedFields);

    const response = await authorizedFetch('https://portal.femo.kz/api/users/settings/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      throw new Error('Ошибка при обновлении настроек: ' + txt);
    }

    console.log('✅ Настройки успешно обновлены');

    // Если изменился язык — применим и перезагрузим
    if (body.language) {
      // backend возвращает язык, скорее всего 'kz' или 'en' или 'ru'
      const returnedFrontend = (body.language === 'kz') ? 'kz' : (body.language === 'en' ? 'en' : 'ru');

      if (typeof changeLanguageAndReload === 'function') {
        // вызываем helper: он сбросит языковые кеши, применит перевод и перезагрузит
        await changeLanguageAndReload(returnedFrontend, { reload: true });
        return;
      } else {
        try { localStorage.setItem('lang', returnedFrontend); } catch(e){}
        location.reload();
        return;
      }
    } else {
      // просто перезагрузим (как раньше)
      location.reload();
    }

  } catch (error) {
    console.error('❌ Ошибка при обновлении настроек:', error);
    alert('Не удалось сохранить настройки. Попробуйте ещё раз.');
  }
}

function setupPasswordChangeForm() {
  const passwordForm = document.querySelector('form#change-password-form') || document.querySelector('form');
  if (!passwordForm) return;

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const oldPassword = document.getElementById('password1')?.value.trim();
    const newPassword = document.getElementById('password2')?.value.trim();
    const confirmPassword = document.getElementById('password3')?.value.trim();

    if (!oldPassword || !newPassword || !confirmPassword) {
      alert('Пожалуйста, заполните все поля');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('Новый пароль и подтверждение не совпадают');
      return;
    }

    const token = localStorage.getItem('access_token');
    if (!token) {
      alert('Токен не найден. Пожалуйста, войдите заново.');
      return;
    }

    try {
      const response = await fetch('https://portal.femo.kz/api/users/settings/password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword, confirm_password: confirmPassword })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(`Ошибка: ${errorData.detail || 'Не удалось обновить пароль'}`);
        return;
      }

      alert('Пароль успешно обновлён!');
      passwordForm.reset();
    } catch (error) {
      console.error('Ошибка при обновлении пароля:', error);
      alert('Произошла ошибка при обновлении пароля');
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const user = await ensureUserAuthenticated();
    if (!user) return;

    try {
      const profileData = await loadAdminProfile();
      renderUserInfo(profileData);
    } catch (err) {
      console.error('Ошибка при загрузке профиля администратора:', err);
    }

    await loadUserSettings();

    document.querySelectorAll('input[name="lang"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const val = radio.value;
        // важно: отправляем 'kz' (не 'kk') если фронтенд выбрал kazakh
        const payloadLang = val === 'kz' ? 'kz' : val;
        updateUserSettings({ language: payloadLang });
      });
    });

    document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        updateUserSettings();
      });
    });

    document.querySelectorAll('.toggle-pw').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
      });
    });

    setupPasswordChangeForm();

  } catch (err) {
    console.error('Ошибка инициализации страницы администратора:', err);
  }
});
