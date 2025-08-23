import { ACTIONS, Hop, HopsStorage, checkUrl, escapeHtml, log, safeSendMessage } from './common';
//@ts-ignore
import emptyContainer from '../templates/sidebar-empty-container.html?raw';
//@ts-ignore
import itemHtml from '../templates/item.html?raw';
//@ts-ignore
import loadSaveHtml from '../templates/load-save.html?raw';

declare const Sortable: any;


class SidebarManager {
  private container: HTMLElement;
  private hops: Hop[] = [];
  private currentUrl: string = '';

  constructor() {
    this.container = document.getElementById('container')!;
    this.init();
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

  private downloadFile(content: string, filename: string) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
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

  private async handleReorder(oldIndex: number, newIndex: number) {
    if (oldIndex === newIndex) return;

    const movedHop = this.hops.splice(oldIndex, 1)[0];
    this.hops.splice(newIndex, 0, movedHop);

    this.hops.forEach((hop, index) => {
      hop.order = index;
    });

    HopsStorage.setHops(this.hops);
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

  private async loadHops() {
    try {
      this.hops = await HopsStorage.getHops(this.currentUrl);
      this.renderHops(checkUrl(this.currentUrl));
    } catch (error) {
      log('error', 'kanGO Sidebar: Error loading hops: ', error);
    }
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

  private readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('kanGO Sidebar: Failed to read file as text'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private renderHops(isWrongPage: boolean = false) {
    const buttons = loadSaveHtml.formatUnicorn({
      load_hops: chrome.i18n.getMessage('load_hops'),
      save_hops: chrome.i18n.getMessage('save_hops'),
    });

    if (this.hops.length === 0) {
      if (isWrongPage) {
        this.container.innerHTML = emptyContainer.formatUnicorn({
          text: chrome.i18n.getMessage('wrong_page'),
        });
        return;
      }
      this.container.innerHTML = buttons + emptyContainer.formatUnicorn({
        text: chrome.i18n.getMessage('no_hops'),
      });
      this.setupLoadSaveButtons();
      this.updateSaveButtonState();
      return;
    }

    const hopList = document.createElement('ul');
    hopList.className = 'list';
    hopList.id = 'sortable-hops';

    this.hops.forEach(hop => {
      const listItem = this.createHopElement(hop);
      hopList.appendChild(listItem);
    });

    this.container.innerHTML = buttons;
    this.container.appendChild(hopList);
    this.setupSortable();
    this.setupLoadSaveButtons();
    this.updateSaveButtonState();
  }

  private setupLoadSaveButtons() {
    const loadBtn = document.getElementById('load-hops-btn');
    const saveBtn = document.getElementById('save-hops-btn');
    const fileInput = document.getElementById('load-hops-input') as HTMLInputElement;

    if (loadBtn && fileInput) {
      loadBtn.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
          try {
            const content = await this.readFileContent(file);
            await HopsStorage.loadFromJson(content);
            await this.loadHops();
            target.value = '';
          } catch (error) {
            log('error', 'kanGO Sidebar: Error loading hops from file: ', error);
          }
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        try {
          const jsonData = await HopsStorage.saveToJson();
          const timestamp = new Date().toISOString()
            .replace(/[:.T]/g, '-')
            .substring(0, 19);
          const filename = `${timestamp}.hops`;
          this.downloadFile(jsonData, filename);
        } catch (error) {
          log('error', 'kanGO Sidebar: Error saving hops to file: ', error);
        }
      });
    }
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

  private updateSaveButtonState() {
    const saveBtn = document.getElementById('save-hops-btn') as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.disabled = this.hops.length === 0;
    }
  }

}

new SidebarManager();
