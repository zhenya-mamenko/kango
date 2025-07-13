import { ACTIONS, HopsStorage, checkUrl, escapeHtml } from './common';
//@ts-ignore
import emptyContainer from '../templates/sidebar-empty-container.html?raw';

declare const Sortable: any;

class SidebarManager {
  private container: HTMLElement;
  private hops: any[] = [];
  private currentUrl: string = '';

  constructor() {
    this.container = document.getElementById('container')!;
    this.init();
  }

  private async init() {
    await this.getCurrentTabUrl();
    await this.loadHops();
    this.setupSortable();

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
      console.error('Error getting current tab URL: ', error);
    }
  }

  private async loadHops() {
    try {
      this.hops = await HopsStorage.getHops(this.currentUrl);
      this.renderHops(checkUrl(this.currentUrl));
    } catch (error) {
      console.error('Error loading hops: ', error);
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
  }

  private createHopElement(hop: any): HTMLElement {
    const listItem = document.createElement('li');
    listItem.className = 'item';
    listItem.setAttribute('data-hop-id', hop.id);

    listItem.innerHTML = `
      <div class="drag-handle"></div>
      <div class="content">
        <div class="info">
          <div class="title" dir="auto">${escapeHtml(hop.title)}</div>
        </div>
      </div>
      <div class="color" style="background-color: ${hop.color}"></div>
      <div class="actions">
        <button class="delete-btn">×</button>
      </div>
    `;

    const hopContent = listItem.querySelector('.content');
    hopContent?.addEventListener('click', () => {
      this.navigateToHop(hop.id);
    });

    const deleteBtn = listItem.querySelector('.delete-btn');
    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteHop(hop.id);
    });

    return listItem;
  }

  private setupSortable() {
    const observer = new MutationObserver(() => {
      const sortableList = document.getElementById('sortable-hops');
      if (sortableList && !sortableList.hasAttribute('data-sortable-initialized')) {
        sortableList.setAttribute('data-sortable-initialized', 'true');

        new Sortable(sortableList, {
          handle: '.drag-handle',
          animation: 150,
          ghostClass: 'dragging',
          onEnd: (evt: any) => {
            this.handleReorder(evt.oldIndex!, evt.newIndex!);
          }
        });
      }
    });

    observer.observe(this.container, { childList: true, subtree: true });
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
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, {
        action: ACTIONS.SCROLL,
        hopId: hopId,
      });
    }
  }

  private async deleteHop(hopId: string) {
    try {
      await HopsStorage.removeHop(hopId);

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: ACTIONS.REMOVE,
          hopId: hopId,
        });
      }

      await this.loadHops();
    } catch (error) {
      console.error('Error deleting hop: ', error);
    }
  }

}

new SidebarManager();
