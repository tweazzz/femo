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
  if (role !== 'participant') {
    console.warn(
      `Пользователь с ролью "${role}" не имеет доступа к участникам. Редирект.`
    )
    window.location.href = '/index.html'
    return null
  }

  return user
}

// 1) Функция для загрузки полного профиля участника
async function loadUserProfile() {
  const res = await authorizedFetch(
    'https://portal.femo.kz/api/users/participant/profile/'
  );
  if (!res.ok) throw new Error('Не удалось загрузить профиль');
  return await res.json();
}

function renderUserInfo(profile) {
  const avatarEl   = document.getElementById('user-avatar');
  const nameEl     = document.getElementById('user-name');
  const roleEl     = document.getElementById('user-role');
  const welcomeEl  = document.querySelector('h1.text-xl');

  // Безопасный путь к картинке: если нет — используем заглушку
  const imgPath = profile && profile.image ? profile.image : null;
  if (imgPath && typeof imgPath === 'string') {
    avatarEl.src = imgPath.startsWith('http')
      ? imgPath
      : `https://portal.femo.kz${imgPath}`;
  } else {
    // вставь тут свой путь к дефолтной аватарке или пустую картинку
    avatarEl.src = '/src/assets/images/default-avatar.png'; // <- поменяй если нужно
  }

  // Имя (берём безопасно: русское, английское, либо fallback)
  const fullNameRu = (profile && (profile.full_name_ru || profile.full_name_en || profile.full_name)) || '';
  nameEl.textContent = fullNameRu || 'Пользователь';

  // безопасно отделяем firstName
  const firstName = fullNameRu ? fullNameRu.split(' ')[0] : 'Привет';
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`;

  // Роль
  roleEl.textContent = 'Участник';
}


document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  // сначала загрузим детали профиля
  let profile
  try {
    profile = await loadUserProfile()
  } catch (e) {
    console.error(e)
    return
  }
  renderUserInfo(profile)

  // остальной код...
})

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await authorizedFetch('https://portal.femo.kz/api/users/participant/profile/', {
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

        toggleEditMode(true)
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

function fillProfileData(data) {
  document.querySelector('input[name="id"]').value = data.id || ''
  document.querySelector('input[name="email"]').value = data.email || ''
  document.querySelector('input[name="fullname_ru"]').value = data.full_name_ru || ''
  document.querySelector('input[name="fullname_en"]').value = data.full_name_en || ''
  document.querySelector('input[name="country"]').value = data.country?.name || ''
  document.querySelector('input[name="city"]').value = data.city || ''
  document.querySelector('input[name="school"]').value = data.school || ''
  document.querySelector('input[name="class"]').value = convertGrade(data.grade) || ''

  document.querySelector('input[name="parent_name"]').value = data.parent?.name_ru || ''
  document.querySelector('input[name="parent_name_en"]').value = data.parent?.name_en || ''
  document.querySelector('input[name="parent_phone"]').value = data.parent?.phone_number || ''

  document.querySelector('input[name="teacher_name"]').value = data.teacher?.name_ru || ''
  document.querySelector('input[name="teacher_name_en"]').value = data.teacher?.name_en || ''
  document.querySelector('input[name="teacher_phone"]').value = data.teacher?.phone_number || ''

  const img = document.getElementById('imagePreview')
  if (img && data.image) {
    img.src = data.image
    img.classList.remove('bg-gray-50')
    const fileNameEl = document.getElementById('fileName')
    if (fileNameEl) fileNameEl.textContent = getFileNameFromUrl(data.image)
  }

  // ID участника — только для чтения
  const idInput = document.querySelector('input[name="id"]')
  if (idInput) {
    idInput.readOnly = true
    idInput.disabled = true
  }
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
