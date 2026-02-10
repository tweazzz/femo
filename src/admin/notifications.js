// notifications.js

// Предполагается:
// - ensureUserAuthenticated(): async возвращает user или null.
// - В localStorage есть 'access_token'.
// - Основной контейнер: <div class="space-y-4 pr-2 pb-4"></div>
// - Popup-модал с overlay и .tabs, .tabs-content внутри.

document.addEventListener('DOMContentLoaded', async () => {
  // Аутентификация
  const user = await ensureUserAuthenticated();
  if (!user) return;

  const token = localStorage.getItem('access_token');
  if (!token) {
    console.error('Access token not found');
    return;
  }

  // Селекторы
  const mainContainer = document.querySelector('div.space-y-4.pr-2.pb-4');
  if (!mainContainer) {
    console.warn('Основной контейнер для уведомлений не найден');
  }
  const overlay = document.getElementById('overlayModal');
  const modal = document.getElementById('modalNotification');
  if (!overlay || !modal) {
    console.warn('Overlay или modal не найдены');
  }
  const tabsContainer = modal?.querySelector('.tabs');
  const tabsContent = modal?.querySelector('.tabs-content');
  if (!tabsContainer || !tabsContent) {
    console.warn('В модале не найдены .tabs или .tabs-content');
  }



  // Храним все уведомления
  let allNotifications = [];

  // WebSocket
  const ws = new WebSocket(`wss://portal.femo.kz/ws/notifications/?token=${token}`);
  ws.addEventListener('open', () => console.log('WebSocket подключен'));
  ws.addEventListener('error', err => console.error('WebSocket ошибка:', err));
  ws.addEventListener('close', () => console.log('WebSocket закрыт'));
  ws.addEventListener('message', event => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.error('Некорректный JSON из WebSocket:', err);
      return;
    }
    const notes = data.latest_notifications || [];
    allNotifications = notes;
    // Рендер в основной блок
    if (mainContainer) renderContainer(mainContainer, allNotifications);
    // Рендер в popup
    rebuildTabsAndContent();
  });

  // Утилиты

  function timeAgo(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'несколько секунд назад';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin === 1 ? '1 минуту назад' : `${diffMin} минут назад`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return diffH === 1 ? '1 час назад' : `${diffH} часов назад`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 30) return diffD === 1 ? '1 день назад' : `${diffD} дней назад`;
    const diffM = Math.floor(diffD / 30);
    if (diffM < 12) return diffM === 1 ? '1 месяц назад' : `${diffM} месяцев назад`;
    const diffY = Math.floor(diffM / 12);
    return diffY === 1 ? '1 год назад' : `${diffY} лет назад`;
  }

  function parseLines(msg) {
    return msg.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  }

  function getIconSVG(type) {
    const map = {
      Requests: {
        svg: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#F0F7FD"/>
        <path d="M13.6341 15.0584C13.5508 15.0501 13.4508 15.0501 13.3591 15.0584C11.3758 14.9917 9.80078 13.3667 9.80078 11.3667C9.80078 9.32508 11.4508 7.66675 13.5008 7.66675C15.5424 7.66675 17.2008 9.32508 17.2008 11.3667C17.1924 13.3667 15.6174 14.9917 13.6341 15.0584Z" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19.6747 9.33325C21.2914 9.33325 22.5914 10.6416 22.5914 12.2499C22.5914 13.8249 21.3414 15.1083 19.7831 15.1666C19.7164 15.1583 19.6414 15.1583 19.5664 15.1666" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9.46563 18.1333C7.44896 19.4833 7.44896 21.6833 9.46563 23.0249C11.7573 24.5583 15.5156 24.5583 17.8073 23.0249C19.824 21.6749 19.824 19.4749 17.8073 18.1333C15.524 16.6083 11.7656 16.6083 9.46563 18.1333Z" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21.2852 22.6667C21.8852 22.5417 22.4518 22.3001 22.9185 21.9417C24.2185 20.9667 24.2185 19.3584 22.9185 18.3834C22.4602 18.0334 21.9018 17.8001 21.3102 17.6667" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        `
      },
      Chats: {
        svg: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#FEF6ED"/>
        <path d="M21.3922 20.0251L21.7172 22.6584C21.8005 23.3501 21.0589 23.8334 20.4672 23.4751L16.9755 21.4001C16.5922 21.4001 16.2172 21.3751 15.8505 21.3251C16.4672 20.6001 16.8339 19.6834 16.8339 18.6917C16.8339 16.3251 14.7839 14.4084 12.2505 14.4084C11.2839 14.4084 10.3922 14.6834 9.65053 15.1667C9.62553 14.9584 9.61719 14.7501 9.61719 14.5334C9.61719 10.7417 12.9089 7.66675 16.9755 7.66675C21.0422 7.66675 24.3339 10.7417 24.3339 14.5334C24.3339 16.7834 23.1755 18.7751 21.3922 20.0251Z" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16.8346 18.6917C16.8346 19.6834 16.468 20.6001 15.8513 21.3251C15.0263 22.3251 13.718 22.9667 12.2513 22.9667L10.0763 24.2584C9.70964 24.4834 9.24297 24.1751 9.29297 23.7501L9.5013 22.1084C8.38463 21.3334 7.66797 20.0917 7.66797 18.6917C7.66797 17.2251 8.45131 15.9334 9.65131 15.1668C10.393 14.6834 11.2846 14.4084 12.2513 14.4084C14.7846 14.4084 16.8346 16.3251 16.8346 18.6917Z" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        `
      },
      Payments: {
        svg: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#F0F7FD"/>
        <path d="M7.66797 13.0874H24.3346" stroke="#459FE3" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M11 19.7542H12.6667" stroke="#459FE3" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14.75 19.7542H18.0833" stroke="#459FE3" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M11.368 8.9209H20.6263C23.593 8.9209 24.3346 9.65423 24.3346 12.5792V19.4209C24.3346 22.3459 23.593 23.0792 20.6346 23.0792H11.368C8.40964 23.0876 7.66797 22.3542 7.66797 19.4292V12.5792C7.66797 9.65423 8.40964 8.9209 11.368 8.9209Z" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        `
      },
      Users: {
        svg: `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#F0F7FD"/>
        <path d="M13.6341 15.0584C13.5508 15.0501 13.4508 15.0501 13.3591 15.0584C11.3758 14.9917 9.80078 13.3667 9.80078 11.3667C9.80078 9.32508 11.4508 7.66675 13.5008 7.66675C15.5424 7.66675 17.2008 9.32508 17.2008 11.3667C17.1924 13.3667 15.6174 14.9917 13.6341 15.0584Z" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19.6747 9.33325C21.2914 9.33325 22.5914 10.6416 22.5914 12.2499C22.5914 13.8249 21.3414 15.1083 19.7831 15.1666C19.7164 15.1583 19.6414 15.1583 19.5664 15.1666" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9.46563 18.1333C7.44896 19.4833 7.44896 21.6833 9.46563 23.0249C11.7573 24.5583 15.5156 24.5583 17.8073 23.0249C19.824 21.6749 19.824 19.4749 17.8073 18.1333C15.524 16.6083 11.7656 16.6083 9.46563 18.1333Z" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21.2852 22.6667C21.8852 22.5417 22.4518 22.3001 22.9185 21.9417C24.2185 20.9667 24.2185 19.3584 22.9185 18.3834C22.4602 18.0334 21.9018 17.8001 21.3102 17.6667" stroke="#459FE3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        `
      }
    };
    return map[type] || { classes: 'text-gray-primary bg-gray-secondary', svg: '' };
  }

  async function handleRequestAction(id, approve) {
    const action = approve ? 'approve' : 'decline';
    const url = `https://portal.femo.kz/api/notifications/${id}/${action}/`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (!resp.ok) {
        console.error(`Ошибка при ${action} уведомления ${id}:`, await resp.text());
      } else {
        console.log(`Уведомление ${id} ${approve ? 'принято' : 'отклонено'}`);
        // Удаляем из all и перерендерим
        allNotifications = allNotifications.filter(n => n.id !== id);
        if (mainContainer) renderContainer(mainContainer, allNotifications);
        rebuildTabsAndContent();
      }
    } catch (err) {
      console.error('Ошибка сети при запросе действий:', err);
    }
  }

  function createNotificationElement(n) {
    const lines = parseLines(n.message);
    const title = n.title;
    const ago = timeAgo(n.created_at);

    const wrap = document.createElement('div');
    wrap.className = 'flex items-start gap-4 rounded-2xl bg-white p-4';
    wrap.dataset.notifId = n.id;

    // Иконка
    const iconInfo = getIconSVG(n.type_display);
    const iconWrapper = document.createElement('span');
    iconWrapper.className = `${iconInfo.classes} rounded-full p-2`;
    iconWrapper.innerHTML = iconInfo.svg;
    wrap.appendChild(iconWrapper);

    // Контент
    const content = document.createElement('div');
    content.className = 'w-full space-y-3';

    // Заголовок + ссылка
    const hdr = document.createElement('div');
    hdr.className = 'flex items-center justify-between';
    const titleP = document.createElement('p');
    titleP.className = 'text-sm font-bold';
    titleP.textContent = title;
    hdr.appendChild(titleP);

    if (n.type_display === 'Requests') {
      let profileHref = '#';
      if (lines.length > 0) {
        const match = lines[0].match(/ID:\s*(\d+)/);
        // if (match) profileHref = `/participants/${match[1]}/profile/`;
      }
      const link = document.createElement('a');
      link.href = profileHref;
      link.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5"><path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>`;
      hdr.appendChild(link);
    } else {
      hdr.appendChild(document.createElement('span'));
    }
    content.appendChild(hdr);

    // Тело
    const body = document.createElement('div');
    body.className = 'bg-white-secondary rounded-2xl p-2 text-sm';
    if (lines.length > 0) {
      const p0 = document.createElement('p');
      p0.textContent = lines[0];
      body.appendChild(p0);
    }
    const changes = n.changes || (n.payload && n.payload.changes);
    const hasChanges = changes && typeof changes === 'object';

    if (lines.length > 1 || hasChanges) {
      const ul = document.createElement('ul');
      ul.className = 'ms-4 mt-1 list-inside list-disc';

      // 1) Строки из message
      if (lines.length > 1) {
        lines.slice(1).forEach(line => {
          const li = document.createElement('li');
          const colonIndex = line.indexOf(':');
          if (colonIndex > -1) {
            const key = line.substring(0, colonIndex + 1);
            const value = line.substring(colonIndex + 1).trim().replace(/→/g, '➜');
            li.innerHTML = `${key} <span class="text-gray-primary">${value}</span>`;
          } else {
            li.textContent = line.replace(/→/g, '➜');
          }
          ul.appendChild(li);
        });
      }

      // 2) Структурированные changes (если есть)
      if (hasChanges) {
        const entries = Array.isArray(changes) ? changes : Object.entries(changes);
        entries.forEach(entry => {
          let field, oldVal, newVal;
          if (Array.isArray(changes)) {
             // [{field:..., old:..., new:...}]
             field = entry.field || entry.name || 'Field';
             oldVal = entry.old || entry.old_value;
             newVal = entry.new || entry.new_value || entry.value;
          } else {
             // { "Field": {old:..., new:...} } или { "Field": "NewValue" }
             field = entry[0];
             const val = entry[1];
             if (val && typeof val === 'object' && ('old' in val || 'new' in val)) {
                 oldVal = val.old;
                 newVal = val.new;
             } else {
                 newVal = val;
             }
          }

          const li = document.createElement('li');
          const valueHtml = oldVal
            ? `${oldVal} ➜ ${newVal}`
            : newVal;
          // Добавляем двоеточие, если его нет в названии поля
          const label = field.endsWith(':') ? field : field + ':';
          li.innerHTML = `${label} <span class="text-gray-primary">${valueHtml}</span>`;
          ul.appendChild(li);
        });
      }

      body.appendChild(ul);
    }
    content.appendChild(body);

    // Кнопки для Requests
    if (n.type_display === 'Requests' && n.actionable) {
      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-4';
      const btnDecline = document.createElement('button');
      btnDecline.className = 'btn-white';
      btnDecline.innerHTML = `<span>✖</span> Отклонить`;
      btnDecline.addEventListener('click', () => handleRequestAction(n.id, false));
      actions.appendChild(btnDecline);
      const btnApprove = document.createElement('button');
      btnApprove.className = 'btn-orange';
      btnApprove.innerHTML = `<span>✔</span> Одобрить`;
      btnApprove.addEventListener('click', () => handleRequestAction(n.id, true));
      actions.appendChild(btnApprove);
      content.appendChild(actions);
    }

    // Футер
    const footer = document.createElement('p');
    footer.className = 'text-gray-primary flex items-center gap-1 text-xs';
    const sectionNameMap = {
      Requests: 'Профиль участника',
      Chats: 'Пользователи',
      Payments: 'Платежи',
      Users: 'Пользователи'
    };
    const sectionName = sectionNameMap[n.type_display] || '';
    footer.innerHTML = `<span>${ago}</span>${sectionName ? ' | ' : ''}${sectionName ? `<span>${sectionName}</span>` : ''}`;
    content.appendChild(footer);

    wrap.appendChild(content);
    // === Добавляем кликабельность всей карточке ===
    // Определяем URL по типу уведомления
    let targetUrl = null;
    if (n.type_display === 'Users' || n.type_display === 'Payments') {
      targetUrl = '/admin/users.html';
    } else if (n.type_display === 'Chats') {
      targetUrl = '/admin/chat.html';
    }
    // Если ссылка задана — включаем навигацию
    if (targetUrl) {
      wrap.style.cursor = 'pointer';
      wrap.addEventListener('click', () => {
        window.location.href = targetUrl;
      });
      // Чтобы клики по кнопкам внутри не «прокатывались» на wrap:
      const buttons = wrap.querySelectorAll('button');
      buttons.forEach(btn => {
      btn.addEventListener('click', e => e.stopPropagation());
      });
    }
    return wrap;
  }

  // Рендер в основной контейнер
  function renderContainer(container, notes) {
    container.innerHTML = '';
    if (notes.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-gray-primary text-sm';
      p.textContent = 'Нет уведомлений';
      container.appendChild(p);
    } else {
      notes.forEach(n => {
        const el = createNotificationElement(n);
        container.appendChild(el);
      });
    }
  }

  // Popup: построение табов
  function rebuildTabsAndContent() {
    if (!tabsContainer || !tabsContent) return;

    // Очищаем
    tabsContainer.innerHTML = '';
    tabsContent.innerHTML = '';

    // Фиксированные вкладки: all, users, requests, payments
    const tabsConfig = [
      { key: 'all', label: 'Все', icon: `<svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.0175 2.92505C7.25914 2.92505 5.01747 5.16672 5.01747 7.92505V10.3334C5.01747 10.8417 4.80081 11.6167 4.54247 12.05L3.58414 13.6417C2.99247 14.625 3.40081 15.7167 4.48414 16.0834C8.07581 17.2834 11.9508 17.2834 15.5425 16.0834C16.5508 15.7501 16.9925 14.5584 16.4425 13.6417L15.4841 12.05C15.2341 11.6167 15.0175 10.8417 15.0175 10.3334V7.92505C15.0175 5.17505 12.7675 2.92505 10.0175 2.92505Z" stroke="currentColor" stroke-miterlimit="10" stroke-linecap="round"/>
      <path d="M11.5599 3.1667C11.3016 3.0917 11.0349 3.03337 10.7599 3.00003C9.9599 2.90003 9.19323 2.95837 8.47656 3.1667C8.71823 2.55003 9.31823 2.1167 10.0182 2.1167C10.7182 2.1167 11.3182 2.55003 11.5599 3.1667Z" stroke="currentColor" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12.5156 16.3833C12.5156 17.7583 11.3906 18.8833 10.0156 18.8833C9.33229 18.8833 8.69896 18.6 8.24896 18.15C7.79896 17.7 7.51562 17.0666 7.51562 16.3833" stroke="currentColor" stroke-miterlimit="10"/>
      </svg>      ` }, // подставьте нужный SVG
      { key: 'users', label: 'Пользователи', icon: `<svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M7.63411 9.55841C7.55078 9.55008 7.45078 9.55008 7.35911 9.55841C5.37578 9.49175 3.80078 7.86675 3.80078 5.86675C3.80078 3.82508 5.45078 2.16675 7.50078 2.16675C9.54245 2.16675 11.2008 3.82508 11.2008 5.86675C11.1924 7.86675 9.61745 9.49175 7.63411 9.55841Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M13.6747 3.83325C15.2914 3.83325 16.5914 5.14159 16.5914 6.74992C16.5914 8.32492 15.3414 9.60825 13.7831 9.66659C13.7164 9.65825 13.6414 9.65825 13.5664 9.66659" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M3.46563 12.6333C1.44896 13.9833 1.44896 16.1833 3.46563 17.5249C5.75729 19.0583 9.51563 19.0583 11.8073 17.5249C13.824 16.1749 13.824 13.9749 11.8073 12.6333C9.52396 11.1083 5.76562 11.1083 3.46563 12.6333Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M15.2852 17.1667C15.8852 17.0417 16.4518 16.8001 16.9185 16.4417C18.2185 15.4667 18.2185 13.8584 16.9185 12.8834C16.4602 12.5334 15.9018 12.3001 15.3102 12.1667" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
</svg>` },
      { key: 'requests', label: 'Олимпиады', icon: `<svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.66797 2.16675V4.66675" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13.332 2.16675V4.66675" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2.91797 8.07495H17.0846" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M17.5 7.58341V14.6667C17.5 17.1667 16.25 18.8334 13.3333 18.8334H6.66667C3.75 18.8334 2.5 17.1667 2.5 14.6667V7.58341C2.5 5.08341 3.75 3.41675 6.66667 3.41675H13.3333C16.25 3.41675 17.5 5.08341 17.5 7.58341Z" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13.0801 11.9167H13.0875" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13.0801 14.4167H13.0875" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M9.99803 11.9167H10.0055" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M9.99803 14.4167H10.0055" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6.91209 11.9167H6.91957" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6.91209 14.4167H6.91957" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      ` },
      { key: 'payments', label: 'Результаты', icon: `<svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.37526 2.60824L3.35859 5.88324C1.75026 6.93324 1.75026 9.28324 3.35859 10.3332L8.37526 13.6082C9.27526 14.1999 10.7586 14.1999 11.6586 13.6082L16.6503 10.3332C18.2503 9.28324 18.2503 6.94157 16.6503 5.89157L11.6586 2.61657C10.7586 2.01657 9.27526 2.01657 8.37526 2.60824Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4.69193 11.3999L4.68359 15.3082C4.68359 16.3666 5.50026 17.4999 6.50026 17.8332L9.15859 18.7166C9.61693 18.8666 10.3753 18.8666 10.8419 18.7166L13.5003 17.8332C14.5003 17.4999 15.3169 16.3666 15.3169 15.3082V11.4416" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M17.832 13V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>` },
    ];

    // Создаём табы
    tabsConfig.forEach((tabConf, idx) => {
      const tabEl = document.createElement('div');
      tabEl.className = 'tabs-link flex cursor-pointer items-center gap-1' + (idx === 0 ? ' active' : '');
      tabEl.dataset.tab = tabConf.key;
      tabEl.innerHTML = `<span>${tabConf.icon}</span> ${tabConf.label} <span class="count-msg"></span>`;
      tabsContainer.appendChild(tabEl);
    });

    // Навешиваем клики
    const tabElems = Array.from(tabsContainer.querySelectorAll('.tabs-link'));
    tabElems.forEach(tabEl => {
      tabEl.addEventListener('click', () => {
        tabElems.forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');
        const sel = tabEl.dataset.tab;
        Array.from(tabsContent.children).forEach(child => {
          child.classList.toggle('hidden', child.dataset.tab !== sel);
        });
      });
    });

    // Создаём контейнеры для содержимого
    tabsConfig.forEach((tabConf, idx) => {
      const cont = document.createElement('div');
      cont.dataset.tab = tabConf.key;
      if (idx !== 0) cont.className = 'hidden'; // первый (all) виден по умолчанию
      tabsContent.appendChild(cont);
    });

    // Заполняем и обновляем счётчики
    updateCountsAndFill();
  }


