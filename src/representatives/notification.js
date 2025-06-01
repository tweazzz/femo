// ==============================
// notification.js: чистый код
// ==============================

// 1) Метаданные (иконки + цвета) по типу уведомления
function getNotificationMeta(type) {
  switch (type) {
    case 'Chats':
      return {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"
                   fill="currentColor" class="size-5">
                 <path d="M3.505 2.365A41.369 41.369 0 0 1 9 2
                           c1.863 0 3.697.124 5.495.365
                           1.247.167 2.18 1.108 2.435 2.268
                           a4.45 4.45 0 0 0-.577-.069
                           43.141 43.141 0 0 0-4.706 0
                           C9.229 4.696 7.5 6.727 7.5 8.998
                           v2.240c0 1.413.670 2.735 1.760 3.562
                           l-2.980 2.980A.750.750 0 0 1 5 17.250
                           v-3.443c-.501-.048-1-.106-1.495-.172
                           C2.033 13.438 1 12.162 1 10.720V5.280
                           c0-1.441 1.033-2.717 2.505-2.914Z"/>
                 <path d="M14 6c-.762 0-1.520.020-2.271.062
                           C10.157 6.148 9 7.472 9 8.998
                           v2.240c0 1.519 1.147 2.839 2.710 2.935
                           .214.013.428.024.642.034
                           .200.009.385.090.518.224l2.350 2.350
                           a.750.750 0 0 0 1.280-.531v-2.070
                           c1.453-.195 2.500-1.463 2.500-2.915
                           V8.998c0-1.526-1.157-2.850-2.729-2.936
                           A41.645 41.645 0 0 0 14 6Z"/>
               </svg>`,
        bg: 'bg-orange-secondary',
        fg: 'text-orange-primary',
        hover: 'hover:bg-orange-secondary'
      };
    case 'Results':
      return {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                   fill="currentColor" class="size-6">
                 <path d="M4.260 10.147a60.438 60.438 0 0 0-.491 6.347
                           A48.620 48.620 0 0 1 12 20.904
                           a48.620 48.620 0 0 1 8.232-4.410
                           a60.460 60.460 0 0 0-.491-6.347
                           m-15.482 0a50.636 50.636 0 0 0-2.658-.813
                           A59.906 59.906 0 0 1 12 3.493
                           a59.903 59.903 0 0 1 10.399 5.840
                           c-.896.248-1.783.520-2.658.814
                           m-15.482 0A50.717 50.717 0 0 1 12 13.489
                           a50.702 50.702 0 0 1 7.740-3.342
                           M6.750 15a.750.750 0 1 0 0-1.500
                           a.750.750 0 0 0 0 1.500Z"/>
               </svg>`,
        bg: 'bg-blue-secondary',
        fg: 'text-blue-primary',
        hover: ''
      };
    case 'Users':
      return {
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                   fill="currentColor" class="size-6">
                    <path d="M4.500 6.375a4.125 4.125 0 1 1 8.250 0
                              4.125 4.125 0 0 1-8.250 0Z
                              M14.250 8.625a3.375 3.375 0 1 1 6.750 0
                              3.375 3.375 0 0 1-6.750 0Z
                              M1.500 19.125a7.125 7.125 0 0 1 14.250 0
                              v.003l-.001.119a.750.750 0 0 1-.363.630
                              13.067 13.067 0 0 1-6.761 1.873
                              c-2.472 0-4.786-.684-6.760-1.873
                              a.750.750 0 0 1-.364-.630l-.001-.122Z
                              M17.250 19.128l-.001.144a2.250 2.250 0 0 1-.233.960
                              10.088 10.088 0 0 0 5.060-1.010
                              .750.750 0 0 0 .420-.643
                              4.875 4.875 0 0 0-6.957-4.611
                              8.586 8.586 0 0 1 1.710 5.157v.003Z"/>
                  </svg>`,
        bg: 'bg-blue-secondary',
        fg: 'text-blue-primary',
        hover: ''
      };
    default:
      return {
        icon: '',
        bg: 'bg-gray-200',
        fg: 'text-gray-600',
        hover: ''
      };
  }
}

// 2) Утилита «сколько назад», теперь корректно обрабатывает дни, месяцы, годы
function timeAgo(iso) {
  const now = new Date();
  const date = new Date(iso);
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 60) {
    return `${diffMinutes} мин назад`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ч назад`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays} дн назад`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} мес назад`;
  }

  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} г назад`;
}

// 3) Функция-инициализатор табов
function initPopupTabs() {
  const modal = document.getElementById('modalNotification');
  if (!modal) return;

  const links = modal.querySelectorAll('.tabs > .tabs-link');
  const panels = modal.querySelectorAll('.tabs-notification');

  // Если нет активного, ставим «all»
  if (!modal.querySelector('.tabs-link.active')) {
    const defaultLink = modal.querySelector('.tabs-link[data-tab="all"]');
    if (defaultLink) defaultLink.classList.add('active');
  }

  // Сначала скрываем все
  panels.forEach(panel => panel.style.display = 'none');

  // Показываем активный
  const activeLink = modal.querySelector('.tabs-link.active');
  if (activeLink) {
    const tabName = activeLink.dataset.tab;
    const targetPanel = modal.querySelector(`.tabs-notification[data-tab="${tabName}"]`);
    if (targetPanel) targetPanel.style.display = 'block';
  }

  // Перенавешиваем слушатели
  links.forEach(link => {
    link.replaceWith(link.cloneNode(true));
  });

  const newLinks = modal.querySelectorAll('.tabs > .tabs-link');
  newLinks.forEach(link => {
    link.addEventListener('click', () => {
      newLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const tabName = link.dataset.tab;
      panels.forEach(panel => {
        panel.style.display = (panel.dataset.tab === tabName) ? 'block' : 'none';
      });
    });
  });
}

// 4) Функция, обновляющая попап по массиву уведомлений
function updatePopupNotifications(nots) {
  const modal = document.getElementById('modalNotification');
  if (!modal) return;

  const tabMap = { Chats: 'chats', Users: 'users', Results: 'results' };
  const buckets = {
    all: [...nots],
    users: [],
    chats: [],
    results: []
  };

  nots.forEach(n => {
    const key = tabMap[n.type_display];
    if (key) buckets[key].push(n);
  });

  // Русская локализация для типа
  function localizeType(type) {
    if (type === 'Chats') return 'Чаты';
    if (type === 'Users') return 'Пользователи';
    if (type === 'Results') return 'Результаты';
    return type;
  }

  // Обновляем счётчики
  modal.querySelectorAll('.tabs > .tabs-link').forEach(link => {
    const ct = link.dataset.tab;
    const span = link.querySelector('.count-msg');
    if (span) span.textContent = (buckets[ct] || []).length;
  });

  // Отрисовываем уведомления
  const panels = modal.querySelectorAll('.tabs-notification');
  panels.forEach(panel => {
    const ct = panel.dataset.tab;
    panel.innerHTML = '';
    (buckets[ct] || []).forEach(n => {
      const { icon, fg, bg, hover } = getNotificationMeta(n.type_display);
      const typeRu = localizeType(n.type_display);
      const timeText = timeAgo(n.created_at);
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
              <span>${timeText}</span> |
              <span>${typeRu}</span>
            </p>
          </div>
        </div>
      `);
    });
  });
}

