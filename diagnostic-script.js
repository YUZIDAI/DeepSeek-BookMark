// ============================================
// DeepSeek BookMark 扩展 - 浏览器控制台诊断脚本
// 在 DeepSeek 网页按 F12 打开控制台，粘贴执行
// ============================================

console.log('=== DeepSeek BookMark 扩展诊断 ===\n');

// ========== 1. 检查扩展是否已安装并注入 ==========
console.log('【1】检查扩展注入状态');
console.log('------------------------');

// 检查收藏按钮是否已注入
const bookmarkBtn = document.getElementById('ds-bookmark-btn');
if (bookmarkBtn) {
    console.log('✅ 扩展收藏按钮已注入:', bookmarkBtn);
    console.log('   按钮文本:', bookmarkBtn.textContent);
    console.log('   按钮位置:', bookmarkBtn.style.cssText);
} else {
    console.log('❌ 扩展收藏按钮未找到');
    console.log('   可能原因:');
    console.log('   - 扩展未安装');
    console.log('   - 扩展未启用');
    console.log('   - 当前不是 DeepSeek 聊天页面');
    console.log('   - 页面加载后扩展注入失败');
}

// 检查 content script 是否运行
const hasContentScript = !!window.chrome?.runtime;
console.log('\nChrome Runtime API 可用:', hasContentScript ? '✅ 是' : '❌ 否');

// ========== 2. 检查页面环境 ==========
console.log('\n\n【2】检查页面环境');
console.log('------------------------');

console.log('当前 URL:', window.location.href);
console.log('页面标题:', document.title);
console.log('是否 DeepSeek 聊天页:', window.location.href.includes('chat.deepseek.com') ? '✅ 是' : '❌ 否');

// 检查对话内容元素
const userMessages = document.querySelectorAll('[data-testid="user-message"]');
const assistantMessages = document.querySelectorAll('[data-testid="assistant-message"]');
console.log('\n用户消息数量:', userMessages.length);
console.log('助手消息数量:', assistantMessages.length);

if (userMessages.length === 0 && assistantMessages.length === 0) {
    console.log('⚠️ 未找到标准消息元素，尝试备用选择器...');
    const altMessages = document.querySelectorAll('.message, .chat-message, [class*="message"]');
    console.log('备用选择器找到消息元素:', altMessages.length);
}

// ========== 3. 检查存储状态 ==========
console.log('\n\n【3】检查存储状态');
console.log('------------------------');

// 检查 LocalStorage
const localStorageKeys = Object.keys(localStorage);
console.log('LocalStorage 键数量:', localStorageKeys.length);
if (localStorageKeys.length > 0) {
    console.log('LocalStorage 键列表:', localStorageKeys);
}

// 检查 SessionStorage
const sessionStorageKeys = Object.keys(sessionStorage);
console.log('\nSessionStorage 键数量:', sessionStorageKeys.length);
if (sessionStorageKeys.length > 0) {
    console.log('SessionStorage 键列表:', sessionStorageKeys);
}

// 检查 IndexedDB
console.log('\n检查 IndexedDB...');
if ('databases' in indexedDB) {
    indexedDB.databases().then(dbs => {
        console.log('IndexedDB 数据库数量:', dbs.length);
        if (dbs.length > 0) {
            console.log('数据库列表:', dbs.map(db => ({ name: db.name, version: db.version })));
        }
    }).catch(err => {
        console.log('无法读取 IndexedDB:', err.message);
    });
} else {
    console.log('浏览器不支持 indexedDB.databases() API');
}

// 尝试读取扩展的存储数据（通过 Chrome Storage API）
console.log('\n尝试读取扩展存储...');
if (chrome?.storage?.local) {
    chrome.storage.local.get(['folders', 'bookmarks'], (result) => {
        if (chrome.runtime.lastError) {
            console.log('无法读取扩展存储:', chrome.runtime.lastError.message);
        } else {
            console.log('✅ 扩展存储可访问');
            console.log('收藏夹数量:', result.folders?.length || 0);
            console.log('书签数量:', result.bookmarks?.length || 0);
            if (result.bookmarks?.length > 0) {
                console.log('最近书签标题:', result.bookmarks[0]?.title);
            }
        }
    });
} else {
    console.log('❌ Chrome Storage API 不可用');
}

// ========== 4. 测试收藏功能 ==========
console.log('\n\n【4】测试收藏功能');
console.log('------------------------');

// 模拟提取标题
function testExtractTitle() {
    const title = document.title.replace(/^DeepSeek\s*[-–—]\s*/i, '').trim();
    if (title && title !== 'DeepSeek') {
        console.log('提取的标题:', title);
        return title;
    }
    
    const firstUserMsg = document.querySelector('[data-testid="user-message"]');
    if (firstUserMsg) {
        const text = firstUserMsg.textContent.trim().substring(0, 50);
        console.log('从首条消息提取标题:', text);
        return text;
    }
    
    console.log('无法提取标题');
    return '新对话';
}

// 模拟提取内容
function testExtractContent() {
    const messages = document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]');
    if (messages.length > 0) {
        const content = Array.from(messages).map(m => m.textContent.trim()).join('\n\n');
        console.log('提取的内容长度:', content.length, '字符');
        console.log('内容预览（前200字符）:', content.substring(0, 200) + '...');
        return content;
    }
    console.log('无法提取内容');
    return '';
}

console.log('\n测试提取功能:');
testExtractTitle();
testExtractContent();

// ========== 5. 手动触发收藏测试 ==========
console.log('\n\n【5】手动触发收藏测试');
console.log('------------------------');
console.log('执行 testBookmark() 可以手动测试收藏功能');

window.testBookmark = function() {
    const data = {
        title: testExtractTitle(),
        url: window.location.href,
        content: testExtractContent(),
        timestamp: new Date().toISOString()
    };
    
    console.log('\n准备发送收藏数据:', data);
    
    if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'addBookmark', data }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('❌ 发送失败:', chrome.runtime.lastError.message);
                console.log('可能原因: popup 未打开或扩展上下文失效');
            } else {
                console.log('✅ 发送成功:', response);
            }
        });
    } else {
        console.log('❌ Chrome Runtime 不可用，无法发送消息');
    }
};

// ========== 6. 诊断总结 ==========
console.log('\n\n【诊断总结】');
console.log('------------------------');
console.log('如果以上检查都正常但收藏功能仍不工作，请尝试:');
console.log('1. 刷新页面后重新检查');
console.log('2. 打开扩展的 popup 窗口，然后再次点击收藏按钮');
console.log('3. 在扩展管理页面检查扩展是否启用');
console.log('4. 查看扩展的 Service Worker 是否有错误');
console.log('\n执行 testBookmark() 手动测试收藏功能');

// 返回诊断结果对象供进一步使用
window.dsBookmarkDiagnostic = {
    hasBookmarkBtn: !!bookmarkBtn,
    hasChromeRuntime: hasContentScript,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    url: window.location.href,
    timestamp: new Date().toISOString()
};

console.log('\n诊断完成！诊断结果对象: window.dsBookmarkDiagnostic');
console.log(window.dsBookmarkDiagnostic);
