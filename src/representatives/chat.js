// chat.js - Управление чатом для представителей

class RepresentativeChat {
  constructor() {
    this.websockets = {
      announcements: null,
      group: null
    }
    this.privateWebsockets = {} // Приватные соединения с администраторами
    this.privateRoomIds = {} // Хранение room_id для каждого приватного чата (profileId -> roomId)
    this.currentTab = 'announcements' // По умолчанию объявления
    this.currentAdmin = null // Текущий выбранный администратор
    this.administrators = [] // Список администраторов
    this.administratorsLoaded = false
    this.attachedFile = null
    this.pendingFile = null
    this.pendingMessageTime = null
    this.pendingMessageContent = null
    this.errorTimeout = null
    this.currentErrorType = null
    this.shouldReconnect = {
      announcements: true,
      group: false
    }
    this.shouldReconnectPrivate = {} // Флаги переподключения для приватных чатов
    this.isClosingIntentionally = false
    this.groupRoomId = null // ID групповой комнаты для файлов
    
    this.initializeElements()
    this.setupEventListeners()
    this.setupChatTabs()
    
    // Загружаем список администраторов
    this.loadAdministrators()
    
    // Инициализируем подключение к объявлениям после небольшой задержки
    setTimeout(() => {
      this.connectWebSocket('announcements')
    }, 100)
  }

  initializeElements() {
    this.messageInput = document.querySelector('.chatarea')
    this.sendButton = document.querySelector('button[title="Отправить сообщение"]')
    this.attachButton = document.querySelector('button[title="Прикрепить файл"]')
    this.chatContent = document.getElementById('chat-content')
    this.chatHeader = document.getElementById('chat-header')
    this.groupChatInput = document.getElementById('group-chat-input')
    this.messageInputContainer = document.getElementById('message-input-container')
    this.errorMessage = document.getElementById('error-message')
    this.errorMessageText = document.getElementById('error-message-text')
    this.attachedFiles = document.getElementById('attached-files')
    this.attachedFileItem = document.getElementById('attached-file-item')
    this.administratorsList = document.getElementById('administrators-list')
    this.adminChatsContainer = document.getElementById('admin-chats-container')
  }

