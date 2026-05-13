// ========== DeepSeek BookMark - Service Worker ==========
// 核心：接收 content.js 的消息，处理书签相关操作

chrome.runtime.onInstalled.addListener(() => {
  console.log('DeepSeek BookMark 插件已安装');
});

// 监听来自 content.js 和 popup.js 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 处理 content.js 的收藏准备请求（存储待收藏数据，等待 popup 打开）
  if (message.action === 'prepareBookmark') {
    handlePrepareBookmark(message.data)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 处理直接添加书签（兼容旧逻辑）
  if (message.action === 'addBookmark') {
    handleAddBookmark(message.data)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'getBookmarks') {
    handleGetBookmarks()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'deleteBookmark') {
    handleDeleteBookmark(message.bookmarkId)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// 准备收藏：存储待收藏数据，等待用户打开 popup 选择收藏夹
async function handlePrepareBookmark(data) {
  // 将待收藏数据存入 storage
  await chrome.storage.local.set({
    pendingBookmark: {
      title: data.title || '无标题',
      url: data.url || '',
      content: data.content || '',
      timestamp: new Date().toISOString()
    }
  });

  console.log('✅ 待收藏数据已存储，等待用户打开 popup 选择收藏夹');

  // 尝试打开 popup（Chrome 不允许直接打开，但可以尝试）
  try {
    await chrome.action.openPopup();
  } catch (e) {
    // 无法自动打开 popup，用户需要手动点击图标
    console.log('请用户手动打开 popup 选择收藏夹');
  }

  return { success: true, message: '请打开插件选择收藏夹' };
}

// 直接保存书签到 storage（兼容旧逻辑）
async function handleAddBookmark(data) {
  const result = await chrome.storage.local.get(['folders', 'bookmarks']);
  let folders = result.folders || [];
  let bookmarks = result.bookmarks || [];

  // 如果没有收藏夹，自动创建"默认"
  if (folders.length === 0) {
    folders.push({
      id: 'folder_' + Date.now(),
      name: '默认',
      createdAt: new Date().toISOString()
    });
  }

  const bookmark = {
    id: 'bm_' + Date.now(),
    folderId: folders[0].id,
    title: data.title || '无标题',
    url: data.url || '',
    content: data.content || '',
    timestamp: new Date().toISOString()
  };

  bookmarks.unshift(bookmark);
  await chrome.storage.local.set({ folders, bookmarks });

  console.log('✅ 书签已保存:', bookmark.title);
  return { success: true, bookmark };
}

// 获取所有书签
async function handleGetBookmarks() {
  const result = await chrome.storage.local.get(['folders', 'bookmarks']);
  return {
    success: true,
    folders: result.folders || [],
    bookmarks: result.bookmarks || []
  };
}

// 删除书签
async function handleDeleteBookmark(bookmarkId) {
  const result = await chrome.storage.local.get(['bookmarks']);
  let bookmarks = result.bookmarks || [];
  bookmarks = bookmarks.filter(bm => bm.id !== bookmarkId);
  await chrome.storage.local.set({ bookmarks });
  return { success: true };
}
