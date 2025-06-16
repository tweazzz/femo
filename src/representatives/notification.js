// ==============================
// notification.js: чистый код
// ==============================

// 1) Метаданные (иконки + цвета) по типу уведомления
function getNotificationMeta(type) {
  switch (type) {
    case 'Chats':
      return {
        icon: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#FEF6ED"/>
        <path d="M21.3922 20.0251L21.7172 22.6584C21.8005 23.3501 21.0589 23.8334 20.4672 23.4751L16.9755 21.4001C16.5922 21.4001 16.2172 21.3751 15.8505 21.3251C16.4672 20.6001 16.8339 19.6834 16.8339 18.6917C16.8339 16.3251 14.7839 14.4084 12.2505 14.4084C11.2839 14.4084 10.3922 14.6834 9.65053 15.1667C9.62553 14.9584 9.61719 14.7501 9.61719 14.5334C9.61719 10.7417 12.9089 7.66675 16.9755 7.66675C21.0422 7.66675 24.3339 10.7417 24.3339 14.5334C24.3339 16.7834 23.1755 18.7751 21.3922 20.0251Z" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16.8346 18.6917C16.8346 19.6834 16.468 20.6001 15.8513 21.3251C15.0263 22.3251 13.718 22.9667 12.2513 22.9667L10.0763 24.2584C9.70964 24.4834 9.24297 24.1751 9.29297 23.7501L9.5013 22.1084C8.38463 21.3334 7.66797 20.0917 7.66797 18.6917C7.66797 17.2251 8.45131 15.9334 9.65131 15.1668C10.393 14.6834 11.2846 14.4084 12.2513 14.4084C14.7846 14.4084 16.8346 16.3251 16.8346 18.6917Z" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        `,
      };
    case 'Results':
      return {
        icon: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#F5EDFD"/>
        <path d="M13.2263 17.6667H9.33464C8.41797 17.6667 7.66797 18.4167 7.66797 19.3334V24.3334H13.2263V17.6667Z" stroke="#8324E3" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M17.1085 14.3333H14.8835C13.9668 14.3333 13.2168 15.0833 13.2168 15.9999V24.3333H18.7751V15.9999C18.7751 15.0833 18.0335 14.3333 17.1085 14.3333Z" stroke="#8324E3" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M22.6671 20.1667H18.7754V24.3334H24.3337V21.8334C24.3337 20.9167 23.5837 20.1667 22.6671 20.1667Z" stroke="#8324E3" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16.4325 7.7251L16.8742 8.60843C16.9325 8.73343 17.0909 8.85009 17.2242 8.86676L18.0242 9.0001C18.5325 9.08343 18.6575 9.45841 18.2909 9.81675L17.6659 10.4417C17.5575 10.5501 17.4992 10.7501 17.5325 10.8918L17.7075 11.6584C17.8492 12.2668 17.5242 12.5001 16.9909 12.1834L16.2409 11.7418C16.1075 11.6584 15.8825 11.6584 15.7492 11.7418L14.9992 12.1834C14.4659 12.5001 14.1409 12.2668 14.2825 11.6584L14.4575 10.8918C14.4909 10.7501 14.4325 10.5417 14.3242 10.4417L13.7075 9.82509C13.3409 9.45842 13.4575 9.09175 13.9742 9.00841L14.7742 8.8751C14.9075 8.8501 15.0659 8.73344 15.1242 8.61677L15.5659 7.73341C15.8075 7.25008 16.1909 7.2501 16.4325 7.7251Z" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        `,
      };
    case 'Users':
      return {
        icon: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#F0F7FD"/>
        <path d="M13.6341 15.0584C13.5508 15.0501 13.4508 15.0501 13.3591 15.0584C11.3758 14.9917 9.80078 13.3667 9.80078 11.3667C9.80078 9.32508 11.4508 7.66675 13.5008 7.66675C15.5424 7.66675 17.2008 9.32508 17.2008 11.3667C17.1924 13.3667 15.6174 14.9917 13.6341 15.0584Z" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19.6747 9.33325C21.2914 9.33325 22.5914 10.6416 22.5914 12.2499C22.5914 13.8249 21.3414 15.1083 19.7831 15.1666C19.7164 15.1583 19.6414 15.1583 19.5664 15.1666" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9.46758 18.1333C7.45091 19.4833 7.45091 21.6833 9.46758 23.0249C11.7592 24.5583 15.5176 24.5583 17.8092 23.0249C19.8259 21.6749 19.8259 19.4749 17.8092 18.1333C15.5259 16.6083 11.7676 16.6083 9.46758 18.1333Z" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21.2832 22.6667C21.8832 22.5417 22.4499 22.3001 22.9165 21.9417C24.2165 20.9667 24.2165 19.3584 22.9165 18.3834C22.4582 18.0334 21.8999 17.8001 21.3082 17.6667" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        `,
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
