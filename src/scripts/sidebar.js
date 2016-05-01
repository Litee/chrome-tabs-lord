$(document).ready(onReady);

function onReady() {
  'use strict';
  log('Sidebar view loaded! Reading information about existing windows...');

  const sidebarContainer = $('#sidebar-nodes-container').addClass('tabs-lorg-nav-root');

  const templateWindowNode = $('<li>').addClass('sidebar-window-node').addClass('sidebar-window-node-expanded');
  $('<div>').addClass('sidebar-window-row').text(' ').appendTo(templateWindowNode);
  $('<span>').addClass('sidebar-window-icon-expand-collapse').appendTo(templateWindowNode);
  $('<a>').addClass('sidebar-window-anchor').attr('href', '#').attr('tabIndex', -1).appendTo(templateWindowNode);
  $('<span>').appendTo(templateWindowNode);
  $('<ul>').addClass('sidebar-tabs-list').appendTo(templateWindowNode);

  const templateTabNode = $('<li>').addClass('sidebar-tab-node');
  $('<div>').addClass('sidebar-tab-row').text(' ').appendTo(templateTabNode);
  $('<span>').addClass('sidebar-tab-favicon').appendTo(templateTabNode);
  $('<a>').addClass('sidebar-tab-anchor').attr('href', '#').attr('tabIndex', -1).appendTo(templateTabNode);
  $('<span>').addClass('sidebar-tab-icon').addClass('sidebar-tab-icon-close').appendTo(templateTabNode);

  var model = {};
  model.windows = new Map();
  model.tabs = new Map();

  var windowsListElement = $('<ul>').addClass('sidebar-nodes-container-list').appendTo(sidebarContainer);
  bind();
  log('Parsing existing windows...');
  chrome.windows.getAll({populate: true, windowTypes: ['normal']}, windowsArr => {
    windowsArr.forEach(window => {
      setTimeout(() => {
        log('Populating window', window);
        onWindowCreated(window);
        window.tabs.forEach(tab => {
          log('Populating tab', tab);
          onTabCreated(tab);
        });
      }, 1);
    });
    log('Existing windows parsed!');
  });
  chrome.windows.onCreated.addListener(onWindowCreated);
  chrome.windows.onRemoved.addListener(onWindowRemoved);
  chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);
  chrome.tabs.onCreated.addListener(onTabCreated);
  chrome.tabs.onRemoved.addListener(onTabRemoved);
  chrome.tabs.onUpdated.addListener(onTabUpdated);
  chrome.tabs.onMoved.addListener(onTabMoved);
  chrome.tabs.onAttached.addListener(onTabAttached);
  chrome.tabs.onActivated.addListener(onTabActivated);
  chrome.tabs.onReplaced.addListener(onTabReplaced);

  function bind() {
    sidebarContainer
      .on('click.sidebar', '.sidebar-tab-icon-close', $.proxy(function (e) {
        log('Close icon clicked!', e);
        e.stopImmediatePropagation();
        closeTabClicked(e);
      }, this))
      .on('click.sidebar', '.sidebar-tab-node', $.proxy(function (e) {
        log('Clicked!', e);
        e.preventDefault();
        tabNodeClicked(e);
      }, this))
      .on('dblclick.sidebar', '.sidebar-tab-node', $.proxy(function (e) {
        log('Double-Clicked!', e);
        e.preventDefault();
        tabNodeDoubleClicked(e);
      }, this))
      .on('contextmenu.sidebar', '.sidebar-tab-node', $.proxy(function (e) {
        log('Context menu clicked!', e);
        e.preventDefault();
        showNodeContextMenu(e);
      }, this))
      .on('click.sidebar', '.sidebar-window-icon-expand-collapse', $.proxy(function (e) {
        log('Clicked window expand/collapse!', e);
        $(e.currentTarget).parent().toggleClass('sidebar-window-node-expanded sidebar-window-node-collapsed');
      }, this))
      .on('contextmenu.sidebar', '.sidebar-tab-node', $.proxy(function (e) {
        log('Context menu clicked!', e);
        e.preventDefault();
        showNodeContextMenu(e);
      }, this));

    $(document)
      .on('mousedown.sidebar', e => {
        const contextMenu = $('.sidebar-context-menu');
        if(contextMenu.length > 0 && !$.contains(contextMenu[0], e.target)) {
          hideContextMenu();
        }
      })
      .on('keydown', (e) => {
        if (e.which === 27) { // Escape
          hideContextMenu();
        }
      });
  }

  function getTabElement(tabId) {
    return document.getElementById('sidebar-tab-' + tabId);
  }

  function getWindowElement(windowId) {
    return document.getElementById('sidebar-win-' + windowId);
  }

  function getTabIdsForWindow(windowId) {
    const result = [];
    model.tabs.forEach(tabModel => {
      if (tabModel.windowId === windowId) {
        result.push(tabModel.tabId);
      }
    });
    return result;
  }

  function closeTabClicked(e) {
    const tabNode = e.currentTarget.parentNode;
    const tabId = parseInt(tabNode.id.substring(12));
    log('Closed tab icon node clicked', tabId, tabNode);
    chrome.tabs.remove(tabId, () => {
      updateView();
    });
  }

  function tabNodeClicked(e) {
    hideContextMenu();
    const tabNode = e.currentTarget;
    const tabId = parseInt(tabNode.id.substring(12));
    log('Tab node clicked', tabId, tabNode, e);
    if (e.ctrlKey) {
      const tabElement = getTabElement(tabId);
      const tabModel = model.tabs.get(tabId);
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
  }

  function tabNodeDoubleClicked(e) {
    hideContextMenu();
    const tabNode = e.currentTarget;
    const tabId = parseInt(tabNode.id.substring(12));
    const tabModel = model.tabs.get(tabId);
    log('Tab node double-clicked', tabId, tabNode, e);
    if (isHibernatedUrl(tabModel.url)) {
      sendMessageToTab(tabId, {action: 'unsuspendOne'});
    }
    else {
      sendMessageToTab(tabId, {action: 'suspendOne'});
    }
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
    const tabId = parseInt(tabElement.id.substring(12));
    const tabAnchorElement = tabElement.children[2];
      // TODO: Alternative position for tabs at the end of the list
    const x = $(tabAnchorElement).offset().left;
    const y = $(tabAnchorElement).offset().top + 20;
    createContextMenuElement(tabId).css({'left':x, 'top': y}).appendTo('body');
  }

  function createContextMenuElement(contextTabId) {
    const result = $('<div></div>').addClass('sidebar-context-menu');
    const menuList = $('<span>Move to window:</span>').appendTo(result);
    const moveMenuUl = $('<ul>').addClass('sidebar-context-menu-items-list').appendTo(menuList);
    const selectedTabIds = getSelectedTabIds();
    if (selectedTabIds.length === 0) {
      selectedTabIds.push(contextTabId);
    }
    chrome.windows.getAll({populate: true, windowTypes: ['normal']}, windows => {
      windows.forEach(window => {
        const menuItemElement = $('<li>').addClass('sidebar-context-menu-item').appendTo(moveMenuUl);
        $('<a>').addClass('sidebar-context-menu-item-anchor').attr('href', '#').text('With tab "' + window.tabs[0].title + '"').appendTo(menuItemElement)
          .click('click', () => {
            log('"Move to another window" menu item clicked', contextTabId, window.id);
            moveSelectedTabsToWindow(selectedTabIds, window.id);
            hideContextMenu();
          });
      });
      const menuItemElement = $('<li>').addClass('sidebar-context-menu-item').appendTo(moveMenuUl);
      $('<a>').addClass('sidebar-context-menu-item-anchor').attr('href', '#').text('New window').appendTo(menuItemElement)
        .click('click', () => {
          log('"Move to new window" menu item clicked', contextTabId, window.id);
          chrome.windows.create({
            type: 'normal',
            tabId: selectedTabIds[0]
          }, function(newWindow) {
            moveSelectedTabsToWindow(selectedTabIds.slice(1), newWindow.id);
            hideContextMenu();
          });
        });
    });
    return result;
  }

  function getSelectedTabIds() {
    const selectedTabIds = [];
    model.tabs.forEach((tabModel, tabId) => {
      if (tabModel.selected) {
        selectedTabIds.push(tabId);
      }
    });
    return selectedTabIds;
  }

  function moveSelectedTabsToWindow(selectedTabIds, targetWindowId) {
    log('Moving tabs to window...', targetWindowId);
    chrome.tabs.move(selectedTabIds, {windowId: targetWindowId, index: -1}, function() {
        // TODO Restore selection
    });
  }

  function isHibernatedUrl(url) {
    return url.indexOf('chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#uri=') === 0;
  }

  function normalizeUrlForDuplicatesFinding(url) {
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
  }

  var updateViewTimer = null;
  function updateView() {
    if (updateViewTimer) {
      clearTimeout(updateViewTimer);
    }
    updateViewTimer = setTimeout(() => {
      log('Updating view...', model.tabs);
      const tabsGroupedByUrl = new Map();
      const tabsCountByWindow = new Map();
      model.tabs.forEach((tabModel, tabId) => {
        const url = normalizeUrlForDuplicatesFinding(tabModel.url);
        const tabIdsByUrl = tabsGroupedByUrl.get(url) || [];
        tabIdsByUrl.push(tabId);
        tabsGroupedByUrl.set(url, tabIdsByUrl);

        tabsCountByWindow.set(tabModel.windowId, (tabsCountByWindow.get(tabModel.windowId) || 0) + 1);

        if (tabModel.url && isHibernatedUrl(tabModel.url)) {
          log('Hibernated tab found', tabModel);
          getTabElement(tabId).classList.add('sidebar-tab-hibernated');
        }
        else {
          getTabElement(tabId).classList.remove('sidebar-tab-hibernated');
        }
      });
      log('Duplicates analysis result', tabsGroupedByUrl);
      tabsGroupedByUrl.forEach((tabIds, url) => {
        tabIds.forEach(tabId => {
          if (tabIds.length > 1) {
            log('Duplicate URL found', url, tabId);
            getTabElement(tabId).children[2].classList.add('sidebar-tab-duplicate');
          }
          else {
            getTabElement(tabId).children[2].classList.remove('sidebar-tab-duplicate');
          }
        });
      });
      tabsCountByWindow.forEach((tabsCount, windowId) => {
        const windowElement = getWindowElement(windowId);
        const windowModel = model.windows.get(windowId);
        windowElement.children[2].textContent = windowModel.text + ' (' + tabsCount + ')';
        windowModel.tabsCount = tabsCount;
      });
    }, 100);
  }

  function sendMessageToTab(tabId, message, callback) {
    log('Sending message to tab', tabId, message, callback);
    chrome.runtime.sendMessage('klbibkeccnjlkjkiokjodocebajanakg', message);
  }

  function addWindowNode(windowId, text) {
    if (!model.windows.has(windowId)) {
      templateWindowNode.clone()
        .attr('id', 'sidebar-win-' + windowId)
        .appendTo(windowsListElement)
        .children('.sidebar-window-anchor')
        .text(text + '(1)');
      model.windows.set(windowId, {windowId: windowId, text: text});
      updateView();
    }
  }

  function removeWindowNode(windowId) {
    const windowElement = getWindowElement(windowId);
    if (windowElement) {
      windowElement.remove();
    }
    const tabIdsToDelete = getTabIdsForWindow(windowId);
    tabIdsToDelete.forEach(tabId => {
      model.tabs.delete(tabId);
    });
    model.windows.delete(windowId);
  }

  function addTab(windowId, tabId, pos, text, icon, url) {
    if (model.windows.has(windowId)) {
      const windowElement = getWindowElement(windowId);
      const tabElement = templateTabNode.clone()
        .attr('id', 'sidebar-tab-' + tabId)
        .appendTo($(windowElement).children('.sidebar-tabs-list'));
      tabElement.children('.sidebar-tab-anchor').text(text);
      tabElement.children('.sidebar-tab-favicon').css('backgroundImage', 'url(' + icon + ')');
        // Model update
      const tabModel = {windowId: windowId, tabId: tabId, text: text, icon: icon, url: url, selected: false};
      model.tabs.set(tabId, tabModel);
      updateView();
    }
  }

  function removeTab(tabId) {
    const tabModel = model.tabs.get(tabId);
    if (tabModel) {
      model.tabs.delete(tabId);
      const tabElement = getTabElement(tabId);
      tabElement.remove();
    }
    updateView();
  }

  function moveTabNode(tabId, targetWindowId, pos) {
    const tabElement = getTabElement(tabId);
    const targetWindowElement = getWindowElement(targetWindowId);
    targetWindowElement.children[4].insertBefore(tabElement.parentNode.removeChild(tabElement), targetWindowElement.children[4].children[pos]);
    model.tabs.get(tabId).windowId = targetWindowId;
    updateView();
  }

  function search(searchPattern) {
      // TODO Optimize to do DOM changes only when required
    const windowsWithVisibleTabs = new Map();
    model.tabs.forEach((tabModel, tabId) => {
      const tabElement = getTabElement(tabId);
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
    model.windows.forEach((windowModel, windowId) => {
      const windowElement = getWindowElement(windowId);
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

  function onWindowCreated(window) {
    log('Window created', window);
    addWindowNode(window.id, 'Window');
  }

  function onWindowRemoved(windowId) {
    log('Window removed', windowId);
    removeWindowNode(windowId);
  }

  function onWindowFocusChanged(windowId) {
    if (windowId === -1) {
      log('Windows lost focus');
    }
    else {
      chrome.windows.get(windowId, {populate:true}, window => {
        if (window.type === 'normal') {
          var activeTab = window.tabs.find(tab => {
            return tab.active;
          });
          // TODO Too many activation - think how to optimize
          if (activeTab) {
            log('Activating tab because window was focused', window, activeTab);
            onTabActivated({tabId: activeTab.id, windowId: activeTab.windowId});
          }
        }
      });
    }
  }

  function onTabCreated(tab) {
    log('Tab created', tab);
    addTab(tab.windowId, tab.id, tab.index, tab.title, correctFavIconUrl(tab.favIconUrl), tab.url);
  }

  function onTabRemoved(tabId, removeInfo) {
    log('Tab removed', tabId, removeInfo);
    removeTab(tabId);
  }

  function onTabUpdated(tabId, changeInfo) {
    log('Tab updated', tabId, changeInfo);
    // TODO rethink - could be too much overhead
    chrome.tabs.get(tabId, tab => {
      const tabElement = getTabElement(tabId);
      if (tabElement) {
        tabElement.children[2].textContent = tab.title;
        tabElement.children[1].style.backgroundImage = 'url(' + correctFavIconUrl(tab.favIconUrl) + ')';
      }
      const tabModel = model.tabs.get(tabId);
      if (tabModel) {
        tabModel.url = tab.url;
      }
      updateView();
    });
  }

  function correctFavIconUrl(iconUrl) {
    if (iconUrl && iconUrl.startsWith('chrome://theme/')) {
      return undefined;
    }
    return iconUrl;
  }

  function onTabMoved(tabId, moveInfo) {
    log('Tab moved', tabId, moveInfo);
    moveTabNode(tabId, moveInfo.windowId, moveInfo.toIndex);
  }

  function onTabAttached(tabId, attachInfo) {
    log('Tab attached', tabId, attachInfo);
    moveTabNode(tabId, attachInfo.newWindowId, attachInfo.newPosition);
  }

  function onTabActivated(activeInfo) {
    log('Tab activated', activeInfo);
    const selectedTabId = activeInfo.tabId;
    log('Selecting tab', selectedTabId);
    model.tabs.forEach((tabModel, tabId) => {
      if (tabId !== selectedTabId && tabModel.selected) {
        log('Deselecting tab', tabId, tabModel);
        const tabElement = getTabElement(tabId);
        tabModel.selected = false;
        tabElement.children[0].classList.remove('sidebar-tab-selected');
      }
    });
    const tabElement = getTabElement(selectedTabId);
    tabElement.children[0].classList.add('sidebar-tab-selected');
    model.tabs.get(selectedTabId).selected = true;
    if (!$(tabElement).visible()) {
      const offset = $(tabElement).offset();
      if (offset) {
        jQuery(document).scrollTop($(tabElement).offset().top - 25);
      }
    }
  }

  function onTabReplaced(addedTabId, removedTabId) {
    log('Tab replaced', addedTabId, removedTabId);
    removeTab(removedTabId);
    chrome.tabs.get(addedTabId, tab => {
      onTabCreated(tab);
    });
  }

  var searchBox = $('.sidebar-search-box');
  searchBox.on('input', function() {
    log('Search text changed', searchBox.val());
    var searchText = searchBox.val().toLowerCase();
    search(searchText);
  });
}