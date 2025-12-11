// src/scripts/langInit.js
// Инициализация языка на всех страницах. Требует, чтобы i18n.js был подключен раньше.
// Поведение:
// - Показывает "loading" overlay пока не подтянутся настройки и (опционально) appDataLoaders.
// - Ждёт промисы из window.appDataLoaders (если есть), но с таймаутом.
// - При смене языка очищает кеши переводов/настроек (только связанные ключи) и опционально перезагружает страницу.

// глобальные кэши
window._userSettingsPromise = window._userSettingsPromise || null;
window.appDataLoaders = window.appDataLoaders || []; // модули могут пушить промисы сюда

async function fetchUserSettingsOnce(settingsUrl = 'https://portal.femo.kz/api/users/settings/') {
  if (window._userSettingsPromise) return window._userSettingsPromise;
  window._userSettingsPromise = (async () => {
    try {
      const token = localStorage.getItem('access_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(settingsUrl, { headers, cache: 'no-cache' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('langInit: fetchUserSettingsOnce error', e);
      return null;
    }
  })();
  return window._userSettingsPromise;
}

function frontendToBackend(frontendLang) {
  if (!frontendLang) return null;
  if (frontendLang === 'kz' || frontendLang === 'kk') return 'kk';
  if (frontendLang === 'en') return 'en';
  return null;
}

function detectRoleAndPage() {
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const user = JSON.parse(raw);
      const r = user?.profile?.role;
      if (r) {
        const p = document.body?.dataset?.page || 'index';
        return { role: r, page: p };
      }
    }
  } catch (e) { /* ignore */ }

  const body = document.body || {};
  if (body.dataset && body.dataset.role) {
    return { role: body.dataset.role, page: body.dataset.page || 'index' };
  }

  const parts = location.pathname.split('/').filter(Boolean);
  const knownRoles = ['admin','representative','participant'];
  let role = 'admin';
  for (const p of parts) if (knownRoles.includes(p)) { role = p; break; }
  let page = 'index';
  const last = parts.length ? parts[parts.length - 1] : '';
  if (last && last.includes('.')) page = last.replace('.html','');
  else if (parts.length && !knownRoles.includes(last)) page = last || 'index';
  return { role, page };
}

/* ----------------- Loading overlay (FULL OPAQUE background + center spinner) ----------------- */
function ensureLoadingOverlay() {
  let ov = document.getElementById('i18n-loading-overlay');
  if (ov) return ov;

  ov = document.createElement('div');
  ov.id = 'i18n-loading-overlay';
  // Full opaque background (white). Spinner centered.
  ov.style.cssText = `
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ffffff; /* непрозрачный белый фон */
    z-index: 99999;
    pointer-events: auto;
  `;

  ov.innerHTML = `
    <div role="status" aria-live="polite" aria-label="loading" style="display:flex;align-items:center;justify-content:center;">
      <div class="i18n-spinner" style="
        width:56px;
        height:56px;
        border-radius:50%;
        border:6px solid rgba(0,0,0,0.08);
        border-top-color: #ff7a18;
        animation: i18n-spin 1s linear infinite;
      "></div>
    </div>
    <style>
      @keyframes i18n-spin { to { transform: rotate(360deg); } }
      /* ensure overlay covers everything on low z-index pages too */
      #i18n-loading-overlay { -webkit-tap-highlight-color: transparent; }
    </style>
  `;

  document.body.appendChild(ov);
  return ov;
}
function showLoadingOverlay() {
  const ov = ensureLoadingOverlay();
  ov.style.display = 'flex';
  // prevent scrolling while loading
  document.body.style.overflow = 'hidden';
  // for accessibility: focus on overlay so screenreaders know
  ov.setAttribute('aria-hidden', 'false');
}
function hideLoadingOverlay() {
  const ov = document.getElementById('i18n-loading-overlay');
  if (ov) ov.style.display = 'none';
  document.body.style.overflow = '';
  if (ov) ov.setAttribute('aria-hidden', 'true');
}

/* ----------------- wait helpers ----------------- */
function timeoutPromise(ms, value = null) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

// Ждём все переданные промисы (или пустой список) с таймаутом.
// Возвращает settled results.
async function waitForAllWithTimeout(promises = [], timeoutMs = 5000) {
  if (!Array.isArray(promises) || promises.length === 0) {
    // просто подождём маленькую паузу, чтобы UI успел отрисоваться
    await timeoutPromise(50);
    return [];
  }
  // Promise.allSettled with timeout
  const race = Promise.race([
    Promise.allSettled(promises),
    timeoutPromise(timeoutMs, 'timeout')
  ]);
  const res = await race;
  if (res === 'timeout') {
    // Если таймаут, попытаемся дождаться всех settled (без blocking), но вернём null-indicator
    // Возвращаем то, что успело выполниться (или пустой массив)
    try {
      const settled = await Promise.allSettled(promises.map(p => p.catch(e => e)));
      return settled;
    } catch (e) {
      return [];
    }
  }
  return res;
}

