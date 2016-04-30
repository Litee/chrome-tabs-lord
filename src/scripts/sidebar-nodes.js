/*globals jQuery, define, module, exports, require, window, document, postMessage */
(function (factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    define(['jquery'], factory);
  }
  else if(typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('jquery'));
  }
  else {
    factory(jQuery);
  }
}(function ($, undefined) {
  'use strict';

  if($.sidebar) {
    return;
  }

  $.fn.sidebar = function(arg) {
    return $.sidebar.create(this, arg);
  };

  var _templateWindowNode = document.createElement('li');
  _templateWindowNode.className = 'sidebar-window-node sidebar-window-node-expanded';
  var windowHighlightEl = document.createElement('div');
  windowHighlightEl.className = 'sidebar-window-row';
  windowHighlightEl.textContent = ' ';
  _templateWindowNode.appendChild(windowHighlightEl);
  var windowPrefixEl = document.createElement('span');
  windowPrefixEl.className = 'sidebar-window-icon-expand-collapse';
  _templateWindowNode.appendChild(windowPrefixEl);
  var windowAnchorEl = document.createElement('a');
  windowAnchorEl.className = 'sidebar-window-anchor';
  windowAnchorEl.setAttribute('href', '#');
  windowAnchorEl.setAttribute('tabIndex', '-1');
  _templateWindowNode.appendChild(windowAnchorEl);
  var windowSuffixEl = document.createElement('span');
  _templateWindowNode.appendChild(windowSuffixEl);
  var windowUl = document.createElement('ul');
  windowUl.className = 'sidebar-tabs-list';
  _templateWindowNode.appendChild(windowUl);

  var _templateTabNode = document.createElement('li');
  _templateTabNode.className = 'sidebar-tab-node';
  var tabHighlightEl = document.createElement('div');
  tabHighlightEl.className = 'sidebar-tab-row';
  tabHighlightEl.textContent = ' ';
  _templateTabNode.appendChild(tabHighlightEl);
  var tabPrefixEl = document.createElement('span');
  tabPrefixEl.className = 'sidebar-tab-favicon';
  _templateTabNode.appendChild(tabPrefixEl);
  var tabAnchorEl = document.createElement('a');
  tabAnchorEl.className = 'sidebar-tab-anchor';
  tabAnchorEl.setAttribute('href', '#');
  tabAnchorEl.setAttribute('tabIndex', '-1');
  _templateTabNode.appendChild(tabAnchorEl);
  var tabSuffixEl = document.createElement('span');
  tabSuffixEl.className = 'sidebar-tab-icon sidebar-tab-icon-close';
  _templateTabNode.appendChild(tabSuffixEl);


  $.sidebar = {};

  $.sidebar.create = function(el) {
    var result = new $.sidebar.core(el);
    result.init(el);
    return result;
  };

  $.sidebar.core = function(el) {
  };

  $.sidebar.core.prototype = {
    init: function(el) {
      this._model = {};
      this._model.windows = new Map();
      this._model.tabs = new Map();
      this._element = $(el).addClass('tabs-lorg-nav-root');
      this._root = $('<ul>').addClass('sidebar-nodes-container-list').appendTo(this._element)[0];
      this.bind();
    },

    bind: function() {
      this._element
      .on('click.sidebar', '.sidebar-tab-icon-close', $.proxy(function (e) {
        log('Close icon clicked!', e);
        e.stopImmediatePropagation();
        this._closeTabClicked(e);
      }, this))
      .on('click.sidebar', '.sidebar-tab-node', $.proxy(function (e) {
        log('Clicked!', e);
        e.preventDefault();
        this._tabNodeClicked(e);
      }, this))
      .on('click.sidebar', '.sidebar-window-icon-expand-collapse', $.proxy(function (e) {
        log('Clicked window expand/collapse!', e);
        $(e.currentTarget).parent().toggleClass('sidebar-window-node-expanded sidebar-window-node-collapsed');
      }, this));
    },

    _getTabElement: function(tabId) {
      return document.getElementById('sidebar-tab-' + tabId);
    },

    _getWindowElement: function(windowId) {
      return document.getElementById('sidebar-win-' + windowId);
    },

    _getTabIdsForWindow: function(windowId) {
      var result = [];
      this._model.tabs.forEach(tabModel => {
        if (tabModel.windowId === windowId) {
          result.push(tabModel.tabId);
        }
      });
      return result;
    },

    _closeTabClicked: function(e) {
      var tabNode = e.currentTarget.parentNode;
      var tabId = parseInt(tabNode.id.substring(12));
      log('Closed tab icon node clicked', tabId, tabNode);
      chrome.tabs.remove(tabId, () => {
        this._updateView();
      });
    },

    _tabNodeClicked: function(e) {
      var tabNode = e.currentTarget;
      var tabId = parseInt(tabNode.id.substring(12));
      log('Tab node clicked', tabId, tabNode, e);
      if (e.ctrlKey) {
        var tabElement = this._getTabElement(tabId);
        var tabModel = this._model.tabs.get(tabId);
        tabModel.selected = !tabModel.selected;
        if (tabModel.selected) {
          tabElement.children[0].classList.add('sidebar-tab-selected');
        }
        else {
          tabElement.children[0].classList.remove('sidebar-tab-selected');
        }
      }
      else {
        chrome.tabs.get(tabId, function(tab) {
          chrome.windows.get(tab.windowId, {}, window => {
            if (!tab.active) {
              log('Activating tab because node was selected', tab);
              chrome.tabs.update(tab.id, {active: true});
            }
            if (!window.focused) {
              chrome.windows.update(tab.windowId, {focused: true});
            }
          });
        });
      }
    },

    _normalizeUrlForDuplicatesFinding: function(url) {
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
      }
      return url;
    },

    _updateViewTimer: null,
    _updateView: function() {
      if (this._updateViewTimer) {
        clearTimeout(this._updateViewTimer);
      }
      this._updateViewTimer = setTimeout(() => {
        log('Updating view...', this._model.tabs);
        var tabsGroupedByUrl = new Map();
        var tabsCountByWindow = new Map();
        this._model.tabs.forEach((tabModel, tabId) => {
          var url = this._normalizeUrlForDuplicatesFinding(tabModel.url);
          var tabIdsByUrl = tabsGroupedByUrl.get(url) || [];
          tabIdsByUrl.push(tabId);
          tabsGroupedByUrl.set(url, tabIdsByUrl);

          tabsCountByWindow.set(tabModel.windowId, (tabsCountByWindow.get(tabModel.windowId) || 0) + 1);

          if (tabModel.url && tabModel.url.indexOf('chrome-extension://klbibkeccnjlkjkiokjodocebajanakg') === 0) {
            log('Hibernated tab found', tabModel);
            this._getTabElement(tabId).classList.add('sidebar-tab-hibernated');
          }
          else {
            this._getTabElement(tabId).classList.remove('sidebar-tab-hibernated');
          }
        });
        log('Duplicates analysis result', tabsGroupedByUrl);
        tabsGroupedByUrl.forEach((tabIds, url) => {
          tabIds.forEach(tabId => {
            if (tabIds.length > 1) {
              log('Duplicate URL found', url, tabId);
              this._getTabElement(tabId).children[2].classList.add('sidebar-tab-duplicate');
            }
            else {
              this._getTabElement(tabId).children[2].classList.remove('sidebar-tab-duplicate');
            }
          });
        });
        tabsCountByWindow.forEach((tabsCount, windowId) => {
          var windowElement = this._getWindowElement(windowId);
          var windowModel = this._model.windows.get(windowId);
          windowElement.children[2].textContent = windowModel.text + ' (' + tabsCount + ')';
          windowModel.tabsCount = tabsCount;
        });
      }, 500);
    },

    addWindow: function(windowId, text) {
      if (!this._model.windows.has(windowId)) {
        var windowEl = _templateWindowNode.cloneNode(true);
        windowEl.id = 'sidebar-win-' + windowId;
        windowEl.children[2].textContent = text + '(1)';
        this._root.appendChild(windowEl);
        this._model.windows.set(windowId, {windowId: windowId, text: text});
        this._updateView();
      }
    },

    removeWindow: function(windowId) {
      var windowElement = this._getWindowElement(windowId);
      if (windowElement) {
        windowElement.remove();
      }
      var tabIdsToDelete = this._getTabIdsForWindow(windowId);
      tabIdsToDelete.forEach(tabId => {
        this._model.tabs.delete(tabId);
      });
      this._model.windows.delete(windowId);
    },

    addTab: function(windowId, tabId, pos, text, icon, url) {
      if (this._model.windows.has(windowId)) {
        var windowElement = this._getWindowElement(windowId);
        var tabElement = _templateTabNode.cloneNode(true);
        tabElement.id = 'sidebar-tab-' + tabId;
        tabElement.children[2].appendChild(document.createTextNode(text));
        tabElement.children[1].style.backgroundImage = 'url(' + icon + ')';
        windowElement.children[4].appendChild(tabElement);
        // Model update
        var tabModel = {windowId: windowId, tabId: tabId, text: text, icon: icon, url: url, selected: false};
        this._model.tabs.set(tabId, tabModel);
        this._updateView();
        return true;
      }
      return false;
    },

    removeTab: function(tabId) {
      var tabModel = this._model.tabs.get(tabId);
      if (tabModel) {
        this._model.tabs.delete(tabId);
        var tabElement = this._getTabElement(tabId);
        tabElement.remove();
      }
      this._updateView();
    },

    setTabText: function(tabId, tabText) {
      log('Setting text for tab', tabId, tabText);
      var tabElement = this._getTabElement(tabId);
      if (tabElement) {
        tabElement.children[2].textContent = tabText;
      }
    },

    setTabIcon: function(tabId, icon) {
      log('Setting icon for tab', tabId, icon);
      var tabElement = this._getTabElement(tabId);
      if (tabElement) {
        tabElement.children[1].style.backgroundImage = 'url(' + icon + ')';
      }
    },

    setTabUrl: function(tabId, url) {
      log('Setting URL for tab', tabId, url);
      var tabModel = this._model.tabs.get(tabId);
      if (tabModel) {
        tabModel.url = url;
      }
      this._updateView();
    },

    selectTab: function(selectedTabId) {
      log('Selecting tab', selectedTabId);
      this._model.tabs.forEach((tabModel, tabId) => {
        if (tabId !== selectedTabId && tabModel.selected) {
          log('Deselecting tab', tabId, tabModel);
          var tabElement = this._getTabElement(tabId);
          tabModel.selected = false;
          tabElement.children[0].classList.remove('sidebar-tab-selected');
        }
      });
      var tabElement = this._getTabElement(selectedTabId);
      tabElement.children[0].classList.add('sidebar-tab-selected');
      this._model.tabs.get(selectedTabId).selected = true;
      if (!$(tabElement).visible()) {
        var offset = $(tabElement).offset();
        if (offset) {
          jQuery(document).scrollTop($(tabElement).offset().top - 25);
        }
      }
    },

    moveTab: function(tabId, targetWindowId, pos) {
      var tabElement = this._getTabElement(tabId);
      var targetWindowElement = this._getWindowElement(targetWindowId);
      targetWindowElement.children[4].insertBefore(tabElement.parentNode.removeChild(tabElement), targetWindowElement.children[4].children[pos]);
      this._model.tabs.get(tabId).windowId = targetWindowId;
      this._updateView();
    },

    search: function(searchPattern) {
      // TODO Optimize to do DOM changes only when required
      var windowsWithVisibleTabs = new Map();
      this._model.tabs.forEach((tabModel, tabId) => {
        var tabElement = this._getTabElement(tabId);
        if (searchPattern.length === 0) { // making visible due to search reset
          tabElement.classList.remove('sidebar-tab-hidden');
          tabElement.classList.remove('sidebar-tab-search-match');
          windowsWithVisibleTabs.set(tabModel.windowId, (windowsWithVisibleTabs.get(tabModel.windowId) || 0) + 1);
        }
        else if (tabModel.text.toLowerCase().indexOf(searchPattern) >= 0 || tabModel.url.toLowerCase().indexOf(searchPattern) >= 0) { // showing as match
          tabElement.classList.remove('sidebar-tab-hidden');
          tabElement.classList.add('sidebar-tab-search-match');
          windowsWithVisibleTabs.set(tabModel.windowId, (windowsWithVisibleTabs.get(tabModel.windowId) || 0) + 1);
        }
        else { // hiding as mismatch
          tabElement.classList.add('sidebar-tab-hidden');
          tabElement.classList.remove('sidebar-tab-search-match');
        }
      });
      this._model.windows.forEach((windowModel, windowId) => {
        var windowElement = this._getWindowElement(windowId);
        var visibleTabsCount = windowsWithVisibleTabs.get(windowId) || 0;
        if (visibleTabsCount > 0) {
          windowElement.classList.remove('sidebar-window-hidden');
        }
        else {
          windowElement.classList.add('sidebar-window-hidden');
        }
        if (visibleTabsCount < windowModel.tabsCount) {
          windowElement.children[2].textContent = windowModel.text + ' (' + visibleTabsCount + '/' + windowModel.tabsCount + ')';
        }
        else {
          windowElement.children[2].textContent = windowModel.text + ' (' + windowModel.tabsCount + ')';
        }
      });
    }
  };
}));