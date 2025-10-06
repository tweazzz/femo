// auth.js
;(function checkAuth() {
  const token = localStorage.getItem('access_token')
  if (!token) {
    window.location.href = '../index.html'
  }
})()

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) {
    window.location.href = '../index.html'
    return null
  }

  try {
    const response = await fetch(
      'https://portal.femo.kz/api/users/token/refresh/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      }
    )

    const data = await response.json()

    if (!response.ok || !data.access) {
      throw new Error('Не удалось обновить токен')
    }

    localStorage.setItem('access_token', data.access)
    return data.access
  } catch (error) {
    console.error('Ошибка обновления токена:', error)
    window.location.href = '../index.html'
    return null
  }
}

async function authorizedFetch(url, options = {}, retry = true) {
  let token = localStorage.getItem('access_token')

  if (!token) {
    window.location.href = '../index.html'
    return
  }

  // Не устанавливаем Content-Type для FormData (загрузка файлов)
  const isFormData = options.body instanceof FormData
  
  options.headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
  }
  
  // Устанавливаем Content-Type только если это не FormData
  if (!isFormData) {
    options.headers['Content-Type'] = 'application/json'
  }

  let response = await fetch(url, options)

  if (response.status === 401 && retry) {
    const newToken = await refreshAccessToken()
    if (!newToken) return

    options.headers.Authorization = `Bearer ${newToken}`
    response = await fetch(url, options)
  }

  return response
}

