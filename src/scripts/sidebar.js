define("util", ["require", "exports"], function (require, exports) {
    const LOG = true;
    function debug(...args) {
        if (LOG) {
            console.debug(...args);
        }
    }
    exports.debug = debug;
    function log(...args) {
        if (LOG) {
            console.log(...args);
        }
    }
    exports.log = log;
    function warn(...args) {
        console.warn(...args);
    }
    exports.warn = warn;
});
define("model", ["require", "exports", "util"], function (require, exports, util_1) {
    class Model {
        constructor() {
            this._windows = new Map();
            this._tabs = new Map();
            util_1.log('Initializing model...');
            this._savedStateAsString = localStorage.getItem('tabs-lord-state');
            if (this._savedStateAsString) {
                this._stateLoadedOnStart = JSON.parse(this._savedStateAsString);
                util_1.debug('State loaded from localStorage', this._stateLoadedOnStart);
            }
        }
        persist() {
            if (this._persistTimer) {
                clearTimeout(this._persistTimer);
            }
            this._persistTimer = setTimeout(() => {
                util_1.log('Saving state...');
                const state = {
                    windows: Array.from(this._windows.values()).map(windowModel => {
                        const windowFirstTabModel = this.getTabsByWindowGuid(windowModel.windowGuid)[0];
                        return Object.assign({ firstTabUrl: windowFirstTabModel ? windowFirstTabModel.url : null }, windowModel);
                    }),
                    tabs: Array.from(this._tabs.values())
                };
                const newStateAsString = JSON.stringify(state);
                if (newStateAsString !== this._savedStateAsString) {
                    localStorage.setItem('tabs-lord-state', newStateAsString);
                    this._savedStateAsString = newStateAsString;
                    util_1.log('State saved', state);
                }
            }, 500);
        }
        restoreHibernatedWindowsAndTabs() {
            const hibernatedWindowsFromPreviousSession = this._stateLoadedOnStart.windows.filter(windowModel => windowModel.hibernated);
            hibernatedWindowsFromPreviousSession.forEach((windowModel) => {
                util_1.log('Restoring window from state', windowModel);
                this.addWindowModel(windowModel.windowGuid, Model.HIBERNATED_WINDOW_ID, windowModel.title, true);
            });
            this._stateLoadedOnStart.tabs.forEach((tabModel) => {
                const windowModel = this.getWindowModelByGuid(tabModel.windowGuid);
                if (windowModel) {
                    if (windowModel.hibernated) {
                        util_1.log('Restoring tab from state', tabModel);
                        this.addTabModel(tabModel.windowId, tabModel.windowGuid, Model.HIBERNATED_TAB_ID, tabModel.tabGuid, tabModel.title, tabModel.icon, tabModel.url, tabModel.index, false, false);
                    }
                }
            });
        }
        saveToHistory(tabModel) {
            const savedHistoryAsString = localStorage.getItem('tabs-lord-history');
            const history = savedHistoryAsString ? JSON.parse(savedHistoryAsString) : [];
            history.push(tabModel);
            while (history.length > 1000) {
                history.shift();
            }
            const newHistoryAsString = JSON.stringify(history);
            localStorage.setItem('tabs-lord-history', newHistoryAsString);
        }
        normalizeUrlForDuplicatesFinding(url) {
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
        isHibernatedUrl(url) {
            return url.indexOf('chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#uri=') === 0;
        }
        generateGuid() {
            function s4() {
                return Math.floor((1 + Math.random()) * 0x10000)
                    .toString(16)
                    .substring(1);
            }
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
        }
        makeImmutable(obj) {
            if (obj) {
                const result = Object.assign({}, obj);
                Object.freeze(result);
                return result;
            }
        }
        suggestWindowTitle(firstTabUrl) {
            if (firstTabUrl) {
                const bestMatch = this._stateLoadedOnStart.windows.find((windowModel) => windowModel.firstTabUrl === firstTabUrl && !windowModel.hibernated);
                if (bestMatch) {
                    util_1.log('Window from previous session found', bestMatch);
                    return bestMatch.title;
                }
            }
            return 'Window';
        }
        getWindowModelById(windowId) {
            const foundWindowModel = Array.from(this._windows.values()).find(windowModel => windowModel.windowId === windowId);
            return this.makeImmutable(foundWindowModel);
        }
        getWindowModelByGuid(windowGuid) {
            const foundWindowModel = Array.from(this._windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
            return this.makeImmutable(foundWindowModel);
        }
        getWindowModels() {
            return Array.from(this._windows.values()).map(windowModel => this.makeImmutable(windowModel));
        }
        addWindowModel(windowGuid, windowId, windowTitle, isHibernated) {
            const validWindowGuid = (windowGuid || this.generateGuid());
            const windowModel = new WindowModel(validWindowGuid, windowId, windowTitle, isHibernated || false);
            this._windows.set(validWindowGuid, windowModel);
            this.persist();
            $(document).trigger('tabsLord:windowAddedToModel', [windowModel]);
        }
        updateWindowModel(windowGuid, updateInfo) {
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
        deleteWindowModel(windowGuid) {
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
        getTabModelById(tabId) {
            const foundTabModel = Array.from(this._tabs.values()).find(tabModel => tabModel.tabId === tabId);
            return this.makeImmutable(foundTabModel);
        }
        getTabModelByGuid(tabGuid) {
            const foundTabModel = Array.from(this._tabs.values()).find(tabModel => tabModel.tabGuid === tabGuid);
            return this.makeImmutable(foundTabModel);
        }
        getTabModels() {
            return Array.from(this._tabs.values()).map(tabModel => this.makeImmutable(tabModel));
        }
        getTabsByWindowGuid(windowGuid) {
            return Array.from(this._tabs.values()).filter(tabModel => tabModel.windowGuid === windowGuid).map(tabModel => this.makeImmutable(tabModel));
        }
        getTabsCount() {
            return this._tabs.size;
        }
        addTabModel(windowId, windowGuid, tabId, tabGuid, tabTitle, tabIcon, tabUrl, tabIndex, isTabSelected, isTabAudible) {
            util_1.debug('Adding tab model', arguments);
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
        updateTabModel(tabGuid, updateInfo) {
            const tabModel = Array.from(this._tabs.values()).find(_tabModel => _tabModel.tabGuid === tabGuid);
            if (!tabModel) {
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
        deleteTabModel(tabGuid) {
            const tabModel = this.getTabModelByGuid(tabGuid);
            if (!tabModel) {
                return;
            }
            const windowModel = this._windows.get(tabModel.windowGuid);
            if (windowModel) {
                windowModel.tabsCount = (windowModel.tabsCount || 0) - 1;
            }
            this.saveToHistory(tabModel);
            this._tabs.delete(tabGuid);
            this.persist();
        }
        unselectAllTabs() {
            this._tabs.forEach(tabModel => {
                tabModel.selected = false;
            });
        }
    }
    Model.HIBERNATED_TAB_ID = -1;
    Model.HIBERNATED_WINDOW_ID = -1;
    exports.Model = Model;
    class WindowModel {
        constructor(windowGuid, windowId, windowTitle, hibernated) {
            this.windowGuid = windowGuid;
            this.windowId = windowId;
            this.title = windowTitle;
            this.hibernated = hibernated;
        }
    }
    class TabModel {
        constructor(tabGuid, windowGuid) {
            this.selected = false;
            this.hibernated = false;
            this.audible = false;
            this.tabGuid = tabGuid;
            this.windowGuid = windowGuid;
        }
    }
});
define("sidebar", ["require", "exports", "util", "model"], function (require, exports, util_2, model_1) {
    $(document).ready(onReady);
    function onReady() {
        'use strict';
        util_2.log('Sidebar view loaded! Reading information about existing windows...');
        let updateViewTimer = null;
        const sidebarContainer = $('#sidebar-nodes-container').addClass('tabs-lorg-nav-root');
        const templateWindowNode = $('<li>').addClass('sidebar-window-node').addClass('sidebar-window-node-expanded');
        $('<div>').addClass('sidebar-window-row').text(' ').appendTo(templateWindowNode);
        $('<span>').addClass('sidebar-window-icon').addClass('sidebar-window-icon-expand-collapse').appendTo(templateWindowNode);
        $('<a>').addClass('sidebar-window-anchor').attr('href', '#').attr('tabIndex', -1).appendTo(templateWindowNode);
        $('<span>').addClass('sidebar-window-icon').addClass('sidebar-window-icon-edit').appendTo(templateWindowNode);
        $('<span>').addClass('sidebar-window-icon').addClass('sidebar-window-icon-sleep-wake').appendTo(templateWindowNode);
        $('<ul>').addClass('sidebar-tabs-list').appendTo(templateWindowNode);
        const templateTabNode = $('<li>').addClass('sidebar-tab-node');
        $('<div>').addClass('sidebar-tab-row').text(' ').appendTo(templateTabNode);
        $('<span>').addClass('sidebar-tab-favicon').appendTo(templateTabNode);
        $('<span>').addClass('sidebar-tab-icon').addClass('sidebar-tab-icon-audible').hide().appendTo(templateTabNode);
        $('<a>').addClass('sidebar-tab-anchor').attr('href', '#').attr('tabIndex', -1).appendTo(templateTabNode);
        $('<span>').addClass('sidebar-tab-icon').addClass('sidebar-tab-icon-close').appendTo(templateTabNode);
        const windowsListElement = $('<ul>').addClass('sidebar-nodes-container-list').appendTo(sidebarContainer);
        bind();
        const model = new model_1.Model();
        util_2.log('Parsing existing windows...');
        chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }, windowsArr => {
            windowsArr.forEach(window => {
                setTimeout(() => {
                    util_2.log('Populating window', window);
                    onChromeWindowCreatedExt(window, model.suggestWindowTitle(window.tabs[0].url));
                    window.tabs.forEach(tab => {
                        util_2.log('Populating tab', tab);
                        onChromeTabCreated(tab);
                    });
                }, 1);
            });
            setTimeout(() => {
                model.restoreHibernatedWindowsAndTabs();
            });
            util_2.log('Existing windows parsed!');
        });
        chrome.windows.onCreated.addListener(onChromeWindowCreated);
        chrome.windows.onRemoved.addListener(onChromeWindowRemoved);
        chrome.windows.onFocusChanged.addListener(onChromeWindowFocusChanged);
        chrome.tabs.onCreated.addListener(onChromeTabCreated);
        chrome.tabs.onRemoved.addListener(onChromeTabRemoved);
        chrome.tabs.onUpdated.addListener(onChromeTabUpdated);
        chrome.tabs.onMoved.addListener(onChromeTabMoved);
        chrome.tabs.onAttached.addListener(onChromeTabAttached);
        chrome.tabs.onActivated.addListener(onChromeTabActivated);
        chrome.tabs.onReplaced.addListener(onChromeTabReplaced);
        function bind() {
            sidebarContainer
                .on('click.sidebar', '.sidebar-tab-icon-close', $.proxy(e => {
                util_2.log('Close icon clicked!', e);
                e.stopImmediatePropagation();
                onCloseTabIconClicked(e);
            }, this))
                .on('click.sidebar', '.sidebar-tab-node', $.proxy(e => {
                util_2.log('Clicked!', e);
                e.preventDefault();
                onTabNodeClicked(e);
            }, this))
                .on('dblclick.sidebar', '.sidebar-tab-node', $.proxy(e => {
                util_2.log('Double-Clicked!', e);
                e.preventDefault();
                onTabNodeDoubleClicked(e);
            }, this))
                .on('contextmenu.sidebar', '.sidebar-tab-node', $.proxy(e => {
                util_2.log('Context menu clicked!', e);
                e.preventDefault();
                showNodeContextMenu(e);
            }, this))
                .on('click.sidebar', '.sidebar-window-icon-expand-collapse', $.proxy(e => {
                util_2.log('Clicked window expand/collapse!', e);
                $(e.currentTarget).parent().toggleClass('sidebar-window-node-expanded sidebar-window-node-collapsed');
            }, this))
                .on('contextmenu.sidebar', '.sidebar-tab-node', $.proxy(e => {
                util_2.log('Context menu clicked!', e);
                e.preventDefault();
                showNodeContextMenu(e);
            }, this))
                .on('click.sidebar', '.sidebar-window-icon-edit', $.proxy(e => {
                startWindowNodeEdit($(e.currentTarget.parentNode));
            }, this))
                .on('click.sidebar', '.sidebar-window-icon-sleep-wake', $.proxy(e => {
                snoozeOrWakeWindow($(e.currentTarget.parentNode));
            }, this));
            $(document)
                .on('mousedown.sidebar', e => {
                const contextMenu = $('.sidebar-context-menu');
                if (contextMenu.length > 0 && !$.contains(contextMenu[0], e.target)) {
                    hideContextMenu();
                }
            })
                .on('keydown', (e) => {
                if (e.which === 27) {
                    hideContextMenu();
                }
            })
                .on('tabsLord:windowAddedToModel', (e, windowModel) => {
                util_2.log('Global event: Window model added', e, windowModel);
                onWindowAddedToModel(windowModel);
            })
                .on('tabsLord:windowRemovedFromModel', (e, windowModel) => {
                util_2.log('Global event: Window model removed', e, windowModel);
                onChromeWindowRemovedFromModel(windowModel.windowGuid);
            })
                .on('tabsLord:tabAddedToModel', (e, tabModel) => {
                util_2.log('Global event: Tab model added', e, tabModel);
                onTabAddedToModel(tabModel);
            });
        }
        function snoozeOrWakeWindow(windowNodeElement) {
            const windowGuid = windowNodeElement[0].id;
            const windowModel = model.getWindowModelByGuid(windowGuid);
            if (windowModel.hibernated) {
                const tabModels = model.getTabsByWindowGuid(windowModel.windowGuid);
                util_2.debug('Restoring window model', windowModel, tabModels);
                chrome.windows.create({
                    type: 'normal',
                    focused: true,
                    url: tabModels.length > 0 ? tabModels[0].url : null
                }, window => {
                    util_2.debug('Window restored', window, windowModel);
                    const newWindowModel = model.getWindowModelById(window.id);
                    if (newWindowModel) {
                        model.updateWindowModel(newWindowModel.windowGuid, { title: windowModel.title });
                    }
                    tabModels.slice(1).forEach(tabModel => {
                        util_2.debug('Restoring tab model', tabModel);
                        chrome.tabs.create({
                            windowId: window.id,
                            url: tabModel.url,
                            active: false
                        }, tab => {
                            util_2.debug('Tab restored', tab, tabModel);
                            model.deleteTabModel(tabModel.tabGuid);
                        });
                    });
                    model.deleteWindowModel(windowGuid);
                    updateView();
                });
            }
            else {
                const unhibernatedWindowsCount = model.getWindowModels().filter(_windowModel => !_windowModel.hibernated).length;
                if (unhibernatedWindowsCount === 1) {
                    return;
                }
                let windowTitle = windowModel.title;
                if (windowTitle === 'Window') {
                    windowTitle = prompt('Enter window title to distinguish between hibernated items', '');
                    if (!windowTitle) {
                        return;
                    }
                }
                model.updateWindowModel(windowGuid, { title: windowTitle, hibernated: true });
                chrome.windows.remove(windowModel.windowId);
                const windowElement = getElementByGuid(windowModel.windowGuid);
                windowElement.addClass('sidebar-window-hibernated');
                updateView();
            }
        }
        function startWindowNodeEdit(windowElement) {
            sidebarContainer.children('input').remove();
            const windowGuid = windowElement[0].id;
            const oldText = model.getWindowModelByGuid(windowGuid).title;
            windowElement.children('.sidebar-window-row').hide();
            windowElement.children('.sidebar-window-anchor').hide();
            const inputElement = $('<input>', {
                'value': oldText,
                'blur': $.proxy((e) => {
                    stopWindowNodeEditByGuid(windowGuid, inputElement.val());
                }),
                'keydown': function (e) {
                    if (e.which === 27) {
                        stopWindowNodeEditByGuid(windowGuid, oldText);
                    }
                    if (e.which === 13) {
                        this.blur();
                    }
                }
            }).addClass('sidebar-window-title-edit');
            windowElement.children('.sidebar-window-icon-expand-collapse').after(inputElement);
            inputElement.focus();
            inputElement.select();
        }
        function stopWindowNodeEditByGuid(windowGuid, newText) {
            if (newText.length === 0) {
                newText = 'Window';
            }
            const windowNodeElement = getElementByGuid(windowGuid);
            model.updateWindowModel(windowGuid, { title: newText });
            windowNodeElement.children('.sidebar-window-row').show();
            windowNodeElement.children('.sidebar-window-anchor').show();
            windowNodeElement.children('input').remove();
            updateView();
        }
        function getElementByGuid(guid) {
            return $('#' + guid);
        }
        function onCloseTabIconClicked(e) {
            const tabNode = e.currentTarget.parentNode;
            const tabGuid = tabNode.id;
            util_2.log('Closed tab icon node clicked', tabGuid, tabNode);
            const tabModel = model.getTabModelByGuid(tabGuid);
            const windowModel = model.getWindowModelByGuid(tabModel.windowGuid);
            if (windowModel.hibernated) {
                removeTabNodeByGuid(tabModel.tabGuid);
            }
            else {
                chrome.tabs.remove(tabModel.tabId, () => {
                    updateView();
                });
            }
        }
        function onTabNodeClicked(e) {
            hideContextMenu();
            const tabNode = e.currentTarget;
            const tabGuid = tabNode.id;
            util_2.log('Tab node clicked', tabGuid, tabNode, e);
            const tabModel = model.getTabModelByGuid(tabGuid);
            if (!tabModel) {
                util_2.warn('Cannot find tab by GUID', tabNode, tabGuid);
                return;
            }
            const windowModel = model.getWindowModelByGuid(tabModel.windowGuid);
            const tabElement = getElementByGuid(tabGuid);
            if (e.ctrlKey) {
                const newTabSelectedValue = !tabModel.selected;
                model.updateTabModel(tabGuid, { selected: newTabSelectedValue });
                tabElement.children('.sidebar-tab-row').toggleClass('sidebar-tab-selected', newTabSelectedValue);
            }
            else if (windowModel.hibernated) {
                $('.sidebar-tab-row').removeClass('sidebar-tab-selected');
                model.unselectAllTabs();
                model.updateTabModel(tabGuid, { selected: true });
                tabElement.children('.sidebar-tab-row').addClass('sidebar-tab-selected');
            }
            else {
                chrome.tabs.get(tabModel.tabId, tab => {
                    chrome.windows.get(tab.windowId, {}, window => {
                        if (!tab.active) {
                            util_2.log('Activating tab because node was selected', tab);
                            chrome.tabs.update(tab.id, { active: true });
                        }
                        if (!window.focused) {
                            chrome.windows.update(tab.windowId, { focused: true });
                        }
                    });
                });
            }
        }
        function onTabNodeDoubleClicked(e) {
            hideContextMenu();
            const tabNode = e.currentTarget;
            const tabGuid = tabNode.id;
            const tabModel = model.getTabModelByGuid(tabGuid);
            util_2.log('Tab node double-clicked', tabModel, tabNode, e);
            sendMessageToGreatSuspenderExtension(tabModel.tabId, { action: tabModel.hibernated ? 'unsuspendOne' : 'suspendOne' });
        }
        function hideContextMenu() {
            $('.sidebar-context-menu').remove();
        }
        function showNodeContextMenu(e) {
            const tabElement = e.currentTarget;
            if (!tabElement) {
                return false;
            }
            hideContextMenu();
            const tabGuid = tabElement.id;
            const tabAnchorElement = $(tabElement).children('.sidebar-tab-anchor');
            const x = tabAnchorElement.offset().left;
            const y = tabAnchorElement.offset().top + 20;
            createContextMenuElement(tabGuid).css({ 'left': x, 'top': y }).appendTo('body');
        }
        function createContextMenuElement(contextTabGuid) {
            const result = $('<div></div>').addClass('sidebar-context-menu');
            const menuList = $('<span>Move to window:</span>').appendTo(result);
            const moveMenuUl = $('<ul>').addClass('sidebar-context-menu-items-list').appendTo(menuList);
            const selectedTabModels = model.getTabModels().filter(tabModel => tabModel.selected);
            const contextTabModel = model.getTabModelByGuid(contextTabGuid);
            if (selectedTabModels.length === 0) {
                selectedTabModels.push(contextTabModel);
            }
            const selectedTabIds = selectedTabModels.map(tabModel => tabModel.tabId);
            model.getWindowModels().forEach(windowModel => {
                const menuItemElement = $('<li>').addClass('sidebar-context-menu-item').appendTo(moveMenuUl);
                const firstTabModel = model.getTabsByWindowGuid(windowModel.windowGuid)[0];
                const menuText = windowModel.title === 'Window' ? 'With tab "' + firstTabModel.title + '"' : windowModel.title;
                $('<a>').addClass('sidebar-context-menu-item-anchor')
                    .attr('href', '#')
                    .text(menuText)
                    .appendTo(menuItemElement)
                    .click('click', () => {
                    util_2.log('"Move to another window" menu item clicked', selectedTabModels, windowModel);
                    moveSelectedTabsToWindow(selectedTabIds, windowModel.windowId);
                    hideContextMenu();
                });
            });
            const menuItemElement = $('<li>').addClass('sidebar-context-menu-item').appendTo(moveMenuUl);
            $('<a>').addClass('sidebar-context-menu-item-anchor')
                .attr('href', '#')
                .text('New window')
                .appendTo(menuItemElement)
                .click('click', () => {
                util_2.log('"Move to new window" menu item clicked', selectedTabModels);
                chrome.windows.create({
                    type: 'normal',
                    tabId: selectedTabIds[0]
                }, newWindow => {
                    moveSelectedTabsToWindow(selectedTabIds.slice(1), newWindow.id);
                    hideContextMenu();
                });
            });
            return result;
        }
        function moveSelectedTabsToWindow(selectedTabIds, targetWindowId) {
            util_2.log('Moving tabs to window...', targetWindowId);
            chrome.tabs.move(selectedTabIds, { windowId: targetWindowId, index: -1 }, () => {
            });
        }
        function updateView() {
            if (updateViewTimer) {
                clearTimeout(updateViewTimer);
            }
            updateViewTimer = setTimeout(() => {
                util_2.log('Updating view...');
                model.getTabModels().forEach(tabModel => {
                    getElementByGuid(tabModel.tabGuid).toggleClass('sidebar-tab-hibernated', tabModel.hibernated);
                });
                const tabGuidsByUrl = new Map();
                model.getTabModels().forEach(tabModel => {
                    const tabGuids = tabGuidsByUrl.get(tabModel.normalizedUrl) || [];
                    tabGuids.push(tabModel.tabGuid);
                    tabGuidsByUrl.set(tabModel.normalizedUrl, tabGuids);
                });
                tabGuidsByUrl.forEach(tabGuids => {
                    tabGuids.forEach(tabGuid => {
                        getElementByGuid(tabGuid).children('.sidebar-tab-anchor').toggleClass('sidebar-tab-duplicate', tabGuids.length > 1);
                    });
                });
                model.getWindowModels().forEach(windowModel => {
                    const windowElement = getElementByGuid(windowModel.windowGuid);
                    windowElement.children('.sidebar-window-anchor').text(windowModel.title + ' (' + windowModel.tabsCount + ')');
                });
                document.title = 'Chrome - Tabs Lord (' + model.getTabsCount() + ')';
            }, 100);
        }
        function sendMessageToGreatSuspenderExtension(tabId, message) {
            util_2.log('Sending message to tab', tabId, message);
            chrome.runtime.sendMessage('klbibkeccnjlkjkiokjodocebajanakg', message);
        }
        function onWindowAddedToModel(windowModel) {
            util_2.debug('onWindowAddedToModel', windowModel);
            templateWindowNode.clone()
                .attr('id', windowModel.windowGuid)
                .toggleClass('sidebar-window-hibernated', windowModel.hibernated)
                .toggleClass('sidebar-window-node-collapsed', windowModel.hibernated)
                .toggleClass('sidebar-window-node-expanded', !windowModel.hibernated)
                .appendTo(windowsListElement)
                .children('.sidebar-window-anchor')
                .text(windowModel.title + ' (' + windowModel.tabsCount + ')');
            updateView();
        }
        function onChromeWindowRemovedFromModel(windowGuid) {
            const windowElement = getElementByGuid(windowGuid);
            if (windowElement) {
                windowElement.remove();
            }
        }
        function onTabAddedToModel(tabModel) {
            const windowElement = getElementByGuid(tabModel.windowGuid);
            const tabsListElement = windowElement.children('.sidebar-tabs-list')[0];
            const tabElement = templateTabNode.clone()
                .attr('id', tabModel.tabGuid);
            tabElement.children('.sidebar-tab-anchor').text(tabModel.title).attr('title', tabModel.url);
            tabElement.children('.sidebar-tab-favicon').css('backgroundImage', 'url(' + tabModel.icon + ')');
            tabElement.children('.sidebar-tab-icon-audible').toggle(tabModel.audible);
            tabsListElement.insertBefore(tabElement[0], tabsListElement.children[tabModel.index]);
            updateView();
        }
        function removeTabNodeByGuid(tabGuid) {
            model.deleteTabModel(tabGuid);
            const tabElement = getElementByGuid(tabGuid);
            tabElement.remove();
            updateView();
        }
        function moveTabNodeByGuid(tabGuid, targetWindowGuid, pos) {
            const tabElement = getElementByGuid(tabGuid);
            const targetWindowElement = getElementByGuid(targetWindowGuid);
            util_2.log('Moving tab', tabGuid, targetWindowGuid, pos, tabElement, targetWindowElement);
            const tabsListElement = targetWindowElement.children('.sidebar-tabs-list')[0];
            tabsListElement.insertBefore(tabElement[0].parentNode.removeChild(tabElement[0]), tabsListElement.children[pos]);
            model.updateTabModel(tabGuid, { windowGuid: targetWindowGuid });
            updateView();
        }
        function search(searchPattern) {
            const windowsWithVisibleTabs = new Map();
            model.getTabModels().forEach(tabModel => {
                const tabElement = getElementByGuid(tabModel.tabGuid);
                if (searchPattern.length === 0) {
                    tabElement.removeClass('sidebar-tab-hidden');
                    tabElement.removeClass('sidebar-tab-search-match');
                    windowsWithVisibleTabs.set(tabModel.windowGuid, (windowsWithVisibleTabs.get(tabModel.windowGuid) || 0) + 1);
                }
                else if (tabModel.title.toLowerCase().indexOf(searchPattern) >= 0 || tabModel.url.toLowerCase().indexOf(searchPattern) >= 0) {
                    tabElement.removeClass('sidebar-tab-hidden');
                    tabElement.addClass('sidebar-tab-search-match');
                    windowsWithVisibleTabs.set(tabModel.windowGuid, (windowsWithVisibleTabs.get(tabModel.windowGuid) || 0) + 1);
                }
                else {
                    tabElement.addClass('sidebar-tab-hidden');
                    tabElement.removeClass('sidebar-tab-search-match');
                }
            });
            model.getWindowModels().forEach(windowModel => {
                const windowElement = getElementByGuid(windowModel.windowGuid);
                const visibleTabsCount = windowsWithVisibleTabs.get(windowModel.windowGuid) || 0;
                windowElement.toggleClass('sidebar-window-hidden', visibleTabsCount === 0);
                let windowText;
                if (visibleTabsCount < windowModel.tabsCount) {
                    windowText = windowModel.title + ' (' + visibleTabsCount + '/' + windowModel.tabsCount + ')';
                }
                else {
                    windowText = windowModel.title + ' (' + windowModel.tabsCount + ')';
                }
                windowElement.children('.sidebar-window-anchor').text(windowText);
            });
        }
        function onChromeWindowCreated(window) {
            util_2.log('Window created', window);
            onChromeWindowCreatedExt(window);
        }
        function onChromeWindowCreatedExt(window, suggestedWindowTitle = 'Window') {
            util_2.log('Window created', window);
            model.addWindowModel(null, window.id, suggestedWindowTitle, false);
        }
        function onChromeWindowRemoved(windowId) {
            util_2.log('Window removed', windowId);
            const windowModel = model.getWindowModelById(windowId);
            if (!windowModel.hibernated) {
                model.deleteWindowModel(windowModel.windowGuid);
            }
        }
        function onChromeWindowFocusChanged(windowId) {
            if (windowId === -1) {
                util_2.log('Windows lost focus');
            }
            else {
                chrome.windows.get(windowId, { populate: true }, window => {
                    if (window.type === 'normal') {
                        const activeTab = window.tabs.find(tab => {
                            return tab.active;
                        });
                        if (activeTab) {
                            util_2.log('Activating tab because window was focused', window, activeTab);
                            onChromeTabActivated({ tabId: activeTab.id, windowId: activeTab.windowId });
                        }
                    }
                });
            }
        }
        function onChromeTabCreated(tab) {
            util_2.log('Tab created', tab);
            const windowModel = model.getWindowModelById(tab.windowId);
            if (windowModel) {
                const tabTitle = tab.title || 'Loading...';
                const tabFavIconUrl = correctFavIconUrl(tab.favIconUrl);
                model.addTabModel(tab.windowId, windowModel.windowGuid, tab.id, null, tabTitle, tabFavIconUrl, tab.url, tab.index, false, tab.audible);
            }
            else {
                util_2.warn('Window model not found', tab);
            }
        }
        function onChromeTabRemoved(tabId, removeInfo) {
            util_2.log('Tab removed', tabId, removeInfo);
            const tabModel = model.getTabModelById(tabId);
            const windowModel = model.getWindowModelById(tabModel.windowId);
            if (!windowModel.hibernated) {
                removeTabNodeByGuid(tabModel.tabGuid);
            }
        }
        function onChromeTabUpdated(tabId, changeInfo) {
            util_2.log('Tab updated', tabId, changeInfo);
            const tabModel = model.getTabModelById(tabId);
            if (tabModel) {
                const tabElement = getElementByGuid(tabModel.tabGuid);
                const updateInfo = {};
                if (changeInfo.url) {
                    updateInfo.url = changeInfo.url;
                    tabElement.children('.sidebar-tab-anchor').attr('title', changeInfo.url);
                }
                const tabTitle = changeInfo.title;
                if (tabTitle && tabModel.title !== tabTitle) {
                    updateInfo.title = tabTitle;
                    tabElement.children('.sidebar-tab-anchor').text(tabTitle);
                }
                const favIconUrl = changeInfo.favIconUrl;
                if (favIconUrl && tabModel.favIconUrl !== favIconUrl) {
                    updateInfo.favIconUrl = correctFavIconUrl(favIconUrl);
                    tabElement.children('.sidebar-tab-favicon').css('backgroundImage', 'url(' + favIconUrl + ')');
                }
                if (changeInfo.audible !== undefined) {
                    util_2.log('Switching audible icon', changeInfo.audible);
                    tabElement.children('.sidebar-tab-icon-audible').toggle(changeInfo.audible);
                }
                model.updateTabModel(tabModel.tabGuid, updateInfo);
            }
            updateView();
        }
        function correctFavIconUrl(iconUrl) {
            if (iconUrl && iconUrl.startsWith('chrome://theme/')) {
                return undefined;
            }
            return iconUrl;
        }
        function onChromeTabMoved(tabId, moveInfo) {
            util_2.log('Tab moved', tabId, moveInfo);
            const tabModel = model.getTabModelById(tabId);
            const targetWindowModel = model.getWindowModelById(moveInfo.windowId);
            moveTabNodeByGuid(tabModel.tabGuid, targetWindowModel.windowGuid, moveInfo.toIndex);
        }
        function onChromeTabAttached(tabId, attachInfo) {
            util_2.log('Tab attached', tabId, attachInfo);
            const tabModel = model.getTabModelById(tabId);
            const targetWindowModel = model.getWindowModelById(attachInfo.newWindowId);
            moveTabNodeByGuid(tabModel.tabGuid, targetWindowModel.windowGuid, attachInfo.newPosition);
        }
        function onChromeTabActivated(activeInfo) {
            util_2.log('Tab activated', activeInfo);
            const activatedTabModel = model.getTabModelById(activeInfo.tabId);
            util_2.log('Selecting tab', activatedTabModel);
            $('.sidebar-tab-row').removeClass('sidebar-tab-selected');
            model.unselectAllTabs();
            if (!activatedTabModel) {
                util_2.warn('Could not find active tab model', activeInfo);
                return;
            }
            const tabElement = getElementByGuid(activatedTabModel.tabGuid);
            if (tabElement) {
                tabElement.children('.sidebar-tab-row').addClass('sidebar-tab-selected');
                model.updateTabModel(activatedTabModel.tabGuid, { selected: true });
                tabElement.parents('.sidebar-window-node').addClass('sidebar-window-node-expanded').removeClass('sidebar-window-node-collapsed');
                if (!tabElement.visible()) {
                    const offset = tabElement.offset();
                    if (offset) {
                        jQuery(document).scrollTop($(tabElement).offset().top - 25);
                    }
                }
            }
        }
        function onChromeTabReplaced(addedTabId, removedTabId) {
            util_2.log('Tab replaced', addedTabId, removedTabId);
            const removedTabModel = model.getTabModelById(removedTabId);
            removeTabNodeByGuid(removedTabModel.tabGuid);
            chrome.tabs.get(addedTabId, tab => {
                onChromeTabCreated(tab);
            });
        }
        const searchBox = $('.sidebar-search-box');
        searchBox.on('input', () => {
            util_2.log('Search text changed', searchBox.val());
            const searchText = searchBox.val().toLowerCase();
            search(searchText);
        });
    }
});
//# sourceMappingURL=sidebar.js.map