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

function renderUserInfo(user) {
  const avatarEl = document.getElementById('user-avatar')
  const nameEl = document.getElementById('user-name')
  const roleEl = document.getElementById('user-role')
  const welcomeEl = document.querySelector('h1.text-xl')

  const imgPath = user.profile.image
  avatarEl.src = imgPath.startsWith('http')
    ? imgPath
    : `https://portal.gradients.academy${imgPath}`

  nameEl.textContent = user.profile.full_name_ru
  const firstName = user.profile.full_name_ru.split(' ')[0]
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`

  const roleMap = {
    participant: 'Участник',
  }
  roleEl.textContent = roleMap[user.profile.role] || user.profile.role
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user)

  try {
      await loadTaskMock()
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

  const endpoint = `https://portal.gradients.academy/api/assignments/participant/dashboard/41/${source}`

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

  const endpoint = `https://portal.gradients.academy/api/assignments/participant/dashboard/${taskId}/${source}`;

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

    const attachmentsContainer = document.getElementById('task-attachments');
    attachmentsContainer.innerHTML = '';
    task.attachments.forEach(file => {
      const link = document.createElement('a');
      link.href = file.url;
      link.textContent = file.name;
      link.target = '_blank';
      attachmentsContainer.appendChild(link);
      attachmentsContainer.appendChild(document.createElement('br'));
    });

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

    const pointsEl = document.getElementById('task-points');
    pointsEl.innerHTML = `<span class="font-bold">${task.points} XP</span> <img src="/src/assets/images/coin.png" alt="coin" class="inline h-4 w-4 ms-1 mb-[.125rem]">`;
    pointsEl.className = 'text-orange-primary bg-orange-secondary border-default rounded-xl px-2 py-0.5 text-sm flex items-center';

    const bonusEl = document.getElementById('task-bonus');
    bonusEl.innerHTML = `<span class="font-bold">${task.points} XP</span> <img src="/src/assets/images/coin.png" alt="coin" class="inline h-4 w-4 ms-1 mb-[.125rem]">`;
    bonusEl.className = 'text-blue-primary bg-blue-secondary border-default rounded-xl px-2 py-0.5 text-sm flex items-center';

    const statusText = task.status
    const statusClass = levelClassMap[task.status]
    const statusEl = document.getElementById('task-status');
    statusEl.textContent = statusText;
    statusEl.className = `${statusClass} border-default rounded-xl px-2 py-0.5 text-sm`;

    if (task.status === 'Не отправлено') {
      winInfo.style.display = 'none';
      loseInfo.style.display = 'none';
    } else if (task.status === 'Завершена') {
      winInfo.style.display = 'block';
      loseInfo.style.display = 'none';

      // Скрыть кнопки
      submitBtn1.style.display = 'none';
      submitBtn2.style.display = 'none';
      clearButton.style.display = 'none';
    }

    window.taskPoints = task.points;

  } catch (err) {
    console.error('Ошибка загрузки задачи:', err);
  }
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

  const urlParams = new URLSearchParams(window.location.search);
  const taskId = urlParams.get('id');
  const source = urlParams.get('source'); // 'daily' или 'general'

  const endpoint = `https://portal.gradients.academy/api/assignments/participant/dashboard/${taskId}/${source}/submit/`;

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

    if (!response.ok) throw new Error('Ошибка при отправке ответа');

    const result = await response.json();

    if (result.correct) {
      // Успешный ответ
      winInfo.style.display = 'block';
      loseInfo.style.display = 'none';

      // Скрыть кнопки
      submitBtn1.style.display = 'none';
      submitBtn2.style.display = 'none';
      clearButton.style.display = 'none';

      const modalXP = document.getElementById('modal-xp');
      if (modalXP) {
        modalXP.textContent = `Ответ верный и вовремя — ты получаешь +${window.taskPoints * 2} XP`;
      }

      const nextTaskBtn = document.getElementById('next-task-button');
      if (nextTaskBtn) {
        nextTaskBtn.addEventListener('click', () => {
          window.location.href = '/participant/tasks.html';
        });
      }

      // Открыть модалку
      toggleModal('modal');
    } else {
      // Неверный ответ
      winInfo.style.display = 'none';
      loseInfo.style.display = 'block';
    }

  } catch (err) {
    console.error('Ошибка при отправке:', err);
    alert('Ошибка при отправке ответа.');
    // Неверный ответ
    winInfo.style.display = 'none';
    loseInfo.style.display = 'block';
  }
});
