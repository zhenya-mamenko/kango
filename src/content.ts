import { ACTIONS, HOP_COLORS, HopsStorage, Hop, escapeHtml, generateSelector, log, safeSendMessage } from './common';
//@ts-ignore
import modalHtml from '../templates/modal.html?raw';
//@ts-ignore
import modalCss from '../templates/modal.css?raw';

class HopsManager {
  private modal: HTMLElement | null = null;
  private clickedElement: HTMLElement | null = null;
  private currentUrl: string = window.location.href;
  private isInitialized: boolean = false;

  constructor() {
    chrome.runtime.onMessage.addListener((message) => {
      switch (message.action) {
        case ACTIONS.PING:
          return Promise.resolve('PONG');
        case ACTIONS.TAB_CHANGED:
          this.loadExistingHops();
          break;
        case ACTIONS.REMOVE:
          this.removeHop(message.hopId);
          break;
        case ACTIONS.SHOW_MODAL:
          this.showHopModal(message.selectedText ?? '');
          break;
        case ACTIONS.SCROLL:
          this.scrollToHop(message.hopId);
          break;
      }
    });

    document.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;
      const hop = target.closest('.kango-hop');
      if (hop && hop.hasAttribute('data-hop-id')) {
        event.preventDefault();
        await safeSendMessage({ action: ACTIONS.OPEN_SIDEBAR });
      }
    });

    document.addEventListener('contextmenu', async (event) => {
      this.clickedElement = event.target as HTMLElement;
      if (!generateSelector(this.clickedElement)) {
        await safeSendMessage({
          action: ACTIONS.HIDE_MENU,
        });
        this.clickedElement = null;
      }
    });

    this.initialize();
  }

  private async initialize() {
    this.isInitialized = true;
    this.currentUrl = window.location.href;
    await this.loadExistingHops();
    this.setupDOMObserver();
    this.setupHistoryListener();
    this.setupVisibilityListener();
  }

  private async loadExistingHops() {
    const currentUrl = window.location.href;

    const hops = await HopsStorage.getHops(currentUrl);

    hops.forEach((hop: Hop) => {
      this.addHopToPage(hop);
    });
  }

  private showHopModal(selectedText: string) {
    if (!this.clickedElement || !this.hasTextContent(this.clickedElement) || !generateSelector(this.clickedElement)) {
      return;
    }

    if (this.modal) {
      this.modal.remove();
    }

    const elementText = this.getElementText(this.clickedElement);
    const value = escapeHtml((selectedText || elementText).substring(0, 50));

    this.modal = this.createModal(elementText, value);
    document.body.appendChild(this.modal);

    const titleInput = this.modal.querySelector('#hop-modal-title') as HTMLInputElement;
    titleInput?.focus();
    const addButton = this.modal.querySelector('#kango-add-hop') as HTMLButtonElement;
    addButton.disabled = !value?.trim();
  }

  private getElementText(element: HTMLElement): string {
    return element.textContent?.trim() ?? '';
  }

  private hasTextContent(element: HTMLElement): boolean {
    return this.getElementText(element).length > 0;
  }

  private createModal(text: string, value: string): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'hop-modal';
    const values = {
      text: text.length > 100 ? text.substring(0, 100) + '...' : text,
      caption: chrome.i18n.getMessage('add_hop'),
      title: chrome.i18n.getMessage('hop_title'),
      value,
      color: chrome.i18n.getMessage('hop_color'),
      colors: HOP_COLORS.map(color => `<div class="color-option" data-color="${color}" style="background-color: ${color};"></div>`).join(''),
      cancel: chrome.i18n.getMessage('cancel_button'),
      add: chrome.i18n.getMessage('add_hop_button'),
    }

    modal.innerHTML = modalHtml.formatUnicorn(values);

    this.addModalStyles();
    this.setupModalEvents(modal);

    return modal;
  }

  private setupModalEvents(modal: HTMLElement) {
    const titleInput = modal.querySelector('#kango-hop-title') as HTMLInputElement;
    const addButton = modal.querySelector('#kango-add-hop') as HTMLButtonElement;
    const cancelButton = modal.querySelector('#kango-cancel-hop') as HTMLButtonElement;
    const overlay = modal.querySelector('.hop-modal .overlay') as HTMLButtonElement;
    const colorOptions = modal.querySelectorAll('.hop-modal .color-option');

    colorOptions[0]?.classList.add('selected');
    let selectedColor = colorOptions[0]?.getAttribute('data-color')!;

    const listeners: Array<{ element: Document | Element, handler: (e: any) => void, event: string}> = [];
    const addListener = (element: Document | Element, event: string, handler: (e: any) => void) => {
      if (!element || !element.addEventListener) return;
      element.addEventListener(event, handler);
      listeners.push({ element, handler, event });
    };

    addListener(titleInput, 'input', () => {
      addButton.disabled = !titleInput.value.trim();
    });

    colorOptions.forEach(option => {
      const handler = () => {
        colorOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        selectedColor = option.getAttribute('data-color')!;
      };
      addListener(option, 'click', handler);
    });

    addListener(cancelButton, 'click', () => {
      this.closeModal();
    });

    addListener(addButton, 'click', async () => {
      await this.addHop(titleInput.value.trim(), selectedColor);
      this.closeModal();
    });

    addListener(document, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    });

    addListener(overlay, 'click', (e: Event) => {
      if (e.target === e.currentTarget) {
        this.closeModal();
      }
    });

    (modal as any)._listeners = listeners;
  }

  private async addHop(title: string, color: string) {
    if (!this.clickedElement || !title) return;

    const id = HopsStorage.generateId();
    const selector = generateSelector(this.clickedElement);
    if (!selector) return;
    const url = window.location.href;
    const order = await HopsStorage.getHops(url).then(hops => hops.length);

    const hop: Hop = {
      id,
      title,
      color,
      selector,
      url: window.location.href,
      order,
    };

    await HopsStorage.addHop(hop);
    this.addHopToPage(hop);
  }

  private addHopToPage(hop: Hop) {
    const existingHop = document.querySelector(`[data-hop-id="${hop.id}"]`);
    if (existingHop) {
      return;
    }

    let element: HTMLElement | null = this.findElementBySelector(hop.selector);

    if (!element) {
      return;
    }

    const icon = document.createElement('div');
    icon.className = 'kango-hop';
    icon.setAttribute('data-hop-id', hop.id);
    icon.style.cssText = `
      align-items: center;
      cursor: pointer;
      display: inline-flex;
      float: right;
      height: 24px;
      justify-content: center;
      margin: 8px;
      position: relative;
      width: 24px;
      z-index: 1000;
    `;

    icon.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 2H14L16 6L14 10H4V18H2V2H4Z" fill="${hop.color}"></path>
      </svg>
    `;

    try {
      element.parentNode?.insertBefore(icon, element);
    } catch (error) {
      log('error', 'Failed to insert hop icon: ', error);
    }
  }

  private scrollToHop(hopId: string) {
    const hop = document.querySelector(`[data-hop-id="${hopId}"]`);
    if (hop) {
      hop.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  private removeHop(hopId: string) {
    const hop = document.querySelector(`[data-hop-id="${hopId}"]`);
    if (hop) {
      hop.remove();
    }
  }

  private closeModal() {
    if (this.modal) {
      const listeners = (this.modal as any)._listeners;
      if (listeners) {
        listeners.forEach(({ element, handler, event }: { element: Document | Element, handler: (e: any) => void, event: string }) => {
          if (element.removeEventListener) {
            element.removeEventListener(event, handler);
          }
        });
      }
      this.modal.remove();
      this.modal = null;
    }
  }

  private addModalStyles() {
    if (document.getElementById('hop-modal-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'hop-modal-styles';
    styles.textContent = modalCss;

    document.head.appendChild(styles);
  }

  private findElementBySelector(selector: { tag: string, index: number }): HTMLElement | null {
    if (selector.index === -1) {
      return document.querySelector(selector.tag) as HTMLElement;
    }
    const elements = document.querySelectorAll(selector.tag);
    if (elements.length > selector.index) {
      return elements[selector.index] as HTMLElement;
    }
    return null;
  }

  private setupDOMObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldReload = false;

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              shouldReload = true;
              break;
            }
          }
        }
      });

      if (shouldReload) {
        setTimeout(() => {
          this.loadExistingHops();
        }, 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private setupHistoryListener() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const onUrlChange = () => {
      const newUrl = window.location.href;
      if (newUrl !== this.currentUrl) {
        this.currentUrl = newUrl;
        setTimeout(() => {
          this.loadExistingHops();
        }, 500);
      }
    };

    if (!history.pushState.toString().includes('onUrlChange')) {
      history.pushState = function(...args) {
        originalPushState.apply(history, args);
        onUrlChange();
      };

      history.replaceState = function(...args) {
        originalReplaceState.apply(history, args);
        onUrlChange();
      };
    }

    window.addEventListener('popstate', onUrlChange);
  }

  private setupVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        setTimeout(() => {
          const newUrl = window.location.href;
          if (newUrl !== this.currentUrl || !this.isInitialized) {
            this.currentUrl = newUrl;
            this.loadExistingHops();
          }
        }, 500);
      }
    });

    window.addEventListener('focus', () => {
      setTimeout(() => {
        const newUrl = window.location.href;
        if (newUrl !== this.currentUrl || !this.isInitialized) {
          this.currentUrl = newUrl;
          this.loadExistingHops();
        }
      }, 500);
    });
  }
}

if (!(window as any).kangoHopsManagerInitialized) {
  (window as any).kangoHopsManagerInitialized = true;
  new HopsManager();
}
