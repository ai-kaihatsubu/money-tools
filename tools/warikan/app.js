/* ============================================
   割り勘計算機 : app.js
   バニラJS / 外部依存なし
   - ダーク/ライト切替（localStorage保存）
   - お布施フラグ判定（分岐の起点）
   - 合計金額・人数 → 1人あたり金額の計算（端数処理・丸め単位・差額配分・幹事調整）
   - 入力値はサーバーに送信・保存しない（表示設定のみ保存）
   ============================================ */

(function () {
  "use strict";

  const STORAGE_KEY_THEME = "tf_theme"; // "light" | "dark"
  const STORAGE_KEY_PRO = "tf_pro";     // "1" でお布施済みフラグ（擬似）

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
     割り勘計算機本体
     ============================================ */

  let dom = {};

  function initTool() {
    dom = {
      totalAmount: document.getElementById("total-amount"),
      peopleCount: document.getElementById("people-count"),
      roundingUnit: document.getElementById("rounding-unit"),
      diffHandling: document.getElementById("diff-handling"),
      organizerAdjustMode: document.getElementById("organizer-adjust-mode"),
      organizerAdjustAmount: document.getElementById("organizer-adjust-amount"),
      resultPerPerson: document.getElementById("result-per-person"),
      resultTableBody: document.getElementById("result-table-body"),
      resultTotalPeople: document.getElementById("result-total-people"),
      resultTotalCollected: document.getElementById("result-total-collected"),
      resultDiffNote: document.getElementById("result-diff-note"),
      copyResultBtn: document.getElementById("copy-result-btn"),
      copyStatus: document.getElementById("copy-status"),
      statusText: document.getElementById("status-text"),
    };

    if (!dom.totalAmount || !dom.peopleCount) return; // tool-root未実装ページでは何もしない

    bindEvents();
    initDevProToggle();
    calculate();
  }

  function bindEvents() {
    const inputs = [
      dom.totalAmount,
      dom.peopleCount,
      dom.roundingUnit,
      dom.diffHandling,
      dom.organizerAdjustMode,
      dom.organizerAdjustAmount,
    ];
    inputs.forEach((el) => {
      if (!el) return;
      el.addEventListener("input", calculate);
      el.addEventListener("change", calculate);
    });

    // 端数処理ラジオボタン
    document.querySelectorAll('input[name="rounding-mode"]').forEach((el) => {
      el.addEventListener("change", calculate);
    });

    if (dom.copyResultBtn) {
      dom.copyResultBtn.addEventListener("click", copyResult);
    }
  }

  function getRoundingMode() {
    const checked = document.querySelector('input[name="rounding-mode"]:checked');
    return checked ? checked.value : "ceil";
  }

  // 指定単位で値を端数処理する
  function roundToUnit(value, unit, mode) {
    if (unit <= 0) unit = 1;
    const divided = value / unit;
    let rounded;
    if (mode === "floor") {
      rounded = Math.floor(divided);
    } else if (mode === "round") {
      rounded = Math.round(divided);
    } else {
      // ceil（デフォルト）
      rounded = Math.ceil(divided);
    }
    return rounded * unit;
  }

  function formatYen(value) {
    return "¥" + Math.round(value).toLocaleString("ja-JP");
  }

  function calculate() {
    const total = Number(dom.totalAmount.value);
    const people = Math.floor(Number(dom.peopleCount.value));
    const unit = Number(dom.roundingUnit.value) || 1;
    const mode = getRoundingMode();
    const diffHandling = dom.diffHandling.value;
    const adjustMode = dom.organizerAdjustMode.value;
    const adjustAmount = Math.max(0, Number(dom.organizerAdjustAmount.value) || 0);

    // 入力検証
    if (!isFinite(total) || total < 0 || !isFinite(people) || people < 1) {
      dom.resultPerPerson.textContent = "-";
      dom.resultTableBody.innerHTML = "";
      dom.resultTotalPeople.textContent = "-";
      dom.resultTotalCollected.textContent = "-";
      dom.resultDiffNote.textContent = "合計金額・人数を正しく入力してください。";
      dom.resultDiffNote.className = "result-note";
      return;
    }

    // 基本の1人あたり金額（丸め適用後）
    const rawPerPerson = total / people;
    const perPerson = roundToUnit(rawPerPerson, unit, mode);

    // 全員が基本額を払った場合の合計と、目標合計（=total）との差額
    const baseTotalCollected = perPerson * people;
    let diff = baseTotalCollected - total; // 正: 多く集まる, 負: 不足

    dom.resultPerPerson.textContent = perPerson.toLocaleString("ja-JP");

    // 各参加者の支払額を計算
    // amounts[i] = その人の支払額
    let amounts = new Array(people).fill(perPerson);

    if (people === 1) {
      // 1人の場合は調整不要、その人がそのまま全額
      amounts = [perPerson];
      diff = perPerson - total;
    } else if (diffHandling === "even") {
      // 差額をできるだけ均等に配分（1円単位）
      // diff > 0 のとき: 一部の人から diff 分を1円ずつ減らす
      // diff < 0 のとき: 一部の人に -diff 分を1円ずつ追加
      const absDiff = Math.round(Math.abs(diff));
      for (let i = 0; i < absDiff; i++) {
        const idx = i % people;
        amounts[idx] += diff > 0 ? -1 : 1;
      }
    } else if (diffHandling === "organizer-less" || diffHandling === "organizer-more") {
      // 幹事（0番目）が差額を吸収
      // organizer-less: 多く集まりすぎた分(diff>0)は幹事が多く払う(支払額を増やす方向)
      //                 → 結果的に他の人が払う分との合計がtotalに近づく
      // ここでは「他の人は丸めた金額のまま、幹事だけ差額を逆方向に調整」とする
      if (diffHandling === "organizer-less") {
        // 幹事が多く負担する: 幹事の支払額 = perPerson + diff（多く集まった分を幹事が追加負担）
        amounts[0] = perPerson + diff;
      } else {
        // 幹事が少なく済む: 幹事の支払額 = perPerson - diff（多く集まった分は幹事の負担を減らす）
        amounts[0] = perPerson - diff;
      }
    }

    // 幹事の金額調整（任意）
    let organizerAdjustNote = "";
    if (adjustMode !== "none" && adjustAmount > 0 && people >= 1) {
      const sign = adjustMode === "less" ? -1 : 1;
      const delta = sign * adjustAmount;
      amounts[0] += delta;

      if (people > 1) {
        // 差額を他の参加者で均等に再配分（1円単位で配分）
        const others = people - 1;
        const baseShare = -delta / others;
        const flooredShare = Math.floor(baseShare);
        let remainder = Math.round(-delta - flooredShare * others);
        for (let i = 1; i < people; i++) {
          amounts[i] += flooredShare;
          if (remainder > 0) {
            amounts[i] += 1;
            remainder -= 1;
          } else if (remainder < 0) {
            amounts[i] -= 1;
            remainder += 1;
          }
        }
      }
      organizerAdjustNote =
        adjustMode === "less"
          ? `幹事を ${formatYen(adjustAmount)} 安くし、差額を他の参加者で均等に配分しました。`
          : `幹事を ${formatYen(adjustAmount)} 高くし、差額を他の参加者で均等に配分しました。`;
    }

    // 結果テーブル描画
    renderResultTable(amounts, people);

    const totalCollected = amounts.reduce((sum, v) => sum + v, 0);
    dom.resultTotalPeople.textContent = people + "人";
    dom.resultTotalCollected.textContent = formatYen(totalCollected);

    // 注記
    const diffFromTotal = totalCollected - total;
    let note = "";
    if (Math.abs(diffFromTotal) < 0.5) {
      note = `合計とぴったり一致しています（¥${total.toLocaleString("ja-JP")}）。`;
      dom.resultDiffNote.className = "result-note result-note--ok";
    } else if (diffFromTotal > 0) {
      note = `合計金額より ${formatYen(diffFromTotal)} 多く集まります（端数処理による差額）。`;
      dom.resultDiffNote.className = "result-note result-note--diff";
    } else {
      note = `合計金額より ${formatYen(-diffFromTotal)} 不足します（端数処理による差額）。`;
      dom.resultDiffNote.className = "result-note result-note--diff";
    }
    if (organizerAdjustNote) {
      note += " " + organizerAdjustNote;
    }
    dom.resultDiffNote.textContent = note;

    // コピー結果をクリア（再計算時）
    dom.copyStatus.textContent = "";
  }

  function renderResultTable(amounts, people) {
    dom.resultTableBody.innerHTML = "";

    if (people === 1) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>1人</td><td class=\"num\">1人</td><td class=\"num\">" +
        formatYen(amounts[0]) +
        "</td><td class=\"num\">" +
        formatYen(amounts[0]) +
        "</td>";
      dom.resultTableBody.appendChild(tr);
      return;
    }

    // 幹事（1人）
    const trOrganizer = document.createElement("tr");
    trOrganizer.innerHTML =
      "<td>幹事</td><td class=\"num\">1人</td><td class=\"num\">" +
      formatYen(amounts[0]) +
      "</td><td class=\"num\">" +
      formatYen(amounts[0]) +
      "</td>";
    dom.resultTableBody.appendChild(trOrganizer);

    // 残りの参加者をグループ化（同額ならまとめて表示）
    const rest = amounts.slice(1);
    const groups = new Map(); // 金額 -> 人数
    rest.forEach((amount) => {
      const key = Math.round(amount);
      groups.set(key, (groups.get(key) || 0) + 1);
    });

    // 表示順を金額の降順に
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => b - a);
    sortedKeys.forEach((amount) => {
      const count = groups.get(amount);
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>参加者</td><td class=\"num\">" +
        count +
        "人</td><td class=\"num\">" +
        formatYen(amount) +
        "</td><td class=\"num\">" +
        formatYen(amount * count) +
        "</td>";
      dom.resultTableBody.appendChild(tr);
    });
  }

  function copyResult() {
    const total = Number(dom.totalAmount.value);
    const people = Math.floor(Number(dom.peopleCount.value));
    if (!isFinite(total) || !isFinite(people) || people < 1) return;

    const perPerson = dom.resultPerPerson.textContent;
    const rows = Array.from(dom.resultTableBody.querySelectorAll("tr")).map((tr) => {
      const cells = Array.from(tr.querySelectorAll("td")).map((td) => td.textContent);
      return cells.join(" ");
    });

    const lines = [
      `割り勘計算結果`,
      `合計金額: ¥${total.toLocaleString("ja-JP")}　人数: ${people}人`,
      `1人あたり（基本額）: ¥${perPerson}`,
      `--- 内訳 ---`,
      ...rows,
      `合計集金額: ${dom.resultTotalCollected.textContent}`,
    ];
    const text = lines.join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          dom.copyStatus.textContent = "結果をコピーしました。";
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
