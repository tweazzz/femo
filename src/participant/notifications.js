// notification.js

// 1) Метаданные (иконки) по type_display
function getNotificationMeta(type) {
  switch (type) {
    case 'Users':
      return {
        icon: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="32" height="32" rx="16" fill="#F0F7FD"/>
<path d="M16.1341 15.0584C16.0508 15.0501 15.9508 15.0501 15.8591 15.0584C13.8758 14.9917 12.3008 13.3667 12.3008 11.3667C12.3008 9.32508 13.9508 7.66675 16.0008 7.66675C18.0424 7.66675 19.7008 9.32508 19.7008 11.3667C19.6924 13.3667 18.1174 14.9917 16.1341 15.0584Z" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M11.9676 18.1333C9.95091 19.4833 9.95091 21.6833 11.9676 23.0249C14.2592 24.5583 18.0176 24.5583 20.3092 23.0249C22.3259 21.6749 22.3259 19.4749 20.3092 18.1333C18.0259 16.6083 14.2676 16.6083 11.9676 18.1333Z" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
        fg: 'text-blue-primary', bg: 'bg-blue-secondary', hover: ''
      };
    case 'Payments':
      return {
        icon: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="32" height="32" rx="16" fill="#F0F7FD"/>
<path d="M16.1341 15.0584C16.0508 15.0501 15.9508 15.0501 15.8591 15.0584C13.8758 14.9917 12.3008 13.3667 12.3008 11.3667C12.3008 9.32508 13.9508 7.66675 16.0008 7.66675C18.0424 7.66675 19.7008 9.32508 19.7008 11.3667C19.6924 13.3667 18.1174 14.9917 16.1341 15.0584Z" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M11.9676 18.1333C9.95091 19.4833 9.95091 21.6833 11.9676 23.0249C14.2592 24.5583 18.0176 24.5583 20.3092 23.0249C22.3259 21.6749 22.3259 19.4749 20.3092 18.1333C18.0259 16.6083 14.2676 16.6083 11.9676 18.1333Z" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
        fg: 'text-blue-primary', bg: 'bg-blue-secondary', hover: ''
      };
    case 'Olympiads':
      return {
        icon: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="32" height="32" rx="16" fill="#F5EDFD"/>
<path d="M12.668 7.66675V10.1667" stroke="#8324E3" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M19.332 7.66675V10.1667" stroke="#8324E3" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M8.91797 13.575H23.0846" stroke="#8324E3" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M23.5 13.0834V20.1667C23.5 22.6667 22.25 24.3334 19.3333 24.3334H12.6667C9.75 24.3334 8.5 22.6667 8.5 20.1667V13.0834C8.5 10.5834 9.75 8.91675 12.6667 8.91675H19.3333C22.25 8.91675 23.5 10.58341 23.5 13.0834Z" stroke="#8324E3" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M19.0781 17.4167H19.0856" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M19.0781 19.9167H19.0856" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M15.9961 17.4167H16.0036" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M15.9961 19.9167H16.0036" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M12.9121 17.4167H12.9196" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M12.9121 19.9167H12.9196" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
        fg: 'text-violet-primary', bg: 'bg-violet-secondary', hover: ''
      };
    case 'Tasks':
      return {
        icon: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="32" height="32" rx="16" fill="#F5EDFD"/>
<path d="M16.3086 13.3999H20.6836" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M11.3164 13.3999L11.9414 14.0249L13.8164 12.1499" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M16.3086 19.2334H20.6836" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M11.3164 19.2334L11.9414 19.8584L13.8164 17.9834" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M13.5013 24.3334H18.5013C22.668 24.3334 24.3346 22.6667 24.3346 18.5001V13.5001C24.3346 9.33341 22.668 7.66675 18.5013 7.66675H13.5013C9.33464 7.66675 7.66797 9.33341 7.66797 13.5001V18.5001C7.66797 22.6667 9.33464 24.3334 13.5013 24.3334Z" stroke="#8324E3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
        fg: 'text-violet-primary', bg: 'bg-violet-secondary', hover: ''
      };
    default:
      return { icon: '', fg: 'text-gray-600', bg: 'bg-gray-200', hover: '' };
  }
}

