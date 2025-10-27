// ===== i18n.js (универсальный минимальный) =====

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) {
      console.warn('❌ Не удалось загрузить JSON:', url, res.status);
      return {};
    }
    return await res.json();
  } catch (e) {
    console.warn('❌ Ошибка fetch:', e);
    return {};
  }
}

// заменяем только текстовый узел внутри элемента, не трогая HTML (img и т.д.)
function setElementTextPreserveHtml(el, text) {
  for (let node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
      node.textContent = text;
      return;
    }
  }
  // если текстовый узел не найден — добавим в конец
  el.appendChild(document.createTextNode(text));
}

function applyTranslations(dict) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const attr = el.dataset.i18nAttr; // например "placeholder" или "alt"

    if (!(key in dict)) {
      console.warn('⚠️ i18n missing key:', key);
      return;
    }

    const value = dict[key];

    if (attr) {
      // установить атрибут (placeholder, title, alt, value и т.д.)
      el.setAttribute(attr, value);
    } else {
      // заменить текст внутри элемента, сохранив html-детей
      setElementTextPreserveHtml(el, value);
    }
  });
}

async function setLanguage(lang = 'ru', role = 'admin', page = 'index') {
  const url = `/locales/${lang}/${role}/${page}.json`;
  console.log('🌐 i18n: загружаю', url);
  const dict = await fetchJson(url);
  applyTranslations(dict);
  try { localStorage.setItem('lang', lang); } catch(e){}
  console.log(`✅ i18n applied: ${lang}/${role}/${page}`);
}

// видимая в консоли функция
window.setLanguage = setLanguage;
