// ========== 状态管理 ==========
let folders = [];
let bookmarks = [];
let currentFolderId = 'all';
let searchKeyword = '';
let batchMode = false;
let selectedBookmarkIds = new Set();
let pendingBookmarkData = null; // 等待选择收藏夹的数据
let currentDetailBookmark = null;  // 当前查看详情的书签
let selectedSegments = new Set();  // 详情弹窗中选中的片段索引

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderFolders();
  renderBookmarks();
  bindEvents();
  
  // 检查是否有来自 content script 的待处理收藏
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'addBookmark') {
      showFolderSelectModal(message.data);
      sendResponse({ success: true });
    }
    return true;
  });
});

async function loadData() {
  const result = await chrome.storage.local.get(['folders', 'bookmarks']);
  folders = result.folders || [];
  bookmarks = result.bookmarks || [];
}

async function saveData() {
  await chrome.storage.local.set({ folders, bookmarks });
}

// ========== 渲染函数 ==========
function renderFolders() {
  const folderList = document.getElementById('folderList');
  folderList.innerHTML = `
    <li class="folder-item ${currentFolderId === 'all' ? 'active' : ''}" data-folder-id="all">
      📋 全部
    </li>
  `;
  
  folders.forEach(folder => {
    const li = document.createElement('li');
    li.className = `folder-item ${currentFolderId === folder.id ? 'active' : ''}`;
    li.dataset.folderId = folder.id;
    li.textContent = `📁 ${folder.name}`;
    
    // 右键菜单
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const action = prompt(`收藏夹 "${folder.name}"\n输入新名称重命名，或留空删除：`);
      if (action === null) return;
      if (action.trim() === '') {
        if (confirm(`确定要删除收藏夹"${folder.name}"及其所有内容吗？`)) {
          deleteFolder(folder.id);
        }
      } else {
        renameFolder(folder.id, action.trim());
      }
    });
    
    folderList.appendChild(li);
  });
}

