import { ACTIONS, checkUrl, log, safeSendMessage } from './common';

const MENUITEM_ID = 'kango-add-menuitem';


function updateContextMenuForUrl(url: string) {
  chrome.contextMenus.removeAll(() => {
    if (!checkUrl(url)) {
      chrome.contextMenus.create({
        id: MENUITEM_ID,
        title: chrome.i18n.getMessage('add_hop'),
        contexts: ['selection', 'page']
      });
    }
  });
}


async function ensureContentScript(tab?: chrome.tabs.Tab, retryDelay = 200): Promise<void> {
  if (!tab?.id || checkUrl(tab.url)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: ACTIONS.PING });
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    } catch (injectionError) {
      log('error', 'kanGO: Failed to inject content script or send message:', injectionError);
    }
  }
}


async function notifyTabChanged(tab: chrome.tabs.Tab) {
  await ensureContentScript(tab);
  await safeSendMessage({
    action: ACTIONS.TAB_CHANGED,
    url: tab.url,
  });
}


chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  updateContextMenuForUrl(tabs[0]?.url ?? '');
  await notifyTabChanged(tabs[0]);
});


chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});


chrome.contextMenus.onClicked.addListener(async (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
  if (info.menuItemId === MENUITEM_ID && tab?.id) {
    await ensureContentScript(tab);
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: ACTIONS.SHOW_MODAL,
        selectedText: info.selectionText || ''
      });
    } catch (error) {
      log('error', 'kanGO: Failed to send message: ', error);
    }
  }
});


chrome.runtime.onMessage.addListener(async (message: any, sender: chrome.runtime.MessageSender) => {
  switch (message.action) {
    case ACTIONS.OPEN_SIDEBAR:
      if (!sender?.tab?.id) return;
      try {
        chrome.sidePanel.open({ tabId: sender.tab.id });
      } catch (error) {
        log('error', 'kanGO: Failed to open sidebar: ', error);
      }
      break;
    case ACTIONS.HIDE_MENU:
      chrome.contextMenus.removeAll(() => { });
      break;
    case ACTIONS.SCROLL:
      await ensureContentScript(message.tabId);
      await chrome.tabs.sendMessage(message.tabId, {
        action: ACTIONS.SCROLL,
        hopId: message.hopId,
      });
      break;
    case ACTIONS.REMOVE:
      await ensureContentScript(message.tabId);
      await chrome.tabs.sendMessage(message.tabId, {
        action: ACTIONS.REMOVE,
        hopId: message.hopId,
      });
      break;
  }
});


chrome.tabs.onActivated.addListener(async (activeInfo: chrome.tabs.TabActiveInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);

  updateContextMenuForUrl(tab.url ?? '');

  await notifyTabChanged(tab);
});


chrome.tabs.onUpdated.addListener(async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
  if (changeInfo.status === 'complete') {
    updateContextMenuForUrl(tab.url ?? '');

    await notifyTabChanged(tab);
  }

  if (changeInfo.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs: chrome.tabs.Tab[]) => {
      if (tabs[0] && tabs[0].id === tabId) {
        await notifyTabChanged(tabs[0]);
      }
    });
  }
});
