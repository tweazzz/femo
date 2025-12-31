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
// безопасный геттер элементов (используй везде при необходимости)
function getWinLoseElements() {
  return {
    winInfo: document.getElementById('win-info'),
    loseInfo: document.getElementById('lose-info'),
    winTextContainer: document.getElementById('win-info-text'),
    loseTextContainer: document.getElementById('lose-info-text')
  };
}
function getLevelLabel(level) {
  const langRaw = localStorage.getItem('lang') || 'ru';
  const lang = langRaw === 'kk' ? 'kz' : langRaw;

  const LEVEL_MAP = {
    ru: {
      easy: 'Лёгкий',
      medium: 'Средний',
      hard: 'Сложный',
    },
    kz: {
      easy: 'Оңай',
      medium: 'Орташа',
      hard: 'Қиын',
    },
    en: {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
    },
  };

  return LEVEL_MAP[lang]?.[level] || level;
}
/**
 * Показывает/скрывает win/lose баннеры и подставляет реальные очки.
 * Принимает либо объект task (с полями solved, points, status, correct)
 * либо результат отправки (с поля correct, points).
 */
// Новая, безопасная версия
function updateResultBanners(obj = {}) {
  const { winInfo, loseInfo, winTextContainer } = getWinLoseElements();

  // если элементов нет — не падаем, просто логируем
  if (!winInfo || !loseInfo) {
    console.warn('updateResultBanners: win/lose elements not found in DOM');
    return;
  }

  // сначала обязательно удалим preload-hidden (если он есть),
  // чтобы CSS не мешал отображению
  winInfo.classList.remove('preload-hidden');
  loseInfo.classList.remove('preload-hidden');

  // скрываем по умолчанию
  winInfo.style.display = 'none';
  loseInfo.style.display = 'none';

  // Нормализуем solved
  const solved = Boolean(obj.solved || obj.is_solved || obj.correct || (obj.status === 'Отправлено' && obj.solved)) || false;

  let correct = null;
  if (typeof obj.correct === 'boolean') correct = obj.correct;
  else if (typeof obj.is_correct === 'boolean') correct = obj.is_correct;
  else if (typeof obj.points === 'number') correct = obj.points > 0;
  else if (typeof obj.base_points === 'number') correct = obj.base_points > 0;
  else if (typeof obj.awarded_points === 'number') correct = obj.awarded_points > 0;

  if (!solved) return;

  if (correct === true) {
    const xp = obj.points ?? obj.awarded_points ?? obj.base_points ?? 0;

    const xpEl = document.getElementById('win-info-xp');
    if (xpEl) xpEl.textContent = `+ ${xp} XP`;

    winInfo.style.display = 'flex';
    loseInfo.style.display = 'none';

    // 🔥 обязательно применяем перевод
    if (typeof applyTranslations === 'function') {
      applyTranslations(window.i18nDict || {});
    }

    return;
  }

  if (correct === false) {
    // убедимся, что текст перевода на месте (если нужен)
    loseInfo.style.display = 'flex';
    winInfo.style.display = 'none';
    return;
  }

  // если не определили correct — оставляем оба скрытыми
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

const languageMap = {
  ru: 'Русский',
  kk: 'Казахский',
  en: 'Английский',
  es: 'Испанский',
  de: 'Немецкий',
  az: 'Азербайджанский',
  ka: 'Грузинский'
};

// --- ЗАМЕНА: безопасная версия loadTaskDetails() ---
async function loadTaskDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const taskid = urlParams.get('id');
  const datalang = urlParams.get('lang');

  if (!taskid || !datalang) {
    console.error('Не указан id или lang задачи в URL');
    return;
  }

  const endpoint = `https://portal.femo.kz/api/assignments/participant/dashboard/${encodeURIComponent(taskid)}/olympiad/detail/?language=${encodeURIComponent(datalang)}`;

  try {
    // token: сначала пробуем access_token (старое место), иначе читаем из user.tokens.access
    const token = localStorage.getItem('access_token') || (JSON.parse(localStorage.getItem('user') || 'null')?.tokens?.access);
    if (!token) {
      console.warn('Токен не найден в localStorage');
      return;
    }

    const response = await authorizedFetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Ошибка при получении задачи: ${response.status}`);
    }

    const data = await response.json();
    console.log('Задача (detail) с API:', data);

    // Нормализуем ответ в массив задач:
    // - если API вернул массив -> используем его
    // - если API вернул { results: [...] } -> используем results
    // - если API вернул единичный объект -> поместим его в массив [obj]
    if (Array.isArray(data)) {
      tasks = data;
    } else if (data && Array.isArray(data.results)) {
      tasks = data.results;
    } else if (data && typeof data === 'object') {
      tasks = [data];
    } else {
      tasks = [];
    }

    // Отображаем первую задачу, если есть
    if (tasks.length > 0) {
      currentTaskIndex = 0;
      renderTaskByIndex(0);
      renderPagination();
      updateNavButtons();
    } else {
      // Если задач нет — покажем сообщение пользователю
      const mainContainer = document.getElementById('task-main') || document.querySelector('main');
      if (mainContainer) {
        mainContainer.insertAdjacentHTML('afterbegin', `
          <div class="col-span-full flex items-center justify-center rounded-2xl p-8 text-center text-gray-500">
            No task data available for this id / language
          </div>
        `);
      }
    }

    // Отображаем язык человекочитаемо
    const langEl = document.getElementById('task-language');
    if (langEl) {
      langEl.textContent = languageMap[datalang] || datalang;
    }
  } catch (err) {
    console.error('Ошибка загрузки задачи:', err);
  }
}
// --- конец замены ---


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
  if (taskGradeEl) {
  if (task.grade) {
    taskGradeEl.innerHTML = `
      ${task.grade} <span data-i18n="task.grade"> класс</span>
    `;
  } else {
    taskGradeEl.innerHTML = '';
  }
}

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

  const levelText = getLevelLabel(task.level);
  const levelClass = levelClassMap[task.level] || 'text-gray-500 bg-gray-100';

  const levelEl = document.getElementById('task-level');
  levelEl.textContent = levelText;
  levelEl.className = `${levelClass} border-default rounded-xl px-2 py-0.5 text-sm`;


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

// // Пагинация
// function renderPagination() {
//   const pagination = document.getElementById('pagination');
//   if (!pagination || tasks.length === 0) return;

//   pagination.innerHTML = '';

//   const totalPages = tasks.length;
//   const maxPagesToShow = 5;

//   let start = Math.max(0, currentTaskIndex - 2);
//   let end = Math.min(totalPages, start + maxPagesToShow);

//   if (end - start < maxPagesToShow) {
//     start = Math.max(0, end - maxPagesToShow);
//   }

//   for (let i = start; i < end; i++) {
//     const btn = document.createElement('button');
//     btn.textContent = i + 1;

//     btn.className =
//       i === currentTaskIndex
//         ? 'px-3 py-1 bg-orange-500 text-white rounded'
//         : 'px-3 py-1 bg-gray-200 rounded hover:bg-gray-300';

//     btn.onclick = () => {
//       currentTaskIndex = i;
//       renderTaskByIndex(i);
//       renderPagination();
//       updateNavButtons(); // ← ВАЖНО
//     };

//     pagination.appendChild(btn);
//   }
// }

// function showNextTask() {
//   if (currentTaskIndex < tasks.length - 1) {
//     currentTaskIndex++;
//     renderTaskByIndex(currentTaskIndex);
//     renderPagination();
//     updateNavButtons();
//   }
// }

// function showPrevTask() {
//   if (currentTaskIndex > 0) {
//     currentTaskIndex--;
//     renderTaskByIndex(currentTaskIndex);
//     renderPagination();
//     updateNavButtons();
//   }
// }

// function updateNavButtons() {
//   const prevBtn = document.getElementById('prevTaskBtn');
//   const nextBtn = document.getElementById('nextTaskBtn');

//   if (!prevBtn || !nextBtn) return;

//   // Предыдущая
//   if (currentTaskIndex === 0) {
//     prevBtn.disabled = true;
//     prevBtn.className =
//       'task-btn';
//   } else {
//     prevBtn.disabled = false;
//     prevBtn.className =
//       'task-btn';
//   }

//   // Следующая
//   if (currentTaskIndex === tasks.length - 1) {
//     nextBtn.disabled = true;
//     nextBtn.className =
//       'task-btn';
//   } else {
//     nextBtn.disabled = false;
//     nextBtn.className =
//       'next-task-btn';
//   }
// }

document.getElementById('nextTaskBtn')
  ?.addEventListener('click', showNextTask);

document.getElementById('prevTaskBtn')
  ?.addEventListener('click', showPrevTask);


function renderAttachments(task) {
  const attachmentsContainer = document.getElementById('task-attachments');
  if (!attachmentsContainer) {
    console.warn('renderAttachments: element #task-attachments не найден');
    return;
  }

  attachmentsContainer.innerHTML = '';

  // Оранжевая иконка (строка SVG)
  const fileSvg = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.33203 18.3334H13.6654C15.3222 18.3334 16.6654 16.9903 16.6654 15.3334V8.04655C16.6654 7.17078 16.2827 6.33873 15.6177 5.76878L11.6746 2.38898C11.1309 1.92292 10.4384 1.66675 9.72226 1.66675H6.33203C4.67518 1.66675 3.33203 3.00989 3.33203 4.66675V15.3334C3.33203 16.9903 4.67517 18.3334 6.33203 18.3334Z" stroke="#F4891E" stroke-linejoin="round"/>
    <path d="M10.832 2.0834V4.66674C10.832 5.77131 11.7275 6.66674 12.832 6.66674H16.2487" stroke="#F4891E" stroke-linejoin="round"/>
    <path d="M6.66406 15.8335H13.3307" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 8.3335V13.3335" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7.5 10.8335L10 13.3335L12.5 10.8335" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>

  `;

  // Собираем все URL файлов в один массив:
  const urls = [];

  // 1) attachments (если массив)
  if (Array.isArray(task?.attachments) && task.attachments.length) {
    task.attachments.forEach(a => {
      const url = a?.file_url || a?.url || a?.file || null;
      if (url) urls.push(url);
    });
  }

  // 2) одиночное поле task.file (если есть) — поддерживаем относительный путь
  if (task?.file) {
    const f = String(task.file);
    urls.push(f);
  }

  // Ничего не найдено — просто выходим (ничего не показываем)
  if (urls.length === 0) {
    // ничего не вставляем (пользователь просил не показывать блок, если нет файлов)
    return;
  }

  // Для каждого URL — нормализуем и отрисуем
  urls.forEach(raw => {
    const url = String(raw).startsWith('http') ? raw : `https://portal.femo.kz${raw}`;
    const fileName = decodeURIComponent((url.split('/').pop()) || 'Файл');

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'flex items-center gap-2 text-[#F4891E] hover:underline mt-2';

    a.innerHTML = `
      ${fileSvg}
      <span class="text-sm font-medium">${fileName}</span>
    `;

    attachmentsContainer.appendChild(a);
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

  const endpoint = `https://portal.femo.kz/api/assignments/participant/dashboard/${taskId}/olympiad/submit/`;

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
      const { winInfo, loseInfo } = getWinLoseElements();
      if (winInfo) winInfo.classList.remove('preload-hidden');
      if (loseInfo) loseInfo.classList.remove('preload-hidden');

      if (winInfo) winInfo.style.display = 'none';
      if (loseInfo) loseInfo.style.display = 'flex';

    }

  } catch (err) {
    console.error('Ошибка при отправке:', err);
    const { winInfo, loseInfo } = getWinLoseElements();
    if (winInfo) winInfo.classList.remove('preload-hidden');
    if (loseInfo) loseInfo.classList.remove('preload-hidden');

    if (winInfo) winInfo.style.display = 'none';
    if (loseInfo) loseInfo.style.display = 'flex';
  }
});