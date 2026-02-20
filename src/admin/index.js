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
    console.warn(`Пользователь с ролью "${role}" не имеет доступа к админке. Редирект.`)
    window.location.href = '/index.html'
    return null
  }

  return user
}

// Основная отрисовка профиля
function renderUserInfo(profile) {
  const p = profile && profile.profile ? profile.profile : (profile || {});

  const avatarEl  = document.getElementById('user-avatar');
  const nameEl    = document.getElementById('user-name');
  const roleEl    = document.getElementById('user-role');
  const welcomeEl = document.querySelector('h1.text-xl');

  if (!avatarEl || !nameEl || !roleEl || !welcomeEl) {
    console.warn('renderUserInfo: отсутствуют элементы в DOM для отрисовки профиля');
    return;
  }

  const imgPath = p.image;
  avatarEl.src = imgPath
    ? (imgPath.startsWith('http') ? imgPath : `https://portal.femo.kz${imgPath}`)
    : '/src/assets/images/user-3296.svg';
  
  // Определяем frontend language для выбора имени (которое может быть на en/ru)
  const storedLang = localStorage.getItem('lang') || 'ru';
  const frontendLang = (storedLang === 'kk') ? 'kz' : storedLang; // устойчиво: если случайно кто-то записал kk
  const fullName = (frontendLang === 'en') ? (p.full_name_en || p.full_name_ru || '') : (p.full_name_ru || p.full_name_en || '');
  nameEl.textContent = fullName;

  const firstName = (fullName.split && fullName.split(' ')[0]) || '';

  const welcomeKeyCandidates = ['welcome.message_admin', 'welcome.message', 'welcome.message_rep'];

  // Находим или создаём span[data-i18n]
  let greetSpan = welcomeEl.querySelector('span[data-i18n]');
  if (!greetSpan) {
    greetSpan = document.createElement('span');
    greetSpan.setAttribute('data-i18n', welcomeKeyCandidates[0]);
    greetSpan.textContent = 'Добро пожаловать,'; // fallback
    welcomeEl.innerHTML = '';
    welcomeEl.appendChild(greetSpan);
    welcomeEl.appendChild(document.createTextNode(' ' + firstName + ' 👋'));
  } else {
    // обновляем имя (не трогаем span текст)
    let node = greetSpan.nextSibling;
    while (node) {
      const next = node.nextSibling;
      node.remove();
      node = next;
    }
    greetSpan.after(document.createTextNode(' ' + firstName + ' 👋'));
  }

  try {
    const dict = window.i18nDict || {};
    const foundKey = welcomeKeyCandidates.find(k => Object.prototype.hasOwnProperty.call(dict, k));
    if (foundKey) greetSpan.dataset.i18n = foundKey;
    if (typeof applyTranslations === 'function') applyTranslations(dict);
  } catch (e) {
    console.warn('renderUserInfo: applyTranslations error', e);
  }

  const roleMap = { administrator: 'Администратор' };
  roleEl.textContent = roleMap[p.role] || p.role || '';

  // Подписка на смену языка (обновит перевод и имя)
  function onLanguageChanged() {
    try {
      const dict = window.i18nDict || {};
      const foundKey = welcomeKeyCandidates.find(k => Object.prototype.hasOwnProperty.call(dict, k));
      if (foundKey) greetSpan.dataset.i18n = foundKey;
      if (typeof applyTranslations === 'function') applyTranslations(dict);

      const langNow = localStorage.getItem('lang') || 'ru';
      const resolvedLang = (langNow === 'kk') ? 'kz' : langNow;
      const newFullName = (resolvedLang === 'en') ? (p.full_name_en || p.full_name_ru || '') : (p.full_name_ru || p.full_name_en || '');
      nameEl.textContent = newFullName;
      let node = greetSpan.nextSibling;
      while (node) {
        const next = node.nextSibling;
        node.remove();
        node = next;
      }
      const newFirst = (newFullName.split && newFullName.split(' ')[0]) || '';
      greetSpan.after(document.createTextNode(' ' + newFirst + ' 👋'));
    } catch (e) {
      console.warn('onLanguageChanged error', e);
    }
  }

  // remove old listeners then add
  try {
    window.removeEventListener('i18n:languageChanged', onLanguageChanged);
    window.addEventListener('i18n:languageChanged', onLanguageChanged);
    window.removeEventListener('i18n:languageReady', onLanguageChanged);
    window.addEventListener('i18n:languageReady', onLanguageChanged);
  } catch (e) {
    // ignore
  }
}

