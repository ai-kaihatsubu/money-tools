/* ============================================
   為替・通貨換算ツール : app.js
   バニラJS / 外部依存なし
   - ダーク/ライト切替（localStorage保存）
   - お布施フラグ判定（分岐の起点）
   - frankfurter.app（ECB）から為替レートを取得し、金額換算・レート表を表示
   - オフライン/取得失敗時はlocalStorageの最終取得レートにフォールバック
   ============================================ */

(function () {
  "use strict";

  const STORAGE_KEY_THEME = "tf_theme"; // "light" | "dark"
  const STORAGE_KEY_PRO = "tf_pro";     // "1" でお布施済みフラグ（擬似）
  const STORAGE_KEY_RATES = "tf_currency_rates_cache"; // 最終取得レートのキャッシュ
  const STORAGE_KEY_PAIR = "tf_currency_pair"; // 直前に選んだ通貨ペア

  // frankfurter.app（ECB）が対応する主要通貨（よく使う順に表示）
  const CURRENCIES = [
    "JPY", "USD", "EUR", "GBP", "AUD", "CNY", "KRW", "CHF", "CAD", "HKD", "SGD",
    "NZD", "THB", "INR", "MXN", "ZAR", "SEK", "NOK", "DKK", "TRY", "BRL", "PLN",
  ];

  // frankfurter.app は api.frankfurter.dev へ移行済み（同一プロジェクト・同一データ・CORS対応）。
  // 旧ドメインは301リダイレクトとなり、ブラウザのfetchでCORSエラーになるため新ドメインを使用する。
  const API_BASE = "https://api.frankfurter.dev/v1/latest";

  /* ---------- テーマ切替 ---------- */
  function initTheme() {
    const toggle = document.getElementById("theme-toggle");
    const root = document.documentElement;

    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved || (prefersDark ? "dark" : "light");
    applyTheme(initial);

    if (toggle) {
      toggle.addEventListener("click", () => {
        const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem(STORAGE_KEY_THEME, next);
      });
    }

    function applyTheme(theme) {
      if (theme === "dark") {
        root.setAttribute("data-theme", "dark");
        if (toggle) {
          toggle.setAttribute("aria-pressed", "true");
          toggle.innerHTML = '<span aria-hidden="true">☀️</span>';
        }
      } else {
        root.removeAttribute("data-theme");
        if (toggle) {
          toggle.setAttribute("aria-pressed", "false");
          toggle.innerHTML = '<span aria-hidden="true">🌙</span>';
        }
      }
    }
  }

  /* ---------- お布施フラグ判定 ---------- */
  function isPro() {
    return localStorage.getItem(STORAGE_KEY_PRO) === "1";
  }

  function applyProState() {
    if (isPro()) {
      document.body.classList.add("is-pro");
      document.querySelectorAll(".ad-slot").forEach((el) => {
        el.style.display = "none";
      });
    }
  }

  /* ---------- 開発用Pro切替ボタン ---------- */
  function initDevProToggle() {
    const btn = document.getElementById("dev-pro-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const next = isPro() ? "0" : "1";
      localStorage.setItem(STORAGE_KEY_PRO, next);
      location.reload();
    });
  }

  window.ToolFactory = { isPro: isPro };

  /* ============================================
     通貨換算ツール本体
     ============================================ */

  let dom = {};
  let currentRates = null; // { base, date, rates: {CUR: rate, ...} }
  let isOffline = false;

  function initTool() {
    dom = {
      amountInput: document.getElementById("amount-input"),
      fromSelect: document.getElementById("from-currency"),
      toSelect: document.getElementById("to-currency"),
      swapButton: document.getElementById("swap-button"),
      refreshButton: document.getElementById("refresh-rate"),
      rateStatus: document.getElementById("rate-status"),
      resultLabel: document.getElementById("result-label"),
      resultValue: document.getElementById("result-value"),
      resultUnit: document.getElementById("result-unit"),
      resultExplain: document.getElementById("result-explain"),
      rateTableHeading: document.getElementById("rate-table-heading"),
      rateTableFrom: document.getElementById("rate-table-from"),
      rateTableToLabel: document.getElementById("rate-table-to-label"),
      rateTableBody: document.getElementById("rate-table-body"),
      copyRateTableBtn: document.getElementById("copy-rate-table"),
      copyStatus: document.getElementById("copy-status"),
    };

    if (!dom.fromSelect || !dom.toSelect) return; // tool-root未実装ページでは何もしない

    populateCurrencySelects();
    bindEvents();
    initDevProToggle();
    fetchRates();
  }

  /* ---------- 通貨セレクト初期化 ---------- */
  function populateCurrencySelects() {
    const saved = loadPair();
    const defaultFrom = saved.from || "USD";
    const defaultTo = saved.to || "JPY";

    CURRENCIES.forEach((cur) => {
      const optFrom = document.createElement("option");
      optFrom.value = cur;
      optFrom.textContent = cur;
      dom.fromSelect.appendChild(optFrom);

      const optTo = document.createElement("option");
      optTo.value = cur;
      optTo.textContent = cur;
      dom.toSelect.appendChild(optTo);
    });

    dom.fromSelect.value = CURRENCIES.includes(defaultFrom) ? defaultFrom : "USD";
    dom.toSelect.value = CURRENCIES.includes(defaultTo) ? defaultTo : "JPY";
  }

  function savePair() {
    try {
      localStorage.setItem(
        STORAGE_KEY_PAIR,
        JSON.stringify({ from: dom.fromSelect.value, to: dom.toSelect.value })
      );
    } catch (e) {}
  }

  function loadPair() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PAIR);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }

  /* ---------- イベント ---------- */
  function bindEvents() {
    dom.amountInput.addEventListener("input", render);
    dom.fromSelect.addEventListener("change", () => {
      savePair();
      fetchRates();
    });
    dom.toSelect.addEventListener("change", () => {
      savePair();
      render();
    });
    dom.swapButton.addEventListener("click", () => {
      const from = dom.fromSelect.value;
      const to = dom.toSelect.value;
      dom.fromSelect.value = to;
      dom.toSelect.value = from;
      savePair();
      fetchRates();
    });
    dom.refreshButton.addEventListener("click", fetchRates);

    document.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => copyResult(btn.dataset.target));
    });
    dom.copyRateTableBtn.addEventListener("click", copyRateTable);
  }

  /* ---------- レート取得 ---------- */
  function fetchRates() {
    const from = dom.fromSelect.value;
    dom.rateStatus.textContent = "レートを取得中です…";
    dom.rateStatus.classList.remove("status-text--error");

    // frankfurter.appは from=EUR の場合 base指定なしでも動作するが、
    // 通貨間の換算を一括取得するため from を base として全通貨レートを取得する。
    const url = `${API_BASE}?from=${encodeURIComponent(from)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("APIエラー: " + res.status);
        return res.json();
      })
      .then((data) => {
        if (!data || !data.rates) throw new Error("レートデータが不正です");
        // 自分自身（from=from）のレート1.0を補完（APIのレスポンスには含まれないため）
        const rates = Object.assign({}, data.rates);
        rates[data.base] = 1;

        currentRates = { base: data.base, date: data.date, rates: rates };
        isOffline = false;
        saveRatesCache(currentRates);
        dom.rateStatus.textContent = `${formatDate(currentRates.date)}時点のレート（frankfurter.app / ECB）`;
        render();
      })
      .catch(() => {
        // 取得失敗: キャッシュへフォールバック
        const cached = loadRatesCache();
        if (cached && cached.base === from && cached.rates) {
          currentRates = cached;
          isOffline = true;
          dom.rateStatus.textContent =
            `レートを取得できません（オフラインの可能性）。${formatDate(cached.date)}時点のレートを使用しています。`;
          dom.rateStatus.classList.add("status-text--error");
          render();
        } else {
          currentRates = null;
          isOffline = true;
          dom.rateStatus.textContent = "レートを取得できません（オフラインの可能性）。";
          dom.rateStatus.classList.add("status-text--error");
          render();
        }
      });
  }

  function saveRatesCache(data) {
    try {
      localStorage.setItem(STORAGE_KEY_RATES, JSON.stringify(data));
    } catch (e) {}
  }

  function loadRatesCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_RATES);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  /* ---------- 表示更新 ---------- */
  function render() {
    const amount = Number(dom.amountInput.value);
    const from = dom.fromSelect.value;
    const to = dom.toSelect.value;

    dom.resultLabel.textContent = `${isFinite(amount) ? formatNumber(amount) : "-"} ${from} は`;
    dom.resultUnit.textContent = ` ${to}`;

    if (!currentRates || !currentRates.rates) {
      dom.resultValue.textContent = "-";
      dom.resultExplain.textContent = "レートを取得できないため換算できません。";
      renderRateTable(from, null);
      return;
    }

    if (currentRates.base !== from) {
      // セレクト変更直後などでbaseとfromが一致しない場合は再取得を促す
      dom.resultValue.textContent = "-";
      dom.resultExplain.textContent = "レートを更新しています…";
      renderRateTable(from, null);
      return;
    }

    const rate = currentRates.rates[to];
    if (!isFinite(amount) || rate === undefined) {
      dom.resultValue.textContent = "-";
      dom.resultExplain.textContent = "金額または通貨の選択を確認してください。";
      renderRateTable(from, currentRates.rates);
      return;
    }

    const converted = amount * rate;
    dom.resultValue.textContent = formatNumber(converted);

    const offlineNote = isOffline
      ? `（${formatDate(currentRates.date)}時点のレートを使用 / オフラインキャッシュ）`
      : `（${formatDate(currentRates.date)}時点のレート）`;
    dom.resultExplain.textContent =
      `1 ${from} = ${formatRate(rate)} ${to} で換算しました ${offlineNote}。`;

    renderRateTable(from, currentRates.rates);
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "-";
    return value.toLocaleString("ja-JP", { maximumFractionDigits: 4 });
  }

  function formatRate(value) {
    if (!isFinite(value)) return "-";
    return value.toLocaleString("ja-JP", { maximumFractionDigits: 6 });
  }

  /* ---------- レート表 ---------- */
  function renderRateTable(from, rates) {
    dom.rateTableFrom.textContent = from;
    dom.rateTableToLabel.textContent = "各通貨";
    dom.rateTableBody.innerHTML = "";

    if (!rates) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 2;
      cell.textContent = "レートを取得できません。";
      row.appendChild(cell);
      dom.rateTableBody.appendChild(row);
      return;
    }

    CURRENCIES.forEach((cur) => {
      if (cur === from) return; // 自分自身は表に含めない
      const rate = rates[cur];
      if (rate === undefined) return;

      const row = document.createElement("tr");

      const curCell = document.createElement("td");
      curCell.textContent = cur;
      row.appendChild(curCell);

      const rateCell = document.createElement("td");
      rateCell.textContent = formatRate(rate);
      row.appendChild(rateCell);

      dom.rateTableBody.appendChild(row);
    });
  }

  /* ---------- コピー ---------- */
  function copyResult(targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const from = dom.fromSelect.value;
    const to = dom.toSelect.value;
    const amount = dom.amountInput.value;
    const text = `${amount} ${from} = ${target.textContent} ${to}`;

    writeClipboard(text);
  }

  function copyRateTable() {
    if (!currentRates || !currentRates.rates) {
      dom.copyStatus.textContent = "コピーできるレートがありません。";
      return;
    }
    const from = currentRates.base;
    const lines = [`1 ${from} =`];
    CURRENCIES.forEach((cur) => {
      if (cur === from) return;
      const rate = currentRates.rates[cur];
      if (rate === undefined) return;
      lines.push(`  ${formatRate(rate)} ${cur}`);
    });
    lines.push(`(${formatDate(currentRates.date)}時点 / frankfurter.app・ECB)`);
    writeClipboard(lines.join("\n"));
  }

  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          dom.copyStatus.textContent = "コピーしました。";
        })
        .catch(() => {
          dom.copyStatus.textContent = "コピーに失敗しました。";
        });
    } else {
      dom.copyStatus.textContent = "コピー機能はこのブラウザでは利用できません。";
    }
  }

  /* ---------- 起動 ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    applyProState();
    initTool();
  });
})();
