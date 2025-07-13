export const ACTIONS = {
  ADD: 'addHop',
  HIDE_MENU: 'hideContextMenu',
  OPEN_SIDEBAR: 'openSidebar',
  REMOVE: 'removeHop',
  SCROLL: 'scrollToHop',
  SHOW_MODAL: 'showHopModal',
  TAB_CHANGED: 'tabChanged',
  UPDATE_ORDER: 'updateHopsOrder'
}


export const HOP_COLORS: string[] = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
];


export interface Hop {
  id: string;
  title: string;
  color: string;
  selector: { tag: string, index: number };
  url: string;
  order: number;
}

export class HopsStorage {
  private static readonly STORAGE_KEY = 'kanGO_hops';

  static async getHops(url?: string): Promise<Hop[]> {
    let hops: Hop[] = [];
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      hops = result[this.STORAGE_KEY] || [];
    } catch (error) {
      console.error('Error getting hops from storage: ', error);
    }

    if (url) {
      return hops.filter(hop => hop.url === url || url === 'all');
    }

    return [];
  }

  static async addHop(hop: Hop): Promise<void> {
    const hops = await this.getHops('all');
    hops.push(hop);
    await this.setHops(hops);
  }

  static async removeHop(id: string): Promise<void> {
    const hops = await this.getHops('all');
    const filtered = hops.filter(hop => hop.id !== id);
    await this.setHops(filtered);
  }

  static async setHops(hops: Hop[]): Promise<void> {
    await chrome.storage.local.set({ [this.STORAGE_KEY]: hops });
  }

  static generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}

export function checkUrl(url: string): boolean {
  let result = false;
  try {
    const urlObj = new URL(url);

    result = ['', '/',].includes(urlObj.pathname);

    result = result ||
      [
        'chrome:', 'chrome-extension:', 'moz-extension:', 'edge:', 'about:', 'data:',
        'file:', 'blob:', 'devtools:', 'opera:', 'opera-extension:', 'webview:',
        'vscode:', 'vscode-web:', 'vscode-resource:'
      ].includes(urlObj.protocol);

  } catch (error) {
    result = true;
  }
  return result;
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function generateSelector(element: HTMLElement): { tag: string, index: number } | null {
  const blockTags = new Set([
    'DIV', 'P', 'PRE', 'BLOCKQUOTE',
    'UL', 'OL', 'DL',
    'TABLE', 'TR',
    'FIGURE',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6'
  ]);

  let current: HTMLElement | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    if (current.id) {
      return { tag: `#${CSS.escape(current.id)}`, index: -1 };
    }
    if (blockTags.has(current.tagName)) {
      const tag = current.tagName.toLowerCase();
      const allSameTags = Array.from(document.getElementsByTagName(tag));
      const index = allSameTags.indexOf(current);
      if (index !== -1) {
        return { tag, index };
      }
      break;
    }
    current = current.parentElement;
  }
  return null;
}

// String.formatUnicorn polyfill from https://stackoverflow.com/a/18234317
// @ts-ignore
String.prototype.formatUnicorn = String.prototype.formatUnicorn ||
  function () {
    "use strict";
    // @ts-ignore
    var str = this.toString();
    if (arguments.length) {
      var t = typeof arguments[0];
      var key;
      var args = ("string" === t || "number" === t) ? Array.prototype.slice.call(arguments) : arguments[0];
      for (key in args) {
        str = str.replace(new RegExp("\\{" + key + "\\}", "gi"), args[key]);
      }
    }
    return str;
  };
