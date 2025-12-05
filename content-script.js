// 既に定義されていない場合のみ定義する
if (!window.bookmarkOverlayInitialized) {
    window.bookmarkOverlayInitialized = true;

    (function () {
        const OVERLAY_CONTAINER_ID = "quick-access-bookmark-overlay-container";
        let shadowRoot = null;
        let currentBookmarks = []; // 表示中のブックマークリスト
        let currentListType = 'normal'; // 'normal' または 'history'
        let allBookmarks = {
            normal: [],
            history: []
        };

        // Shadow DOM用のスタイル定義
        const overlayStyles = `
            :host {
                all: initial;
            }
            
            * {
                box-sizing: border-box;
            }
            
            .overlay-wrapper {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 30px;
                z-index: 999999;
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                width: 1200px;
                max-width: 95vw;
                max-height: 95vh;
                overflow-y: auto;
            }
            
            .overlay-title {
                margin: 0 0 20px 0;
                text-align: center;
                font-weight: 300;
                letter-spacing: 1px;
                font-size: 24px;
            }
            
            .overlay-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 15px;
            }
            
            .overlay-item {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 15px;
                display: flex;
                align-items: center;
                transition: background 0.2s;
                cursor: pointer;
                width: 100%;
                min-width: 0;
                overflow: hidden;
            }
            
            .overlay-item:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            
            .overlay-item-number {
                background: #4D8CFE;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 14px;
                margin-right: 12px;
                flex-shrink: 0;
            }
            
            .overlay-item-favicon {
                width: 20px;
                height: 20px;
                margin-right: 12px;
                object-fit: contain;
                flex-shrink: 0;
            }
            
            .overlay-item-content {
                display: flex;
                flex-direction: column;
                overflow: hidden;
                min-width: 0;
            }
            
            .overlay-item-title {
                font-weight: 600;
                font-size: 14px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .overlay-item-url {
                font-size: 11px;
                color: #ccc;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .overlay-footer {
                margin-top: 20px;
                text-align: center;
                font-size: 12px;
                color: #888;
            }
            
            .overlay-key {
                border: 1px solid #666;
                padding: 2px 6px;
                border-radius: 4px;
            }
            
            .overlay-empty {
                text-align: center;
                padding: 20px;
            }
        `;

        // Shadow DOMコンテナを作成・取得する関数
        function getOrCreateShadowRoot() {
            let container = document.getElementById(OVERLAY_CONTAINER_ID);
            if (!container) {
                container = document.createElement('div');
                container.id = OVERLAY_CONTAINER_ID;
                // コンテナ自体は最小限のスタイルのみ
                container.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 0;
                    height: 0;
                    z-index: 2147483647;
                    display: none;
                `;
                document.body.appendChild(container);

                // Shadow Rootをアタッチ
                shadowRoot = container.attachShadow({ mode: 'open' });

                // スタイルを追加
                const styleElement = document.createElement('style');
                styleElement.textContent = overlayStyles;
                shadowRoot.appendChild(styleElement);

                // オーバーレイのラッパー要素を作成
                const wrapper = document.createElement('div');
                wrapper.className = 'overlay-wrapper';
                wrapper.id = 'overlay-content';
                shadowRoot.appendChild(wrapper);
            }
            return { container, shadowRoot };
        }

        // オーバーレイを閉じる関数
        function closeOverlay() {
            const container = document.getElementById(OVERLAY_CONTAINER_ID);
            if (container) {
                container.style.display = 'none';
            }
            document.removeEventListener('keydown', handleKeyPress);
            document.removeEventListener('click', handleOutsideClick);
        }

        // 領域外クリックハンドラ
        function handleOutsideClick(event) {
            const container = document.getElementById(OVERLAY_CONTAINER_ID);
            if (!container || container.style.display === 'none') return;

            // Shadow DOM内の要素かどうかをチェック
            const path = event.composedPath();
            const clickedInsideShadow = path.some(el => el === shadowRoot?.host);

            if (!clickedInsideShadow) {
                closeOverlay();
            }
        }

        // アイテムクリックハンドラ
        function handleItemClick(url) {
            window.location.href = url;
            closeOverlay();
        }

        // オーバーレイを更新して表示する関数
        function updateOverlay(bookmarks, isToggle = true) {
            currentBookmarks = bookmarks;
            const { container, shadowRoot: root } = getOrCreateShadowRoot();
            const wrapper = root.getElementById('overlay-content');

            if (currentBookmarks.length === 0) {
                wrapper.innerHTML = '<div class="overlay-empty">ブックマークが見つかりません。</div>';
            } else {
                // タイトルを切り替える
                const titleText = (currentListType === 'normal')
                    ? 'Quick Access (Bookmarks)'
                    : 'Quick Access (Recent History)';

                let listHtml = `<h2 class="overlay-title">${titleText}</h2>`;
                listHtml += '<div class="overlay-grid">';

                currentBookmarks.forEach((item, index) => {
                    const faviconSrc = item.favicon || '';
                    listHtml += `
                        <div class="overlay-item" data-index="${index}">
                            <div class="overlay-item-number">${index + 1}</div>
                            <img src="${faviconSrc}" class="overlay-item-favicon" />
                            <div class="overlay-item-content">
                                <span class="overlay-item-title">${item.title}</span>
                                <span class="overlay-item-url">${item.url}</span>
                            </div>
                        </div>
                    `;
                });

                listHtml += '</div>';
                listHtml += '<p class="overlay-footer">Press <span class="overlay-key">1-9</span> to open, <span class="overlay-key">Tab</span> to switch, <span class="overlay-key">Esc</span> to close</p>';
                wrapper.innerHTML = listHtml;

                // アイテムにクリックイベントを追加
                const items = wrapper.querySelectorAll('.overlay-item');
                items.forEach((item) => {
                    const index = parseInt(item.getAttribute('data-index'), 10);
                    item.addEventListener('click', () => {
                        if (currentBookmarks[index]) {
                            handleItemClick(currentBookmarks[index].url);
                        }
                    });
                });
            }

            // 表示状態の切り替え
            if (isToggle) {
                if (container.style.display === 'none') {
                    container.style.display = 'block';
                    document.addEventListener('keydown', handleKeyPress);
                    setTimeout(() => {
                        document.addEventListener('click', handleOutsideClick);
                    }, 0);
                } else {
                    closeOverlay();
                }
            } else {
                container.style.display = 'block';
                document.removeEventListener('keydown', handleKeyPress);
                document.addEventListener('keydown', handleKeyPress);
                document.removeEventListener('click', handleOutsideClick);
                setTimeout(() => {
                    document.addEventListener('click', handleOutsideClick);
                }, 0);
            }
        }

        // キー入力ハンドラ
        function handleKeyPress(event) {
            const container = document.getElementById(OVERLAY_CONTAINER_ID);
            if (!container || container.style.display === 'none') return;

            const key = event.key;

            // Tabキーの処理
            if (key === 'Tab') {
                event.preventDefault();
                currentListType = (currentListType === 'normal') ? 'history' : 'normal';
                updateOverlay(allBookmarks[currentListType], false);
                return;
            }

            // Escキーでオーバーレイを閉じる
            if (key === 'Escape') {
                closeOverlay();
                return;
            }

            // 数字キー (1-9) のチェック
            const num = parseInt(key, 10);
            if (num >= 1 && num <= 9) {
                if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
                    event.preventDefault();

                    const index = num - 1;
                    const bookmark = currentBookmarks[index];

                    if (bookmark && bookmark.url) {
                        window.location.href = bookmark.url;
                    }

                    closeOverlay();
                }
            }
        }

        // バックグラウンドからのメッセージを受信
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === "toggleOverlay") {
                allBookmarks.normal = message.bookmarks;
                allBookmarks.history = message.history;

                currentListType = 'normal';
                updateOverlay(allBookmarks.normal, true);

                sendResponse({ success: true });
            }
            return true;
        });
    })();
}
