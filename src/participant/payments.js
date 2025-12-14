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

  const roleMap = { participant: 'Представитель' };
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

  try {
    initTopUpHandler()
    await loadBalance()
    await loadAssignments()
    await loadActiveOlympiads()
    let sortAscending = true

  const sortHeader = document.getElementById('sort-date-header')
  const submitBtn = document.getElementById('submit-btn');
  if (sortHeader) {
    sortHeader.addEventListener('click', () => {
      allAssignments.sort((a, b) => {
        const dateA = new Date(a.created_at)
        const dateB = new Date(b.created_at)
        return sortAscending ? dateA - dateB : dateB - dateA
      })
      sortAscending = !sortAscending
      renderPaginatedAssignments()
    })}

    if (submitBtn) {
  submitBtn.addEventListener('click', async () => {
    const success = await submitProfileUpdate()
    if (success) {
      toggleModal('modal')         // ✅ открыть модалку
      toggleEditMode(false)        // 🔒 выключить редактирование
    } else {
      alert('Не получилось обновить данные')
    }
  })
}


  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})

function initTopUpHandler() {
  const topUpForm = document.querySelector('#modal form');
  const topUpButton = topUpForm.querySelector('button.btn-orange');

  topUpButton.addEventListener('click', async (e) => {
    e.preventDefault();

    const input = topUpForm.querySelector('input[type="number"]');
    const amount = parseInt(input.value, 10);

    if (isNaN(amount) || amount <= 0) {
      alert('Введите корректную сумму для пополнения.');
      return;
    }

    const token = localStorage.getItem('access_token');
    if (!token) {
      alert('Токен не найден. Пожалуйста, войдите заново.');
      return;
    }

    // Открываем новое окно заранее, чтобы не блокировалось браузером
    const payWindow = window.open('', '_blank');
    if (!payWindow) {
      alert('Не удалось открыть новое окно. Проверьте блокировщик всплывающих окон.');
      return;
    }
    // Показатель загрузки можно вставить в payWindow, например:
    payWindow.document.write('<p>Подготовка к оплате...</p>');

    try {
      const response = await authorizedFetch(
        'https://portal.femo.kz/api/payments/participant/dashboard/topup/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ amount })
        }
      );

      const result = await response.json();

      if (response.ok && result.pg_status === 'ok') {
        toggleModal('modal', false);
        if (result.pg_redirect_url) {
          // Перенаправляем новое окно на оплату
          payWindow.location.href = result.pg_redirect_url;
        } else {
          // Закрываем окно и обновляем страницу
          payWindow.close();
          location.reload();
        }
      } else {
        // При ошибке закрываем окно и показываем сообщение
        payWindow.close();
        alert('Ошибка при пополнении: ' + (result?.pg_status || 'Неизвестная ошибка'));
      }
    } catch (err) {
      console.error('Ошибка запроса:', err);
      payWindow.close();
      alert('Произошла ошибка при отправке запроса.');
    }
  });
}



let allAssignments = []
let currentAssignmentPage = 1
const assignmentPageSize = 5
let totalAssignmentCount = 0

