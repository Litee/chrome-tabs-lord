/// <reference no-default-lib="true"/>
/// <reference path="../../typings/lib.es6.d.ts" />
/// <reference path="../../typings/browser.d.ts" />

import {log, debug, warn} from './util';

export class Model {
  private static ROOT_BOOKMARK_TITLE = 'TabsLord (DO NOT EDIT MANUALLY!)';
  private _persistTimer: any;
  private _windows = new Map<string, IMutableWindowModel>();
  private _tabs = new Map<string, ITabModel>();
  private static HIBERNATED_TAB_ID = -1;
  private static HIBERNATED_WINDOW_ID = -1;
  private _savedStateAsString: string;
  private _stateLoadedOnStart: IPersistentState;
  private _tabsLordRootBookmark: chrome.bookmarks.BookmarkTreeNode;


  constructor() {
    log('Initializing model...');
    this._savedStateAsString = localStorage.getItem('tabs-lord-state');
    if (this._savedStateAsString) {
      this._stateLoadedOnStart = JSON.parse(this._savedStateAsString);
      debug('State loaded from localStorage', this._stateLoadedOnStart);
    }
  }

  private getOrCreateRootBookmark(callback: IBookmarkTreeNodeCallback) {
    // TODO Gets broken if bookmark is removed while plugin is running
    if (this._tabsLordRootBookmark) {
      callback(this._tabsLordRootBookmark);
      return;
    }
    chrome.bookmarks.search({ title: Model.ROOT_BOOKMARK_TITLE }, bookmarks => {
      // TODO Edge case of duplicates
      if (bookmarks.length > 0) {
        this._tabsLordRootBookmark = bookmarks[0];
        debug('Found existing root bookmark', bookmarks);
        callback(bookmarks[0]);
      }
      else {
        debug('Could not find root bookmark, creating a new one...', bookmarks);
        chrome.bookmarks.create({
          title: Model.ROOT_BOOKMARK_TITLE
        }, rootBookmark => {
          callback(rootBookmark);
        });
      }
    });
  }

