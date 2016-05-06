function Model() {
  'use strict';
  const _windows = new Map();
  const _tabs = new Map();
  let _savedStateAsString;

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

  return {
    getWindowModelById: function(windowId) {
      const foundWindowModel = Array.from(_windows.values()).find(windowModel => windowModel.windowId === windowId);
      return makeImmutable(foundWindowModel);
    },
    getWindowModelByGuid: function(windowGuid) {
      const foundWindowModel = Array.from(_windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
      return makeImmutable(foundWindowModel);
    },
    addWindowModel: function(windowGuid, windowId, windowTitle, isHibernated) {
      const windowModel = {windowId: windowId, text: windowTitle, windowGuid: (windowGuid || generateGuid()), hibernated: (isHibernated || false)};
      _windows.set(windowId, windowModel);
      this.persist();
      $(document).trigger('tabsLord:windowAddedToModel', [windowModel]);
    },
    updateWindowModelByGuid: function(windowGuid, updateInfo) {
      const foundWindowModel = Array.from(_windows.values()).find(windowModel => windowModel.windowGuid === windowGuid);
      if (updateInfo.text) {
        foundWindowModel.text = updateInfo.text;
      }
      if (updateInfo.hibernated !== undefined) {
        foundWindowModel.hibernated = true;
      }
      this.persist();
    },
    deleteWindowModelByGuid: function(windowGuid) {
      const windowModel = this.getWindowModelByGuid(windowGuid);
      _windows.delete(windowModel.windowId);
      _tabs.forEach(tabModel => {
        if (tabModel.windowId === windowModel.windowId) {
          this.deleteTabModel(tabModel.id);
        }
      });
      this.persist();
      $(document).trigger('tabsLord:windowRemovedFromModel', [windowModel]);
    },
    forEachWindow: function(callback) {
      _windows.forEach(windowModel => callback(windowModel));
    },
    getTabModelById: function(tabId) {
      return makeImmutable(_tabs.get(tabId));
    },
    getTabModelByGuid: function(tabGuid) {
      const foundTabModel = Array.from(_tabs.values()).find(tabModel => tabModel.tabGuid === tabGuid);
      return makeImmutable(foundTabModel);
    },
    getTabsCount: function() {
      return _tabs.size;
    },
    addTabModel: function(windowId, windowGuid, tabId, tabTitle, tabIcon, tabUrl, tabIndex, isTabSelected, isTabAudible) {
      debug('Adding tab model', arguments);
      const tabModel = {
        windowId: windowId,
        windowGuid: windowGuid,
        tabId: tabId,
        tabGuid: generateGuid(),
        text: tabTitle,
        icon: tabIcon,
        url: tabUrl,
        index: tabIndex,
        normalizedUrl: normalizeUrlForDuplicatesFinding(tabUrl),
        selected: isTabSelected,
        hibernated: tabUrl && isHibernatedUrl(tabUrl),
        audible: isTabAudible};
      _tabs.set(tabId, tabModel);
      const windowModel = _windows.get(windowId);
      windowModel.tabsCount = (windowModel.tabsCount || 0) + 1;
      this.persist();
      $(document).trigger('tabsLord:tabAddedToModel', [tabModel]);
    },
    deleteTabModelByGuid: function(tabGuid) {
      const tabModel = this.getTabModelByGuid(tabGuid);
      const windowModel = _windows.get(tabModel.windowId);
      windowModel.tabsCount = (windowModel.tabsCount || 0) - 1;
      _tabs.delete(tabModel.tabId);
      this.persist();
    },
    updateTabModelByGuid: function(tabGuid, updateInfo) {
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
      this.persist();
    },
    getFirstTabForWindow: function(windowGuid) {
      return Array.from(_tabs.values()).find(tabModel => tabModel.windowGuid === windowGuid);
    },
    getSelectedTabModels: function() {
      const selectedTabModels = [];
      _tabs.forEach(tabModel => {
        if (tabModel.selected) {
          selectedTabModels.push(makeImmutable(tabModel));
        }
      });
      return selectedTabModels;
    },
    unselectAllTabs: function() {
      _tabs.forEach(tabModel => {
        tabModel.selected = false;
      });
    },
    forEachTab: function(callback) {
      _tabs.forEach((tabModel) => callback(tabModel));
    },
    forEachTabByUrl: function(callback) {
      const tabGuidsByUrl = new Map();
      _tabs.forEach(tabModel => {
        const tabGuids = tabGuidsByUrl.get(tabModel.normalizedUrl) || [];
        tabGuids.push(tabModel.tabGuid);
        tabGuidsByUrl.set(tabModel.normalizedUrl, tabGuids);
      });
      tabGuidsByUrl.forEach(tabGuids => callback(tabGuids));
    },
    persist: function() {
      log('Saving state...');
      const state = {
        windows: Array.from(_windows.values()),
        tabs: Array.from(_tabs.values())
      };
      const newStateAsString = JSON.stringify(state);
      if (newStateAsString !== _savedStateAsString) {
        localStorage.setItem('tabs-lord-state', newStateAsString);
        _savedStateAsString = newStateAsString;
      }
    },
    restore: function() {
      const stateAsString = localStorage.getItem('tabs-lord-state');
      if (stateAsString) {
        const state = JSON.parse(stateAsString);
        _savedStateAsString = stateAsString;
        state.windows.forEach(windowModel => {
          if (windowModel.hibernated) {
            log('Restoring window from state', windowModel);
            // this.addWindowModel(windowModel.windowGuid, -1, windowModel.text, true);
          }
        });
      }
    }
  };
}