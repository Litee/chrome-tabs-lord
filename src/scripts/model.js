/// <reference no-default-lib="true"/>
/// <reference path="../../typings/lib.es6.d.ts" />
/// <reference path="../../typings/browser.d.ts" />
"use strict";
var util_1 = require('./util');
var Model = (function () {
    function Model() {
        this._windows = new Map();
        this._tabs = new Map();
        this._currentSearchPattern = '';
        util_1.log('Initializing model...');
        this._savedStateAsString = localStorage.getItem('tabs-lord-state');
        if (this._savedStateAsString) {
            this._stateLoadedOnStart = JSON.parse(this._savedStateAsString);
            util_1.debug('State loaded from localStorage', this._stateLoadedOnStart);
        }
    }
    Model.prototype.getOrCreateRootBookmark = function (callback) {
        var _this = this;
        // TODO Gets broken if bookmark is removed while plugin is running
        if (this._tabsLordRootBookmark) {
            callback(this._tabsLordRootBookmark);
            return;
        }
        chrome.bookmarks.search({ title: Model.ROOT_BOOKMARK_TITLE }, function (bookmarks) {
            // TODO Edge case of duplicates
            if (bookmarks.length > 0) {
                _this._tabsLordRootBookmark = bookmarks[0];
                util_1.debug('Found existing root bookmark', bookmarks);
                callback(bookmarks[0]);
            }
            else {
                util_1.debug('Could not find root bookmark, creating a new one...', bookmarks);
                chrome.bookmarks.create({
                    title: Model.ROOT_BOOKMARK_TITLE
                }, function (rootBookmark) {
                    callback(rootBookmark);
                });
            }
        });
    };
    Model.prototype.persist = function () {
        var _this = this;
        if (this._persistTimer) {
            clearTimeout(this._persistTimer);
        }
        this._persistTimer = setTimeout(function () {
            util_1.log('Saving state...');
            var state = {
                windows: Array.from(_this._windows.values()).filter(function (windowModel) { return !windowModel.hibernated; }).map(function (windowModel) {
                    var windowFirstTabModel = _this.getTabsByWindowGuid(windowModel.windowGuid)[0];
                    return Object.assign({ firstTabUrl: windowFirstTabModel ? windowFirstTabModel.url : undefined }, windowModel);
                }),
                tabs: Array.from(_this._tabs.values()).filter(function (tabModel) { return !tabModel.windowModel.hibernated; }).map(function (tabModel) {
                    var persistentTabModel = {
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
            var newStateAsString = JSON.stringify(state);
            if (newStateAsString !== _this._savedStateAsString) {
                localStorage.setItem('tabs-lord-state', newStateAsString);
                _this._savedStateAsString = newStateAsString;
                util_1.log('State saved', state);
            }
            // Save hibernated windows to bookmarks
            Array.from(_this._windows.values()).filter(function (windowModel) { return windowModel.hibernated; }).forEach(function (windowModel) {
                _this.getOrCreateWindowBookmark(windowModel, function (windowBookmark) {
                    _this.getTabsByWindowGuid(windowModel.windowGuid).forEach(function (tabModel, tabIndex) {
                        _this.saveTabBookmark(windowBookmark.id, tabModel, tabIndex);
                    });
                });
            });
        }, 500);
    };
    Model.prototype.getOrCreateWindowBookmark = function (windowModel, callback) {
        this.getOrCreateRootBookmark(function (rootBookmark) {
            chrome.bookmarks.getChildren(rootBookmark.id, function (windowBookmarks) {
                var existingWindowBookmark = windowBookmarks ? windowBookmarks.find(function (windowBookmark) { return windowBookmark.title === windowModel.title; }) : undefined;
                if (existingWindowBookmark) {
                    util_1.debug('Found existing window bookmark', existingWindowBookmark, windowModel);
                    callback(existingWindowBookmark);
                }
                else {
                    util_1.debug('Creating new window bookmark', windowModel, windowBookmarks);
                    chrome.bookmarks.create({
                        parentId: rootBookmark.id,
                        title: windowModel.title
                    }, function (windowBookmark) {
                        callback(windowBookmark);
                    });
                }
            });
        });
    };
    Model.prototype.deleteWindowBookmark = function (windowModel) {
        this.getOrCreateRootBookmark(function (rootBookmark) {
            chrome.bookmarks.getChildren(rootBookmark.id, function (windowBookmarks) {
                var existingWindowBookmark = windowBookmarks ? windowBookmarks.find(function (windowBookmark) { return windowBookmark.title === windowModel.title; }) : undefined;
                if (existingWindowBookmark) {
                    util_1.debug('Found window bookmark. Removing...', existingWindowBookmark, windowModel);
                    chrome.bookmarks.removeTree(existingWindowBookmark.id);
                }
                else {
                    util_1.debug('Could not find window bookmark. Nothing to delete.', windowModel, windowBookmarks);
                }
            });
        });
    };
    Model.prototype.saveTabBookmark = function (windowBookmarkId, tabModel, tabIndex) {
        chrome.bookmarks.getChildren(windowBookmarkId, function (tabBookmarks) {
            var existingTabBookmark = tabBookmarks ? tabBookmarks.find(function (tabBookmark) { return tabBookmark.url === tabModel.url; }) : undefined;
            if (!existingTabBookmark) {
                util_1.debug('Could not find existing tab bookmark, creating a new one', windowBookmarkId, tabModel, tabBookmarks);
                chrome.bookmarks.create({
                    parentId: windowBookmarkId,
                    title: tabModel.title,
                    url: tabModel.url,
                    index: tabIndex
                });
            }
        });
    };
    Model.prototype.deleteTabBookmark = function (tabModel) {
        this.getOrCreateRootBookmark(function (rootBookmark) {
            chrome.bookmarks.getChildren(rootBookmark.id, function (windowBookmarks) {
                var existingWindowBookmark = windowBookmarks ? windowBookmarks.find(function (windowBookmark) { return windowBookmark.title === tabModel.windowModel.title; }) : undefined;
                if (existingWindowBookmark) {
                    util_1.debug('Found existing window bookmark. Looking to tab bookmark...', existingWindowBookmark, tabModel);
                    chrome.bookmarks.getChildren(existingWindowBookmark.id, function (tabBookmarks) {
                        var existingTabBookmark = tabBookmarks ? tabBookmarks.find(function (tabBookmark) { return tabBookmark.url === tabModel.url; }) : undefined;
                        if (existingTabBookmark) {
                            util_1.debug('Tab bookmark found. Removing...', existingTabBookmark, tabModel, tabBookmarks);
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
    };
    Model.prototype.restoreHibernatedWindowsAndTabs = function () {
        var _this = this;
        this.getOrCreateRootBookmark(function (rootBookmark) {
            chrome.bookmarks.getChildren(rootBookmark.id, function (windowBookmarks) {
                if (windowBookmarks) {
                    windowBookmarks.sort(function (a, b) { return a.title < b.title ? -1 : (a.title > b.title ? 1 : 0); }).forEach(function (windowBookmark) {
                        util_1.log('Restoring window from bookmarks', windowBookmark);
                        var windowGuid = _this.addWindowModel(undefined, Model.HIBERNATED_WINDOW_ID, windowBookmark.title, true);
                        chrome.bookmarks.getChildren(windowBookmark.id, function (tabBookmarks) {
                            if (tabBookmarks) {
                                tabBookmarks.forEach(function (tabBookmark) {
                                    util_1.log('Restoring tab from bookmarks', tabBookmark);
                                    _this.addTabModel(windowGuid, Model.HIBERNATED_TAB_ID, undefined, tabBookmark.title, 'chrome://favicon/' + tabBookmark.url, tabBookmark.url, 0, false, false);
                                });
                            }
                        });
                    });
                }
            });
        });
        if (this._stateLoadedOnStart && this._stateLoadedOnStart.windows) {
            var hibernatedWindowsFromPreviousSession = this._stateLoadedOnStart.windows.filter(function (windowModel) { return windowModel.hibernated; });
            hibernatedWindowsFromPreviousSession.forEach(function (windowModel) {
                util_1.log('Restoring window from state', windowModel);
                _this.addWindowModel(windowModel.windowGuid, Model.HIBERNATED_WINDOW_ID, windowModel.title, true);
            });
        }
        if (this._stateLoadedOnStart && this._stateLoadedOnStart.tabs) {
            this._stateLoadedOnStart.tabs.forEach(function (tabModel) {
                var windowModel = _this.getWindowModelByGuid(tabModel.windowGuid);
                if (windowModel) {
                    if (windowModel.hibernated) {
                        util_1.log('Restoring tab from state', tabModel);
                        _this.addTabModel(windowModel.windowGuid, Model.HIBERNATED_TAB_ID, tabModel.tabGuid, tabModel.title, tabModel.favIconUrl, tabModel.url, tabModel.index, false, false);
                    }
                }
            });
        }
    };
    Model.prototype.saveToHistory = function (tabModel) {
        var savedHistoryAsString = localStorage.getItem('tabs-lord-history');
        var history = savedHistoryAsString ? JSON.parse(savedHistoryAsString) : [];
        history.push(tabModel);
        while (history.length > 1000) {
            history.shift();
        }
        var newHistoryAsString = JSON.stringify(history);
        localStorage.setItem('tabs-lord-history', newHistoryAsString);
    };
    Model.prototype.normalizeUrlForDuplicatesFinding = function (url) {
        if (url) {
            var pos = url.indexOf('chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#uri=');
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
    };
    Model.prototype.isSnoozedUrl = function (url) {
        return url.indexOf('chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#uri=') === 0;
    };
    Model.prototype.generateGuid = function () {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    };
    Model.prototype.makeImmutable = function (obj) {
        if (obj) {
            var result = Object.assign({}, obj);
            Object.freeze(result);
            return result;
        }
    };
    Model.prototype.suggestWindowTitle = function (firstTabUrl) {
        if (firstTabUrl && this._stateLoadedOnStart && this._stateLoadedOnStart.windows) {
            var bestMatch = this._stateLoadedOnStart.windows.find(function (windowModel) { return windowModel.firstTabUrl === firstTabUrl && !windowModel.hibernated; });
            if (bestMatch) {
                util_1.log('Window from previous session found', bestMatch);
                return bestMatch.title;
            }
        }
        return 'Window';
    };
    /**** Windows ****/
    Model.prototype.getWindowModelByGuid = function (windowGuid) {
        var foundWindowModel = Array.from(this._windows.values()).find(function (windowModel) { return windowModel.windowGuid === windowGuid; });
        return this.makeImmutable(foundWindowModel);
    };
    Model.prototype.getMutableWindowModelByGuid = function (windowGuid) {
        return Array.from(this._windows.values()).find(function (windowModel) { return windowModel.windowGuid === windowGuid; });
    };
    Model.prototype.getWindowModelById = function (windowId) {
        var foundWindowModel = Array.from(this._windows.values()).find(function (windowModel) { return windowModel.windowId === windowId; });
        return this.makeImmutable(foundWindowModel);
    };
    Model.prototype.getWindowModels = function () {
        var _this = this;
        return Array.from(this._windows.values()).map(function (windowModel) { return _this.makeImmutable(windowModel); });
    };
    Model.prototype.addWindowModel = function (windowGuid, windowId, windowTitle, isHibernated) {
        var validWindowGuid = (windowGuid || this.generateGuid());
        var windowModel = new WindowModel(validWindowGuid, windowId, windowTitle, isHibernated || false);
        this._windows.set(validWindowGuid, windowModel);
        if (this._currentSearchPattern.length > 0) {
            this.updateModelsFromCurrentSearchPattern();
        }
        this.persist();
        $(document).trigger('tabsLord:windowAddedToModel', [windowModel]);
        return validWindowGuid;
    };
    Model.prototype.renameWindow = function (windowGuid, newTitle) {
        var _this = this;
        var windowModelToRename = Array.from(this._windows.values()).find(function (windowModel) { return windowModel.windowGuid === windowGuid; });
        if (windowModelToRename.hibernated) {
            this.getOrCreateWindowBookmark(windowModelToRename, function (windowBookmark) {
                chrome.bookmarks.update(windowBookmark.id, { title: newTitle }, function () {
                    windowModelToRename.title = newTitle;
                    _this.persist();
                    $(document).trigger('tabsLord:windowModelsUpdated', [{ models: [windowModelToRename] }]);
                });
            });
        }
        else {
            windowModelToRename.title = newTitle;
            this.persist();
            $(document).trigger('tabsLord:windowModelsUpdated', [{ models: [windowModelToRename] }]);
        }
    };
    Model.prototype.hibernateWindow = function (windowGuid, newTitle) {
        var foundWindowModel = Array.from(this._windows.values()).find(function (windowModel) { return windowModel.windowGuid === windowGuid; });
        foundWindowModel.hibernated = true;
        this.persist();
    };
    Model.prototype.deleteWindowModel = function (windowGuid) {
        var _this = this;
        var windowModel = this.getWindowModelByGuid(windowGuid);
        this._windows.delete(windowGuid);
        this._tabs.forEach(function (tabModel) {
            if (tabModel.windowModel.windowGuid === windowGuid) {
                _this.deleteTabModel(tabModel.tabGuid);
            }
        });
        if (windowModel.hibernated) {
            this.deleteWindowBookmark(windowModel);
        }
        this.persist();
        $(document).trigger('tabsLord:windowRemovedFromModel', [windowModel]);
    };
    /**** Tabs ****/
    Model.prototype.getTabModelById = function (tabId) {
        var foundTabModel = Array.from(this._tabs.values()).find(function (tabModel) { return tabModel.tabId === tabId; });
        return this.makeImmutable(foundTabModel);
    };
    Model.prototype.getTabModelByGuid = function (tabGuid) {
        var foundTabModel = Array.from(this._tabs.values()).find(function (tabModel) { return tabModel.tabGuid === tabGuid; });
        return this.makeImmutable(foundTabModel);
    };
    Model.prototype.getMutableTabModelByGuid = function (tabGuid) {
        return Array.from(this._tabs.values()).find(function (tabModel) { return tabModel.tabGuid === tabGuid; });
    };
    Model.prototype.getTabModels = function () {
        var _this = this;
        return Array.from(this._tabs.values()).map(function (tabModel) { return _this.makeImmutable(tabModel); });
    };
    Model.prototype.getTabsByWindowGuid = function (windowGuid) {
        var _this = this;
        return Array.from(this._tabs.values()).filter(function (tabModel) { return tabModel.windowModel.windowGuid === windowGuid; }).map(function (tabModel) { return _this.makeImmutable(tabModel); });
    };
    Model.prototype.getTabsCount = function () {
        return this._tabs.size;
    };
    Model.prototype.addTabModel = function (windowGuid, tabId, tabGuid, tabTitle, tabFavIconUrl, tabUrl, tabIndex, isTabSelected, isTabAudible) {
        util_1.debug('Adding tab model', arguments);
        var windowModel = this.getMutableWindowModelByGuid(windowGuid);
        if (!windowModel) {
            util_1.warn('Could not find window model', windowGuid, this._windows);
            return;
        }
        var validTabGuid = tabGuid || this.generateGuid();
        var tabModel = new TabModel(validTabGuid, windowModel);
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
        this.persist();
        $(document).trigger('tabsLord:tabAddedToModel', [tabModel]);
    };
    Model.prototype.updateTabModel = function (tabGuid, updateInfo) {
        var tabModel = Array.from(this._tabs.values()).find(function (_tabModel) { return _tabModel.tabGuid === tabGuid; });
        if (!tabModel) {
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
        var newMatchesFilterValue = this.tabMatchesCurrentFilter(tabModel);
        if (newMatchesFilterValue !== tabModel.matchesFilter) {
            tabModel.matchesFilter = newMatchesFilterValue;
            this.updateModelsFromCurrentSearchPattern();
        }
        this.persist();
        $(document).trigger('tabsLord:tabModelsUpdated', [{ models: [tabModel] }]);
    };
    Model.prototype.moveTabToAnotherWindow = function (tabGuid, targetWindowGuid, pos) {
        var tabModel = this.getMutableTabModelByGuid(tabGuid);
        var targetWindowModel = this.getMutableWindowModelByGuid(targetWindowGuid);
        tabModel.windowModel.decrementTabsCount();
        tabModel.windowModel = targetWindowModel;
        tabModel.index = pos;
        targetWindowModel.incrementTabsCount();
        this.persist();
        $(document).trigger('tabsLord:tabRemovedFromModel', [tabModel]);
        $(document).trigger('tabsLord:tabAddedToModel', [tabModel]);
    };
    Model.prototype.deleteTabModel = function (tabGuid) {
        var tabModel = this.getTabModelByGuid(tabGuid);
        if (!tabModel) {
            return;
        }
        tabModel.windowModel.decrementTabsCount();
        this.saveToHistory(tabModel);
        this._tabs.delete(tabGuid);
        if (tabModel.windowModel.hibernated) {
            this.deleteTabBookmark(tabModel);
        }
        this.persist();
        $(document).trigger('tabsLord:tabRemovedFromModel', [tabModel]);
    };
    /*  public markTabModelAsNonDirty(tabGuid: string) {
        const tabModel = this.getTabModelByGuid(tabGuid);
        if (tabModel) {
          tabModel.dirty = false;
        }
      }*/
    Model.prototype.unselectAllTabs = function () {
        this._tabs.forEach(function (tabModel) {
            tabModel.selected = false;
        });
        $(document).trigger('tabsLord:tabModelsUpdated', [{ models: this.getTabModels() }]);
    };
    Model.prototype.selectTabsRange = function (windowGuid, start, end) {
        this.unselectAllTabs();
        var _loop_1 = function(i) {
            var tabModelToSelect = Array.from(this_1._tabs.values()).find(function (tabModel) { return tabModel.index === i && tabModel.windowModel.windowGuid === windowGuid; });
            if (tabModelToSelect) {
                tabModelToSelect.selected = true;
                $(document).trigger('tabsLord:tabModelsUpdated', [{ models: [this_1.makeImmutable(tabModelToSelect)] }]);
            }
        };
        var this_1 = this;
        for (var i = start; i <= end; i++) {
            _loop_1(i);
        }
    };
    Model.prototype.changeSearchPattern = function (searchPattern) {
        this._currentSearchPattern = searchPattern;
        this.updateModelsFromCurrentSearchPattern();
    };
    Model.prototype.updateModelsFromCurrentSearchPattern = function () {
        var _this = this;
        var dirtyTabModels = [];
        Array.from(this._windows.values()).forEach(function (windowModel) {
            windowModel.tabsToHide = 0;
        });
        Array.from(this._tabs.values()).forEach(function (tabModel) {
            if (_this.tabMatchesCurrentFilter(tabModel)) {
                if (!tabModel.matchesFilter) {
                    tabModel.matchesFilter = true;
                    dirtyTabModels.push(tabModel);
                }
            }
            else {
                if (tabModel.matchesFilter) {
                    tabModel.matchesFilter = false;
                    dirtyTabModels.push(tabModel);
                }
                tabModel.windowModel.tabsToHide++;
            }
        });
        $(document).trigger('tabsLord:tabModelsUpdated', [{ models: dirtyTabModels.map(function (tabModel) { return _this.makeImmutable(tabModel); }) }]);
        $(document).trigger('tabsLord:windowModelsUpdated', [{ models: this.getWindowModels() }]); // TODO: Slightly suboptimal - should be fixed once dirty flag will migrate into model
    };
    Model.prototype.tabMatchesCurrentFilter = function (tabModel) {
        return this._currentSearchPattern.length === 0 || (tabModel.title && tabModel.title.toLowerCase().indexOf(this._currentSearchPattern) >= 0) || (tabModel.url && tabModel.url.toLowerCase().indexOf(this._currentSearchPattern) >= 0);
    };
    Model.ROOT_BOOKMARK_TITLE = 'TabsLord (DO NOT EDIT MANUALLY!)';
    Model.HIBERNATED_TAB_ID = -1;
    Model.HIBERNATED_WINDOW_ID = -1;
    return Model;
}());
exports.Model = Model;
var WindowModel = (function () {
    function WindowModel(windowGuid, windowId, windowTitle, hibernated) {
        this.tabsCount = 0;
        this.tabsToHide = 0;
        this.windowGuid = windowGuid;
        this.windowId = windowId;
        this.title = windowTitle;
        this.hibernated = hibernated;
    }
    WindowModel.prototype.incrementTabsCount = function () {
        this.tabsCount++;
    };
    WindowModel.prototype.decrementTabsCount = function () {
        this.tabsCount--;
    };
    return WindowModel;
}());
var TabModel = (function () {
    function TabModel(tabGuid, windowModel) {
        this.selected = false;
        this.title = '<Empty>';
        this.index = 0;
        this.snoozed = false;
        this.audible = false;
        this.matchesFilter = true;
        this.tabGuid = tabGuid;
        this.windowModel = windowModel;
    }
    TabModel.prototype.isHibernatedDeep = function () {
        return this.windowModel.hibernated;
    };
    return TabModel;
}());
