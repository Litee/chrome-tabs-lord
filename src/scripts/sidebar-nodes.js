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
	_templateWindowNode.className = 'sidebar-window-node';
	var windowHighlightEl = document.createElement('div');
	windowHighlightEl.className = 'sidebar-window-row';
	windowHighlightEl.textContent = ' ';
	_templateWindowNode.appendChild(windowHighlightEl);
	var windowPrefixEl = document.createElement('span');
	windowPrefixEl.className = 'sidebar-window-prefix';
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
	var _windowUlPos = 4;

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
      this._element.on('click.sidebar', '.sidebar-tab-node', $.proxy(function (e) {
      	log('Clicked!', e);
      	this._tabNodeClicked(e);
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

    _tabNodeClicked: function(e) {
      var tabNode = e.currentTarget;
      var tabId = parseInt(tabNode.id.substring(12));
      log('Tab node clicked', tabId, tabNode);
      chrome.tabs.get(tabId, function(tab) {
        chrome.windows.get(tab.windowId, {}, function(window) {
          if (!tab.active) {
            log('Activating tab because node was selected', tab);
            chrome.tabs.update(tab.id, {active: true});
          }
          if (!window.focused) {
            chrome.windows.update(tab.windowId, {focused: true});
          }
        });
      });
    },

    _detectDuplicatesTimer: null,
    _detectDuplicates: function() {
	    if (this._detectDuplicatesTimer) {
	      clearTimeout(this._detectDuplicatesTimer);
	    }
	    this._detectDuplicatesTimer = setTimeout(() => {
	      log('Detecting duplicates...', this._model.tabs);
	      var tabsGroupedByUrl = new Map();
	      this._model.tabs.forEach((tabModel, tabId) => {
	      	var url = tabModel.url;
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
	      	var tabIds = tabsGroupedByUrl.get(url);
	      	if (tabIds === undefined) {
	      	  tabIds = [];
	      	}
	      	tabIds.push(tabId);
	      	tabsGroupedByUrl.set(url, tabIds);
	      	if (tabModel.url && tabModel.url.indexOf('chrome-extension://klbibkeccnjlkjkiokjodocebajanakg') === 0) {
              log('Hibernated tab found', tabModel);
              this._getTabElement(tabId).classList.add('sidebar-tab-hibernated');
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
	    }, 500);
    },

    addWindow: function(windowId, text) {
      if (!this._model.windows.has(windowId)) {
        var windowEl = _templateWindowNode.cloneNode(true);
        windowEl.id = 'sidebar-win-' + windowId;
        windowEl.children[2].textContent = text + '(1)';
        this._root.appendChild(windowEl);
        this._model.windows.set(windowId, {windowId: windowId, text: text});
        this._detectDuplicates();
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
        var windowModel = this._model.windows.get(windowId);
        var windowElement = this._getWindowElement(windowId);
        var tabElement = _templateTabNode.cloneNode(true);
        tabElement.id = 'sidebar-tab-' + tabId;
        tabElement.children[2].appendChild(document.createTextNode(text));
        tabElement.children[1].style.backgroundImage = 'url(' + icon + ')';
        windowElement.children[4].appendChild(tabElement);
        // Model update
        var tabModel = {windowId: windowId, tabId: tabId, text: text, icon: icon, url: url, selected: false};
        this._model.tabs.set(tabId, tabModel);
        var tabIdsForWindow = this._getTabIdsForWindow(windowId);
        windowElement.children[2].textContent = windowModel.text + ' (' + tabIdsForWindow.length + ')';
        this._detectDuplicates();
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
      var tabIdsForWindow = this._getTabIdsForWindow(tabModel.windowId);
      var windowElement = this._getWindowElement(tabModel.windowId);
      var windowModel = this._model.windows.get(tabModel.windowId);
      windowElement.children[2].textContent = windowModel.text + ' (' + tabIdsForWindow.length + ')';
      this._detectDuplicates();
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
      this._detectDuplicates();
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
	    var offset = tabElement.offset();
	    if (offset) {
	      jQuery(document).scrollTop(tabElement.offset().top - 25);
	    }
	  }
    },

    moveTab: function(tabId, targetWindowId, pos) {
      var tabElement = this._getTabElement(tabId);
      var targetWindowElement = this._getWindowElement(targetWindowId);
      targetWindowElement.children[4].insertBefore(tabElement.parentNode.removeChild(tabElement), targetWindowElement.children[4].children[pos]);
      this._model.tabs.get(tabId).windowId = targetWindowId;
    },

    search: function(searchPattern) {
      this._model.tabs.forEach((tabModel, tabId) => {
      	var tabElement = this._getTabElement(tabId);
      	if (searchPattern.length === 0) {
          tabElement.classList.remove('sidebar-tab-hidden');
          tabElement.classList.remove('sidebar-tab-search-match');
      	}
      	else if (tabModel.text.toLowerCase().indexOf(searchPattern) === -1 && tabModel.url.toLowerCase().indexOf(searchPattern) === -1) {
          tabElement.classList.add('sidebar-tab-hidden');
          tabElement.classList.remove('sidebar-tab-search-match');
      	}
      	else {
          tabElement.classList.remove('sidebar-tab-hidden');
          tabElement.classList.add('sidebar-tab-search-match');
      	}
      });
    }
  };
}));