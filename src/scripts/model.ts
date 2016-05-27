/// <reference no-default-lib="true"/>
/// <reference path="../../typings/lib.es6.d.ts" />
/// <reference path="../../typings/index.d.ts" />

module models {

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
      logger.log('Initializing model...');
      this._savedStateAsString = localStorage.getItem('tabs-lord-state');
      if (this._savedStateAsString) {
        this._stateLoadedOnStart = JSON.parse(this._savedStateAsString);
        logger.debug('State loaded from localStorage', this._stateLoadedOnStart);
      }
    }

    private getOrCreateRootBookmark(callback: (bookmark: chrome.bookmarks.BookmarkTreeNode) => void) {
      // TODO Gets broken if bookmark is removed while plugin is running
      if (this._tabsLordRootBookmark) {
        callback(this._tabsLordRootBookmark);
        return;
      }
      chrome.bookmarks.search({ title: Model.ROOT_BOOKMARK_TITLE }, bookmarks => {
        // TODO Edge case of duplicates
        if (bookmarks.length > 0) {
          this._tabsLordRootBookmark = bookmarks[0];
          logger.debug('Found existing root bookmark', bookmarks);
          callback(bookmarks[0]);
        }
        else {
          logger.debug('Could not find root bookmark, creating a new one...', bookmarks);
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
        logger.log('Saving state...');
        const state = {
          windows: Array.from(this._windows.values()).filter(windowModel => !windowModel.hibernated).map(windowModel => {
            const windowFirstTabModel = this.getTabsByWindowGuid(windowModel.windowGuid)[0];
            return Object.assign({ firstTabUrl: windowFirstTabModel ? windowFirstTabModel.url : undefined }, windowModel);
          }),
          tabs: Array.from(this._tabs.values()).filter(tabModel => !tabModel.windowModel.hibernated).map(tabModel => {
            const persistentTabModel = {
              tabGuid: tabModel.tabGuid,
              windowGuid: tabModel.windowModel.windowGuid,
              favIconUrl: tabModel.favIconUrl,
              index: tabModel.index,
              url: tabModel.url,
              title: tabModel.title
            };
            return persistentTabModel;
          })
        };

        const newStateAsString = JSON.stringify(state);
        if (newStateAsString !== this._savedStateAsString) {
          localStorage.setItem('tabs-lord-state', newStateAsString);
          this._savedStateAsString = newStateAsString;
          logger.log('State saved', state);
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

    private getOrCreateWindowBookmark(windowModel: IWindowModel, callback: (bookmark: chrome.bookmarks.BookmarkTreeNode) => void) {
      this.getOrCreateRootBookmark(rootBookmark => {
        chrome.bookmarks.getChildren(rootBookmark.id, windowBookmarks => {
          const existingWindowBookmark = windowBookmarks ? windowBookmarks.find(windowBookmark => windowBookmark.title === windowModel.title) : undefined;
          if (existingWindowBookmark) {
            logger.debug('Found existing window bookmark', existingWindowBookmark, windowModel);
            callback(existingWindowBookmark);
          }
          else {
            logger.debug('Creating new window bookmark', windowModel, windowBookmarks);
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

    private deleteWindowBookmark(windowModel: IWindowModel, callback: () => void) {
      this.getOrCreateRootBookmark(rootBookmark => {
        chrome.bookmarks.getChildren(rootBookmark.id, windowBookmarks => {
          const existingWindowBookmark = windowBookmarks ? windowBookmarks.find(windowBookmark => windowBookmark.title === windowModel.title) : undefined;
          if (existingWindowBookmark) {
            logger.debug('Found window bookmark. Removing...', existingWindowBookmark, windowModel);
            chrome.bookmarks.removeTree(existingWindowBookmark.id);
          }
          else {
            logger.debug('Could not find window bookmark. Nothing to delete.', windowModel, windowBookmarks);
          }
        });
      });
    }

    private saveTabBookmark(windowBookmarkId: string, tabModel: ITabModel, tabIndex: number) {
      chrome.bookmarks.getChildren(windowBookmarkId, tabBookmarks => {
        const existingTabBookmark = tabBookmarks ? tabBookmarks.find(tabBookmark => tabBookmark.url === tabModel.url) : undefined;
        if (!existingTabBookmark) {
          logger.debug('Could not find existing tab bookmark, creating a new one', windowBookmarkId, tabModel, tabBookmarks);
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
            logger.debug('Found existing window bookmark. Looking to tab bookmark...', existingWindowBookmark, tabModel);
            chrome.bookmarks.getChildren(existingWindowBookmark.id, tabBookmarks => {
              const existingTabBookmark = tabBookmarks ? tabBookmarks.find(tabBookmark => tabBookmark.url === tabModel.url) : undefined;
              if (existingTabBookmark) {
                logger.debug('Tab bookmark found. Removing...', existingTabBookmark, tabModel, tabBookmarks);
                try {
                  chrome.bookmarks.remove(existingTabBookmark.id);
                }
                catch (err) {
                  console.warn(err);
                }
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
            windowBookmarks.sort((a, b) => a.title < b.title ? -1 : (a.title > b.title ? 1 : 0)).forEach(windowBookmark => {
              logger.log('Restoring window from bookmarks', windowBookmark);
              const windowGuid = this.addWindowModel(undefined, Model.HIBERNATED_WINDOW_ID, windowBookmark.title, true);
              chrome.bookmarks.getChildren(windowBookmark.id, tabBookmarks => {
                if (tabBookmarks) {
                  tabBookmarks.forEach(tabBookmark => {
                    logger.log('Restoring tab from bookmarks', tabBookmark);
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
          logger.log('Restoring window from state', windowModel);
          this.addWindowModel(windowModel.windowGuid, Model.HIBERNATED_WINDOW_ID, windowModel.title, true);
        });
      }
      if (this._stateLoadedOnStart && this._stateLoadedOnStart.tabs) {
        this._stateLoadedOnStart.tabs.forEach(tabModel => {
          const windowModel = this.getWindowModelByGuid(tabModel.windowGuid);
          if (windowModel) {
            if (windowModel.hibernated) {
              logger.log('Restoring tab from state', tabModel);
              this.addTabModel(windowModel.windowGuid, Model.HIBERNATED_TAB_ID, tabModel.tabGuid, tabModel.title, tabModel.favIconUrl, tabModel.url, tabModel.index, false, false);
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
        if (url.endsWith('/')) {
          url = url.substring(0, url.length - 1);
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
        const bestMatch = this._stateLoadedOnStart.windows.find(windowModel => windowModel.firstTabUrl === firstTabUrl && !windowModel.hibernated);
        if (bestMatch) {
          logger.log('Window from previous session found', bestMatch);
          return bestMatch.title;
        }
      }
      return 'Window';
    }

    /**** Windows ****/

    public getWindowModelByGuid(windowGuid: string): IWindowModel {
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
      if (this._currentSearchPattern.length > 0) {
        this.updateModelsFromCurrentSearchPattern();
      }
      this.persist();
      $(document).trigger('tabsLord:windowAddedToModel', [windowModel]);
      return validWindowGuid;
    }

    public renameWindow(windowGuid: string, newTitle: string, callback: () => void): void {
      const windowModelToRename = Array.from(this._windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
      if (windowModelToRename.hibernated) {
        this.getOrCreateWindowBookmark(windowModelToRename, windowBookmark => {
          chrome.bookmarks.update(windowBookmark.id, { title: newTitle }, () => {
            windowModelToRename.title = newTitle;
            this.persist();
            $(document).trigger('tabsLord:windowModelsUpdated', [{ models: [windowModelToRename] }]);
            callback();
          });
        });
      }
      else {
        windowModelToRename.title = newTitle;
        this.persist();
        $(document).trigger('tabsLord:windowModelsUpdated', [{ models: [windowModelToRename] }]);
        callback();
      }
    }

    public hibernateWindow(windowGuid: string, newTitle: string) {
      const foundWindowModel = Array.from(this._windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
      foundWindowModel.hibernated = true;
      this.persist();
    }

    public deleteWindowModel(windowGuid: string, callback: () => void): void {
      const windowModel = this.getWindowModelByGuid(windowGuid);
      this._windows.delete(windowGuid);
      this._tabs.forEach(tabModel => {
        if (tabModel.windowModel.windowGuid === windowGuid) {
          this.deleteTabModel(tabModel.tabGuid);
        }
      });
      if (windowModel.hibernated) {
        this.deleteWindowBookmark(windowModel, () => {
          this.persist();
          $(document).trigger('tabsLord:windowRemovedFromModel', [windowModel]);
          callback();
        });
      }
      else {
        this.persist();
        $(document).trigger('tabsLord:windowRemovedFromModel', [windowModel]);
        callback();
      }
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

    public addTabModel(windowGuid: string, tabId: number, tabGuid: string, tabTitle: string, tabFavIconUrl: string, tabUrl: string, tabIndex: number, isTabSelected: boolean, isTabAudible: boolean): void {
      logger.debug('Adding tab model', arguments);
      const windowModel = this.getMutableWindowModelByGuid(windowGuid);
      if (!windowModel) {
        logger.warn('Could not find window model', windowGuid, this._windows);
        return;
      }
      const validTabGuid = tabGuid || this.generateGuid();
      const tabModel = new TabModel(validTabGuid, windowModel);
      tabModel.tabId = tabId;
      tabModel.title = tabTitle || tabUrl;
      tabModel.favIconUrl = tabFavIconUrl;
      tabModel.url = tabUrl;
      tabModel.index = tabIndex;
      tabModel.normalizedUrl = this.normalizeUrlForDuplicatesFinding(tabUrl);
      tabModel.selected = isTabSelected;
      tabModel.snoozed = tabUrl && this.isSnoozedUrl(tabUrl);
      tabModel.audible = isTabAudible;
      tabModel.matchesFilter = this.tabMatchesCurrentFilter(tabModel);
      this._tabs.set(validTabGuid, tabModel);
      windowModel.incrementTabsCount();
      this.updateModelsFromCurrentSearchPattern();
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
        tabModel.title = updateInfo.title || updateInfo.url;
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
      const newMatchesFilterValue = this.tabMatchesCurrentFilter(tabModel);
      if (newMatchesFilterValue !== tabModel.matchesFilter) {
        tabModel.matchesFilter = newMatchesFilterValue;
        this.updateModelsFromCurrentSearchPattern();
      }
      this.persist();
      $(document).trigger('tabsLord:tabModelsUpdated', [{ models: [tabModel] }]);
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
      logger.debug('Deleting tab model', tabGuid);
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

    /*  public markTabModelAsNonDirty(tabGuid: string) {
      const tabModel = this.getTabModelByGuid(tabGuid);
      if (tabModel) {
        tabModel.dirty = false;
      }
      }*/

    public unselectAllTabs(): void {
      this._tabs.forEach(tabModel => {
        tabModel.selected = false;
      });
      $(document).trigger('tabsLord:tabModelsUpdated', [{ models: this.getTabModels() }]);
    }

    public selectTabsRange(windowGuid: string, start: number, end: number) {
      this.unselectAllTabs();
      for (let i = start; i <= end; i++) {
        const tabModelToSelect = Array.from(this._tabs.values()).find(tabModel => tabModel.index === i && tabModel.windowModel.windowGuid === windowGuid);
        if (tabModelToSelect) {
          tabModelToSelect.selected = true;
          $(document).trigger('tabsLord:tabModelsUpdated', [{ models: [this.makeImmutable(tabModelToSelect)] }]);
        }
      }
    }

    private _currentSearchPattern = '';
    public changeSearchPattern(searchPattern: string) {
      this._currentSearchPattern = searchPattern;
      this.updateModelsFromCurrentSearchPattern();
    }

    private updateModelsFromCurrentSearchPattern() {
      const dirtyTabModels: ITabModel[] = [];
      Array.from(this._windows.values()).forEach(windowModel => {
        windowModel.tabsToHide = 0;
      });
      Array.from(this._tabs.values()).forEach(tabModel => {
        if (this.tabMatchesCurrentFilter(tabModel)) { // showing as match
          if (!tabModel.matchesFilter) {
            tabModel.matchesFilter = true;
            dirtyTabModels.push(tabModel);
          }
        }
        else { // hiding as mismatch
          if (tabModel.matchesFilter) {
            tabModel.matchesFilter = false;
            dirtyTabModels.push(tabModel);
          }
          tabModel.windowModel.tabsToHide++;
        }
      });
      $(document).trigger('tabsLord:tabModelsUpdated', [{ models: dirtyTabModels.map(tabModel => this.makeImmutable(tabModel)) }]);
      $(document).trigger('tabsLord:windowModelsUpdated', [{ models: this.getWindowModels() }]); // TODO: Slightly suboptimal - should be fixed once dirty flag will migrate into model
    }

    private tabMatchesCurrentFilter(tabModel: ITabModel): boolean {
      return this._currentSearchPattern.length === 0 || (tabModel.title && tabModel.title.toLowerCase().indexOf(this._currentSearchPattern) >= 0) || (tabModel.url && tabModel.url.toLowerCase().indexOf(this._currentSearchPattern) >= 0);
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
    tabsToHide: number;
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
    tabsToHide: number = 0;

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
    index: number;
    url: string;
    normalizedUrl: string;
    favIconUrl: string;
    snoozed: boolean;
    isHibernatedDeep(): boolean;
    audible: boolean;
    matchesFilter: boolean;
  }

  class TabModel implements ITabModel {
    tabGuid: string;
    tabId: number;
    windowModel: IWindowModel;
    selected: boolean = false;
    title: string = '<Empty>';
    index: number = 0;
    url: string;
    normalizedUrl: string;
    favIconUrl: string;
    snoozed: boolean = false;
    audible: boolean = false;
    matchesFilter: boolean = true;

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

}
