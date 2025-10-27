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

// helper: кэшируем промис запроса settings, чтобы не делать множественные одновременные запросы
let _userSettingsPromise = null;

async function fetchUserSettingsOnce(settingsUrl = '/api/users/settings/') {
  if (_userSettingsPromise) return _userSettingsPromise;
  _userSettingsPromise = (async () => {
    try {
      // Если у вас нужна авторизация — убедитесь, что токен установлен в localStorage
      const token = localStorage.getItem('access_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(settingsUrl, { headers, cache: 'no-cache' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('fetchUserSettingsOnce error', e);
      return null;
    }
  })();
  return _userSettingsPromise;
}

// Получить язык (из localStorage или бэка), возвращает 'ru' по умолчанию
async function getUserLang() {
  const cached = localStorage.getItem('lang');
  if (cached) return cached;

  const settings = await fetchUserSettingsOnce();
  if (settings && settings.language) {
    try { localStorage.setItem('lang', settings.language); } catch(e){}
    return settings.language;
  }

  // fallback: можно использовать navigator.language, но у вас верстка по-умолчанию русская
  return 'ru';
}

// Основной authorizedFetch с Accept-Language
async function authorizedFetch(url, options = {}, retry = true) {
  let token = localStorage.getItem('access_token');

  if (!token) {
    window.location.href = '../index.html';
    return;
  }

  const isFormData = options.body instanceof FormData;

  // Ensure headers object exists (не мутируем оригинальные headers напрямую)
  options.headers = Object.assign({}, options.headers || {});

  // Authorization
  options.headers.Authorization = `Bearer ${token}`;

  // Content-Type: не устанавливаем для FormData
  if (!isFormData) {
    // установка JSON только если явно не указан
    if (!options.headers['Content-Type'] && !options.headers['content-type']) {
      options.headers['Content-Type'] = 'application/json';
    }
  } else {
    // удалить Content-Type если случайно оставлен
    delete options.headers['Content-Type'];
    delete options.headers['content-type'];
  }

  // Accept-Language: возьмём из localStorage или запросим settings
  try {
    const lang = await getUserLang();
    if (lang) {
      // не перезаписываем, если явно указано в options.headers
      if (!options.headers['Accept-Language'] && !options.headers['accept-language']) {
        options.headers['Accept-Language'] = lang;
      }
    }
  } catch (e) {
    console.warn('Не удалось получить language для заголовка', e);
  }

  // Выполняем запрос
  let response = await fetch(url, options);

  // 401 -> попробуем обновить токен и повторить один раз
  if (response.status === 401 && retry) {
    const newToken = await refreshAccessToken(); // предполагается существующая функция
    if (!newToken) return response; // или null

    // обновляем токен в localStorage и заголовке, затем повторяем
    localStorage.setItem('access_token', newToken);
    options.headers.Authorization = `Bearer ${newToken}`;
    response = await fetch(url, options);
  }

  return response;
}