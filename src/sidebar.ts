import { ACTIONS, Hop, HopsStorage, checkUrl, escapeHtml, log, safeSendMessage } from './common';
//@ts-ignore
import emptyContainer from '../templates/sidebar-empty-container.html?raw';
//@ts-ignore
import itemHtml from '../templates/item.html?raw';

declare const Sortable: any;


class SidebarManager {
  private container: HTMLElement;
  private hops: Hop[] = [];
  private currentUrl: string = '';

  constructor() {
    this.container = document.getElementById('container')!;
    this.init();
  }

  private async init() {
    await this.getCurrentTabUrl();
    await this.loadHops();

    chrome.runtime.onMessage.addListener(async (message) => {
      if (message.action === ACTIONS.TAB_CHANGED) {
        this.currentUrl = message.url ?? '';
        await this.loadHops();
      }
    });

    chrome.storage.onChanged.addListener(async () => {
      await this.loadHops();
    });
  }

  private async getCurrentTabUrl() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && tabs[0].url) {
        this.currentUrl = tabs[0].url;
      }
    } catch (error) {
      log('error', 'kanGO Sidebar: Error getting current tab URL: ', error);
    }
  }

  private async loadHops() {
    try {
      this.hops = await HopsStorage.getHops(this.currentUrl);
      this.renderHops(checkUrl(this.currentUrl));
    } catch (error) {
      log('error', 'kanGO Sidebar: Error loading hops: ', error);
    }
  }

  private renderHops(isWrongPage: boolean = false) {
    if (this.hops.length === 0) {
      this.container.innerHTML = emptyContainer.formatUnicorn({
        text: isWrongPage ? chrome.i18n.getMessage('wrong_page') : chrome.i18n.getMessage('no_hops'),
      });
      return;
    }

    const hopList = document.createElement('ul');
    hopList.className = 'list';
    hopList.id = 'sortable-hops';

    this.hops.forEach(hop => {
      const listItem = this.createHopElement(hop);
      hopList.appendChild(listItem);
    });

    this.container.innerHTML = '';
    this.container.appendChild(hopList);
    this.setupSortable();
  }

  private createHopElement(hop: Hop): HTMLElement {
    const listItem = document.createElement('li');
    listItem.className = 'item';
    listItem.setAttribute('data-hop-id', hop.id);

    listItem.innerHTML = itemHtml.formatUnicorn({
      title: escapeHtml(hop.title),
      color: hop.color,
    });

    const hopContent = listItem.querySelector('.content');
    hopContent?.addEventListener('click', () => {
      this.navigateToHop(hop.id);
    });

    const deleteBtn = listItem.querySelector('.delete-btn');
    deleteBtn?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.deleteHop(hop.id);
    });

    return listItem;
  }

  private setupSortable() {
    const sortableList = document.getElementById('sortable-hops');
    if (sortableList && !sortableList.hasAttribute('data-sortable-initialized')) {
      sortableList.setAttribute('data-sortable-initialized', 'true');

      new Sortable(sortableList, {
        forceFallback: true,
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'dragging',
        onStart: () => document.body.classList.add('dragging-active'),
        onEnd: (evt: any) => {
          document.body.classList.remove('dragging-active');
          this.handleReorder(evt.oldIndex!, evt.newIndex!);
        },
      });
    }
  }

  private async handleReorder(oldIndex: number, newIndex: number) {
    if (oldIndex === newIndex) return;

    const movedHop = this.hops.splice(oldIndex, 1)[0];
    this.hops.splice(newIndex, 0, movedHop);

    this.hops.forEach((hop, index) => {
      hop.order = index;
    });

    HopsStorage.setHops(this.hops);
  }

  private async navigateToHop(hopId: string) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (activeTab?.id) {
        try {
          await safeSendMessage({
            tabId: activeTab.id,
            action: ACTIONS.SCROLL,
            hopId: hopId,
          });
        } catch (error) {
          log('warn', 'kanGO Sidebar: Failed to send message: ', error);
        }
      }
    } catch (error) {
      log('error', 'kanGO Sidebar: Error navigating to hop:', error);
    }
  }

  private async deleteHop(hopId: string) {
    try {
      await HopsStorage.removeHop(hopId);

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (activeTab?.id) {
        try {
          await safeSendMessage({
            tabId: activeTab.id,
            action: ACTIONS.REMOVE,
            hopId: hopId,
          });
        } catch (error) {
          log('warn', 'kanGO Sidebar: Failed to send message: ', error);
        }
      }

      await this.loadHops();
    } catch (error) {
      log('error', 'kanGO Sidebar: Error deleting hop: ', error);
    }
  }

}

new SidebarManager();
