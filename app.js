/* ==========================================================================
   Moniepoint Personal Record — App logic
   All data is stored locally on this device (localStorage), so it works
   fully offline and keeps every closed day as a permanent record.
   ========================================================================== */

(function () {
  "use strict";

  var STORAGE_CURRENT = "mpr_currentDay_v1";
  var STORAGE_HISTORY = "mpr_history_v1";

  var TYPES = [
    { id: "withdrawal", label: "Withdrawal" },
    { id: "transfer", label: "Transfer" },
    { id: "deposit", label: "Deposit" },
    { id: "others", label: "Others" }
  ];

  var state = {
    currentDay: null,
    history: [],
    editingTxId: null,
    viewingHistoryDayId: null,
    selectedType: "withdrawal"
  };

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_CURRENT);
      state.currentDay = raw ? JSON.parse(raw) : null;
    } catch (e) { state.currentDay = null; }

    try {
      var rawH = localStorage.getItem(STORAGE_HISTORY);
      state.history = rawH ? JSON.parse(rawH) : [];
    } catch (e) { state.history = []; }
  }

  function saveCurrentDay() {
    try {
      if (state.currentDay) {
        localStorage.setItem(STORAGE_CURRENT, JSON.stringify(state.currentDay));
      } else {
        localStorage.removeItem(STORAGE_CURRENT);
      }
    } catch (e) {
      alert("Could not save. Your device storage may be full.");
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(state.history));
    } catch (e) {
      alert("Could not save your history. Your device storage may be full.");
    }
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  function uid(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  }

  function fmtMoney(n) {
    n = Math.round(parseFloat(n) || 0);
    var neg = n < 0;
    n = Math.abs(n);
    var s = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-\u20A6" : "\u20A6") + s;
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function fmtDateShort(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function typeLabel(id) {
    var t = TYPES.filter(function (x) { return x.id === id; })[0];
    return t ? t.label : id;
  }

  function pad4(n) {
    return String(n).padStart(4, "0");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.remove("active");
    });
    document.getElementById(id).classList.add("active");
    window.scrollTo(0, 0);
  }

  function route() {
    if (state.currentDay) {
      renderDashboard();
      showScreen("screen-main");
    } else {
      renderStartScreen();
      showScreen("screen-start");
    }
  }

  // ---------------------------------------------------------------------
  // Start Day screen
  // ---------------------------------------------------------------------

  function renderStartScreen() {
    document.getElementById("startLiveDate").textContent = fmtDate(new Date().toISOString());
    updateStartTotalPreview();
  }

  function updateStartTotalPreview() {
    var cash = parseFloat(document.getElementById("openCash").value) || 0;
    var pos = parseFloat(document.getElementById("openPos").value) || 0;
    document.getElementById("openTotalPreview").textContent = fmtMoney(cash + pos);
  }

  document.getElementById("openCash").addEventListener("input", updateStartTotalPreview);
  document.getElementById("openPos").addEventListener("input", updateStartTotalPreview);

  document.getElementById("startDayForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var cash = parseFloat(document.getElementById("openCash").value);
    var pos = parseFloat(document.getElementById("openPos").value);
    if (isNaN(cash) || cash < 0 || isNaN(pos) || pos < 0) {
      alert("Please enter valid opening amounts.");
      return;
    }
    state.currentDay = {
      id: uid("day"),
      dateOpened: new Date().toISOString(),
      openingCash: cash,
      openingPos: pos,
      transactions: []
    };
    saveCurrentDay();
    route();
  });

  // ---------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------

  function renderDashboard() {
    var day = state.currentDay;
    if (!day) return;

    document.getElementById("dashOpenedAt").innerHTML =
      "Day started <strong>" + fmtTime(day.dateOpened) + "</strong> \u00B7 " + fmtDateShort(day.dateOpened);

    var openingTotal = day.openingCash + day.openingPos;
    document.getElementById("dashOpeningTotal").textContent = fmtMoney(openingTotal);
    document.getElementById("dashOpeningCash").textContent = fmtMoney(day.openingCash);
    document.getElementById("dashOpeningPos").textContent = fmtMoney(day.openingPos);

    var totalCharges = day.transactions.reduce(function (s, tx) { return s + (parseFloat(tx.charge) || 0); }, 0);
    document.getElementById("statTxCount").textContent = day.transactions.length;
    document.getElementById("statCharges").textContent = fmtMoney(totalCharges);

    var listEl = document.getElementById("txList");
    listEl.innerHTML = "";

    if (day.transactions.length === 0) {
      listEl.innerHTML =
        '<div class="empty-state"><div class="big">No transactions yet today</div>' +
        '<div class="small">Tap "Add transaction" whenever you serve a customer.</div></div>';
      return;
    }

    var sorted = day.transactions.slice().reverse();
    sorted.forEach(function (tx) {
      var row = document.createElement("div");
      row.className = "tx-row";
      row.innerHTML =
        '<div class="type-dot ' + tx.type + '"></div>' +
        '<div class="receipt-badge">#' + pad4(tx.receiptNo) + "</div>" +
        '<div class="details">' +
        '<div class="type-line">' + escapeHtml(typeLabel(tx.type)) + "</div>" +
        '<div class="sub-line">' + fmtTime(tx.time) + (tx.note ? " \u00B7 " + escapeHtml(tx.note) : "") + "</div>" +
        "</div>" +
        '<div class="amounts">' +
        '<div class="amt">' + fmtMoney(tx.amount) + "</div>" +
        (parseFloat(tx.charge) > 0 ? '<div class="charge">+' + fmtMoney(tx.charge) + " charge</div>" : "") +
        "</div>";
      row.addEventListener("click", function () { openTxSheet(tx.id); });
      listEl.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------
  // Add / Edit transaction sheet
  // ---------------------------------------------------------------------

  var txOverlay = document.getElementById("txOverlay");
  var txForm = document.getElementById("txForm");

  function buildTypeToggle() {
    var wrap = document.getElementById("typeToggle");
    wrap.innerHTML = "";
    TYPES.forEach(function (t) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = t.label;
      btn.dataset.type = t.id;
      btn.addEventListener("click", function () {
        state.selectedType = t.id;
        refreshTypeToggle();
      });
      wrap.appendChild(btn);
    });
    refreshTypeToggle();
  }

  function refreshTypeToggle() {
    document.querySelectorAll("#typeToggle button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.type === state.selectedType);
    });
  }

  function openTxSheet(txId) {
    var day = state.currentDay;
    state.editingTxId = txId || null;
    var tx = txId ? day.transactions.filter(function (t) { return t.id === txId; })[0] : null;

    document.getElementById("txSheetTitle").textContent = tx ? "Edit transaction" : "Add transaction";
    state.selectedType = tx ? tx.type : "withdrawal";
    refreshTypeToggle();

    document.getElementById("txAmount").value = tx ? tx.amount : "";
    document.getElementById("txCharge").value = tx ? tx.charge : "";
    document.getElementById("txNote").value = tx ? (tx.note || "") : "";

    var nextReceiptNo = tx ? tx.receiptNo : day.transactions.length + 1;
    document.getElementById("txReceiptPreview").innerHTML =
      "Receipt <strong>#" + pad4(nextReceiptNo) + "</strong>";
    document.getElementById("txTimePreview").textContent = tx ? fmtTime(tx.time) : "will be set to the current time";

    document.getElementById("txDeleteBtn").style.display = tx ? "block" : "none";

    txOverlay.classList.add("open");
  }

  function closeTxSheet() {
    txOverlay.classList.remove("open");
    state.editingTxId = null;
  }

  document.getElementById("addTxBtn").addEventListener("click", function () { openTxSheet(null); });
  document.getElementById("txCancelBtn").addEventListener("click", closeTxSheet);
  txOverlay.addEventListener("click", function (e) { if (e.target === txOverlay) closeTxSheet(); });

  txForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var amount = parseFloat(document.getElementById("txAmount").value);
    var charge = parseFloat(document.getElementById("txCharge").value) || 0;
    if (isNaN(amount) || amount < 0) { alert("Please enter a valid amount."); return; }
    if (charge < 0) { alert("Charge can't be negative."); return; }

    var day = state.currentDay;
    var note = document.getElementById("txNote").value.trim();

    if (state.editingTxId) {
      var idx = day.transactions.findIndex(function (t) { return t.id === state.editingTxId; });
      if (idx > -1) {
        day.transactions[idx].type = state.selectedType;
        day.transactions[idx].amount = amount;
        day.transactions[idx].charge = charge;
        day.transactions[idx].note = note;
      }
    } else {
      day.transactions.push({
        id: uid("tx"),
        receiptNo: day.transactions.length + 1,
        type: state.selectedType,
        amount: amount,
        charge: charge,
        note: note,
        time: new Date().toISOString()
      });
    }

    saveCurrentDay();
    closeTxSheet();
    renderDashboard();
  });

  document.getElementById("txDeleteBtn").addEventListener("click", function () {
    if (!state.editingTxId) return;
    if (!confirm("Delete this transaction? This can't be undone.")) return;
    var day = state.currentDay;
    day.transactions = day.transactions.filter(function (t) { return t.id !== state.editingTxId; });
    // Renumber receipts sequentially so numbering has no gaps.
    day.transactions.forEach(function (t, i) { t.receiptNo = i + 1; });
    saveCurrentDay();
    closeTxSheet();
    renderDashboard();
  });

  // ---------------------------------------------------------------------
  // End Day sheet
  // ---------------------------------------------------------------------

  var endDayOverlay = document.getElementById("endDayOverlay");

  function updateEndDayPreview() {
    var cash = parseFloat(document.getElementById("closeCash").value) || 0;
    var pos = parseFloat(document.getElementById("closePos").value) || 0;
    document.getElementById("closeTotalPreview").textContent = fmtMoney(cash + pos);
  }
  document.getElementById("closeCash").addEventListener("input", updateEndDayPreview);
  document.getElementById("closePos").addEventListener("input", updateEndDayPreview);

  document.getElementById("endDayBtn").addEventListener("click", function () {
    document.getElementById("closeCash").value = "";
    document.getElementById("closePos").value = "";
    document.getElementById("closeTotalPreview").textContent = fmtMoney(0);
    endDayOverlay.classList.add("open");
  });
  document.getElementById("endDayCancelBtn").addEventListener("click", function () {
    endDayOverlay.classList.remove("open");
  });
  endDayOverlay.addEventListener("click", function (e) { if (e.target === endDayOverlay) endDayOverlay.classList.remove("open"); });

  document.getElementById("endDayForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var cash = parseFloat(document.getElementById("closeCash").value);
    var pos = parseFloat(document.getElementById("closePos").value);
    if (isNaN(cash) || cash < 0 || isNaN(pos) || pos < 0) {
      alert("Please enter valid closing amounts.");
      return;
    }
    if (!confirm("Close today's day? Once closed, today's record becomes permanent and can't be edited.")) return;

    var day = state.currentDay;
    var openingTotal = day.openingCash + day.openingPos;
    var closingTotal = cash + pos;

    var closedDay = {
      id: day.id,
      dateOpened: day.dateOpened,
      dateClosed: new Date().toISOString(),
      openingCash: day.openingCash,
      openingPos: day.openingPos,
      openingTotal: openingTotal,
      closingCash: cash,
      closingPos: pos,
      closingTotal: closingTotal,
      profit: closingTotal - openingTotal,
      transactions: day.transactions
    };

    state.history.unshift(closedDay);
    saveHistory();

    state.currentDay = null;
    saveCurrentDay();

    endDayOverlay.classList.remove("open");
    renderClosedScreen(closedDay);
    showScreen("screen-closed");
  });

  // ---------------------------------------------------------------------
  // Day-closed summary
  // ---------------------------------------------------------------------

  function renderClosedScreen(day) {
    document.getElementById("closedDate").textContent = fmtDate(day.dateClosed);
    document.getElementById("closedProfit").textContent = fmtMoney(day.profit);
    document.getElementById("closedOpeningTotal").textContent = fmtMoney(day.openingTotal);
    document.getElementById("closedClosingTotal").textContent = fmtMoney(day.closingTotal);

    var totalCharges = day.transactions.reduce(function (s, tx) { return s + (parseFloat(tx.charge) || 0); }, 0);
    document.getElementById("closedTxCount").textContent = day.transactions.length;
    document.getElementById("closedCharges").textContent = fmtMoney(totalCharges);

    document.getElementById("closedViewDetailBtn").onclick = function () {
      openDayDetail(day.id);
    };
  }

  document.getElementById("startNewDayBtn").addEventListener("click", route);

  // ---------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------

  function renderHistory() {
    var listEl = document.getElementById("historyList");
    listEl.innerHTML = "";

    if (state.history.length === 0) {
      listEl.innerHTML =
        '<div class="empty-state"><div class="big">No closed days yet</div>' +
        '<div class="small">Once you end a day, it will be saved here permanently.</div></div>';
      return;
    }

    state.history.forEach(function (day) {
      var row = document.createElement("div");
      row.className = "history-row";
      row.innerHTML =
        '<div>' +
        '<div class="date">' + fmtDateShort(day.dateOpened) + "</div>" +
        '<div class="meta">' + day.transactions.length + " transactions</div>" +
        "</div>" +
        '<div class="profit-tag"><span class="l">Profit</span>' + fmtMoney(day.profit) + "</div>";
      row.addEventListener("click", function () { openDayDetail(day.id); });
      listEl.appendChild(row);
    });
  }

  document.getElementById("historyBtn").addEventListener("click", function () {
    renderHistory();
    showScreen("screen-history");
  });
  document.getElementById("historyBackBtn").addEventListener("click", route);

  // ---------------------------------------------------------------------
  // Day detail (evidence view)
  // ---------------------------------------------------------------------

  function openDayDetail(dayId) {
    var day = state.history.filter(function (d) { return d.id === dayId; })[0];
    if (!day) return;
    state.viewingHistoryDayId = dayId;

    document.getElementById("detailDate").textContent = fmtDate(day.dateOpened);

    var content = document.getElementById("detailContent");
    var totalCharges = day.transactions.reduce(function (s, tx) { return s + (parseFloat(tx.charge) || 0); }, 0);

    var html = "";

    html += '<div class="detail-section"><div class="heading">Opening</div><div class="detail-grid">' +
      '<div class="item"><div class="l">Cash</div><div class="v">' + fmtMoney(day.openingCash) + '</div></div>' +
      '<div class="item"><div class="l">POS balance</div><div class="v">' + fmtMoney(day.openingPos) + '</div></div>' +
      '<div class="item"><div class="l">Total</div><div class="v">' + fmtMoney(day.openingTotal) + '</div></div>' +
      '<div class="item"><div class="l">Recorded at</div><div class="v">' + fmtTime(day.dateOpened) + '</div></div>' +
      '</div></div>';

    html += '<div class="detail-section"><div class="heading">Closing</div><div class="detail-grid">' +
      '<div class="item"><div class="l">Cash</div><div class="v">' + fmtMoney(day.closingCash) + '</div></div>' +
      '<div class="item"><div class="l">POS balance</div><div class="v">' + fmtMoney(day.closingPos) + '</div></div>' +
      '<div class="item"><div class="l">Total</div><div class="v">' + fmtMoney(day.closingTotal) + '</div></div>' +
      '<div class="item"><div class="l">Recorded at</div><div class="v">' + fmtTime(day.dateClosed) + '</div></div>' +
      '</div></div>';

    html += '<div class="detail-section"><div class="heading">Result</div><div class="detail-grid">' +
      '<div class="item"><div class="l">Profit</div><div class="v">' + fmtMoney(day.profit) + '</div></div>' +
      '<div class="item"><div class="l">Total charges earned</div><div class="v">' + fmtMoney(totalCharges) + '</div></div>' +
      '<div class="item"><div class="l">Transactions</div><div class="v">' + day.transactions.length + '</div></div>' +
      '</div></div>';

    html += '<div class="detail-section"><div class="heading">Transactions (' + day.transactions.length + ')</div>';
    if (day.transactions.length === 0) {
      html += '<div class="helper-text">No transactions were recorded on this day.</div>';
    } else {
      day.transactions.forEach(function (tx) {
        html += '<div class="detail-tx-row">' +
          '<div class="receipt-badge">#' + pad4(tx.receiptNo) + '</div>' +
          '<div class="details">' +
          '<div class="type-line">' + escapeHtml(typeLabel(tx.type)) + '</div>' +
          '<div class="sub-line">' + fmtTime(tx.time) + (tx.note ? ' \u00B7 ' + escapeHtml(tx.note) : '') + '</div>' +
          '</div>' +
          '<div class="amounts">' +
          '<div class="amt">' + fmtMoney(tx.amount) + '</div>' +
          (parseFloat(tx.charge) > 0 ? '<div class="charge">+' + fmtMoney(tx.charge) + '</div>' : '') +
          '</div>' +
          '</div>';
      });
    }
    html += '</div>';

    content.innerHTML = html;
    showScreen("screen-detail");
  }

  document.getElementById("detailBackBtn").addEventListener("click", function () {
    renderHistory();
    showScreen("screen-history");
  });

  // ---------------------------------------------------------------------
  // Service worker registration
  // ---------------------------------------------------------------------

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        // Offline-first still works via localStorage even if this fails.
      });
    });
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------

  buildTypeToggle();
  loadState();
  route();
})();
