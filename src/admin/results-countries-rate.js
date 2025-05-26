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

function renderUserInfo(user) {
  const avatarEl = document.getElementById('user-avatar')
  const nameEl = document.getElementById('user-name')
  const roleEl = document.getElementById('user-role')
  const welcomeEl = document.querySelector('h1.text-xl')

  const imgPath = user.profile.image
  avatarEl.src = imgPath.startsWith('http')
    ? imgPath
    : `https://portal.gradients.academy${imgPath}`

  nameEl.textContent = user.profile.full_name_ru
  const firstName = user.profile.full_name_ru.split(' ')[0]
  welcomeEl.textContent = `Добро пожаловать, ${firstName} 👋`

  const roleMap = {
    administrator: 'Администратор',
  }
  roleEl.textContent = roleMap[user.profile.role] || user.profile.role
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  renderUserInfo(user)

  try {
    //await loadAssignments()
    //setupAssignmentFilters()
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})