function renderBookmarks() {
  const bookmarkList = document.getElementById('bookmarkList');
  
  let filtered = bookmarks;
  if (currentFolderId !== 'all') {
    filtered = filtered.filter(bm => bm.folderId === currentFolderId);
  }
  if (searchKeyword) {
    const kw = searchKeyword.toLowerCase();
    filtered = filtered.filter(bm => 
      bm.title.toLowerCase().includes(kw) || 
      bm.content.toLowerCase().includes(kw)
    );
  }

  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (filtered.length === 0) {
    bookmarkList.innerHTML = '<div class="empty-state">暂无收藏内容</div>';
    return;
  }

  bookmarkList.innerHTML = filtered.map(bm => {
    const folder = folders.find(f => f.id === bm.folderId);
    const folderName = folder ? folder.name : '未分类';
    const snippet = bm.content?.substring(0, 100) || '';
    const time = formatTime(bm.timestamp);
    const checked = selectedBookmarkIds.has(bm.id) ? 'checked' : '';
    
    return `
      <div class="bookmark-item ${batchMode ? 'batch-mode' : ''}" data-bookmark-id="${bm.id}">
        <input type="checkbox" class="bm-checkbox" ${checked}>
        <div class="bm-main" data-bookmark-id="${bm.id}">
          <div class="bm-title">${escapeHtml(bm.title)}</div>
          <div class="bm-snippet">${escapeHtml(snippet)}</div>
          <div class="bm-meta">
            <span>${time}</span>
            <span class="bm-folder-tag">${escapeHtml(folderName)}</span>
          </div>
        </div>
        <div class="bm-actions">
          <button class="bm-action-btn move" data-bookmark-id="${bm.id}" title="移动到其他收藏夹">📁</button>
          <button class="bm-action-btn delete" data-bookmark-id="${bm.id}" title="删除">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  // 绑定主区域点击 → 普通点击打开详情弹窗，Ctrl+点击打开原始链接
  bookmarkList.querySelectorAll('.bm-main').forEach(el => {
    el.addEventListener('click', (e) => {
      if (batchMode) {
        const bmId = el.dataset.bookmarkId;
        toggleSelection(bmId);
        return;
      }
      const bm = bookmarks.find(b => b.id === el.dataset.bookmarkId);
      if (!bm) return;
      
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+点击 → 打开原始对话
        if (bm.url) chrome.tabs.create({ url: bm.url });
      } else {
        // 普通点击 → 打开详情弹窗
        showDetailModal(bm);
      }
    });
  });

  // 绑定复选框变化
  bookmarkList.querySelectorAll('.bm-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const bmId = cb.closest('.bookmark-item').dataset.bookmarkId;
      toggleSelection(bmId);
    });
  });

  // 绑定删除按钮
  bookmarkList.querySelectorAll('.bm-action-btn.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBookmark(btn.dataset.bookmarkId);
    });
  });

  // 绑定移动按钮
  bookmarkList.querySelectorAll('.bm-action-btn.move').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showMoveModal([btn.dataset.bookmarkId]);
    });
  });
}

// ========== 事件绑定 ==========
function bindEvents() {
  document.getElementById('searchToggle').addEventListener('click', toggleSearch);
  document.getElementById('searchInput').addEventListener('input', debounce(onSearch, 300));
  document.getElementById('clearSearch').addEventListener('click', clearSearch);
  document.getElementById('addFolder').addEventListener('click', createFolder);
  
  document.getElementById('folderList').addEventListener('click', (e) => {
    const item = e.target.closest('.folder-item');
    if (item) {
      currentFolderId = item.dataset.folderId;
      renderFolders();
      renderBookmarks();
    }
  });

  // 批量管理
  document.getElementById('enterBatch').addEventListener('click', toggleBatchMode);
  document.getElementById('cancelBatch').addEventListener('click', exitBatchMode);
  document.getElementById('batchDelete').addEventListener('click', batchDelete);
  document.getElementById('batchMove').addEventListener('click', () => {
    if (selectedBookmarkIds.size === 0) {
      alert('请先选择要移动的对话');
      return;
    }
    showMoveModal(Array.from(selectedBookmarkIds));
  });

  // 导出（批量模式下只导出选中项）
  document.getElementById('exportMd').addEventListener('click', () => exportBookmarks('md'));
  document.getElementById('exportJson').addEventListener('click', () => exportBookmarks('json'));

  // 收藏夹选择弹窗
  document.getElementById('closeModal').addEventListener('click', closeFolderSelectModal);
  document.getElementById('newFolderInModal').addEventListener('click', createFolderInModal);
  
  // 移动弹窗
  document.getElementById('closeMoveModal').addEventListener('click', closeMoveModal);
}

// ========== 收藏夹选择弹窗（收藏时触发） ==========
function showFolderSelectModal(data) {
  pendingBookmarkData = data;
  const list = document.getElementById('folderSelectList');
  
  if (folders.length === 0) {
    // 没有收藏夹，直接创建默认并收藏
    createDefaultFolderAndAdd(data);
    return;
  }

  list.innerHTML = folders.map(folder => `
    <li class="folder-select-item" data-folder-id="${folder.id}">
      📁 ${escapeHtml(folder.name)}
    </li>
  `).join('');

  list.querySelectorAll('.folder-select-item').forEach(item => {
    item.addEventListener('click', () => {
      addToFolder(pendingBookmarkData, item.dataset.folderId);
      closeFolderSelectModal();
    });
  });

  document.getElementById('folderSelectModal').classList.remove('hidden');
}

function closeFolderSelectModal() {
  document.getElementById('folderSelectModal').classList.add('hidden');
  pendingBookmarkData = null;
}

function createFolderInModal() {
  const name = prompt('请输入新收藏夹名称：');
  if (!name?.trim()) return;

  const newFolder = {
    id: 'folder_' + Date.now(),
    name: name.trim(),
    createdAt: new Date().toISOString()
  };
  folders.push(newFolder);
  saveData().then(() => {
    if (pendingBookmarkData) {
      addToFolder(pendingBookmarkData, newFolder.id);
    }
    closeFolderSelectModal();
    renderFolders();
  });
}

function createDefaultFolderAndAdd(data) {
  const newFolder = {
    id: 'folder_' + Date.now(),
    name: '默认',
    createdAt: new Date().toISOString()
  };
  folders.push(newFolder);
  saveData().then(() => {
    addToFolder(data, newFolder.id);
    renderFolders();
  });
}

function addToFolder(data, folderId) {
  const bookmark = {
    id: 'bm_' + Date.now(),
    folderId: folderId,
    title: data.title || '无标题',
    url: data.url || '',
    content: data.content || '',
    timestamp: new Date().toISOString()
  };
  bookmarks.unshift(bookmark);
  saveData().then(() => {
    renderFolders();
    renderBookmarks();
    showToastInPage('✅ 已收藏');
  });
}

// Toast 提示（通过 content script）
function showToastInPage(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showToast', message });
    }
  });
}

// ========== 移动弹窗 ==========
let pendingMoveIds = [];

function showMoveModal(bookmarkIds) {
  pendingMoveIds = bookmarkIds;
  const list = document.getElementById('moveFolderList');
  
  list.innerHTML = folders.map(folder => `
    <li class="folder-select-item" data-folder-id="${folder.id}">
      📁 ${escapeHtml(folder.name)}
    </li>
  `).join('');

  list.querySelectorAll('.folder-select-item').forEach(item => {
    item.addEventListener('click', () => {
      moveBookmarks(pendingMoveIds, item.dataset.folderId);
      closeMoveModal();
    });
  });

  document.getElementById('moveFolderModal').classList.remove('hidden');
}

function closeMoveModal() {
  document.getElementById('moveFolderModal').classList.add('hidden');
  pendingMoveIds = [];
}

function moveBookmarks(bookmarkIds, targetFolderId) {
  bookmarkIds.forEach(id => {
    const bm = bookmarks.find(b => b.id === id);
    if (bm) bm.folderId = targetFolderId;
  });
  saveData().then(() => {
    renderBookmarks();
    if (batchMode) {
      selectedBookmarkIds.clear();
      updateBatchBar();
    }
  });
}

// ========== 删除功能 ==========
function deleteBookmark(bookmarkId) {
  if (!confirm('确定要删除这条收藏吗？')) return;
  bookmarks = bookmarks.filter(b => b.id !== bookmarkId);
  selectedBookmarkIds.delete(bookmarkId);
  saveData().then(() => {
    renderBookmarks();
    if (batchMode) updateBatchBar();
  });
}

function deleteFolder(folderId) {
  bookmarks = bookmarks.filter(b => b.folderId !== folderId);
  folders = folders.filter(f => f.id !== folderId);
  if (currentFolderId === folderId) currentFolderId = 'all';
  saveData().then(() => {
    renderFolders();
    renderBookmarks();
  });
}

function renameFolder(folderId, newName) {
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.name = newName;
    saveData().then(() => renderFolders());
  }
}

// ========== 批量操作 ==========
function toggleBatchMode() {
  batchMode = !batchMode;
  const btn = document.getElementById('enterBatch');
  const batchBar = document.getElementById('batchBar');
  
  if (batchMode) {
    btn.textContent = '退出管理';
    batchBar.classList.remove('hidden');
  } else {
    btn.textContent = '批量管理';
    batchBar.classList.add('hidden');
    selectedBookmarkIds.clear();
  }
  renderBookmarks();
}

function exitBatchMode() {
  batchMode = false;
  selectedBookmarkIds.clear();
  document.getElementById('enterBatch').textContent = '批量管理';
  document.getElementById('batchBar').classList.add('hidden');
  renderBookmarks();
}

function toggleSelection(bookmarkId) {
  if (selectedBookmarkIds.has(bookmarkId)) {
    selectedBookmarkIds.delete(bookmarkId);
  } else {
    selectedBookmarkIds.add(bookmarkId);
  }
  updateBatchBar();
  renderBookmarks();
}

function updateBatchBar() {
  document.getElementById('selectedCount').textContent = `已选 ${selectedBookmarkIds.size} 项`;
}

function batchDelete() {
  if (selectedBookmarkIds.size === 0) {
    alert('请先选择要删除的对话');
    return;
  }
  if (!confirm(`确定要删除选中的 ${selectedBookmarkIds.size} 条收藏吗？`)) return;
  
  bookmarks = bookmarks.filter(b => !selectedBookmarkIds.has(b.id));
  selectedBookmarkIds.clear();
  saveData().then(() => {
    renderBookmarks();
    updateBatchBar();
  });
}

// ========== 搜索功能 ==========
function toggleSearch() {
  const bar = document.getElementById('searchBar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) {
    document.getElementById('searchInput').focus();
  }
}

function onSearch() {
  searchKeyword = document.getElementById('searchInput').value.trim();
  document.getElementById('clearSearch').classList.toggle('hidden', !searchKeyword);
  renderBookmarks();
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  searchKeyword = '';
  document.getElementById('clearSearch').classList.add('hidden');
  renderBookmarks();
}

// ========== 收藏夹操作 ==========
async function createFolder() {
  const name = prompt('请输入收藏夹名称：');
  if (!name?.trim()) return;
  folders.push({
    id: 'folder_' + Date.now(),
    name: name.trim(),
    createdAt: new Date().toISOString()
  });
  await saveData();
  renderFolders();
}

// ========== 导出功能（支持多选） ==========
function exportBookmarks(format) {
  let exportItems;
  
  if (batchMode && selectedBookmarkIds.size > 0) {
    // 批量模式下只导出选中的
    exportItems = bookmarks.filter(b => selectedBookmarkIds.has(b.id));
  } else if (currentFolderId !== 'all') {
    // 导出当前收藏夹
    exportItems = bookmarks.filter(b => b.folderId === currentFolderId);
  } else {
    // 全部导出
    exportItems = bookmarks;
  }

  if (exportItems.length === 0) {
    alert('没有可导出的内容，请先选择对话');
    return;
  }

  let content, filename, mimeType;

  if (format === 'md') {
    content = exportItems.map(bm => {
      const folder = folders.find(f => f.id === bm.folderId);
      return `# ${bm.title}\n\n**时间：** ${bm.timestamp}\n**收藏夹：** ${folder?.name || '未分类'}\n**链接：** ${bm.url}\n\n${bm.content}\n\n---\n`;
    }).join('\n');
    filename = `deepseek-bookmarks-${formatDate()}.md`;
    mimeType = 'text/markdown';
  } else {
    content = JSON.stringify(exportItems, null, 2);
    filename = `deepseek-bookmarks-${formatDate()}.json`;
    mimeType = 'application/json';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  // 使用 chrome.downloads API 下载更快
  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: false
  }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

