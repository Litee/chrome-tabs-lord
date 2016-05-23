/// <reference no-default-lib="true"/>
/// <reference path="../../typings/lib.es6.d.ts" />
/// <reference path="../../typings/index.d.ts" />

$(document).ready(onReady);

function onReady() {
  'use strict';
  logger.log('Sidebar view loaded! Reading information about existing windows...');
  let updateViewTimer: number = undefined;

  $(window).resize(function() {
    localStorage.setItem('tabs-lord-preferred-sidebar-width', '' + window.outerWidth);
  });

  const externsionVersion = chrome.runtime.getManifest().version;
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
  const model = new models.Model();

  logger.log('Parsing existing windows...');
  chrome.windows.getAll({populate: true, windowTypes: ['normal']}, windowsArr => {
    windowsArr.forEach(window => {
      setTimeout(() => { // Using timeout to fix weird flickering
        logger.log('Populating window', window);
        onChromeWindowCreatedExt(window, model.suggestWindowTitle(window.tabs[0].url));
        window.tabs.forEach(tab => {
          logger.log('Populating tab', tab);
          onChromeTabCreated(tab);
        });
      }, 1);
    });
    setTimeout(() => { // Using timeout to avoid restoring hibernated windows before primary onces
      model.restoreHibernatedWindowsAndTabs();
      $('#loading-placeholder').hide();
    }, 1);
    logger.log('Existing windows parsed!');
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
        logger.log('Close icon clicked!', e);
        e.stopImmediatePropagation();
        onCloseTabIconClicked(e);
      }, this))
      .on('click.sidebar', '.sidebar-tab-node', $.proxy(e => {
        logger.log('Clicked!', e);
        e.preventDefault();
        onTabNodeClicked(e);
      }, this))
      .on('dblclick.sidebar', '.sidebar-tab-node', $.proxy(e => {
        logger.log('Double-Clicked!', e);
        e.preventDefault();
        onTabNodeDoubleClicked(e);
      }, this))
      .on('contextmenu.sidebar', '.sidebar-tab-node', $.proxy(e => {
        logger.log('Context menu clicked!', e);
        e.preventDefault();
        showNodeContextMenu(e);
      }, this))
      .on('click.sidebar', '.sidebar-window-icon-expand-collapse', $.proxy(e => {
        logger.log('Clicked window expand/collapse!', e);
        $(e.currentTarget).parent().toggleClass('sidebar-window-node-expanded sidebar-window-node-collapsed');
      }, this))
      .on('contextmenu.sidebar', '.sidebar-tab-node', $.proxy(e => {
        logger.log('Context menu clicked!', e);
        e.preventDefault();
        showNodeContextMenu(e);
      }, this))
      .on('click.sidebar', '.sidebar-window-icon-edit', $.proxy(e => {
        startWindowNodeEdit($(e.currentTarget.parentNode));
      }, this))
      .on('click.sidebar', '.sidebar-window-icon-sleep-wake', $.proxy(e => {
        hibernateOrWakeUpWindow($(e.currentTarget.parentNode));
      }, this));

    $(document)
      .on('mousedown.sidebar', e => {
        const contextMenu = $('.sidebar-context-menu');
        if (contextMenu.length > 0 && !$.contains(contextMenu[0], e.target)) {
          hideContextMenu();
        }
      })
      .on('keydown', (e) => {
        if (e.which === 27) { // Escape
          hideContextMenu();
        }
      })
      .on('tabsLord:windowAddedToModel', (e, windowModel) => {
        logger.log('Global event: Window model added', e, windowModel);
        onWindowAddedToModel(windowModel);
      })
      .on('tabsLord:windowRemovedFromModel', (e, windowModel) => {
        logger.log('Global event: Window model removed', e, windowModel);
        onChromeWindowRemovedFromModel(windowModel.windowGuid);
      })
      .on('tabsLord:windowModelsUpdated', (e, data) => {
        logger.log('Global event: Window models updated', e, data);
        onWindowModelsUpdated(data.models);
      })
      .on('tabsLord:tabAddedToModel', (e, tabModel) => {
        logger.log('Global event: Tab model added', e, tabModel);
        onTabAddedToModel(tabModel);
      })
      .on('tabsLord:tabRemovedFromModel', (e, tabModel) => {
        logger.log('Global event: Tab model added', e, tabModel);
        onTabRemovedFromModel(tabModel);
      })
      .on('tabsLord:tabModelsUpdated', (e, data) => {
        logger.log('Global event: Tab model updated', e, data);
        onTabModelsUpdated(data.models);
      })
      .on('click.sidebar', '#sidebar-reset-search-button', $.proxy(e => {
        $('#sidebar-search-box').val('');
        search('');
      }, this));
  }

  function hibernateOrWakeUpWindow(windowNodeElement: JQuery) {
    const windowGuid = windowNodeElement[0].id;
    const windowModel = model.getWindowModelByGuid(windowGuid);
    if (!windowModel) {
      logger.warn('Window model not found when trying to hibernate/wake up window', windowNodeElement);
    }
    if (windowModel.hibernated) {
      wakeUpWindow(windowModel);
    }
    else {
      hibernateWindow(windowModel);
    }
  }

  function wakeUpWindow(windowModel: models.IWindowModel) {
    const tabModels = model.getTabsByWindowGuid(windowModel.windowGuid);
    logger.debug('Restoring window model', windowModel, tabModels);
    chrome.windows.create({
      type: 'normal',
      focused: true,
      url: tabModels.length > 0 ? tabModels[0].url : undefined
      }, window => {
      logger.debug('Window restored', window, windowModel);
      const newWindowModel = model.getWindowModelById(window.id);
      if (newWindowModel) {
        model.renameWindow(newWindowModel.windowGuid, windowModel.title, () => {});
      }
      tabModels.slice(1).forEach(tabModel => {
        logger.debug('Restoring tab model', tabModel);
        chrome.tabs.create({
          windowId: window.id,
          url: tabModel.url,
          active: false
        }, tab => {
          logger.debug('Tab restored', tab, tabModel);
          model.deleteTabModel(tabModel.tabGuid);
        });
      });
      model.deleteWindowModel(windowModel.windowGuid, () => {
        updateView();
      });
    });
  }

  function hibernateWindow(windowModel: models.IWindowModel) {
    const unhibernatedWindowsCount = model.getWindowModels().filter(_windowModel => !_windowModel.hibernated).length;
    if (unhibernatedWindowsCount === 1) {
    // TODO Disable hibernation if the last window
    return;
    }
    let windowTitle = windowModel.title;
    if (windowTitle === 'Window') {
    windowTitle = prompt('Enter window title to distinguish between hibernated items', '');
    if (!windowTitle) {
      return;
    }
    }
    model.hibernateWindow(windowModel.windowGuid, windowTitle);
    chrome.windows.remove(windowModel.windowId);
    const windowElement = getElementByGuid(windowModel.windowGuid);
    windowElement.addClass('sidebar-window-hibernated');
    updateView();
  }

  function startWindowNodeEdit(windowElement: JQuery) {
    sidebarContainer.children('input').remove(); // Cleaning up just in case
    const windowGuid: string = windowElement[0].id;
    const oldText = model.getWindowModelByGuid(windowGuid).title;
    windowElement.children('.sidebar-window-row').hide();
    windowElement.children('.sidebar-window-anchor').toggleClass('sidebar-window-anchor-edit-mode', true);
    const inputElement = $('<input>', {
      'value': oldText,
      'blur': () => {
        const value = inputElement.val();
        stopWindowNodeEditByGuid(windowGuid, value);
      },
      'keydown': function(e: any) {
        if (e.which === 27) { // Escape
          stopWindowNodeEditByGuid(windowGuid, oldText);
        }
        if (e.which === 13) { // Enter
          this.blur();
        }
      }
    }).addClass('sidebar-window-title-edit');
    windowElement.children('.sidebar-window-icon-expand-collapse').after(inputElement);
    inputElement.focus();
    inputElement.select();
  }

  function stopWindowNodeEditByGuid(windowGuid: string, newTitle: string) {
    if (newTitle.length === 0) {
      newTitle = 'Window';
    }
    const windowNodeElement = getElementByGuid(windowGuid);
    model.renameWindow(windowGuid, newTitle, () => {
      windowNodeElement.children('.sidebar-window-row').show();
      windowNodeElement.children('.sidebar-window-anchor').toggleClass('sidebar-window-anchor-edit-mode', false);
      windowNodeElement.children('input').remove();
      updateView();
    });
  }

  function getElementByGuid(guid: string): JQuery {
    return $('#' + guid);
  }

  function onCloseTabIconClicked(e: any) {
    const tabNode = e.currentTarget.parentNode;
    const tabGuid = tabNode.id;
    logger.log('Closed tab icon node clicked', tabGuid, tabNode);
    const tabModel = model.getTabModelByGuid(tabGuid);
    const windowModel = tabModel.windowModel;
    if (windowModel && windowModel.hibernated) {
      removeTabNodeByGuid(tabModel.tabGuid);
    }
    else { // Kill real tab
      chrome.tabs.remove(tabModel.tabId, () => {
        updateView();
      });
    }
  }

  let lastClickedTabModelForShiftSelect: models.ITabModel;

  function onTabNodeClicked(e: any) {
    hideContextMenu();
    const tabNode = e.currentTarget;
    const tabGuid = tabNode.id;
    logger.log('Tab node clicked', tabGuid, tabNode, e);
    const tabModel = model.getTabModelByGuid(tabGuid);
    if (!tabModel) {
      logger.warn('Cannot find tab by GUID', tabNode, tabGuid);
      return;
    }
    const tabElement = getElementByGuid(tabGuid);
    if (!e.shiftKey) {
      lastClickedTabModelForShiftSelect = tabModel;
    }
    if (e.ctrlKey) { // Add to selection
      const newTabSelectedValue = !tabModel.selected;
      model.updateTabModel(tabGuid, {selected: newTabSelectedValue});
    }
    else if (e.shiftKey) {
      if (lastClickedTabModelForShiftSelect && lastClickedTabModelForShiftSelect.windowModel.windowGuid === tabModel.windowModel.windowGuid) { // selection within same window
        const selectionStart = Math.min(lastClickedTabModelForShiftSelect.index, tabModel.index);
        const selectionEnd = Math.max(lastClickedTabModelForShiftSelect.index, tabModel.index);
        model.selectTabsRange(tabModel.windowModel.windowGuid, selectionStart, selectionEnd);
      }
      else {
        // TODO
      }
    }
    else if (tabModel.windowModel && tabModel.windowModel.hibernated) { // Select tab in hibernated window - nothing to activate
      model.unselectAllTabs();
      model.updateTabModel(tabGuid, {selected: true});
    }
    else {
      chrome.tabs.get(tabModel.tabId, tab => { // Select tab in normal window - activate the tab
        chrome.windows.get(tab.windowId, {}, window => {
          if (!tab.active) {
            logger.log('Activating tab because node was selected', tab);
            chrome.tabs.update(tab.id, {active: true});
          }
          if (!window.focused) {
            chrome.windows.update(tab.windowId, {focused: true});
          }
        });
      });
    }
  }

  function onTabNodeDoubleClicked(e: any) {
    hideContextMenu();
    const tabNode = e.currentTarget;
    const tabGuid = tabNode.id;
    const tabModel = model.getTabModelByGuid(tabGuid);
    logger.log('Tab node double-clicked', tabModel, tabNode, e);
    sendMessageToGreatSuspenderExtension(tabModel.tabId, {action: tabModel.snoozed ? 'unsuspendOne' : 'suspendOne'});
  }

  function hideContextMenu() {
    $('.sidebar-context-menu').remove();
  }

  function showNodeContextMenu(e: any) {
    const tabElement = e.currentTarget;
    if (!tabElement) {
      return false;
    }
    hideContextMenu();
    const tabGuid = tabElement.id;
    const tabAnchorElement = $(tabElement).children('.sidebar-tab-anchor');
      // TODO: Better positioning for tabs at the end of the list
    const x = tabAnchorElement.offset().left;
    const y = tabAnchorElement.offset().top + 20;
    createContextMenuElement(tabGuid).css({'left':x, 'top': y}).appendTo('body');
  }

  function createContextMenuElement(contextTabGuid: string) {
    const result = $('<div></div>').addClass('sidebar-context-menu');
    const menuList = $('<span>Move to window:</span>').appendTo(result);
    const moveMenuUl = $('<ul>').addClass('sidebar-context-menu-items-list').appendTo(menuList);
    let selectedTabModels = model.getTabModels().filter(tabModel => tabModel.selected);
    const contextTabModel = model.getTabModelByGuid(contextTabGuid);
    if (selectedTabModels.length <= 1) {
      selectedTabModels = [contextTabModel];
      model.unselectAllTabs();
      model.updateTabModel(contextTabModel.tabGuid, { selected: true });
    }
    model.getWindowModels().forEach(windowModel => {
      const menuItemElement = $('<li>').addClass('sidebar-context-menu-item').appendTo(moveMenuUl);
      const firstTabModel = model.getTabsByWindowGuid(windowModel.windowGuid)[0];
      const menuText = (windowModel.title === 'Window' ? (firstTabModel ? '"' + firstTabModel.title + '" (first tab)' : 'Anonymous window without tabs') : '"' + windowModel.title + '"');
      $('<a>').addClass('sidebar-context-menu-item-anchor')
      .attr('href', '#')
      .text(menuText)
      .appendTo(menuItemElement)
      .click('click', () => {
        logger.log('"Move to another window" menu item clicked', selectedTabModels, windowModel);
        moveSelectedTabsToWindow(selectedTabModels, windowModel.windowGuid);
        hideContextMenu();
      });
    });
    const newWindowMenuItemElement = $('<li>').addClass('sidebar-context-menu-item').appendTo(moveMenuUl);
    $('<a>').addClass('sidebar-context-menu-item-anchor')
    .attr('href', '#')
    .text('<New window>')
    .appendTo(newWindowMenuItemElement)
    .click('click', () => {
      logger.log('"Move to new window" menu item clicked', selectedTabModels);
      chrome.windows.create({
        type: 'normal',
        tabId: selectedTabModels[0].tabId
      }, newWindow => {
        const windowModel = model.getWindowModelById(newWindow.id);
        moveSelectedTabsToWindow(selectedTabModels.slice(1), windowModel.windowGuid);
        hideContextMenu();
      });
    });
    $('<li>').addClass('sidebar-context-menu-item-separator').appendTo(moveMenuUl);
    const closeSelectedTabsMenuItemElement = $('<li>').addClass('sidebar-context-menu-item').addClass('sidebar-context-menu-item-dangerous').appendTo(moveMenuUl);
    $('<a>').addClass('sidebar-context-menu-item-anchor')
    .attr('href', '#')
    .text('Close selected tab' + (selectedTabModels.length > 1 ? 's (' + selectedTabModels.length + ')' : ''))
    .appendTo(closeSelectedTabsMenuItemElement)
    .click('click', () => {
      logger.log('"Closed selected tabs" menu item clicked', selectedTabModels);
      if (confirm('Are you sure you want to close ' + selectedTabModels.length + ' tabs?')) {
        selectedTabModels.forEach(tabModel => {
          if (tabModel.windowModel.hibernated) {
            model.deleteTabModel(tabModel.tabGuid);
          }
          else {
            chrome.tabs.remove(tabModel.tabId);
          }
        });
      }
      hideContextMenu();
    });
    return result;
  }

  function moveSelectedTabsToWindow(selectedTabModels: models.ITabModel[], targetWindowGuid: string) {
    const targetWindowModel = model.getWindowModelByGuid(targetWindowGuid);
    if (!targetWindowModel) {
      logger.warn('Could not find target window model when moving selected tabs', targetWindowGuid);
      return;
    }
    logger.log('Moving tabs to window...', selectedTabModels, targetWindowModel);
    // Four cases here: matrix of normal/hibernated tabs to normal/hibernated windows. Additional case - tabs that move into the same window, should be ignored

    const tabModelsToMove = selectedTabModels.filter(tabModel => tabModel.windowModel.windowGuid !== targetWindowGuid); // Ignoring tabs that move to the same window the currently belong to
    if (tabModelsToMove.length === 0) {
      return; // No real tabs to move, so exiting
    }
    const hibernatedTabsToMove = tabModelsToMove.filter(tabModel => tabModel.windowModel.hibernated);
    hibernatedTabsToMove.forEach(tabModel => { // Moving hibernated tabs first
      if (targetWindowModel.hibernated) { // hibernated tab to hibernated window
        logger.log('Moving hibernated tab to hibernated window', tabModel, targetWindowModel);
        model.moveTabToAnotherWindow(tabModel.tabGuid, targetWindowGuid, -1);
      }
      else { // hibernated tab to normal window - creating new tab, dropping information about the hibernated one
        logger.log('Moving hibernated tab to normal window', tabModel, targetWindowModel);
        chrome.tabs.create({ windowId: targetWindowModel.windowId, url: tabModel.url }, tab => {
          model.deleteTabModel(tabModel.tabGuid);
        });
      }
    });
    const normalTabsToMove = tabModelsToMove.filter(tabModel => !tabModel.windowModel.hibernated);
    if (normalTabsToMove.length > 0) {
      if (targetWindowModel.hibernated) { // normal tabs to hibernated window
        normalTabsToMove.forEach(tabModel => {
          logger.log('Moving normal tab to hibernated window', tabModel, targetWindowModel);
          model.moveTabToAnotherWindow(tabModel.tabGuid, targetWindowGuid, -1);
          chrome.tabs.remove(tabModel.tabId);
        });
      }
      else { // normal tabs to normal window
        logger.log('Moving normal tabs to normal window', normalTabsToMove, targetWindowModel);
        const selectedTabIds = normalTabsToMove.map(tabModel => tabModel.tabId);
        chrome.tabs.move(selectedTabIds, { windowId: targetWindowModel.windowId, index: -1 }, () => {
          // TODO Restore selection
        });
      }
    }
  }

  function updateView() {
    if (updateViewTimer) {
      clearTimeout(updateViewTimer);
    }
    updateViewTimer = setTimeout(() => {
      logger.log('Updating view...');
      model.getTabModels().forEach(tabModel => {
        getElementByGuid(tabModel.tabGuid).toggleClass('sidebar-tab-snoozed', tabModel.snoozed);
      });
      const tabGuidsByUrl = new Map<string, string[]>();
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
      document.title = 'Tabs Lord v' + externsionVersion + ' (' + model.getTabsCount() + ' tabs)';
    }, 100);
  }

  function sendMessageToGreatSuspenderExtension(tabId: number, message: any) {
    logger.log('Sending message to tab', tabId, message);
    chrome.runtime.sendMessage('klbibkeccnjlkjkiokjodocebajanakg', message);
  }

  function onWindowAddedToModel(windowModel: models.IWindowModel) {
    logger.debug('onWindowAddedToModel', windowModel);
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

  function onChromeWindowRemovedFromModel(windowGuid: string) {
    const windowElement = getElementByGuid(windowGuid);
    if (windowElement) {
      windowElement.remove();
    }
  }

  function onTabAddedToModel(tabModel: models.ITabModel) {
    const windowElement = getElementByGuid(tabModel.windowModel.windowGuid);
    const tabsListElement = windowElement.children('.sidebar-tabs-list')[0];
    const tabElement = templateTabNode.clone().attr('id', tabModel.tabGuid);
    tabElement.children('.sidebar-tab-anchor').text(tabModel.title).attr('title', tabModel.url);
    tabElement.children('.sidebar-tab-favicon').css('backgroundImage', tabModel.favIconUrl ? 'url(' + tabModel.favIconUrl + ')' : '');
    tabElement.children('.sidebar-tab-icon-audible').toggle(tabModel.audible);
    if (tabModel.index < 0) {
      tabsListElement.appendChild(tabElement[0]);
    }
    else {
      tabsListElement.insertBefore(tabElement[0], tabsListElement.children[tabModel.index]);
    }
      // Model update
    updateView();
  }

  function onTabRemovedFromModel(tabModel: models.ITabModel) {
    const tabElement = getElementByGuid(tabModel.tabGuid);
    if (tabElement) {
      tabElement.remove();
    }
    updateView();
  }

  function onTabModelsUpdated(tabModels: models.ITabModel[]) {
    tabModels.forEach(tabModel => {
      const tabElement = getElementByGuid(tabModel.tabGuid);
      tabElement.children('.sidebar-tab-anchor').attr('title', tabModel.url);
      tabElement.children('.sidebar-tab-anchor').text(tabModel.title);
      tabElement.children('.sidebar-tab-favicon').css('backgroundImage', tabModel.favIconUrl ? 'url(' + tabModel.favIconUrl + ')' : '');
      tabElement.children('.sidebar-tab-icon-audible').toggle(tabModel.audible);
      tabElement.children('.sidebar-tab-icon-audible').toggle(tabModel.audible);
      tabElement.children('.sidebar-tab-row').toggleClass('sidebar-tab-selected', tabModel.selected);
      tabElement.children('.sidebar-tab-row').toggleClass('sidebar-tab-selected', tabModel.selected);
      tabElement.toggleClass('sidebar-tab-hidden', !tabModel.matchesFilter);
    });
  }

  function onWindowModelsUpdated(windowModels: models.IWindowModel[]) {
    windowModels.forEach(windowModel => {
      const windowElement = getElementByGuid(windowModel.windowGuid);
      if (windowElement) {
        let windowText: string;
        if (windowModel.tabsToHide > 0 && windowModel.tabsToHide < windowModel.tabsCount) {
          windowText = windowModel.title + ' (' + (windowModel.tabsCount - windowModel.tabsToHide) + '/' + windowModel.tabsCount + ')';
        }
        else {
          windowText = windowModel.title + ' (' + windowModel.tabsCount + ')';
        }
        windowElement.toggleClass('sidebar-window-hidden', windowModel.tabsToHide === windowModel.tabsCount);
        windowElement.children('.sidebar-window-anchor').text(windowText);
      }
    });
  }

  function removeTabNodeByGuid(tabGuid: string) {
    model.deleteTabModel(tabGuid);
  }

  function moveTabNodeByGuid(tabGuid: string, targetWindowGuid: string, pos: number) {
    logger.log('Moving tab', tabGuid, targetWindowGuid, pos);
    model.moveTabToAnotherWindow(tabGuid, targetWindowGuid, pos);
  }

  function search(searchPattern: string) {
    // TODO Optimize to do DOM changes only when required
    const windowsWithVisibleTabs = new Map();
    // TODO Why do I need two classes here?
    $('#sidebar-reset-search-button').toggleClass('sidebar-reset-search-button-active', searchPattern.length > 0);
    model.changeSearchPattern(searchPattern);
  }

  function onChromeWindowCreated(window: chrome.windows.Window) {
    logger.log('Window created', window);
    onChromeWindowCreatedExt(window);
  }

  function onChromeWindowCreatedExt(window: chrome.windows.Window, suggestedWindowTitle = 'Window') {
    logger.log('Window created', window);
    model.addWindowModel(undefined, window.id, suggestedWindowTitle, false);
  }

  function onChromeWindowRemoved(windowId: number) {
    logger.log('Window removed', windowId);
    const windowModel = model.getWindowModelById(windowId);
    if (!windowModel.hibernated) {
      model.deleteWindowModel(windowModel.windowGuid, () => {});
    }
  }

  function onChromeWindowFocusChanged(windowId: number) {
    if (windowId === -1) {
      logger.log('Windows lost focus');
    }
    else {
      chrome.windows.get(windowId, {populate:true}, chromeWindow => {
      if (chromeWindow.type === 'normal') {
          const activeTab = chromeWindow.tabs.find(tab => {
            return tab.active;
          });
          // TODO Too many activations - think how to optimize
          if (activeTab) {
            logger.log('Activating tab because window was focused', chromeWindow, activeTab);
            onChromeTabActivated({tabId: activeTab.id, windowId: activeTab.windowId});
          }
        }
        else if (chromeWindow.tabs.length > 0 && util.isSidebarExtensionUrl(chromeWindow.tabs[0].url)) { // Sidebar window activated
          logger.debug('Activating search...');
          $('#sidebar-search-box').focus();
        }
      });
    }
  }

  function onChromeTabCreated(tab: chrome.tabs.Tab) {
    logger.log('Tab created', tab);
    const windowModel = model.getWindowModelById(tab.windowId);
    if (windowModel) {
      const tabTitle = tab.title || 'Loading...';
      const tabFavIconUrl = correctFavIconUrl(tab.favIconUrl, tab.url);
      model.addTabModel(windowModel.windowGuid, tab.id, undefined, tabTitle, tabFavIconUrl, tab.url, tab.index, false, tab.audible);
    }
    else {
      logger.warn('Window model not found', tab);
    }
  }

  function onChromeTabRemoved(tabId: number, removeInfo: any) {
    logger.log('Tab removed', tabId, removeInfo);
    const tabModel = model.getTabModelById(tabId);
    const windowModel = tabModel.windowModel;
    if (windowModel && !windowModel.hibernated) {
      removeTabNodeByGuid(tabModel.tabGuid);
    }
  }

  function onChromeTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
    logger.log('Tab updated', tabId, changeInfo);
    const tabModel = model.getTabModelById(tabId);
    if (tabModel) {
      const tabElement = getElementByGuid(tabModel.tabGuid);
      const updateInfo: models.TabModelUpdateInfo = {};
      if (changeInfo.url) {
        updateInfo.url = changeInfo.url;
      }
      const tabTitle = changeInfo.title;
      if (tabTitle && tabModel.title !== tabTitle) {
        updateInfo.title = tabTitle;
      }
      const favIconUrl = changeInfo.favIconUrl;
      if (favIconUrl && tabModel.favIconUrl !== favIconUrl) {
        updateInfo.favIconUrl = correctFavIconUrl(favIconUrl, tabModel.url);
      }
      if (changeInfo.audible !== undefined) {
        logger.log('Switching audible icon', changeInfo.audible);
      }
      model.updateTabModel(tabModel.tabGuid, updateInfo);
    }
    updateView();
  }

  function correctFavIconUrl(favIconUrl: string, url: string) {
    if (favIconUrl) {
      if (favIconUrl.startsWith('chrome://theme/')) {
        return undefined;
      }
      if (favIconUrl.startsWith('chrome://')) {
        return favIconUrl;
      }
    }
    if (url) {
      return 'chrome://favicon/' + url.replace(/#.*$/, '');
    }
    return favIconUrl;
  }

  function onChromeTabMoved(tabId: number, moveInfo: chrome.tabs.TabMoveInfo) {
    logger.log('Tab moved', tabId, moveInfo);
    const tabModel = model.getTabModelById(tabId);
    const targetWindowModel = model.getWindowModelById(moveInfo.windowId);
    moveTabNodeByGuid(tabModel.tabGuid, targetWindowModel.windowGuid, moveInfo.toIndex);
  }

  function onChromeTabAttached(tabId: number, attachInfo: chrome.tabs.TabAttachInfo) {
    logger.log('Tab attached', tabId, attachInfo);
    const tabModel = model.getTabModelById(tabId);
    const targetWindowModel = model.getWindowModelById(attachInfo.newWindowId);
    moveTabNodeByGuid(tabModel.tabGuid, targetWindowModel.windowGuid, attachInfo.newPosition);
  }

  function onChromeTabActivated(activeInfo: chrome.tabs.TabActiveInfo) {
    logger.log('Tab activated', activeInfo);
    const activatedTabModel = model.getTabModelById(activeInfo.tabId);
    lastClickedTabModelForShiftSelect = activatedTabModel;
    logger.log('Selecting tab', activatedTabModel);
    $('.sidebar-tab-row').removeClass('sidebar-tab-selected'); // removing selection from all nodes
    model.unselectAllTabs();
    if (!activatedTabModel) {
      logger.warn('Could not find active tab model', activeInfo);
      return;
    }
    const tabElement = getElementByGuid(activatedTabModel.tabGuid);
    if (tabElement) {
      tabElement.children('.sidebar-tab-row').addClass('sidebar-tab-selected');
      model.updateTabModel(activatedTabModel.tabGuid, {selected: true});
      tabElement.parents('.sidebar-window-node').addClass('sidebar-window-node-expanded').removeClass('sidebar-window-node-collapsed');
      if (!tabElement.visible()) {
        const offset = tabElement.offset();
        if (offset) {
          jQuery(document).scrollTop($(tabElement).offset().top - 25);
        }
      }
    }
  }

  function onChromeTabReplaced(addedTabId: number, removedTabId: number) {
    logger.log('Tab replaced', addedTabId, removedTabId);
    const removedTabModel = model.getTabModelById(removedTabId);
    removeTabNodeByGuid(removedTabModel.tabGuid);
    chrome.tabs.get(addedTabId, tab => {
      onChromeTabCreated(tab);
    });
  }

  const searchBox = $('#sidebar-search-box');
  searchBox.on('input', () => {
    logger.log('Search text changed', searchBox.val());
    const searchText = searchBox.val().toLowerCase();
    search(searchText);
  });
}
