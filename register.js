const getCurrentLang = () => {
  return (
    document.documentElement.lang ||
    localStorage.getItem('lang') ||
    'ru'
  ).toLowerCase();
};
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

  // Полный маппинг стран (удален, используется i18n)

  const submitButton = form.querySelector('button[type="submit"]');

  const getTranslatedText = (key, defaultText) => {
    return (window.i18nDict && window.i18nDict[key]) || defaultText;
  };

  const populateCountrySelect = (mapping) => {
    // Remember selected value to restore it if possible
    const currentValue = countrySelect.value;

    countrySelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = getTranslatedText('choose_country', 'Выберите страну');
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.setAttribute('data-i18n', 'choose_country'); 
    countrySelect.appendChild(placeholder);

    // Если маппинга нет или он пуст, ничего не добавляем (или можно добавить дефолт)
    if (!mapping) return;

    const items = Object.keys(mapping).map(code => ({ code, name: mapping[code] || code }));
    
    // Determine sort locale
    const currentLang = getCurrentLang();
    const sortLocale = currentLang.startsWith('en') ? 'en' : 'ru';
    
    items.sort((a, b) =>
      a.name.localeCompare(b.name, sortLocale, {
        sensitivity: 'base'
      })
    );

    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it.code;
      opt.textContent = it.name;
      countrySelect.appendChild(opt);
    }
    
    // Restore value if it exists in new mapping
    if (currentValue && mapping[currentValue]) {
        countrySelect.value = currentValue;
    }
  };

  const lang = getCurrentLang();

  // Инициализация: пытаемся взять из словаря. 
  // Если словарь пуст (еще не загрузился или ru без файла), updateCountrySelect будет вызван при languageReady.
  const countryMap = (window.i18nDict && window.i18nDict.countries) || {};

  populateCountrySelect(countryMap);

  const handleLangChange = (e) => {
      const { frontendLang } = e.detail || {};
      const lang = frontendLang || getCurrentLang();
      
      // Всегда берем из словаря
      let countryMap = (window.i18nDict && window.i18nDict.countries) || {};
      
      populateCountrySelect(countryMap);
      
      // Update Latin Warning text if visible
      if (latinWarning && !latinWarning.classList.contains('hidden')) {
          latinWarning.textContent = getLatinWarningText();
      }
      
      // Update titles for all inputs
      [surnameInputDirect, nameInputDirect, patronymicInputDirect].forEach(inp => {
           if (inp) {
               inp.title = getLatinWarningText();
           }
      });
      
      // Re-validate to update custom validity messages (but don't show red borders if valid)
      // Actually setLatinValidity sets messages.
      const { surname, name, patronymic } = getFioInputs();
      if (surname) setLatinValidity(surname);
      if (name) setLatinValidity(name);
      if (patronymic) setLatinValidity(patronymic);
      
      if (latinWarning) updateLatinWarning();
  };

  window.addEventListener('i18n:languageChanged', handleLangChange);

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
    // New inputs
    const surnameInput = form.querySelector('input[name="surname"]');
    const nameInput = form.querySelector('input[name="first_name"]');
    const patronymicInput = form.querySelector('input[name="patronymic"]');
    
    // Legacy support or fallback if needed (though we removed it from HTML)
    const oldNameInput = form.querySelector('input[name="full_name_ru"], input[name="full_name"]');

    const passwordInput = form.querySelector('input[name="password"], input#password, input[type="password"]');
    const password2Input = form.querySelector('input[name="password2"], input#password2'); 
    return { emailInput, surnameInput, nameInput, patronymicInput, oldNameInput, passwordInput, password2Input };
  };

  const latinOnlyRegex = /^[A-Za-z\s'-]*$/; // Changed to * to allow empty string (checked separately)
  let latinWarning = null;
  
  // We will track the 3 inputs now
  let surnameInputDirect = null;
  let nameInputDirect = null;
  let patronymicInputDirect = null;

  const getLatinWarningText = () => {
     return (window.i18nDict && window.i18nDict['register.latin_only_warning']) || 'Пожалуйста, введите имя латинскими буквами (на английском)';
   };

  const getFioInputs = () => {
     return {
         surname: form.querySelector('input[name="surname"]'),
         name: form.querySelector('input[name="first_name"]'),
         patronymic: form.querySelector('input[name="patronymic"]')
     };
  };

  const setLatinValidity = (input) => {
    if (!input) return true;
    const value = input.value.trim();
    // For required fields (surname/name), empty check is handled by browser 'required' or submission check
    // Here we only check REGEX if value exists.
    const isValid = latinOnlyRegex.test(value);
    
    const warningText = getLatinWarningText();
    input.setCustomValidity(isValid ? '' : warningText);
    
    // Also set title for hover
    input.title = isValid ? '' : warningText;
    
    if (isValid) {
        input.classList.remove('border-red-500', 'text-red-500');
        input.classList.add('border-default');
    } else {
        input.classList.remove('border-default');
        input.classList.add('border-red-500', 'text-red-500');
        // Report validity immediately to show browser UI if needed, 
        // but usually we just want the inline text. 
        // If we want the browser bubble to show up immediately: input.reportValidity();
        // But user asked to show message "during input", the inline text handles that.
        // The browser bubble will appear on submit.
    }
    return isValid;
  };

  const updateLatinWarning = () => {
    const { surname, name, patronymic } = getFioInputs();
    
    // Check all 3
    let allValid = true;
    if (surname && !setLatinValidity(surname)) allValid = false;
    if (name && !setLatinValidity(name)) allValid = false;
    if (patronymic && !setLatinValidity(patronymic)) allValid = false;

    if (!latinWarning) return;
    
    latinWarning.textContent = getLatinWarningText();

    if (allValid) {
      latinWarning.classList.add('hidden');
    } else {
      latinWarning.classList.remove('hidden');
    }
  };

  const fioInputs = getFioInputs();
  surnameInputDirect = fioInputs.surname;
  nameInputDirect = fioInputs.name;
  patronymicInputDirect = fioInputs.patronymic;

  // UX: Auto-lowercase email on blur
  const { emailInput } = findInputs(form);
  if (emailInput) {
    emailInput.addEventListener('blur', function() {
      this.value = this.value.trim().toLowerCase();
    });
  }

  // We assume the warning div is already in the DOM now (added in HTML)
  // or we can find it relative to one of the inputs
  if (surnameInputDirect) {
      // Find the warning container
      latinWarning = document.querySelector('[data-latin-warning="true"]');
      
      [surnameInputDirect, nameInputDirect, patronymicInputDirect].forEach(inp => {
          if (inp) {
              inp.addEventListener('input', updateLatinWarning);
              inp.addEventListener('blur', updateLatinWarning);
          }
      });

    // Old listener removed, handled by global handleLangChange
  }
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await ensureValuesCommitted();
  
    // очистим ошибки
    messageContainer.textContent = '';
    messageContainer.classList.remove('text-red-500', 'text-green-600');
  
    const { emailInput, surnameInput, nameInput, patronymicInput, oldNameInput, passwordInput, password2Input } = findInputs(form);
  
    if (passwordInput && !passwordInput.name) {
      passwordInput.name = 'password_temp_for_read';
    }
  
    const roleValue = roleSelect ? roleSelect.value : '';
    const email = emailInput
    ? emailInput.value.trim().toLowerCase()
    : '';
    
    // Construct fullName from split inputs
    let fullName = '';
    if (surnameInput && nameInput) {
        const s = surnameInput.value.trim();
        const n = nameInput.value.trim();
        const p = patronymicInput ? patronymicInput.value.trim() : '';

        if (!s || !n) {
             messageContainer.textContent = getTranslatedText('register.fill_fio', 'Пожалуйста, заполните Фамилию и Имя.');
             messageContainer.classList.add('text-red-500');
             if (!s) surnameInput.focus();
             else nameInput.focus();
             if (submitButton) submitButton.disabled = false;
             return;
        }

        // Format: Surname Name Patronymic
        fullName = `${s} ${n} ${p}`.trim();
    } else if (oldNameInput) {
        // Fallback
        fullName = oldNameInput.value.trim();
    }

    const password = passwordInput ? passwordInput.value : '';
    const confirmPassword = password2Input ? password2Input.value : '';
    const countryCode = countrySelect ? countrySelect.value : '';

    // Validate latin chars
    updateLatinWarning();
    const isLatinValid = (surnameInput ? setLatinValidity(surnameInput) : true) &&
                         (nameInput ? setLatinValidity(nameInput) : true) &&
                         (patronymicInput ? setLatinValidity(patronymicInput) : true) &&
                         (oldNameInput ? setLatinValidity(oldNameInput) : true);

    if (!isLatinValid) {
      messageContainer.textContent = getLatinWarningText();
      messageContainer.classList.add('text-red-500');
      if (surnameInput) surnameInput.reportValidity();
      else if (nameInput) nameInput.reportValidity();
      else if (oldNameInput) oldNameInput.reportValidity();
      
      const maybePassword = form.querySelector('input[name="password_temp_for_read"]');
      if (maybePassword) maybePassword.removeAttribute('name');
      return;
    }

    if (password !== confirmPassword) {
      messageContainer.textContent = getTranslatedText('error.passwords_mismatch', 'Пароли не совпадают');
      messageContainer.classList.add('text-red-500');
      const maybePassword = form.querySelector('input[name="password_temp_for_read"]');
      if (maybePassword) maybePassword.removeAttribute('name');
      return;
    }
  
    if (!isSelectChosen(roleSelect) || !email || !fullName || !password || !isSelectChosen(countrySelect)) {
      messageContainer.textContent = getTranslatedText('register.fill_all', 'Пожалуйста, заполните все поля корректно (включая страну).');
      messageContainer.classList.add('text-red-500');
      const maybePassword = form.querySelector('input[name="password_temp_for_read"]');
      if (maybePassword) maybePassword.removeAttribute('name');
      return;
    }
    // --- НОВОЕ: если роль participant — НЕ ОТПРАВЛЯЕМ на сервер, а передаём данные на participant/register.html ---
    if (roleValue === 'participant') {
      try {
        const pending = {
          email,
          full_name_ru: fullName, // This preserves the original format "Surname Name Patronymic"
          country: countryCode,
          role: roleValue,
          __saved_at: Date.now()
        };
        sessionStorage.setItem('pending_registration', JSON.stringify(pending));

        // <-- сюда сохраняем пароль временно в sessionStorage чтобы следующая страница могла
        // автоматически зарегистрировать/логинить пользователя (удаляется после использования).
        // Если не хочешь хранить пароль в sessionStorage — просто закомментируй следующую строку.
        sessionStorage.setItem('pending_password', password);

        showSuccessBanner('Данные сохранены локально. Перейдите к заполнению профиля участника...', 900);
        setTimeout(() => { window.location.href = 'participant/register.html'; }, 900);
        return;
      } catch (err) {
        console.error('Не удалось сохранить pending_registration', err);
        messageContainer.textContent = getTranslatedText('register.save_error', 'Ошибка при сохранении данных локально.');
        messageContainer.classList.add('text-red-500');
        if (submitButton) submitButton.disabled = false;
        const maybePassword = form.querySelector('input[name="password_temp_for_read"]');
        if (maybePassword) maybePassword.removeAttribute('name');
        return;
      }
    }
  // --- конец нового блока ---
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
        const errMsg = data?.detail || data?.message || getTranslatedText('register.error', 'Произошла ошибка при регистрации.');
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
        messageContainer.textContent = getTranslatedText('register.token_error', 'Токен не получен от сервера после логина.');
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
      messageContainer.textContent = getTranslatedText('register.connection_error', 'Ошибка соединения с сервером.');
      messageContainer.classList.add('text-red-500');
    } finally {
      if (submitButton) submitButton.disabled = false;
      const maybePassword = form.querySelector('input[name="password_temp_for_read"]');
      if (maybePassword) maybePassword.removeAttribute('name');
    }
  });
  
  
}); // DOMContentLoaded
