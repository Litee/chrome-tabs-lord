'use strict';

$(document).ready(onReady);

function onReady() {
  log('Sidebar view loaded! Reading information about existing windows...');

  var jsTree = $('#tree-root').jstree({
    'core': {
      'check_callback': function(operation, node, node_parent, node_position, more) {
        if (operation === 'move_node') {
          // log(arguments);
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

  jsTree.off('dblclick').on('dblclick','.jstree-anchor', function() {
    log(arguments);
    var node = tree.get_node(this);
    log(node);
    if (node.original && !node.original.tabId) {
      editWindowName(node);
    }
  });

  function generateContextMenu(contextMenuNode, callback) {
    log('Creating context menu', contextMenuNode);
    var selectedNodes = tree.get_selected(true); // return full nodes
    if (selectedNodes.length === 0) {
      selectedNodes.push(contextMenuNode);
    }
    selectedNodes = selectedNodes.filter(function(n) { return n.original.tabId; });
    if (selectedNodes.length === 0) {
      callback({
        'rename-window-menu': {
          'label': 'Rename window',
          'action': function() {
            editWindowName(contextMenuNode);
          }
        }
      });
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

  function editWindowName(node) {
    tree.edit(node, null, function(editedNode, nodeWasRenamed) {
      log('Node editing has finished', editedNode, nodeWasRenamed);
      if (nodeWasRenamed) {
        saveState();
      }
    });
  }

  jsTree.on('select_node.jstree',
    function(evt, data) {
      log('Node selected', evt, data);
      var nodeMeta = data.node.original;
      if (nodeMeta.tabId && data.selected.length === 1) {
        chrome.tabs.get(nodeMeta.tabId, function(tab) {
          chrome.windows.get(tab.windowId, {}, function(window) {
            var updateParameters = window.focused ? {} : {focused: true};
            chrome.windows.update(tab.windowId, updateParameters, function() {
              if (!tab.active)
                chrome.tabs.update(tab.id, {active: true});
            });
          });
        });
      }
    }
  );

  jsTree.on('move_node.jstree', function(evt, data) {
    log('Processing drop...', arguments);
    var windowNode = tree.get_node(data.parent);
    chrome.tabs.move(data.node.original.tabId, {windowId: windowNode.original.windowId, index: data.position});
  });

  log('Parsing existing windows...');
  chrome.windows.getAll({populate: true, windowTypes: ['normal']}, function(windowsArr) {
    var state = loadState();
    windowsArr.forEach(function(window) {
      log('Populating window', window);
      onWindowCreated(window);
      window.tabs.forEach(function(tab) {
        log('Populating tab', tab);
        if (tab.index === 0) {
          state.windows.forEach(function(windowInfo) {
            if (windowInfo.firstTabUrl === tab.url) {
              tree.set_text('window-' + window.id, windowInfo.windowName);
            }
          });
        }
        onTabCreated(tab);
      });
    });
    log('Existing windows parsed!');
    saveState();
  });

  var searchBox = $('.sidebar-search-box');
  searchBox.on('input', function() {
    log('Search text changed', searchBox.val());
    var searchText = searchBox.val().toLowerCase();
    tree.search(searchText);
  });

  chrome.windows.onCreated.addListener(onWindowCreated);
  chrome.windows.onRemoved.addListener(onWindowRemoved);
  chrome.tabs.onCreated.addListener(onTabCreated);
  chrome.tabs.onRemoved.addListener(onTabRemoved);
  chrome.tabs.onUpdated.addListener(onTabUpdated);
  chrome.tabs.onMoved.addListener(onTabMoved);
  chrome.tabs.onAttached.addListener(onTabAttached);
  chrome.tabs.onActivated.addListener(onTabActivated);

  function onWindowCreated(window) {
    log('Window created', window);
    tree.create_node(null, {
      'id': 'window-' + window.id,
      'text': 'Window',
      'windowId': window.id,
      'state': {'opened': true}
    });
  }

  function onWindowRemoved(windowId) {
    log('Window removed', windowId);
    tree.delete_node('window-' + windowId);
    saveState();
  }

  function onTabCreated(tab) {
    log('Tab created', tab);
    tree.create_node('window-' + tab.windowId, {
      'id': 'tab-' + tab.id,
      'text': tab.title,
      'tabId': tab.id,
      //'parentWindowId': tab.windowId,
      'icon': correctFavIconUrl(tab.favIconUrl),
      'url': tab.url
    }, tab.index);
    saveState();
  }

  function onTabRemoved(tabId, removeInfo) {
    log('Tab removed', tabId, removeInfo);
    tree.delete_node('tab-' + tabId);
    saveState();
  }

  function onTabUpdated(tabId, changeInfo) {
    log('Tab updated', tabId, changeInfo);
    // TODO rethink - could be too much overhead
    chrome.tabs.get(tabId, function(tab) {
      var nodeId = 'tab-' + tabId;
      tree.set_text(nodeId, tab.title);
      tree.set_icon(nodeId, correctFavIconUrl(tab.favIconUrl));
      var node = tree.get_node(nodeId);
      log('Updating node', node);
      if (node) {
        node.original.url = tab.url;
      }
      saveState();
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
    saveState();
  }

  function onTabAttached(tabId, attachInfo) {
    log('Tab attached', tabId, attachInfo);
    tree.move_node('tab-' + tabId, 'window-' + attachInfo.newWindowId, attachInfo.newPosition);
    saveState();
  }

  function onTabActivated(activeInfo) {
    log('Tab activated', activeInfo);
    tree.deselect_all(true); // true to suppress selection event
    tree.select_node('tab-' + activeInfo.tabId, false); // true to suppress selection event
    var nodeElement = $('li#tab-' + activeInfo.tabId);
    if (!nodeElement.visible()) {
      jQuery(document).scrollTop(nodeElement.offset().top);
    }
  }

  function loadState() {
    var stateAsString = localStorage.getItem('tabs-lord-state');
    if (stateAsString) {
      return JSON.parse(stateAsString);
    }
    return {windows:[]};
  }

  var saveStateTimer = null;

  function saveState() {
    clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(function() {
      log('Saving state...');
      chrome.windows.getAll({populate: true, windowTypes: ['normal']}, function(windowsArr) {
        var state = {windows:[]};
        windowsArr.forEach(function(window) {
          if (window.tabs.length > 0) {
            var node = tree.get_node('window-' + window.id);
            var windowInfo = {firstTabUrl: window.tabs[0].url, windowName: node.text};
            state.windows.push(windowInfo);
          } else {
            log('Window doesn\'t have tabs - cannot save information about it', window);
          }
        });
        var newState = JSON.stringify(state);
        localStorage.setItem('tabs-lord-state', newState);
        log('State saved!', state);
      });

      var tabsGroupedByUrl = {};
      $.each(tree._model.data, function(k, node) {
        if (node && node.original && node.original.url) {
          var nodeUrl = formatUrlForDuplicatesCheck(node.original.url, '#');
          tabsGroupedByUrl[nodeUrl] = tabsGroupedByUrl[nodeUrl] || [];
          tabsGroupedByUrl[nodeUrl].push(node);
        }
      });
      $.each(tabsGroupedByUrl, function(url, nodes) {
        nodes.forEach(function(node) {
          if (nodes.length > 1) { // duplicate URLs
            log('Duplicate node found', node);
            node.original.duplicate = true;
            tree.redraw_node(node);

          }
          else { // unique URLs
            node.original.duplicate = false;
            tree.redraw_node(node);
          }
        });
      });
    }, 1000);
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
