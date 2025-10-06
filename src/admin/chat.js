// chat.js - Управление чатом для админ панели

class AdminChat {
  constructor() {
    this.websocket = null
    this.privateWebsockets = new Map() // Карта приватных WebSocket'ов по profile_id
    this.currentRoom = 'announcements' // По умолчанию объявления
    this.currentRepresentative = null // Текущий выбранный представитель
    this.currentPrivateRoomId = null // ID текущей приватной комнаты из WebSocket
    this.announcementsRoomId = 'announcements' // ID комнаты объявлений
    this.attachedFile = null // Хранение прикрепленного файла
    this.pendingFile = null // Файл ожидающий отправки после получения ID сообщения
    this.pendingMessageTime = null
    this.pendingMessageContent = null
    this.representativesLoaded = false
    this.errorTimeout = null
    this.currentErrorType = null // Тип текущей ошибки: 'connection', 'validation', 'general'
    this.shouldReconnectPrivate = false // Флаг для контроля переподключения приватного чата
    this.shouldReconnectPublic = true // Флаг для контроля переподключения публичного чата
    this.isClosingIntentionally = false // Флаг для отслеживания намеренного закрытия
    
    // Новые свойства для системы уведомлений
    this.representatives = [] // Список всех представителей
    this.unreadChats = new Set() // Множество ID представителей с непрочитанными сообщениями
    this.readChats = new Set() // Множество ID представителей с прочитанными сообщениями
    this.lastMessageTimes = new Map() // Карта времени последних сообщений по представителям
    
    // Новые свойства для хранения сообщений и состояния
    this.lastMessages = new Map() // Карта последних сообщений по представителям
    this.privateMessageHistories = new Map() // Карта историй сообщений по представителям
    this.currentChatState = this.loadChatState() // Загружаем сохраненное состояние чата
    this.savedRepresentativesOrder = null // Сохраненный порядок представителей
    
    this.initializeElements()
    this.setupEventListeners()
    this.restoreChatState() // Восстанавливаем состояние чата
    
    // Восстанавливаем визуальное состояние после загрузки DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.restoreVisualState()
      })
    } else {
      // DOM уже загружен
      setTimeout(() => {
        this.restoreVisualState()
      }, 100)
    }
    
    this.initializeAllChats() // Инициализируем все чаты сразу
    
    // Дополнительно: обеспечиваем обновление интерфейса после загрузки данных
    setTimeout(() => {
      if (this.representativesContent && !this.representativesContent.classList.contains('hidden')) {
        console.log('Конструктор: Пользователь в режиме представителей, обновляем интерфейс')
        if (this.representatives.length > 0) {
          this.renderRepresentativesList({ results: this.representatives })
        }
      } else if (this.chatModeContent && !this.chatModeContent.classList.contains('hidden')) {
        console.log('Конструктор: Пользователь в основном режиме, заполняем список чатов')
        // Показываем представителей с сообщениями в основном списке
        const representativesWithMessages = this.representatives.filter(rep => this.lastMessages.has(rep.profile))
        representativesWithMessages.forEach(rep => {
          console.log(`Конструктор: Добавляем чат ${rep.full_name_ru}`)
          this.updateMainChatList(rep)
        })
      }
    }, 1500) // Увеличиваем время для полной загрузки данных и предзагрузки сообщений
  }

  // Методы для работы с состоянием чата
  loadChatState() {
    try {
      const savedState = localStorage.getItem('admin_chat_state')
      return savedState ? JSON.parse(savedState) : { 
        currentRoom: 'announcements', 
        currentRepresentative: null,
        isInRepresentativesMode: false
      }
    } catch (error) {
      console.error('Ошибка загрузки состояния чата:', error)
      return { 
        currentRoom: 'announcements', 
        currentRepresentative: null,
        isInRepresentativesMode: false
      }
    }
  }

  saveChatState() {
    try {
      const state = {
        currentRoom: this.currentRoom,
        currentRepresentative: this.currentRepresentative,
        isInRepresentativesMode: this.representativesContent && !this.representativesContent.classList.contains('hidden'),
        // Сохраняем порядок представителей (ID первых 10 для оптимизации)
        representativesOrder: this.representatives.slice(0, 10).map(rep => rep.profile)
      }
      localStorage.setItem('admin_chat_state', JSON.stringify(state))
    } catch (error) {
      console.error('Ошибка сохранения состояния чата:', error)
    }
  }

  restoreChatState() {
    if (!this.currentChatState) return
    
    // Восстанавливаем текущую комнату
    this.currentRoom = this.currentChatState.currentRoom || 'announcements'
    
    // Восстанавливаем представителя если он был выбран
    if (this.currentChatState.currentRepresentative) {
      this.currentRepresentative = this.currentChatState.currentRepresentative
    }
    
    // Восстанавливаем порядок представителей если есть сохраненный
    if (this.currentChatState.representativesOrder && Array.isArray(this.currentChatState.representativesOrder)) {
      this.savedRepresentativesOrder = this.currentChatState.representativesOrder
    }
  }

  restoreVisualState() {
    // Если нет сохраненного состояния, устанавливаем по умолчанию
    if (!this.currentChatState) {
      this.currentRoom = 'announcements'
    }
    
    // Восстанавливаем активную вкладку
    document.querySelectorAll('.chat-tab').forEach(tab => {
      tab.classList.remove('active', 'bg-gray-50')
    })
    
    const activeTab = document.querySelector(`.chat-tab[data-tab="${this.currentRoom}"]`)
    if (activeTab) {
      activeTab.classList.add('active', 'bg-gray-50')
    }
    
    // Восстанавливаем видимый чат
    document.querySelectorAll('.chat-content').forEach(chat => {
      chat.classList.remove('active', 'flex')
      chat.classList.add('hidden')
      chat.style.display = 'none'
    })
    
    const activeChat = document.querySelector(`#${this.currentRoom}-chat`)
    if (activeChat) {
      activeChat.classList.remove('hidden')
      activeChat.classList.add('active', 'flex')
      activeChat.style.display = 'flex'
    }
    
    // Восстанавливаем режим представителей если нужно
    if (this.currentChatState && this.currentChatState.isInRepresentativesMode) {
      setTimeout(() => {
        this.showRepresentativesMode()
        
        // Восстанавливаем выбранного представителя после загрузки списка
        if (this.currentRepresentative) {
          this.waitForRepresentativesAndRestore()
        }
      }, 100)
    } else {
      // Если мы в режиме чатов и есть активный представитель, обновляем основной список
      if (this.currentRepresentative) {
        setTimeout(() => {
          this.waitForRepresentativesToRestoreMainList()
        }, 100)
      }
    }
    
    // Обновляем заголовок чата
    this.updateChatHeader()
  }

  waitForRepresentativesAndRestore() {
    const checkRepresentatives = () => {
      if (this.representatives.length > 0) {
        // Применяем сохраненный порядок представителей если есть
        this.applySavedRepresentativesOrder()
        
        const rep = this.representatives.find(r => r.profile === this.currentRepresentative.profile)
        if (rep) {
          // Перемещаем активного представителя в начало списка
          this.moveRepresentativeToTop(rep.profile)
          this.updateRepresentativesList()
          this.selectRepresentative(rep)
        }
      } else {
        setTimeout(checkRepresentatives, 200)
      }
    }
    checkRepresentatives()
  }

  applySavedRepresentativesOrder() {
    if (!this.savedRepresentativesOrder || !Array.isArray(this.savedRepresentativesOrder)) {
      return
    }

    // Сортируем представителей согласно сохраненному порядку
    const orderedReps = []
    const remainingReps = [...this.representatives]

    // Сначала добавляем представителей в сохраненном порядке
    this.savedRepresentativesOrder.forEach(profileId => {
      const repIndex = remainingReps.findIndex(rep => rep.profile === profileId)
      if (repIndex !== -1) {
        orderedReps.push(remainingReps.splice(repIndex, 1)[0])
      }
    })

    // Затем добавляем оставшихся представителей
    orderedReps.push(...remainingReps)

    this.representatives = orderedReps
    
    // Очищаем сохраненный порядок после применения
    this.savedRepresentativesOrder = null
  }

  waitForRepresentativesToRestoreMainList() {
    const checkRepresentatives = () => {
      if (this.representatives.length > 0) {
        // Применяем сохраненный порядок представителей если есть
        this.applySavedRepresentativesOrder()
        
        const rep = this.representatives.find(r => r.profile === this.currentRepresentative.profile)
        if (rep) {
          // Перемещаем активного представителя в начало списка
          this.moveRepresentativeToTop(rep.profile)
          // Показываем представителя в основном списке чатов
          this.showRepresentativeInMainList(rep.profile)
        }
      } else {
        setTimeout(checkRepresentatives, 200)
      }
    }
    checkRepresentatives()
  }

  updateChatHeader() {
    const chatHeader = document.getElementById('chat-header')
    if (!chatHeader) return
    
    if (this.currentRoom === 'announcements') {
      chatHeader.innerHTML = `<span>Объявления</span>`
    } else if (this.currentRoom === 'representatives') {
      if (this.currentRepresentative) {
        const headerAvatarContent = this.currentRepresentative.image 
          ? `<img src="${this.currentRepresentative.image}" alt="${this.currentRepresentative.full_name_ru}" class="w-8 h-8 rounded-full object-cover">`
          : `<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
               <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                 <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
               </svg>
             </div>`
        
        chatHeader.innerHTML = `
          <div class="flex items-center gap-3">
            ${headerAvatarContent}
            <div>
              <div class="font-semibold">${this.currentRepresentative.full_name_ru}</div>
              ${this.currentRepresentative.country ? `<div class="text-sm text-gray-500">
                <img src="https://flagcdn.com/20x15/${this.currentRepresentative.country.toLowerCase()}.png" 
                     alt="${this.currentRepresentative.country}" 
                     class="inline w-5 h-3 mr-1">
                ${this.currentRepresentative.country}
              </div>` : ''}
            </div>
          </div>
        `
      } else {
        chatHeader.innerHTML = `<span>Представители стран</span>`
      }
    }
  }

  initializeElements() {
    this.messageInput = document.querySelector('.chatarea')
    this.sendButton = document.querySelector('button[class*="text-orange-500"]')
    this.attachButton = document.querySelector('button[class*="text-gray-400"]')
    this.chatContent = document.getElementById('chat-content')
    this.messageInputContainer = document.getElementById('message-input-container')
    this.errorMessage = document.getElementById('error-message')
    this.errorMessageText = document.getElementById('error-message-text')
    
    // Элементы для переключения панелей
    this.chatModeContent = document.getElementById('chat-mode-content')
    this.representativesContent = document.getElementById('representatives-content')
    this.backToChatButton = document.getElementById('back-to-chat')
    this.unifiedSearch = document.getElementById('unified-search')
    this.representativesList = document.getElementById('representatives-list')
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

      // Обработчик для скрытия ошибок валидации при клике на input
      this.messageInput.addEventListener('click', () => {
        if (this.currentErrorType === 'validation') {
          this.hideErrorMessage()
        }
      })
      
      this.messageInput.addEventListener('focus', () => {
        if (this.currentErrorType === 'validation') {
          this.hideErrorMessage()
        }
      })
    }

    // Прикрепление файлов
    if (this.attachButton) {
      this.attachButton.addEventListener('click', () => this.attachFile())
    }

    // Кнопка "Назад" к чатам
    if (this.backToChatButton) {
      this.backToChatButton.addEventListener('click', () => this.showChatMode())
    }

    // Единый поиск
    if (this.unifiedSearch) {
      this.unifiedSearch.addEventListener('input', (e) => {
        const query = e.target.value.trim()
        
        // Поиск работает только если мы уже в режиме представителей
        if (this.representativesContent && !this.representativesContent.classList.contains('hidden')) {
          this.searchRepresentatives(query)
        }
      })
    }
  }

  async connectWebSocket() {
    if (this.isConnectingPublic || (this.websocket && this.websocket.readyState === WebSocket.OPEN)) {
      return;
    }
    this.isConnectingPublic = true;
    // Проверяем, нет ли уже активного соединения
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      return
    }

    const token = localStorage.getItem('access_token')
    if (!token) {
      this.showConnectionError('Токен доступа не найден')
      return
    }

    if (this.currentRoom === 'announcements') {
      // Показываем лоадер
      this.showLoader()
      
      const wsUrl = `wss://portal.femo.kz/ws/chat/announcements/?token=${token}`
      
      try {
        this.websocket = new WebSocket(wsUrl)
        
        this.websocket.onopen = () => {
          this.hideLoader()
          
          // Убираем красную рамку при успешном подключении
          this.clearErrorState()
        }

        this.websocket.onmessage = (event) => {
          const data = JSON.parse(event.data)
          this.handleMessage(data)
        }

        this.websocket.onclose = (event) => {
          this.hideLoader()
          
          // Переподключаемся только если нужно и не закрыто намеренно
          if (event.code !== 1000 && this.shouldReconnectPublic && this.currentRoom === 'announcements') {
            setTimeout(() => {
              if (this.shouldReconnectPublic && this.currentRoom === 'announcements') {
                this.connectWebSocket()
              }
            }, 3000)
          }
        }

        this.websocket.onerror = (error) => {
          console.error('Ошибка WebSocket:', error)
          
          // Не показываем ошибку если закрываем намеренно
          if (!this.isClosingIntentionally) {
            this.showConnectionError('Ошибка подключения к чату')
          }
        }
      } catch (error) {
        console.error('Ошибка подключения к WebSocket:', error)
        this.hideLoader()
      }
      finally {
        this.isConnectingPublic = false;
      }
    }
  }

  async sendMessage() {
    const messageText = this.messageInput.value.trim()
    
    // Проверка наличия текста или файла
    if (!messageText && !this.attachedFile) {
      this.showErrorMessage('Введите сообщение или прикрепите файл', 'validation')
      return
    }
    // Сохраняем лог в консоль
    console.log('[SEND] ▶️ Отправляем текст на сервер:', messageText, 
                'pendingMessageTime=', this.pendingMessageTime);

    try {
      // Определяем, какой WebSocket использовать
      const isPrivateChat = this.currentRoom === 'representatives' && this.currentRepresentative
      const websocketToUse = isPrivateChat ? this.privateWebsockets.get(this.currentRepresentative.profile) : this.websocket

      if (!websocketToUse || websocketToUse.readyState !== WebSocket.OPEN) {
        this.showConnectionError(isPrivateChat ? 'Приватный чат не подключен' : 'Чат не подключен')
        return
      }

      // Если есть только файл без текста - отправляем только файл
      if (!messageText && this.attachedFile) {
        // Отправляем только файл через HTTP запрос
        if (isPrivateChat) {
          await this.uploadPrivateFile(this.currentPrivateRoomId, this.attachedFile)
        } else {
          await this.uploadFile(this.attachedFile)
        }
        
        // Очищаем файл и поле ввода
        this.clearAllFiles()
        this.messageInput.value = ''
        this.messageInput.style.height = '5px'
        this.messageInput.style.height = this.messageInput.scrollHeight + 'px'
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

        websocketToUse.send(JSON.stringify(messageData))

        // Очищаем поле ввода
        this.messageInput.value = ''
        this.messageInput.style.height = '5px'
        this.messageInput.style.height = this.messageInput.scrollHeight + 'px'

        // Убираем отображение прикрепленного файла (но сохраняем сам файл для отправки)
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

  handleMessage(data) {
    if (data.message) {
      // Сохраняем последнее сообщение для объявлений
      this.lastMessages.set('announcements', data.message.content)
      
      // Добавляем сообщение в чат
      this.addMessageToChat(data.message, true)
      
      // Проверяем, нужно ли отправить файл после текстового сообщения
      if (this.pendingFile && this.isOurMessage(data.message)) {
        if (this.currentRoom === 'announcements') {
          this.uploadFile(this.pendingFile)
        } else if (this.currentRoom === 'representatives' && this.currentPrivateRoomId) {
          this.uploadPrivateFile(this.currentPrivateRoomId, this.pendingFile)
        }
        this.clearAllFiles()
      }
    } else if (data.messages) {
      // История сообщений
      this.loadMessageHistory(data.messages)
    }
  }

  loadMessageHistory(messages) {
    const announcementsChat = document.getElementById('announcements-chat')
    if (!announcementsChat) return

    // Удаляем заглушку если она есть
    const placeholder = announcementsChat.querySelector('.chat-placeholder')
    if (placeholder) {
      placeholder.remove()
    }

    // Сортируем сообщения по дате (старые сверху)
    const sortedMessages = messages.sort((a, b) => 
      new Date(a.created_at) - new Date(b.created_at)
    )

    // Обновляем превью последнего сообщения для объявлений
    if (sortedMessages.length > 0) {
      const lastMessage = sortedMessages[sortedMessages.length - 1]
      this.lastMessages.set('announcements', lastMessage.content)
    }

    // Добавляем все сообщения
    sortedMessages.forEach(messageData => {
      this.addMessageToChat(messageData, false) // false = не прокручивать после каждого
    })

    // Прокручиваем к концу после загрузки всех сообщений
    this.scrollToBottom()
  }

  addMessageToChat(messageData, shouldScroll = true) {
    const announcementsChat = document.getElementById('announcements-chat')
    if (!announcementsChat) return
    // 1) DEDUPE: если уже есть сообщение с таким id — выходим
    if (announcementsChat.querySelector(`[data-message-id="${messageData.id}"]`)) {
      console.warn('[DEDUP] сообщение с id=', messageData.id, 'уже в DOM');
      return;
    }
    // Удаляем заглушку если она есть
    const placeholder = announcementsChat.querySelector('.chat-placeholder')
    if (placeholder) {
      placeholder.remove()
    }

    // Проверяем нужно ли добавить метку времени
    const messageDate = messageData.created_at ? new Date(messageData.created_at) : new Date()
    this.addDateLabelIfNeeded(announcementsChat, messageDate)

    // Определяем, наше ли это сообщение
    const isOurMessage = this.isOurMessage(messageData)

    // Создаем HTML для нового сообщения
    const messageElement = document.createElement('div');
    messageElement.dataset.messageId = messageData.id;
    messageElement.className = `message flex gap-3 mb-4 ${
      this.isOurMessage(messageData) ? 'justify-end' : 'justify-start'
    }`;

    
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

    // Обрабатываем файл (единый стиль для всех типов файлов)
    let fileHtml = ''
    if (messageData.file) {
      const fileUrl = messageData.file.startsWith('http') 
        ? messageData.file 
        : `https://portal.femo.kz${messageData.file}`
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
    
    // Определяем аватар и роль в зависимости от отправителя
    let avatarSrc, senderRole
    if (isOurMessage) {
      // Наше сообщение - берем аватарку из localStorage
      try {
        const userData = localStorage.getItem('user')
        if (userData) {
          const user = JSON.parse(userData)
          const userImage = user.profile.image
          avatarSrc = userImage.startsWith('http') 
            ? userImage 
            : `https://portal.femo.kz${userImage}`
        } else {
          avatarSrc = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=40&h=40&auto=format&fit=crop&q=60"
        }
      } catch (error) {
        console.error('Ошибка при получении аватарки пользователя:', error)
        avatarSrc = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=40&h=40&auto=format&fit=crop&q=60"
      }
      senderRole = "(Администратор)"
    } else {
      avatarSrc = "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&auto=format&fit=crop&q=60"
      senderRole = "(Участник)"
    }

    if (isOurMessage) {
      // Наше сообщение - аватар справа
      messageElement.innerHTML = `
        <div class="${messageContainerClass}">
          <div class="mb-1 flex items-center gap-4 text-sm font-bold justify-end">
            <div class="flex items-center gap-2">
              <span>${messageData.sender_name || 'Администратор'}</span>
              <span>${senderRole}</span>
            </div>
            <img
              src="${avatarSrc}"
              alt="Avatar"
              class="h-8 w-8 rounded-full"
            />
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
        <img
          src="${avatarSrc}"
          alt="Avatar"
          class="h-8 w-8 rounded-full self-start"
        />
        <div class="${messageContainerClass}">
          <div class="mb-1 flex items-center gap-2 text-sm font-bold">
            <span>${messageData.sender_name || 'Участник'}</span>
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
    announcementsChat.appendChild(messageElement)
    
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
    fileInput.accept = '*/*' // Принимаем любые файлы
    
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
    const attachedFilesArea = document.getElementById('attached-files')
    const attachedFileItem = document.getElementById('attached-file-item')
    
    if (!attachedFilesArea || !attachedFileItem) return

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
    attachedFileItem.innerHTML = `
      <div class="flex items-center gap-3 flex-1">
        <span class="text-2xl">${fileIcon}</span>
        <div class="flex-1">
          <div class="font-medium text-sm text-gray-800">${fileName}</div>
          <div class="text-xs text-gray-500">${fileSize}</div>
        </div>
      </div>
      <button 
        class="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors"
        onclick="adminChat.removeAttachedFile()"
        title="Удалить файл"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    `

    // Показываем область с файлом
    attachedFilesArea.classList.remove('hidden')
  }

  removeAttachedFile() {
    const attachedFilesArea = document.getElementById('attached-files')
    
    // Удаляем только attachedFile, НЕ pendingFile (он нужен для отправки)
    this.attachedFile = null
    // this.pendingFile = null - НЕ очищаем здесь!
    
    // Скрываем область с файлом
    if (attachedFilesArea) {
      attachedFilesArea.classList.add('hidden')
    }
  }

  clearAllFiles() {
    // Полная очистка всех файлов (используется после успешной отправки)
    this.attachedFile = null
    this.pendingFile = null
    
    const attachedFilesArea = document.getElementById('attached-files')
    if (attachedFilesArea) {
      attachedFilesArea.classList.add('hidden')
    }
    
    // Также очищаем ошибки
    this.hideErrorMessage()
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  isOurMessage(message) {
    // Сначала проверяем по Profile ID пользователя
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
      
      // Если время и содержимое совпадают (в пределах 30 секунд), это наше сообщение
      return timeDiff < 30000 && contentMatches
    }
    
    return false
  }

  async uploadFile(file) {
    try {
      const formData = new FormData()
      formData.append('file', file)

      // Для объявлений всегда используем ID комнаты = 1
      const url = `https://portal.femo.kz/api/chats/rooms/1/attachments/`

      const response = await authorizedFetch(url, {
        method: 'POST',
        body: formData,
        // НЕ указываем Content-Type - браузер сам установит multipart/form-data с boundary
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ошибка загрузки: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      this.showSuccessMessage(`Файл "${file.name}" успешно прикреплен`)
      
    } catch (error) {
      console.error('Ошибка загрузки файла в объявления:', error)
      this.showErrorMessage('Не удалось загрузить файл: ' + error.message)
    }
  }

  switchRoom(roomName) {
    this.currentRoom = roomName
    
    // Сохраняем состояние при переключении комнаты
    this.saveChatState()
    
    // Очищаем прикрепленные файлы и поле ввода
    this.clearAllFiles()
    if (this.messageInput) {
      this.messageInput.value = ''
      this.messageInput.style.height = '5px'
      this.messageInput.style.height = this.messageInput.scrollHeight + 'px'
    }
    
    // Скрываем все чаты
    document.querySelectorAll('.chat-content').forEach(chat => {
      chat.classList.remove('active', 'flex')
      chat.classList.add('hidden')
      chat.style.display = 'none'
    })
    
    // Показываем выбранный чат
    const selectedChat = document.querySelector(`#${roomName}-chat`)
    if (selectedChat) {
      selectedChat.classList.remove('hidden')
      selectedChat.classList.add('active', 'flex')
      selectedChat.style.display = 'flex'
    }
    
    // Подключаемся к нужному чату после небольшой задержки
    setTimeout(() => {
      if (roomName === 'announcements') {
        this.shouldReconnectPublic = true
        this.currentRepresentative = null
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
          this.connectWebSocket()
        }
      } else if (roomName === 'representatives') {
        // Приватные WebSocket'ы уже подключены ко всем представителям
        // Конкретный чат подключится при выборе представителя
      }
    }, 100) // Небольшая задержка для корректного закрытия соединений
  }

  scrollToBottom() {
    const activeChatContent = this.currentRoom === 'announcements' 
      ? document.getElementById('announcements-chat')
      : document.getElementById('representatives-chat')
    
    if (activeChatContent) {
      // Прокручиваем контейнер чата
      const chatContainer = document.getElementById('chat-content')
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight
      }
    }
  }

  showLoader() {
    const announcementsChat = document.getElementById('announcements-chat')
    if (!announcementsChat) return

    // Проверяем, нет ли уже лоадера
    const existingLoader = announcementsChat.querySelector('.loader-container')
    if (existingLoader) {
      return
    }

    // Убираем заглушку если она есть
    const placeholder = announcementsChat.querySelector('.chat-placeholder')
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
    
    announcementsChat.appendChild(loaderElement)
  }

  hideLoader() {
    const announcementsChat = document.getElementById('announcements-chat')
    if (!announcementsChat) return

    // Удаляем все лоадеры
    const loaders = announcementsChat.querySelectorAll('.loader-container')
    loaders.forEach(loader => {
      loader.remove()
    })

    // Если чат пустой после удаления лоадера, добавляем заглушку
    if (announcementsChat.children.length === 0) {
      const placeholder = document.createElement('div')
      placeholder.className = 'chat-placeholder flex items-center justify-center flex-1 text-gray-400'
      placeholder.innerHTML = `
        <div class="text-center">
          <p class="text-base">Пока нет сообщений</p>
        </div>
      `
      announcementsChat.appendChild(placeholder)
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
    // Ошибки подключения и валидации не исчезают автоматически
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

  showLoadingMessage(message) {
    // Можно добавить индикатор загрузки
  }

  hideLoadingMessage() {
    // Скрываем индикатор загрузки
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

  // Переключение между режимами панели
  showRepresentativesMode() {
    // Сохраняем состояние при переходе в режим представителей
    this.saveChatState()
    
    // Скрываем контент чатов
    if (this.chatModeContent) {
      this.chatModeContent.classList.add('hidden')
    }
    
    // Показываем контент представителей
    if (this.representativesContent) {
      this.representativesContent.classList.remove('hidden')
    }
    
    // Показываем кнопку "Назад"
    if (this.backToChatButton) {
      this.backToChatButton.classList.remove('hidden')
      this.backToChatButton.classList.add('flex')
    }
    
    // Показываем заглушку выбора представителя в правой части
    this.showRepresentativesPlaceholder()
    
    // Загружаем список представителей если еще не загружен или если нужно обновить
    if (!this.representativesLoaded || this.representatives.length === 0) {
      this.loadRepresentatives('')
    } else {
      // Если представители уже загружены, просто обновляем отображение
      console.log('showRepresentativesMode: Рендерим список представителей с предзагруженными сообщениями')
      this.renderRepresentativesList({ results: this.representatives })
    }
  }

  showChatMode() {
    // Сохраняем состояние при возврате в режим чатов
    this.currentRepresentative = null
    this.saveChatState()
    
    // Очищаем прикрепленные файлы и поле ввода
    this.clearAllFiles()
    if (this.messageInput) {
      this.messageInput.value = ''
      this.messageInput.style.height = '5px'
      this.messageInput.style.height = this.messageInput.scrollHeight + 'px'
    }
    
    // Показываем контент чатов
    if (this.chatModeContent) {
      this.chatModeContent.classList.remove('hidden')
    }
    
    // Скрываем контент представителей
    if (this.representativesContent) {
      this.representativesContent.classList.add('hidden')
    }
    
    // Скрываем кнопку "Назад"
    if (this.backToChatButton) {
      this.backToChatButton.classList.add('hidden')
      this.backToChatButton.classList.remove('flex')
    }
    
    // Убираем активное выделение со всех представителей
    if (this.representativesList) {
      this.representativesList.querySelectorAll('.representative-item').forEach(item => {
        item.classList.remove('bg-[#FBFBFB]')
      })
    }
    
    // Очищаем старые элементы представителей из основного списка
    this.clearRepresentativesFromMainList()
    
    // Возвращаемся к чату объявлений
    this.switchToAnnouncementsChat()
    
    // Очищаем поиск
    if (this.unifiedSearch) {
      this.unifiedSearch.value = ''
    }
    
    // Подключаемся к объявлениям если не подключены
    setTimeout(() => {
      this.shouldReconnectPublic = true
      this.currentRoom = 'announcements'
      if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        this.connectWebSocket()
      }
    }, 100)
  }

  // НОВЫЙ МЕТОД: Очистить всех представителей из основного списка
  clearRepresentativesFromMainList() {
    const chatModeContent = document.getElementById('chat-mode-content')
    if (!chatModeContent) return
    
    const representativeChats = chatModeContent.querySelectorAll('[data-representative-id]')
    representativeChats.forEach(chat => chat.remove())
  }

  switchToAnnouncementsChat() {
    // Убираем активные стили у всех вкладок
    document.querySelectorAll('.chat-tab').forEach(tab => {
      tab.classList.remove('active', 'bg-gray-50')
    })
    
    // Добавляем активные стили к вкладке объявлений
    const announcementsTab = document.querySelector('.chat-tab[data-tab="announcements"]')
    if (announcementsTab) {
      announcementsTab.classList.add('active', 'bg-gray-50')
    }
    
    // Скрываем все чаты
    document.querySelectorAll('.chat-content').forEach(chat => {
      chat.classList.remove('active', 'flex')
      chat.classList.add('hidden')
      chat.style.display = 'none'
    })
    
    // Показываем чат объявлений
    const announcementsChat = document.querySelector('#announcements-chat')
    if (announcementsChat) {
      announcementsChat.classList.remove('hidden')
      announcementsChat.classList.add('active', 'flex')
      announcementsChat.style.display = 'flex'
    }
    
    // Обновляем заголовок чата
    const chatHeader = document.getElementById('chat-header')
    if (chatHeader) {
      chatHeader.innerHTML = `<span>Объявления</span>`
    }
    
    // Переключаем комнату
    this.currentRoom = 'announcements'
  }

  async loadRepresentatives(search = '') {
    try {
      const url = search 
        ? `https://portal.femo.kz/api/chats/representatives/?search=${encodeURIComponent(search)}`
        : 'https://portal.femo.kz/api/chats/representatives/'
      
      const response = await authorizedFetch(url)
      
      if (!response.ok) {
        throw new Error(`Ошибка загрузки: ${response.status}`)
      }
      
      const data = await response.json()
      
      // Если это поиск, не обновляем основной список представителей
      if (search) {
        this.renderRepresentativesList(data)
      } else {
        this.representatives = data.results || []
        this.renderRepresentativesList(data)
      }
      
    } catch (error) {
      console.error('Ошибка загрузки представителей:', error)
      this.showErrorMessage('Не удалось загрузить список представителей')
    }
  }

  async initializeAllChats() {
    // Подключаемся к объявлениям
    this.connectWebSocket()
    
    // Загружаем всех представителей и подключаемся к их чатам
    await this.loadAllRepresentatives()
    
    // Предварительно загружаем последние сообщения для всех представителей
    await this.preloadLastMessages()
  }

  async preloadLastMessages() {
    if (!this.representatives || this.representatives.length === 0) {
      console.log('preloadLastMessages: Нет представителей для предзагрузки')
      return
    }

    console.log(`preloadLastMessages: Начинаем предзагрузку для ${this.representatives.length} представителей`)

    // Предзагружаем последние сообщения для каждого представителя
    const preloadPromises = this.representatives.map(async (representative) => {
      try {
        const url = `https://portal.femo.kz/api/chats/private/${representative.profile}/messages/?limit=1&ordering=-created_at`
        console.log(`Запрос последнего сообщения для ${representative.full_name_ru} (${representative.profile}):`, url)
        
        const response = await authorizedFetch(url)
        
        if (response.ok) {
          const data = await response.json()
          console.log(`Ответ для ${representative.full_name_ru}:`, data)
          
          if (data.results && data.results.length > 0) {
            const lastMessage = data.results[0]
            this.lastMessages.set(representative.profile, lastMessage.content)
            console.log(`Сохранено последнее сообщение для ${representative.full_name_ru}: "${lastMessage.content}"`)
          } else {
            console.log(`Нет сообщений для ${representative.full_name_ru}`)
          }
        } else {
          console.warn(`Ошибка HTTP ${response.status} для ${representative.full_name_ru}`)
        }
      } catch (error) {
        console.error(`Ошибка предзагрузки сообщений для ${representative.full_name_ru} (${representative.profile}):`, error)
      }
    })

    // Ждем завершения всех запросов
    const results = await Promise.allSettled(preloadPromises)
    const successful = results.filter(r => r.status === 'fulfilled').length
    console.log(`preloadLastMessages: Завершено ${successful}/${results.length} запросов`)
    
    // Обновляем отображение списков после предзагрузки
    this.updateRepresentativesList()
    
    // Принудительно обновляем интерфейс представителей если он уже отображается
    if (this.representativesContent && !this.representativesContent.classList.contains('hidden')) {
      console.log('preloadLastMessages: Обновляем интерфейс представителей после предзагрузки')
      this.renderRepresentativesList({ results: this.representatives })
    }
    
    // Если мы в режиме чатов, показываем представителей с последними сообщениями
    if (this.chatModeContent && !this.chatModeContent.classList.contains('hidden')) {
      console.log('preloadLastMessages: Заполняем основной список чатов представителями с сообщениями')
      
      // Сначала сортируем представителей по наличию сообщений (с сообщениями в начале)
      const representativesWithMessages = this.representatives.filter(rep => this.lastMessages.has(rep.profile))
      const representativesWithoutMessages = this.representatives.filter(rep => !this.lastMessages.has(rep.profile))
      
      // Показываем всех представителей с сообщениями в основном списке
      representativesWithMessages.forEach(rep => {
        console.log(`Добавляем в основной список: ${rep.full_name_ru} с сообщением: "${this.lastMessages.get(rep.profile)}"`)
        this.updateMainChatList(rep)
      })
      
      console.log(`Показано ${representativesWithMessages.length} чатов с сообщениями из ${this.representatives.length} представителей`)
    }
    
    console.log(`preloadLastMessages: Всего загружено сообщений: ${this.lastMessages.size}`)
  }

  async loadAllRepresentatives() {
    try {
      const response = await authorizedFetch('https://portal.femo.kz/api/chats/representatives/')
      
      if (!response.ok) {
        throw new Error(`Ошибка загрузки: ${response.status}`)
      }
      
      const data = await response.json()
      this.representatives = data.results || []
      
      // Подключаемся ко всем приватным чатам
      for (const representative of this.representatives) {
        this.connectToRepresentativeChat(representative.profile)
      }
      
      this.representativesLoaded = true
      
      // Если интерфейс представителей уже отображается, обновляем его
      if (this.representativesContent && !this.representativesContent.classList.contains('hidden')) {
        console.log('loadAllRepresentatives: Обновляем интерфейс представителей после загрузки данных')
        this.renderRepresentativesList({ results: this.representatives })
      }
      
    } catch (error) {
      console.error('Ошибка загрузки всех представителей:', error)
    }
  }

  async connectToRepresentativeChat(profileId) {
    // Проверяем, нет ли уже активного соединения для этого представителя
    if (this.privateWebsockets.has(profileId)) {
      const existingWs = this.privateWebsockets.get(profileId)
      if (existingWs.readyState === WebSocket.OPEN) {
        return
      }
    }

    const token = localStorage.getItem('access_token')
    if (!token) {
      console.error('Токен доступа не найден для подключения к чату представителя:', profileId)
      return
    }

    try {
      const wsUrl = `wss://portal.femo.kz/ws/chat/private/${profileId}/?token=${token}`
      const websocket = new WebSocket(wsUrl)

      websocket.onopen = () => {
        console.log(`Подключено к приватному чату с представителем ${profileId}`)
      }

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleRepresentativeMessage(data, profileId)
        } catch (error) {
          console.error('Ошибка парсинга сообщения от представителя:', error)
        }
      }

      websocket.onclose = (event) => {
        // Переподключаемся если соединение разорвано не намеренно
        if (event.code !== 1000 && !this.isClosingIntentionally) {
          setTimeout(() => {
            this.connectToRepresentativeChat(profileId)
          }, 5000)
        }
      }

      websocket.onerror = (error) => {
        console.error(`Ошибка WebSocket для представителя ${profileId}:`, error)
      }

      // Сохраняем WebSocket для этого представителя
      this.privateWebsockets.set(profileId, websocket)

    } catch (error) {
      console.error(`Ошибка подключения к приватному чату представителя ${profileId}:`, error)
    }
  }

handleRepresentativeMessage(data, profileId) {
  if (data.message) {
    // 1) Сохраняем последнее сообщение и сразу же обновляем контакт-лист
    this.lastMessages.set(profileId, data.message.content)
    this.updateRepresentativesList()
    this.showRepresentativeInMainList(profileId)

    // 2) Добавляем в историю
    if (!this.privateMessageHistories.has(profileId)) {
      this.privateMessageHistories.set(profileId, [])
    }
    this.privateMessageHistories.get(profileId).push(data.message)

    // 3) Если это чужое сообщение — метим как непрочитанное и перемещаем наверх
    if (!this.isOurPrivateMessageByProfileId(data.message, profileId)) {
      this.markChatAsUnread(profileId)
      this.moveRepresentativeToTop(profileId)
    }

    // 4) Рендерим в окне чата только чужие сообщения
    if (
      this.currentRepresentative &&
      this.currentRepresentative.profile === profileId &&
      !this.isOurPrivateMessageByProfileId(data.message, profileId)
    ) {
      this.handlePrivateMessage(data)
    }

  } else if (data.messages) {
    // История
    this.privateMessageHistories.set(profileId, data.messages)
    if (data.messages.length > 0) {
      const lastMessage = data.messages[data.messages.length - 1]
      this.lastMessages.set(profileId, lastMessage.content)
      this.updateRepresentativesList()
      this.showRepresentativeInMainList(profileId)
    }
    if (this.currentRepresentative && this.currentRepresentative.profile === profileId) {
      this.handlePrivateMessage(data)
    }
  }
}


  isOurPrivateMessageByProfileId(message, profileId) {
    // Проверяем по Profile ID пользователя
    try {
      const userData = localStorage.getItem('user')
      if (userData) {
        const user = JSON.parse(userData)
        return message.sender_id === user.profile.id
      }
    } catch (error) {
      console.error('Ошибка при получении данных пользователя:', error)
    }
    return false
  }

  markChatAsUnread(profileId) {
    // ИСПРАВЛЕНО: Правильно меняем статус с прочитанного на непрочитанный
    this.unreadChats.add(profileId)
    this.readChats.delete(profileId) // Убираем из прочитанных если был там
    this.lastMessageTimes.set(profileId, Date.now())
  }

  markChatAsRead(profileId) {
    this.unreadChats.delete(profileId)
    this.readChats.add(profileId)
  }

  moveRepresentativeToTop(profileId) {
    // Находим представителя в списке
    const repIndex = this.representatives.findIndex(rep => rep.profile === profileId)
    if (repIndex > 0) {
      // Перемещаем его в начало списка
      const representative = this.representatives.splice(repIndex, 1)[0]
      this.representatives.unshift(representative)
    }
  }

  updateRepresentativesList() {
    if (!this.representativesList) return
    
    // Перерендериваем список представителей с учетом новых статусов
    this.renderRepresentativesList({ results: this.representatives })
  }

  renderRepresentativesList(data) {
    if (!this.representativesList) return
    
    // Очищаем список
    this.representativesList.innerHTML = ''
    
    // Определяем массив представителей из API ответа
    let representatives = data.results || []
    
    if (!representatives || representatives.length === 0) {
      this.representativesList.innerHTML = `
        <div class="flex items-center justify-center py-8 text-gray-500">
          <p>Представители не найдены</p>
        </div>
      `
      return
    }
    
    // Рендерим каждого представителя
    representatives.forEach(rep => {
      const representativeElement = document.createElement('div')
      const hasUnread = this.unreadChats.has(rep.profile)
      const hasRead = this.readChats.has(rep.profile)
      
      // Определяем статус чата и соответствующую иконку
      let statusIcon = ''
      if (hasUnread) {
        // Новое сообщение - оранжевая точка
        statusIcon = `
          <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="8" r="3" fill="#F4891E"/>
          </svg>
        `
      } else {
        // Прочитано или без статуса - зеленая галочка
        statusIcon = `
          <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.0001 5.16656L11.0601 4.22656L6.83344 8.45323L7.77344 9.39323L12.0001 5.16656ZM14.8268 4.22656L7.77344 11.2799L4.98677 8.4999L4.04677 9.4399L7.77344 13.1666L15.7734 5.16656L14.8268 4.22656ZM0.273438 9.4399L4.0001 13.1666L4.9401 12.2266L1.2201 8.4999L0.273438 9.4399Z" fill="#0DB459"/>
          </svg>
        `
      }
      
      representativeElement.className = 'representative-item mx-4 mb-4 p-4 rounded-lg cursor-pointer hover:bg-[#FBFBFB] transition-colors'
      representativeElement.onclick = () => this.selectRepresentative(rep)
      representativeElement.dataset.profile = rep.profile // Добавляем ID для идентификации
      
      // Создаем аватарку или SVG по умолчанию
      const avatarContent = rep.image 
        ? `<img src="${rep.image}" alt="${rep.full_name_ru}" class="w-10 h-10 rounded-full object-cover">`
        : `<div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
             <svg class="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
               <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
             </svg>
           </div>`

      representativeElement.innerHTML = `
        <div class="flex items-center gap-3">
          ${avatarContent}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="font-bold text-sm text-[#222222] truncate" style="max-width: 160px;">${rep.full_name_ru}</p>
              ${rep.country ? `<div class="flex items-center gap-1 text-sm text-gray-500 flex-shrink-0">
                <img src="https://flagcdn.com/w20/${rep.country.toLowerCase()}.png"
                    srcset="https://flagcdn.com/w40/${rep.country.toLowerCase()}.png 2x"
                    alt="${rep.country}" 
                    class="w-5 h-3 flex-shrink-0">
              </div>` : ''}
            </div>
            <p class="text-xs text-[#222222] truncate">${this.getLastMessagePreview(rep.profile)}</p>
          </div>
          <div class="flex items-center justify-center w-6 h-6 flex-shrink-0">
            ${statusIcon}
          </div>
        </div>
      `
      
      this.representativesList.appendChild(representativeElement)
    })
  }

  getLastMessagePreview(profileId) {
    const lastMessage = this.lastMessages.get(profileId)
    if (lastMessage) {
      // Обрезаем сообщение если оно слишком длинное
      return lastMessage.length > 40 ? lastMessage.substring(0, 40) + '...' : lastMessage
    }
    return 'Нет сообщений'
  }

  selectRepresentative(representative) {
    // Останавливаем все соединения перед подключением к приватному чату
    this.stopAllConnections()
    
    // ИСПРАВЛЕНО: Отмечаем чат как прочитанный при его открытии
    // Все чаты при открытии становятся прочитанными
    this.markChatAsRead(representative.profile)
    this.updateRepresentativesList()
    
    // Убираем чат представителя из основного списка если он там есть
    this.removeRepresentativeFromMainList(representative.profile)
    
    // Сбрасываем room_id при смене представителя
    this.currentPrivateRoomId = null
    
    // Убираем активное выделение со всех представителей
    this.representativesList.querySelectorAll('.representative-item').forEach(item => {
      item.classList.remove('bg-[#FBFBFB]')
    })
    
    // Добавляем активное выделение к выбранному представителю
    const selectedElement = this.representativesList.querySelector(`[data-profile="${representative.profile}"]`)
    if (selectedElement) {
      selectedElement.classList.add('bg-[#FBFBFB]')
    }
    
    // Сохраняем текущего представителя
    this.currentRepresentative = representative
    
    // Переключаемся на чат с представителями
    this.switchRoom('representatives')
    
    // Обновляем заголовок чата
    const chatHeader = document.getElementById('chat-header')
    
    // Создаем аватарку или SVG по умолчанию для заголовка
    const headerAvatarContent = representative.image 
      ? `<img src="${representative.image}" alt="${representative.full_name_ru}" class="w-8 h-8 rounded-full object-cover">`
      : `<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
           <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
             <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
           </svg>
         </div>`
    
    chatHeader.innerHTML = `
      <div class="flex items-center gap-3">
        ${headerAvatarContent}
        <div>
          <div class="font-semibold">${representative.full_name_ru}</div>
          ${representative.country ? `<div class="text-sm text-gray-500">
            <img src="https://flagcdn.com/20x15/${representative.country.toLowerCase()}.png" 
                 alt="${representative.country}" 
                 class="inline w-5 h-3 mr-1">
            ${representative.country}
          </div>` : ''}
        </div>
      </div>
    `
    
    // Проверяем, есть ли предзагруженная история сообщений
    const representativesChat = document.getElementById('representatives-chat')
    const preloadedHistory = this.privateMessageHistories.get(representative.profile)
    
    if (preloadedHistory && preloadedHistory.length > 0) {
      // Показываем предзагруженную историю сразу
      representativesChat.innerHTML = ''
      this.loadPrivateMessageHistory(preloadedHistory)
    } else {
      // Показываем лоадер если истории нет
      representativesChat.innerHTML = `
        <div class="flex items-center justify-center flex-1">
          <div class="flex items-center gap-3 text-gray-500">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
            <span>Подключение к чату...</span>
          </div>
        </div>
      `
    }
    
    // Сохраняем состояние чата
    this.saveChatState()
    
    // Подключаемся к приватному WebSocket после задержки
    setTimeout(() => {
      this.shouldReconnectPrivate = true
      this.connectPrivateWebSocket(representative.profile)
    }, 200)
  }

  // НОВЫЙ МЕТОД: Убрать представителя из основного списка
  removeRepresentativeFromMainList(profileId) {
    const chatModeContent = document.getElementById('chat-mode-content')
    if (!chatModeContent) return
    
    const representativeChat = chatModeContent.querySelector(`[data-representative-id="${profileId}"]`)
    if (representativeChat) {
      representativeChat.remove()
    }
  }

  showRepresentativesPlaceholder() {
    // Скрываем все чаты
    document.querySelectorAll('.chat-content').forEach(chat => {
      chat.classList.remove('active', 'flex')
      chat.classList.add('hidden')
      chat.style.display = 'none'
    })
    
    // Показываем чат представителей с заглушкой
    const representativesChat = document.querySelector('#representatives-chat')
    if (representativesChat) {
      representativesChat.classList.remove('hidden')
      representativesChat.classList.add('active', 'flex')
      representativesChat.style.display = 'flex'
      
      // Устанавливаем заглушку
      representativesChat.innerHTML = `
        <div class="flex items-center justify-center flex-1 text-gray-500">
          <div class="text-center">
            <div class="mb-4">
              <svg class="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">Выберите представителя</h3>
            <p class="text-sm text-gray-500">Выберите представителя из списка слева, чтобы начать чат</p>
          </div>
        </div>
      `
    }
    
    // Обновляем заголовок чата
    const chatHeader = document.getElementById('chat-header')
    if (chatHeader) {
      chatHeader.innerHTML = `<span>Представители стран</span>`
    }
  }

  switchToRepresentativesChat(representative) {
    // Убираем активные стили у всех вкладок
    document.querySelectorAll('.chat-tab').forEach(tab => {
      tab.classList.remove('active', 'bg-gray-50')
    })
    
    // Добавляем активные стили к вкладке представителей
    const representativesTab = document.querySelector('.chat-tab[data-tab="representatives"]')
    if (representativesTab) {
      representativesTab.classList.add('active', 'bg-gray-50')
    }
    
    // Скрываем все чаты
    document.querySelectorAll('.chat-content').forEach(chat => {
      chat.classList.remove('active', 'flex')
      chat.classList.add('hidden')
      chat.style.display = 'none'
    })
    
    // Показываем чат представителей
    const representativesChat = document.querySelector('#representatives-chat')
    if (representativesChat) {
      representativesChat.classList.remove('hidden')
      representativesChat.classList.add('active', 'flex')
      representativesChat.style.display = 'flex'
      
      // Обновляем содержимое чата с информацией о выбранном представителе
      const name = representative.full_name_ru || 'Представитель'
      const country = representative.country || 'Страна'
      
      representativesChat.innerHTML = `
        <div class="flex items-center justify-center flex-1 text-gray-500">
          <div class="text-center">
            <div class="mb-4">
              <img
                src="${representative.image || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&auto=format&fit=crop&q=60'}"
                alt="Avatar"
                class="w-20 h-20 rounded-full mx-auto object-cover"
                onerror="this.src='https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&auto=format&fit=crop&q=60'"
              />
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-1">${name}</h3>
            <p class="text-sm text-gray-500 mb-4">${country}</p>
            <div class="text-sm text-gray-400">
              <p>Чат с представителем</p>
              <p class="mt-1">(функция в разработке)</p>
            </div>
          </div>
        </div>
      `
    }
    
    // Обновляем заголовок чата
    const chatHeader = document.getElementById('chat-header')
    if (chatHeader) {
      const name = representative.full_name_ru || 'Представитель'
      chatHeader.innerHTML = `<span>${name}</span>`
    }
    
    // Переключаем комнату
    this.currentRoom = 'representatives'
  }

  searchRepresentatives(query) {
    // Debounce поиска - ждем 300мс после последнего ввода
    clearTimeout(this.searchTimeout)
    this.searchTimeout = setTimeout(() => {
      this.loadRepresentatives(query)
    }, 300)
  }

  stopAllConnections() {
    // Устанавливаем флаг намеренного закрытия
    this.isClosingIntentionally = true
    
    // Останавливаем все переподключения
    this.shouldReconnectPublic = false
    this.shouldReconnectPrivate = false
    
    // Сбрасываем room_id при остановке соединений
    this.currentPrivateRoomId = null
    
    // Закрываем публичный WebSocket
    if (this.websocket) {
      this.websocket.close()
      this.websocket = null
    }
    
    // Закрываем все приватные WebSocket'ы
    this.privateWebsockets.forEach((websocket, profileId) => {
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.close()
      }
    })
    this.privateWebsockets.clear()
    
    // Очищаем ошибки подключения
    this.hideErrorMessage()
    
    // Включаем input обратно
    this.setInputDisabled(false)
    
    // Сбрасываем флаг через небольшую задержку
    setTimeout(() => {
      this.isClosingIntentionally = false
    }, 500)
  }

  disconnect() {
    // Устанавливаем флаг намеренного закрытия
    this.isClosingIntentionally = true
    
    // Останавливаем все переподключения
    this.shouldReconnectPublic = false
    this.shouldReconnectPrivate = false
    
    // Закрываем все WebSocket соединения
    if (this.websocket) {
      this.websocket.close()
      this.websocket = null
    }
    
    // Закрываем все приватные WebSocket'ы
    this.privateWebsockets.forEach((websocket, profileId) => {
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.close()
      }
    })
    this.privateWebsockets.clear()
  }

  async connectPrivateWebSocket(profileId) {
    try {
      // Проверяем, нет ли уже активного приватного соединения
      if (this.privateWebsockets.has(profileId)) {
        const existingWs = this.privateWebsockets.get(profileId)
        if (existingWs.readyState === WebSocket.OPEN) {
          return
        }
      }

      // Закрываем предыдущее приватное соединение
      if (this.privateWebsockets.has(profileId)) {
        const existingWs = this.privateWebsockets.get(profileId)
        if (existingWs) {
          existingWs.close()
        }
      }

      // Устанавливаем флаг переподключения для приватного чата
      this.shouldReconnectPrivate = true

      const token = localStorage.getItem('access_token')
      if (!token) {
        this.showConnectionError('Токен доступа не найден')
        return
      }

      const wsUrl = `wss://portal.femo.kz/ws/chat/private/${profileId}/?token=${token}`

      const websocket = new WebSocket(wsUrl)

      websocket.onopen = () => {
        // Убираем красную рамку при успешном подключении
        this.clearErrorState()
      }

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handlePrivateMessage(data)
        } catch (error) {
          console.error('Ошибка парсинга приватного сообщения:', error)
        }
      }

             websocket.onclose = (event) => {
         // Переподключаемся только если нужно и не закрыто намеренно
         if (event.code !== 1000 && this.shouldReconnectPrivate && this.currentRepresentative && this.currentRepresentative.profile === profileId) {
           setTimeout(() => {
             if (this.shouldReconnectPrivate && this.currentRepresentative && this.currentRepresentative.profile === profileId) {
               this.connectPrivateWebSocket(profileId)
             }
           }, 5000)
         }
       }

      websocket.onerror = (error) => {
        console.error('Ошибка приватного WebSocket:', error)
        
        // Не показываем ошибку если закрываем намеренно
        if (!this.isClosingIntentionally) {
          this.showConnectionError('Ошибка подключения к приватному чату')
        }
      }

      // Сохраняем WebSocket для этого представителя
      this.privateWebsockets.set(profileId, websocket)

    } catch (error) {
      console.error('Ошибка подключения к приватному WebSocket:', error)
      this.showConnectionError('Не удалось подключиться к приватному чату')
    }
  }

  handlePrivateMessage(data) {
    if (data.message) {
      // Сохраняем room_id из сообщения
      if (data.message.room_id) {
        this.currentPrivateRoomId = data.message.room_id
      }
      
      // Добавляем сообщение в чат
      this.addPrivateMessageToChat(data.message, true)
      
      // Перемещаем чат представителя в начало списка при отправке сообщения
      if (this.currentRepresentative && this.isOurPrivateMessage(data.message)) {
        this.moveRepresentativeToTop(this.currentRepresentative.profile)
        this.updateRepresentativesList()
      }
      
      // Проверяем, нужно ли отправить файл после текстового сообщения
      // Проверяем, нужно ли отправить файл после текстового сообщения
      if (this.pendingFile && this.isOurPrivateMessage(data.message)) {
        this.uploadPrivateFile(this.currentPrivateRoomId, this.pendingFile)
        this.clearAllFiles()
      }
    } else if (data.messages) {
      // Сохраняем room_id из первого сообщения в истории
      if (data.messages.length > 0 && data.messages[0].room_id) {
        this.currentPrivateRoomId = data.messages[0].room_id
      }
      
      // История сообщений
      this.loadPrivateMessageHistory(data.messages)
    }
  }

  loadPrivateMessageHistory(messages) {
    const representativesChat = document.getElementById('representatives-chat')
    if (!representativesChat) return

    // Очищаем чат и убираем заглушку
    representativesChat.innerHTML = ''

    if (messages.length === 0) {
      representativesChat.innerHTML = `
        <div class="flex items-center justify-center flex-1 text-gray-400">
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

    // Обновляем превью последнего сообщения для текущего представителя
    if (sortedMessages.length > 0 && this.currentRepresentative) {
      const lastMessage = sortedMessages[sortedMessages.length - 1]
      this.lastMessages.set(this.currentRepresentative.profile, lastMessage.content)
    }

    // Добавляем все сообщения
    sortedMessages.forEach(messageData => {
      this.addPrivateMessageToChat(messageData, false) // false = не прокручивать после каждого
    })

    // Прокручиваем к концу после загрузки всех сообщений
    this.scrollToBottom()
  }

  addPrivateMessageToChat(messageData, shouldScroll = true) {
    const representativesChat = document.getElementById('representatives-chat')
    if (!representativesChat) return

    // Убираем заглушку если она есть
    const placeholder = representativesChat.querySelector('.flex.items-center.justify-center')
    if (placeholder) {
      placeholder.remove()
    }

    const messageDate = new Date(messageData.created_at)
    this.addDateLabelIfNeeded(representativesChat, messageDate)

    // Определяем, наше ли это сообщение
    const isOurMessage = this.isOurPrivateMessage(messageData)

    // Создаем HTML для нового сообщения
    const messageElement = document.createElement('div')
    messageElement.className = `message flex gap-3 mb-4 ${isOurMessage ? 'justify-end' : 'justify-start'}`
    
    // Форматируем время
    const messageTime = messageDate.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    })

    // Обрабатываем файл (единый стиль для всех типов файлов)
    let fileHtml = ''
    if (messageData.file) {
      const fileUrl = messageData.file.startsWith('http') 
        ? messageData.file 
        : `https://portal.femo.kz${messageData.file}`
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
    
    // Определяем аватар и роль в зависимости от отправителя
    let avatarSrc, senderRole
    if (isOurMessage) {
      // Наше сообщение - берем аватарку из localStorage
      try {
        const userData = localStorage.getItem('user')
        if (userData) {
          const user = JSON.parse(userData)
          const userImage = user.profile.image
          avatarSrc = userImage.startsWith('http') 
            ? userImage 
            : `https://portal.femo.kz${userImage}`
        } else {
          avatarSrc = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=40&h=40&auto=format&fit=crop&q=60"
        }
      } catch (error) {
        console.error('Ошибка при получении аватарки пользователя:', error)
        avatarSrc = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=40&h=40&auto=format&fit=crop&q=60"
      }
      senderRole = "(Администратор)"
    } else {
      avatarSrc = "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&auto=format&fit=crop&q=60"
      senderRole = "(Участник)"
    }

    if (isOurMessage) {
      // Наше сообщение - аватар справа
      messageElement.innerHTML = `
        <div class="${messageContainerClass}">
          <div class="mb-1 flex items-center gap-4 text-sm font-bold justify-end">
            <div class="flex items-center gap-2">
              <span>${messageData.sender_name || 'Администратор'}</span>
              <span>${senderRole}</span>
            </div>
            <img
              src="${avatarSrc}"
              alt="Avatar"
              class="h-8 w-8 rounded-full"
            />
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
        <img
          src="${avatarSrc}"
          alt="Avatar"
          class="h-8 w-8 rounded-full self-start"
        />
        <div class="${messageContainerClass}">
          <div class="mb-1 flex items-center gap-2 text-sm font-bold">
            <span>${messageData.sender_name || 'Представитель'}</span>
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

    representativesChat.appendChild(messageElement)

    if (shouldScroll) {
      this.scrollToBottom()
    }
  }

  isOurPrivateMessage(message) {
    // Проверяем по Profile ID пользователя (правильная проверка)
    try {
      const userData = localStorage.getItem('user')
      if (userData) {
        const user = JSON.parse(userData)
        const matchesProfileId = message.sender_id === user.profile.id
        
        if (matchesProfileId) {
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
      
      const isOurMessage = timeDiff < 30000 && contentMatches
      
      if (isOurMessage) {
        return true
      }
    }
    
    return false
  }

  async uploadPrivateFile(roomId, file) {
    try {
      if (!roomId) {
        this.showErrorMessage('Ошибка: ID комнаты не определен')
        return
      }
      
      const formData = new FormData()
      formData.append('file', file)

      const url = `https://portal.femo.kz/api/chats/private/${roomId}/attachments/`

      const response = await authorizedFetch(url, {
        method: 'POST',
        body: formData,
        // НЕ указываем Content-Type - браузер сам установит multipart/form-data с boundary
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

  clearErrorState() {
    // Очищаем ошибки и скрываем сообщение об ошибке
    this.hideErrorMessage()
    
    // Включаем input и кнопки обратно
    this.setInputDisabled(false)
  }

  showConnectionError(message) {
    // Определяем в какой чат показать ошибку
    const isPrivateChat = this.currentRoom === 'representatives' && this.currentRepresentative
    const chatContainer = isPrivateChat 
      ? document.getElementById('representatives-chat')
      : document.getElementById('announcements-chat')
    
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
    
    // Делаем input и кнопки disabled
    this.setInputDisabled(true)
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
    const sendButton = this.messageInputContainer?.querySelector('button[title="Отправить сообщение"]')
    const attachButton = this.messageInputContainer?.querySelector('button[title="Прикрепить файл"]')
    
    if (sendButton) {
      sendButton.disabled = disabled
      if (disabled) {
        sendButton.classList.add('opacity-50', 'cursor-not-allowed')
      } else {
        sendButton.classList.remove('opacity-50', 'cursor-not-allowed')
      }
    }
    
    if (attachButton) {
      attachButton.disabled = disabled
      if (disabled) {
        attachButton.classList.add('opacity-50', 'cursor-not-allowed')
      } else {
        attachButton.classList.remove('opacity-50', 'cursor-not-allowed')
      }
    }
  }

  // НОВЫЙ МЕТОД: Показать представителя в основном списке чатов
  showRepresentativeInMainList(profileId) {
    // Находим представителя
    const representative = this.representatives.find(rep => rep.profile === profileId)
    if (!representative) return
    
    // Если мы в режиме чатов (не в режиме представителей), обновляем основной список
    if (this.chatModeContent && !this.chatModeContent.classList.contains('hidden')) {
      this.updateMainChatList(representative)
    }
  }

  // НОВЫЙ МЕТОД: Обновить основной список чатов
  updateMainChatList(representative) {
    const chatModeContent = document.getElementById('chat-mode-content')
    if (!chatModeContent) return
    
    const chatList = chatModeContent.querySelector('.space-y-1')
    if (!chatList) return
    
    // Проверяем, есть ли уже элемент для этого представителя
    let representativeChat = chatList.querySelector(`[data-representative-id="${representative.profile}"]`)
    const isNewElement = !representativeChat
    
    if (!representativeChat) {
      // Создаем новый элемент чата для представителя
      representativeChat = document.createElement('a')
      representativeChat.href = '#'
      representativeChat.className = 'chat-tab flex w-full items-center justify-between rounded-lg p-3 text-left hover:bg-gray-50'
      representativeChat.dataset.representativeId = representative.profile
      representativeChat.onclick = (e) => {
        e.preventDefault()
        this.selectRepresentativeFromMainList(representative)
      }
    }
    
    // Определяем статус и иконку
    const hasUnread = this.unreadChats.has(representative.profile)
    let statusIcon = ''
    if (hasUnread) {
      statusIcon = `
        <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="8" r="3" fill="#F4891E"/>
        </svg>
      `
    }
    
    // Обновляем содержимое
    representativeChat.innerHTML = `
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <p class="text-sm font-bold truncate" style="max-width: 180px;">${representative.full_name_ru}</p>
          ${representative.country ? `<img src="https://flagcdn.com/w20/${representative.country.toLowerCase()}.png"
               srcset="https://flagcdn.com/w40/${representative.country.toLowerCase()}.png 2x"
               alt="${representative.country}" 
               class="w-5 h-3 flex-shrink-0">` : ''}
          ${statusIcon}
        </div>
        <p class="mt-1 text-xs text-gray-600 truncate">${this.getLastMessagePreview(representative.profile)}</p>
      </div>
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none">
        <path
          d="M9 5l7 7-7 7"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    `
    
    // Добавляем в начало списка только если это новый элемент
    if (isNewElement) {
      const firstChild = chatList.firstElementChild
      if (firstChild) {
        chatList.insertBefore(representativeChat, firstChild)
      } else {
        chatList.appendChild(representativeChat)
      }
    } else {
      // Если элемент уже существует, перемещаем его в начало
      const firstChild = chatList.firstElementChild
      if (firstChild && firstChild !== representativeChat) {
        chatList.insertBefore(representativeChat, firstChild)
      }
    }
  }

  // НОВЫЙ МЕТОД: Выбор представителя из основного списка
  selectRepresentativeFromMainList(representative) {
    // Переходим в режим представителей
    this.showRepresentativesMode()
    
    // Выбираем представителя
    setTimeout(() => {
      this.selectRepresentative(representative)
    }, 100)
  }
}

// Инициализация чата при загрузке страницы
let adminChat = null

document.addEventListener('DOMContentLoaded', () => {
  adminChat = new AdminChat()
  window.adminChat = adminChat // Делаем доступным глобально
  
  // Автоматическая инициализация происходит в конструкторе
})

// Интеграция с переключением вкладок
const originalSwitchChatTab = window.switchChatTab
window.switchChatTab = function(tabName) {
  // Очищаем файлы и input при переключении табов
  if (adminChat) {
    adminChat.clearAllFiles()
    if (adminChat.messageInput) {
      adminChat.messageInput.value = ''
      adminChat.messageInput.style.height = '5px'
      adminChat.messageInput.style.height = adminChat.messageInput.scrollHeight + 'px'
    }
  }
  
  // Вызываем оригинальную функцию
  originalSwitchChatTab(tabName)
  
  // Переключаем комнату в чате с задержкой
  setTimeout(() => {
    if (adminChat) {
      adminChat.switchRoom(tabName)
    }
  }, 100)
}

// Очистка при закрытии страницы
window.addEventListener('beforeunload', () => {
  if (adminChat) {
    adminChat.saveChatState() // Сохраняем состояние перед закрытием
    adminChat.disconnect()
  }
}) 


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
  if (role !== 'administrator') {
    console.warn(
      `Пользователь с ролью "${role}" не имеет доступа к админке. Редирект.`
    )
    window.location.href = '/index.html'
    return null
  }

  return user
}

// Основная отрисовка профиля
function renderUserInfo(profile) {
  const avatarEl  = document.getElementById('user-avatar');
  const nameEl    = document.getElementById('user-name');
  const roleEl    = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  const imgPath = profile.image || '';
  avatarEl.src = imgPath.startsWith('http')
    ? imgPath
    : `https://portal.femo.kz${imgPath}`;

  nameEl.textContent    = profile.full_name_ru || '';
  const firstName       = (profile.full_name_ru || '').split(' ')[0];
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`;

  const roleMap = { administrator: 'Администратор' };
  roleEl.textContent = roleMap[profile.role] || profile.role;
}

// Функция, которая дергает профиль администратора
async function loadAdminProfile() {
  const token = localStorage.getItem('access_token');
  if (!token) throw new Error('Токен не найден');

  const res = await authorizedFetch(
    'https://portal.femo.kz/api/users/administrator/profile/',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Ошибка загрузки профиля: ${res.status}`);
  return await res.json();
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  try {
    // 2) Подтягиваем актуальный профиль по API
    const profileData = await loadAdminProfile();
    // 3) Рисуем шапку
    renderUserInfo(profileData);
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})