async function loadAssignments(page = 1) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await authorizedFetch(
      `https://portal.femo.kz/api/payments/participant/dashboard/history/`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Ошибка загрузки: ${response.status}`)
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : { results: [] };

    allAssignments = data.results || data
    totalAssignmentCount = allAssignments.length
    currentAssignmentPage = page

    // ⛔ Если платежей нет — выводим сообщение и прекращаем выполнение
    if (totalAssignmentCount === 0) {
      document.getElementById('payments-tbody').innerHTML = `
        <tr><td colspan="8" class="text-center text-gray-500 py-4">
          Нет истории платежей
        </td></tr>
      `
      document.querySelector('.pagination').innerHTML = ''
      document.getElementById('total-payments-count').textContent = '0'
      return
    }

    renderPaginatedAssignments()

  } catch (err) {
    console.error('Ошибка при загрузке задач:', err)
    document.getElementById('payments-tbody').innerHTML = `
      <tr><td colspan="8" class="text-center text-red-500 py-4">${err.message}</td></tr>
    `
  }
}


function renderAssignmentTable(assignments) {
  const tbody = document.getElementById('payments-tbody')
  if (!tbody) return

  tbody.innerHTML =
    assignments.length === 0
      ? `<tr><td colspan="8" class="text-center text-gray-500 py-4">Нет данных</td></tr>`
      : assignments
          .map((task) => {
            const encodedTask = encodeURIComponent(JSON.stringify(task))
            return `
      <tr class="hover:bg-gray-50">
        <td>${task.transaction_id}</td>
        <td>${formatDate(task.created_at)}</td>
        <td>${task.description}</td>
        <td>${formatAmount(task.amount)}</td>
        <td><span class="card ${getPaymentStatusClass(task.status)}">${getPaymentStatusLabel(task.status)}</span></td>
        <td>
          <div class="flex justify-between gap-2 *:cursor-pointer">
              <button onclick="downloadPayment(${task.id})" data-task="${encodedTask}" class="text-gray-400 hover:text-blue-primary flex items-center gap-1">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.33301 18.3334H13.6663C15.3232 18.3334 16.6663 16.9903 16.6663 15.3334V8.04655C16.6663 7.17078 16.2837 6.33873 15.6187 5.76878L11.6756 2.38898C11.1319 1.92292 10.4394 1.66675 9.72324 1.66675H6.33301C4.67615 1.66675 3.33301 3.00989 3.33301 4.66675V15.3334C3.33301 16.9903 4.67615 18.3334 6.33301 18.3334Z" stroke="#F4891E" stroke-linejoin="round"/>
              <path d="M10.833 2.08344V4.66677C10.833 5.77134 11.7284 6.66677 12.833 6.66677H16.2497" stroke="#F4891E" stroke-linejoin="round"/>
              <path d="M6.66602 15.8335H13.3327" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M10 8.3335V13.3335" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M7.5 10.8335L10 13.3335L12.5 10.8335" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
              </svg> 
              <span class='text-orange-primary'> Скачать</span>             
            </button>
          </div>
        </td>
      </tr>
    `
          })
          .join('')
}

function renderAssignmentPagination() {
  const container = document.querySelector('.pagination')
  if (!container) return

  const totalPages = Math.max(
    1,
    Math.ceil(totalAssignmentCount / assignmentPageSize)
  )
  let buttons = ''

  for (let i = 1; i <= totalPages; i++) {
    buttons += `
      <button class="${i === currentAssignmentPage ? 'text-orange-primary border-orange-primary border' : 'text-gray-600'} px-3 py-1 rounded"
        onclick="goToAssignmentPage(${i})">${i}</button>
    `
  }

  container.innerHTML = `
    <div class="flex items-center gap-1">
      <button onclick="goToAssignmentPage(${Math.max(1, currentAssignmentPage - 1)})" class="px-3 py-1">←</button>
      ${buttons}
      <button onclick="goToAssignmentPage(${Math.min(totalPages, currentAssignmentPage + 1)})" class="px-3 py-1">→</button>
    </div>
  `
}

function goToAssignmentPage(page) {
  currentAssignmentPage = page
  renderPaginatedAssignments()
}

function renderPaginatedAssignments() {
  const start = (currentAssignmentPage - 1) * assignmentPageSize
  const end = start + assignmentPageSize
  const pageData = allAssignments.slice(start, end)

  document.getElementById('total-payments-count').textContent =
    allAssignments.length

  renderAssignmentTable(pageData)
  renderAssignmentPagination()
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toISOString().split('T')[0] // YYYY-MM-DD
}

function formatAmount(amount) {
  return `${amount > 0 ? '+' : ''}${amount.toLocaleString('ru-RU')} ₸`
}

function getPaymentStatusLabel(status) {
  const map = {
    paid: 'Оплачено',
    error: 'Ошибка',
    pending: 'В процессе',
  }
  return map[status] || status
}

function getPaymentStatusClass(status) {
  const map = {
    paid: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    pending: 'bg-purple-100 text-purple-800',
  }
  return map[status] || ''
}


async function loadBalance() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await authorizedFetch(
      'https://portal.femo.kz/api/payments/participant/dashboard/balance/',
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Ошибка загрузки баланса: ${response.status}`)
    }

    const data = await response.json()
    console.log('BALANCE RESPONSE:', data)

    const balanceEl = document.getElementById('balance')
    const currencyEl = document.getElementById('balance_currency')

    if (balanceEl && currencyEl) {
      // безопасно парсим баланс
      const rawBalance = Number(data.balance ?? 0)
      const balanceNumber = Number.isFinite(rawBalance) ? rawBalance : 0

      // мапа символов для известных валют
      const currencyMap = {
        'KZT': '₸',
        'RUB': '₽',
        'USD': '$',
        'EUR': '€'
      }
      const currencyCode = (data.currency || '').toUpperCase()
      const currencySymbol = currencyMap[currencyCode] || currencyCode || 'T'

      // вставляем в DOM с пробелом между числом и валютой
      balanceEl.childNodes[0].textContent = balanceNumber.toLocaleString('ru-RU') + ' '
      currencyEl.textContent = currencySymbol
    } else {
      console.warn('Элементы #balance или #balance_currency не найдены')
    }
  } catch (err) {
    console.error('Ошибка при загрузке баланса:', err)
  }
}




