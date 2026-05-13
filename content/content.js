(function() {
  'use strict';

  function init() {
    injectCollectButton();
    console.log('✅ DeepSeek BookMark: content script 已加载');
  }

  // ========== 注入收藏按钮 ==========
  function injectCollectButton() {
    if (document.getElementById('ds-bookmark-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'ds-bookmark-btn';
    btn.innerHTML = '📌 收藏对话';
    btn.title = '收藏当前对话到DeepSeek收藏夹';

    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '80px',
      right: '24px',
      padding: '8px 16px',
      background: '#4D6BFE',
      color: '#fff',
      border: 'none',
      borderRadius: '20px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      zIndex: '9999',
      boxShadow: '0 2px 12px rgba(77, 107, 254, 0.4)',
      transition: 'all 0.2s',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif'
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-1px)';
      btn.style.boxShadow = '0 4px 16px rgba(77, 107, 254, 0.5)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 2px 12px rgba(77, 107, 254, 0.4)';
    });

    btn.addEventListener('click', collectConversation);
    document.body.appendChild(btn);
    console.log('✅ DeepSeek BookMark: 收藏按钮已注入');
  }

  // ========== 收藏对话 ==========
  function collectConversation() {
    console.log('📌 开始提取对话...');

    const data = {
      title: extractTitle(),
      url: window.location.href,
      content: extractContent(),
      timestamp: new Date().toISOString()
    };

    console.log('提取结果:', {
      title: data.title,
      url: data.url,
      contentLength: data.content?.length || 0
    });

    // 发送给 background.js，让 popup 显示选择收藏夹弹窗
    try {
      chrome.runtime.sendMessage({ action: 'prepareBookmark', data }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('发送失败:', chrome.runtime.lastError.message);
          showToast('收藏失败，请确保插件已启用并刷新页面', 'error');
          return;
        }
        if (response?.success) {
          console.log('✅ 已准备收藏，请打开插件选择收藏夹');
          showToast('📌 请打开插件选择收藏夹');
        } else {
          console.error('准备收藏失败:', response?.error);
          showToast('收藏失败: ' + (response?.error || '未知错误'), 'error');
        }
      });
    } catch (e) {
      console.error('发送异常:', e);
      showToast('收藏失败: ' + e.message, 'error');
    }
  }

  // ========== 提取标题 ==========
  function extractTitle() {
    // 方法1：从页面标题提取（去掉 "DeepSeek - " 前缀和默认标题）
    const pageTitle = document.title.replace(/^DeepSeek\s*[-–—]\s*/i, '').trim();
    const defaultTitles = ['DeepSeek', '探索未至之境', ''];
    if (pageTitle && !defaultTitles.includes(pageTitle)) {
      return pageTitle;
    }

    // 方法2：查找会话标题元素（DeepSeek 常见选择器）
    const titleSelectors = [
      '.conversation-title',
      '.chat-title',
      '[class*="conversation"] [class*="title"]',
      '[class*="chat"] [class*="title"]',
      '[class*="header"] [class*="title"]',
      '.header-title',
      'h1', 'h2'
    ];

    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        const text = el.textContent.trim();
        if (text.length > 0 && text.length < 200 && !defaultTitles.includes(text)) {
          return text;
        }
      }
    }

    // 方法3：取第一个有意义的文本块
    const allTextElements = document.querySelectorAll('p, div, span');
    for (const el of allTextElements) {
      const text = el.textContent.trim();
      if (text.length > 10 && text.length < 100 &&
          !text.includes('DeepSeek') &&
          !text.includes('探索未至之境') &&
          el.children.length === 0) {
        return text.substring(0, 80);
      }
    }

    return '新对话';
  }

  // ========== 提取对话内容 ==========
  function extractContent() {
    const parts = [];

    // 多层选择器策略：从精确到模糊
    const bubbleSelectors = [
      '[class*="bubble"]',
      '[class*="message-content"]',
      '[class*="chat-message"]',
      '[class*="chat-item"]',
      '[class*="turn"]',
      '[class*="dialogue"]',
      '[class*="conversation"] [class*="item"]',
      '[class*="chat"] [class*="content"]',
      '[class*="message"]'
    ];

    let foundElements = [];
    for (const selector of bubbleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        foundElements = Array.from(elements);
        console.log(`选择器 "${selector}" 找到 ${elements.length} 个元素`);
        break;
      }
    }

    // 如果上面都找不到，尝试获取主内容区域
    if (foundElements.length === 0) {
      const mainSelectors = [
        'main',
        '[class*="main"]',
        '[class*="chat-container"]',
        '[class*="conversation"]',
        '[role="main"]'
      ];

      for (const selector of mainSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          foundElements = [el];
          console.log(`使用主区域选择器: "${selector}"`);
          break;
        }
      }
    }

    // 最后兜底：获取 body 内所有可见文本
    if (foundElements.length === 0) {
      console.warn('未找到对话元素，使用 body 文本兜底');
      const bodyText = document.body.innerText || '';
      return bodyText.substring(0, 10000);
    }

    // 提取并合并文本
    for (const el of foundElements) {
      const text = el.textContent?.trim();
      if (text && text.length > 5) {
        parts.push(text);
      }
    }

    const result = parts.join('\n\n');
    return result.substring(0, 50000);
  }

  // ========== Toast 提示 ==========
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '130px',
      right: '24px',
      padding: '10px 20px',
      background: type === 'error' ? '#ef4444' : '#10b981',
      color: '#fff',
      borderRadius: '8px',
      fontSize: '14px',
      zIndex: '10000',
      opacity: '0',
      transition: 'opacity 0.3s',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // 监听来自 popup 的 Toast 消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'showToast') {
      showToast(message.message, message.type || 'success');
      sendResponse({ success: true });
    }
    return true;
  });

  // ========== 启动 ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('DeepSeek BookMark content script 已加载');
})();