  private persist() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
    }
    this._persistTimer = setTimeout(() => {
      log('Saving state...');
      const state = {
        windows: Array.from(this._windows.values()).filter(windowModel => !windowModel.hibernated).map(windowModel => {
          const windowFirstTabModel = this.getTabsByWindowGuid(windowModel.windowGuid)[0];
          return Object.assign({firstTabUrl: windowFirstTabModel ? windowFirstTabModel.url : undefined}, windowModel);
        }),
        tabs: Array.from(this._tabs.values()).filter(tabModel => !tabModel.windowModel.hibernated).map(tabModel => {
          const persistentTabModel = {
            tabGuid: tabModel.tabGuid,
            windowGuid: tabModel.windowModel.windowGuid,
            icon: tabModel.icon,
            index: tabModel.index,
            url: tabModel.url,
            title: tabModel.title,
            favIconUrl: tabModel.favIconUrl
          };
          return persistentTabModel;
        })
      };

      const newStateAsString = JSON.stringify(state);
      if (newStateAsString !== this._savedStateAsString) {
        localStorage.setItem('tabs-lord-state', newStateAsString);
        this._savedStateAsString = newStateAsString;
        log('State saved', state);
      }

      // Save hibernated windows to bookmarks
      Array.from(this._windows.values()).filter(windowModel => windowModel.hibernated).forEach(windowModel => {
        this.getOrCreateWindowBookmark(windowModel, windowBookmark => {
          this.getTabsByWindowGuid(windowModel.windowGuid).forEach((tabModel, tabIndex) => {
        this.saveTabBookmark(windowBookmark.id, tabModel, tabIndex);
          });
        });
      });
    }, 500);
  }

  private getOrCreateWindowBookmark(windowModel: IWindowModel, callback: IBookmarkTreeNodeCallback) {
    this.getOrCreateRootBookmark(rootBookmark => {
      chrome.bookmarks.getChildren(rootBookmark.id, windowBookmarks => {
        const existingWindowBookmark = windowBookmarks ? windowBookmarks.find(windowBookmark => windowBookmark.title === windowModel.title) : undefined;
        if (existingWindowBookmark) {
          debug('Found existing window bookmark', existingWindowBookmark, windowModel);
          callback(existingWindowBookmark);
        }
        else {
          debug('Creating new window bookmark', windowModel, windowBookmarks);
          chrome.bookmarks.create({
          parentId: rootBookmark.id,
            title: windowModel.title
          }, windowBookmark => {
            callback(windowBookmark);
          });
        }
      });
    });
  }

  private deleteWindowBookmark(windowModel: IWindowModel) {
    this.getOrCreateRootBookmark(rootBookmark => {
      chrome.bookmarks.getChildren(rootBookmark.id, windowBookmarks => {
        const existingWindowBookmark = windowBookmarks ? windowBookmarks.find(windowBookmark => windowBookmark.title === windowModel.title) : undefined;
        if (existingWindowBookmark) {
          debug('Found window bookmark. Removing...', existingWindowBookmark, windowModel);
          chrome.bookmarks.removeTree(existingWindowBookmark.id);
        }
        else {
          debug('Could not find window bookmark. Nothing to delete.', windowModel, windowBookmarks);
        }
      });
    });
  }

  private saveTabBookmark(windowBookmarkId: string, tabModel: ITabModel, tabIndex: number) {
    chrome.bookmarks.getChildren(windowBookmarkId, tabBookmarks => {
      const existingTabBookmark = tabBookmarks ? tabBookmarks.find(tabBookmark => tabBookmark.url === tabModel.url) : undefined;
      if (!existingTabBookmark) {
        debug('Could not find existing tab bookmark, creating a new one', windowBookmarkId, tabModel, tabBookmarks);
        chrome.bookmarks.create({
          parentId: windowBookmarkId,
          title: tabModel.title,
          url: tabModel.url,
          index: tabIndex
        });
      }
    });
  }

  private deleteTabBookmark(tabModel: ITabModel) {
    this.getOrCreateRootBookmark(rootBookmark => {
      chrome.bookmarks.getChildren(rootBookmark.id, windowBookmarks => {
        const existingWindowBookmark = windowBookmarks ? windowBookmarks.find(windowBookmark => windowBookmark.title === tabModel.windowModel.title) : undefined;
        if (existingWindowBookmark) {
          debug('Found existing window bookmark. Looking to tab bookmark...', existingWindowBookmark, tabModel);
          chrome.bookmarks.getChildren(existingWindowBookmark.id, tabBookmarks => {
            const existingTabBookmark = tabBookmarks ? tabBookmarks.find(tabBookmark => tabBookmark.url === tabModel.url) : undefined;
            if (existingTabBookmark) {
              debug('Tab bookmark found. Removing...', existingTabBookmark, tabModel, tabBookmarks);
              chrome.bookmarks.remove(existingTabBookmark.id);
            }
          });
        }
      });
    });
  }

  public restoreHibernatedWindowsAndTabs(): void {
    this.getOrCreateRootBookmark(rootBookmark => {
      chrome.bookmarks.getChildren(rootBookmark.id, windowBookmarks => {
        if (windowBookmarks) {
          windowBookmarks.forEach(windowBookmark => {
            log('Restoring window from bookmarks', windowBookmark);
            const windowGuid = this.addWindowModel(undefined, Model.HIBERNATED_WINDOW_ID, windowBookmark.title, true);
            chrome.bookmarks.getChildren(windowBookmark.id, tabBookmarks => {
              if (tabBookmarks) {
                tabBookmarks.forEach(tabBookmark => {
                  log('Restoring tab from bookmarks', tabBookmark);
                  this.addTabModel(windowGuid, Model.HIBERNATED_TAB_ID, undefined, tabBookmark.title, 'chrome://favicon/' + tabBookmark.url, tabBookmark.url, 0, false, false);
                });
              }
            });
          });
        }
      });
    });
    if (this._stateLoadedOnStart && this._stateLoadedOnStart.windows) {
      const hibernatedWindowsFromPreviousSession = this._stateLoadedOnStart.windows.filter(windowModel => windowModel.hibernated);
      hibernatedWindowsFromPreviousSession.forEach((windowModel: IWindowModel) => {
        log('Restoring window from state', windowModel);
        this.addWindowModel(windowModel.windowGuid, Model.HIBERNATED_WINDOW_ID, windowModel.title, true);
      });
    }
    if (this._stateLoadedOnStart && this._stateLoadedOnStart.tabs) {
      this._stateLoadedOnStart.tabs.forEach(tabModel => {
        const windowModel = this.getWindowModelByGuid(tabModel.windowGuid);
        if (windowModel) {
          if (windowModel.hibernated) {
            log('Restoring tab from state', tabModel);
            this.addTabModel(windowModel.windowGuid, Model.HIBERNATED_TAB_ID, tabModel.tabGuid, tabModel.title, tabModel.icon, tabModel.url, tabModel.index, false, false);
          }
        }
      });
    }
  }

  private saveToHistory(tabModel: ITabModel) {
    const savedHistoryAsString = localStorage.getItem('tabs-lord-history');
    const history = savedHistoryAsString ? JSON.parse(savedHistoryAsString) : [];
    history.push(tabModel);
    while (history.length > 1000) { // Safeguard
      history.shift();
    }
    const newHistoryAsString = JSON.stringify(history);
    localStorage.setItem('tabs-lord-history', newHistoryAsString);
  }

  private normalizeUrlForDuplicatesFinding(url: string) {
    if (url) {
      let pos = url.indexOf('chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#uri=');
      if (pos === 0) {
        url = url.substring(71);
      }
      pos = url.indexOf('#');
      if (pos >= 0) {
        url = url.substring(0, pos);
      }
      pos = url.indexOf('http://');
      if (pos === 0) {
        url = url.substring(7);
      }
      pos = url.indexOf('https://');
      if (pos === 0) {
        url = url.substring(8);
      }
    }
    return url;
  }

  private isSnoozedUrl(url: string) {
    return url.indexOf('chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#uri=') === 0;
  }

  private generateGuid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  }

  private makeImmutable(obj: any) {
    if (obj) {
      const result = Object.assign({}, obj);
      Object.freeze(result);
      return result;
    }
  }

  public suggestWindowTitle(firstTabUrl: string): string {
    if (firstTabUrl && this._stateLoadedOnStart && this._stateLoadedOnStart.windows) {
      const bestMatch = this._stateLoadedOnStart.windows.find(windowModel  => windowModel.firstTabUrl === firstTabUrl && !windowModel.hibernated);
      if (bestMatch) {
        log('Window from previous session found', bestMatch);
        return bestMatch.title;
      }
    }
    return 'Window';
  }

  /**** Windows ****/

  public getWindowModelByGuid(windowGuid: string) : IWindowModel {
    const foundWindowModel = Array.from(this._windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
    return this.makeImmutable(foundWindowModel);
  }

  private getMutableWindowModelByGuid(windowGuid: string): IMutableWindowModel {
    return Array.from(this._windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
  }

  public getWindowModelById(windowId: number): IWindowModel {
    const foundWindowModel = Array.from(this._windows.values()).find(windowModel => windowModel.windowId === windowId);
    return this.makeImmutable(foundWindowModel);
  }

  public getWindowModels(): IWindowModel[] {
    return Array.from(this._windows.values()).map(windowModel => this.makeImmutable(windowModel));
  }

  public addWindowModel(windowGuid: string, windowId: number, windowTitle: string, isHibernated: boolean): string {
    const validWindowGuid = (windowGuid || this.generateGuid());
    const windowModel = new WindowModel(validWindowGuid, windowId, windowTitle, isHibernated || false);
    this._windows.set(validWindowGuid, windowModel);
    this.persist();
    $(document).trigger('tabsLord:windowAddedToModel', [windowModel]);
    return validWindowGuid;
  }

  public renameWindow(windowGuid: string, newTitle: string): void {
    const foundWindowModel = Array.from(this._windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
    if (foundWindowModel.hibernated) {
      this.getOrCreateWindowBookmark(foundWindowModel, windowBookmark => {
        chrome.bookmarks.update(windowBookmark.id, {title: newTitle});
      });
    }
    foundWindowModel.title = newTitle;
    this.persist();
  }

  public hibernateWindow(windowGuid: string, newTitle: string) {
    const foundWindowModel = Array.from(this._windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
    foundWindowModel.hibernated = true;
    this.persist();
  }

  public deleteWindowModel(windowGuid: string): void {
    const windowModel = this.getWindowModelByGuid(windowGuid);
    this._windows.delete(windowGuid);
    this._tabs.forEach(tabModel => {
    if (tabModel.windowModel.windowGuid === windowGuid) {
        this.deleteTabModel(tabModel.tabGuid);
      }
    });
    if (windowModel.hibernated) {
      this.deleteWindowBookmark(windowModel);
    }
    this.persist();
    $(document).trigger('tabsLord:windowRemovedFromModel', [windowModel]);
  }

  /**** Tabs ****/

  public getTabModelById(tabId: number): ITabModel {
    const foundTabModel = Array.from(this._tabs.values()).find(tabModel => tabModel.tabId === tabId);
    return this.makeImmutable(foundTabModel);
  }

  public getTabModelByGuid(tabGuid: string): ITabModel {
    const foundTabModel = Array.from(this._tabs.values()).find(tabModel => tabModel.tabGuid === tabGuid);
    return this.makeImmutable(foundTabModel);
  }

  private getMutableTabModelByGuid(tabGuid: string): ITabModel {
    return Array.from(this._tabs.values()).find(tabModel => tabModel.tabGuid === tabGuid);
  }

  public getTabModels(): ITabModel[] {
    return Array.from(this._tabs.values()).map(tabModel => this.makeImmutable(tabModel));
  }

  public getTabsByWindowGuid(windowGuid: string): ITabModel[] {
    return Array.from(this._tabs.values()).filter(tabModel => tabModel.windowModel.windowGuid === windowGuid).map(tabModel => this.makeImmutable(tabModel));
  }

  public getTabsCount(): number {
    return this._tabs.size;
  }

  public addTabModel(windowGuid: string, tabId: number, tabGuid: string, tabTitle: string, tabIcon: string, tabUrl: string, tabIndex: number, isTabSelected: boolean, isTabAudible: boolean): void {
    debug('Adding tab model', arguments);
    const windowModel = this.getMutableWindowModelByGuid(windowGuid);
    if (!windowModel) {
      warn('Could not find window model', windowGuid, this._windows);
      return;
    }
    const validTabGuid = tabGuid || this.generateGuid();
    const tabModel = new TabModel(validTabGuid, windowModel);
    tabModel.tabId = tabId;
    tabModel.title = tabTitle;
    tabModel.icon = tabIcon;
    tabModel.url = tabUrl;
    tabModel.index = tabIndex;
    tabModel.normalizedUrl = this.normalizeUrlForDuplicatesFinding(tabUrl);
    tabModel.selected = isTabSelected;
    tabModel.snoozed = tabUrl && this.isSnoozedUrl(tabUrl);
    tabModel.audible = isTabAudible;
    this._tabs.set(validTabGuid, tabModel);
    windowModel.incrementTabsCount();
    this.persist();
    $(document).trigger('tabsLord:tabAddedToModel', [tabModel]);
  }

  public updateTabModel(tabGuid: string, updateInfo: TabModelUpdateInfo): void {
    const tabModel = Array.from(this._tabs.values()).find(_tabModel => _tabModel.tabGuid === tabGuid);
    if (!tabModel) { // skipping tabs which are not tracked - e.g. Tabs Lord popup itself
      return;
    }
    if (updateInfo.url !== undefined) {
      tabModel.url = updateInfo.url;
      tabModel.normalizedUrl = this.normalizeUrlForDuplicatesFinding(tabModel.url);
      tabModel.snoozed = tabModel.url && this.isSnoozedUrl(tabModel.url);
    }
    if (updateInfo.title !== undefined) {
      tabModel.title = updateInfo.title;
    }
    if (updateInfo.favIconUrl !== undefined) {
      tabModel.favIconUrl = updateInfo.favIconUrl;
    }
    if (updateInfo.selected !== undefined) {
      tabModel.selected = updateInfo.selected;
    }
    this.persist();
  }

  public moveTabToAnotherWindow(tabGuid: string, targetWindowGuid: string, pos: number) {
    const tabModel = this.getMutableTabModelByGuid(tabGuid);
    const targetWindowModel = this.getMutableWindowModelByGuid(targetWindowGuid);
    (<IMutableWindowModel>tabModel.windowModel).decrementTabsCount();
    tabModel.windowModel = targetWindowModel;
    tabModel.index = pos;
    targetWindowModel.incrementTabsCount();
    this.persist();
    $(document).trigger('tabsLord:tabRemovedFromModel', [tabModel]);
    $(document).trigger('tabsLord:tabAddedToModel', [tabModel]);
  }

  public deleteTabModel(tabGuid: string): void {
    const tabModel = this.getTabModelByGuid(tabGuid);
    if (!tabModel) { // Can be deleted by async window deletion
      return;
    }
    (<IMutableWindowModel>tabModel.windowModel).decrementTabsCount();
    this.saveToHistory(tabModel);
    this._tabs.delete(tabGuid);
    if (tabModel.windowModel.hibernated) {
      this.deleteTabBookmark(tabModel);
    }
    this.persist();
    $(document).trigger('tabsLord:tabRemovedFromModel', [tabModel]);
  }

  public unselectAllTabs(): void {
    this._tabs.forEach(tabModel => {
      tabModel.selected = false;
    });
  }
}

export interface TabModelUpdateInfo {
  url?: string;
  title?: string;
  favIconUrl?: string;
  selected?: boolean;
}

export interface IWindowModel {
  windowGuid: string;
  windowId: number;
  hibernated: boolean;
  title: string;
  firstTabUrl: string;
  tabsCount: number;
}

interface IMutableWindowModel extends IWindowModel {
  incrementTabsCount(): void;
  decrementTabsCount(): void;
}

interface IPersistentWindowModel {
  windowGuid: string;
  hibernated: boolean;
  title: string;
  firstTabUrl: string;
}

class WindowModel implements IMutableWindowModel {
  windowGuid: string;
  windowId: number;
  hibernated: boolean;
  title: string;
  firstTabUrl: string;
  tabsCount: number = 0;

  constructor(windowGuid: string, windowId: number, windowTitle: string, hibernated: boolean) {
    this.windowGuid = windowGuid;
    this.windowId = windowId;
    this.title = windowTitle;
    this.hibernated = hibernated;
  }

  incrementTabsCount(): void {
    this.tabsCount++;
  }

  decrementTabsCount(): void {
    this.tabsCount--;
  }
}

export interface IPersistentTabModel {
  tabGuid: string;
  windowGuid: string;
  title: string;
  icon: string;
  index: number;
  url: string;
  favIconUrl: string;
}

export interface ITabModel {
  tabGuid: string;
  tabId: number;
  windowModel: IWindowModel;
  selected: boolean;
  title: string;
  icon: string;
  index: number;
  url: string;
  normalizedUrl: string;
  favIconUrl: string;
  snoozed: boolean;
  isHibernatedDeep(): boolean;
  audible: boolean;
}

class TabModel implements ITabModel {
  tabGuid: string;
  tabId: number;
  windowModel: IWindowModel;
  selected: boolean = false;
  title: string = '<Empty>';
  icon: string;
  index: number = 0;
  url: string;
  normalizedUrl: string;
  favIconUrl: string;
  snoozed: boolean = false;
  audible: boolean = false;

  constructor(tabGuid: string, windowModel: IWindowModel) {
    this.tabGuid = tabGuid;
    this.windowModel = windowModel;
  }

  public isHibernatedDeep(): boolean {
    return this.windowModel.hibernated;
  }
}

interface IPersistentState {
  windows: IPersistentWindowModel[];
  tabs: IPersistentTabModel[];
}

interface IBookmarkTreeNodeCallback {
  (bookmark: chrome.bookmarks.BookmarkTreeNode): void;
}