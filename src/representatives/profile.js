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
  const avatarEl = document.getElementById('user-avatar');
  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  const defaultAvatar = '/src/assets/images/user_logo.jpg';
  const imgPath = profile?.image;

  let finalAvatar = defaultAvatar;
  if (imgPath && typeof imgPath === 'string') {
    finalAvatar = imgPath.startsWith('http')
      ? imgPath
      : `https://portal.gradients.academy${imgPath}`;
  }

  avatarEl.src = finalAvatar;
  nameEl.textContent = profile.full_name_ru || '';
  const firstName = profile.full_name_ru?.split(' ')[0] || '';
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`;

  const countryCode = profile.country?.code || '';
  roleEl.textContent = `Представитель${countryCode ? ' ' + countryCode : ''}`;
}

async function loadRepresentativeProfile() {
  try {
    const res = await authorizedFetch('https://portal.gradients.academy/users/representative/profile/');
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
    const res = await fetch('https://portal.gradients.academy/common/countries');
    if (!res.ok) throw new Error(`Ошибка загрузки стран: ${res.status}`);

    const data = await res.json();
    countriesList = data.results;
  } catch (err) {
    console.error('Ошибка при загрузке списка стран:', err);
  }
}

document.getElementById('participant-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const form = e.target;
  const countryName = form.elements['country'].value.trim();

  const matchedCountry = countriesList.find(c => c.name.toLowerCase() === countryName.toLowerCase());

  const payload = {
    email: form.elements['email'].value.trim(),
    full_name_ru: form.elements['fullname'].value.trim(),
    full_name_en: form.elements['fullname_eng'].value.trim(),
    country: matchedCountry || { name: countryName, code: null }
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

  await loadCountries(); 
  renderUserInfo(user);
    
  try {
    await loadRepresentativeProfile();
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})