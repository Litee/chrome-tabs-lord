'use strict';

$(document).ready(onReady);

function onReady() {
  log('Sidebar view loaded! Reading information about existing windows...');

  var sidebar = $('#sidebar-nodes-container').sidebar();

  var jsTree = $('#tree-root').jstree({
    'core': {
      'check_callback': function(operation, node, node_parent) {
        if (operation === 'move_node') {
          return node_parent && node_parent.original && !node_parent.original.tabId;
        }
        return true;
      },
      'themes': {
        'dots': false
      }
    },
    'plugins': ['dnd', 'contextmenu', 'tabLordNodeIcons', 'wholerow', 'search'],
    'contextmenu': {
      'items': generateContextMenu
    },
    'dnd': {
      'is_draggable': function(nodes) {
        return nodes.every(function(node) { return node.original && node.original.tabId; });
      }
    },
    'search': {
      'show_only_matches': true,
      'search_callback': searchNode
    }
  });

  function searchNode(searchText, node) {
    var nodeText = node.text;
    return nodeText && (nodeText.toLowerCase().indexOf(searchText) > -1 || (node.original && node.original.url && node.original.url.toLowerCase().indexOf(searchText) > -1));
  }

  var tree = $('#tree-root').jstree(true);

  function generateContextMenu(contextMenuNode, callback) {
    log('Creating context menu', contextMenuNode);
    var selectedNodes = tree.get_selected(true); // return full nodes
    if (selectedNodes.length === 0) {
      selectedNodes.push(contextMenuNode);
    }
    selectedNodes = selectedNodes.filter(function(n) { return n.original.tabId; });
    if (selectedNodes.length === 0) {
      return; // Only window nodes are selected
    }
    chrome.windows.getAll({populate: true, windowTypes: ['normal']}, function(windows) {
      var moveToWindowActions = {};
      $.each(windows, function(i, window) {
        var windowNode = tree.get_node('window-' + window.id);
        var menuLabel = windowNode.text === 'Window' ? (window.tabs.length === 0 ? 'Window [' + i + ']'  : 'With tab "' + window.tabs[0].title + '"') : windowNode.text;
        moveToWindowActions['move-to-window-menu-' + window.id] = {
          'label': menuLabel,
          'action': function() {
            log('Moving tab(s) to another window', selectedNodes, window.id);
            chrome.tabs.move(selectedNodes.map(function(node) { return node.original.tabId; }), {windowId: window.id, index: -1});
          }
        };
      });
      moveToWindowActions['move-to-window-menu-new'] = {
        'label': 'New Window',
        'action': function() {
          log('Moving tab(s) to a new window', selectedNodes);
          log('First tab to move', selectedNodes[0]);
          chrome.windows.create(
            {
              type: 'normal',
              tabId: selectedNodes[0].original.tabId
            }, function(newWindow) {
            if (selectedNodes.length > 1) {
              // Using timeouts to prevent weird tabs flickering - the best idea I have so far
              setTimeout(function() {
                tree.deselect_all(true);
              }, 100);
              setTimeout(function() {
                chrome.tabs.move(selectedNodes.slice(1).map(function(node) { return node.original.tabId; }), {windowId: newWindow.id, index: -1}, function() {});
              }, 200);
            }
          });
        }
      };
      callback({
        'move-to-window-menu': {
          'label': 'Move to window',
          'submenu': moveToWindowActions
        }
      });
    });
  }

  jsTree.on('move_node.jstree', function(evt, data) {
    log('Processing drop...', arguments);
    var windowNode = tree.get_node(data.parent);
    chrome.tabs.move(data.node.original.tabId, {windowId: windowNode.original.windowId, index: data.position});
  });

  log('Parsing existing windows...');
  chrome.windows.getAll({populate: true, windowTypes: ['normal']}, function(windowsArr) {
    windowsArr.forEach(function(window) {
      setTimeout(function() {
        log('Populating window', window);
        onWindowCreated(window);
        window.tabs.forEach(function(tab) {
          log('Populating tab', tab);
          onTabCreated(tab);
        });
      }, 1);
    });
    log('Existing windows parsed!');
  });

  var searchBox = $('.sidebar-search-box');
  searchBox.on('input', function() {
    log('Search text changed', searchBox.val());
    var searchText = searchBox.val().toLowerCase();
    tree.search(searchText);
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

  function onWindowCreated(window) {
    log('Window created', window);
    sidebar.addWindow(window.id, 'Window');
  }

  function onWindowRemoved(windowId) {
    log('Window removed', windowId);
    sidebar.removeWindow(windowId);
    stateUpdated();
  }

  function onWindowFocusChanged(windowId) {
    if (windowId === -1) {
      log('Windows lost focus');
    }
    else {
      chrome.windows.get(windowId, {populate:true}, function(window) {
        if (window.type === 'normal') {
          var activeTab = window.tabs.find(function(tab) {
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
    sidebar.addTab(tab.windowId, tab.id, tab.index, tab.title, correctFavIconUrl(tab.favIconUrl), tab.url);
  }

  function onTabRemoved(tabId, removeInfo) {
    log('Tab removed', tabId, removeInfo);
    sidebar.removeTab(tabId);
  }

  function onTabUpdated(tabId, changeInfo) {
    log('Tab updated', tabId, changeInfo);
    // TODO rethink - could be too much overhead
    chrome.tabs.get(tabId, function(tab) {
      if (tab.url.indexOf('chrome-extension://okkbbmpaekgeffidnddjommjfphaihme/') === -1) {
        sidebar.setTabText(tabId, tab.title);
        sidebar.setTabIcon(tabId, correctFavIconUrl(tab.favIconUrl));
        sidebar.setTabUrl(tabId, tab.url);
      }
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
    tree.move_node('tab-' + tabId, 'window-' + moveInfo.windowId, moveInfo.toIndex);
    stateUpdated();
  }

  function onTabAttached(tabId, attachInfo) {
    log('Tab attached', tabId, attachInfo);
    tree.move_node('tab-' + tabId, 'window-' + attachInfo.newWindowId, attachInfo.newPosition);
    stateUpdated();
  }

  function onTabActivated(activeInfo) {
    log('Tab activated', activeInfo);
    sidebar.selectTab(activeInfo.tabId);
  }

  function formatUrlForDuplicatesCheck(url) {
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
      return url;
    }
    return null;
  }
}