// ========== 工具函数 ==========
function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return date.toLocaleDateString('zh-CN');
}

function formatDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ========== 详情弹窗：片段选择导出 ==========

function showDetailModal(bookmark) {
  currentDetailBookmark = bookmark;
  selectedSegments.clear();

  document.getElementById('detailTitle').textContent = bookmark.title;
  
  // 解析对话内容，按空行或轮次分隔
  const segments = parseSegments(bookmark.content);
  
  renderSegments(segments);
  document.getElementById('detailModal').classList.remove('hidden');
  
  // 绑定事件
  document.getElementById('closeDetail').onclick = closeDetailModal;
  document.getElementById('selectAllSegments').onclick = () => {
    segments.forEach((_, i) => selectedSegments.add(i));
    renderSegments(segments);
  };
  document.getElementById('deselectAllSegments').onclick = () => {
    selectedSegments.clear();
    renderSegments(segments);
  };
  document.getElementById('exportSelectedMd').onclick = () => exportSelectedSegments(bookmark, segments, 'md');
  document.getElementById('exportSelectedJson').onclick = () => exportSelectedSegments(bookmark, segments, 'json');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.add('hidden');
  currentDetailBookmark = null;
  selectedSegments.clear();
}

// 解析对话内容为片段
function parseSegments(content) {
  if (!content) return ['（空内容）'];
  
  // 先按双换行分隔（可能是不同轮次）
  let rawSegments = content.split(/\n\n+/).filter(s => s.trim());
  
  // 如果只分出一段，尝试按单换行分隔
  if (rawSegments.length <= 1) {
    rawSegments = content.split(/\n/).filter(s => s.trim());
  }
  
  // 如果还是只有一段，尝试按序号分隔（如 "1. " "2. "）
  if (rawSegments.length <= 1) {
    rawSegments = content.split(/(?=\d+\.\s)/).filter(s => s.trim());
  }
  
  // 默认全选
  rawSegments.forEach((_, i) => selectedSegments.add(i));
  
  return rawSegments;
}

