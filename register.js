document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form')

  let messageContainer = document.createElement('div')
  messageContainer.className = 'mt-4 text-center text-sm font-medium'
  form.parentNode.insertBefore(messageContainer, form.nextSibling)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()

    const roleText = document.querySelector('select').value
    const email = document.querySelector('input[type="email"]').value.trim()
    const fullName = document.querySelector('input[type="text"]').value.trim()
    const password = document.querySelector('input[type="password"]').value

    messageContainer.textContent = ''
    messageContainer.classList.remove('text-red-500', 'text-green-600')

    let role = null
    if (roleText === 'Участник') {
      role = 'participant'
    } else if (roleText === 'Представитель страны') {
      role = 'representative'
    }

    if (!role || !email || !fullName || !password) {
      messageContainer.textContent = 'Пожалуйста, заполните все поля корректно.'
      messageContainer.classList.add('text-red-500')
      return
    }

    const payload = {
      email,
      password,
      profile: {
        full_name_ru: fullName,
        role,
      },
    }

    try {
      const response = await fetch(
        'https://portal.gradients.academy/api/users/registration/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        messageContainer.textContent =
          data?.detail || 'Произошла ошибка при регистрации.'
        messageContainer.classList.add('text-red-500')
        return
      }

      messageContainer.textContent = 'Регистрация прошла успешно!'
      messageContainer.classList.add('text-green-600')

      setTimeout(() => {
        window.location.href = 'login.html'
      }, 1500)
    } catch (error) {
      console.error('Ошибка:', error)
      messageContainer.textContent = 'Ошибка соединения с сервером.'
      messageContainer.classList.add('text-red-500')
    }
  })
})