async function loadDashboardSummary() {
  const res = await authorizedFetch(
    'https://portal.femo.kz/api/results/dashboard/summary/'
  )
  if (!res.ok) throw new Error('Ошибка при получении данных')

  const summary = await res.json()

  document.getElementById('registered-count').textContent =
    summary.registered_count
  document.getElementById('active-olympiads').textContent =
    summary.active_olympiads
  document.getElementById('average-score').textContent = summary.average_score
  document.getElementById('total-tasks').textContent = summary.total_tasks

  console.log('Данные дашборда успешно загружены:', summary)
}

async function loadCurrentOlympiad() {
  const block = document.querySelector('.olympiad-block');
  if (!block) return;

  // подхватываем заголовок, описание и кнопку
  const titleEl = block.querySelector('p.font-bold');
  const descEl  = block.querySelector('p.text-sm');
  const moreBtn = block.querySelector('a.btn-base.text-sm');

  // ищем контейнер этапов: либо явно .stages-container, либо первый .mb-4.flex
  let stagesContainer = block.querySelector('.stages-container');
  if (!stagesContainer) {
    stagesContainer = block.querySelector('.mb-4.flex');
  }
  if (!stagesContainer) {
    console.error('Не найден контейнер для этапов');
    return;
  }

  try {
    const res = await authorizedFetch(
      'https://portal.femo.kz/api/results/dashboard/current/'
    );
    if (!res.ok) {
      const { detail } = await res.json();
      if (detail === 'No active Olympiad.') {
        throw new Error('NO_OLYMP');
      }
      throw new Error('FETCH_ERROR');
    }

    const olympiad = await res.json();
    titleEl.textContent = olympiad.title;
    
    // Inject styles for Quill content if not already present
    if (!document.getElementById('quill-viewer-styles')) {
      const style = document.createElement('style');
      style.id = 'quill-viewer-styles';
      style.textContent = `
        .quill-description {
          font-family: 'Inter', sans-serif !important;
          font-size: 13px !important;
          color: #000000 !important;
          font-weight: 400 !important;
          tab-size: 4 !important;
          -moz-tab-size: 4 !important;
          white-space: pre-wrap !important;
          word-wrap: break-word !important;
        }
        /* Force specific color and whitespace on common text containers to override global styles */
        .quill-description p, 
        .quill-description span, 
        .quill-description div, 
        .quill-description li,
        .quill-description h1, 
        .quill-description h2, 
        .quill-description h3, 
        .quill-description h4 {
          color: #000000 !important;
          white-space: pre-wrap !important;
          tab-size: 4 !important;
          -moz-tab-size: 4 !important;
        }

        .quill-description * {
          box-sizing: border-box !important;
          font-weight: 400 !important;
        }
        .quill-description ul { list-style-type: disc !important; padding-left: 1.5em !important; margin-bottom: 1em !important; display: block !important; }
        .quill-description ol { list-style-type: decimal !important; padding-left: 1.5em !important; margin-bottom: 1em !important; display: block !important; }
        .quill-description li { margin-bottom: 0.25em !important; display: list-item !important; }

        .quill-description h1 { font-size: 2em !important; font-weight: 400 !important; margin-bottom: 0.5em !important; margin-top: 0.5em !important; line-height: 1.2 !important; display: block !important; }
        .quill-description h2 { font-size: 1.5em !important; font-weight: 400 !important; margin-bottom: 0.5em !important; margin-top: 0.5em !important; line-height: 1.25 !important; display: block !important; }
        .quill-description h3 { font-size: 1.17em !important; font-weight: 400 !important; margin-bottom: 0.5em !important; margin-top: 0.5em !important; line-height: 1.3 !important; display: block !important; }
        .quill-description h4 { font-size: 1em !important; font-weight: 400 !important; margin-bottom: 0.5em !important; display: block !important; }

        .quill-description p { margin-bottom: 1em !important; line-height: 1.5 !important; white-space: pre-wrap !important; display: block !important; }
        .quill-description strong, .quill-description b { font-weight: 700 !important; }
        .quill-description em, .quill-description i { font-style: italic !important; font-synthesis: style !important; }
        .quill-description u { text-decoration: underline !important; }
        .quill-description s { text-decoration: line-through !important; }
        .quill-description a { color: #2563eb !important; text-decoration: underline !important; }

        .quill-description blockquote { border-left: 4px solid #ccc !important; padding-left: 16px !important; margin-bottom: 1em !important; font-style: italic !important; color: #555 !important; display: block !important; }
        .quill-description pre { background-color: #f0f0f0 !important; padding: 10px !important; border-radius: 4px !important; font-family: monospace !important; margin-bottom: 1em !important; overflow-x: auto !important; white-space: pre !important; display: block !important; }
        .quill-description code { background-color: #f0f0f0 !important; padding: 2px 4px !important; border-radius: 3px !important; font-family: monospace !important; }

        .quill-description .ql-align-center { text-align: center !important; }
        .quill-description .ql-align-right { text-align: right !important; }
        .quill-description .ql-align-justify { text-align: justify !important; }

        .quill-description .ql-indent-1 { padding-left: 3em !important; }
        .quill-description .ql-indent-2 { padding-left: 6em !important; }
        .quill-description .ql-indent-3 { padding-left: 9em !important; }
        .quill-description .ql-indent-4 { padding-left: 12em !important; }
        .quill-description .ql-indent-5 { padding-left: 15em !important; }
        .quill-description .ql-indent-6 { padding-left: 18em !important; }
        .quill-description .ql-indent-7 { padding-left: 21em !important; }
        .quill-description .ql-indent-8 { padding-left: 24em !important; }

        .quill-description sub { vertical-align: sub !important; font-size: smaller !important; }
        .quill-description sup { vertical-align: super !important; font-size: smaller !important; }
        
        /* Fix for empty paragraphs */
        .quill-description p:empty { min-height: 1em; }

        /* Font Size */
        .quill-description .ql-size-small { font-size: 0.75em !important; }
        .quill-description .ql-size-large { font-size: 1.5em !important; }
        .quill-description .ql-size-huge { font-size: 2.5em !important; }

        /* Robust Italic */
        .quill-description em, .quill-description i { font-style: italic !important; }
        .quill-description strong em, .quill-description em strong, 
        .quill-description b i, .quill-description i b { font-weight: bold !important; font-style: italic !important; }
      `;
      document.head.appendChild(style);
    }

    descEl.className = 'quill-description text-black mb-4 leading-relaxed whitespace-pre-wrap break-words';
    descEl.innerHTML = unescapeHtml(olympiad.description || 'Без описания');

    // очищаем этапы
    stagesContainer.innerHTML = '';

    const fmt = d => {
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      return `${dd}.${mm}.${d.getFullYear()}`;
    };

    olympiad.stages.forEach((stage, idx) => {
      // блок этапа
      const stageBlock = document.createElement('div');
      stageBlock.className = 'space-y-1 text-sm';

      // заголовок этапа
      const titleP = document.createElement('p');
      titleP.className = 'flex items-center gap-1';
      if (idx === 0) {
        titleP.innerHTML = `
          <span class="text-green-primary">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none"
                 viewBox="0 0 24 24" stroke-width="1.5"
                 stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round"
                    d="M9 12.75L11.25 15L15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
            </svg>
          </span>
          <span class="font-bold">${stage.name}</span>
        `;
      } else {
        titleP.innerHTML = `<span class="font-bold">${stage.name}</span>`;
      }

      // дата
      const dateP = document.createElement('p');
      dateP.className = 'date';
      dateP.textContent = `${fmt(new Date(stage.start))} – ${fmt(new Date(stage.end))}`;

      stageBlock.append(titleP, dateP);
      stagesContainer.append(stageBlock);

      // стрелка между этапами
      if (idx < olympiad.stages.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'flex items-center px-2';
        arrow.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
               fill="currentColor" class="size-6 rotate-90 sm:rotate-0">
            <path fill-rule="evenodd"
                  d="M16.72 7.72a.75.75 0 0 1 1.06 0l3.75
                     3.75a.75.75 0 0 1 0 1.06l-3.75 3.75a.75.75
                     0 1 1-1.06-1.06l2.47-2.47H3a.75.75 0 0 1
                     0-1.5h16.19l-2.47-2.47a.75.75 0 0 1
                     0-1.06Z"/>
          </svg>
        `;
        stagesContainer.append(arrow);
      }
    });

    // кнопка «Подробнее»
    if (moreBtn) {
      if (olympiad.website) {
        moreBtn.href   = olympiad.website;
        moreBtn.target = '_blank';
        moreBtn.rel    = 'noopener noreferrer';
      } else {
        moreBtn.removeAttribute('href');
        moreBtn.classList.add('opacity-50', 'pointer-events-none');
      }
    }

  } catch (err) {
    // фоллбэк
    titleEl.textContent = err.message === 'NO_OLYMP'
      ? 'Нет активной олимпиады'
      : 'Ошибка загрузки данных';
    descEl.textContent  = err.message === 'NO_OLYMP'
      ? 'Ожидается запуск'
      : 'Пожалуйста, попробуйте позже';
    stagesContainer.innerHTML = '';
    if (moreBtn) {
      moreBtn.removeAttribute('href');
      moreBtn.classList.add('opacity-50', 'pointer-events-none');
    }
  }
}


async function loadCurrentOlympiadStats() {
  try {
    const res = await authorizedFetch(
      'https://portal.femo.kz/api/results/dashboard/current_stats/'
    );
    if (!res.ok) {
      const { detail } = await res.json();
      if (detail === 'No active Olympiad.') {
        console.warn('Нет активной олимпиады — статистика не будет загружена.');
        return;
      }
      throw new Error('Ошибка при получении статистики текущей олимпиады');
    }

    const stats = await res.json();
    console.log('Статистика текущей олимпиады:', stats);

    document.getElementById('participants-count').textContent =
      stats.participants_count ?? 0;
    document.getElementById('paid-count').textContent =
      stats.paid_count ?? 0;
    document.getElementById('new-today').textContent = `+ ${stats.new_today ?? 0}`;

    const countriesListEl = document.getElementById('countries-list');

    // --- минимально: выводим только количество стран ---
    let countryCount = '—';
    if (Array.isArray(stats.countries)) {
      countryCount = stats.countries.length;
    } else if (typeof stats.countries === 'number') {
      countryCount = stats.countries;
    } else if (typeof stats.countries_count === 'number') {
      countryCount = stats.countries_count;
    } else {
      // если поле отсутствует или пусто — показываем прочерк
      countryCount = '—';
    }

    countriesListEl.textContent = countryCount;
    // ----------------------------------------------------

  } catch (err) {
    console.error('Ошибка при загрузке статистики олимпиады:', err);
  }
}



async function loadParticipantsTrend(period = 'week') {
  try {
    const apiPeriod = period === 'year' ? 'year' : 'day'
    let res = await authorizedFetch(`https://portal.femo.kz/api/registrations/trend/?period=${apiPeriod}`)
    if (res.status === 404) {
      res = await authorizedFetch(`https://portal.femo.kz/api/results/dashboard/trend/?period=${period}`)
    }
    if (!res.ok) throw new Error('Ошибка при получении данных тренда участников')
    const trendData = await res.json()
    console.log('Данные тренда участников:', trendData)

    let labels = []
    let counts = []
    if (Array.isArray(trendData) && trendData.length) {
      if (Object.prototype.hasOwnProperty.call(trendData[0], 'period')) {
        labels = trendData.map((item) => {
          const p = item.period
          if (!p) return ''
          if (period === 'year') return String(p)
          if (typeof p === 'string' && p.includes('-')) {
            const parts = p.split('-')
            if (parts.length === 3) {
              const [, mm, dd] = parts
              return `${dd}.${mm}`
            }
          }
          return String(p)
        })
        counts = trendData.map((item) => item.count)
      } else {
        labels = trendData.map((item) => {
          if (item.date) {
            if (typeof item.date === 'string' && item.date.includes('-')) {
              const parts = item.date.split('-')
              if (parts.length === 3) {
                const [y, m, d] = parts
                if (period === 'week' || period === 'month') {
                  return `${d}.${m}`
                }
              }
            }
            const d = new Date(item.date)
            const dd = String(d.getDate()).padStart(2, '0')
            const mm = String(d.getMonth() + 1).padStart(2, '0')
            if (period === 'week' || period === 'month') return `${dd}.${mm}`
            return item.date
          }
          return String(item.year || item.date || '')
        })
        counts = trendData.map((item) => item.count)
      }
    }

    console.log('labels:', labels)
    console.log('counts:', counts)


    const ctx = document.getElementById('participantsChart').getContext('2d')

    if (window.participantsChartInstance) {
      window.participantsChartInstance.data.labels = labels
      window.participantsChartInstance.data.datasets[0].data = counts
      window.participantsChartInstance.update()
    } else {
      window.participantsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              data: counts,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              borderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: '#fff',
              tension: 0.4,
              fill: true,
              borderCapStyle: 'round',
              borderJoinStyle: 'round',
              pointStyle: 'circle',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index',
          },
          scales: {
            y: {
              beginAtZero: true,
              suggestedMax: Math.max(...counts, 10),
              ticks: {
                callback: (value) => (value % 1 === 0 ? value : ''),
                stepSize: 1,
                precision: 0, 
              },
              grid: {
                borderDash: [2, 2],
                drawBorder: false,
              },
            },
            x: {
              grid: { display: false },
              ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: { 
              backgroundColor: '#fff',
              titleColor: '#1f2937',
              bodyColor: '#1f2937',
              borderColor: '#e5e7eb',
              borderWidth: 1,
              padding: 10,
              displayColors: false,
              callbacks: {
                label: function(context) {
                  return context.parsed.y + ' участников';
                }
              }
            },
          },
        },
      })
    }
  } catch (err) {
    console.error('Ошибка при загрузке тренда участников:', err)
  }
}

