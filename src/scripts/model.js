function Model() {
  'use strict';

  log('Initializing model...');

  const _windows = new Map();
  const _tabs = new Map();
  const HIBERNATED_TAB_ID = -1;
  const HIBERNATED_WINDOW_ID = -1;
  let _savedStateAsString;
  let _stateLoadedOnStart;

  _savedStateAsString = localStorage.getItem('tabs-lord-state');
  if (_savedStateAsString) {
    _stateLoadedOnStart = JSON.parse(_savedStateAsString);
    debug('State loaded from localStorage', _stateLoadedOnStart);
  }

  function persist() {
    log('Saving state...');
    const state = {
      windows: Array.from(_windows.values()).map(windowModel => {
        const windowFirstTabModel = getTabsByWindowGuid(windowModel.windowGuid)[0];
        return Object.assign({firstTabUrl: windowFirstTabModel ? windowFirstTabModel.url : null}, windowModel);
      }),
      tabs: Array.from(_tabs.values())
    };
    const newStateAsString = JSON.stringify(state);
    if (newStateAsString !== _savedStateAsString) {
      localStorage.setItem('tabs-lord-state', newStateAsString);
      _savedStateAsString = newStateAsString;
      log('State saved', state);
    }
    debug('Initial state', _stateLoadedOnStart);
  }

  function restoreHibernatedWindowsAndTabs() {
    const hibernatedWindowsFromPreviousSession = _stateLoadedOnStart.windows.filter(windowModel => windowModel.hibernated);
    hibernatedWindowsFromPreviousSession.forEach(windowModel => {
      log('Restoring window from state', windowModel);
      addWindowModel(windowModel.windowGuid, HIBERNATED_WINDOW_ID, windowModel.title, true);
    });
    _stateLoadedOnStart.tabs.forEach(tabModel => {
      const windowModel = getWindowModelByGuid(tabModel.windowGuid);
      if (windowModel) {
        if (windowModel.hibernated) {
          log('Restoring tab from state', tabModel);
          addTabModel(tabModel.windowId, tabModel.windowGuid, HIBERNATED_TAB_ID, tabModel.tabGuid, tabModel.title, tabModel.icon, tabModel.url, tabModel.index);
        }
      }
    });
  }

  function saveToHistory(tabModel) {
    const savedHistoryAsString = localStorage.getItem('tabs-lord-history');
    const history = savedHistoryAsString ? JSON.parse(savedHistoryAsString) : [];
    history.push(tabModel);
    while (history.length > 1000) { // Safeguard
      history.shift();
    }
    const newHistoryAsString = JSON.stringify(history);
    localStorage.setItem('tabs-lord-history', newHistoryAsString);
  }

  function normalizeUrlForDuplicatesFinding(url) {
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

  function isHibernatedUrl(url) {
    return url.indexOf('chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#uri=') === 0;
  }

  function generateGuid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  }

  function makeImmutable(obj) {
    if (obj) {
      const result = Object.assign({}, obj);
      Object.freeze(result);
      return result;
    }
  }

  function suggestWindowTitle(firstTabUrl) {
    if (firstTabUrl) {
      const bestMatch = _stateLoadedOnStart.windows.find(windowModel => windowModel.firstTabUrl === firstTabUrl && !windowModel.hibernated);
      if (bestMatch) {
        log('Window from previous session found', bestMatch);
        return bestMatch.title;
      }
    }
    return 'Window';
  }

  /**** Tabs ****/

  function getWindowModelById(windowId) {
    const foundWindowModel = Array.from(_windows.values()).find(windowModel => windowModel.windowId === windowId);
    return makeImmutable(foundWindowModel);
  }

  function getWindowModelByGuid(windowGuid) {
    const foundWindowModel = Array.from(_windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
    return makeImmutable(foundWindowModel);
  }

  function getWindowModels() {
    return Array.from(_windows.values()).map(windowModel => makeImmutable(windowModel));
  }

  function addWindowModel(windowGuid, windowId, windowTitle, isHibernated) {
    const validWindowGuid = (windowGuid || generateGuid());
    const windowModel = {windowId: windowId, title: windowTitle, windowGuid: validWindowGuid, hibernated: (isHibernated || false)};
    _windows.set(validWindowGuid, windowModel);
    persist();
    $(document).trigger('tabsLord:windowAddedToModel', [windowModel]);
  }

  function updateWindowModelByGuid(windowGuid, updateInfo) {
    const foundWindowModel = Array.from(_windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
    if (updateInfo.title) {
      foundWindowModel.title = updateInfo.title;
    }
    if (updateInfo.hibernated !== undefined) {
      foundWindowModel.hibernated = true;
    }
    if (updateInfo.windowId !== undefined) {
      foundWindowModel.windowId = true;
    }
    persist();
  }

  function deleteWindowModelByGuid(windowGuid) {
    const windowModel = getWindowModelByGuid(windowGuid);
    _windows.delete(windowGuid);
    _tabs.forEach(tabModel => {
      if (tabModel.windowGuid === windowGuid) {
        this.deleteTabModelByGuid(tabModel.tabGuid);
      }
    });
    persist();
    $(document).trigger('tabsLord:windowRemovedFromModel', [windowModel]);
  }

  /**** Tabs ****/

  function getTabModelById(tabId) {
    const foundTabModel = Array.from(_tabs.values()).find(tabModel => tabModel.tabId === tabId);
    return makeImmutable(foundTabModel);
  }

  function getTabModelByGuid(tabGuid) {
    const foundTabModel = Array.from(_tabs.values()).find(tabModel => tabModel.tabGuid === tabGuid);
    return makeImmutable(foundTabModel);
  }

  function getTabModels() {
    return Array.from(_tabs.values()).map(tabModel => makeImmutable(tabModel));
  }

  function getTabsByWindowGuid(windowGuid) {
    return Array.from(_tabs.values()).filter(tabModel => tabModel.windowGuid === windowGuid).map(tabModel => makeImmutable(tabModel));
  }

  function getTabsCount() {
    return _tabs.size;
  }

  function addTabModel(windowId, windowGuid, tabId, tabGuid, tabTitle, tabIcon, tabUrl, tabIndex, isTabSelected, isTabAudible) {
    debug('Adding tab model', arguments);
    const validTabGuid = tabGuid || generateGuid();
    const tabModel = {
      windowId: windowId,
      windowGuid: windowGuid,
      tabId: tabId,
      tabGuid: validTabGuid,
      title: tabTitle,
      icon: tabIcon,
      url: tabUrl,
      index: tabIndex,
      normalizedUrl: normalizeUrlForDuplicatesFinding(tabUrl),
      selected: isTabSelected,
      hibernated: tabUrl && isHibernatedUrl(tabUrl),
      audible: isTabAudible};
    _tabs.set(validTabGuid, tabModel);
    const windowModel = Array.from(_windows.values()).find(_windowModel => _windowModel.windowGuid === windowGuid);
    windowModel.tabsCount = (windowModel.tabsCount || 0) + 1;
    persist();
    $(document).trigger('tabsLord:tabAddedToModel', [tabModel]);
  }

  function updateTabModelByGuid(tabGuid, updateInfo) {
    const tabModel = Array.from(_tabs.values()).find(_tabModel => _tabModel.tabGuid === tabGuid);
    if (!tabModel) { // skipping tabs which are not tracked - e.g. Tabs Lord popup itself
      return;
    }
    if (updateInfo.url) {
      tabModel.url = updateInfo.url;
      tabModel.normalizedUrl = normalizeUrlForDuplicatesFinding(tabModel.url);
      tabModel.hibernated = tabModel.url && isHibernatedUrl(tabModel.url);
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
    persist();
  }

  function deleteTabModelByGuid(tabGuid) {
    const tabModel = getTabModelByGuid(tabGuid);
    if (!tabModel) { // Can be deleted by async window deletion
      return;
    }
    const windowModel = _windows.get(tabModel.windowGuid);
    if (windowModel) { // Can be delelted by async window deletion
      windowModel.tabsCount = (windowModel.tabsCount || 0) - 1;
    }
    saveToHistory(tabModel);
    _tabs.delete(tabGuid);
    persist();
  }

  function unselectAllTabs() {
    _tabs.forEach(tabModel => {
      tabModel.selected = false;
    });
  }

  return {
    getWindowModelById,
    getWindowModelByGuid,
    addWindowModel,
    updateWindowModelByGuid,
    deleteWindowModelByGuid,
    getWindowModels,
    getTabModelById,
    getTabModelByGuid,
    getTabModels,
    getTabsCount,
    addTabModel,
    deleteTabModelByGuid,
    updateTabModelByGuid,
    getTabsByWindowGuid,
    unselectAllTabs,
    persist,
    suggestWindowTitle,
    restoreHibernatedWindowsAndTabs
  };
}