/* ----------------- Основная логика ----------------- */
async function initLanguageOnPage({ waitForAppPromises = true, appWaitTimeout = 5000, showLoader = true } = {}) {
  let { role, page } = detectRoleAndPage();
  const isPublic = document.body.dataset.publicPage === "true";

  const isPublicPage = document.body.dataset.publicPage === "true";
  if (isPublicPage) {
    role = "public";          // теперь можно менять
    try { localStorage.removeItem("access_token"); } catch(e){}
  }
  
  // Показать лоадер
  if (showLoader) showLoadingOverlay();

  // Получим cached lang (из localStorage)
  const cached = localStorage.getItem('lang');

  // Попытка получить настройки с сервера (но не дольше appWaitTimeout)
  let settings = null;
  if (!isPublic) {
    try {
      settings = await fetchUserSettingsOnce();
    } catch (e) {
      console.warn('langInit: fetchUserSettingsOnce failed', e);
    }
  }

  // Авторитетный язык от сервера (если есть)
  const serverLang = settings && settings.language ? (settings.language === 'kk' ? 'kz' : settings.language) : null;

  // Решаем какой frontendLang использовать: серверный > cached > ru
  const frontendLangToApply = cached || 
  (settings?.language ? (settings.language === 'kk' ? 'kz' : settings.language) : null) 
  || 'ru';


  // Установим localStorage(lang, backend_lang) в соответствии с выбранным
  try { localStorage.setItem('lang', frontendLangToApply); } catch(e){}
  const backend = frontendToBackend(frontendLangToApply);
  try {
    if (backend) localStorage.setItem('backend_lang', backend);
    else localStorage.removeItem('backend_lang');
  } catch(e){}

  // Ждём промисы приложений (если есть)
  if (waitForAppPromises) {
    let appPromises = Array.isArray(window.appDataLoaders) ? window.appDataLoaders.slice() : [];
    // также можно подождать сам settings, но мы уже его получили
    await waitForAllWithTimeout(appPromises, appWaitTimeout);
  }

  // Применяем язык (setLanguage загружает локализацию и вызывает applyTranslations)
  try {
    if (typeof window.setLanguage === 'function') {
      await window.setLanguage(frontendLangToApply, role, page);
    } else {
      console.warn('i18n: window.setLanguage not found');
    }
  } catch (e) {
    console.warn('i18n.setLanguage error', e);
  }

  // Скрыть лоадер
  if (showLoader) hideLoadingOverlay();

  // Уведомление что всё готово
  window.dispatchEvent(new CustomEvent('i18n:languageReady', { detail: { frontendLang: frontendLangToApply, backendLang: frontendToBackend(frontendLangToApply), role, page } }));
  return { frontendLang: frontendLangToApply, backendLang: frontendToBackend(frontendLangToApply), role, page };
}

/* ----------------- Смена языка пользователем (очищаем кеши переводов/настроек и перезагружаем) ----------------- */
/**
 * changeLanguageAndReload('kz'|'en'|'ru', { reload: true, waitForApp: true })
 */
async function changeLanguageAndReload(newLang, { reload = true, waitForApp = true, appWaitTimeout = 5000 } = {}) {
  if (!newLang) return;

  // Получаем текущий язык из localStorage
  const currentLang = localStorage.getItem('lang');

  // 1) Если новый язык совпадает с текущим, не меняем ничего и не перезагружаем
  if (newLang === currentLang) {
    console.log("Язык не изменился, перезагрузка не требуется.");
    return;
  }

  // Показать лоадер во время изменения языка
  showLoadingOverlay();

  // 2) Очистим только кеши, связанные с языком
  try {
    localStorage.removeItem('lang');
    localStorage.removeItem('backend_lang');
  } catch (e) { /* ignore */ }

  // 3) Очистим глобальные кэши в памяти, связанные с языком
  try { window._userSettingsPromise = null; } catch(e){ }
  try { window.i18nDict = {}; } catch(e){ }

  // 4) Установим новый язык в localStorage
  const frontendLang = (newLang === 'kk') ? 'kz' : newLang;
  try { localStorage.setItem('lang', frontendLang); } catch(e){ }
  const backend = frontendToBackend(frontendLang);
  try {
    if (backend) localStorage.setItem('backend_lang', backend);
    else localStorage.removeItem('backend_lang');
  } catch(e){ }

  // 5) Дождемся загрузки данных (если нужно)
  if (waitForApp && Array.isArray(window.appDataLoaders) && window.appDataLoaders.length > 0) {
    await waitForAllWithTimeout(window.appDataLoaders.slice(), appWaitTimeout);
  }

  // 6) Применим новый язык
  try {
    const { role, page } = detectRoleAndPage();
    if (typeof window.setLanguage === 'function') {
      await window.setLanguage(frontendLang, role, page);
    }
  } catch (e) {
    console.warn('changeLanguageAndReload: setLanguage failed', e);
  }

  hideLoadingOverlay();

  // 7) Если изменился язык, то перезагружаем страницу
  if (reload) {
    setTimeout(() => {
      location.reload();
    }, 120);
  }
}


// Auto-init на DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // можно передать { waitForAppPromises: false } чтобы НЕ ждать app-промисы
  initLanguageOnPage({ waitForAppPromises: true, appWaitTimeout: 5000, showLoader: true })
    .catch(e => console.warn('initLangAuto error', e));
});

// Экспорт функций на window
window.initLanguageOnPage = initLanguageOnPage;
window.changeLanguageAndReload = changeLanguageAndReload;
window.waitForAllWithTimeout = waitForAllWithTimeout;
