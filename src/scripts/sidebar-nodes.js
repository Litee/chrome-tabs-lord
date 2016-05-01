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

  const _templateWindowNode = $('<li>').addClass('sidebar-window-node').addClass('sidebar-window-node-expanded')[0];
  $('<div>').addClass('sidebar-window-row').text(' ').appendTo(_templateWindowNode);
  $('<span>').addClass('sidebar-window-icon-expand-collapse').appendTo(_templateWindowNode);
  $('<a>').addClass('sidebar-window-anchor').attr('href', '#').attr('tabIndex', -1).appendTo(_templateWindowNode);
  $('<span>').appendTo(_templateWindowNode);
  $('<ul>').addClass('sidebar-tabs-list').appendTo(_templateWindowNode);

  const _templateTabNode = $('<li>').addClass('sidebar-tab-node')[0];
  $('<div>').addClass('sidebar-tab-row').text(' ').appendTo(_templateTabNode);
  $('<span>').addClass('sidebar-tab-favicon').appendTo(_templateTabNode);
  $('<a>').addClass('sidebar-tab-anchor').attr('href', '#').attr('tabIndex', -1).appendTo(_templateTabNode);
  $('<span>').addClass('sidebar-tab-icon').addClass('sidebar-tab-icon-close').appendTo(_templateTabNode);


  $.sidebar = {};

  $.sidebar.create = function(el) {
    const result = new $.sidebar.core(el);
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
      .on('contextmenu.sidebar', '.sidebar-tab-node', $.proxy(function (e) {
        log('Context menu clicked!', e);
        e.preventDefault();
        this._showNodeContextMenu(e);
      }, this))
      .on('click.sidebar', '.sidebar-window-icon-expand-collapse', $.proxy(function (e) {
        log('Clicked window expand/collapse!', e);
        $(e.currentTarget).parent().toggleClass('sidebar-window-node-expanded sidebar-window-node-collapsed');
      }, this))
      .on('contextmenu.sidebar', '.sidebar-tab-node', $.proxy(function (e) {
        log('Context menu clicked!', e);
        e.preventDefault();
        this._showNodeContextMenu(e);
      }, this));

      $(document)
      .on('mousedown.sidebar', e => {
        const contextMenu = $('.sidebar-context-menu');
        if(contextMenu.length > 0 && !$.contains(contextMenu[0], e.target)) {
          this._hideContextMenu();
        }
      })
      .on('keydown', (e) => {
        if (e.which === 27) { // Escape
          this._hideContextMenu();
        }
      });
    },

    _getTabElement: function(tabId) {
      return document.getElementById('sidebar-tab-' + tabId);
    },

    _getWindowElement: function(windowId) {
      return document.getElementById('sidebar-win-' + windowId);
    },

    _getTabIdsForWindow: function(windowId) {
      const result = [];
      this._model.tabs.forEach(tabModel => {
        if (tabModel.windowId === windowId) {
          result.push(tabModel.tabId);
        }
      });
      return result;
    },

    _closeTabClicked: function(e) {
      const tabNode = e.currentTarget.parentNode;
      const tabId = parseInt(tabNode.id.substring(12));
      log('Closed tab icon node clicked', tabId, tabNode);
      chrome.tabs.remove(tabId, () => {
        this._updateView();
      });
    },

    _tabNodeClicked: function(e) {
      this._hideContextMenu();
      const tabNode = e.currentTarget;
      const tabId = parseInt(tabNode.id.substring(12));
      log('Tab node clicked', tabId, tabNode, e);
      if (e.ctrlKey) {
        const tabElement = this._getTabElement(tabId);
        const tabModel = this._model.tabs.get(tabId);
        tabModel.selected = !tabModel.selected;
        if (tabModel.selected) {
          tabElement.children[0].classList.add('sidebar-tab-selected');
        }
        else {
          tabElement.children[0].classList.remove('sidebar-tab-selected');
        }
      }
      else {
        chrome.tabs.get(tabId, tab => {
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

    _hideContextMenu: function() {
      $('.sidebar-context-menu').remove();
    },

    _showNodeContextMenu: function(e) {
      const tabElement = e.currentTarget;
      if (!tabElement) {
        return false;
      }
      this._hideContextMenu();
      const tabId = parseInt(tabElement.id.substring(12));
      const tabAnchorElement = tabElement.children[2];
      // TODO: Alternative position for tabs at the end of the list
      const x = $(tabAnchorElement).offset().left;
      const y = $(tabAnchorElement).offset().top + 20;
      this._createContextMenuElement(tabId).css({'left':x, 'top': y}).appendTo('body');
    },

    _createContextMenuElement: function(contextTabId) {
      const result = $('<div></div>').addClass('sidebar-context-menu');
      const menuList = $('<span>Move to window:</span>').appendTo(result);
      const moveMenuUl = $('<ul>').addClass('sidebar-context-menu-items-list').appendTo(menuList);
      chrome.windows.getAll({populate: true, windowTypes: ['normal']}, windows => {
        windows.forEach(window => {
          const menuItemElement = $('<li>').addClass('sidebar-context-menu-item').appendTo(moveMenuUl);
          $('<a>').addClass('sidebar-context-menu-item-anchor').attr('href', '#').text('With tab "' + window.tabs[0].title + '"').appendTo(menuItemElement)
          .click('click', () => {
            log('Move window menu item clicked', contextTabId, window.id);
            const selectedTabIds = this._getSelectedTabIds();
            if (selectedTabIds.length === 0) {
              selectedTabIds.push(contextTabId);
            }
            this._moveSelectedTabsToWindow(selectedTabIds, window.id);
            this._hideContextMenu();
          });
        });
      });
      return result;
    },

    _getSelectedTabIds: function() {
      const selectedTabIds = [];
      this._model.tabs.forEach((tabModel, tabId) => {
        if (tabModel.selected) {
          selectedTabIds.push(tabId);
        }
      });
      return selectedTabIds;
    },

    _moveSelectedTabsToWindow: function(selectedTabIds, targetWindowId) {
      log('Moving tabs to window...', targetWindowId);
      chrome.tabs.move(selectedTabIds, {windowId: targetWindowId, index: -1}, function() {
        // TODO Restore selection
      });
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
        const tabsGroupedByUrl = new Map();
        const tabsCountByWindow = new Map();
        this._model.tabs.forEach((tabModel, tabId) => {
          const url = this._normalizeUrlForDuplicatesFinding(tabModel.url);
          const tabIdsByUrl = tabsGroupedByUrl.get(url) || [];
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
          const windowElement = this._getWindowElement(windowId);
          const windowModel = this._model.windows.get(windowId);
          windowElement.children[2].textContent = windowModel.text + ' (' + tabsCount + ')';
          windowModel.tabsCount = tabsCount;
        });
      }, 100);
    },

    addWindow: function(windowId, text) {
      if (!this._model.windows.has(windowId)) {
        const windowEl = _templateWindowNode.cloneNode(true);
        windowEl.id = 'sidebar-win-' + windowId;
        windowEl.children[2].textContent = text + '(1)';
        this._root.appendChild(windowEl);
        this._model.windows.set(windowId, {windowId: windowId, text: text});
        this._updateView();
      }
    },

    removeWindow: function(windowId) {
      const windowElement = this._getWindowElement(windowId);
      if (windowElement) {
        windowElement.remove();
      }
      const tabIdsToDelete = this._getTabIdsForWindow(windowId);
      tabIdsToDelete.forEach(tabId => {
        this._model.tabs.delete(tabId);
      });
      this._model.windows.delete(windowId);
    },

    addTab: function(windowId, tabId, pos, text, icon, url) {
      if (this._model.windows.has(windowId)) {
        const windowElement = this._getWindowElement(windowId);
        const tabElement = _templateTabNode.cloneNode(true);
        tabElement.id = 'sidebar-tab-' + tabId;
        tabElement.children[2].appendChild(document.createTextNode(text));
        tabElement.children[1].style.backgroundImage = 'url(' + icon + ')';
        windowElement.children[4].appendChild(tabElement);
        // Model update
        const tabModel = {windowId: windowId, tabId: tabId, text: text, icon: icon, url: url, selected: false};
        this._model.tabs.set(tabId, tabModel);
        this._updateView();
        return true;
      }
      return false;
    },

    removeTab: function(tabId) {
      const tabModel = this._model.tabs.get(tabId);
      if (tabModel) {
        this._model.tabs.delete(tabId);
        const tabElement = this._getTabElement(tabId);
        tabElement.remove();
      }
      this._updateView();
    },

    updateTab: function(tabId, text, icon, url) {
      log('Updating tab', tabId, text, icon, url);
      const tabElement = this._getTabElement(tabId);
      if (tabElement) {
        tabElement.children[2].textContent = text;
        tabElement.children[1].style.backgroundImage = 'url(' + icon + ')';
      }
      const tabModel = this._model.tabs.get(tabId);
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
          const tabElement = this._getTabElement(tabId);
          tabModel.selected = false;
          tabElement.children[0].classList.remove('sidebar-tab-selected');
        }
      });
      const tabElement = this._getTabElement(selectedTabId);
      tabElement.children[0].classList.add('sidebar-tab-selected');
      this._model.tabs.get(selectedTabId).selected = true;
      if (!$(tabElement).visible()) {
        const offset = $(tabElement).offset();
        if (offset) {
          jQuery(document).scrollTop($(tabElement).offset().top - 25);
        }
      }
    },

    moveTab: function(tabId, targetWindowId, pos) {
      const tabElement = this._getTabElement(tabId);
      const targetWindowElement = this._getWindowElement(targetWindowId);
      targetWindowElement.children[4].insertBefore(tabElement.parentNode.removeChild(tabElement), targetWindowElement.children[4].children[pos]);
      this._model.tabs.get(tabId).windowId = targetWindowId;
      this._updateView();
    },

    search: function(searchPattern) {
      // TODO Optimize to do DOM changes only when required
      const windowsWithVisibleTabs = new Map();
      this._model.tabs.forEach((tabModel, tabId) => {
        const tabElement = this._getTabElement(tabId);
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
        const windowElement = this._getWindowElement(windowId);
        const visibleTabsCount = windowsWithVisibleTabs.get(windowId) || 0;
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