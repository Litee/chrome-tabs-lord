$(document).ready(onReady);

function onReady() {
  'use strict';
  log('Sidebar view loaded! Reading information about existing windows...');

  const sidebarContainer = $('#sidebar-nodes-container').addClass('tabs-lorg-nav-root');

  const templateWindowNode = $('<li>').addClass('sidebar-window-node').addClass('sidebar-window-node-expanded');
  $('<div>').addClass('sidebar-window-row').text(' ').appendTo(templateWindowNode);
  $('<span>').addClass('sidebar-window-icon').addClass('sidebar-window-icon-expand-collapse').appendTo(templateWindowNode);
  $('<a>').addClass('sidebar-window-anchor').attr('href', '#').attr('tabIndex', -1).appendTo(templateWindowNode);
  $('<span>').addClass('sidebar-window-icon').addClass('sidebar-window-icon-edit').appendTo(templateWindowNode);
  $('<ul>').addClass('sidebar-tabs-list').appendTo(templateWindowNode);

  const templateTabNode = $('<li>').addClass('sidebar-tab-node');
  $('<div>').addClass('sidebar-tab-row').text(' ').appendTo(templateTabNode);
  $('<span>').addClass('sidebar-tab-favicon').appendTo(templateTabNode);
  $('<a>').addClass('sidebar-tab-anchor').attr('href', '#').attr('tabIndex', -1).appendTo(templateTabNode);
  $('<span>').addClass('sidebar-tab-icon').addClass('sidebar-tab-icon-close').appendTo(templateTabNode);

  const model = new Model();

  const windowsListElement = $('<ul>').addClass('sidebar-nodes-container-list').appendTo(sidebarContainer);
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
      .on('click.sidebar', '.sidebar-tab-icon-close', $.proxy(e => {
        log('Close icon clicked!', e);
        e.stopImmediatePropagation();
        closeTabClicked(e);
      }, this))
      .on('click.sidebar', '.sidebar-tab-node', $.proxy(e => {
        log('Clicked!', e);
        e.preventDefault();
        tabNodeClicked(e);
      }, this))
      .on('dblclick.sidebar', '.sidebar-tab-node', $.proxy(e => {
        log('Double-Clicked!', e);
        e.preventDefault();
        tabNodeDoubleClicked(e);
      }, this))
      .on('contextmenu.sidebar', '.sidebar-tab-node', $.proxy(e => {
        log('Context menu clicked!', e);
        e.preventDefault();
        showNodeContextMenu(e);
      }, this))
      .on('click.sidebar', '.sidebar-window-icon-expand-collapse', $.proxy(e => {
        log('Clicked window expand/collapse!', e);
        $(e.currentTarget).parent().toggleClass('sidebar-window-node-expanded sidebar-window-node-collapsed');
      }, this))
      .on('contextmenu.sidebar', '.sidebar-tab-node', $.proxy(e => {
        log('Context menu clicked!', e);
        e.preventDefault();
        showNodeContextMenu(e);
      }, this))
      .on('click.sidebar', '.sidebar-window-icon-edit', $.proxy(e => {
        // e.preventDefault();
        startWindowNodeEdit(e);
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

  function startWindowNodeEdit(mouseEvent) {
    sidebarContainer.children('input').remove(); // Cleaning up just in case
    const windowElement = $(mouseEvent.currentTarget.parentNode);
    const windowId = parseInt(windowElement[0].id.substring(12));
    const oldText = model.getWindowModel(windowId).text;
    windowElement.children('.sidebar-window-row').hide();
    windowElement.children('.sidebar-window-anchor').hide();
    const inputElement = $('<input>', {
      'blur': $.proxy(() => {
        stopWindowNodeEdit(windowId, inputElement.val());
      }),
      'keydown': function(e) {
        if (e.which === 27) { // Escape
          stopWindowNodeEdit(windowId, oldText);
        }
        if (e.which === 13) { // Enter
          this.blur();
        }
      }
    }).addClass('sidebar-window-title-edit');
    $(windowElement).children('.sidebar-window-icon-expand-collapse').after(inputElement);
    inputElement.focus();
  }

  function stopWindowNodeEdit(windowId, newText) {
    if (newText.length === 0) {
      newText = 'Window';
    }
    const windowElement = $(getWindowElement(windowId));
    model.updateWindowModel(windowId, {text: newText});
    windowElement.children('.sidebar-window-row').show();
    windowElement.children('.sidebar-window-anchor').show();
    windowElement.children('input').remove();
    updateView();
  }

  function getTabElement(tabId) {
    return document.getElementById('sidebar-tab-' + tabId);
  }

  function getWindowElement(windowId) {
    return document.getElementById('sidebar-win-' + windowId);
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
      const tabElement = $(getTabElement(tabId));
      const tabModel = model.getTabModel(tabId);
      const newTabSelectedValue = !tabModel.selected;
      model.updateTabModel(tabId, {selected: newTabSelectedValue});
      tabElement.children('.sidebar-tab-row').toggleClass('sidebar-tab-selected', newTabSelectedValue);
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
    const tabModel = model.getTabModel(tabId);
    log('Tab node double-clicked', tabId, tabNode, e);
    sendMessageToTab(tabId, {action: tabModel.hibernated ? 'unsuspendOne' : 'suspendOne'});
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
    const selectedTabIds = model.getSelectedTabIds();
    if (selectedTabIds.length === 0) {
      selectedTabIds.push(contextTabId);
    }
    chrome.windows.getAll({populate: true, windowTypes: ['normal']}, windows => {
      windows.forEach(window => {
        const windowModel = model.getWindowModel(window.id);
        const menuItemElement = $('<li>').addClass('sidebar-context-menu-item').appendTo(moveMenuUl);
        const menuText = windowModel.text === 'Window' ? 'With tab "' + window.tabs[0].title + '"' : windowModel.text;
        $('<a>').addClass('sidebar-context-menu-item-anchor').attr('href', '#').text(menuText).appendTo(menuItemElement)
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
          }, newWindow => {
            moveSelectedTabsToWindow(selectedTabIds.slice(1), newWindow.id);
            hideContextMenu();
          });
        });
    });
    return result;
  }

  function moveSelectedTabsToWindow(selectedTabIds, targetWindowId) {
    log('Moving tabs to window...', targetWindowId);
    chrome.tabs.move(selectedTabIds, {windowId: targetWindowId, index: -1}, () => {
        // TODO Restore selection
    });
  }

  let updateViewTimer = null;
  function updateView() {
    if (updateViewTimer) {
      clearTimeout(updateViewTimer);
    }
    updateViewTimer = setTimeout(() => {
      log('Updating view...');
      model.forEachTab(tabModel => {
        $(getTabElement(tabModel.tabId)).toggleClass('sidebar-tab-hibernated', tabModel.hibernated);
      });
      model.forEachTabByUrl(tabIds => {
        tabIds.forEach(tabId => {
          $(getTabElement(tabId)).children('.sidebar-tab-anchor').toggleClass('sidebar-tab-duplicate', tabIds.length > 1);
        });
      });
      model.forEachWindow(windowModel => {
        const windowElement = $(getWindowElement(windowModel.windowId));
        windowElement.children('.sidebar-window-anchor').text(windowModel.text + ' (' + windowModel.tabsCount + ')');
      });
      document.title = 'Chrome - Tabs Lord (' + model.getTabsCount() + ')';
    }, 100);
  }

  function sendMessageToTab(tabId, message, callback) {
    log('Sending message to tab', tabId, message, callback);
    chrome.runtime.sendMessage('klbibkeccnjlkjkiokjodocebajanakg', message);
  }

  function addWindowNode(windowId, windowTitle) {
    if (!model.windowModelExists(windowId)) {
      templateWindowNode.clone()
        .attr('id', 'sidebar-win-' + windowId)
        .appendTo(windowsListElement)
        .children('.sidebar-window-anchor')
        .text(windowTitle + ' (1)');
      model.addWindowModel(windowId, windowTitle);
      updateView();
    }
  }

  function removeWindowNode(windowId) {
    const windowElement = getWindowElement(windowId);
    if (windowElement) {
      windowElement.remove();
    }
    model.deleteWindowModel(windowId);
  }

  function addTab(windowId, tabId, pos, tabTitle, tabIcon, tabUrl) {
    if (model.windowModelExists(windowId)) {
      const windowElement = getWindowElement(windowId);
      const tabElement = templateTabNode.clone()
        .attr('id', 'sidebar-tab-' + tabId)
        .appendTo($(windowElement)
        .children('.sidebar-tabs-list'));
      tabElement.children('.sidebar-tab-anchor').text(tabTitle);
      tabElement.children('.sidebar-tab-favicon').css('backgroundImage', 'url(' + tabIcon + ')');
        // Model update
      model.addTabModel(windowId, tabId, tabTitle, tabIcon, tabUrl, false);
      updateView();
    }
  }

  function removeTab(tabId) {
    model.deleteTabModel(tabId);
    const tabElement = getTabElement(tabId);
    tabElement.remove();
    updateView();
  }

  function moveTabNode(tabId, targetWindowId, pos) {
    const tabElement = getTabElement(tabId);
    const targetWindowElement = getWindowElement(targetWindowId);
    targetWindowElement.children[4].insertBefore(tabElement.parentNode.removeChild(tabElement), targetWindowElement.children[4].children[pos]);
    model.updateTabModel(tabId, {windowId: targetWindowId});
    updateView();
  }

  function search(searchPattern) {
      // TODO Optimize to do DOM changes only when required
    const windowsWithVisibleTabs = new Map();
    model.forEachTab(tabModel => {
      const tabElement = getTabElement(tabModel.tabId);
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
    model.forEachWindow(windowModel => {
      const windowElement = $(getWindowElement(windowModel.windowId));
      const visibleTabsCount = windowsWithVisibleTabs.get(windowModel.windowId) || 0;
      windowElement.toggleClass('sidebar-window-hidden', visibleTabsCount === 0);
      let windowText;
      if (visibleTabsCount < windowModel.tabsCount) {
        windowText = windowModel.text + ' (' + visibleTabsCount + '/' + windowModel.tabsCount + ')';
      }
      else {
        windowText = windowModel.text + ' (' + windowModel.tabsCount + ')';
      }
      windowElement.children('.sidebar-window-anchor').text(windowText);
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
          const activeTab = window.tabs.find(tab => {
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
    addTab(tab.windowId, tab.id, tab.index, tab.title || 'Loading...', correctFavIconUrl(tab.favIconUrl), tab.url);
  }

  function onTabRemoved(tabId, removeInfo) {
    log('Tab removed', tabId, removeInfo);
    removeTab(tabId);
  }

  function onTabUpdated(tabId, changeInfo) {
    log('Tab updated', tabId, changeInfo);
    const tabElement = $(getTabElement(tabId));
    const tabModel = model.getTabModel(tabId);
    if (tabModel) {
      const updateInfo = {};
      if (changeInfo.url) {
        updateInfo.url = changeInfo.url;
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
      model.updateTabModel(tabId, updateInfo);
    }
    updateView();
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
    model.forEachTab(tabModel => {
      const tabId = tabModel.tabId;
      if (tabId !== selectedTabId && tabModel.selected) {
        log('Deselecting tab', tabId, tabModel);
        const tabElement = getTabElement(tabId);
        tabModel.selected = false;
        tabElement.children[0].classList.remove('sidebar-tab-selected');
      }
    });
    const tabElement = getTabElement(selectedTabId);
    if (tabElement) {
      tabElement.children[0].classList.add('sidebar-tab-selected');
      model.updateTabModel(selectedTabId, {selected: true});
      $(tabElement).parents('.sidebar-window-node').addClass('sidebar-window-node-expanded').removeClass('sidebar-window-node-collapsed');
      if (!$(tabElement).visible()) {
        const offset = $(tabElement).offset();
        if (offset) {
          jQuery(document).scrollTop($(tabElement).offset().top - 25);
        }
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

  const searchBox = $('.sidebar-search-box');
  searchBox.on('input', () => {
    log('Search text changed', searchBox.val());
    const searchText = searchBox.val().toLowerCase();
    search(searchText);
  });
}

function Model() {
  'use strict';
  const _windows = new Map();
  const _tabs = new Map();

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

  return {
    windowModelExists: function(windowId) {
      return _windows.has(windowId);
    },
    getWindowModel: function(windowId) {
      const windowModel = Object.assign({}, _windows.get(windowId));
      Object.freeze(windowModel);
      return windowModel;
    },
    addWindowModel: function(windowId, windowTitle, persistentId) {
      _windows.set(windowId, {windowId: windowId, text: windowTitle, persistentId: (persistentId || generateGuid())});
    },
    updateWindowModel: function(windowId, updateInfo) {
      const windowModel = _windows.get(windowId);
      if (updateInfo.text) {
        windowModel.text = updateInfo.text;
      }
    },
    deleteWindowModel: function(windowId) {
      _windows.delete(windowId);
      _tabs.forEach(tabModel => {
        if (tabModel.windowId === windowId) {
          this.deleteTabModel(tabModel.id);
        }
      });
    },
    forEachWindow: function(callback) {
      _windows.forEach(windowModel => callback(windowModel));
    },
    getTabModel: function(tabId) {
      const tabModel = Object.assign({}, _tabs.get(tabId));
      Object.freeze(tabModel);
      return tabModel;
    },
    getTabsCount: function() {
      return _tabs.size;
    },
    addTabModel: function(windowId, tabId, tabTitle, tabIcon, tabUrl, isTabSelected) {
      const tabModel = {
        windowId: windowId,
        tabId: tabId,
        text: tabTitle,
        icon: tabIcon,
        url: tabUrl,
        normalizedUrl: normalizeUrlForDuplicatesFinding(tabUrl),
        selected: isTabSelected,
        hibernated: tabUrl && isHibernatedUrl(tabUrl)};
      _tabs.set(tabId, tabModel);
      const windowModel = _windows.get(windowId);
      windowModel.tabsCount = (windowModel.tabsCount || 0) + 1;
    },
    deleteTabModel: function(tabId) {
      const tabModel = _tabs.get(tabId);
      const windowModel = _windows.get(tabModel.windowId);
      windowModel.tabsCount = (windowModel.tabsCount || 0) - 1;
      _tabs.delete(tabId);
    },
    updateTabModel: function(tabId, updateInfo) {
      const tabModel = _tabs.get(tabId);
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
      if (updateInfo.selected) {
        tabModel.selected = updateInfo.selected;
      }
      if (updateInfo.windowId) {
        tabModel.windowId = updateInfo.windowId;
      }
    },
    getSelectedTabIds: function() {
      const selectedTabIds = [];
      _tabs.forEach(tabModel => {
        if (tabModel.selected) {
          selectedTabIds.push(tabModel.tabId);
        }
      });
      return selectedTabIds;
    },
    forEachTab: function(callback) {
      _tabs.forEach((tabModel) => callback(tabModel));
    },
    forEachTabByUrl: function(callback) {
      const tabIdsByUrl = new Map();
      _tabs.forEach(tabModel => {
        const tabIds = tabIdsByUrl.get(tabModel.normalizedUrl) || [];
        tabIds.push(tabModel.tabId);
        tabIdsByUrl.set(tabModel.normalizedUrl, tabIds);
      });
      tabIdsByUrl.forEach(tabIds => callback(tabIds));
    }
  };
}