// 渲染片段列表
function renderSegments(segments) {
  const list = document.getElementById('segmentList');
  document.getElementById('segmentCount').textContent = `已选 ${selectedSegments.size}/${segments.length} 段`;

  list.innerHTML = segments.map((seg, i) => {
    const isSelected = selectedSegments.has(i);
    const preview = seg.substring(0, 200).replace(/\n/g, ' ');
    return `
      <div class="segment-item ${isSelected ? 'selected' : ''}" data-index="${i}">
        <input type="checkbox" ${isSelected ? 'checked' : ''}>
        <div class="segment-content">${escapeHtml(preview)}${seg.length > 200 ? '...' : ''}</div>
      </div>
    `;
  }).join('');

  // 绑定点击切换
  list.querySelectorAll('.segment-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index);
      if (selectedSegments.has(idx)) {
        selectedSegments.delete(idx);
      } else {
        selectedSegments.add(idx);
      }
      renderSegments(segments);
    });
  });
}

// 导出选中片段
function exportSelectedSegments(bookmark, segments, format) {
  const selected = segments.filter((_, i) => selectedSegments.has(i));
  
  if (selected.length === 0) {
    alert('请至少选择一个片段');
    return;
  }

  let content, filename, mimeType;

  if (format === 'md') {
    content = `# ${bookmark.title}（摘选）\n\n`;
    content += `**时间：** ${bookmark.timestamp}\n`;
    content += `**链接：** ${bookmark.url}\n`;
    content += `**摘选片段：** ${selected.length}/${segments.length} 段\n\n---\n\n`;
    content += selected.map((seg, i) => `### 片段 ${i + 1}\n\n${seg}\n\n`).join('');
    filename = `deepseek-片段-${formatDate()}.md`;
    mimeType = 'text/markdown';
  } else {
    const exportData = {
      title: bookmark.title,
      url: bookmark.url,
      timestamp: bookmark.timestamp,
      totalSegments: segments.length,
      selectedSegments: selected.length,
      content: selected
    };
    content = JSON.stringify(exportData, null, 2);
    filename = `deepseek-片段-${formatDate()}.json`;
    mimeType = 'application/json';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: false
  }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  
  closeDetailModal();
}