async function loadActiveOlympiads() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.')
    return
  }

  try {
    const response = await authorizedFetch('https://portal.femo.kz/api/payments/participant/dashboard/active-olympiads', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error(`Ошибка загрузки олимпиад: ${response.status}`)
    }

    const olympiads = await response.json()
    renderActiveOlympiads(olympiads)
  } catch (err) {
    console.error('Ошибка при загрузке активных олимпиад:', err)
  }
}


function renderActiveOlympiads(olympiads) {
  const wrapper = document.querySelector('[data-olympiads-wrapper]')
  if (!wrapper) return

  if (olympiads.length === 0) {
    wrapper.innerHTML = '<p class="text-gray-500">Нет активных олимпиад</p>'
    return
  }

  wrapper.innerHTML = olympiads.map(olymp => {
    // Класс и текст статуса
    const statusClass = olymp.is_paid ? 'paid' : 'unpaid'
    const statusText  = olymp.is_paid ? 'Оплачено' : 'Не оплачено'

    // Шаблон кнопки (показывается только если не оплачено)
    const payButton = !olymp.is_paid
      ? `<button
           onclick="payOlympiad(${olymp.id})"
           class="bg-orange-primary block w-full rounded-3xl p-1.5 text-center text-white"
         >Оплатить участие</button>`
      : ''

    return `
      <div class="custom-border w-full max-w-sm rounded-2xl p-4 mb-4">
        <div class="custom-border card ${statusClass} mb-2" style='width: fit-content;'>${statusText}</div>
        <p class="mb-4 font-bold">${olymp.title}</p>
        <div class="mb-6 flex *:flex-1">
          <div>
            <p class="text-gray-primary text-xs">Цена</p>
            <div class="text-blue-primary flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/>
              </svg>
              <span class="text-sm">${olymp.price.toLocaleString('ru-RU')} ₸</span>
            </div>
          </div>
          <div>
            <p class="text-gray-primary text-xs">Осталось</p>
            <div class="text-red-primary flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
              </svg>
              <span class="text-sm">${olymp.time_left || '—'}</span>
            </div>
          </div>
        </div>
        ${payButton}
      </div>
    `
  }).join('')
}