// 2) «Сколько назад»
function timeAgo(iso) {
  const now = new Date();
  const date = new Date(iso);
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} дн назад`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} мес назад`;
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} г назад`;
}

// 3) Инициализатор вкладок: просто показывает панель, соответствующую активной .tabs-link
function initPopupTabs() {
  const modal = document.getElementById('modalNotification');
  if (!modal) return;
  const links = modal.querySelectorAll('.tabs > .tabs-link');
  const panels = modal.querySelectorAll('.tabs-content > .tabs-notification');
  // Найти активную
  let activeLink = modal.querySelector('.tabs > .tabs-link.active');
  if (!activeLink) {
    activeLink = modal.querySelector('.tabs > .tabs-link[data-tab="all"]');
    if (activeLink) activeLink.classList.add('active');
  }
  const activeTab = activeLink?.dataset.tab;
  panels.forEach(panel => {
    if (panel.dataset.tab === activeTab) {
      panel.style.display = 'block';
    } else {
      panel.style.display = 'none';
    }
  });
  // Навешиваем слушатель на вкладки (заменяем клоны, чтобы не дублировать)
  links.forEach(link => {
    const newLink = link.cloneNode(true);
    link.replaceWith(newLink);
  });
  const newLinks = modal.querySelectorAll('.tabs > .tabs-link');
  newLinks.forEach(link => {
    link.addEventListener('click', () => {
      newLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const tabKey = link.dataset.tab;
      panels.forEach(panel => {
        panel.style.display = (panel.dataset.tab === tabKey) ? 'block' : 'none';
      });
    });
  });
}

// 4) Заполнить панели заново, без дублирования
function updatePopupNotifications(nots) {
  const modal = document.getElementById('modalNotification');
  if (!modal) return;
  // Группировка
  const buckets = {
    all: [...nots],
    olympiads: [],
    tasks: [],
    profile: []
  };
  nots.forEach(n => {
    const t = n.type_display;
    if (t === 'Olympiads') buckets.olympiads.push(n);
    else if (t === 'Tasks') buckets.tasks.push(n);
    else if (t === 'Users' || t === 'Payments') buckets.profile.push(n);
    else buckets.tasks.push(n);
  });
  // Обновляем счётчики в вкладках
  modal.querySelectorAll('.tabs > .tabs-link').forEach(link => {
    const ct = link.dataset.tab;
    const span = link.querySelector('.count-msg');
    if (!span) return;
    let count = 0;
    if (ct === 'all') count = buckets.all.length;
    else if (ct === 'olympiads') count = buckets.olympiads.length;
    else if (ct === 'tasks') count = buckets.tasks.length;
    else if (ct === 'profile') count = buckets.profile.length;
    span.textContent = count;
  });
  // Перестроить панели:
  const content = modal.querySelector('.tabs-content');
  if (!content) return;
  content.innerHTML = '';
  ['all','olympiads','tasks','profile'].forEach(tabKey => {
    const panel = document.createElement('div');
    panel.className = 'tabs-notification';
    panel.dataset.tab = tabKey;
    content.appendChild(panel);
    const arr = buckets[tabKey];
    if (!arr || arr.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-gray-primary text-sm py-4 text-center';
      p.textContent = 'Нет уведомлений';
      panel.appendChild(p);
    } else {
      arr.forEach(n => {
        const { icon, fg, bg, hover } = getNotificationMeta(n.type_display);
        const typeRu = (n.type_display === 'Users' ? 'Пользователи'
          : n.type_display === 'Payments' ? 'Платежи'
          : n.type_display === 'Olympiads' ? 'Олимпиады'
          : n.type_display === 'Tasks' ? 'Задачи'
          : n.type_display);
        const timeText = timeAgo(n.created_at);
        const html = `
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
        </div>`;
        panel.insertAdjacentHTML('beforeend', html);
      });
    }
  });
  // Снова инициализировать вкладки, чтобы корректно показать активную
  initPopupTabs();
}

// 5) WebSocket
(function connectNotifications() {
  const token = localStorage.getItem('access_token');
  if (!token) return;
  if (window.notificationSocket?.readyState === WebSocket.OPEN) return;
  window.notificationSocket = new WebSocket(`wss://portal.gradients.academy/ws/notifications/?token=${token}`);
  const socket = window.notificationSocket;
  socket.addEventListener('open', () => console.log('WS уведомлений открыт'));
  socket.addEventListener('message', evt => {
    let data;
    try { data = JSON.parse(evt.data); }
    catch { return; }
    const nots = Array.isArray(data.latest_notifications) ? data.latest_notifications : [];
    updatePopupNotifications(nots);
  });
  socket.addEventListener('close', () => {
    window.notificationSocket = null;
    setTimeout(connectNotifications, 5000);
  });
  socket.addEventListener('error', () => {
    socket.close();
  });
})();

// 6) После загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  initPopupTabs();
  // Клик по overlay закрывает
  const overlay = document.getElementById('overlayModal');
  overlay?.addEventListener('click', () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    overlay.classList.add('hidden');
    document.body.style.overflow = 'auto';
  });
  // Можно навесить клики по notification-item, если нужен переход
  const modal = document.getElementById('modalNotification');
  modal?.addEventListener('click', function(e) {
    const item = e.target.closest('.notification-item');
    if (item && !e.target.closest('a')) {
      const type = item.dataset.type?.toLowerCase();
      let href = '#';

      if (type === 'olympiads') {
        href = '/participant/olympiads.html';
      } else if (type === 'users' || type === 'payments') {
        href = '/participant/my-way.html';
      } else if (type === 'tasks') {
        href = '/participant/tasks.html';
      }

      window.location.href = href;
    }
  });

});

// 7) toggleModal
function toggleModal(id) {
  const modal = document.getElementById(id);
  const overlay = document.getElementById('overlayModal');
  if (!modal || !overlay) return;
  modal.classList.toggle('hidden');
  overlay.classList.toggle('hidden');
  if (!modal.classList.contains('hidden')) {
    document.body.style.overflow = 'hidden';
    initPopupTabs();
  } else {
    document.body.style.overflow = 'auto';
  }
}
window.toggleModal = toggleModal;
