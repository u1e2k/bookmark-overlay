// ファビコンをDataURLに変換する関数
async function getFaviconDataUrl(pageUrl) {
    try {
        const faviconUrl = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`);
        const response = await fetch(faviconUrl);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error('Favicon fetch failed:', e);
        return null;
    }
}

// ブックマークを取得する関数（オンデマンド実行用）
async function getQuickAccessBookmarks() {
    return new Promise((resolve) => {
        // 1. 通常のブックマーク（例: ブックマークバーのトップ9）を取得
        chrome.bookmarks.getChildren('1', async (children) => {
            const bookmarks = children.slice(0, 9).filter(item => item.url);

            // 各ブックマークのファビコンを取得
            for (let i = 0; i < bookmarks.length; i++) {
                bookmarks[i].favicon = await getFaviconDataUrl(bookmarks[i].url);
            }
            resolve(bookmarks);
        });
    });
}

// コマンド（ショートカットキー）が押されたときに実行
chrome.commands.onCommand.addListener(async (command) => {
    if (command === "toggle-bookmark-overlay") {
        try {
            // ブックマークと履歴を並行して取得
            const [bookmarks, history] = await Promise.all([
                getQuickAccessBookmarks(),
                new Promise((resolve) => {
                    chrome.history.search({
                        text: '',          // 全ての履歴を対象
                        maxResults: 9      // 最新の9件に限定
                    }, async (historyItems) => {
                        // 履歴のファビコンも取得
                        for (let i = 0; i < historyItems.length; i++) {
                            historyItems[i].favicon = await getFaviconDataUrl(historyItems[i].url);
                        }
                        resolve(historyItems);
                    });
                })
            ]);

            // アクティブなタブにデータを送信
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length === 0) return;

            const tabId = tabs[0].id;

            // 内部ページなど、スクリプト注入できないページを除外するための詳細チェック
            const url = tabs[0].url || '';
            const restrictedUrls = ['chrome://', 'edge://', 'about:', 'chrome-extension://', 'edge-extension://'];
            const isRestricted = restrictedUrls.some(prefix => url.startsWith(prefix));

            if (isRestricted) {
                console.warn('Cannot inject script into restricted pages:', url);
                // ユーザーに通知（オプション）
                try {
                    await chrome.action.setBadgeText({ text: '!', tabId: tabId });
                    await chrome.action.setBadgeBackgroundColor({ color: '#FF0000', tabId: tabId });
                    setTimeout(() => {
                        chrome.action.setBadgeText({ text: '', tabId: tabId });
                    }, 2000);
                } catch (e) {
                    // badge設定に失敗しても続行
                }
                return;
            }

            const sendMessage = () => {
                return new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(tabId, {
                        action: "toggleOverlay",
                        bookmarks: bookmarks,
                        history: history
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(response);
                        }
                    });
                });
            };

            try {
                // まずメッセージ送信を試みる
                await sendMessage();
                console.log('Overlay toggled successfully');
            } catch (error) {
                console.log('Content script not ready, injecting script...', error.message);
                // 失敗したらスクリプトを注入して再試行
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content-script.js']
                    });
                    // 注入後に少し待ってから再送信
                    setTimeout(async () => {
                        try {
                            await sendMessage();
                            console.log('Overlay toggled successfully after injection');
                        } catch (retryError) {
                            console.error('Retry failed:', retryError.message);
                        }
                    }, 100);
                } catch (injectError) {
                    console.error('Failed to inject script:', injectError.message);
                }
            }

        } catch (err) {
            console.error('Error in onCommand handler:', err);
        }
    }
});
