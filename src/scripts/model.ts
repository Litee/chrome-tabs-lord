/// <reference no-default-lib="true"/>
/// <reference path="../../typings/lib.es6.d.ts" />
/// <reference path="../../typings/browser.d.ts" />

import {log, debug, warn} from './util';

export class Model {
  private _persistTimer: any;
  private _windows = new Map<string, IWindowModel>();
  private _tabs = new Map<string, ITabModel>();
  private static HIBERNATED_TAB_ID = -1;
  private static HIBERNATED_WINDOW_ID = -1;
  private _savedStateAsString: string;
  private _stateLoadedOnStart: IPersistentState;

  constructor() {
    log('Initializing model...');

    this._savedStateAsString = localStorage.getItem('tabs-lord-state');
    if (this._savedStateAsString) {
      this._stateLoadedOnStart = JSON.parse(this._savedStateAsString);
      debug('State loaded from localStorage', this._stateLoadedOnStart);
    }
  }

  private persist() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
    }
    this._persistTimer = setTimeout(() => {
      log('Saving state...');
      const state = {
        windows: Array.from(this._windows.values()).map(windowModel => {
          const windowFirstTabModel = this.getTabsByWindowGuid(windowModel.windowGuid)[0];
          return Object.assign({firstTabUrl: windowFirstTabModel ? windowFirstTabModel.url : undefined}, windowModel);
        }),
        tabs: Array.from(this._tabs.values())
      };
      const newStateAsString = JSON.stringify(state);
      if (newStateAsString !== this._savedStateAsString) {
        localStorage.setItem('tabs-lord-state', newStateAsString);
        this._savedStateAsString = newStateAsString;
        log('State saved', state);
      }
    }, 500);
  }

  public restoreHibernatedWindowsAndTabs() {
    if (this._stateLoadedOnStart && this._stateLoadedOnStart.windows) {
      const hibernatedWindowsFromPreviousSession = this._stateLoadedOnStart.windows.filter(windowModel => windowModel.hibernated);
      hibernatedWindowsFromPreviousSession.forEach((windowModel: IWindowModel) => {
        log('Restoring window from state', windowModel);
        this.addWindowModel(windowModel.windowGuid, Model.HIBERNATED_WINDOW_ID, windowModel.title, true);
      });
    }
    if (this._stateLoadedOnStart && this._stateLoadedOnStart.tabs) {
      this._stateLoadedOnStart.tabs.forEach((tabModel: ITabModel) => {
        const windowModel = this.getWindowModelByGuid(tabModel.windowGuid);
        if (windowModel) {
          if (windowModel.hibernated) {
            log('Restoring tab from state', tabModel);
            this.addTabModel(tabModel.windowId, tabModel.windowGuid, Model.HIBERNATED_TAB_ID, tabModel.tabGuid, tabModel.title, tabModel.icon, tabModel.url, tabModel.index, false, false);
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

  private isHibernatedUrl(url: string) {
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

  public suggestWindowTitle(firstTabUrl: string) {
    if (firstTabUrl && this._stateLoadedOnStart && this._stateLoadedOnStart.windows) {
      const bestMatch = this._stateLoadedOnStart.windows.find((windowModel:IWindowModel) => windowModel.firstTabUrl === firstTabUrl && !windowModel.hibernated);
      if (bestMatch) {
        log('Window from previous session found', bestMatch);
        return bestMatch.title;
      }
    }
    return 'Window';
  }

  /**** Windows ****/

  public getWindowModelById(windowId: number) {
    const foundWindowModel = Array.from(this._windows.values()).find(windowModel => windowModel.windowId === windowId);
    return this.makeImmutable(foundWindowModel);
  }

  public getWindowModelByGuid(windowGuid: string) {
    const foundWindowModel = Array.from(this._windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
    return this.makeImmutable(foundWindowModel);
  }

  public getWindowModels() {
    return Array.from(this._windows.values()).map(windowModel => this.makeImmutable(windowModel));
  }

  public addWindowModel(windowGuid: string, windowId: number, windowTitle: string, isHibernated: boolean) {
    const validWindowGuid = (windowGuid || this.generateGuid());
    const windowModel = new WindowModel(validWindowGuid, windowId, windowTitle, isHibernated || false);
    this._windows.set(validWindowGuid, windowModel);
    this.persist();
    $(document).trigger('tabsLord:windowAddedToModel', [windowModel]);
  }

  public updateWindowModel(windowGuid: string, updateInfo: IWindowModelUpdateInfo) {
    const foundWindowModel = Array.from(this._windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
    if (updateInfo.title) {
      foundWindowModel.title = updateInfo.title;
    }
    if (updateInfo.hibernated !== undefined) {
      foundWindowModel.hibernated = true;
    }
    if (updateInfo.windowId !== undefined) {
      foundWindowModel.windowId = updateInfo.windowId;
    }
    this.persist();
  }

  public deleteWindowModel(windowGuid: string) {
    const windowModel = this.getWindowModelByGuid(windowGuid);
    this._windows.delete(windowGuid);
    this._tabs.forEach(tabModel => {
      if (tabModel.windowGuid === windowGuid) {
        this.deleteTabModel(tabModel.tabGuid);
      }
    });
    this.persist();
    $(document).trigger('tabsLord:windowRemovedFromModel', [windowModel]);
  }

  /**** Tabs ****/

  public getTabModelById(tabId: number) {
    const foundTabModel = Array.from(this._tabs.values()).find(tabModel => tabModel.tabId === tabId);
    return this.makeImmutable(foundTabModel);
  }

  public getTabModelByGuid(tabGuid: string) {
    const foundTabModel = Array.from(this._tabs.values()).find(tabModel => tabModel.tabGuid === tabGuid);
    return this.makeImmutable(foundTabModel);
  }

  public getTabModels() {
    return Array.from(this._tabs.values()).map(tabModel => this.makeImmutable(tabModel));
  }

  public getTabsByWindowGuid(windowGuid: string) {
    return Array.from(this._tabs.values()).filter(tabModel => tabModel.windowGuid === windowGuid).map(tabModel => this.makeImmutable(tabModel));
  }

  public getTabsCount() {
    return this._tabs.size;
  }

  public addTabModel(windowId: number, windowGuid: string, tabId: number, tabGuid: string, tabTitle: string, tabIcon: string, tabUrl: string, tabIndex: number, isTabSelected: boolean, isTabAudible: boolean) {
    debug('Adding tab model', arguments);
    const validTabGuid = tabGuid || this.generateGuid();
    const tabModel = new TabModel(validTabGuid, windowGuid);
    tabModel.windowId = windowId;
    tabModel.tabId = tabId;
    tabModel.title = tabTitle;
    tabModel.icon = tabIcon;
    tabModel.url = tabUrl;
    tabModel.index = tabIndex;
    tabModel.normalizedUrl = this.normalizeUrlForDuplicatesFinding(tabUrl);
    tabModel.selected = isTabSelected;
    tabModel.hibernated = tabUrl && this.isHibernatedUrl(tabUrl);
    tabModel.audible = isTabAudible;
    this._tabs.set(validTabGuid, tabModel);
    const windowModel = Array.from(this._windows.values()).find(_windowModel => _windowModel.windowGuid === windowGuid);
    windowModel.tabsCount = (windowModel.tabsCount || 0) + 1;
    this.persist();
    $(document).trigger('tabsLord:tabAddedToModel', [tabModel]);
  }

  public updateTabModel(tabGuid: string, updateInfo: any) {
    const tabModel = Array.from(this._tabs.values()).find(_tabModel => _tabModel.tabGuid === tabGuid);
    if (!tabModel) { // skipping tabs which are not tracked - e.g. Tabs Lord popup itself
      return;
    }
    if (updateInfo.url) {
      tabModel.url = updateInfo.url;
      tabModel.normalizedUrl = this.normalizeUrlForDuplicatesFinding(tabModel.url);
      tabModel.hibernated = tabModel.url && this.isHibernatedUrl(tabModel.url);
    }
    if (updateInfo.title) {
      tabModel.title = updateInfo.title;
    }
    if (updateInfo.favIconUrl) {
      tabModel.favIconUrl = updateInfo.favIconUrl;
    }
    if (updateInfo.selected !== undefined) {
      tabModel.selected = updateInfo.selected;
    }
    if (updateInfo.windowId) {
      tabModel.windowId = updateInfo.windowId;
    }
    this.persist();
  }

  public deleteTabModel(tabGuid: string) {
    const tabModel = this.getTabModelByGuid(tabGuid);
    if (!tabModel) { // Can be deleted by async window deletion
      return;
    }
    const windowModel = this._windows.get(tabModel.windowGuid);
    if (windowModel) { // Can be delelted by async window deletion
      windowModel.tabsCount = (windowModel.tabsCount || 0) - 1;
    }
    this.saveToHistory(tabModel);
    this._tabs.delete(tabGuid);
    this.persist();
  }

  public unselectAllTabs() {
    this._tabs.forEach(tabModel => {
      tabModel.selected = false;
    });
  }
}

export interface IWindowModelUpdateInfo {
  windowId?: number;
  title?: string;
  hibernated?: boolean;
}

export interface TabModelUpdateInfo {
  url?: string;
  title?: string;
  favIconUrl?: string;
}

export interface IWindowModel {
  windowGuid: string;
  windowId: number;
  hibernated: boolean;
  title: string;
  firstTabUrl: string;
  tabsCount: number;
}

class WindowModel implements IWindowModel {
  windowGuid: string;
  windowId: number;
  hibernated: boolean;
  title: string;
  firstTabUrl: string;
  tabsCount: number;

  constructor(windowGuid: string, windowId: number, windowTitle: string, hibernated: boolean) {
    this.windowGuid = windowGuid;
    this.windowId = windowId;
    this.title = windowTitle;
    this.hibernated = hibernated;
  }
}

export interface ITabModel {
  tabGuid: string;
  tabId: number;
  windowGuid: string;
  windowId: number;
  selected: boolean;
  title: string;
  icon: string;
  index: number;
  url: string;
  normalizedUrl: string;
  favIconUrl: string;
  hibernated: boolean;
  audible: boolean;
}

interface IPersistentState {
  windows: IWindowModel[];
  tabs: ITabModel[];
}

class TabModel implements ITabModel {
  tabGuid: string;
  tabId: number;
  windowGuid: string;
  windowId: number;
  selected: boolean = false;
  title: string;
  icon: string;
  index: number;
  url: string;
  normalizedUrl: string;
  favIconUrl: string;
  hibernated: boolean = false;
  audible: boolean = false;

  constructor(tabGuid: string, windowGuid: string) {
    this.tabGuid = tabGuid;
    this.windowGuid = windowGuid;
  }
}