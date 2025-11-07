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

// Основная отрисовка профиля — теперь устойчиво обрабатывает
function renderUserInfo(profile) {
  // распаковываем, если передали { profile: data }
  const p = (profile && profile.profile) ? profile.profile : (profile || {});

  const avatarEl  = document.getElementById('user-avatar');
  const nameEl    = document.getElementById('user-name');
  const roleEl    = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  if (!avatarEl || !nameEl || !roleEl || !welcomeEl) {
    // если чего-то нет в DOM — безопасно завершаем и логируем
    console.warn('renderUserInfo: отсутствуют элементы в DOM для отрисовки профиля');
    return;
  }

  const imgPath = p.image || '';
  avatarEl.src = imgPath
    ? (imgPath.startsWith('http') ? imgPath : `https://portal.femo.kz${imgPath}`)
    : ''; // если нет изображения — оставляем пустым (можно поставить placeholder)

  const fullName = p.full_name_ru || '';
  nameEl.textContent = fullName;
  const firstName = fullName.split(' ')[0] || '';
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`;

  const roleMap = { administrator: 'Администратор' };
  roleEl.textContent = roleMap[p.role] || p.role || '';
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

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

    // 2) Подтягиваем актуальный профиль по API
    const profileData = await loadAdminProfile();
    // 3) Рисуем шапку
    renderUserInfo(profileData);

  try {
    await loadUserSettings();

    // Обработка смены языка
    document.querySelectorAll('input[name="lang"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        updateUserSettings({ language: radio.value });
      });
    });

    // Обработка чекбоксов уведомлений
    document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        updateUserSettings(); // обновляем всё
      });
    });


      // Обработчики для кнопок "глазик"
      document.querySelectorAll('.toggle-pw').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-target');
          const input = document.getElementById(targetId);
          if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
          }
        });
      });

    setupPasswordChangeForm();


  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})


async function loadUserSettings() {
  const token = localStorage.getItem('access_token');
  if (!token) return;

  try {
    const response = await authorizedFetch('https://portal.femo.kz/api/users/settings/', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) throw new Error('Ошибка загрузки настроек');

    const settings = await response.json();

    // Установка языка
    const langInput = document.querySelector(`input[name="lang"][value="${settings.language}"]`);
    if (langInput) langInput.checked = true;

    // Установка чекбоксов уведомлений
    const notifyMap = {
      notify_results: 'О результатах',
      notify_tasks: 'О задачах',
      notify_olympiads: 'О олимпиадах',
      notify_profile: 'О профиле',
      notify_payments: 'О статусе оплаты',
    };

    Object.entries(notifyMap).forEach(([key, labelText]) => {
      const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes(labelText));
      if (label) {
        const checkbox = label.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = settings[key];
      }
    });

  } catch (error) {
    console.error('Ошибка при загрузке настроек:', error);
  }
}


async function updateUserSettings(updatedFields) {
  const token = localStorage.getItem('access_token');
  if (!token) return;

  try {
    // Получаем текущие настройки из DOM
    const language = document.querySelector('input[name="lang"]:checked')?.value;

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const settings = {
      language,
      notify_results: false,
      notify_tasks: false,
      notify_olympiads: false,
      notify_profile: false,
      notify_payments: false,
    };

    checkboxes.forEach((checkbox) => {
      const label = checkbox.closest('label');
      if (!label) return;
      const text = label.textContent.trim();

      if (text.includes('О результатах')) settings.notify_results = checkbox.checked;
      if (text.includes('О задачах')) settings.notify_tasks = checkbox.checked;
      if (text.includes('О олимпиадах')) settings.notify_olympiads = checkbox.checked;
      if (text.includes('О профиле')) settings.notify_profile = checkbox.checked;
      if (text.includes('О статусе оплаты')) settings.notify_payments = checkbox.checked;
    });

    const response = await authorizedFetch('https://portal.femo.kz/api/users/settings/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...settings, ...updatedFields }),
    });

    if (!response.ok) throw new Error('Ошибка при обновлении настроек');
    console.log('✅ Настройки успешно обновлены');
    location.reload();
  } catch (error) {
    console.error('❌ Ошибка при обновлении настроек:', error);
  }
}


function setupPasswordChangeForm() {
  const passwordForm = document.querySelector('form');
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
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
  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }

  try {
    const response = await fetch('https://portal.femo.kz/api/users/administrator/profile/', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) throw new Error('Ошибка запроса профиля');
    const data = await response.json();

    renderUserInfo({ profile: data });
  } catch (error) {
    console.error('Ошибка при получении профиля:', error);
  }
});
