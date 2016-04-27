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
	var _windowUlPos = 3;

	var _templateTabNode = document.createElement('li');
	_templateTabNode.className = 'sidebar-tab-node';
	var tabPrefixEl = document.createElement('span');
	tabPrefixEl.className = 'sidebar-tab-icon';
	_templateTabNode.appendChild(tabPrefixEl);
	var tabAnchorEl = document.createElement('a');
	tabAnchorEl.className = 'sidebar-tab-anchor';
	tabAnchorEl.setAttribute('href', '#');
	tabAnchorEl.setAttribute('tabIndex', '-1');
	_templateTabNode.appendChild(tabAnchorEl);
	var tabSuffixEl = document.createElement('span');
	tabSuffixEl.className = 'sidebar-tab-suffix';
	_templateTabNode.appendChild(tabSuffixEl);


  $.sidebar = {};

  $.sidebar.create = function(el) {
    var result = new $.sidebar.core(el);
    result.init(el);
    return result;
  };

  $.sidebar.core = function(el) {
    this.bind();
  };

  $.sidebar.core.prototype = {
    init: function(el) {
      this._model = {};
      this._model.windows = new Map();
      this._model.tabs = new Map();
      this._element = $(el).addClass('tabs-lorg-nav-root');
      this._root = $('<ul>').addClass('sidebar-nodes-container-list').appendTo(this._element)[0];
    },

    bind: function() {
      // TODO
    },

    _getTabElement: function(tabId) {
      return document.getElementById('sidebar-tab-' + tabId);
    },

    _getWindowElement: function(windowId) {
      return document.getElementById('sidebar-win-' + windowId);
    },

    _removeTab: function(windowId, tabId) {
      // TODO Make more defensive
      delete this._model.windows[windowId].tabs[tabId];
      delete this._model.tabs[tabId];
    },


    _detectDuplicatesTimer: null,
    _detectDuplicates: function() {
	    if (this._detectDuplicatesTimer) {
	      clearTimeout(this._detectDuplicatesTimer);
	    }
	    this._detectDuplicatesTimer = setTimeout(() => {
	      log('Detecting duplicates...');
	      var tabsGroupedByUrl = new Map();
	      this._model.tabs.forEach((tabModel, tabId) => {
	      	var tabIds = tabsGroupedByUrl.get(tabModel.url);
	      	if (tabIds === undefined) {
	      	  tabIds = [];
	      	}
	      	tabIds.push(tabId);
	      	tabsGroupedByUrl.set(tabModel.url, tabIds);
	      });
	      log('Duplicates analysis result', tabsGroupedByUrl);
	      tabsGroupedByUrl.forEach((tabIds, url) => {
	        tabIds.forEach(tabId => {
	          if (tabIds.length > 1) {
	            log('Duplicate URL found', url, tabIds);
	          	this._getTabElement(tabId).classList.add('sidebar-tab-duplicate');
	          }
	          else {
	          	this._getTabElement(tabId).classList.remove('sidebar-tab-duplicate');
	          }
	        });
	      });
	    }, 500);
    },

    addWindow: function(windowId, text) {
      var windowEl = _templateWindowNode.cloneNode(true);
      windowEl.id = 'sidebar-win-' + windowId;
      windowEl.children[1].appendChild(document.createTextNode(text));
      this._root.appendChild(windowEl);
      this._model.windows[windowId] = {text: text, tabs: new Map()};
    },

    removeWindow: function(windowId) {
      var windowElement = this._getWindowElement(windowId);
      if (windowElement) {
        windowElement.remove();
      }
      this._model.windows[windowId].tabs.forEach(function(tabId, tabModel) { this._deleteTab(windowId, tabId); });
      delete this._model.window[windowId];
    },

    addTab: function(windowId, tabId, pos, text, icon, url) {
      var windowModel = this._model.windows[windowId];
      if (windowModel) {
        var windowElement = this._getWindowElement(windowId);
        var tabElement = _templateTabNode.cloneNode(true);
        tabElement.id = 'sidebar-tab-' + tabId;
        tabElement.children[1].appendChild(document.createTextNode(text));
        tabElement.children[0].style.backgroundImage = 'url(' + icon + ')';
        windowElement.children[3].appendChild(tabElement);
        // Model update
        var tabModel = {tabId: tabId, text: text, icon: icon, url: url};
        windowModel.tabs.set(tabId, tabModel);
        this._model.tabs.set(tabId, tabModel);
        windowElement.children[1].textContent = windowModel.text + ' (' + Object.keys(windowModel.tabs).length + ')';
        this._detectDuplicates();
        return true;
      }
      return false;
    },

    setTabText: function(tabId, tabText) {
      log('Setting text for tab', tabId, tabText);
      var tabElement = this._getTabElement(tabId);
      if (tabElement) {
        tabElement.children[1].textContent = tabText;
      }
    },

    setTabIcon: function(tabId, icon) {
      log('Setting icon for tab', tabId, icon);
      var tabElement = this._getTabElement(tabId);
      if (tabElement) {
        tabElement.children[0].style.backgroundImage = 'url(' + icon + ')';
      }
    },

    setTabUrl: function(tabId, url) {
      log('Setting URL for tab', tabId, url);
      var tabModel = this._model.tabs[tabId];
      if (tabModel) {
        tabModel.url = url;
      }
      this._detectDuplicates();
    }
  };
}));