// 5) Основная IIFE: открываем WS и связываем все вместе
;(function connectNotifications() {
  const token = localStorage.getItem('access_token');
  if (!token) return;
  if (window.notificationSocket?.readyState === WebSocket.OPEN) return;

  window.notificationSocket = new WebSocket(`wss://portal.gradients.academy/ws/notifications/?token=${token}`);
  const socket = window.notificationSocket;

  socket.addEventListener('open', () => console.log('WS открыт'));

  socket.addEventListener('message', evt => {
    let data;
    try { data = JSON.parse(evt.data); }
    catch { return; }
    const nots = Array.isArray(data.latest_notifications) ? data.latest_notifications : [];

    // Обновляем блок вверху страницы (если он есть)
    const block = document.getElementById('notifications-block');
    if (block) {
      block.innerHTML = '';
      nots.forEach(n => {
        const { icon, fg, bg, hover } = getNotificationMeta(n.type_display);
        const typeRu = n.type_display === 'Chats'
                     ? 'Чаты' : n.type_display === 'Users'
                     ? 'Пользователи' : n.type_display === 'Results'
                     ? 'Результаты' : n.type_display;
        const timeText = timeAgo(n.created_at);
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
                <span>${timeText}</span> |
                <span>${typeRu}</span>
              </p>
            </div>
          </div>
        `);
      });
    }

    // Обновляем содержимое попапа
    updatePopupNotifications(nots);
  });

  socket.addEventListener('close', () => {
    window.notificationSocket = null;
    setTimeout(connectNotifications, 5000);
  });

  socket.addEventListener('error', e => {
    socket.close();
  });
})();

// 6) Инициализация и события после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modalNotification');
  if (!modal) return;

  modal.querySelectorAll('.tabs-notification').forEach(panel => panel.innerHTML = '');
  initPopupTabs();

  document.addEventListener('click', function(e) {
    const notification = e.target.closest('#modalNotification .notification-item');
    if (notification && notification.dataset.type === 'Chats') {
      window.location.href = 'chat.html';
    }
  });
});

// 7) Функция открытия/закрытия модалки + оверлей
function toggleModal(id) {
  const modal = document.getElementById(id);
  modal.classList.toggle('hidden');

  const overlay = document.getElementById('overlayModal');
  overlay.classList.toggle('hidden');

  if (!modal.classList.contains('hidden')) {
    initPopupTabs();
  }
}
