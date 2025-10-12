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

function renderUserInfo(user) {
    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');
    const welcomeEl = document.querySelector('h1.text-xl');
    const imgPath = user.profile.image;
  
    avatarEl.src = imgPath.startsWith('http')
      ? imgPath
      : `https://portal.femo.kz${imgPath}`;
    nameEl.textContent = user.profile.full_name_ru;
  
    const firstName = user.profile.full_name_ru.split(' ')[0];
    welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`;
  
    const roleMap = {
      administrator: 'Администратор',
      // можно добавить другие роли при необходимости
    };
  
    // Устанавливаем роль по умолчанию, если не найдена
    roleEl.textContent = roleMap[user.profile.role] || 'Администратор';
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

function fillProfileData(data) {
    document.querySelector('input[name="email"]').value = data.email || ''
    document.querySelector('input[name="full_name_ru"]').value = data.full_name_ru || ''

    const img = document.getElementById('imagePreview')
    if (img && data.image) {
        img.src = data.image
        img.classList.remove('bg-gray-50')
        const fileNameEl = document.getElementById('fileName')
        // if (fileNameEl) fileNameEl.innerHTML = `<img src="${data.image}">`;
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


// === ПРОСТОЕ ПОВЕДЕНИЕ ДЛЯ КНОПКИ "Редактировать" ===

// Находим кнопку и вешаем обработчик
const editBtn = document.getElementById('edit-button');
if (editBtn) {
  editBtn.addEventListener('click', async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        alert('Токен не найден');
        return;
      }

      // Получаем данные профиля
      const response = await fetch('https://portal.femo.kz/api/users/administrator/profile/', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        alert('Ошибка загрузки профиля');
        return;
      }

      const data = await response.json();

      // Заполняем только 2 поля в модалке
      const modal = document.getElementById('modalEdit');
      if (!modal) {
        alert('Модалка не найдена');
        return;
      }

      const emailInput = modal.querySelector('input[name="email"]');
      const fullNameInput = modal.querySelector('input[name="full_name_ru"]');

      if (emailInput) emailInput.value = data.email || '';
      if (fullNameInput) fullNameInput.value = data.full_name_ru || '';

      // Показываем модалку
      modal.classList.remove('hidden');

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