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
  const user = await ensureUserAuthenticated();
  if (!user) return;

  let profile;
  try {
    profile = await loadUserProfile();
  } catch (e) {
    console.error(e);
    return;
  }
  renderUserInfo(profile);

  const answerInput = document.getElementById('answer-input');
  const submitBtn1  = document.getElementById('submit-button1');
  const submitBtn2  = document.getElementById('submit-button2');
  const clearButton = document.getElementById('clear-button');

  if (!answerInput || !submitBtn1 || !submitBtn2 || !clearButton) {
    console.error('Не найдены необходимые элементы: input/кнопки.');
    return;
  }

  const hasValue = answerInput.value.trim() !== '';
  submitBtn1.hidden  = !hasValue;   // показываем если есть текст
  submitBtn2.hidden  = hasValue;    // показываем если пусто
  clearButton.hidden = !hasValue;   // показываем при наличии текста

  answerInput.addEventListener('input', () => {
    const filled = answerInput.value.trim() !== '';
    submitBtn1.hidden  = !filled;
    submitBtn2.hidden  = filled;
    clearButton.hidden = !filled;
  });
});

const answerInput = document.getElementById('answer-input');
const clearButton = document.getElementById('clear-button');
const submitBtn1 = document.getElementById('submit-button1');
const submitBtn2 = document.getElementById('submit-button2');
const winInfo = document.getElementById('win-info');
const loseInfo = document.getElementById('lose-info');


let currentTaskIndex = 0; // текущая задача
let tasks = []; // массив задач из API

async function loadTaskDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const olympiadId = urlParams.get('olympiadId');
  const datalang = urlParams.get('lang');

  if (!olympiadId || !datalang) {
    console.error('Не указан id или lang задачи в URL');
    return;
  }

  const endpoint = `https://portal.femo.kz/api/olympiads/participant/dashboard/${olympiadId}/assignments/?language=${datalang}`;

  try {
    const token = JSON.parse(localStorage.getItem('user'))?.tokens?.access;

    const response = await authorizedFetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Ошибка при получении задачи');
    }

    const data = await response.json();
    console.log('Задачи с API:', data);

    // Сохраняем массив задач в глобальную переменную
    tasks = Array.isArray(data) ? data : [];

    // Отображаем первую задачу
    if (tasks.length > 0) {
      currentTaskIndex = 0;
      renderTaskByIndex(currentTaskIndex);
    }

  } catch (err) {
    console.error('Ошибка загрузки задачи:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadTaskDetails();
});


// Рендер задачи по индексу
function renderTaskByIndex(index) {
  if (!tasks || tasks.length === 0 || index < 0 || index >= tasks.length) return;

  const task = tasks[index];

  // Название с ID
  const taskTitleEl = document.getElementById('task-title');
  const taskTitle2El = document.getElementById('task-title2');
  if (taskTitleEl) taskTitleEl.textContent = `#${task.id} ${task.title}`;
  if (taskTitle2El) taskTitle2El.textContent = `#${task.id} ${task.title}`;

  // Класс и описание
  const taskGradeEl = document.getElementById('task-grade');
  const taskDescEl = document.getElementById('task-description');
  if (taskGradeEl) taskGradeEl.textContent = task.grade ? `${task.grade} класс` : '';
  if (taskDescEl) taskDescEl.textContent = task.description || `#${task.id} ${task.title}`;

  // Вложения
  if (typeof renderAttachments === 'function') renderAttachments(task);

  // Уровень сложности
  const levelMap = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };
  const levelClassMap = {
    easy: 'text-green-primary bg-green-secondary',
    medium: 'text-orange-primary bg-orange-secondary',
    hard: 'text-red-primary bg-red-secondary'
  };

  const levelEl = document.getElementById('task-level');
  if (levelEl) {
    levelEl.textContent = levelMap[task.level] || task.level || '';
    levelEl.className = `${levelClassMap[task.level] || 'text-gray-500 bg-gray-100'} border-default rounded-xl px-2 py-0.5 text-sm`;
  }

  // Очки и бонусы
  const pointsEl = document.getElementById('task-points');
  const xp = task.points ?? task.awarded_points ?? task.base_points ?? 0;
  if (pointsEl) {
    pointsEl.innerHTML = `
      <span class="font-bold">${xp} XP</span>
      <img src="/src/assets/images/coin.png" alt="coin" class="inline h-4 w-4 ms-1 mb-[.125rem]">
    `;
    pointsEl.className = 'text-orange-primary bg-orange-secondary border-default rounded-xl px-2 py-0.5 text-sm flex items-center';
  }

  const bonusEl = document.getElementById('task-bonus');
  if (bonusEl) {
    bonusEl.innerHTML = `<span class="font-bold">15 XP</span> <img src="/src/assets/images/coin.png" alt="coin" class="inline h-4 w-4 ms-1 mb-[.125rem]">`;
    bonusEl.className = 'text-blue-primary bg-blue-secondary border-default rounded-xl px-2 py-0.5 text-sm flex items-center';
  }

  // Статус
  const statusEl = document.getElementById('task-status');
  if (statusEl) {
    statusEl.textContent = task.status || '';
    statusEl.className = `${levelClassMap[task.status] || 'text-gray-primary bg-gray-secondary'} border-default rounded-xl px-2 py-0.5 text-sm`;
  }

  // Форма и кнопки
  const answerLabel = document.querySelector('#answer-input')?.closest('label');
  const submitBtn1 = document.getElementById('submit-button1');
  const submitBtn2 = document.getElementById('submit-button2');
  const clearButton = document.getElementById('clear-button');
  const nextTaskLink = document.getElementById('next-task-button2');
  const winInfo = document.getElementById('win-info');
  const loseInfo = document.getElementById('lose-info');

  // Сначала скрываем баннеры
  if (winInfo) winInfo.style.display = 'none';
  if (loseInfo) loseInfo.style.display = 'none';

  if (task.solved) {
    if (answerLabel) answerLabel.style.display = 'none';
    if (submitBtn1) submitBtn1.style.display = 'none';
    if (submitBtn2) submitBtn2.style.display = 'none';
    if (clearButton) clearButton.style.display = 'none';
    if (nextTaskLink) nextTaskLink.style.display = 'flex';
    if (typeof updateResultBanners === 'function') updateResultBanners(task);
  } else {
    if (answerLabel) answerLabel.style.display = '';
    if (submitBtn1) submitBtn1.style.display = 'flex';
    if (submitBtn2) submitBtn2.style.display = 'flex';
    if (clearButton) clearButton.style.display = 'flex';
    if (nextTaskLink) nextTaskLink.style.display = 'none';
  }
}

// Пагинация
function showNextTask() {
  if (currentTaskIndex < tasks.length - 1) {
    currentTaskIndex++;
    renderTaskByIndex(currentTaskIndex);
  }
}

function showPrevTask() {
  if (currentTaskIndex > 0) {
    currentTaskIndex--;
    renderTaskByIndex(currentTaskIndex);
  }
}

// Инициализация с данными
async function loadTasks(data) {
  tasks = Array.isArray(data) ? data : [];
  currentTaskIndex = 0;
  renderTaskByIndex(currentTaskIndex);
}

document.getElementById('nextTaskBtn')?.addEventListener('click', showNextTask);
document.getElementById('prevTaskBtn')?.addEventListener('click', showPrevTask);


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