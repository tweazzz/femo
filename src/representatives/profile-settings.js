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
      : `https://portal.femo.kz${imgPath}`;
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

async function loadRepresentativeProfileForHeader() {
  try {
    const res = await authorizedFetch('https://portal.femo.kz/api/users/representative/profile/');
    if (!res.ok) throw new Error(`Ошибка загрузки профиля представителя: ${res.status}`);

    const profile = await res.json();
    renderUserInfo(profile);
  } catch (err) {
    console.error('Ошибка при загрузке профиля для шапки:', err);
  }
}
async function loadUserSettings() {
  try {
    const res = await authorizedFetch('https://portal.femo.kz/api/users/settings/');
    if (!res.ok) throw new Error(`Ошибка загрузки настроек: ${res.status}`);
    const data = await res.json();

    // Язык
    document.querySelectorAll('input[name="language"]').forEach(input => {
      input.checked = input.value === data.language;
    });

    // Уведомления
    document.getElementById('option1').checked = data.notify_results ?? false;
    document.getElementById('option2').checked = data.notify_olympiads ?? false;
    document.getElementById('option3').checked = data.notify_payments ?? false;
    document.getElementById('option4').checked = data.notify_tasks ?? false;
    document.getElementById('option5').checked = data.notify_profile ?? false;
  } catch (err) {
    console.error('Ошибка при загрузке настроек пользователя:', err);
  }
}

// Автосохранение при любом изменении
async function autoSaveUserSettings() {
  const language = document.querySelector('input[name="language"]:checked')?.value || 'ru';

  const payload = {
    language,
    notify_results: document.getElementById('option1').checked,
    notify_olympiads: document.getElementById('option2').checked,
    notify_payments: document.getElementById('option3').checked,
    notify_tasks: document.getElementById('option4').checked,
    notify_profile: document.getElementById('option5').checked
  };

  try {
    const res = await authorizedFetch('https://portal.femo.kz/api/users/settings/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
    console.log('Настройки успешно обновлены');
  } catch (err) {
    console.error('Ошибка при автосохранении настроек:', err);
  }
}

// Вешаем слушатели
function initSettingsListeners() {
  document.querySelectorAll('input[name="language"]').forEach(input => {
    input.addEventListener('change', autoSaveUserSettings);
  });

  ['option1', 'option2', 'option3', 'option4', 'option5'].forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener('change', autoSaveUserSettings);
    }
  });
}

// RESET PASSWORD
document.getElementById('reset-password').addEventListener('click', async () => {
  const oldPassword = document.getElementById('password').value.trim();
  const newPassword = document.getElementById('newpassword').value.trim();
  const confirmPassword = document.getElementById('confirm-password').value.trim();

  if (!oldPassword || !newPassword || !confirmPassword) {
    alert('Пожалуйста, заполните все поля.');
    return;
  }

  if (newPassword !== confirmPassword) {
    alert('Пароли не совпадают.');
    return;
  }

  const payload = {
    old_password: oldPassword,
    new_password: newPassword,
    confirm_password: confirmPassword,
  };

  try {
    const res = await authorizedFetch(
      'https://portal.femo.kz/api/users/settings/password/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ошибка ${res.status}: ${errText}`);
    }

    alert('Пароль успешно изменен!');
    
    // Очистка полей
    document.getElementById('password').value = '';
    document.getElementById('newpassword').value = '';
    document.getElementById('confirm-password').value = '';
  } catch (err) {
    console.error('Ошибка при смене пароля:', err);
    alert('Не удалось изменить пароль: ' + err.message);
  }
});

// DELETE ACCOUNT
document.getElementById('delete-account').addEventListener('click', async () => {

  try {
    const res = await authorizedFetch(
      'https://portal.femo.kz/api/users/representative/profile/',
      {
        method: 'DELETE'
      }
    );

    if (!res.ok) throw new Error(`Ошибка удаления: ${res.status}`);

    alert('Аккаунт успешно удален.');
    toggleModal('modalDel');

    window.location.href = '/index.html';
  } catch (err) {
    console.error('Ошибка при удалении аккаунта:', err);
    alert('Не удалось удалить аккаунт. Попробуйте позже.');
  }
});


document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user);
  await loadUserSettings();
  initSettingsListeners();  
  try {
    await loadRepresentativeProfileForHeader();
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})