// Функция, которая дергает профиль администратора
async function loadAdminProfile() {
  const token = localStorage.getItem('access_token');
  if (!token) throw new Error('Токен не найден');

  const res = await authorizedFetch(
    'https://portal.femo.kz/api/users/administrator/profile/',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Ошибка загрузки профиля: ${res.status}`);
  return await res.json();
}

function unescapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x2F;/g, "/");
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureUserAuthenticated()
  if (!user) return

  try {
    // 2) Подтягиваем актуальный профиль по API
    const profileData = await loadAdminProfile();
    // 3) Рисуем шапку
    renderUserInfo(profileData);
    await loadDashboardSummary()
    await loadCurrentOlympiad()
    await loadCurrentOlympiadStats()
    await loadParticipantsTrend()

    // Инициализация переключателей графика
    const chartTabs = document.querySelectorAll('.chart-toggle-btn');
    chartTabs.forEach(tab => {
      tab.addEventListener('click', async (e) => {
        // Сброс стилей для всех кнопок (inactive state)
        chartTabs.forEach(t => {
          t.classList.remove('active', 'bg-white', 'shadow-sm', 'text-gray-900');
          t.classList.add('text-gray-500', 'hover:text-gray-900');
        });

        // Установка активного стиля для нажатой кнопки
        const target = e.currentTarget; // use currentTarget to ensure we get the button
        target.classList.remove('text-gray-500', 'hover:text-gray-900');
        target.classList.add('active', 'bg-white', 'shadow-sm', 'text-gray-900');
        
        const period = target.dataset.period;
        if (period) {
          await loadParticipantsTrend(period);
        }
      });
    });
  } catch (err) {
    console.error('Ошибка при загрузке данных:', err)
  }
})
