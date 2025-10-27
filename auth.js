// src/scripts/auth.js
// Обновлённый auth + authorizedFetch,
// использует localStorage.backend_lang (kk/en) для заголовка Accept-Language.

// немедленная проверка токена (так у тебя было)
;(function checkAuth() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    window.location.href = '../index.html';
  }
})();

// refresh access token (оставлено как в твоём коде)
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    window.location.href = '../index.html';
    return null;
  }

  try {
    const response = await fetch('https://portal.femo.kz/api/users/token/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    const data = await response.json();

    if (!response.ok || !data.access) {
      throw new Error('Не удалось обновить токен');
    }

    localStorage.setItem('access_token', data.access);
    return data.access;
  } catch (error) {
    console.error('Ошибка обновления токена:', error);
    window.location.href = '../index.html';
    return null;
  }
}

/* --- Кэш запроса настроек (единожды) --- */
let _userSettingsPromise = null;
async function fetchUserSettingsOnce(settingsUrl = 'https://portal.femo.kz/api/users/settings/') {
  if (_userSettingsPromise) return _userSettingsPromise;
  _userSettingsPromise = (async () => {
    try {
      const token = localStorage.getItem('access_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(settingsUrl, { headers, cache: 'no-cache' });
      if (!res.ok) return null;
      const json = await res.json();

      // normalize server value to frontend + set backend_lang
      if (json && json.language) {
        const frontendLang = (json.language === 'kk') ? 'kz' : json.language;
        try { localStorage.setItem('lang', frontendLang); } catch(e){}
        // backend header
        const backendHeader = (frontendLang === 'kz') ? 'kk' : (frontendLang === 'en' ? 'en' : null);
        try {
          if (backendHeader) localStorage.setItem('backend_lang', backendHeader);
          else localStorage.removeItem('backend_lang');
        } catch(e){}
      }

      return json;
    } catch (e) {
      console.warn('fetchUserSettingsOnce error', e);
      return null;
    }
  })();
  return _userSettingsPromise;
}

// Получить backend header код: 'kk'|'en'|null
async function getBackendLangForHeader() {
  const local = localStorage.getItem('backend_lang');
  if (local) return local;
  const settings = await fetchUserSettingsOnce();
  if (settings && settings.language) {
    const frontendLang = (settings.language === 'kk') ? 'kz' : settings.language;
    return (frontendLang === 'kz') ? 'kk' : (frontendLang === 'en' ? 'en' : null);
  }
  return null;
}

/* --- authorizedFetch: central fetch with Authorization + Accept-Language (if present) --- */
async function authorizedFetch(url, options = {}, retry = true) {
  let token = localStorage.getItem('access_token');
  if (!token) {
    window.location.href = '../index.html';
    return;
  }

  const isFormData = options.body instanceof FormData;
  options.headers = Object.assign({}, options.headers || {});

  // Authorization header
  options.headers.Authorization = `Bearer ${token}`;

  // Content-Type handling
  if (!isFormData) {
    if (!options.headers['Content-Type'] && !options.headers['content-type']) {
      options.headers['Content-Type'] = 'application/json';
    }
  } else {
    delete options.headers['Content-Type'];
    delete options.headers['content-type'];
  }

  // Add Accept-Language header only if backend_lang exists (kk/en)
  try {
    const backendLang = await getBackendLangForHeader();
    if (backendLang && !options.headers['Accept-Language'] && !options.headers['accept-language']) {
      options.headers['Accept-Language'] = backendLang;
    }
  } catch (e) {
    console.warn('authorizedFetch: getBackendLangForHeader error', e);
  }

  // Optional debug: uncomment to see headers in console
  // console.debug('authorizedFetch headers:', options.headers);

  // perform fetch
  let response = await fetch(url, options);

  // 401 -> refresh token and retry once
  if (response.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (!newToken) return response;
    localStorage.setItem('access_token', newToken);
    options.headers.Authorization = `Bearer ${newToken}`;
    response = await fetch(url, options);
  }

  return response;
}

// expose globally (so other files can call authorizedFetch)
window.authorizedFetch = authorizedFetch;
