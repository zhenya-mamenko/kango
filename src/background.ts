import { ACTIONS, checkUrl } from './common';

const MENUITEM_ID = 'kango-add-menuitem';


function updateContextMenuForUrl(url: string) {
  const isNoMenu = checkUrl(url);
  if (isNoMenu) {
    chrome.contextMenus.removeAll(() => { });
  } else {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENUITEM_ID,
        title: chrome.i18n.getMessage('add_hop'),
        contexts: ['selection', 'page']
      });
    });
  }
}


chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  updateContextMenuForUrl(tabs[0]?.url ?? '');
});


chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});


chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
  if (info.menuItemId === MENUITEM_ID && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: ACTIONS.SHOW_MODAL,
      selectedText: info.selectionText || ''
    });
  }
});


chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender) => {
  if (!sender.tab?.id) return;

  switch (message.action) {
    case ACTIONS.OPEN_SIDEBAR:
      chrome.sidePanel.open({ tabId: sender.tab.id });
      break;
    case ACTIONS.HIDE_MENU:
      chrome.contextMenus.removeAll(() => { });
      break;
  }
});


chrome.tabs.onActivated.addListener(async (activeInfo: chrome.tabs.TabActiveInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);

  updateContextMenuForUrl(tab.url ?? '');

  chrome.runtime.sendMessage({
    action: ACTIONS.TAB_CHANGED,
    url: tab.url,
  }).catch(() => { });
});


chrome.tabs.onUpdated.addListener(async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
  if (changeInfo.status === 'complete') {
    updateContextMenuForUrl(tab.url ?? '');
  }

  if (changeInfo.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id === tabId) {
        chrome.runtime.sendMessage({
          action: ACTIONS.TAB_CHANGED,
          url: changeInfo.url,
        }).catch(() => { });
      }
    });
  }
});
