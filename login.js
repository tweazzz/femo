document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form')
  const emailInput = form.querySelector('input[type="email"]')
  const passwordInput = form.querySelector('input[type="password"]')

  const messageContainer = document.createElement('div')
  messageContainer.className = 'mt-4 text-center text-sm font-medium'
  form.appendChild(messageContainer)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    messageContainer.textContent = ''
    messageContainer.classList.remove('text-red-500')

    const email = emailInput.value.trim().toLowerCase()
    const password = passwordInput.value

    if (!email || !password) {
      messageContainer.textContent = 'Пожалуйста, введите email и пароль.'
      messageContainer.classList.add('text-red-500')
      return
    }

    const payload = { email, password }
    const submitButton = form.querySelector("button[type='submit']")
    const originalText = submitButton.textContent

    submitButton.disabled = true

    try {
      const response = await fetch(
        'https://portal.femo.kz/api/users/token/',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        const msg = data?.detail || 'Неверный email или пароль.'
        messageContainer.textContent = msg
        messageContainer.classList.add('text-red-500')
        return
      }

      if (!data.access || !data.user) {
        messageContainer.textContent = 'Ошибка входа. Проверьте данные.'
        messageContainer.classList.add('text-red-500')
        return
      }

      // Сохраняем токены и информацию о пользователе
      localStorage.setItem('access_token', data.access)
      localStorage.setItem('refresh_token', data.refresh)
      localStorage.setItem('user', JSON.stringify(data.user))

      // Определяем роль и перенаправляем
      const role = data.user.profile?.role

      switch (role) {
        case 'administrator':
          window.location.href = 'admin/index.html'
          break
        case 'participant':
          window.location.href = 'participant/dashboard.html'
          break
        case 'representative':
          window.location.href = 'representatives/index.html'
          break
        default:
          messageContainer.textContent = 'Такого пользователя не существует!'
          messageContainer.classList.add('text-red-500')
      }
    } catch (error) {
      console.error('Ошибка:', error)
      messageContainer.textContent = 'Сервер не отвечает.'
      messageContainer.classList.add('text-red-500')
    } finally {
      submitButton.disabled = false
      submitButton.textContent = originalText
    }
  })
})
