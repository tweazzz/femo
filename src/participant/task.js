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

/**
 * Показывает/скрывает win/lose баннеры и подставляет реальные очки.
 * Принимает либо объект task (с полями solved, points, status, correct)
 * либо результат отправки (с поля correct, points).
 */
function updateResultBanners(obj = {}) {
  // guard: элементы должны быть в DOM
  if (!winInfo || !loseInfo) return;

  // Скрываем по умолчанию
  winInfo.style.display = 'none';
  loseInfo.style.display = 'none';

  // Нормализуем solved: если явного поля нет, считаем решённым по correct:true либо по тому что obj.points > 0
  const solved = Boolean(obj.solved || obj.is_solved || obj.correct || obj.status === 'Отправлено' && obj.solved) || false;

  // Если пришёл объект с correct=false (и/или solved true) — будем учитывать это
  let correct = null;
  if (typeof obj.correct === 'boolean') correct = obj.correct;
  else if (typeof obj.is_correct === 'boolean') correct = obj.is_correct;
  else if (typeof obj.points === 'number') correct = obj.points > 0;
  else if (typeof obj.base_points === 'number') correct = obj.base_points > 0;
  // ещё запасные поля
  else if (typeof obj.awarded_points === 'number') correct = obj.awarded_points > 0;

  // Если нет признака solved — не показываем ничего
  if (!solved) return;

  // Если корректность определена — показываем соответствующий баннер
  if (correct === true) {
    // вычислим XP (источник правды: points -> awarded_points -> base_points)
    const xp = (obj.points ?? obj.awarded_points ?? obj.base_points ?? 0);

    // Обновим внутренний текст аккуратно (чтобы сохранить тег <strong id="win-info-xp">)
    const winText = `Ты победил(а)! Ответ верный и вовремя — ты получаешь <strong id="win-info-xp">+${xp} XP</strong>`;
    const winTextContainer = winInfo.querySelector('span') || winInfo;
    winTextContainer.innerHTML = winText;

    // Обновим modal текст если есть
    const modalXP = document.getElementById('modal-xp');
    if (modalXP) modalXP.textContent = `Ответ верный и вовремя — ты получаешь +${xp} XP`;

    winInfo.style.display = 'flex';
    loseInfo.style.display = 'none';
    return;
  }

  if (correct === false) {
    // Показываем "неправильно"
    winInfo.style.display = 'none';
    loseInfo.style.display = 'flex';
    return;
  }

  // Если не определили correctness (редкий случай) — оставляем оба скрытыми
  console.debug('updateResultBanners: cannot determine correctness', { solved, correct, obj });
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
      await loadTaskMock()
      document.querySelectorAll('.preload-hidden').forEach(el => el.classList.remove('preload-hidden'));
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }


  // Скрыть кнопку очистки при загрузке
  const clearButton = document.getElementById('clear-button');
  if (clearButton) clearButton.style.display = 'none';


  const hasValue = answerInput.value.trim() !== '';
  submitBtn1.style.display = hasValue ? 'flex' : 'none';
  submitBtn2.style.display = hasValue ? 'none' : 'flex';
})

const answerInput = document.getElementById('answer-input');
const clearButton = document.getElementById('clear-button');
const submitBtn1 = document.getElementById('submit-button1');
const submitBtn2 = document.getElementById('submit-button2');
const winInfo = document.getElementById('win-info');
const loseInfo = document.getElementById('lose-info');


async function loadTaskDetails() {
  const urlParams = new URLSearchParams(window.location.search)
  const taskId = urlParams.get('id')
  const source = urlParams.get('source') // 'daily' или 'general'

  if (!taskId || !source) {
    console.error('Не указан id или source задачи в URL')
    return
  }

  const endpoint = `https://portal.femo.kz/api/assignments/participant/dashboard/41/${source}`

  try {
    const token = JSON.parse(localStorage.getItem('user'))?.tokens?.access
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) throw new Error('Ошибка при получении задачи')

    const task = await response.json()
    console.log(task)
    renderTask(task)
  } catch (err) {
    console.error('Ошибка загрузки задачи:', err)
  }
}