function updateCountsAndFill() {
  if (!tabsContainer || !tabsContent) return;

  // Подсчёты
  const countByTab = {
    all: allNotifications.length,
    users: 0,
    requests: 0,
    payments: 0
  };
  allNotifications.forEach(n => {
    const t = n.type_display;
    if (t === 'Users' || t === 'Chats') {
      countByTab.users += 1;
    } else if (t === 'Requests') {
      countByTab.requests += 1;
    } else if (t === 'Payments') {
      countByTab.payments += 1;
    }
  });

  // Обновляем счётчики в табах
  const tabElems = Array.from(tabsContainer.querySelectorAll('.tabs-link'));
  tabElems.forEach(tabEl => {
    const key = tabEl.dataset.tab;
    const span = tabEl.querySelector('.count-msg');
    if (span && countByTab.hasOwnProperty(key)) {
      span.textContent = countByTab[key];
    }
  });

  // Заполняем контейнеры
  const contElems = Array.from(tabsContent.children);
  contElems.forEach(cont => {
    const key = cont.dataset.tab;
    cont.innerHTML = '';
    let toRender = [];
    if (key === 'all') {
      toRender = allNotifications;
    } else if (key === 'users') {
      toRender = allNotifications.filter(n => n.type_display === 'Users' || n.type_display === 'Chats');
    } else if (key === 'requests') {
      toRender = allNotifications.filter(n => n.type_display === 'Requests');
    } else if (key === 'payments') {
      toRender = allNotifications.filter(n => n.type_display === 'Payments');
    }
    if (toRender.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-gray-primary text-sm';
      p.textContent = 'EMPTY';
      cont.appendChild(p);
    } else {
      toRender.forEach(n => {
        const el = createNotificationElement(n);
        cont.appendChild(el);
      });
    }
  });
}


  // Если при загрузке уже есть старые уведомления, можно запросить их через REST API,
  // а затем рендерить сразу. Но WebSocket сам при подключении обычно шлёт сразу данные.
});