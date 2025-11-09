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
        console.warn(
            `Пользователь с ролью "${role}" не имеет доступа к участникам. Редирект.`
        )
        window.location.href = '/index.html'
        return null
    }

    return user
}

function renderUserInfo(profile) {
  // допускаем вызов с объектом { profile: {...} } или прямым profile
  const p = profile && profile.profile ? profile.profile : (profile || {});

  const avatarEl  = document.getElementById('user-avatar');
  const nameEl    = document.getElementById('user-name');
  const roleEl    = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  if (!avatarEl || !nameEl || !roleEl || !welcomeEl) {
    console.warn('renderUserInfo: отсутствуют элементы в DOM для отрисовки профиля');
    return;
  }

  // картинка
  const imgPath = p.image || '';
  avatarEl.src = imgPath
    ? (imgPath.startsWith('http') ? imgPath : `https://portal.femo.kz${imgPath}`)
    : '';

  // имя: выбираем имя в зависимости от frontend языка (если есть)
  const frontendLang = (localStorage.getItem('lang') === 'kk') ? 'kz' : (localStorage.getItem('lang') || 'ru');
  const fullName = (frontendLang === 'en')
    ? (p.full_name_en || p.full_name_ru || '')
    : (p.full_name_ru || p.full_name_en || '');
  nameEl.textContent = fullName;

  const firstName = (fullName.split && fullName.split(' ')[0]) || '';

  // Вставляем span с data-i18n для welcome — так i18n.applyTranslations сможет заменить текст
  // Пытаемся использовать сначала ключ admin, затем generic
  const welcomeKeyCandidates = ['welcome.message_admin', 'welcome.message', 'welcome.message_rep'];

  // Если внутри welcomeEl уже есть span[data-i18n] — используем его и обновляем имя рядом
  let greetSpan = welcomeEl.querySelector('span[data-i18n]');
  if (!greetSpan) {
    greetSpan = document.createElement('span');
    // поставим первый candidate как data-i18n — applyTranslations заменит при наличии
    greetSpan.setAttribute('data-i18n', welcomeKeyCandidates[0]);
    // запасной текст (русский) — если перевод ещё не доступен
    greetSpan.textContent = 'Добро пожаловать,';
    // Очистим h1 и вставим: [greetSpan] [space + firstName + emoji]
    welcomeEl.innerHTML = '';
    welcomeEl.appendChild(greetSpan);
    welcomeEl.appendChild(document.createTextNode(' ' + firstName + ' 👋'));
  } else {
    // обновляем имя рядом с существующим span
    // удалим все текстовые узлы после span и добавим имя
    let node = greetSpan.nextSibling;
    while (node) {
      const next = node.nextSibling;
      node.remove();
      node = next;
    }
    greetSpan.after(document.createTextNode(' ' + firstName + ' 👋'));
  }

  // Если словарь загружен — попробуем подобрать корректный ключ и применить перевод
  try {
    const dict = window.i18nDict || {};
    // найдем первый существующий ключ в словаре и установим data-i18n на него
    const foundKey = welcomeKeyCandidates.find(k => Object.prototype.hasOwnProperty.call(dict, k));
    if (foundKey) {
      greetSpan.dataset.i18n = foundKey;
    } else {
      // оставляем по-умолчанию welcome.message_admin (или русский) — перевод придёт позже
    }

    if (typeof applyTranslations === 'function') {
      // применим перевод к всем элементам с data-i18n (включая наш span)
      applyTranslations(dict);
    }
  } catch (e) {
    console.warn('renderUserInfo: applyTranslations error', e);
  }

  // role
  const roleMap = { administrator: 'Администратор' };
  roleEl.textContent = roleMap[p.role] || p.role || '';

  // подписка на изменения языка: при смене языка — снова применим перевод и обновим имя
  // (на случай, если словарь придёт позже)
  function onLanguageChanged(ev) {
    try {
      const dict = window.i18nDict || {};
      const foundKey = welcomeKeyCandidates.find(k => Object.prototype.hasOwnProperty.call(dict, k));
      if (foundKey) greetSpan.dataset.i18n = foundKey;
      if (typeof applyTranslations === 'function') applyTranslations(dict);
      // обновим имя (возможна смена full_name_{lang})
      const lang = localStorage.getItem('lang') || 'ru';
      const resolvedLang = (lang === 'kk') ? 'kz' : lang;
      const newFullName = (resolvedLang === 'en') ? (p.full_name_en || p.full_name_ru || '') : (p.full_name_ru || p.full_name_en || '');
      const newFirst = (newFullName.split && newFullName.split(' ')[0]) || '';
      // обновим nameEl and trailing text node after greetSpan
      nameEl.textContent = newFullName;
      // remove existing trailing text nodes after span
      let afterNode = greetSpan.nextSibling;
      while (afterNode) {
        const next = afterNode.nextSibling;
        afterNode.remove();
        afterNode = next;
      }
      greetSpan.after(document.createTextNode(' ' + newFirst + ' 👋'));
    } catch (e) {
      console.warn('onLanguageChanged error', e);
    }
  }

  // чтобы не добавлять много слушателей при многократных вызовах — удалим старые и добавим новый
  window.removeEventListener('i18n:languageChanged', onLanguageChanged);
  window.addEventListener('i18n:languageChanged', onLanguageChanged);

  // также реагируем на i18n:languageReady (иногда используется)
  window.removeEventListener('i18n:languageReady', onLanguageChanged);
  window.addEventListener('i18n:languageReady', onLanguageChanged);
}
  

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
        alert('Токен не найден. Пожалуйста, войдите заново.')
        return
    }

    try {
        const response = await authorizedFetch('https://portal.femo.kz/api/users/administrator/profile/', {
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

                toggleModal('modalEdit', true); 
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

// --------- Обновлённая fillProfileData: заполняем все формы/inputs с одинаковыми именами ----------
function fillProfileData(data) {
  // Заполним все inputs с соответствующими name (чтобы и main, и modal получили значения)
  const names = ['email', 'full_name_ru', 'full_name_en'];
  names.forEach((name) => {
    const els = document.querySelectorAll(`input[name="${name}"]`);
    els.forEach(el => {
      el.value = data[name] || '';
    });
  });

  const img = document.getElementById('imagePreview');
  if (img && data.image) {
    img.src = data.image;
    img.classList.remove('bg-gray-50');
  }

  // ID участника — только для чтения везде
  const idInputs = document.querySelectorAll('input[name="id"]');
  idInputs.forEach(idInput => {
    idInput.readOnly = true;
    idInput.disabled = true;
  });
}

// --------- Обработчик submit для формы модалки (admin-form-modal) ----------
const modalForm = document.querySelector('#admin-form-modal');
if (modalForm) {
  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target; // это точно модальная форма

    // Убедимся, что поля включены (FormData не включает disabled)
    form.querySelectorAll('input, textarea, select').forEach(el => {
      if (el.name !== 'id') el.disabled = false;
    });

    const formData = new FormData(form);

    // DEBUG: что реально уходит
    console.log('FormData entries (modal):');
    for (const [k, v] of formData.entries()) {
      console.log(k, v instanceof File ? v.name : v);
    }

    try {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('Токен не найден');

      const hasFile = [...formData.keys()].some(k => k === 'image');
      let response;
      if (!hasFile) {
        const payload = Object.fromEntries(formData.entries());
        response = await fetch('https://portal.femo.kz/api/users/administrator/profile/', {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch('https://portal.femo.kz/api/users/administrator/profile/', {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            // НЕ указываем Content-Type
          },
          body: formData,
        });
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ошибка сервера: ${response.status} ${text}`);
      }

      const updatedData = await response.json();
      // Обновляем все поля (как main так и modal)
      fillProfileData(updatedData);
      renderUserInfo({ profile: updatedData });
      alert('Профиль успешно обновлён!');
      // закроем модалку
      if (typeof toggleModal === 'function') toggleModal('modalEdit', false);
    } catch (err) {
      console.error('Submit error (modal):', err);
      alert('Не удалось обновить профиль: ' + err.message);
    } finally {
      // можно вернуть disabled обратно
      toggleEditMode(false);
    }
  });
} else {
  console.warn('Форма модалки #admin-form-modal не найдена — проверь HTML');
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


// === ПРОСТОЕ ПОВЕДЕНИЕ ДЛЯ КНОПКИ "Редактировать" ===

// Находим кнопку и вешаем обработчик
// === Обновлённый обработчик кнопки "Редактировать" ===
const editBtn = document.getElementById('edit-button');
if (editBtn) {
  editBtn.addEventListener('click', async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        alert('Токен не найден');
        return;
      }

      // Получаем актуальные данные профиля (чтобы подтянуть full_name_en)
      const response = await authorizedFetch('https://portal.femo.kz/api/users/administrator/profile/', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        alert('Ошибка загрузки профиля');
        return;
      }

      const data = await response.json();

      // Находим модалку и поля
      const modal = document.getElementById('modalEdit');
      if (!modal) {
        alert('Модалка не найдена');
        return;
      }

      const emailInput = modal.querySelector('input[name="email"]');
      const fullNameRuInput = modal.querySelector('input[name="full_name_ru"]');
      const fullNameEnInput = modal.querySelector('input[name="full_name_en"]');
      const imagePreview = modal.querySelector('#imagePreview');

      if (emailInput) emailInput.value = data.email || '';
      if (fullNameRuInput) fullNameRuInput.value = data.full_name_ru || '';
      if (fullNameEnInput) fullNameEnInput.value = data.full_name_en || '';

      if (imagePreview && data.image) {
        imagePreview.src = data.image;
        imagePreview.classList.remove('bg-gray-50');
      }

      // Включаем режим редактирования (чтобы inputs были enabled и FormData их включал)
      // toggleEditMode(true) установит видимость кнопок Cancel/Save и снимет disabled с полей
      if (typeof toggleEditMode === 'function') {
        toggleEditMode(true);
      } else {
        // запасной вариант — вручную снять disabled у полей формы
        const form = modal.querySelector('form');
        if (form) {
          const inputs = form.querySelectorAll('input, select, textarea');
          inputs.forEach((el) => {
            if (el.name !== 'id') el.disabled = false;
          });
        }
      }

      // Показываем модалку (если у вас есть toggleModal, используем его)
      if (typeof toggleModal === 'function') {
        toggleModal('modalEdit', true);
      } else {
        modal.classList.remove('hidden');
      }

    } catch (err) {
      console.error(err);
      alert('Ошибка при загрузке данных профиля');
    }
  });
}


// Чтобы при закрытии модалки кнопка "Редактировать" не исчезала
const closeBtn = document.querySelector('#modalEdit button[data-close], #modalEdit .close-btn, #modalEdit .btn-close');
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    const modal = document.getElementById('modalEdit');
    if (modal) modal.classList.add('hidden');
    // ничего не трогаем с edit-button
  });
}


document.querySelector('#admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        'https://portal.femo.kz/api/users/administrator/profile/',
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      if (!response.ok) throw new Error('Ошибка при обновлении профиля');
      const updatedData = await response.json();
      // Обновляем форму и шапку
      fillProfileData(updatedData);
      renderUserInfo({ profile: updatedData });
      alert('Профиль успешно обновлён!');
      toggleModal('modalEdit', false);
    } catch (err) {
      console.error('Ошибка:', err);
      alert('Не удалось обновить профиль.');
    }
  });
  



  document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      alert('Токен не найден. Пожалуйста, войдите заново.');
      return;
    }
    try {
      const response = await fetch(
        'https://portal.femo.kz/api/users/administrator/profile/',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Ошибка при получении профиля');
      const data = await response.json();
      fillProfileData(data);
      renderUserInfo({ profile: data });
      toggleEditMode(false);
    } catch (error) {
      console.error('Ошибка при получении профиля:', error);
    }
  });