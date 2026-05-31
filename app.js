(function () {
  "use strict";

  const STORAGE_KEY = "prestamosFernando.v1";
  const MONEY = new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  });
  const NUMBER = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const DEFAULT_STATE = {
    settings: {
      businessName: "Negocios Escobar",
      ownerName: "Fernando",
      initialCash: 0,
      initialCashDate: todayISO(),
      defaultInterest: 20,
      defaultFrequency: "daily",
      defaultInstallments: 24,
      skipSundays: true,
    },
    clients: [],
    loans: [],
    payments: [],
    cashEntries: [],
  };

  const ui = {
    view: "dashboard",
    search: "",
    loanStatus: "all",
    collectionDate: todayISO(),
    reportMonth: todayISO().slice(0, 7),
  };

  let state = loadState();

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindEvents();
    hydrateStaticFields();
    render();
    updatePeruClock();
    setInterval(updatePeruClock, 1000);
    refreshIcons();
  }

  function bindEvents() {
    document.body.addEventListener("click", handleClick);
    document.body.addEventListener("input", handleInput);
    document.body.addEventListener("change", handleChange);

    $("#globalSearch").addEventListener("input", (event) => {
      ui.search = event.target.value.trim().toLowerCase();
      renderActiveView();
    });

    $("#loanStatusFilter").addEventListener("change", (event) => {
      ui.loanStatus = event.target.value;
      renderLoans();
    });

    $("#collectionDateFilter").addEventListener("change", (event) => {
      ui.collectionDate = event.target.value;
      renderCollections();
    });

    $("#reportMonth").addEventListener("change", (event) => {
      ui.reportMonth = event.target.value || todayISO().slice(0, 7);
      renderReports();
    });

    $("#importFile").addEventListener("change", importJSON);
  }

  function handleClick(event) {
    const target = event.target.closest("[data-action], [data-view]");
    if (!target) return;

    const view = target.dataset.view;
    const action = target.dataset.action;

    if (view) {
      setView(view);
      return;
    }

    const actions = {
      "toggle-sidebar": () => $("#sidebar").classList.toggle("is-open"),
      "open-loan-modal": () => openLoanModal(target.dataset.loanId || null),
      "open-client-modal": () => openClientModal(target.dataset.clientId || null),
      "open-payment-modal": () => openPaymentModal(target.dataset.loanId || null, target.dataset.installmentId || null),
      "open-cash-modal": () => openCashModal(target.dataset.type || "expense", target.dataset.entryId || null),
      "open-notifications": openNotificationsModal,
      "close-modal": closeModal,
      "save-loan": saveLoanFromForm,
      "save-client": saveClientFromForm,
      "save-payment": savePaymentFromForm,
      "save-cash-entry": saveCashEntryFromForm,
      "view-loan": () => openLoanDetail(target.dataset.loanId),
      "delete-loan": () => deleteLoan(target.dataset.loanId),
      "delete-client": () => deleteClient(target.dataset.clientId),
      "delete-cash-entry": () => deleteCashEntry(target.dataset.entryId),
      "clear-collection-date": () => {
        ui.collectionDate = "";
        $("#collectionDateFilter").value = "";
        renderCollections();
      },
      "export-json": exportJSON,
      "export-csv": exportCSV,
      "open-import": () => $("#importFile").click(),
      "save-settings": saveSettingsFromForm,
      "load-demo": loadDemoData,
      "clear-all": clearAllData,
      "print-view": () => window.print(),
      "mark-paid": () => quickPay(target.dataset.loanId, target.dataset.installmentId),
      "undo-payment": () => undoPayment(target.dataset.paymentId),
    };

    if (actions[action]) actions[action]();
  }

  function handleInput(event) {
    if (event.target.closest("#loanForm")) {
      updateLoanPreview();
    }
  }

  function handleChange(event) {
    if (event.target.closest("#loanForm")) {
      updateLoanPreview();
    }
  }

  function setView(view) {
    ui.view = view;
    $$(".view").forEach((section) => section.classList.toggle("is-active", section.id === `view-${view}`));
    $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
    $("#sidebar").classList.remove("is-open");
    renderActiveView();
  }

  function render() {
    hydrateStaticFields();
    $("#collectionDateFilter").value = ui.collectionDate;
    $("#reportMonth").value = ui.reportMonth;
    $("#loanStatusFilter").value = ui.loanStatus;
    renderActiveView();
    refreshIcons();
  }

  function renderActiveView() {
    const renderers = {
      dashboard: renderDashboard,
      loans: renderLoans,
      collections: renderCollections,
      clients: renderClients,
      cash: renderCash,
      reports: renderReports,
      settings: renderSettings,
    };
    renderers[ui.view]();
    refreshIcons();
  }

  function hydrateStaticFields() {
    const businessName = state.settings.businessName || "Negocios Escobar";
    $("#brandName").textContent = businessName;
    document.title = businessName;
    $("#todayLabel").textContent = fullDate(todayISO());
    updateNotificationBadge();
  }

  function updatePeruClock() {
    const clock = $("#peruClock");
    if (!clock) return;

    const now = new Date();
    const time = new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now);
    clock.textContent = `${time} hora Peru`;
  }

  function updateNotificationBadge() {
    const badge = $("#notificationBadge");
    if (!badge) return;
    const count = getNotificationRows().length;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
  }

  function renderDashboard() {
    const stats = getStats();
    const dueToday = getDueInstallments({ date: todayISO(), includePaid: false }).slice(0, 8);
    const late = getLateInstallments().slice(0, 8);
    const trend = getCollectionTrend(7);
    const upcoming = dueToday.length ? dueToday : late;

    $("#dashboardContent").innerHTML = `
      <div class="metric-grid">
        ${metricCard("Caja actual", money(stats.cash), "banknote", "Desde caja inicial", "is-sky")}
        ${metricCard("Por cobrar", money(stats.toCollect), "receipt-text", `${stats.activeLoans} prestamos activos`, "")}
        ${metricCard("Cobrado hoy", money(stats.collectedToday), "hand-coins", `${stats.paymentsToday} pagos`, "")}
        ${metricCard("Vencido", money(stats.lateAmount), "triangle-alert", `${stats.lateCount} cuotas`, "is-warning")}
        ${metricCard("Ganancia esperada", money(stats.expectedInterest), "trending-up", "Interes de prestamos activos", "")}
      </div>

      <div class="split-grid">
        <section class="panel">
          <div class="panel-header">
            <h2 class="panel-title">Cobros recientes</h2>
            <button class="plain-btn" type="button" data-view="reports">
              <span>Ver reportes</span>
              <i data-lucide="arrow-right"></i>
            </button>
          </div>
          <div class="panel-body">
            ${renderBars(trend)}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h2 class="panel-title">${dueToday.length ? "Cobros de hoy" : "Cuotas vencidas"}</h2>
            <button class="plain-btn" type="button" data-view="collections">
              <span>Abrir cobros</span>
              <i data-lucide="arrow-right"></i>
            </button>
          </div>
          <div class="panel-body">
            ${upcoming.length ? renderMiniDueList(upcoming) : emptyInline("No hay cuotas pendientes para hoy.")}
          </div>
        </section>
      </div>

      <div class="section-block">
        ${renderLoanTable(getFilteredLoans().slice(0, 8), "Ultimos prestamos")}
      </div>
    `;
  }

  function renderLoans() {
    const loans = getFilteredLoans().filter((loan) => {
      if (ui.loanStatus === "all") return true;
      if (ui.loanStatus === "late") return isLoanLate(loan);
      return loan.status === ui.loanStatus;
    });

    $("#loansContent").innerHTML = loans.length
      ? `<div class="loan-grid">${loans.map(renderLoanCard).join("")}</div>`
      : emptyState("Sin prestamos registrados", "Crea el primer prestamo para generar cuotas y controlar caja.", "open-loan-modal", "Nuevo prestamo");
  }

  function renderCollections() {
    const rows = getCollectionRows(ui.collectionDate);
    const title = ui.collectionDate ? `Cobros del ${formatDate(ui.collectionDate)}` : "Todos los cobros pendientes";

    $("#collectionsContent").innerHTML = `
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">${title}</h2>
          <span class="status-pill ${rows.some((row) => row.late) ? "is-late" : "is-active"}">${rows.length} cuotas</span>
        </div>
        <div class="panel-body">
          ${rows.length ? renderCollectionsTable(rows) : emptyInline("No hay cuotas pendientes con ese filtro.")}
        </div>
      </section>
    `;
  }

  function renderClients() {
    const clients = getFilteredClients();
    $("#clientsContent").innerHTML = clients.length
      ? `<div class="client-grid">${clients.map(renderClientCard).join("")}</div>`
      : emptyState("Sin clientes", "Registra clientes desde esta vista o al crear un prestamo.", "open-client-modal", "Nuevo cliente");
  }

  function renderCash() {
    const movements = getCashMovements();
    const stats = getStats();
    $("#cashContent").innerHTML = `
      <div class="metric-grid">
        ${metricCard("Caja actual", money(stats.cash), "banknote", "Disponible calculado", "is-sky")}
        ${metricCard("Ingresos", money(stats.totalIncome), "arrow-down-to-line", "Cobros e ingresos", "")}
        ${metricCard("Egresos", money(stats.totalExpense), "arrow-up-from-line", "Prestamos y gastos", "is-warning")}
        ${metricCard("Gastos", money(stats.manualExpenses), "shopping-bag", "Registrados manualmente", "is-danger")}
        ${metricCard("Desembolsado", money(stats.disbursed), "wallet", "Capital prestado", "")}
      </div>

      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Movimientos de caja</h2>
          <div class="table-actions">
            <button class="mini-btn" type="button" data-action="open-cash-modal" data-type="income">
              <i data-lucide="plus"></i>
              <span>Ingreso</span>
            </button>
            <button class="mini-btn" type="button" data-action="open-cash-modal" data-type="expense">
              <i data-lucide="minus"></i>
              <span>Gasto</span>
            </button>
          </div>
        </div>
        <div class="panel-body">
          ${movements.length ? renderCashTable(movements) : emptyInline("Aun no hay movimientos de caja.")}
        </div>
      </section>
    `;
  }

  function renderReports() {
    const month = ui.reportMonth || todayISO().slice(0, 7);
    const monthPayments = getAllPaymentGroups().filter((payment) => payment.date.startsWith(month));
    const monthExpenses = state.cashEntries.filter((entry) => entry.date.startsWith(month) && entry.type === "expense");
    const monthLoans = state.loans.filter((loan) => loan.disbursementDate.startsWith(month));
    const categoryRows = getExpenseCategories(month);
    const trend = getCollectionTrend(14);

    const income = sum(monthPayments, "amount") + sum(state.cashEntries.filter((entry) => entry.date.startsWith(month) && entry.type === "income"), "amount");
    const expenses = sum(monthExpenses, "amount") + sum(monthLoans, "amount");
    const interest = monthLoans.reduce((total, loan) => total + getLoanInterest(loan), 0);

    $("#reportsContent").innerHTML = `
      <div class="metric-grid">
        ${metricCard("Ingresos del mes", money(income), "arrow-down-to-line", `${monthPayments.length} cobros`, "")}
        ${metricCard("Egresos del mes", money(expenses), "arrow-up-from-line", `${monthLoans.length} prestamos`, "is-warning")}
        ${metricCard("Interes creado", money(interest), "percent", "Prestamos nuevos", "")}
        ${metricCard("Clientes activos", statsNumber(getActiveClientCount()), "users", "Con saldo pendiente", "is-sky")}
        ${metricCard("Mora actual", money(getStats().lateAmount), "triangle-alert", "Cuotas vencidas", "is-danger")}
      </div>

      <div class="split-grid">
        <section class="panel">
          <div class="panel-header">
            <h2 class="panel-title">Cobros ultimos 14 dias</h2>
          </div>
          <div class="panel-body">
            ${renderBars(trend)}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h2 class="panel-title">Gastos por categoria</h2>
          </div>
          <div class="panel-body">
            ${categoryRows.length ? renderCategoryList(categoryRows) : emptyInline("Sin gastos en este mes.")}
          </div>
        </section>
      </div>

      <div class="section-block">
        ${renderLoanTable(getFilteredLoans().slice(0, 12), "Cartera actual")}
      </div>
    `;
  }

  function renderSettings() {
    $("#settingsContent").innerHTML = `
      <div class="settings-grid">
        <section class="panel">
          <div class="panel-header">
            <h2 class="panel-title">Datos del negocio</h2>
          </div>
          <div class="panel-body">
            <form id="settingsForm">
              <div class="form-grid">
                <div class="field">
                  <label for="businessName">Nombre</label>
                  <input id="businessName" value="${escapeAttr(state.settings.businessName)}" required />
                </div>
                <div class="field">
                  <label for="ownerName">Responsable</label>
                  <input id="ownerName" value="${escapeAttr(state.settings.ownerName)}" />
                </div>
                <div class="field">
                  <label for="initialCash">Caja inicial</label>
                  <input id="initialCash" type="number" min="0" step="0.01" value="${state.settings.initialCash}" />
                </div>
                <div class="field">
                  <label for="initialCashDate">Fecha caja inicial</label>
                  <input id="initialCashDate" type="date" value="${state.settings.initialCashDate}" />
                </div>
                <div class="field">
                  <label for="defaultInterest">Interes por defecto</label>
                  <input id="defaultInterest" type="number" min="0" step="0.01" value="${state.settings.defaultInterest}" />
                </div>
                <div class="field">
                  <label for="defaultInstallments">Cuotas por defecto</label>
                  <input id="defaultInstallments" type="number" min="1" step="1" value="${state.settings.defaultInstallments}" />
                </div>
                <div class="field">
                  <label for="defaultFrequency">Frecuencia</label>
                  <select id="defaultFrequency">
                    ${option("daily", "Diario", state.settings.defaultFrequency)}
                    ${option("weekly", "Semanal", state.settings.defaultFrequency)}
                    ${option("monthly", "Mensual", state.settings.defaultFrequency)}
                  </select>
                </div>
                <div class="field">
                  <label for="skipSundays">Domingos</label>
                  <select id="skipSundays">
                    ${option("true", "No cobrar domingos", String(Boolean(state.settings.skipSundays)))}
                    ${option("false", "Cobrar todos los dias", String(Boolean(state.settings.skipSundays)))}
                  </select>
                </div>
              </div>
              <div class="form-actions section-block">
                <button class="primary-btn" type="button" data-action="save-settings">
                  <i data-lucide="save"></i>
                  <span>Guardar ajustes</span>
                </button>
              </div>
            </form>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h2 class="panel-title">Respaldo y datos</h2>
          </div>
          <div class="panel-body">
            <div class="toolbar-row" style="justify-content:flex-start">
              <button class="ghost-btn" type="button" data-action="export-json">
                <i data-lucide="download"></i>
                <span>Exportar JSON</span>
              </button>
              <button class="ghost-btn" type="button" data-action="open-import">
                <i data-lucide="upload"></i>
                <span>Importar JSON</span>
              </button>
              <button class="ghost-btn" type="button" data-action="export-csv">
                <i data-lucide="file-spreadsheet"></i>
                <span>Exportar CSV</span>
              </button>
            </div>
            <div class="toolbar-row section-block" style="justify-content:flex-start">
              <button class="ghost-btn" type="button" data-action="load-demo">
                <i data-lucide="database"></i>
                <span>Cargar ejemplo</span>
              </button>
              <button class="danger-btn" type="button" data-action="clear-all">
                <i data-lucide="trash-2"></i>
                <span>Borrar todo</span>
              </button>
            </div>
            <p class="muted section-block">Clientes: ${state.clients.length} - Prestamos: ${state.loans.length} - Pagos: ${state.payments.length}</p>
          </div>
        </section>
      </div>
    `;
  }

  function renderLoanCard(loan) {
    const client = getClient(loan.clientId);
    const status = getLoanStatus(loan);
    const paid = getLoanPaid(loan.id);
    const total = getLoanTotal(loan);
    const balance = Math.max(total - paid, 0);
    const progress = total ? Math.min((paid / total) * 100, 100) : 0;
    const next = getNextInstallment(loan);

    return `
      <article class="loan-card">
        <div class="loan-card-head">
          <div>
            <h3>${escapeHtml(client?.name || "Cliente eliminado")}</h3>
            <div class="meta-line">
              <span>${frequencyLabel(loan.frequency)}</span>
              <span>${loan.installments.length} cuotas</span>
              ${client?.town ? `<span>${escapeHtml(client.town)}</span>` : ""}
            </div>
          </div>
          ${statusPill(status)}
        </div>
        <div>
          <div class="progress-track" aria-label="Progreso de pago">
            <div class="progress-fill" style="width:${progress}%"></div>
          </div>
        </div>
        <div class="loan-stats">
          <div><span>Prestado</span><strong>${money(loan.amount)}</strong></div>
          <div><span>Saldo</span><strong>${money(balance)}</strong></div>
          <div><span>Proxima</span><strong>${next ? formatDate(next.dueDate) : "Listo"}</strong></div>
        </div>
        <div class="table-actions">
          <button class="mini-btn" type="button" data-action="view-loan" data-loan-id="${loan.id}">
            <i data-lucide="eye"></i>
            <span>Ver</span>
          </button>
          ${balance > 0 ? `
            <button class="mini-btn" type="button" data-action="open-payment-modal" data-loan-id="${loan.id}">
              <i data-lucide="circle-dollar-sign"></i>
              <span>Cobrar</span>
            </button>
          ` : ""}
          ${next ? whatsappButton(client, loan, next, "WhatsApp") : ""}
          <button class="mini-btn" type="button" data-action="open-loan-modal" data-loan-id="${loan.id}">
            <i data-lucide="pencil"></i>
            <span>Editar</span>
          </button>
        </div>
      </article>
    `;
  }

  function renderClientCard(client) {
    const loans = state.loans.filter((loan) => loan.clientId === client.id);
    const active = loans.filter((loan) => loan.status === "active").length;
    const balance = loans.reduce((total, loan) => total + Math.max(getLoanTotal(loan) - getLoanPaid(loan.id), 0), 0);

    return `
      <article class="client-card">
        <div class="client-card-head">
          <div>
            <h3>${escapeHtml(client.name)}</h3>
            <div class="meta-line">
              ${client.phone ? `<span>${escapeHtml(client.phone)}</span>` : ""}
              ${client.town ? `<span>${escapeHtml(client.town)}</span>` : ""}
            </div>
          </div>
          <span class="status-pill ${active ? "is-active" : "is-closed"}">${active ? `${active} activo` : "Sin saldo"}</span>
        </div>
        ${client.address ? `<p class="muted" style="margin:0">${escapeHtml(client.address)}</p>` : ""}
        <div class="loan-stats">
          <div><span>Prestamos</span><strong>${loans.length}</strong></div>
          <div><span>Saldo</span><strong>${money(balance)}</strong></div>
          <div><span>Pagos</span><strong>${state.payments.filter((payment) => loans.some((loan) => loan.id === payment.loanId)).length}</strong></div>
        </div>
        <div class="table-actions">
          <button class="mini-btn" type="button" data-action="open-loan-modal">
            <i data-lucide="plus"></i>
            <span>Prestamo</span>
          </button>
          <button class="mini-btn" type="button" data-action="open-client-modal" data-client-id="${client.id}">
            <i data-lucide="pencil"></i>
            <span>Editar</span>
          </button>
          <button class="mini-btn" type="button" data-action="delete-client" data-client-id="${client.id}">
            <i data-lucide="trash-2"></i>
            <span>Borrar</span>
          </button>
        </div>
      </article>
    `;
  }

  function renderLoanTable(loans, title) {
    return `
      <section class="panel">
        <div class="panel-header">
          <h2 class="panel-title">${title}</h2>
          <button class="plain-btn" type="button" data-view="loans">
            <span>Ver todos</span>
            <i data-lucide="arrow-right"></i>
          </button>
        </div>
        <div class="panel-body">
          ${loans.length ? `
            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Frecuencia</th>
                    <th class="is-number">Prestado</th>
                    <th class="is-number">Interes</th>
                    <th class="is-number">Pagado</th>
                    <th class="is-number">Saldo</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${loans.map((loan) => {
                    const client = getClient(loan.clientId);
                    const total = getLoanTotal(loan);
                    const paid = getLoanPaid(loan.id);
                    return `
                      <tr>
                        <td>${escapeHtml(client?.name || "Cliente eliminado")}</td>
                        <td>${frequencyLabel(loan.frequency)}</td>
                        <td class="is-number">${money(loan.amount)}</td>
                        <td class="is-number">${money(getLoanInterest(loan))}</td>
                        <td class="is-number money-positive">${money(paid)}</td>
                        <td class="is-number">${money(Math.max(total - paid, 0))}</td>
                        <td>${statusPill(getLoanStatus(loan))}</td>
                        <td>
                          <div class="table-actions">
                            <button class="mini-btn" type="button" data-action="view-loan" data-loan-id="${loan.id}">
                              <i data-lucide="eye"></i>
                              <span>Ver</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          ` : emptyInline("Aun no hay prestamos para mostrar.")}
        </div>
      </section>
    `;
  }

  function renderCollectionsTable(rows) {
    return `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Zona</th>
              <th class="is-number">Cuota</th>
              <th class="is-number">Pendiente</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${formatDate(row.installment.dueDate)}</td>
                <td>${escapeHtml(row.client?.name || "Cliente eliminado")}</td>
                <td>${escapeHtml(row.client?.town || "")}</td>
                <td class="is-number">${money(row.installment.amount)}</td>
                <td class="is-number">${money(getInstallmentBalance(row.installment))}</td>
                <td>${row.late ? '<span class="status-pill is-late">Vencido</span>' : '<span class="status-pill is-active">Hoy</span>'}</td>
                <td>
                  <div class="table-actions">
                    <button class="mini-btn" type="button" data-action="mark-paid" data-loan-id="${row.loan.id}" data-installment-id="${row.installment.id}">
                      <i data-lucide="check"></i>
                      <span>Pagar</span>
                    </button>
                    <button class="mini-btn" type="button" data-action="open-payment-modal" data-loan-id="${row.loan.id}" data-installment-id="${row.installment.id}">
                      <i data-lucide="pencil"></i>
                      <span>Monto</span>
                    </button>
                    ${whatsappButton(row.client, row.loan, row.installment)}
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderMiniDueList(rows) {
    return `
      <div class="data-table-wrap">
        <table class="data-table" style="min-width:560px">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Fecha</th>
              <th class="is-number">Pendiente</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.client?.name || "Cliente eliminado")}</td>
                <td>${formatDate(row.installment.dueDate)}</td>
                <td class="is-number">${money(getInstallmentBalance(row.installment))}</td>
                <td>
                  <div class="table-actions">
                    <button class="mini-btn" type="button" data-action="mark-paid" data-loan-id="${row.loan.id}" data-installment-id="${row.installment.id}">
                      <i data-lucide="check"></i>
                      <span>Pagar</span>
                    </button>
                    ${whatsappButton(row.client, row.loan, row.installment)}
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCashTable(movements) {
    let running = 0;
    return `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Detalle</th>
              <th class="is-number">Ingreso</th>
              <th class="is-number">Egreso</th>
              <th class="is-number">Saldo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${movements.map((movement) => {
              running += movement.signedAmount;
              return `
                <tr>
                  <td>${formatDate(movement.date)}</td>
                  <td>${escapeHtml(movement.typeLabel)}</td>
                  <td>${escapeHtml(movement.description)}</td>
                  <td class="is-number money-positive">${movement.signedAmount > 0 ? money(movement.signedAmount) : ""}</td>
                  <td class="is-number money-negative">${movement.signedAmount < 0 ? money(Math.abs(movement.signedAmount)) : ""}</td>
                  <td class="is-number">${money(running)}</td>
                  <td>
                    ${movement.source === "cashEntry" ? `
                      <div class="table-actions">
                        <button class="mini-btn" type="button" data-action="open-cash-modal" data-entry-id="${movement.id}" data-type="${movement.entryType}">
                          <i data-lucide="pencil"></i>
                          <span>Editar</span>
                        </button>
                        <button class="mini-btn" type="button" data-action="delete-cash-entry" data-entry-id="${movement.id}">
                          <i data-lucide="trash-2"></i>
                          <span>Borrar</span>
                        </button>
                      </div>
                    ` : ""}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderBars(rows) {
    const max = Math.max(...rows.map((row) => row.amount), 1);
    return `
      <div class="chart-bars">
        ${rows.map((row) => {
          const height = Math.max((row.amount / max) * 170, row.amount ? 14 : 8);
          return `
            <div class="chart-bar">
              <div class="chart-value">${row.amount ? moneyShort(row.amount) : "0"}</div>
              <div class="chart-column" style="height:${height}px"></div>
              <div class="chart-label">${row.label}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderCategoryList(rows) {
    const max = Math.max(...rows.map((row) => row.amount), 1);
    return `
      <div class="category-list">
        ${rows.map((row) => `
          <div class="category-row">
            <strong>${escapeHtml(row.category)}</strong>
            <div class="category-line"><span style="width:${Math.max((row.amount / max) * 100, 3)}%"></span></div>
            <span class="nowrap">${money(row.amount)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function openLoanModal(loanId) {
    const loan = loanId ? state.loans.find((item) => item.id === loanId) : null;
    const client = loan ? getClient(loan.clientId) : null;
    const title = loan ? "Editar prestamo" : "Nuevo prestamo";

    openModal(title, "Prestamo", `
      <form id="loanForm" data-loan-id="${loan?.id || ""}">
        <div class="form-grid">
          <div class="field">
            <label for="loanClientName">Cliente</label>
            <input id="loanClientName" list="clientNames" value="${escapeAttr(client?.name || "")}" required />
            <datalist id="clientNames">
              ${state.clients.map((item) => `<option value="${escapeAttr(item.name)}"></option>`).join("")}
            </datalist>
          </div>
          <div class="field">
            <label for="loanPhone">Celular</label>
            <input id="loanPhone" value="${escapeAttr(client?.phone || "")}" />
          </div>
          <div class="field">
            <label for="loanTown">Pueblo o zona</label>
            <input id="loanTown" value="${escapeAttr(client?.town || "")}" />
          </div>
          <div class="field">
            <label for="loanAddress">Direccion</label>
            <input id="loanAddress" value="${escapeAttr(client?.address || "")}" />
          </div>
        </div>

        <div class="form-grid three section-block">
          <div class="field">
            <label for="loanAmount">Monto prestado</label>
            <input id="loanAmount" type="number" min="0" step="0.01" value="${loan?.amount ?? ""}" required />
          </div>
          <div class="field">
            <label for="loanInterest">Interes %</label>
            <input id="loanInterest" type="number" min="0" step="0.01" value="${loan?.interestRate ?? state.settings.defaultInterest}" required />
          </div>
          <div class="field">
            <label for="loanInstallments">Cuotas</label>
            <input id="loanInstallments" type="number" min="1" step="1" value="${loan?.installmentCount ?? state.settings.defaultInstallments}" required />
          </div>
          <div class="field">
            <label for="loanFrequency">Frecuencia</label>
            <select id="loanFrequency">
              ${option("daily", "Diario", loan?.frequency ?? state.settings.defaultFrequency)}
              ${option("weekly", "Semanal", loan?.frequency ?? state.settings.defaultFrequency)}
              ${option("monthly", "Mensual", loan?.frequency ?? state.settings.defaultFrequency)}
            </select>
          </div>
          <div class="field">
            <label for="loanDisbursementDate">Fecha prestamo</label>
            <input id="loanDisbursementDate" type="date" value="${loan?.disbursementDate || todayISO()}" required />
          </div>
          <div class="field">
            <label for="loanStartDate">Primer cobro</label>
            <input id="loanStartDate" type="date" value="${loan?.startDate || todayISO()}" required />
          </div>
          <div class="field">
            <label for="loanSkipSundays">Cobro diario</label>
            <select id="loanSkipSundays">
              ${option("true", "No cobrar domingos", String(loan?.skipSundays ?? state.settings.skipSundays))}
              ${option("false", "Cobrar todos los dias", String(loan?.skipSundays ?? state.settings.skipSundays))}
            </select>
          </div>
          <div class="field full">
            <label for="loanNotes">Notas</label>
            <textarea id="loanNotes">${escapeHtml(loan?.notes || "")}</textarea>
          </div>
        </div>

        <div class="preview-strip" id="loanPreview"></div>

        <div class="form-actions">
          ${loan ? `
            <button class="danger-btn" type="button" data-action="delete-loan" data-loan-id="${loan.id}">
              <i data-lucide="trash-2"></i>
              <span>Borrar</span>
            </button>
          ` : ""}
          <button class="ghost-btn" type="button" data-action="close-modal">Cancelar</button>
          <button class="primary-btn" type="button" data-action="save-loan">
            <i data-lucide="save"></i>
            <span>Guardar</span>
          </button>
        </div>
      </form>
    `);
    updateLoanPreview();
  }

  function saveLoanFromForm() {
    const form = $("#loanForm");
    const loanId = form.dataset.loanId;
    const name = $("#loanClientName").value.trim();
    const amount = toNumber($("#loanAmount").value);
    const interestRate = toNumber($("#loanInterest").value);
    const installmentCount = Math.max(1, parseInt($("#loanInstallments").value, 10) || 1);

    if (!name || amount <= 0) {
      toast("Falta cliente o monto.");
      return;
    }

    const client = upsertClient({
      name,
      phone: $("#loanPhone").value.trim(),
      town: $("#loanTown").value.trim(),
      address: $("#loanAddress").value.trim(),
    });

    const frequency = $("#loanFrequency").value;
    const disbursementDate = $("#loanDisbursementDate").value || todayISO();
    const startDate = $("#loanStartDate").value || disbursementDate;
    const skipSundays = $("#loanSkipSundays").value === "true";
    const total = amount + round2(amount * (interestRate / 100));
    const schedule = generateSchedule({
      total,
      count: installmentCount,
      startDate,
      frequency,
      skipSundays,
      loanId: loanId || makeId("loan"),
    });

    if (loanId) {
      const index = state.loans.findIndex((loan) => loan.id === loanId);
      const oldLoan = state.loans[index];
      state.loans[index] = {
        ...oldLoan,
        clientId: client.id,
        amount,
        interestRate,
        frequency,
        installmentCount,
        disbursementDate,
        startDate,
        skipSundays,
        notes: $("#loanNotes").value.trim(),
        installments: mergeSchedulePayments(schedule, oldLoan),
      };
      refreshLoanStatus(state.loans[index]);
    } else {
      const loan = {
        id: schedule[0]?.loanId || makeId("loan"),
        clientId: client.id,
        amount,
        interestRate,
        frequency,
        installmentCount,
        disbursementDate,
        startDate,
        skipSundays,
        notes: $("#loanNotes").value.trim(),
        status: "active",
        createdAt: new Date().toISOString(),
        installments: schedule,
      };
      loan.installments = loan.installments.map((item) => ({ ...item, loanId: loan.id }));
      state.loans.push(loan);
    }

    saveState();
    closeModal();
    render();
    toast("Prestamo guardado.");
  }

  function updateLoanPreview() {
    const preview = $("#loanPreview");
    if (!preview) return;

    const amount = toNumber($("#loanAmount")?.value);
    const rate = toNumber($("#loanInterest")?.value);
    const count = Math.max(1, parseInt($("#loanInstallments")?.value, 10) || 1);
    const interest = round2(amount * (rate / 100));
    const total = round2(amount + interest);
    const installment = count ? round2(total / count) : 0;

    preview.innerHTML = `
      <div class="preview-item"><span>Interes</span><strong>${money(interest)}</strong></div>
      <div class="preview-item"><span>Total a cobrar</span><strong>${money(total)}</strong></div>
      <div class="preview-item"><span>Cuota promedio</span><strong>${money(installment)}</strong></div>
      <div class="preview-item"><span>Frecuencia</span><strong>${frequencyLabel($("#loanFrequency")?.value || "daily")}</strong></div>
    `;
  }

  function openClientModal(clientId) {
    const client = clientId ? getClient(clientId) : null;
    openModal(client ? "Editar cliente" : "Nuevo cliente", "Agenda", `
      <form id="clientForm" data-client-id="${client?.id || ""}">
        <div class="form-grid">
          <div class="field">
            <label for="clientName">Nombre</label>
            <input id="clientName" value="${escapeAttr(client?.name || "")}" required />
          </div>
          <div class="field">
            <label for="clientPhone">Celular</label>
            <input id="clientPhone" value="${escapeAttr(client?.phone || "")}" />
          </div>
          <div class="field">
            <label for="clientTown">Pueblo o zona</label>
            <input id="clientTown" value="${escapeAttr(client?.town || "")}" />
          </div>
          <div class="field">
            <label for="clientAddress">Direccion</label>
            <input id="clientAddress" value="${escapeAttr(client?.address || "")}" />
          </div>
        </div>
        <div class="form-actions section-block">
          <button class="ghost-btn" type="button" data-action="close-modal">Cancelar</button>
          <button class="primary-btn" type="button" data-action="save-client">
            <i data-lucide="save"></i>
            <span>Guardar</span>
          </button>
        </div>
      </form>
    `);
  }

  function saveClientFromForm() {
    const form = $("#clientForm");
    const clientId = form.dataset.clientId;
    const name = $("#clientName").value.trim();
    if (!name) {
      toast("Falta el nombre del cliente.");
      return;
    }

    const data = {
      name,
      phone: $("#clientPhone").value.trim(),
      town: $("#clientTown").value.trim(),
      address: $("#clientAddress").value.trim(),
    };

    if (clientId) {
      const index = state.clients.findIndex((client) => client.id === clientId);
      state.clients[index] = { ...state.clients[index], ...data };
    } else {
      state.clients.push({ id: makeId("client"), ...data, createdAt: new Date().toISOString() });
    }

    saveState();
    closeModal();
    render();
    toast("Cliente guardado.");
  }

  function openPaymentModal(loanId, installmentId) {
    const activeLoans = state.loans.filter((loan) => loan.status !== "closed" && getLoanBalance(loan) > 0);
    const loan = loanId ? state.loans.find((item) => item.id === loanId) : activeLoans[0];
    const installments = loan ? loan.installments.filter((item) => getInstallmentBalance(item) > 0) : [];
    const installment = installmentId ? installments.find((item) => item.id === installmentId) : installments[0];
    const amount = installment ? getInstallmentBalance(installment) : 0;

    openModal("Registrar cobro", "Caja", `
      <form id="paymentForm">
        <div class="form-grid">
          <div class="field">
            <label for="paymentLoan">Prestamo</label>
            <select id="paymentLoan" required>
              ${activeLoans.map((item) => {
                const client = getClient(item.clientId);
                return option(item.id, `${client?.name || "Cliente"} - ${money(getLoanBalance(item))}`, loan?.id);
              }).join("")}
            </select>
          </div>
          <div class="field">
            <label for="paymentInstallment">Cuota</label>
            <select id="paymentInstallment" required>
              ${installments.map((item) => option(item.id, `${formatDate(item.dueDate)} - ${money(getInstallmentBalance(item))}`, installment?.id)).join("")}
            </select>
          </div>
          <div class="field">
            <label for="paymentAmount">Monto</label>
            <input id="paymentAmount" type="number" min="0" step="0.01" value="${amount}" required />
          </div>
          <div class="field">
            <label for="paymentDate">Fecha</label>
            <input id="paymentDate" type="date" value="${todayISO()}" required />
          </div>
          <div class="field">
            <label for="paymentMethod">Metodo</label>
            <select id="paymentMethod">
              <option value="Efectivo">Efectivo</option>
              <option value="Yape">Yape</option>
              <option value="Plin">Plin</option>
              <option value="Transferencia">Transferencia</option>
            </select>
          </div>
          <div class="field">
            <label for="paymentNotes">Notas</label>
            <input id="paymentNotes" />
          </div>
        </div>
        <div class="preview-strip" id="paymentPreview"></div>
        <div class="form-actions section-block">
          <button class="ghost-btn" type="button" data-action="close-modal">Cancelar</button>
          <button class="primary-btn" type="button" data-action="save-payment">
            <i data-lucide="save"></i>
            <span>Guardar cobro</span>
          </button>
        </div>
      </form>
    `);

    const loanSelect = $("#paymentLoan");
    const installmentSelect = $("#paymentInstallment");
    loanSelect.addEventListener("change", () => {
      const selectedLoan = state.loans.find((item) => item.id === loanSelect.value);
      const openItems = selectedLoan.installments.filter((item) => getInstallmentBalance(item) > 0);
      installmentSelect.innerHTML = openItems.map((item) => option(item.id, `${formatDate(item.dueDate)} - ${money(getInstallmentBalance(item))}`, openItems[0]?.id)).join("");
      $("#paymentAmount").value = openItems[0] ? getInstallmentBalance(openItems[0]) : 0;
      updatePaymentPreview();
    });
    installmentSelect.addEventListener("change", () => {
      const selectedLoan = state.loans.find((item) => item.id === loanSelect.value);
      const selectedInstallment = selectedLoan.installments.find((item) => item.id === installmentSelect.value);
      $("#paymentAmount").value = selectedInstallment ? getInstallmentBalance(selectedInstallment) : 0;
      updatePaymentPreview();
    });
    $("#paymentAmount").addEventListener("input", updatePaymentPreview);
    updatePaymentPreview();
  }

  function updatePaymentPreview() {
    const preview = $("#paymentPreview");
    if (!preview) return;

    const loan = state.loans.find((item) => item.id === $("#paymentLoan")?.value);
    const installmentId = $("#paymentInstallment")?.value;
    const amount = toNumber($("#paymentAmount")?.value);
    const coverage = getPaymentCoveragePreview(loan, installmentId, amount);

    preview.innerHTML = `
      <div class="preview-item"><span>Monto recibido</span><strong>${money(coverage.amount)}</strong></div>
      <div class="preview-item"><span>Cuotas que cubre</span><strong>${coverage.count}</strong></div>
      <div class="preview-item"><span>Cuotas adelantadas</span><strong>${coverage.advanceInstallments}</strong></div>
      <div class="preview-item"><span>Cubre hasta</span><strong>${coverage.lastDueDate ? formatDate(coverage.lastDueDate) : "-"}</strong></div>
    `;
  }

  function savePaymentFromForm() {
    const loanId = $("#paymentLoan").value;
    const installmentId = $("#paymentInstallment").value;
    const amount = toNumber($("#paymentAmount").value);
    const date = $("#paymentDate").value || todayISO();
    if (!loanId || !installmentId || amount <= 0) {
      toast("Falta prestamo, cuota o monto.");
      return;
    }

    applyPayment({
      loanId,
      installmentId,
      amount,
      date,
      method: $("#paymentMethod").value,
      notes: $("#paymentNotes").value.trim(),
    });
    saveState();
    closeModal();
    render();
    toast("Cobro registrado.");
  }

  function openCashModal(type, entryId) {
    const entry = entryId ? state.cashEntries.find((item) => item.id === entryId) : null;
    const entryType = entry?.type || type;
    openModal(entry ? "Editar movimiento" : entryType === "income" ? "Nuevo ingreso" : "Nuevo gasto", "Caja", `
      <form id="cashForm" data-entry-id="${entry?.id || ""}">
        <div class="form-grid">
          <div class="field">
            <label for="cashType">Tipo</label>
            <select id="cashType">
              ${option("income", "Ingreso", entryType)}
              ${option("expense", "Gasto", entryType)}
            </select>
          </div>
          <div class="field">
            <label for="cashDate">Fecha</label>
            <input id="cashDate" type="date" value="${entry?.date || todayISO()}" required />
          </div>
          <div class="field">
            <label for="cashAmount">Monto</label>
            <input id="cashAmount" type="number" min="0" step="0.01" value="${entry?.amount || ""}" required />
          </div>
          <div class="field">
            <label for="cashCategory">Categoria</label>
            <select id="cashCategory">
              ${["Comida", "Gasolina", "Descuadre", "Recarga", "Moto", "Deposito", "Ingreso extra", "Otros"].map((cat) => option(cat, cat, entry?.category || "Otros")).join("")}
            </select>
          </div>
          <div class="field full">
            <label for="cashDescription">Detalle</label>
            <input id="cashDescription" value="${escapeAttr(entry?.description || "")}" required />
          </div>
        </div>
        <div class="form-actions section-block">
          ${entry ? `
            <button class="danger-btn" type="button" data-action="delete-cash-entry" data-entry-id="${entry.id}">
              <i data-lucide="trash-2"></i>
              <span>Borrar</span>
            </button>
          ` : ""}
          <button class="ghost-btn" type="button" data-action="close-modal">Cancelar</button>
          <button class="primary-btn" type="button" data-action="save-cash-entry">
            <i data-lucide="save"></i>
            <span>Guardar</span>
          </button>
        </div>
      </form>
    `);
  }

  function saveCashEntryFromForm() {
    const form = $("#cashForm");
    const entryId = form.dataset.entryId;
    const amount = toNumber($("#cashAmount").value);
    const description = $("#cashDescription").value.trim();

    if (amount <= 0 || !description) {
      toast("Falta monto o detalle.");
      return;
    }

    const entry = {
      id: entryId || makeId("cash"),
      type: $("#cashType").value,
      date: $("#cashDate").value || todayISO(),
      amount,
      category: $("#cashCategory").value,
      description,
      createdAt: entryId ? state.cashEntries.find((item) => item.id === entryId)?.createdAt : new Date().toISOString(),
    };

    if (entryId) {
      const index = state.cashEntries.findIndex((item) => item.id === entryId);
      state.cashEntries[index] = entry;
    } else {
      state.cashEntries.push(entry);
    }

    saveState();
    closeModal();
    render();
    toast("Movimiento guardado.");
  }

  function openLoanDetail(loanId) {
    const loan = state.loans.find((item) => item.id === loanId);
    if (!loan) return;
    const client = getClient(loan.clientId);
    const paid = getLoanPaid(loan.id);
    const total = getLoanTotal(loan);
    const balance = Math.max(total - paid, 0);

    openModal(`Prestamo de ${client?.name || "cliente"}`, "Detalle", `
      <div class="detail-grid">
        <div class="detail-item"><span>Prestado</span><strong>${money(loan.amount)}</strong></div>
        <div class="detail-item"><span>Interes</span><strong>${money(getLoanInterest(loan))}</strong></div>
        <div class="detail-item"><span>Total</span><strong>${money(total)}</strong></div>
        <div class="detail-item"><span>Saldo</span><strong>${money(balance)}</strong></div>
      </div>
      ${renderAdvanceSummary(loan)}
      <div class="meta-line" style="margin-bottom:16px">
        ${client?.phone ? `<span>${escapeHtml(client.phone)}</span>` : ""}
        ${client?.town ? `<span>${escapeHtml(client.town)}</span>` : ""}
        ${client?.address ? `<span>${escapeHtml(client.address)}</span>` : ""}
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th class="is-number">Cuota</th>
              <th class="is-number">Pagado</th>
              <th>Pagado el</th>
              <th>Adelanto</th>
              <th class="is-number">Pendiente</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${loan.installments.map((item) => `
              <tr>
                <td>${item.number}</td>
                <td>${formatDate(item.dueDate)}</td>
                <td class="is-number">${money(item.amount)}</td>
                <td class="is-number money-positive">${money(item.paidAmount || 0)}</td>
                <td>${installmentPaidDate(item)}</td>
                <td>${installmentAdvancePill(item)}</td>
                <td class="is-number">${money(getInstallmentBalance(item))}</td>
                <td>${installmentStatusPill(item)}</td>
                <td>
                  ${getInstallmentBalance(item) > 0 ? `
                    <div class="table-actions">
                      <button class="mini-btn" type="button" data-action="mark-paid" data-loan-id="${loan.id}" data-installment-id="${item.id}">
                        <i data-lucide="check"></i>
                        <span>Pagar</span>
                      </button>
                      <button class="mini-btn" type="button" data-action="open-payment-modal" data-loan-id="${loan.id}" data-installment-id="${item.id}">
                        <i data-lucide="pencil"></i>
                        <span>Monto</span>
                      </button>
                      ${whatsappButton(client, loan, item)}
                    </div>
                  ` : ""}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      ${renderPaymentsHistory(loan.id)}
      <div class="form-actions section-block">
        <button class="ghost-btn" type="button" data-action="open-loan-modal" data-loan-id="${loan.id}">
          <i data-lucide="pencil"></i>
          <span>Editar</span>
        </button>
        <button class="primary-btn" type="button" data-action="open-payment-modal" data-loan-id="${loan.id}">
          <i data-lucide="circle-dollar-sign"></i>
          <span>Registrar cobro</span>
        </button>
        ${whatsappButton(client, loan, getNextInstallment(loan))}
      </div>
    `, true);
  }

  function renderAdvanceSummary(loan) {
    const groups = getPaymentGroups(loan.id);
    const advancedGroups = groups.filter((group) => group.advanceInstallments > 0 || group.maxAdvanceDays > 0);
    const paidInstallments = loan.installments.filter((item) => getInstallmentBalance(item) <= 0).length;
    const next = getNextInstallment(loan);
    const lastAdvanced = advancedGroups.sort((a, b) => b.date.localeCompare(a.date))[0];

    return `
      <div class="advance-summary">
        <div class="advance-chip">
          <span>Cuotas pagadas</span>
          <strong>${paidInstallments} de ${loan.installments.length}</strong>
        </div>
        <div class="advance-chip">
          <span>Proxima cuota</span>
          <strong>${next ? `${formatDate(next.dueDate)} - ${money(getInstallmentBalance(next))}` : "Prestamo cancelado"}</strong>
        </div>
        <div class="advance-chip">
          <span>Ultimo adelanto</span>
          <strong>${lastAdvanced ? `${money(lastAdvanced.amount)} - ${lastAdvanced.advanceText}` : "Sin adelantos"}</strong>
        </div>
      </div>
    `;
  }

  function renderPaymentsHistory(loanId) {
    const groups = getPaymentGroups(loanId).sort((a, b) => {
      if (a.date === b.date) return b.createdAt.localeCompare(a.createdAt);
      return b.date.localeCompare(a.date);
    });
    if (!groups.length) return "";

    return `
      <div class="section-block">
        <h3 class="panel-title" style="margin-bottom:10px">Historial de pagos</h3>
        <div class="data-table-wrap">
          <table class="data-table" style="min-width:860px">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Metodo</th>
                <th class="is-number">Monto</th>
                <th>Cuotas cubiertas</th>
                <th>Adelanto</th>
                <th>Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${groups.map((group) => `
                <tr>
                  <td>${formatDate(group.date)}</td>
                  <td>${escapeHtml(group.method || "Efectivo")}</td>
                  <td class="is-number">${money(group.amount)}</td>
                  <td>${escapeHtml(group.coverageText)}</td>
                  <td>${group.advancePill}</td>
                  <td>${escapeHtml(group.notes || "")}</td>
                  <td>
                    <button class="mini-btn" type="button" data-action="undo-payment" data-payment-id="${group.firstPaymentId}">
                      <i data-lucide="rotate-ccw"></i>
                      <span>Anular</span>
                    </button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function quickPay(loanId, installmentId) {
    const loan = state.loans.find((item) => item.id === loanId);
    const installment = loan?.installments.find((item) => item.id === installmentId);
    if (!loan || !installment) return;

    applyPayment({
      loanId,
      installmentId,
      amount: getInstallmentBalance(installment),
      date: todayISO(),
      method: "Efectivo",
      notes: "",
    });
    saveState();
    render();
    if (!$("#modalBackdrop").hidden) openLoanDetail(loanId);
    toast("Cuota pagada.");
  }

  function applyPayment({ loanId, installmentId, amount, date, method, notes }) {
    const loan = state.loans.find((item) => item.id === loanId);
    if (!loan) return;

    let remaining = Math.min(amount, getLoanBalance(loan));
    const batchId = makeId("batch");
    const appliedAmount = remaining;
    const startIndex = Math.max(0, loan.installments.findIndex((item) => item.id === installmentId));

    for (let index = startIndex; index < loan.installments.length && remaining > 0; index += 1) {
      const item = loan.installments[index];
      const balance = getInstallmentBalance(item);
      if (balance <= 0) continue;

      const paidAmount = round2(Math.min(balance, remaining));
      item.paidAmount = round2((item.paidAmount || 0) + paidAmount);
      item.paidDate = date;
      item.status = getInstallmentBalance(item) <= 0 ? "paid" : "partial";
      remaining = round2(remaining - paidAmount);

      state.payments.push({
        id: makeId("payment"),
        batchId,
        batchAmount: appliedAmount,
        loanId,
        installmentId: item.id,
        date,
        amount: paidAmount,
        method,
        notes,
        createdAt: new Date().toISOString(),
      });
    }

    refreshLoanStatus(loan);
  }

  function undoPayment(paymentId) {
    const payment = state.payments.find((item) => item.id === paymentId);
    if (!payment) return;
    const batchId = payment.batchId || payment.id;
    const groupPayments = state.payments.filter((item) => item.loanId === payment.loanId && (item.batchId || item.id) === batchId);
    if (!confirm(`Anular este pago de ${money(sum(groupPayments, "amount"))}?`)) return;

    const loan = state.loans.find((item) => item.id === payment.loanId);
    state.payments = state.payments.filter((item) => !(item.loanId === payment.loanId && (item.batchId || item.id) === batchId));
    if (loan) rebuildLoanPaymentState(loan);
    saveState();
    closeModal();
    render();
    toast("Pago anulado.");
  }

  function rebuildLoanPaymentState(loan) {
    loan.installments.forEach((installment) => {
      installment.paidAmount = 0;
      installment.paidDate = "";
      installment.status = "pending";
    });

    state.payments
      .filter((payment) => payment.loanId === loan.id)
      .sort((a, b) => (a.createdAt || a.date).localeCompare(b.createdAt || b.date))
      .forEach((payment) => {
        const installment = loan.installments.find((item) => item.id === payment.installmentId);
        if (!installment) return;
        installment.paidAmount = round2((installment.paidAmount || 0) + payment.amount);
        installment.paidDate = payment.date;
        installment.status = getInstallmentBalance(installment) <= 0 ? "paid" : "partial";
      });

    refreshLoanStatus(loan);
  }

  function deleteLoan(loanId) {
    if (!confirm("Borrar este prestamo y sus pagos?")) return;
    state.loans = state.loans.filter((loan) => loan.id !== loanId);
    state.payments = state.payments.filter((payment) => payment.loanId !== loanId);
    saveState();
    closeModal();
    render();
    toast("Prestamo borrado.");
  }

  function deleteClient(clientId) {
    const hasLoans = state.loans.some((loan) => loan.clientId === clientId);
    if (hasLoans) {
      toast("Ese cliente tiene prestamos. Borra o edita los prestamos primero.");
      return;
    }
    if (!confirm("Borrar este cliente?")) return;
    state.clients = state.clients.filter((client) => client.id !== clientId);
    saveState();
    render();
    toast("Cliente borrado.");
  }

  function deleteCashEntry(entryId) {
    if (!confirm("Borrar este movimiento?")) return;
    state.cashEntries = state.cashEntries.filter((entry) => entry.id !== entryId);
    saveState();
    closeModal();
    render();
    toast("Movimiento borrado.");
  }

  function saveSettingsFromForm() {
    state.settings = {
      ...state.settings,
      businessName: $("#businessName").value.trim() || "Negocios Escobar",
      ownerName: $("#ownerName").value.trim(),
      initialCash: toNumber($("#initialCash").value),
      initialCashDate: $("#initialCashDate").value || todayISO(),
      defaultInterest: toNumber($("#defaultInterest").value),
      defaultInstallments: Math.max(1, parseInt($("#defaultInstallments").value, 10) || 24),
      defaultFrequency: $("#defaultFrequency").value,
      skipSundays: $("#skipSundays").value === "true",
    };
    saveState();
    render();
    toast("Ajustes guardados.");
  }

  function loadDemoData() {
    if (!confirm("Cargar datos de ejemplo? Esto reemplaza los datos actuales.")) return;
    state = createDemoState();
    saveState();
    render();
    toast("Ejemplo cargado.");
  }

  function clearAllData() {
    if (!confirm("Borrar todos los datos guardados?")) return;
    state = structuredCloneSafe(DEFAULT_STATE);
    state.settings.initialCashDate = todayISO();
    saveState();
    render();
    toast("Datos borrados.");
  }

  function exportJSON() {
    downloadFile(`prestamos-fernando-${todayISO()}.json`, JSON.stringify(state, null, 2), "application/json");
    toast("Respaldo descargado.");
  }

  function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        state = normalizeState(imported);
        saveState();
        render();
        toast("Respaldo importado.");
      } catch (error) {
        toast("No se pudo importar el archivo.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function exportCSV() {
    const rows = [
      ["tipo", "fecha", "cliente", "detalle", "ingreso", "egreso", "saldo"],
      ...getCashMovements().reduce((result, movement) => {
        const previous = result.length ? Number(result[result.length - 1][6]) : 0;
        const balance = round2(previous + movement.signedAmount);
        result.push([
          movement.typeLabel,
          movement.date,
          movement.client || "",
          movement.description,
          movement.signedAmount > 0 ? movement.signedAmount : "",
          movement.signedAmount < 0 ? Math.abs(movement.signedAmount) : "",
          balance,
        ]);
        return result;
      }, []),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    downloadFile(`caja-prestamos-${todayISO()}.csv`, csv, "text/csv;charset=utf-8");
    toast("CSV descargado.");
  }

  function openModal(title, eyebrow, html, wide = false) {
    $("#modalTitle").textContent = title;
    $("#modalEyebrow").textContent = eyebrow;
    $("#modalBody").innerHTML = html;
    $(".modal").classList.toggle("is-wide", wide);
    $("#modalBackdrop").hidden = false;
    refreshIcons();
  }

  function closeModal() {
    $("#modalBackdrop").hidden = true;
    $("#modalBody").innerHTML = "";
    $(".modal").classList.remove("is-wide");
  }

  function openNotificationsModal() {
    const rows = getNotificationRows();
    openModal("Notificaciones", "Cobros por vencer", `
      ${rows.length ? `
        <div class="notification-list">
          ${rows.map((row) => `
            <div class="notification-row">
              <div>
                <strong>${escapeHtml(row.client?.name || "Cliente eliminado")}</strong>
                <p>${row.label} - ${formatDate(row.installment.dueDate)} - ${money(getInstallmentBalance(row.installment))}</p>
              </div>
              <div class="table-actions">
                <button class="mini-btn" type="button" data-action="open-payment-modal" data-loan-id="${row.loan.id}" data-installment-id="${row.installment.id}">
                  <i data-lucide="circle-dollar-sign"></i>
                  <span>Cobrar</span>
                </button>
                ${whatsappButton(row.client, row.loan, row.installment)}
              </div>
            </div>
          `).join("")}
        </div>
      ` : emptyInline("No hay cuotas vencidas ni proximas por ahora.")}
    `);
  }

  function getStats() {
    const paymentsToday = getAllPaymentGroups().filter((payment) => payment.date === todayISO());
    const activeLoans = state.loans.filter((loan) => loan.status !== "closed");
    const late = getLateInstallments();
    const movements = getCashMovements();
    const cash = movements.reduce((total, movement) => total + movement.signedAmount, 0);
    const totalIncome = movements.filter((movement) => movement.signedAmount > 0).reduce((total, movement) => total + movement.signedAmount, 0);
    const totalExpense = movements.filter((movement) => movement.signedAmount < 0).reduce((total, movement) => total + Math.abs(movement.signedAmount), 0);

    return {
      cash,
      toCollect: activeLoans.reduce((total, loan) => total + getLoanBalance(loan), 0),
      activeLoans: activeLoans.length,
      collectedToday: sum(paymentsToday, "amount"),
      paymentsToday: paymentsToday.length,
      lateAmount: late.reduce((total, row) => total + getInstallmentBalance(row.installment), 0),
      lateCount: late.length,
      expectedInterest: activeLoans.reduce((total, loan) => total + getLoanInterest(loan), 0),
      totalIncome,
      totalExpense,
      manualExpenses: sum(state.cashEntries.filter((entry) => entry.type === "expense"), "amount"),
      disbursed: sum(state.loans, "amount"),
    };
  }

  function getFilteredLoans() {
    const term = ui.search;
    const loans = [...state.loans].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!term) return loans;
    return loans.filter((loan) => {
      const client = getClient(loan.clientId);
      return [client?.name, client?.phone, client?.town, client?.address, loan.notes]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term));
    });
  }

  function getFilteredClients() {
    const term = ui.search;
    const clients = [...state.clients].sort((a, b) => a.name.localeCompare(b.name));
    if (!term) return clients;
    return clients.filter((client) => [client.name, client.phone, client.town, client.address].filter(Boolean).some((value) => value.toLowerCase().includes(term)));
  }

  function getCollectionRows(date) {
    const rows = [];
    state.loans
      .filter((loan) => loan.status !== "closed")
      .forEach((loan) => {
        const client = getClient(loan.clientId);
        loan.installments.forEach((installment) => {
          if (getInstallmentBalance(installment) <= 0) return;
          const matchesDate = date ? installment.dueDate === date || installment.dueDate < todayISO() : true;
          if (!matchesDate) return;
          rows.push({
            loan,
            client,
            installment,
            late: installment.dueDate < todayISO(),
          });
        });
      });
    return rows.sort((a, b) => a.installment.dueDate.localeCompare(b.installment.dueDate));
  }

  function getDueInstallments({ date, includePaid }) {
    const rows = [];
    state.loans.forEach((loan) => {
      const client = getClient(loan.clientId);
      loan.installments.forEach((installment) => {
        if (!includePaid && getInstallmentBalance(installment) <= 0) return;
        if (installment.dueDate === date) rows.push({ loan, client, installment, late: false });
      });
    });
    return rows;
  }

  function getLateInstallments() {
    const rows = [];
    state.loans
      .filter((loan) => loan.status !== "closed")
      .forEach((loan) => {
        const client = getClient(loan.clientId);
        loan.installments.forEach((installment) => {
          if (installment.dueDate < todayISO() && getInstallmentBalance(installment) > 0) {
            rows.push({ loan, client, installment, late: true });
          }
        });
      });
    return rows.sort((a, b) => a.installment.dueDate.localeCompare(b.installment.dueDate));
  }

  function getNotificationRows() {
    const today = todayISO();
    const limit = toISO(addDays(parseISO(today), 3));
    const rows = [];

    state.loans
      .filter((loan) => loan.status !== "closed")
      .forEach((loan) => {
        const client = getClient(loan.clientId);
        loan.installments.forEach((installment) => {
          if (getInstallmentBalance(installment) <= 0) return;
          if (installment.dueDate > limit) return;

          let label = "Por vencer";
          if (installment.dueDate < today) label = "Vencido";
          if (installment.dueDate === today) label = "Vence hoy";
          rows.push({ loan, client, installment, label });
        });
      });

    return rows.sort((a, b) => a.installment.dueDate.localeCompare(b.installment.dueDate));
  }

  function getCashMovements() {
    const movements = [
      {
        id: "initial",
        date: state.settings.initialCashDate || todayISO(),
        typeLabel: "Caja inicial",
        description: "Capital inicial",
        signedAmount: toNumber(state.settings.initialCash),
        source: "settings",
      },
      ...state.loans.map((loan) => {
        const client = getClient(loan.clientId);
        return {
          id: loan.id,
          date: loan.disbursementDate,
          typeLabel: "Prestamo",
          description: `Prestamo a ${client?.name || "cliente"}`,
          client: client?.name || "",
          signedAmount: -loan.amount,
          source: "loan",
        };
      }),
      ...state.loans.flatMap((loan) => getPaymentGroups(loan.id).map((group) => {
        const client = getClient(loan.clientId);
        return {
          id: group.id,
          date: group.date,
          typeLabel: "Cobro",
          description: `Cobro de ${client?.name || "cliente"} - ${group.coverageText}`,
          client: client?.name || "",
          signedAmount: group.amount,
          source: "payment",
        };
      })),
      ...state.cashEntries.map((entry) => ({
        id: entry.id,
        date: entry.date,
        typeLabel: entry.type === "income" ? "Ingreso" : "Gasto",
        description: `${entry.category}: ${entry.description}`,
        signedAmount: entry.type === "income" ? entry.amount : -entry.amount,
        source: "cashEntry",
        entryType: entry.type,
      })),
    ];

    return movements.sort((a, b) => {
      if (a.date === b.date) return a.typeLabel.localeCompare(b.typeLabel);
      return a.date.localeCompare(b.date);
    });
  }

  function getCollectionTrend(days) {
    const result = [];
    const start = addDays(parseISO(todayISO()), -(days - 1));
    for (let index = 0; index < days; index += 1) {
      const date = toISO(addDays(start, index));
      const amount = state.payments.filter((payment) => payment.date === date).reduce((total, payment) => total + payment.amount, 0);
      result.push({ date, amount, label: shortDate(date) });
    }
    return result;
  }

  function getExpenseCategories(month) {
    const totals = new Map();
    state.cashEntries
      .filter((entry) => entry.type === "expense" && entry.date.startsWith(month))
      .forEach((entry) => totals.set(entry.category, round2((totals.get(entry.category) || 0) + entry.amount)));
    return Array.from(totals, ([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }

  function getLoanStatus(loan) {
    if (getLoanBalance(loan) <= 0 || loan.status === "closed") return "closed";
    if (isLoanLate(loan)) return "late";
    return "active";
  }

  function isLoanLate(loan) {
    return loan.installments.some((installment) => installment.dueDate < todayISO() && getInstallmentBalance(installment) > 0);
  }

  function refreshLoanStatus(loan) {
    loan.status = getLoanBalance(loan) <= 0 ? "closed" : "active";
  }

  function getLoanTotal(loan) {
    return round2(loan.amount + getLoanInterest(loan));
  }

  function getLoanInterest(loan) {
    return round2(loan.amount * (loan.interestRate / 100));
  }

  function getLoanPaid(loanId) {
    return round2(state.payments.filter((payment) => payment.loanId === loanId).reduce((total, payment) => total + payment.amount, 0));
  }

  function getLoanBalance(loan) {
    return round2(Math.max(getLoanTotal(loan) - getLoanPaid(loan.id), 0));
  }

  function getInstallmentBalance(installment) {
    return round2(Math.max(installment.amount - (installment.paidAmount || 0), 0));
  }

  function getNextInstallment(loan) {
    return loan.installments.find((installment) => getInstallmentBalance(installment) > 0) || null;
  }

  function getActiveClientCount() {
    return new Set(state.loans.filter((loan) => loan.status !== "closed" && getLoanBalance(loan) > 0).map((loan) => loan.clientId)).size;
  }

  function getPaymentGroups(loanId) {
    const loan = state.loans.find((item) => item.id === loanId);
    if (!loan) return [];

    const groups = new Map();
    state.payments
      .filter((payment) => payment.loanId === loanId)
      .forEach((payment) => {
        const key = payment.batchId || payment.id;
        if (!groups.has(key)) {
          groups.set(key, {
            id: key,
            firstPaymentId: payment.id,
            date: payment.date,
            method: payment.method || "Efectivo",
            notes: payment.notes || "",
            amount: 0,
            installmentIds: [],
            createdAt: payment.createdAt || payment.date,
          });
        }
        const group = groups.get(key);
        group.amount = round2(group.amount + payment.amount);
        group.installmentIds.push(payment.installmentId);
        if ((payment.createdAt || payment.date) < group.createdAt) group.createdAt = payment.createdAt || payment.date;
      });

    return Array.from(groups.values()).map((group) => {
      const installments = [...new Set(group.installmentIds)]
        .map((id) => loan.installments.find((item) => item.id === id))
        .filter(Boolean)
        .sort((a, b) => a.number - b.number);
      const first = installments[0];
      const last = installments[installments.length - 1];
      const count = installments.length;
      const advanceInstallments = Math.max(0, count - 1);
      const maxAdvanceDays = last ? Math.max(0, daysBetween(group.date, last.dueDate)) : 0;
      const lateDays = first ? Math.max(0, daysBetween(first.dueDate, group.date)) : 0;

      group.coverageText = count > 1 ? `Cuotas ${first.number}-${last.number} (${count})` : first ? `Cuota ${first.number}` : "Cuota";
      group.advanceInstallments = advanceInstallments;
      group.maxAdvanceDays = maxAdvanceDays;
      group.advanceText = getAdvanceText({ advanceInstallments, maxAdvanceDays, lateDays });
      group.advancePill = getAdvancePill({ advanceInstallments, maxAdvanceDays, lateDays });
      return group;
    });
  }

  function getAllPaymentGroups() {
    return state.loans.flatMap((loan) => getPaymentGroups(loan.id));
  }

  function getAdvanceText({ advanceInstallments, maxAdvanceDays, lateDays }) {
    if (advanceInstallments > 0) {
      const dayText = maxAdvanceDays > 0 ? ` - ${maxAdvanceDays} dias` : "";
      return `Adelanto ${advanceInstallments} cuotas${dayText}`;
    }
    if (maxAdvanceDays > 0) return `${maxAdvanceDays} dias antes`;
    if (lateDays > 0) return `${lateDays} dias tarde`;
    return "Normal";
  }

  function getAdvancePill(data) {
    const text = getAdvanceText(data);
    if (data.advanceInstallments > 0 || data.maxAdvanceDays > 0) return `<span class="status-pill is-sky">${text}</span>`;
    if (data.lateDays > 0) return `<span class="status-pill is-late">${text}</span>`;
    return `<span class="status-pill is-active">${text}</span>`;
  }

  function installmentPaidDate(installment) {
    return installment.paidDate ? formatDate(installment.paidDate) : "-";
  }

  function installmentAdvancePill(installment) {
    if (!installment.paidDate || (installment.paidAmount || 0) <= 0) return '<span class="status-pill">Pendiente</span>';
    const earlyDays = daysBetween(installment.paidDate, installment.dueDate);
    if (earlyDays > 0) return `<span class="status-pill is-sky">${earlyDays} dias antes</span>`;
    if (earlyDays < 0) return `<span class="status-pill is-late">${Math.abs(earlyDays)} dias tarde</span>`;
    return '<span class="status-pill is-active">Al dia</span>';
  }

  function getPaymentCoveragePreview(loan, installmentId, amount) {
    if (!loan) return { count: 0, advanceInstallments: 0, lastDueDate: "", amount: 0 };
    let remaining = Math.min(toNumber(amount), getLoanBalance(loan));
    let count = 0;
    let lastDueDate = "";
    const startIndex = Math.max(0, loan.installments.findIndex((item) => item.id === installmentId));

    for (let index = startIndex; index < loan.installments.length && remaining > 0; index += 1) {
      const item = loan.installments[index];
      const balance = getInstallmentBalance(item);
      if (balance <= 0) continue;
      const covered = Math.min(balance, remaining);
      if (covered > 0) {
        count += 1;
        lastDueDate = item.dueDate;
      }
      remaining = round2(remaining - covered);
    }

    return {
      count,
      advanceInstallments: Math.max(0, count - 1),
      lastDueDate,
      amount: round2(Math.min(toNumber(amount), getLoanBalance(loan))),
    };
  }

  function generateSchedule({ total, count, startDate, frequency, skipSundays, loanId }) {
    const centsTotal = Math.round(total * 100);
    const base = Math.floor(centsTotal / count);
    let remainder = centsTotal - base * count;
    let date = parseISO(startDate);
    const rows = [];

    for (let index = 1; index <= count; index += 1) {
      if (frequency === "daily" && skipSundays) {
        while (date.getDay() === 0) date = addDays(date, 1);
      }
      const cents = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      rows.push({
        id: makeId("installment"),
        loanId,
        number: index,
        dueDate: toISO(date),
        amount: cents / 100,
        paidAmount: 0,
        paidDate: "",
        status: "pending",
      });
      date = nextDate(date, frequency);
    }
    return rows;
  }

  function mergeSchedulePayments(schedule, oldLoan) {
    return schedule.map((item, index) => {
      const previous = oldLoan?.installments?.[index];
      const paidAmount = round2(previous?.paidAmount || 0);
      return {
        ...item,
        id: previous?.id || item.id,
        paidAmount,
        status: paidAmount >= item.amount ? "paid" : paidAmount > 0 ? "partial" : "pending",
        paidDate: previous?.paidDate || (paidAmount ? todayISO() : ""),
      };
    });
  }

  function upsertClient(data) {
    const existing = state.clients.find((client) => normalizeText(client.name) === normalizeText(data.name));
    if (existing) {
      existing.phone = data.phone || existing.phone;
      existing.town = data.town || existing.town;
      existing.address = data.address || existing.address;
      return existing;
    }
    const client = { id: makeId("client"), ...data, createdAt: new Date().toISOString() };
    state.clients.push(client);
    return client;
  }

  function getClient(clientId) {
    return state.clients.find((client) => client.id === clientId);
  }

  function createDemoState() {
    const demo = structuredCloneSafe(DEFAULT_STATE);
    demo.settings = {
      ...demo.settings,
      businessName: "Negocios Escobar",
      initialCash: 800,
      initialCashDate: "2026-05-01",
      defaultInterest: 20,
      defaultInstallments: 24,
    };

    const examples = [
      { name: "Cheva", town: "Mocupe", amount: 100, startDate: "2026-05-14", disbursementDate: "2026-05-14", installments: 24, frequency: "daily" },
      { name: "Ricardo Moc.", town: "Mocupe", amount: 200, startDate: "2026-05-04", disbursementDate: "2026-05-04", installments: 24, frequency: "daily" },
      { name: "Marcos", town: "Semanal", amount: 1400, startDate: "2026-05-11", disbursementDate: "2026-05-02", installments: 4, frequency: "weekly" },
      { name: "Jaimito", town: "Semanal", amount: 1000, startDate: "2026-05-13", disbursementDate: "2026-05-04", installments: 4, frequency: "weekly" },
      { name: "Medin Celada", town: "P.3", amount: 300, startDate: "2026-05-12", disbursementDate: "2026-05-11", installments: 24, frequency: "daily" },
    ];

    examples.forEach((item) => {
      const client = { id: makeId("client"), name: item.name, phone: "", town: item.town, address: "", createdAt: new Date().toISOString() };
      const total = item.amount * 1.2;
      const loan = {
        id: makeId("loan"),
        clientId: client.id,
        amount: item.amount,
        interestRate: 20,
        frequency: item.frequency,
        installmentCount: item.installments,
        disbursementDate: item.disbursementDate,
        startDate: item.startDate,
        skipSundays: true,
        notes: "",
        status: "active",
        createdAt: new Date().toISOString(),
        installments: [],
      };
      loan.installments = generateSchedule({
        total,
        count: item.installments,
        startDate: item.startDate,
        frequency: item.frequency,
        skipSundays: true,
        loanId: loan.id,
      });
      demo.clients.push(client);
      demo.loans.push(loan);
    });

    const ricardo = demo.loans.find((loan) => getDemoClient(demo, loan.clientId).name === "Ricardo Moc.");
    if (ricardo) {
      ricardo.installments.slice(0, 6).forEach((installment) => {
        installment.paidAmount = installment.amount;
        installment.paidDate = installment.dueDate;
        installment.status = "paid";
        demo.payments.push({
          id: makeId("payment"),
          loanId: ricardo.id,
          installmentId: installment.id,
          date: installment.dueDate,
          amount: installment.amount,
          method: "Efectivo",
          notes: "",
          createdAt: new Date().toISOString(),
        });
      });
    }

    demo.cashEntries.push(
      { id: makeId("cash"), type: "expense", date: "2026-05-02", amount: 20, category: "Gasolina", description: "Movilidad", createdAt: new Date().toISOString() },
      { id: makeId("cash"), type: "income", date: "2026-05-06", amount: 230, category: "Ingreso extra", description: "Ingreso de Medin Celada", createdAt: new Date().toISOString() }
    );

    return normalizeState(demo);
  }

  function getDemoClient(demo, clientId) {
    return demo.clients.find((client) => client.id === clientId);
  }

  function statusPill(status) {
    const map = {
      active: '<span class="status-pill is-active">Activo</span>',
      late: '<span class="status-pill is-late">Vencido</span>',
      closed: '<span class="status-pill is-closed">Cerrado</span>',
    };
    return map[status] || map.active;
  }

  function whatsappButton(client, loan, installment, label = "WhatsApp") {
    const overdue = getLoanOverdueSummary(loan);
    const phone = formatPhoneForWhatsApp(client?.phone || "");

    if (!overdue.count) {
      return `
        <button class="mini-btn whatsapp-btn is-disabled" type="button" disabled title="Cliente al dia">
          <i data-lucide="message-circle"></i>
          <span>${label}</span>
        </button>
      `;
    }

    if (!phone) {
      return `
        <button class="mini-btn whatsapp-btn is-disabled" type="button" disabled title="Agrega celular al cliente">
          <i data-lucide="message-circle"></i>
          <span>${label}</span>
        </button>
      `;
    }

    const url = whatsappUrl(client, loan, overdue, phone);
    return `
      <a class="mini-btn whatsapp-btn" href="${escapeAttr(url)}" target="_blank" rel="noopener">
        <i data-lucide="message-circle"></i>
        <span>${label}</span>
      </a>
    `;
  }

  function whatsappUrl(client, loan, overdue, phone) {
    const name = client?.name || "cliente";
    const business = state.settings.businessName || "Negocios Escobar";
    const unit = loan?.frequency === "daily" ? "dias/cuotas" : "cuotas";
    const dateText = overdue.count === 1
      ? `del ${formatDate(overdue.oldestDate)}`
      : `desde ${formatDate(overdue.oldestDate)} hasta ${formatDate(overdue.newestDate)}`;
    const message = `Hola ${name}, le escribimos de ${business}. Tiene ${overdue.count} ${unit} atrasadas ${dateText}. Monto vencido pendiente: ${money(overdue.amount)}. Mayor atraso: ${overdue.maxDaysLate} dias. Por favor regularice su pago. Gracias.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  function getLoanOverdueSummary(loan) {
    if (!loan) {
      return { count: 0, amount: 0, oldestDate: "", newestDate: "", maxDaysLate: 0 };
    }

    const today = todayISO();
    const lateInstallments = loan.installments
      .filter((item) => item.dueDate < today && getInstallmentBalance(item) > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (!lateInstallments.length) {
      return { count: 0, amount: 0, oldestDate: "", newestDate: "", maxDaysLate: 0 };
    }

    const oldestDate = lateInstallments[0].dueDate;
    const newestDate = lateInstallments[lateInstallments.length - 1].dueDate;
    return {
      count: lateInstallments.length,
      amount: round2(lateInstallments.reduce((total, item) => total + getInstallmentBalance(item), 0)),
      oldestDate,
      newestDate,
      maxDaysLate: Math.max(1, daysBetween(oldestDate, today)),
    };
  }

  function formatPhoneForWhatsApp(phone) {
    let digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 9) digits = `51${digits}`;
    if (digits.length === 11 && digits.startsWith("51")) return digits;
    if (digits.length > 9) return digits;
    return "";
  }

  function installmentStatusPill(installment) {
    if (getInstallmentBalance(installment) <= 0) return '<span class="status-pill is-closed">Pagado</span>';
    if ((installment.paidAmount || 0) > 0) return '<span class="status-pill is-warning">Parcial</span>';
    if (installment.dueDate < todayISO()) return '<span class="status-pill is-late">Vencido</span>';
    if (installment.dueDate === todayISO()) return '<span class="status-pill is-active">Hoy</span>';
    return '<span class="status-pill">Pendiente</span>';
  }

  function metricCard(label, value, icon, hint, tone) {
    return `
      <article class="metric-card ${tone || ""}">
        <div class="metric-top">
          <span>${label}</span>
          <span class="metric-icon"><i data-lucide="${icon}"></i></span>
        </div>
        <strong>${value}</strong>
        <small>${hint}</small>
      </article>
    `;
  }

  function emptyState(title, text, action, label) {
    return `
      <div class="empty-state">
        <div>
          <h3>${title}</h3>
          <p>${text}</p>
          <button class="primary-btn" type="button" data-action="${action}">
            <i data-lucide="plus"></i>
            <span>${label}</span>
          </button>
        </div>
      </div>
    `;
  }

  function emptyInline(text) {
    return `<div class="empty-state" style="min-height:160px"><div><p>${text}</p></div></div>`;
  }

  function option(value, label, selected) {
    return `<option value="${escapeAttr(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeState(JSON.parse(saved)) : structuredCloneSafe(DEFAULT_STATE);
    } catch (error) {
      return structuredCloneSafe(DEFAULT_STATE);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function normalizeState(input) {
    const normalized = {
      ...structuredCloneSafe(DEFAULT_STATE),
      ...input,
      settings: { ...structuredCloneSafe(DEFAULT_STATE).settings, ...(input?.settings || {}) },
      clients: Array.isArray(input?.clients) ? input.clients : [],
      loans: Array.isArray(input?.loans) ? input.loans : [],
      payments: Array.isArray(input?.payments) ? input.payments : [],
      cashEntries: Array.isArray(input?.cashEntries) ? input.cashEntries : [],
    };

    if (!normalized.settings.businessName || normalized.settings.businessName === "Prestamos Fernando") {
      normalized.settings.businessName = "Negocios Escobar";
    }

    normalized.loans.forEach((loan) => {
      loan.status = loan.status || "active";
      loan.installmentCount = loan.installmentCount || loan.installments?.length || 1;
      loan.installments = Array.isArray(loan.installments) ? loan.installments : [];
      loan.installments.forEach((item, index) => {
        item.id = item.id || makeId("installment");
        item.loanId = loan.id;
        item.number = item.number || index + 1;
        item.paidAmount = toNumber(item.paidAmount);
        item.amount = toNumber(item.amount);
        item.status = getInstallmentBalance(item) <= 0 ? "paid" : item.paidAmount > 0 ? "partial" : "pending";
      });
      const paid = normalized.payments
        .filter((payment) => payment.loanId === loan.id)
        .reduce((total, payment) => total + toNumber(payment.amount), 0);
      const balance = round2(Math.max(loan.amount + round2(loan.amount * (loan.interestRate / 100)) - paid, 0));
      loan.status = balance <= 0 ? "closed" : "active";
    });

    return normalized;
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function toast(message) {
    const wrap = $("#toastWrap");
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    wrap.appendChild(node);
    setTimeout(() => node.remove(), 2800);
  }

  function money(value) {
    return MONEY.format(toNumber(value));
  }

  function moneyShort(value) {
    const amount = toNumber(value);
    if (Math.abs(amount) >= 1000) return `S/ ${NUMBER.format(amount / 1000)}k`;
    return `S/ ${NUMBER.format(amount)}`;
  }

  function statsNumber(value) {
    return new Intl.NumberFormat("es-PE").format(value);
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function round2(value) {
    return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function sum(rows, key) {
    return round2(rows.reduce((total, row) => total + toNumber(row[key]), 0));
  }

  function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayISO() {
    return toISO(new Date());
  }

  function parseISO(value) {
    const [year, month, day] = String(value || todayISO()).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function toISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function daysBetween(fromDate, toDate) {
    const from = parseISO(fromDate);
    const to = parseISO(toDate);
    const diff = to.getTime() - from.getTime();
    return Math.round(diff / 86400000);
  }

  function addMonths(date, months) {
    const result = new Date(date);
    const day = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + months);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
    return result;
  }

  function nextDate(date, frequency) {
    if (frequency === "weekly") return addDays(date, 7);
    if (frequency === "monthly") return addMonths(date, 1);
    return addDays(date, 1);
  }

  function formatDate(value) {
    return parseISO(value).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function shortDate(value) {
    return parseISO(value).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }).replace(".", "");
  }

  function fullDate(value) {
    return parseISO(value).toLocaleDateString("es-PE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  }

  function frequencyLabel(frequency) {
    const map = { daily: "Diario", weekly: "Semanal", monthly: "Mensual" };
    return map[frequency] || "Diario";
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }
})();
