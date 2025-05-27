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

function renderUserInfo(user) {
  const avatarEl = document.getElementById('user-avatar')
  const nameEl = document.getElementById('user-name')
  const roleEl = document.getElementById('user-role')
  const welcomeEl = document.querySelector('h1.text-xl')

  const defaultAvatar = '/src/assets/images/user_logo.jpg'
  const imgPath = user?.profile?.image

  let finalAvatar = defaultAvatar
  if (imgPath && typeof imgPath === 'string') {
    finalAvatar = imgPath.startsWith('http')
      ? imgPath
      : `https://portal.gradients.academy${imgPath}`
  }

  avatarEl.src = finalAvatar

  nameEl.textContent = user.profile.full_name_ru || ''
  const firstName = user.profile.full_name_ru?.split(' ')[0] || ''
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`

  const roleMap = {
    representative: 'Представитель',
  }
  roleEl.textContent = roleMap[user.profile.role] || user.profile.role || ''
}
async function loadRepresentativeProfile() {
  try {
    const res = await authorizedFetch('https://portal.gradients.academy/users/representative/profile/');
    if (!res.ok) throw new Error(`Ошибка загрузки профиля представителя: ${res.status}`);

    const data = await res.json();

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
document.getElementById('participant-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const form = e.target;

  const payload = {
    email: form.elements['email'].value.trim(),
    full_name_ru: form.elements['fullname'].value.trim(),
    full_name_en: form.elements['fullname_eng'].value.trim(),
    country: {
      name: form.elements['country'].value.trim(),
      code: null // или можно по коду, если ты заранее знаешь "KZ" и т.п.
    }
  };

  try {
    const res = await authorizedFetch(
      'https://portal.gradients.academy/users/representative/profile/',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
    alert('Данные успешно обновлены');

    toggleModal('modalEdit'); // Закрываем модалку
    await loadRepresentativeProfile(); // Обновляем отображение
  } catch (err) {
    console.error('Ошибка при сохранении данных:', err);
    alert('Не удалось сохранить изменения');
  }
});


// PROFILE SETTINGS!


document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user);
    
  try {
    await loadRepresentativeProfile();
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})