function renderTask(task) {
  document.querySelector('h2.text-2xl').textContent = task.title
  document.querySelector('p.text-gray-600').textContent = `${task.grade} класс`
  const descriptionEl = document.querySelector('.text.border-gray-border')
  descriptionEl.innerHTML = `<p>${task.description}</p>`

  const deadlineEl = document.querySelector('.text-primary')
  const deadlineDate = new Date(task.deadline)
  deadlineEl.textContent = deadlineDate.toLocaleString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  const timeLeftEl = document.querySelector('.timer')
  timeLeftEl.innerHTML = `<span class="border-default bg-orange-secondary rounded-sm p-2.5">${task.time_left}</span>`

  const levelMap = {
    easy: 'Лёгкий',
    medium: 'Средний',
    hard: 'Сложный',
  }
  document.querySelector('.d-level').textContent = levelMap[task.level] || task.level

  document.querySelectorAll('.text-gray-primary + span')[0].textContent = `${task.base_points} XP 🟢`
  document.querySelectorAll('.text-gray-primary + span')[1].textContent = `${task.bonus_points} XP 🔵`

  const statusEl = document.querySelector('.card.archive')
  if (statusEl) statusEl.textContent = task.status

  const attachmentsContainer = document.querySelector('.space-y-3')
  attachmentsContainer.innerHTML = ''
  task.attachments.forEach(file => {
    const link = document.createElement('a')
    link.href = file.url
    link.className = 'text-orange-primary flex items-center gap-2'
    link.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      ${file.name}
    `
    attachmentsContainer.appendChild(link)
  })
}


async function loadTaskMock() {

  const urlParams = new URLSearchParams(window.location.search);
  const taskId = urlParams.get('id');
  const source = urlParams.get('source'); // 'daily' или 'general'

  const endpoint = `https://portal.femo.kz/api/assignments/participant/dashboard/${taskId}/${source}`;

  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }

  try {
    const response = await authorizedFetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Ошибка при получении задачи');

    const task = await response.json();
    console.log(task)

    // Проставляем данные в DOM
    document.getElementById('task-title').textContent = task.title;
    document.getElementById('task-title2').textContent = task.title;
    document.getElementById('task-grade').textContent = `${task.grade} класс`;
    document.getElementById('task-description').textContent = task.description;

    renderAttachments(task);

    const levelMap = {
      easy: 'Лёгкий',
      medium: 'Средний',
      hard: 'Сложный',
    };

    const levelClassMap = {
      easy: 'text-green-primary bg-green-secondary',
      medium: 'text-orange-primary bg-orange-secondary',
      hard: 'text-red-primary bg-red-secondary',
    }

    const StatusClassMap = {
      'Не отправлено': 'text-gray-primary bg-gray-secondary',
      'Завершено': 'text-green-primary bg-green-secondary',
    }

    const levelText = levelMap[task.level] || task.level;
    const levelClass = levelClassMap[task.level] || 'text-gray-500 bg-gray-100';

    const levelEl = document.getElementById('task-level');
    levelEl.textContent = levelText;
    levelEl.className = `${levelClass} border-default rounded-xl px-2 py-0.5 text-sm`;

    // Универсальное вычисление XP (работает для daily и general)
    const xp = (task.points ?? task.awarded_points ?? task.base_points ?? 0);

    const pointsEl = document.getElementById('task-points');
    pointsEl.innerHTML = `
      <span class="font-bold">${xp} XP</span>
      <img src="/src/assets/images/coin.png" alt="coin" class="inline h-4 w-4 ms-1 mb-[.125rem]">
    `;
    pointsEl.className = 'text-orange-primary bg-orange-secondary border-default rounded-xl px-2 py-0.5 text-sm flex items-center';


    const bonusEl = document.getElementById('task-bonus');
    bonusEl.innerHTML = `<span class="font-bold">15 XP</span> <img src="/src/assets/images/coin.png" alt="coin" class="inline h-4 w-4 ms-1 mb-[.125rem]">`;
    bonusEl.className = 'text-blue-primary bg-blue-secondary border-default rounded-xl px-2 py-0.5 text-sm flex items-center';

    const statusText = task.status
    const statusClass = levelClassMap[task.status]
    const statusEl = document.getElementById('task-status');
    statusEl.textContent = statusText;
    statusEl.className = `${statusClass} border-default rounded-xl px-2 py-0.5 text-sm`;

    // Сначала скрываем оба баннера
    winInfo.style.display = 'none';
    loseInfo.style.display = 'none';

    // Скрываем/показываем элементы формы в зависимости от solved
    if (task.solved) {
      // если уже решено — прячем форму и показываем результат (win/lose) по данным backend
      const answerLabel = document.querySelector('#answer-input')?.closest('label');
      const submit2Button = document.getElementById('submit-button2');
      const nextTaskLink  = document.getElementById('next-task-button2');

      if (answerLabel) answerLabel.style.display = 'none';
      if (submit2Button) submit2Button.style.display = 'none';
      if (nextTaskLink) nextTaskLink.style.display = 'flex';

      // прячем кнопки ввода
      if (submitBtn1) submitBtn1.style.display = 'none';
      if (submitBtn2) submitBtn2.style.display = 'none';
      if (clearButton) clearButton.style.display = 'none';

      // Покажем баннер по данным task (points, correct и т.д.)
      updateResultBanners(task);
    } else {
      // не решено — показываем форму, скрываем ссылку "следующая задача"
      const answerLabel = document.querySelector('#answer-input')?.closest('label');
      const submit2Button = document.getElementById('submit-button2');
      const nextTaskLink  = document.getElementById('next-task-button2');

      if (answerLabel) answerLabel.style.display = '';
      if (submit2Button) submit2Button.style.display = 'flex';
      if (nextTaskLink) nextTaskLink.style.display = 'none';

      // прячем оба баннера
      winInfo.style.display = 'none';
      loseInfo.style.display = 'none';
    }



    window.taskPoints = task.points;

        // Селекторы элементов
    const answerLabel   = document.querySelector('#answer-input').closest('label');
    const submit2Button = document.getElementById('submit-button2');
    const nextTaskLink  = document.getElementById('next-task-button2');
    
    if (task.solved) {
      // если уже решено — прячем форму и вторую кнопку и показываем ссылку «Перейти к следующей задаче»
      loseInfo.style.display      = 'none';
      answerLabel.style.display   = 'none';
      submit2Button.style.display = 'none';
      nextTaskLink.style.display  = 'flex';
    } else {
      // иначе — показываем форму и кнопку, прячем ссылку
      answerLabel.style.display   = '';
      submit2Button.style.display = 'flex';
      nextTaskLink.style.display  = 'none';
    }

  } catch (err) {
    console.error('Ошибка загрузки задачи:', err);
  }
}

function renderAttachments(task) {
  const attachmentsContainer = document.getElementById('task-attachments');
  if (!attachmentsContainer) return;

  attachmentsContainer.innerHTML = '';

  // SVG как строка
  const fileSvg = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
         xmlns="http://www.w3.org/2000/svg">
      <path d="M6.33301 18.3334H13.6663C15.3232 18.3334 16.6663 16.9903
               16.6663 15.3334V8.04655C16.6663 7.17078 16.2837 6.33873
               15.6187 5.76878L11.6756 2.38898C11.1319 1.92292 10.4394
               1.66675 9.72324 1.66675H6.33301C4.67615 1.66675 3.33301
               3.00989 3.33301 4.66675V15.3334C3.33301 16.9903 4.67615
               18.3334 6.33301 18.3334Z"
            stroke="#F4891E" stroke-linejoin="round"/>
      <path d="M10.833 2.0835V4.66683C10.833 5.7714 11.7284 6.66683
               12.833 6.66683H16.2497"
            stroke="#F4891E" stroke-linejoin="round"/>
      <path d="M6.66602 15.8335H13.3327"
            stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 8.3335V13.3335"
            stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7.5 10.8335L10 13.3335L12.5 10.8335"
            stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  // НОРМАЛИЗАЦИЯ
  const files = Array.isArray(task?.attachments) ? task.attachments : [];

  // Если вложений нет — просто выходим
  if (files.length === 0) return;

  files.forEach(file => {
    // безопасная обработка URL
    const url = file?.file_url || file?.url;
    if (!url) return;

    const fileName = decodeURIComponent(url.split('/').pop() || 'Файл');

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.className = 'flex items-center gap-2 text-[#F4891E] hover:underline';

    link.innerHTML = `
      ${fileSvg}
      <span>${fileName}</span>
    `;

    attachmentsContainer.appendChild(link);
  });
}



// Показывать/скрывать кнопку очистки при вводе
answerInput.addEventListener('input', () => {
  if (answerInput.value.trim() !== '') {
    clearButton.style.display = 'inline-flex';
  } else {
    clearButton.style.display = 'none';
  }

  const hasValue = answerInput.value.trim() !== '';
  submitBtn1.style.display = hasValue ? 'flex' : 'none';
  submitBtn2.style.display = hasValue ? 'none' : 'flex';


});

// Очистка поля и скрытие кнопки
clearButton.addEventListener('click', () => {
  answerInput.value = '';
  clearButton.style.display = 'none';

  // Скрыть оранжевую кнопку, показать серую
  submitBtn1.style.display = 'none';
  submitBtn2.style.display = 'flex';
});


submitBtn1.addEventListener('click', async () => {
  const answer = answerInput.value.trim();
  if (!answer) return;
    // Скрываем старую ошибку
  const errorEl = document.getElementById('answer-error');
  errorEl.style.display = 'none';

  const urlParams = new URLSearchParams(window.location.search);
  const taskId = urlParams.get('id');
  const source = urlParams.get('source'); // 'daily' или 'general'

  const endpoint = `https://portal.femo.kz/api/assignments/participant/dashboard/${taskId}/${source}/submit/`;

  const token = localStorage.getItem('access_token');
  if (!token) {
    alert('Токен не найден. Пожалуйста, войдите заново.');
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ 'answer': answer }),
    });

    // if (!response.ok) throw new Error('Ошибка при отправке ответа');

    const result = await response.json();

    if (!response.ok) {
      // Если ответ 400 и detail говорит про некорректный формат
      if (result.detail === 'Invalid numeric answer.') {
        errorEl.textContent = 'Ответ должен быть цифрой';
        errorEl.style.display = 'block';
        return;
      }
      // Другая ошибка — кидаем исключение
      throw new Error(result.detail || `Ошибка ${response.status}`);
    }
    if (result.correct) {
      // Успешный ответ — выключаем кнопки/форму
      if (submitBtn1) submitBtn1.style.display = 'none';
      if (submitBtn2) submitBtn2.style.display = 'none';
      if (clearButton) clearButton.style.display = 'none';

      // Обновляем баннеры и modal по результату от сервера
      // Результат может иметь поля: correct (bool), points (number)
      updateResultBanners(Object.assign({}, result, { solved: true }));

      // Добавим навигацию на кнопку "Перейти к следующей задаче" в модалке
      const nextTaskBtn = document.getElementById('next-task-button');
      if (nextTaskBtn) {
        nextTaskBtn.addEventListener('click', () => {
          window.location.href = '/participant/tasks.html';
        });
      }

      // Открыть модалку (там текст modal-xp уже обновлён в updateResultBanners if modal-xp exists)
      toggleModal('modal');
    } else {
      // Неверный ответ
      winInfo.style.display = 'none';
      loseInfo.style.display = 'flex';
    }

  } catch (err) {
    console.error('Ошибка при отправке:', err);
    alert('Ошибка при отправке ответа.');
    // Неверный ответ
    winInfo.style.display = 'none';
    loseInfo.style.display = 'block';
  }
});
