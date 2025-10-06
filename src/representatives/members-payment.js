// ——————————————————————————————
// Платежи участника
let allPayments = [];
let paymentsPage = 1;
const paymentsPageSize = 20;

// 1) Загрузка платежей
async function loadParticipantPayments() {
  const participantId = new URLSearchParams(window.location.search).get('id');
  if (!participantId) return;

  try {
    const res = await authorizedFetch(
      `https://portal.femo.kz/api/results/representatives/dashboard/participants/${participantId}/payments`
    );
    if (!res.ok) throw new Error(`Ошибка загрузки: ${res.status}`);
    allPayments = await res.json();

    // Обновляем общее количество (если нужно)
    document.getElementById('payments-count').textContent =
      `Всего ${allPayments.length} платежей`;

    paymentsPage = 1;
    renderPaymentsTable();
    renderPaymentsPagination();
  } catch (err) {
    console.error('Ошибка при загрузке платежей:', err);
  }
}

// 2) Рендер таблицы платежей
function renderPaymentsTable() {
  const tbody = document.getElementById('payments-tbody');
  tbody.innerHTML = '';

  const start = (paymentsPage - 1) * paymentsPageSize;
  const pageItems = allPayments.slice(start, start + paymentsPageSize);
  const participantId = new URLSearchParams(window.location.search).get('id');

  if (pageItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-gray-500">Нет платежей</td>
      </tr>`;
    return;
  }

  pageItems.forEach(p => {
    const amountNum = Number(p.amount);
    const isNegative = amountNum < 0;
    const statusClass = p.status === 'paid' ? 'paid'
                      : p.status === 'error' ? 'error'
                      : 'onprocess';

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';
    tr.innerHTML = `
      <td class="p-table">${p.gateway_id}</td>
      <td class="p-table">${new Date(p.received_at).toLocaleDateString('ru-RU')}</td>
      <td class="p-table">${p.description}</td>
      <td class="p-table">
        <span class="${isNegative ? 'text-red-primary' : 'text-green-primary'}">
          ${Math.abs(amountNum).toLocaleString()} ₸
        </span>
      </td>
      <td class="p-table">
        <span class="card ${statusClass}">
          ${p.status === 'paid'
            ? 'Оплачено'
            : p.status === 'error'
            ? 'Ошибка'
            : 'В процессе'}
        </span>
      </td>
      <td class="p-table">
        <div class="flex cursor-pointer items-center gap-1"
             onclick="downloadPaymentReceipt('${participantId}', '${p.id}')">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
               stroke="currentColor" class="size-5 text-orange-500">
            <path stroke-linecap="round" stroke-linejoin="round"
                  d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9
                     a2.25 2.25 0 0 0 2.25 2.25h9
                     a2.25 2.25 0 0 0 2.25-2.25v-9
                     a2.25 2.25 0 0 0-2.25-2.25H15
                     M9 12l3 3m0 0 3-3m-3 3V2.25"/>
          </svg>
          <span class="ml-1 text-sm text-orange-500">Скачать</span>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

// 3) Пагинация для платежей
function renderPaymentsPagination() {
  const pagesContainer = document.getElementById('payments-pagination');
  pagesContainer.innerHTML = '';

  const total = allPayments.length;
  const totalPages = Math.max(1, Math.ceil(total / paymentsPageSize)); // ← гарантируем хотя бы 1 страницу

  // Создаём кнопки «1», «2», …, «totalPages»
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = i === paymentsPage
      ? 'border-orange-primary text-orange-primary rounded border-1 px-3 py-1'
      : 'px-3 py-1 text-gray-600 hover:bg-gray-50';
    btn.onclick = () => {
      if (paymentsPage !== i) {
        paymentsPage = i;
        updatePaymentsView();
      }
    };
    pagesContainer.appendChild(btn);
  }
}

function updatePaymentsView() {
  renderPaymentsTable();
  renderPaymentsPagination();
}

// 4) Скачивание чека/квитанции
async function downloadPaymentReceipt(participantId, transactionId) {
  try {
    const res = await authorizedFetch(
      `https://portal.femo.kz/api/results/representatives/dashboard/participants/` +
      `${participantId}/payments/${transactionId}/download`
    );
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment_${transactionId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Ошибка при скачивании платежа:', err);
    alert('Не удалось скачать квитанцию');
  }
}

// 5) Запускаем всё при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  // …ваши остальные await…
  await loadParticipantPayments();
});