  setupEventListeners() {
    // Отправка сообщения по клику
    if (this.sendButton) {
      this.sendButton.addEventListener('click', () => this.sendMessage())
    }

    // Отправка сообщения по Enter
    if (this.messageInput) {
      this.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          this.sendMessage()
        }
      })
      
      // Обработчик для скрытия ошибок валидации при клике на input
      this.messageInput.addEventListener('input', () => {
        this.hideErrorMessage()
      })

      this.messageInput.addEventListener('click', () => {
        if (this.currentErrorType === 'validation') {
          this.hideErrorMessage()
        }
      })
    }

    // Прикрепление файлов
    if (this.attachButton) {
      this.attachButton.addEventListener('click', () => this.attachFile())
    }
  }

  setupChatTabs() {
    // Обработчики для вкладок чата
    const chatTabs = document.querySelectorAll('.chat-tab')
    
    chatTabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault()
        const tabName = tab.dataset.tab
        this.switchChatTab(tabName)
      })
    })
    
    // Инициализируем активную вкладку (Объявления по умолчанию)
    this.switchChatTab('announcements')
  }

  switchChatTab(tabName) {
    // Останавливаем текущие соединения
    this.disconnect()
    
    // Убираем активные стили у всех вкладок
    document.querySelectorAll('.chat-tab').forEach(tab => {
      tab.classList.remove('active', 'bg-gray-50')
    })
    
    // Добавляем активные стили к выбранной вкладке
    const selectedTab = document.querySelector(`.chat-tab[data-tab="${tabName}"]`)
    if (selectedTab) {
      selectedTab.classList.add('active', 'bg-gray-50')
    }
    
    // Скрываем все чаты
    document.querySelectorAll('.chat-content').forEach(chat => {
      chat.classList.remove('active', 'flex')
      chat.classList.add('hidden')
      chat.style.display = 'none'
    })
    
    // Показываем выбранный чат
    const selectedChat = document.querySelector(`#${tabName}-chat`)
    if (selectedChat) {
      selectedChat.classList.remove('hidden')
      selectedChat.classList.add('active', 'flex')
      selectedChat.style.display = 'flex'
    }
    
    // Показываем лоадер в выбранном чате (вверху по центру)
    if (selectedChat) {
      selectedChat.innerHTML = `
        <div class="p-4">
          <div class="flex items-center justify-center">
            <div class="flex items-center gap-3 text-gray-500">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
              <span>Подключение к чату...</span>
            </div>
          </div>
        </div>
      `
    }
    
    // Показываем/скрываем инпут в зависимости от вкладки
    if (tabName === 'group') {
      // Групповой чат - показываем инпут
      if (this.groupChatInput) {
        this.groupChatInput.classList.remove('hidden')
      }
    } else {
      // Объявления - скрываем инпут
      if (this.groupChatInput) {
        this.groupChatInput.classList.add('hidden')
      }
    }
    
    // Обновляем заголовок чата
    const headerText = {
      'group': 'Групповой чат',
      'announcements': 'Объявления'
    }
    
    if (this.chatHeader) {
      this.chatHeader.innerHTML = `<span>${headerText[tabName] || 'Чат'}</span>`
    }
    
    // Переключаем вкладку и подключаемся
    this.currentTab = tabName
    
    // Очищаем поля ввода
    this.clearInputs()
    
    // Подключаемся к WebSocket с задержкой
    setTimeout(() => {
      this.shouldReconnect[tabName] = true
      this.connectWebSocket(tabName)
    }, 200)
  }

  async connectWebSocket(tabName) {
    // Проверяем, нет ли уже активного соединения
    if (this.websockets[tabName] && this.websockets[tabName].readyState === WebSocket.OPEN) {
      return
    }

    const token = localStorage.getItem('access_token')
    if (!token) {
      this.showConnectionError('Токен доступа не найден')
      return
    }

    // Лоадер уже показан в switchChatTab()
    
    // Определяем URL в зависимости от комнаты
    let wsUrl
    if (tabName === 'announcements') {
      wsUrl = `wss://portal.gradients.academy/ws/chat/announcements/?token=${token}`
    } else if (tabName === 'group') {
      wsUrl = `wss://portal.gradients.academy/ws/chat/group/?token=${token}`
    } else {
      this.showConnectionError('Неизвестный тип чата')
      return
    }
    
    try {
      this.websockets[tabName] = new WebSocket(wsUrl)
      
      this.websockets[tabName].onopen = () => {
        // Очищаем ошибки при успешном подключении
        this.clearErrorState()
        // Лоадер скроется автоматически при получении сообщений
      }

      this.websockets[tabName].onmessage = (event) => {
        const data = JSON.parse(event.data)
        this.handleMessage(data, tabName)
      }

      this.websockets[tabName].onclose = (event) => {
        // Переподключаемся только если нужно и не закрыто намеренно
        if (event.code !== 1000 && this.shouldReconnect[tabName] && !this.isClosingIntentionally) {
          // При переподключении покажем новый лоадер
          setTimeout(() => {
            if (this.shouldReconnect[tabName] && !this.isClosingIntentionally) {
              const chatContainer = document.getElementById(`${tabName}-chat`)
              if (chatContainer) {
                chatContainer.innerHTML = `
                  <div class="p-4">
                    <div class="flex items-center justify-center">
                      <div class="flex items-center gap-3 text-gray-500">
                        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
                        <span>Переподключение...</span>
                      </div>
                    </div>
                  </div>
                `
              }
              this.connectWebSocket(tabName)
            }
          }, 3000)
        }
      }

      this.websockets[tabName].onerror = (error) => {
        console.error(`Ошибка WebSocket для ${tabName}:`, error)
        
        // Не показываем ошибку если закрываем намеренно
        if (!this.isClosingIntentionally) {
          this.showConnectionError('Ошибка подключения к чату')
        }
      }
    } catch (error) {
      console.error(`Ошибка подключения к WebSocket для ${tabName}:`, error)
      this.showConnectionError('Не удалось подключиться к чату')
    }
  }

  async sendMessage() {
    // Отправка только в групповом чате и приватных чатах с администраторами
    if (this.currentTab !== 'group' && !this.currentTab.startsWith('admin-')) {
      return
    }
    
    const messageText = this.messageInput.value.trim()
    
    // Проверка наличия текста или файла
    if (!messageText && !this.attachedFile) {
      this.showErrorMessage('Введите сообщение или прикрепите файл', 'validation')
      return
    }

    // Определяем какой WebSocket использовать
    let websocket
    if (this.currentTab === 'group') {
      websocket = this.websockets.group
      if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        this.showConnectionError('Групповой чат не подключен')
        return
      }
    } else if (this.currentTab.startsWith('admin-')) {
      const adminId = this.currentTab.replace('admin-', '')
      websocket = this.privateWebsockets[adminId]
      if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        this.showConnectionError('Приватный чат не подключен')
        return
      }
    }

    try {
      // Если есть только файл без текста - отправляем только файл
      if (!messageText && this.attachedFile) {
        // Отправляем только файл через HTTP запрос
        if (this.currentTab === 'group') {
          await this.uploadFile(this.attachedFile)
        } else if (this.currentTab.startsWith('admin-')) {
          const adminId = this.currentTab.replace('admin-', '')
          const roomId = this.privateRoomIds[adminId]
          if (roomId) {
            await this.uploadPrivateFile(roomId, this.attachedFile)
          } else {
            this.showErrorMessage('Не удалось определить ID комнаты для загрузки файла')
          }
        }
        
        // Очищаем файл и поле ввода
        this.clearAllFiles()
        this.messageInput.value = ''
        auto_grow(this.messageInput)
        return
      }

      // Если есть текст (с файлом или без)
      if (messageText) {
        // Сохраняем данные для идентификации нашего сообщения
        this.pendingMessageTime = Date.now()
        this.pendingMessageContent = messageText
        
        // Если есть файл, сохраняем его для последующей отправки после текста
        if (this.attachedFile) {
          this.pendingFile = this.attachedFile
        }

        // Отправляем текстовое сообщение
        const messageData = {
          content: messageText
        }

        websocket.send(JSON.stringify(messageData))

        // Очищаем поле ввода
        this.messageInput.value = ''
        auto_grow(this.messageInput)

        // Убираем отображение прикрепленного файла
        this.removeAttachedFile()
      }

    } catch (error) {
      console.error('Ошибка отправки сообщения:', error)
      this.showErrorMessage('Не удалось отправить сообщение')
      
      // Восстанавливаем интерфейс при ошибке
      this.clearAllFiles()
      this.pendingMessageTime = null
      this.pendingMessageContent = null
    }
  }

  handleMessage(data, tabName) {
    if (data.message) {
      // Добавляем сообщение в чат
      this.addMessageToChat(data.message, tabName, true)
      
      // Проверяем, нужно ли отправить файл после текстового сообщения
      if (this.pendingFile && this.isOurMessage(data.message)) {
        if (tabName === 'group') {
          this.uploadFile(this.pendingFile)
        } else if (tabName.startsWith('admin-')) {
          const adminId = tabName.replace('admin-', '')
          const roomId = this.privateRoomIds[adminId]
          if (roomId) {
            this.uploadPrivateFile(roomId, this.pendingFile)
          } else {
            console.error('room_id не найден для приватного чата с profileId:', adminId)
          }
        }
        this.clearAllFiles()
      }
    } else if (data.messages) {
      // История сообщений
      this.loadMessageHistory(data.messages, tabName)
    }
  }

  loadMessageHistory(messages, tabName) {
    const chatContainer = document.getElementById(`${tabName}-chat`)
    if (!chatContainer) return

    // Удаляем заглушку если она есть
    const placeholder = chatContainer.querySelector('.chat-placeholder')
    if (placeholder) {
      placeholder.remove()
    }

    // Удаляем инлайн лоадеры
    const inlineLoaders = chatContainer.querySelectorAll('div.p-4')
    inlineLoaders.forEach(loader => {
      if (loader.querySelector('.animate-spin')) {
        loader.remove()
      }
    })

    // Сортируем сообщения по дате (старые сверху)
    const sortedMessages = messages.sort((a, b) => 
      new Date(a.created_at) - new Date(b.created_at)
    )

    // Добавляем все сообщения
    sortedMessages.forEach(messageData => {
      this.addMessageToChat(messageData, tabName, false)
    })

    // Прокручиваем к концу после загрузки всех сообщений
    this.scrollToBottom()
  }

  addMessageToChat(messageData, tabName, shouldScroll = true) {
    const chatContainer = document.getElementById(`${tabName}-chat`)
    if (!chatContainer) return

    // Удаляем заглушку если она есть
    const placeholder = chatContainer.querySelector('.chat-placeholder')
    if (placeholder) {
      placeholder.remove()
    }

    // Удаляем инлайн лоадеры
    const inlineLoaders = chatContainer.querySelectorAll('div.p-4')
    inlineLoaders.forEach(loader => {
      if (loader.querySelector('.animate-spin')) {
        loader.remove()
      }
    })

    // Проверяем нужно ли добавить метку времени
    const messageDate = messageData.created_at ? new Date(messageData.created_at) : new Date()
    this.addDateLabelIfNeeded(chatContainer, messageDate)

    // Определяем, наше ли это сообщение (только для группового чата)
    const isOurMessage = tabName === 'group' ? this.isOurMessage(messageData) : false

    // Создаем HTML для нового сообщения
    const messageElement = document.createElement('div')
    messageElement.className = `message flex gap-3 mb-4 ${isOurMessage ? 'justify-end' : 'justify-start'}`
    
    // Форматируем время из created_at
    const messageTime = messageData.created_at 
      ? new Date(messageData.created_at).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit'
        })
      : new Date().toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit'
        })

    // Обрабатываем файл
    let fileHtml = ''
    if (messageData.file) {
      const fileUrl = messageData.file.startsWith('http') 
        ? messageData.file 
        : `https://portal.gradients.academy${messageData.file}`
      const fileName = messageData.file.split('/').pop()
      fileHtml = `
        <div class="mt-2">
          <div class="min-h-[44px] flex items-center gap-2 bg-white rounded-[12px] p-4 cursor-pointer select-none" onclick="window.open('${fileUrl}', '_blank')">
            <span class="flex-shrink-0">
              <svg width="16" height="18" viewBox="0 0 16 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.33203 17.3334H11.6654C13.3222 17.3334 14.6654 15.9903 14.6654 14.3334V7.04655C14.6654 6.17078 14.2827 5.33873 13.6177 4.76878L9.67463 1.38898C9.1309 0.922925 8.43839 0.666748 7.72226 0.666748H4.33203C2.67518 0.666748 1.33203 2.00989 1.33203 3.66675V14.3334C1.33203 15.9903 2.67517 17.3334 4.33203 17.3334Z" stroke="#F4891E" stroke-linejoin="round"/>
                <path d="M8.83203 1.0835V3.66683C8.83203 4.7714 9.72746 5.66683 10.832 5.66683H14.2487" stroke="#F4891E" stroke-linejoin="round"/>
                <path d="M4.66406 14.8335H11.3307" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 7.3335V12.3335" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5.5 9.8335L8 12.3335L10.5 9.8335" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="text-[#F4891E] font-medium text-base truncate">${fileName}</span>
          </div>
        </div>
      `
    }

    // Определяем стили для сообщения в зависимости от отправителя
    const messageContainerClass = isOurMessage ? 'max-w-xs lg:max-w-md' : 'max-w-xs lg:max-w-md'
    const messageBgClass = isOurMessage ? 'bg-orange-secondary text-orange-primary' : 'text-gray-900'
    const messageBgStyle = isOurMessage ? '' : 'background-color: #EFEFEF;'
    const messageRounding = isOurMessage ? 'rounded-tl-lg rounded-bl-lg rounded-br-lg' : 'rounded-tr-lg rounded-bl-lg rounded-br-lg'
    // Определяем аватар и роль в зависимости от типа чата
    let avatarContent, senderRole
    
    if (tabName === 'announcements') {
      // В объявлениях все сообщения от администратора - используем SVG заглушку
      avatarContent = `<div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
        <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      </div>`
      senderRole = "(Администратор)"
    } else {
      // В групповом чате все сообщения от представителей - используем SVG заглушку
      avatarContent = `<div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
        <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      </div>`
      senderRole = "(Представитель)"
    }

    if (isOurMessage) {
      // Наше сообщение - аватар справа
      messageElement.innerHTML = `
        <div class="${messageContainerClass}">
          <div class="mb-1 flex items-center gap-4 text-sm font-bold justify-end">
            <div class="flex items-center gap-2">
              <span>${messageData.sender_name || (tabName === 'announcements' ? 'Администратор' : 'Представитель')}</span>
              <span>${senderRole}</span>
            </div>
            ${avatarContent}
          </div>
          <div class="mr-12">
            <div class="${messageBgClass} ${messageRounding} p-3" style="${messageBgStyle}">
              <p>${messageData.content}</p>
              ${fileHtml}
            </div>
            <div class="mt-1 text-xs text-right">${messageTime}</div>
          </div>
        </div>
      `
          } else {
        // Чужое сообщение - аватар слева
        messageElement.innerHTML = `
          ${avatarContent}
          <div class="${messageContainerClass}">
          <div class="mb-1 flex items-center gap-2 text-sm font-bold">
            <span>${messageData.sender_name || (tabName === 'announcements' ? 'Администратор' : 'Представитель')}</span>
            <span>${senderRole}</span>
          </div>
          <div class="${messageBgClass} ${messageRounding} p-3" style="${messageBgStyle}">
            <p>${messageData.content}</p>
            ${fileHtml}
          </div>
          <div class="mt-1 text-xs">${messageTime}</div>
        </div>
      `
    }

    // Добавляем сообщение в конец чата
    chatContainer.appendChild(messageElement)
    
    // Прокручиваем к новому сообщению только если нужно
    if (shouldScroll) {
      this.scrollToBottom()
    }
  }

  async attachFile() {
    // Создаем input для выбора файла
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.multiple = false
    fileInput.accept = '*/*'
    
    fileInput.onchange = async (event) => {
      const file = event.target.files[0]
      if (!file) return

      // Заменяем предыдущий файл если он был
      this.attachedFile = file
      this.displayAttachedFile(file)
    }

    // Открываем диалог выбора файла
    fileInput.click()
  }

  displayAttachedFile(file) {
    if (!this.attachedFiles || !this.attachedFileItem) return

    // Определяем тип файла и иконку
    const fileName = file.name
    const fileSize = this.formatFileSize(file.size)
    const fileExtension = fileName.split('.').pop().toLowerCase()
    
    let fileIcon = '📎'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) {
      fileIcon = '🖼️'
    } else if (fileExtension === 'pdf') {
      fileIcon = '📄'
    } else if (['doc', 'docx'].includes(fileExtension)) {
      fileIcon = '📝'
    } else if (['xls', 'xlsx'].includes(fileExtension)) {
      fileIcon = '📊'
    }

    // Создаем HTML для отображения файла
    this.attachedFileItem.innerHTML = `
      <div class="flex items-center gap-3 flex-1">
        <span class="text-2xl">${fileIcon}</span>
        <div class="flex-1">
          <div class="font-medium text-sm text-gray-800">${fileName}</div>
          <div class="text-xs text-gray-500">${fileSize}</div>
        </div>
      </div>
      <button 
        class="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors"
        onclick="representativeChat.removeAttachedFile()"
        title="Удалить файл"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    `

    // Показываем область с файлом
    this.attachedFiles.classList.remove('hidden')
  }

  removeAttachedFile() {
    // Удаляем только attachedFile, НЕ pendingFile
    this.attachedFile = null
    
    // Скрываем область с файлом
    if (this.attachedFiles) {
      this.attachedFiles.classList.add('hidden')
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  isOurMessage(message) {
    // Для объявлений (только чтение) - наших сообщений быть не может
    if (this.currentTab === 'announcements') {
      return false
    }
    
    // Проверяем по Profile ID пользователя
    try {
      const userData = localStorage.getItem('user')
      if (userData) {
        const user = JSON.parse(userData)
        if (message.sender_id === user.profile.id) {
          return true
        }
      }
    } catch (error) {
      console.error('Ошибка при получении данных пользователя:', error)
    }
    
    // Если есть ожидающий файл с текстом, проверяем по времени и содержимому
    if (this.pendingMessageTime && this.pendingMessageContent) {
      const messageTime = new Date(message.created_at).getTime()
      const timeDiff = Math.abs(messageTime - this.pendingMessageTime)
      const contentMatches = message.content === this.pendingMessageContent
      
      return timeDiff < 30000 && contentMatches
    }
    
    return false
  }

  async uploadFile(file) {
    try {
      const formData = new FormData()
      formData.append('file', file)

              // Получаем ID групповой комнаты (предполагаем что это 2, но можно получать динамически)
        const groupRoomId = 2
        const url = `https://portal.gradients.academy/chats/rooms/${groupRoomId}/attachments/`

      const response = await authorizedFetch(url, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ошибка загрузки: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      this.showSuccessMessage(`Файл "${file.name}" успешно прикреплен`)
      
    } catch (error) {
      console.error('Ошибка загрузки файла в групповой чат:', error)
      this.showErrorMessage('Не удалось загрузить файл: ' + error.message)
    }
  }

  scrollToBottom() {
    const chatContainer = this.chatContent
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight
    }
  }

  showLoader(tabName) {
    const chatContainer = document.getElementById(`${tabName}-chat`)
    if (!chatContainer) return

    // Проверяем, нет ли уже лоадера
    const existingLoader = chatContainer.querySelector('.loader-container')
    if (existingLoader) {
      return
    }

    // Убираем заглушку если она есть
    const placeholder = chatContainer.querySelector('.chat-placeholder')
    if (placeholder) {
      placeholder.remove()
    }

    // Добавляем лоадер
    const loaderElement = document.createElement('div')
    loaderElement.className = 'loader-container flex items-center justify-center flex-1'
    loaderElement.innerHTML = `
      <div class="flex items-center gap-3 text-gray-500">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
        <span>Подключение к чату...</span>
      </div>
    `
    
    chatContainer.appendChild(loaderElement)
  }

  hideLoader(tabName) {
    let chatContainer
    
    // Определяем контейнер чата
    if (tabName.startsWith('admin-')) {
      // Для приватных чатов с администраторами
      chatContainer = document.getElementById(`${tabName}-chat`)
    } else {
      // Для обычных чатов (group, announcements)
      chatContainer = document.getElementById(`${tabName}-chat`)
    }
    
    if (!chatContainer) return

    // Удаляем все типы лоадеров более агрессивно
    const allLoaders = chatContainer.querySelectorAll('.loader-container, .animate-spin, .flex.items-center.justify-center')
    allLoaders.forEach(loader => {
      // Проверяем что это действительно лоадер
      if (loader.textContent.includes('Подключение') || 
          loader.textContent.includes('Переподключение') || 
          loader.querySelector('.animate-spin') ||
          loader.classList.contains('loader-container')) {
        loader.remove()
      }
    })

    // Удаляем все div элементы которые содержат только лоадеры
    const divElements = chatContainer.querySelectorAll('div')
    divElements.forEach(div => {
      if (div.textContent.includes('Подключение к чату') || 
          div.textContent.includes('Переподключение') ||
          (div.querySelector('.animate-spin') && div.children.length <= 2)) {
        div.remove()
      }
    })

    // Если чат пустой после удаления лоадера, добавляем заглушку
    if (chatContainer.children.length === 0) {
      const placeholder = document.createElement('div')
      placeholder.className = 'chat-placeholder flex items-center justify-center flex-1 text-gray-400'
      placeholder.innerHTML = `
        <div class="text-center">
          <p class="text-base">Пока нет сообщений</p>
        </div>
      `
      chatContainer.appendChild(placeholder)
    }
  }

  showConnectionError(message) {
    const chatContainer = document.getElementById(`${this.currentTab}-chat`)
    
    if (chatContainer) {
      // Очищаем чат и показываем ошибку
      chatContainer.innerHTML = `
        <div class="flex items-center justify-center flex-1">
          <div class="text-center text-red-500">
            <div class="mb-4">
              <svg class="w-16 h-16 mx-auto text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
              </svg>
            </div>
            <h3 class="text-lg font-medium text-red-700 mb-2">Ошибка подключения</h3>
            <p class="text-sm text-red-600">${message}</p>
            <p class="text-xs text-red-500 mt-2">Попытка переподключения...</p>
          </div>
        </div>
      `
    }
    
    // Делаем input disabled для группового чата
    if (this.currentTab === 'group') {
      this.setInputDisabled(true)
    }
  }

  showErrorMessage(message, type = 'general') {
    // Сохраняем тип ошибки
    this.currentErrorType = type
    
    // Очищаем предыдущий таймер
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout)
      this.errorTimeout = null
    }
    
    // Показываем ошибку в интерфейсе
    if (this.errorMessage && this.errorMessageText) {
      this.errorMessageText.textContent = message
      this.errorMessage.classList.remove('hidden')
      
      // Плавное появление
      setTimeout(() => {
        this.errorMessage.classList.remove('opacity-0')
        this.errorMessage.classList.add('opacity-100')
      }, 10)
    }
    
    // Добавляем красную рамку к полю ввода
    if (this.messageInputContainer) {
      this.messageInputContainer.classList.remove('border-gray-200')
      this.messageInputContainer.classList.add('border-red-500', 'border-2')
    }
    
    // Автоматически скрываем только общие ошибки через 5 секунд
    if (type === 'general') {
      this.errorTimeout = setTimeout(() => {
        this.hideErrorMessage()
      }, 5000)
    }
  }

  hideErrorMessage() {
    // Очищаем таймер если он есть
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout)
      this.errorTimeout = null
    }
    
    // Сбрасываем тип ошибки
    this.currentErrorType = null
    
    // Плавное исчезновение
    if (this.errorMessage) {
      this.errorMessage.classList.remove('opacity-100')
      this.errorMessage.classList.add('opacity-0')
      
      // Полностью скрываем после анимации
      setTimeout(() => {
        this.errorMessage.classList.add('hidden')
      }, 300)
    }
    
    // Убираем красную рамку
    if (this.messageInputContainer) {
      this.messageInputContainer.classList.remove('border-red-500', 'border-2')
      this.messageInputContainer.classList.add('border-gray-200')
    }
  }

  showSuccessMessage(message) {
    // Можно добавить визуальное отображение успеха в будущем
  }

  addDateLabelIfNeeded(chatContainer, messageDate) {
    const today = messageDate.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })

    // Проверяем, есть ли уже метка времени для этой даты
    const existingLabel = chatContainer.querySelector(`[data-date="${today}"]`)
    if (existingLabel) return

    // Создаем метку времени
    const timeLabel = document.createElement('span')
    timeLabel.className = 'time-msg'
    timeLabel.setAttribute('data-date', today)
    timeLabel.textContent = today

    chatContainer.appendChild(timeLabel)
  }

  clearInputs() {
    if (this.messageInput) {
      this.messageInput.value = ''
      auto_grow(this.messageInput)
    }
    this.clearAllFiles()
  }

  clearAllFiles() {
    // Полная очистка всех файлов
    this.attachedFile = null
    this.pendingFile = null
    
    if (this.attachedFiles) {
      this.attachedFiles.classList.add('hidden')
    }
    
    // Также очищаем ошибки
    this.hideErrorMessage()
  }

  clearErrorState() {
    // Очищаем ошибки и скрываем сообщение об ошибке
    this.hideErrorMessage()
    
    // Включаем input и кнопки обратно
    this.setInputDisabled(false)
  }

  setInputDisabled(disabled) {
    if (this.messageInput) {
      this.messageInput.disabled = disabled
      if (disabled) {
        this.messageInput.classList.add('bg-gray-100', 'cursor-not-allowed')
        this.messageInput.placeholder = 'Подключение к чату...'
      } else {
        this.messageInput.classList.remove('bg-gray-100', 'cursor-not-allowed')
        this.messageInput.placeholder = 'Введите ваше сообщение...'
      }
    }
    
    // Отключаем кнопки отправки и прикрепления файла
    if (this.sendButton) {
      this.sendButton.disabled = disabled
      if (disabled) {
        this.sendButton.classList.add('opacity-50', 'cursor-not-allowed')
      } else {
        this.sendButton.classList.remove('opacity-50', 'cursor-not-allowed')
      }
    }
    
    if (this.attachButton) {
      this.attachButton.disabled = disabled
      if (disabled) {
        this.attachButton.classList.add('opacity-50', 'cursor-not-allowed')
      } else {
        this.attachButton.classList.remove('opacity-50', 'cursor-not-allowed')
      }
    }
  }

  async loadAdministrators() {
    if (this.administratorsLoaded) return
    
    try {
      const response = await authorizedFetch('https://portal.gradients.academy/chats/administrators')
      
      if (!response.ok) {
        throw new Error(`Ошибка загрузки: ${response.status}`)
      }
      
      const data = await response.json()
      this.administrators = data.results || []
      this.administratorsLoaded = true
      
      this.renderAdministratorsList()
      
    } catch (error) {
      console.error('Ошибка загрузки администраторов:', error)
      // Не показываем ошибку пользователю, просто не отображаем администраторов
    }
  }

  renderAdministratorsList() {
    if (!this.administratorsList || !this.administrators.length) return
    
    // Очищаем список
    this.administratorsList.innerHTML = ''
    
    // Рендерим каждого администратора
    this.administrators.forEach(admin => {
      const adminElement = document.createElement('a')
      adminElement.href = '#'
      adminElement.className = 'admin-chat-tab flex w-full items-center rounded-lg p-3 text-left hover:bg-gray-50 mb-1'
      adminElement.dataset.adminId = admin.profile
      adminElement.onclick = (e) => {
        e.preventDefault()
        this.selectAdministrator(admin)
      }
      
      // Создаем аватарку или SVG по умолчанию (делаем такого же размера как иконки в чатах)
      const avatarContent = admin.image 
        ? `<img src="${admin.image}" alt="${admin.full_name_ru}" class="w-12 h-12 rounded-full object-cover">`
        : `<div class="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
             <svg class="w-7 h-7 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
               <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
             </svg>
           </div>`

      adminElement.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="flex-shrink-0">
            ${avatarContent}
          </div>
          <div>
            <p class="text-sm font-bold">${admin.full_name_ru}</p>
            <p class="mt-1 text-xs text-gray-500">Администратор</p>
          </div>
        </div>
      `
      
      this.administratorsList.appendChild(adminElement)
      
      // Создаем контейнер для чата с этим администратором
      this.createAdminChatContainer(admin)
    })
  }

  createAdminChatContainer(admin) {
    if (!this.adminChatsContainer) return
    
    const chatContainer = document.createElement('div')
    chatContainer.id = `admin-chat-${admin.profile}`
    chatContainer.className = 'chat-content hidden flex flex-col gap-6 min-h-full'
    chatContainer.innerHTML = `
      <div class="chat-placeholder flex items-center justify-center flex-1 text-gray-400">
        <div class="text-center">
          <p class="text-base">Пока нет сообщений</p>
        </div>
      </div>
    `
    
    this.adminChatsContainer.appendChild(chatContainer)
  }

  selectAdministrator(admin) {
    // Останавливаем все соединения
    this.disconnect()
    
    // Убираем активные стили у всех вкладок
    document.querySelectorAll('.chat-tab, .admin-chat-tab').forEach(tab => {
      tab.classList.remove('active', 'bg-gray-50')
    })
    
    // Добавляем активные стили к выбранному администратору
    const selectedTab = document.querySelector(`.admin-chat-tab[data-admin-id="${admin.profile}"]`)
    if (selectedTab) {
      selectedTab.classList.add('active', 'bg-gray-50')
    }
    
    // Скрываем все чаты
    document.querySelectorAll('.chat-content').forEach(chat => {
      chat.classList.remove('active', 'flex')
      chat.classList.add('hidden')
      chat.style.display = 'none'
    })
    
    // Показываем чат с выбранным администратором
    const adminChat = document.querySelector(`#admin-chat-${admin.profile}`)
    if (adminChat) {
      adminChat.classList.remove('hidden')
      adminChat.classList.add('active', 'flex')
      adminChat.style.display = 'flex'
    }
    
    // Показываем инпут (приватные чаты позволяют отправлять сообщения)
    if (this.groupChatInput) {
      this.groupChatInput.classList.remove('hidden')
    }
    
    // Обновляем заголовок чата
    if (this.chatHeader) {
      const avatarContent = admin.image 
        ? `<img src="${admin.image}" alt="${admin.full_name_ru}" class="w-8 h-8 rounded-full object-cover">`
        : `<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
             <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
               <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
             </svg>
           </div>`
      
      this.chatHeader.innerHTML = `
        <div class="flex items-center gap-3">
          ${avatarContent}
          <div>
            <div class="font-semibold">${admin.full_name_ru} (Администратор)</div>
          </div>
        </div>
      `
    }
    
    // Показываем лоадер в приватном чате
    const adminChatContainer = document.querySelector(`#admin-chat-${admin.profile}`)
    if (adminChatContainer) {
      adminChatContainer.innerHTML = `
        <div class="flex items-center justify-center flex-1">
          <div class="flex items-center gap-3 text-gray-500">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
            <span>Подключение к чату...</span>
          </div>
        </div>
      `
    }
    
    // Переключаем вкладку
    this.currentTab = `admin-${admin.profile}`
    this.currentAdmin = admin
    
    // Очищаем поля ввода
    this.clearInputs()
    
    // Подключаемся к приватному WebSocket с задержкой
    setTimeout(() => {
      this.shouldReconnectPrivate[admin.profile] = true
      this.connectPrivateWebSocket(admin.profile)
    }, 200)
  }

  async connectPrivateWebSocket(profileId) {
    // Проверяем, нет ли уже активного соединения
    if (this.privateWebsockets[profileId] && this.privateWebsockets[profileId].readyState === WebSocket.OPEN) {
      return
    }

    const token = localStorage.getItem('access_token')
    if (!token) {
      this.showConnectionError('Токен доступа не найден')
      return
    }

    // Лоадер уже показан в selectAdministrator()
    
    const wsUrl = `wss://portal.gradients.academy/ws/chat/private/${profileId}/?token=${token}`
    
    try {
      this.privateWebsockets[profileId] = new WebSocket(wsUrl)
      
      this.privateWebsockets[profileId].onopen = () => {
        // Очищаем ошибки при успешном подключении
        this.clearErrorState()
      }

      this.privateWebsockets[profileId].onmessage = (event) => {
        const data = JSON.parse(event.data)
        this.handlePrivateMessage(data, profileId)
      }

      this.privateWebsockets[profileId].onclose = (event) => {
        this.hideLoader(`admin-${profileId}`)
        
        // Переподключаемся только если нужно и не закрыто намеренно
        if (event.code !== 1000 && this.shouldReconnectPrivate[profileId] && !this.isClosingIntentionally) {
          setTimeout(() => {
            if (this.shouldReconnectPrivate[profileId] && !this.isClosingIntentionally) {
              this.connectPrivateWebSocket(profileId)
            }
          }, 3000)
        }
      }

      this.privateWebsockets[profileId].onerror = (error) => {
        console.error(`Ошибка приватного WebSocket для ${profileId}:`, error)
        
        // Скрываем лоадер при ошибке
        this.hideLoader(`admin-${profileId}`)
        
        // Не показываем ошибку если закрываем намеренно
        if (!this.isClosingIntentionally) {
          this.showConnectionError('Ошибка подключения к приватному чату')
        }
      }
    } catch (error) {
      console.error(`Ошибка подключения к приватному WebSocket для ${profileId}:`, error)
      this.showConnectionError('Не удалось подключиться к приватному чату')
    }
  }

  handlePrivateMessage(data, profileId) {
    if (data.message) {
      // Сохраняем room_id для этого приватного чата
      if (data.message.room_id) {
        this.privateRoomIds[profileId] = data.message.room_id
      }
      
      // Добавляем сообщение в приватный чат
      this.addPrivateMessageToChat(data.message, profileId, true)
      
      // Проверяем, нужно ли отправить файл после текстового сообщения
      if (this.pendingFile && this.isOurPrivateMessage(data.message)) {
        const roomId = this.privateRoomIds[profileId]
        if (roomId) {
          this.uploadPrivateFile(roomId, this.pendingFile)
        } else {
          console.error('room_id не найден для приватного чата с profileId:', profileId)
        }
        this.clearAllFiles()
      }
    } else if (data.messages) {
      // История сообщений - сохраняем room_id из первого сообщения
      if (data.messages.length > 0 && data.messages[0].room_id) {
        this.privateRoomIds[profileId] = data.messages[0].room_id
      }
      
      // История сообщений
      this.loadPrivateMessageHistory(data.messages, profileId)
    }
  }

  loadPrivateMessageHistory(messages, profileId) {
    const chatContainer = document.getElementById(`admin-chat-${profileId}`)
    if (!chatContainer) return

    // Полностью очищаем контейнер чата от всех лоадеров и заглушек
    chatContainer.innerHTML = ''

    if (messages.length === 0) {
      chatContainer.innerHTML = `
        <div class="chat-placeholder flex items-center justify-center flex-1 text-gray-400">
          <div class="text-center">
            <p class="text-base">Пока нет сообщений</p>
          </div>
        </div>
      `
      return
    }

    // Сортируем сообщения по дате (старые сверху)
    const sortedMessages = messages.sort((a, b) => 
      new Date(a.created_at) - new Date(b.created_at)
    )

    // Добавляем все сообщения
    sortedMessages.forEach(messageData => {
      this.addPrivateMessageToChat(messageData, profileId, false)
    })

    // Прокручиваем к концу после загрузки всех сообщений
    this.scrollToBottom()
  }

  addPrivateMessageToChat(messageData, profileId, shouldScroll = true) {
    const chatContainer = document.getElementById(`admin-chat-${profileId}`)
    if (!chatContainer) return

    // Удаляем все лоадеры (включая лоадеры с другой структурой)
    const loaderElements = chatContainer.querySelectorAll('.animate-spin, [class*="loader"], .flex.items-center.justify-center')
    loaderElements.forEach(loader => {
      // Проверяем что это действительно лоадер по содержимому
      if (loader.textContent.includes('Подключение') || loader.textContent.includes('Переподключение') || loader.querySelector('.animate-spin')) {
        loader.closest('div').remove()
      }
    })

    // Удаляем заглушку если она есть
    const placeholder = chatContainer.querySelector('.chat-placeholder')
    if (placeholder) {
      placeholder.remove()
    }

    // Проверяем нужно ли добавить метку времени
    const messageDate = messageData.created_at ? new Date(messageData.created_at) : new Date()
    this.addDateLabelIfNeeded(chatContainer, messageDate)

    // Определяем, наше ли это сообщение
    const isOurMessage = this.isOurPrivateMessage(messageData)

    // Создаем HTML для нового сообщения (используем ту же логику что и для обычных чатов)
    const messageElement = document.createElement('div')
    messageElement.className = `message flex gap-3 mb-4 ${isOurMessage ? 'justify-end' : 'justify-start'}`
    
    // Форматируем время из created_at
    const messageTime = messageData.created_at 
      ? new Date(messageData.created_at).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit'
        })
      : new Date().toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit'
        })

    // Обрабатываем файл
    let fileHtml = ''
    if (messageData.file) {
      const fileUrl = messageData.file.startsWith('http') 
        ? messageData.file 
        : `https://portal.gradients.academy${messageData.file}`
      const fileName = messageData.file.split('/').pop()
      fileHtml = `
        <div class="mt-2">
          <div class="min-h-[44px] flex items-center gap-2 bg-white rounded-[12px] p-4 cursor-pointer select-none" onclick="window.open('${fileUrl}', '_blank')">
            <span class="flex-shrink-0">
              <svg width="16" height="18" viewBox="0 0 16 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.33203 17.3334H11.6654C13.3222 17.3334 14.6654 15.9903 14.6654 14.3334V7.04655C14.6654 6.17078 14.2827 5.33873 13.6177 4.76878L9.67463 1.38898C9.1309 0.922925 8.43839 0.666748 7.72226 0.666748H4.33203C2.67518 0.666748 1.33203 2.00989 1.33203 3.66675V14.3334C1.33203 15.9903 2.67517 17.3334 4.33203 17.3334Z" stroke="#F4891E" stroke-linejoin="round"/>
                <path d="M8.83203 1.0835V3.66683C8.83203 4.7714 9.72746 5.66683 10.832 5.66683H14.2487" stroke="#F4891E" stroke-linejoin="round"/>
                <path d="M4.66406 14.8335H11.3307" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 7.3335V12.3335" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5.5 9.8335L8 12.3335L10.5 9.8335" stroke="#F4891E" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="text-[#F4891E] font-medium text-base truncate">${fileName}</span>
          </div>
        </div>
      `
    }

    // Определяем стили для сообщения в зависимости от отправителя
    const messageContainerClass = isOurMessage ? 'max-w-xs lg:max-w-md' : 'max-w-xs lg:max-w-md'
    const messageBgClass = isOurMessage ? 'bg-orange-secondary text-orange-primary' : 'text-gray-900'
    const messageBgStyle = isOurMessage ? '' : 'background-color: #EFEFEF;'
    const messageRounding = isOurMessage ? 'rounded-tl-lg rounded-bl-lg rounded-br-lg' : 'rounded-tr-lg rounded-bl-lg rounded-br-lg'
    
    // Определяем аватар и роль для приватных чатов
    let avatarContent, senderRole
    if (isOurMessage) {
      // Наше сообщение - представитель
      avatarContent = `<div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
        <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      </div>`
      senderRole = "(Представитель)"
    } else {
      // Сообщение администратора
      const admin = this.administrators.find(a => a.profile == profileId)
      avatarContent = admin && admin.image 
        ? `<img src="${admin.image}" alt="${admin.full_name_ru}" class="h-8 w-8 rounded-full object-cover">`
        : `<div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
             <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
               <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
             </svg>
           </div>`
      senderRole = "(Администратор)"
    }

    if (isOurMessage) {
      // Наше сообщение - аватар справа
      messageElement.innerHTML = `
        <div class="${messageContainerClass}">
          <div class="mb-1 flex items-center gap-4 text-sm font-bold justify-end">
            <div class="flex items-center gap-2">
              <span>${messageData.sender_name || 'Представитель'}</span>
              <span>${senderRole}</span>
            </div>
            ${avatarContent}
          </div>
          <div class="mr-12">
            <div class="${messageBgClass} ${messageRounding} p-3" style="${messageBgStyle}">
              <p>${messageData.content}</p>
              ${fileHtml}
            </div>
            <div class="mt-1 text-xs text-right">${messageTime}</div>
          </div>
        </div>
      `
    } else {
      // Чужое сообщение - аватар слева
      messageElement.innerHTML = `
        ${avatarContent}
        <div class="${messageContainerClass}">
          <div class="mb-1 flex items-center gap-2 text-sm font-bold">
            <span>${messageData.sender_name || 'Администратор'}</span>
            <span>${senderRole}</span>
          </div>
          <div class="${messageBgClass} ${messageRounding} p-3" style="${messageBgStyle}">
            <p>${messageData.content}</p>
            ${fileHtml}
          </div>
          <div class="mt-1 text-xs">${messageTime}</div>
        </div>
      `
    }

    // Добавляем сообщение в конец чата
    chatContainer.appendChild(messageElement)
    
    // Прокручиваем к новому сообщению только если нужно
    if (shouldScroll) {
      this.scrollToBottom()
    }
  }

  isOurPrivateMessage(message) {
    // Проверяем по Profile ID пользователя
    try {
      const userData = localStorage.getItem('user')
      if (userData) {
        const user = JSON.parse(userData)
        if (message.sender_id === user.profile.id) {
          return true
        }
      }
    } catch (error) {
      console.error('Ошибка при получении данных пользователя:', error)
    }
    
    // Дополнительная проверка по времени и содержимому для недавно отправленных сообщений с текстом
    if (this.pendingMessageTime && this.pendingMessageContent) {
      const messageTime = new Date(message.created_at).getTime()
      const timeDiff = Math.abs(messageTime - this.pendingMessageTime)
      const contentMatches = message.content === this.pendingMessageContent
      
      return timeDiff < 30000 && contentMatches
    }
    
    return false
  }

  async uploadPrivateFile(roomId, file) {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const url = `https://portal.gradients.academy/chats/private/${roomId}/attachments/`

      const response = await authorizedFetch(url, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ошибка загрузки: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      this.showSuccessMessage(`Файл "${file.name}" успешно прикреплен`)
      
    } catch (error) {
      console.error('Ошибка загрузки файла в приватный чат:', error)
      this.showErrorMessage('Не удалось загрузить файл: ' + error.message)
    }
  }

  disconnect() {
    // Устанавливаем флаг намеренного закрытия
    this.isClosingIntentionally = true
    
    // Останавливаем все переподключения
    this.shouldReconnect.announcements = false
    this.shouldReconnect.group = false
    Object.keys(this.shouldReconnectPrivate).forEach(key => {
      this.shouldReconnectPrivate[key] = false
    })
    
    // Закрываем все WebSocket соединения
    Object.keys(this.websockets).forEach(key => {
      if (this.websockets[key]) {
        this.websockets[key].close()
        this.websockets[key] = null
      }
    })
    
    // Закрываем все приватные WebSocket соединения
    Object.keys(this.privateWebsockets).forEach(key => {
      if (this.privateWebsockets[key]) {
        this.privateWebsockets[key].close()
        this.privateWebsockets[key] = null
      }
    })
    
    // Очищаем ошибки подключения
    this.hideErrorMessage()
    
    // Включаем input обратно
    this.setInputDisabled(false)
    
    // Сбрасываем флаг через небольшую задержку
    setTimeout(() => {
      this.isClosingIntentionally = false
    }, 500)
  }
}

// Инициализация чата при загрузке страницы
let representativeChat = null

document.addEventListener('DOMContentLoaded', () => {
  representativeChat = new RepresentativeChat()
  window.representativeChat = representativeChat // Делаем доступным глобально
})

// Функция для автоматического изменения размера textarea
function auto_grow(element) {
  element.style.height = '5px'
  element.style.height = element.scrollHeight + 'px'
}

// Функция для мобильного переключения
function openChatMobile() {
  // Обработчик для мобильного переключения чата
}

// Очистка при закрытии страницы
window.addEventListener('beforeunload', () => {
  if (representativeChat) {
    representativeChat.disconnect()
  }
}) 