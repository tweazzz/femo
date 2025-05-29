// 1) Метаданные (иконки + цвета) по типу уведомления
function getNotificationMeta(type) {
  switch (type) {
    case 'Chats':
      return {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
                 <path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 0 1 5 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914Z"/>
                 <path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.147 2.839 2.71 2.935.214.013.428.024.642.034.2.009.385.09.518.224l2.35 2.35a.75.75 0 0 0 1.28-.531v-2.07c1.453-.195 2.5-1.463 2.5-2.915V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0 0 14 6Z"/>
               </svg>`,
        bg: 'bg-orange-secondary',
        fg: 'text-orange-primary',
        hover: 'hover:bg-orange-secondary'
      }
    case 'Results':
      return {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
                 <path d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"/>
               </svg>`,
        bg: 'bg-blue-secondary',
        fg: 'text-blue-primary',
        hover: ''
      }
    case 'Users':
      return {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6">
                    <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z"></path>
                  </svg>`,
        bg: 'bg-blue-secondary',
        fg: 'text-blue-primary',
        hover: ''
      }
    default:
      return { 
        icon: '', 
        bg: 'bg-gray-200', 
        fg: 'text-gray-600',
        hover: ''
      }
  }
}

// 2) Утилита «сколько назад»
function timeAgo(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (minutes < 60) return `${minutes} мин назад`
  return `${Math.floor(minutes/60)} ч назад`
}

// 3) Функция-инициализатор табов
function initPopupTabs() {
  // Сначала скрываем все вкладки контента
  document.querySelectorAll('.tabs-notification').forEach(panel => {
    panel.style.display = 'none';
  });
  
  // Показываем только активную вкладку
  const activePanel = document.querySelector('.tabs-link.active');
  if (activePanel) {
    const tabName = activePanel.dataset.tab;
    const targetPanel = document.querySelector(`.tabs-notification[data-tab="${tabName}"]`);
    if (targetPanel) targetPanel.style.display = 'block';
  }

  document.querySelectorAll('.tabs-link').forEach(link => {
    link.addEventListener('click', () => {
      const tab = link.dataset.tab;
      document.querySelectorAll('.tabs-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      document.querySelectorAll('.tabs-notification').forEach(panel => {
        panel.style.display = panel.dataset.tab === tab ? 'block' : 'none';
      });
    });
  });
}

// 4) Функция, обновляющая попап по массиву уведомлений
function updatePopupNotifications(nots) {
  const tabMap = { Chats: 'olympiads', Users: 'users', Results: 'results' };
  const buckets = {
    all: [...nots],
    users: [],
    olympiads: [],
    results: []
  };

  // Распределяем уведомления по категориям
  nots.forEach(n => {
    const key = tabMap[n.type_display];
    if (key) buckets[key].push(n);
  });

  // Обновляем счетчики
  document.querySelectorAll('.tabs-link').forEach(link => {
    const ct = link.dataset.tab;
    const span = link.querySelector('.count-msg');
    if (span) span.textContent = (buckets[ct] || []).length;
  });

  // Отрисовываем уведомления
  document.querySelectorAll('.tabs-notification').forEach(panel => {
    const ct = panel.dataset.tab;
    panel.innerHTML = ''; // Полностью очищаем вкладку
    
    (buckets[ct] || []).forEach(n => {
      const { icon, fg, bg, hover } = getNotificationMeta(n.type_display);
      panel.insertAdjacentHTML('beforeend', `
        <div class="flex items-start gap-4 rounded-2xl bg-white p-4 mb-2 notification-item ${hover}" 
             data-type="${n.type_display}">
          <span class="${fg} ${bg} rounded-full p-2">${icon}</span>
          <div class="w-full space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-sm font-bold">${n.title}</p>
              <a href="#" class="text-gray-400 hover:text-gray-600">…</a>
            </div>
            <p class="text-gray-primary flex items-center gap-1 text-xs">
              <span>${timeAgo(n.created_at)}</span> |
              <span>${n.type_display}</span>
            </p>
          </div>
        </div>
      `);
    });
  });
}

// 5) Основная IIFE: открываем WS и связываем все вместе
;(function connectNotifications() {
  const token = localStorage.getItem('access_token')
  if (!token) return

  // Если сокет уже существует и открыт, выходим - не создаём новый
  if (window.notificationSocket?.readyState === WebSocket.OPEN) return
  window.notificationSocket = new WebSocket(`wss://portal.gradients.academy/ws/notifications/?token=${token}`)
  const socket = window.notificationSocket

  socket.addEventListener('open', () => console.log('WS открыт'))

  socket.addEventListener('message', evt => {
    let data
    try { data = JSON.parse(evt.data) } catch { return }
    const nots = Array.isArray(data.latest_notifications) ? data.latest_notifications : []

    // Обновляем блок на странице
    const block = document.getElementById('notifications-block')
    if (block) {
      block.innerHTML = ''
      nots.forEach(n => {
        const { icon, fg, bg, hover } = getNotificationMeta(n.type_display)
        block.insertAdjacentHTML('beforeend', `
          <div class="flex items-start gap-4 rounded-2xl bg-white p-4 notification-item ${hover}" 
               data-type="${n.type_display}">
            <span class="${fg} ${bg} rounded-full p-2">${icon}</span>
            <div class="w-full space-y-3">
              <div class="flex items-center justify-between">
                <p class="text-sm font-bold">${n.title}</p>
                <a href="#" class="text-gray-400 hover:text-gray-600">…</a>
              </div>
              <p class="text-gray-primary flex items-center gap-1 text-xs">
                <span>${timeAgo(n.created_at)}</span> |
                <span>${n.type_display}</span>
              </p>
            </div>
          </div>
        `)
      })
    }

    // Обновляем попап
    updatePopupNotifications(nots)
  })

  socket.addEventListener('close', () => {
    window.notificationSocket = null
    console.log('WS закрыт, переподключаемся через 5с')
    setTimeout(connectNotifications, 5000)
  })

  socket.addEventListener('error', e => {
    console.error('WS ошибка:', e)
    socket.close()
  })
})()

// 6) Инициализация и обработка событий
document.addEventListener('DOMContentLoaded', () => {
  // Очищаем все вкладки
  document.querySelectorAll('.tabs-notification').forEach(panel => {
    panel.innerHTML = '';
  });
  
  // Инициализируем табы
  initPopupTabs();

  // Добавляем обработчик клика для уведомлений типа Chats
  document.addEventListener('click', function(e) {
    const notification = e.target.closest('.notification-item');
    if (notification && notification.dataset.type === 'Chats') {
      // Редирект на страницу чата
      window.location.href = 'chat.html';
    }
  });
});

