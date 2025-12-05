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

let cachedBookmarks = []; // 通常のブックマーク
let cachedHistory = [];   // 最新のアクセス履歴

function initializeData() {
    // 1. 通常のブックマーク（例: ブックマークバーのトップ9）を初期化
    chrome.bookmarks.getChildren('1', async (children) => {
        const bookmarks = children.slice(0, 9).filter(item => item.url);

        // 各ブックマークのファビコンを取得
        for (let i = 0; i < bookmarks.length; i++) {
            bookmarks[i].favicon = await getFaviconDataUrl(bookmarks[i].url);
        }
        cachedBookmarks = bookmarks;
    });

    // 履歴はショートカットキーが押された時に毎回最新のものを取得するため、
    // ここでの初期キャッシュは省略するか、直近のものを取得するのみとします。
}

// 拡張機能インストール/アップデート時などにデータを初期化
chrome.runtime.onInstalled.addListener(initializeData);
chrome.bookmarks.onChanged.addListener(initializeData);
chrome.bookmarks.onCreated.addListener(initializeData);
chrome.bookmarks.onRemoved.addListener(initializeData);

// コマンド（ショートカットキー）が押されたときに実行
chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-bookmark-overlay") {
        // 💡 ここで最新のアクセス履歴 トップ9を取得する
        chrome.history.search({
            text: '',          // 全ての履歴を対象
            maxResults: 9      // 最新の9件に限定
        }, async (historyItems) => {
            // 履歴のファビコンも取得（必要であれば）
            for (let i = 0; i < historyItems.length; i++) {
                historyItems[i].favicon = await getFaviconDataUrl(historyItems[i].url);
            }
            cachedHistory = historyItems;

            // アクティブなタブにデータを送信
            chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
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
                            bookmarks: cachedBookmarks,
                            history: cachedHistory
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
                    const response = await sendMessage();
                    console.log('Overlay toggled successfully:', response);
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
                                const retryResponse = await sendMessage();
                                console.log('Overlay toggled successfully after injection:', retryResponse);
                            } catch (retryError) {
                                console.error('Retry failed:', retryError.message);
                            }
                        }, 100);
                    } catch (injectError) {
                        console.error('Failed to inject script:', injectError.message);
                        // より詳細なエラー情報をログに出力
                        if (injectError.message) {
                            console.error('Error details:', injectError.message);
                        }
                    }
                }
            });
        });
    }
});
