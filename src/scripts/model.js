function Model() {
  'use strict';
  const _windows = new Map();
  const _tabs = new Map();
  let _savedStateAsString;
  let _windowsFromPreviousSession;

  _savedStateAsString = localStorage.getItem('tabs-lord-state');
  if (_savedStateAsString) {
    const state = JSON.parse(_savedStateAsString);
    state.windows.filter(windowModel => windowModel.hibernated).forEach(windowModel => {
      log('Restoring window from state', windowModel);
      addWindowModel(windowModel.windowGuid, -1, windowModel.text, true);
    });
    _windowsFromPreviousSession = state.windows.filter(windowModel => !windowModel.hibernated);
    state.tabs.forEach(tabModel => {
      const windowModel = getWindowModelByGuid(tabModel.windowGuid);
      if (windowModel) {
        if (windowModel.hibernated) {
          log('Restoring tab from state', tabModel);
          addTabModel(tabModel.windowId, tabModel.windowGuid, -1, tabModel.tabGuid, tabModel.text, tabModel.icon, tabModel.url, tabModel.index);
        }
      }
    });
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
    }
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
      const bestMatch = _windowsFromPreviousSession.find(windowModel => windowModel.firstTabUrl === firstTabUrl);
      if (bestMatch) {
        log('Window from previous session found', bestMatch);
        return bestMatch.text;
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
    const windowModel = {windowId: windowId, text: windowTitle, windowGuid: (windowGuid || generateGuid()), hibernated: (isHibernated || false)};
    _windows.set(windowId, windowModel);
    persist();
    $(document).trigger('tabsLord:windowAddedToModel', [windowModel]);
  }

  function updateWindowModelByGuid(windowGuid, updateInfo) {
    const foundWindowModel = Array.from(_windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
    if (updateInfo.text) {
      foundWindowModel.text = updateInfo.text;
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
    _windows.delete(windowModel.windowId);
    _tabs.forEach(tabModel => {
      if (tabModel.windowId === windowModel.windowId) {
        this.deleteTabModelByGuid(tabModel.tabGuid);
      }
    });
    persist();
    $(document).trigger('tabsLord:windowRemovedFromModel', [windowModel]);
  }

  /**** Tabs ****/

  function getTabModelById(tabId) {
    return makeImmutable(_tabs.get(tabId));
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
    const tabModel = {
      windowId: windowId,
      windowGuid: windowGuid,
      tabId: tabId,
      tabGuid: tabGuid || generateGuid(),
      text: tabTitle,
      icon: tabIcon,
      url: tabUrl,
      index: tabIndex,
      normalizedUrl: normalizeUrlForDuplicatesFinding(tabUrl),
      selected: isTabSelected,
      hibernated: tabUrl && isHibernatedUrl(tabUrl),
      audible: isTabAudible};
    _tabs.set(tabId, tabModel);
    const windowModel = Array.from(_windows.values()).find(_windowModel => _windowModel.windowGuid === windowGuid);
    windowModel.tabsCount = (windowModel.tabsCount || 0) + 1;
/*    if (tabIndex === 0 && _windowsFromPreviousSession) {
      const suggestedWindowTitle = _windowsFromPreviousSession.find(windowModel => windowModel.firstTabUrl = tabUrl);
      if (suggestedWindowTitle) {
        windowModel.text = suggestedWindowTitle;
      }
    }*/
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
    const windowModel = _windows.get(tabModel.windowId);
    if (windowModel) { // Can be delelted by async window deletion
      windowModel.tabsCount = (windowModel.tabsCount || 0) - 1;
    }
    saveToHistory(tabModel);
    _tabs.delete(tabModel.tabId);
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
    suggestWindowTitle
  };
}