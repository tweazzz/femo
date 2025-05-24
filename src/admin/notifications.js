// notifications.js

// Ждём, пока DOM загрузится и пользователь будет аутентифицирован
document.addEventListener('DOMContentLoaded', async () => {
  // Убедимся, что пользователь залогинен и token положен в localStorage
  const user = await ensureUserAuthenticated()
  if (!user) return

  const token = localStorage.getItem('access_token')
  if (!token) {
    console.error('Access token not found')
    return
  }

  // Контейнер для уведомлений
  const container = document.querySelector('div.space-y-4.pr-2.pb-4')
  if (!container) {
    console.error('Контейнер для уведомлений не найден')
    return
  }

  // Открываем WebSocket
  const socket = new WebSocket(
    `wss://portal.gradients.academy/ws/notifications/?token=${token}`
  )

  socket.addEventListener('open', () => {
    console.log('WebSocket подключен')
  })

  socket.addEventListener('message', (event) => {
    let data
    try {
      data = JSON.parse(event.data)
    } catch (err) {
      console.error('Некорректный JSON из WebSocket:', err)
      return
    }
    const notes = data.latest_notifications || []
    notes.forEach((n) => {
      const el = createNotificationElement(n)
      // вставляем в начало контейнера
      container.prepend(el)
    })
  })

  socket.addEventListener('error', (err) => {
    console.error('WebSocket ошибка:', err)
  })

  socket.addEventListener('close', () => {
    console.log('WebSocket закрыт')
  })

  // --- Вспомогательные функции ---

  // Форматирует created_at в «N минут назад»
  function timeAgo(dateStr) {
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diffSec = Math.floor((now - then) / 1000)
    if (diffSec < 60) return 'несколько секунд назад'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60)
      return diffMin === 1 ? '1 минуту назад' : `${diffMin} минут назад`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return diffH === 1 ? '1 час назад' : `${diffH} часов назад`
    const diffD = Math.floor(diffH / 24)
    return diffD === 1 ? '1 день назад' : `${diffD} дней назад`
  }

  // Парсит notification.message в массив строк без пустых элементов
  function parseLines(msg) {
    return msg
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  }

  // Создаёт DOM-элемент уведомления в зависимости от type_display
  function createNotificationElement(n) {
    const lines = parseLines(n.message)
    const title = n.title
    const ago = timeAgo(n.created_at)

    // Корневой элемент карточки
    const wrap = document.createElement('div')
    wrap.className = 'flex items-start gap-4 rounded-2xl bg-white p-4 mb-2'

    // Иконка
    const iconWrapper = document.createElement('span')
    iconWrapper.className =
      {
        Requests: 'text-blue-primary bg-blue-secondary',
        Chats: 'text-orange-primary bg-orange-secondary',
        Payments: 'text-blue-primary bg-blue-secondary',
        Users: 'text-blue-primary bg-blue-secondary',
      }[n.type_display] + ' rounded-full p-2'

    // Вставляем нужный SVG
    iconWrapper.innerHTML = {
      Requests: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6"><path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z" /></svg>`,
      Chats: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5"><path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 0 1 5 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914Z"/><path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.147 2.839 2.71 2.935.214.013.428.024.642.034.2.009.385.09.518.224l2.35 2.35a.75.75 0 0 0 1.28-.531v-2.07c1.453-.195 2.5-1.463 2.5-2.915V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0 0 14 6Z"/></svg>`,
      Payments: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5"><path fill-rule="evenodd" d="M2.5 4A1.5 1.5 0 0 0 1 5.5V6h18v-.5A1.5 1.5 0 0 0 17.5 4h-15ZM19 8.5H1v6A1.5 1.5 0 0 0 2.5 16h15a1.5 1.5 0 0 0 1.5-1.5v-6ZM3 13.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm4.75-.75a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" clip-rule="evenodd"/></svg>`,
      Users: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-6"><path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z" /></svg>`,
      Chats: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5"><path d="M3.505 2.365A41.369 41.369 0 0 1 9 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 0 0-.577-.069 43.141 43.141 0 0 0-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 0 1 5 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914Z"/><path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.147 2.839 2.71 2.935.214.013.428.024.642.034.2.009.385.09.518.224l2.35 2.35a.75.75 0 0 0 1.28-.531v-2.07c1.453-.195 2.5-1.463 2.5-2.915V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0 0 14 6Z"/></svg>`,
    }[n.type_display]
    wrap.appendChild(iconWrapper)

    // Контент
    const content = document.createElement('div')
    content.className = 'w-full space-y-3'

    // Заголовок
    const hdr = document.createElement('div')
    hdr.className = 'flex items-center justify-between'
    hdr.innerHTML = `<p class="text-sm font-bold">${title}</p><a href="#"></a>`
    content.appendChild(hdr)

    // Сектор с данными
    const body = document.createElement('div')
    body.className = 'bg-white-secondary rounded-2xl p-2 text-sm'

    // Первая строка всегда имя/ID
    const firstLine = document.createElement('p')
    firstLine.innerHTML = lines[0]
    body.appendChild(firstLine)

    // Остальные строки в список
    const ul = document.createElement('ul')
    ul.className = 'ms-4 mt-1 list-inside list-disc'
    lines.slice(1).forEach((line) => {
      const li = document.createElement('li')

      // Разделяем строку на ключ и значение
      const colonIndex = line.indexOf(':')
      if (colonIndex > -1) {
        const key = line.substring(0, colonIndex + 1)
        const value = line.substring(colonIndex + 1).trim()

        // Обрабатываем стрелки и добавляем стили
        li.innerHTML = `${key} <span class="text-gray-primary">${value.replace(/→/g, '➜')}</span>`
      } else {
        // Для строк без двоеточия просто заменяем стрелки
        li.innerHTML = line.replace(/→/g, '➜')
      }

      ul.appendChild(li)
    })
    body.appendChild(ul)
    content.appendChild(body)

    // Кнопки для Requests
    if (n.type_display === 'Requests') {
      const actions = document.createElement('div')
      actions.className = 'flex items-center gap-4'
      actions.innerHTML = `
        <button class="btn-white">
          <span>✖</span> Отклонить
        </button>
        <button class="btn-orange">
          <span>✔</span> Одобрить
        </button>`
      content.appendChild(actions)
    }

    // Нижняя строка с временем и ссылкой
    const footer = document.createElement('p')
    footer.className = 'text-gray-primary flex items-center gap-1 text-xs'
    footer.innerHTML = `<span>${ago}</span> | <span>${
      {
        Requests: 'Профиль участника',
        Chats: 'Пользователи',
        Payments: 'Платежи',
        Users: 'Пользователи',
      }[n.type_display]
    }</span>`
    content.appendChild(footer)

    wrap.appendChild(content)
    return wrap
  }
})
