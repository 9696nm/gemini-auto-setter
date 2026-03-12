/**
 * Gemini Auto Setter - Content Script
 * 一時チャットと指定モードを自動適用する
 */

(function () {
  'use strict';

  const PREFIX = '[Gemini Auto Setter]';

  // 一時チャットのラベル（多言語対応）
  const TEMPORARY_CHAT_LABELS = [
    '一時チャット',
    '一時的なチャット',
    'Temporary chat',
    'Temporary Chat',
    'Ask in a temporary chat',
    '一時チャットで質問',
    'Temporary Chats',
  ];

  // モード選択用のマッピング（data-test-id を最優先）
  const MODE_SELECTORS = {
    thinking: {
      dataTestIds: ['bard-mode-option-思考モード', 'bard-mode-option-thinking', 'bard-mode-option-Thinking'],
      labels: ['思考モード', 'Thinking mode', '思考'],
      excludeLabels: ['高速モード', 'Flash', 'Pro'],
    },
    standard: {
      dataTestIds: ['bard-mode-option-高速モード', 'bard-mode-option-flash', 'bard-mode-option-Flash'],
      labels: ['高速モード', 'Flash', 'Standard', '素早く回答'],
      excludeLabels: ['思考', 'Pro'],
    },
    experimental: {
      dataTestIds: ['bard-mode-option-pro', 'bard-mode-option-Pro'],
      labels: ['Pro', '3.1 Pro', '2.5 Pro', '実験的'],
      excludeLabels: ['高速', 'Flash', '思考'],
    },
  };

  function getAllElements(root) {
    root = root || document.documentElement || document.body;
    if (!root) return [];
    const elements = [root];
    if (root.shadowRoot) {
      elements.push(...getAllElements(root.shadowRoot));
    }
    for (const child of root.children || []) {
      elements.push(...getAllElements(child));
    }
    return elements;
  }

  /** Angular Material 対応: 確実にクリックを発火させる */
  function safeClick(el) {
    if (!el) return false;
    const opts = { bubbles: true, cancelable: true, view: window };
    try {
      el.focus?.();
      el.click();
      return true;
    } catch (e) {
      try {
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        return true;
      } catch (e2) {
        console.warn(PREFIX, 'クリック失敗:', e2);
        return false;
      }
    }
  }

  /** mat-menu-trigger 用: スクロール＋座標付き PointerEvent で確実に開く */
  function openMenuTriggerClick(el) {
    if (!el) return false;
    try {
      el.scrollIntoView?.({ block: 'center', behavior: 'auto' });
    } catch (_) {}
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
    try {
      el.focus?.();
      el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse' }));
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    } catch (e) {
      return safeClick(el);
    }
  }

  function matchesUrlPattern(url, patterns) {
    if (!patterns || patterns.length === 0) return true;
    const path = new URL(url).pathname + new URL(url).search;
    return patterns.some((p) => {
      const trimmed = (p || '').trim();
      if (!trimmed) return false;
      try {
        const regex = new RegExp(trimmed);
        return regex.test(path) || path.includes(trimmed);
      } catch {
        return path.includes(trimmed);
      }
    });
  }

  /** メインメニュー（サイドナビ）を開く - data-test-id="side-nav-menu-button" */
  function openMainMenu() {
    const allElements = getAllElements();
    const mainMenuSelectors = [
      (el) => el.getAttribute?.('data-test-id') === 'side-nav-menu-button',
      (el) => (el.getAttribute?.('aria-label') || '').trim() === 'メインメニュー',
      (el) => (el.className || '').includes('main-menu-button'),
    ];
    for (const el of allElements) {
      const btn = el.tagName === 'BUTTON' || el.getAttribute?.('role') === 'button' ? el : el.closest?.('button, [role="button"]');
      const target = btn || el;
      if (mainMenuSelectors.some((fn) => fn(target))) {
        if (safeClick(target)) return true;
      }
    }
    return false;
  }

  function findAndClickTemporaryChat() {
    const allElements = getAllElements();
    for (const el of allElements) {
      const text = (el.textContent || '').trim();
      const ariaLabel = (el.getAttribute('aria-label') || '').trim();
      const title = (el.getAttribute('title') || '').trim();
      const combined = [text, ariaLabel, title].join(' ');

      if (TEMPORARY_CHAT_LABELS.some((label) => combined.includes(label))) {
        const clickable = el.closest('button, [role="button"], a, [role="tab"], [role="option"]') || el;
        if (safeClick(clickable)) return true;
      }
    }
    return false;
  }

  function findAndClickMode(modeKey) {
    const config = MODE_SELECTORS[modeKey];
    if (!config) return false;

    const allElements = getAllElements();
    const excludeLabels = config.excludeLabels || [];

    for (const el of allElements) {
      const testId = (el.getAttribute('data-test-id') || '').trim();
      const text = (el.textContent || '').trim();
      const ariaLabel = (el.getAttribute('aria-label') || '').trim();
      const combined = [text, ariaLabel, testId].join(' ');

      // 1. data-test-id で厳密マッチ（最優先）
      if (config.dataTestIds?.some((id) => testId === id)) {
        const clickable = el.closest('button, [role="menuitemradio"], [role="menuitem"], .mat-mdc-menu-item') || el;
        if (safeClick(clickable)) return true;
      }

      // 2. ラベルでマッチ（除外ラベルに該当しないこと）
      const labelMatch = (config.labels || []).some((l) => combined.includes(l));
      const excluded = excludeLabels.some((ex) => combined.includes(ex));
      if (labelMatch && !excluded) {
        const clickable = el.closest('button, [role="menuitemradio"], [role="menuitem"], .mat-mdc-menu-item') || el;
        if (clickable && clickable.getAttribute?.('aria-checked') !== 'true' && safeClick(clickable)) return true;
      }
    }
    return false;
  }

  function isFileUploadButton(el) {
    const btn = el.closest ? el.closest('button, [role="button"]') || el : el;
    const ariaLabel = (btn.getAttribute?.('aria-label') || '').toLowerCase();
    const parent = btn.closest?.('[class*="file-uploader"], [class*="upload"]');
    return ariaLabel.includes('アップロード') || ariaLabel.includes('upload') || !!parent;
  }

  /** bard-logo（チャットを新規作成リンク）を除外 - モード選択と誤認しないため */
  function isBardLogoOrNewChatLink(el) {
    const clickable = el.closest?.('a, button, [role="button"]') || el;
    const ariaLabel = (clickable.getAttribute?.('aria-label') || '').trim();
    const cls = (clickable.className || '') + (el.closest?.('[class*="bard-logo"]')?.className || '');
    const classStr = typeof cls === 'string' ? cls : (cls.baseVal || '');
    const hasBardLogoId =
      clickable.getAttribute?.('data-test-id') === 'bard-logo-only' ||
      !!clickable.querySelector?.('[data-test-id="bard-logo-only"]') ||
      !!el.closest?.('[data-test-id="bard-logo-only"]');
    return (
      ariaLabel.includes('チャットを新規作成') ||
      ariaLabel.includes('Create new chat') ||
      ariaLabel.includes('New chat') ||
      classStr.includes('bard-logo-container') ||
      hasBardLogoId
    );
  }

  function openModelSelector() {
    const allElements = getAllElements();

    // 1. 最優先: data-test-id="bard-mode-menu-button"（mat-menu-trigger 用の特別処理）
    for (const el of allElements) {
      if (el.getAttribute?.('data-test-id') === 'bard-mode-menu-button') {
        const btn = el.tagName === 'BUTTON' || el.getAttribute?.('role') === 'button' ? el : el.closest?.('button, [role="button"]');
        const target = btn || el;
        if (target && !isFileUploadButton(target) && !isBardLogoOrNewChatLink(target) && openMenuTriggerClick(target)) return true;
      }
    }

    // 2. aria-label / bard-mode-switcher（ファイルアップロードを除外）
    const modeSelectorLabels = ['モード選択ツールを開く', 'Open mode selector', 'Choose your model', 'モデルを選択'];
    for (const el of allElements) {
      const ariaLabel = (el.getAttribute('aria-label') || '').trim();
      const testId = el.getAttribute('data-test-id') || '';
      const tagName = (el.tagName || '').toLowerCase();
      const parentTag = el.closest?.('bard-mode-switcher') || el.closest?.('[class*="bard-mode-switcher"]');
      const isModeButton = (tagName === 'button' || el.getAttribute('role') === 'button') &&
        (testId === 'bard-mode-menu-button' ||
          modeSelectorLabels.some((l) => ariaLabel.includes(l)) ||
          !!parentTag);

      if (isModeButton && !isFileUploadButton(el) && !isBardLogoOrNewChatLink(el) && openMenuTriggerClick(el)) return true;
    }

    // 3. bard-mode-switcher 内のボタン（フォールバック）
    for (const el of allElements) {
      const switcher = el.closest?.('bard-mode-switcher');
      if (switcher && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') && !isBardLogoOrNewChatLink(el) && openMenuTriggerClick(el)) return true;
    }

    // 4. aria-label に model/モデル/Choose を含むボタン（ファイルアップロード除外）
    for (const el of allElements) {
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const text = (el.textContent || '').toLowerCase().trim().slice(0, 50);
      const isButton = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'combobox';
      const hasModel = ariaLabel.includes('model') || ariaLabel.includes('モデル') || ariaLabel.includes('choose') || text.includes('choose your model');
      if (isButton && hasModel && !isFileUploadButton(el) && !isBardLogoOrNewChatLink(el) && safeClick(el)) return true;
    }

    // 4. mat-mdc-button-touch-target（ファイルアップロード・input-area-switch を区別）
    function isNearInputArea(el) {
      const input = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
      if (!input) return true;
      const inputRect = input.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      return Math.abs(elRect.bottom - inputRect.bottom) < 200 || Math.abs(elRect.top - inputRect.top) < 200;
    }

    const menuTriggers = [];
    for (const el of allElements) {
      const cls = el.className || '';
      const classStr = typeof cls === 'string' ? cls : (cls.baseVal || '');
      if (classStr.includes('mat-mdc-button-touch-target')) {
        const clickable = el.closest('button, [role="button"]') || el;
        if (clickable && !isFileUploadButton(clickable) && !isBardLogoOrNewChatLink(clickable) && (classStr.includes('input-area-switch') || clickable.closest?.('.input-area-switch') || clickable.closest?.('bard-mode-switcher'))) {
          menuTriggers.push({ el: clickable, nearInput: isNearInputArea(clickable) });
        }
      }
    }
    const target = menuTriggers.find((t) => t.nearInput)?.el || menuTriggers[0]?.el;
    if (target && openMenuTriggerClick(target)) return true;

    // 5. bard-mode 系トリガー（bard-mode-list-button は除外）
    for (const el of allElements) {
      const cls = (el.className || '');
      const classStr = typeof cls === 'string' ? cls : (cls.baseVal || '');
      if (classStr.includes('bard-mode') && !classStr.includes('bard-mode-list-button') && !classStr.includes('bard-logo') && !isFileUploadButton(el)) {
        const clickable = el.closest('button, [role="button"]') || el;
        if (clickable?.closest?.('bard-mode-switcher') && !isBardLogoOrNewChatLink(clickable) && openMenuTriggerClick(clickable)) return true;
      }
    }
    return false;
  }

  function focusAndSelectTextInput() {
    const allElements = getAllElements();
    const inputSelectors = [
      (el) => el.tagName === 'TEXTAREA' && el.closest?.('[class*="input"], [class*="prompt"], [class*="composer"]'),
      (el) => el.getAttribute?.('contenteditable') === 'true' && el.getAttribute?.('role') === 'textbox',
      (el) => el.getAttribute?.('role') === 'textbox' && el.closest?.('[class*="input"], [class*="prompt"], [class*="composer"]'),
      (el) => el.tagName === 'TEXTAREA',
      (el) => el.getAttribute?.('contenteditable') === 'true',
      (el) => el.getAttribute?.('role') === 'textbox',
    ];
    for (const el of allElements) {
      const isInput = inputSelectors.some((fn) => fn(el));
      if (isInput && el.offsetParent !== null) {
        try {
          el.focus();
          if (el.tagName === 'TEXTAREA' || el.getAttribute?.('role') === 'textbox') {
            el.select?.();
            if (el.setSelectionRange) {
              el.setSelectionRange(0, (el.value || el.textContent || '').length);
            }
          } else if (el.getAttribute?.('contenteditable') === 'true') {
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
          log('テキスト入力にフォーカスしました');
          return true;
        } catch (e) {
          console.warn(PREFIX, 'テキスト入力のフォーカスに失敗:', e);
        }
      }
    }
    return false;
  }

  function log(...args) {
    if (window.__GEMINI_AUTO_SETTER_DEBUG__) {
      console.log(PREFIX, ...args);
    }
  }

  function runDomDiagnostic() {
    const allElements = getAllElements();
    console.log(PREFIX, 'スキャン要素数:', allElements.length);

    const tempCandidates = [];
    const modeCandidates = [];
    const modelButtonCandidates = [];
    const allButtons = [];
    const anyRelevant = [];

    const tempKeywords = ['一時', 'チャット', 'temporary', 'chat', 'Ask', 'New chat', '新規'];
    const modeKeywords = ['思考', 'Thinking', 'Flash', 'Pro', 'bard-mode', 'enable-aurora', 'model', 'モデル', 'Choose'];
    const modelKeywords = ['model', 'モデル', 'mat-mdc', 'bard-mode', 'choose', 'select'];

    for (const el of allElements) {
      const text = (el.textContent || '').trim().slice(0, 120);
      const ariaLabel = (el.getAttribute('aria-label') || '').trim();
      const cls = (el.className || '');
      const classStr = typeof cls === 'string' ? cls : (cls.baseVal || '');
      const tag = el.tagName?.toLowerCase() || '';
      const role = el.getAttribute('role') || '';

      if (tempKeywords.some((k) => text.toLowerCase().includes(k.toLowerCase()) || ariaLabel.toLowerCase().includes(k.toLowerCase()))) {
        tempCandidates.push({ tag, role, classStr: classStr.slice(0, 60), text: text.slice(0, 50), ariaLabel: ariaLabel.slice(0, 50) });
      }
      if (modeKeywords.some((k) => classStr.includes(k) || text.toLowerCase().includes(k.toLowerCase()) || ariaLabel.toLowerCase().includes(k.toLowerCase()))) {
        modeCandidates.push({ tag, role, classStr: classStr.slice(0, 80), text: text.slice(0, 50), ariaLabel: ariaLabel.slice(0, 50) });
      }
      if ((tag === 'button' || role === 'button' || role === 'combobox' || role === 'menuitem') && (modelKeywords.some((k) => classStr.includes(k) || ariaLabel.toLowerCase().includes(k)) || text.length > 0)) {
        modelButtonCandidates.push({ tag, role, classStr: classStr.slice(0, 60), text: text.slice(0, 40), ariaLabel: ariaLabel.slice(0, 50) });
      }
      if ((tag === 'button' || role === 'button') && text.length > 0 && allButtons.length < 30) {
        allButtons.push({ tag, role, text: text.slice(0, 50), ariaLabel: ariaLabel.slice(0, 50) });
      }
      if ((text.includes('Gemini') || text.includes('Flash') || text.includes('Pro') || ariaLabel.includes('model')) && anyRelevant.length < 20) {
        anyRelevant.push({ tag, role, text: text.slice(0, 60), ariaLabel: ariaLabel.slice(0, 50) });
      }
    }

    console.log(PREFIX, '--- DOM診断（一時チャット候補）---');
    console.table(tempCandidates.slice(0, 15));
    console.log(PREFIX, '--- DOM診断（モード候補）---');
    console.table(modeCandidates.slice(0, 15));
    console.log(PREFIX, '--- DOM診断（モデルボタン候補）---');
    console.table(modelButtonCandidates.slice(0, 15));
    console.log(PREFIX, '--- DOM診断（全ボタンサンプル）---');
    console.table(allButtons.slice(0, 20));
    console.log(PREFIX, '--- DOM診断（Gemini/Flash/Pro関連）---');
    console.table(anyRelevant);
  }

  async function runAutoSetter() {
    const { enabled, triggerUrls, applyTemporaryChat, mode, debugMode, delayMs } = await chrome.storage.sync.get({
      enabled: true,
      triggerUrls: ['/u/1/app?pli=1'],
      applyTemporaryChat: true,
      mode: 'thinking',
      debugMode: false,
      delayMs: 1000,
    });

    window.__GEMINI_AUTO_SETTER_DEBUG__ = debugMode;

    const doRun = async () => {
    if (debugMode) {
      const path = new URL(window.location.href).pathname + new URL(window.location.href).search;
      console.log(PREFIX, '=== デバッグ開始 ===');
      console.log(PREFIX, 'URL:', window.location.href);
      console.log(PREFIX, 'パス:', path);
      console.log(PREFIX, 'トリガーURL:', triggerUrls);
      console.log(PREFIX, 'URLマッチ:', matchesUrlPattern(window.location.href, triggerUrls));
      console.log(PREFIX, '設定:', { enabled, applyTemporaryChat, mode });
    }

    if (!enabled) {
      log('拡張機能が無効です');
      return;
    }
    if (!matchesUrlPattern(window.location.href, triggerUrls)) {
      log('URLがトリガーにマッチしません');
      return;
    }

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    let tempOk = false;
    let selectorOk = false;

    if (applyTemporaryChat) {
      // まず直接クリックを試す（メニューが既に開いている場合はこれで成功）
      tempOk = findAndClickTemporaryChat();
      if (!tempOk) {
        // 見つからなければメニューを開いてから再試行（閉じている場合のみクリック）
        const mainMenuOk = openMainMenu();
        log('メインメニューを開く:', mainMenuOk ? '成功' : 'スキップ（要素なし）');
        if (mainMenuOk) await delay(400);
        tempOk = findAndClickTemporaryChat();
      }
      log('一時チャット:', tempOk ? '成功' : '失敗（要素が見つかりません）');
      if (tempOk) await delay(400);
    }

    // モード選択（メニューを開き data-test-id で正確にクリック）
    if (mode && mode !== 'none') {
      selectorOk = openModelSelector();
      log('モデルセレクターを開く:', selectorOk ? '成功' : '失敗（要素が見つかりません）');
      if (selectorOk) {
        await delay(100);
        let modeOk = false;
        const timings = [50, 500, 1000, 1500, 2000];
        for (const t of timings) {
          await delay(t);
          if (findAndClickMode(mode)) {
            modeOk = true;
            log('モード選択:', '成功');
            break;
          }
        }
        if (!modeOk) log('モード選択: 失敗（要素が見つかりません）');
      }
    }

    if (debugMode && ((applyTemporaryChat && !tempOk) || (mode && mode !== 'none' && !selectorOk))) {
      runDomDiagnostic();
    }

    // 選択後にテキスト入力をフォーカス＆選択状態にする
    await delay(300);
    focusAndSelectTextInput();

    if (debugMode) console.log(PREFIX, '=== デバッグ終了 ===');
    };

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    if (delayMs > 0) {
      if (debugMode) console.log(PREFIX, delayMs + 'ms 待機してから実行...');
      await delay(delayMs);
    }
    await doRun();
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => runAutoSetter());
    } else {
      runAutoSetter();
    }

    // SPAのナビゲーション対応（URL変更を監視）
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        runAutoSetter();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
