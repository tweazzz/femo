// src/scripts/langInit.js
// Инициализация языка на всех страницах. Требует, чтобы i18n.js был подключен раньше.

window._userSettingsPromise = window._userSettingsPromise || null;

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

// detect role/page: priority:
// 1) localStorage.user.profile.role
// 2) body data-role / data-page
// 3) pathname detection => fallback admin/index
function detectRoleAndPage() {
  // 1) localStorage.user
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
  } catch(e){ /* ignore */ }

  // 2) body data attributes
  const body = document.body || {};
  if (body.dataset && body.dataset.role) {
    return { role: body.dataset.role, page: body.dataset.page || 'index' };
  }

  // 3) pathname heuristics
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

async function initLanguageOnPage() {
  const { role, page } = detectRoleAndPage();

  // 1) apply cached lang immediately (fast)
  const cached = localStorage.getItem('lang');
  if (cached && typeof window.setLanguage === 'function') {
    // don't await fully, but ensure errors logged
    window.setLanguage(cached, role, page).catch(e => console.warn('i18n.setLanguage error', e));
  }

  // 2) fetch server settings once and sync authoritative language
  try {
    const settings = await fetchUserSettingsOnce();
    const serverLang = settings && settings.language ? (settings.language === 'kk' ? 'kz' : settings.language) : null;

    if (serverLang) {
      try { localStorage.setItem('lang', serverLang); } catch(e){}
      const backend = frontendToBackend(serverLang);
      try {
        if (backend) localStorage.setItem('backend_lang', backend);
        else localStorage.removeItem('backend_lang');
      } catch(e){}

      if (typeof window.setLanguage === 'function') {
        await window.setLanguage(serverLang, role, page);
      }

      window.dispatchEvent(new CustomEvent('i18n:languageReady', { detail: { frontendLang: serverLang, backendLang: frontendToBackend(serverLang), role, page } }));
      return;
    }
  } catch (e) {
    console.warn('langInit: could not fetch settings', e);
  }

  // 3) fallback: ensure localStorage has default ru
  if (!cached) {
    try { localStorage.setItem('lang', 'ru'); } catch(e){}
    try { localStorage.removeItem('backend_lang'); } catch(e){}
    window.dispatchEvent(new CustomEvent('i18n:languageReady', { detail: { frontendLang: 'ru', backendLang: null, role, page } }));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initLanguageOnPage().catch(e => console.warn('initLangAuto error', e));
});

// export
window.initLanguageOnPage = initLanguageOnPage;
