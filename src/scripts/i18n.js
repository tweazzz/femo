// src/scripts/i18n.js
// Универсальный i18n: поддержка frontend 'kz'|'en'|'ru' и backend header 'kk'|'en' (null для ru).
// Подгружает /locales/{frontendLang}/{role}/{page}.json (пытается page.json -> index.json).

window.i18nDict = window.i18nDict || {};

// map frontend -> backend header
const FRONTEND_TO_BACKEND_LANG = { kz: 'kk', kk: 'kk', en: 'en', ru: null };

// safe fetch JSON
async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('i18n fetchJson error', e);
    return null;
  }
}

// try page-specific then index.json
async function fetchLocaleForPage(frontendLang, role, page) {
  const urls = [
    `/locales/${frontendLang}/${role}/${page}.json`,
    `/locales/${frontendLang}/${role}/index.json`
  ];
  for (const u of urls) {
    const data = await fetchJson(u);
    if (data) return data;
  }
  return {};
}

// replace only text node to avoid wiping images etc
function setElementTextPreserveHtml(el, text) {
  for (let node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
      node.textContent = text;
      return;
    }
  }
  el.appendChild(document.createTextNode(text));
}

// apply translations to elements with data-i18n (supports data-i18n-attr)
function applyTranslations(dict) {
  if (!dict || typeof dict !== 'object') return;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (!key) return;
    const attr = el.dataset.i18nAttr;
    const value = dict[key];
    if (value == null) return; // skip missing keys
    if (attr) el.setAttribute(attr, value);
    else setElementTextPreserveHtml(el, value);
  });
}

// get role from localStorage.user if exists
function getRoleFromLocalStorageUser() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user?.profile?.role || null;
  } catch (e) {
    return null;
  }
}

/**
 * setLanguage(frontendLang = 'ru', role = null, page = 'index')
 * - frontendLang: 'ru'|'kz'|'en' (accepts 'kk' -> normalized to 'kz')
 * - role: if null -> try localStorage.user.profile.role -> fallback 'admin'
 * - page: 'index' by default
 */
async function setLanguage(lang = 'ru', role = null, page = 'index') {
  const detectedRole = role || getRoleFromLocalStorageUser() || 'admin';
  const frontendLang = (lang === 'kk') ? 'kz' : lang;
  try { localStorage.setItem('lang', frontendLang); } catch(e){}

  const backendLang = FRONTEND_TO_BACKEND_LANG[frontendLang] || null;
  try {
    if (backendLang) localStorage.setItem('backend_lang', backendLang);
    else localStorage.removeItem('backend_lang');
  } catch(e){}

  if (frontendLang === 'ru') {
    // We used to skip fetching for RU, but now we support ru.json files.
    // However, to maintain backward compatibility (if file missing), 
    // fetchLocaleForPage returns {} and we apply empty dict (safe).
    // So we proceed to fetch logic below.
  }

  // try to load page-specific, fallback to index.json
  const dict = await fetchLocaleForPage(frontendLang, detectedRole, page);
  window.i18nDict = dict || {};
  applyTranslations(window.i18nDict);
  window.dispatchEvent(new CustomEvent('i18n:languageChanged', { detail: { frontendLang, backendLang, role: detectedRole, page } }));
  console.log(`i18n: applied frontend=${frontendLang} backend=${backendLang} role=${detectedRole} page=${page}`);
}

// expose globally
window.setLanguage = setLanguage;
window.FRONTEND_TO_BACKEND_LANG = FRONTEND_TO_BACKEND_LANG;