function downloadPayment(id) {
  const url = `https://portal.femo.kz/api/payments/participant/dashboard/${id}/download/`
  const token = localStorage.getItem('access_token')

  authorizedFetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Ошибка при загрузке файла')
      }
      return response.blob()
    })
    .then((blob) => {
      const link = document.createElement('a')
      link.href = window.URL.createObjectURL(blob)
      link.download = `payment_${id}.pdf` // исправлено
      document.body.appendChild(link)
      link.click()
      link.remove()
    })
    .catch((error) => {
      alert(`Ошибка: ${error.message}`)
    })
}
/**
 * Инициация оплаты олимпиады.
 * При клике на «Оплатить участие» вызывается payOlympiad(id).
 * Отправляет POST на /pay/[id]/ и в ответе ждёт pg_redirect_url,
 * затем открывает платёжное окно.
 */
async function payOlympiad(olympiadId) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Требуется авторизация. Пожалуйста, войдите.')
    return
  }

  // Открываем пустое окно заранее, чтобы браузер не блокировал
  const payWindow = window.open('', '_blank')
  if (!payWindow) {
    alert('Не удалось открыть окно оплаты. Проверьте блокировщик попапов.')
    return
  }
  payWindow.document.write('<p>Подготовка к оплате...</p>')

  try {
    const response = await authorizedFetch(
      `https://portal.femo.kz/api/payments/participant/dashboard/pay/${olympiadId}/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({})  // если API требует дополнительные поля — добавьте их здесь
      }
    )

    const result = await response.json()
    if (response.ok && result.pg_redirect_url) {
      // Перенаправляем окно на платёжную страницу
      payWindow.location.href = result.pg_redirect_url
    } else {
      // Закрываем окно и показываем ошибку
      payWindow.close()
      const errText = result.detail || result.error || 'Не удалось инициировать платёж'
      alert(errText)
    }
  } catch (err) {
    console.error('Ошибка при запросе оплаты:', err)
    payWindow.close()
    alert('Произошла ошибка при инициации оплаты.')
  }
}


async function submitProfileUpdate() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    alert('Токен не найден')
    return false
  }

  try {
    const form = document.querySelector('form')

    const body = {
      id: Number(form.querySelector('input[name="id"]').value),
      email: form.querySelector('input[name="email"]').value,
      full_name_ru: form.querySelector('input[name="fullname_ru"]').value,
      full_name_en: form.querySelector('input[name="fullname_en"]').value,
      image: document.getElementById('imagePreview').src,
      country: {
        code: 'KZ', // или получай из скрытого поля
        name: form.querySelector('input[name="country"]').value
      },
      city: form.querySelector('input[name="city"]').value,
      school: form.querySelector('input[name="school"]').value,
      grade: reverseGrade(form.querySelector('input[name="class"]').value),
      parent: {
        name_ru: form.querySelector('input[name="parent_name"]').value,
        name_en: form.querySelector('input[name="parent_name_en"]').value || null,
        phone_number: form.querySelector('input[name="parent_phone"]').value
      },
      teacher: {
        name_ru: form.querySelector('input[name="teacher_name"]').value,
        name_en: form.querySelector('input[name="teacher_name_en"]').value || null,
        phone_number: form.querySelector('input[name="teacher_phone"]').value
      }
    }

    const response = await authorizedFetch('http://portal.femo.kz/users/participant/profile/', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) return false

    return true

  } catch (err) {
    console.error('Ошибка при отправке данных:', err)
    return false
  }
}


function reverseGrade(number) {
  const map = {
    '1': 'first',
    '2': 'second',
    '3': 'third',
    '4': 'fourth',
    '5': 'fifth',
    '6': 'sixth',
    '7': 'seventh',
    '8': 'eighth',
    '9': 'ninth',
    '10': 'tenth',
    '11': 'eleventh'
  }
  return map[number] || ''
}


function toggleModal(id) {
  const modal = document.getElementById(id)
  if (modal) {
    modal.classList.toggle('hidden')
  }
}
