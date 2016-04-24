'use strict';

$(document).ready(onReady);

function onReady() {
  console.log('Sidebar view loaded! Reading information about existing windows...');

  (function($, undefined) {
    var _s = document.createElement('SPAN');
    _s.className = 'fa-stack jstree-stackedicon';
    var _i = document.createElement('I');
    _i.className = 'jstree-icon';
    _i.setAttribute('role', 'presentation');

    $.jstree.plugins.stackedicon = function(options, parent) {
      this.teardown = function() {
        this.element.find('.jstree-stackedicon').remove();
        parent.teardown.call(this);
      };
      this.redraw_node = function(obj, deep, is_callback, force_render) {
        var nodeId = obj;
        obj = parent.redraw_node.apply(this, arguments);
        if (obj) {
          if (nodeId && typeof nodeId === 'string' && nodeId.indexOf('tab-') === 0) {
            var liEl = $(obj);
            if (liEl.find('i.tabs-lord-close-icon').length === 0) {
              var closeIconEl = $('<i class="tabs-lord-icon tabs-lord-icon-close"></i>').click(function() {
                chrome.tabs.remove(parseInt(nodeId.substring(4)));
              });
              liEl.append(closeIconEl);
            }
          }
        }
        return obj;
      };
    };
  })(jQuery);

  var jsTree = $('#tree-root').jstree({
    'core': {
      'check_callback': true,
      'themes': {
        'dots': false
      }
    },
    'contextmenu': {
      'items': generateContextMenu
    },
    'plugins': ['dnd', 'contextmenu', 'stackedicon', 'wholerow']
  });

  var tree = $('#tree-root').jstree(true);

  function generateContextMenu(node, callback) {
    console.log('Creating context menu', node);
    var selectedNodes = tree.get_selected(true); // return full nodes
    if (selectedNodes.length === 0) {
      selectedNodes.push(node);
    }
    selectedNodes = selectedNodes.filter(function(n) { return n.original.tabId; });
    if (selectedNodes.length === 0) {
      callback({
        'rename-window-menu': {
          'label': 'Rename window',
          'action': function() {
            tree.edit(node, null, function(editedNode, nodeWasRenamed) {
              console.log('Node editing has finished', editedNode, nodeWasRenamed);
              if (nodeWasRenamed) {
               saveState();
              }
            });
          }
        }
      });
      return; // Only window nodes are selected
    }
    chrome.windows.getAll({populate: true, windowTypes: ['normal']}, function(windows) {
      var moveToWindowActions = {};
      $.each(windows, function(i, window) {
        var node = tree.get_node('window-' + window.id);
        var menuLabel = node.text === 'Window' ? (window.tabs.length === 0 ? 'Window [' + i + ']'  : 'With tab "' + window.tabs[0].title + '"') : node.text;
        moveToWindowActions['move-to-window-menu-' + window.id] = {
          'label': menuLabel,
          'action': function() {
            console.log('Moving tab(s) to another window', selectedNodes, window.id);
            chrome.tabs.move(selectedNodes.map(function(node) { return node.original.tabId; }), {windowId: window.id, index: -1});
          }
        };
      });
      moveToWindowActions['move-to-window-menu-new'] = {
        'label': 'New Window',
        'action': function() {
          console.log('Moving tab(s) to a new window', selectedNodes);
          console.log('First tab to move', selectedNodes[0]);
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

  jsTree.on('select_node.jstree',
    function(evt, data) {
      var nodeMeta = data.node.original;
      if (nodeMeta.tabId && data.selected.length === 1) {
        chrome.tabs.get(nodeMeta.tabId, function(tab) {
          chrome.windows.update(tab.windowId, {focused: true}, function() {
            chrome.tabs.update(tab.id, {active: true});
          });
        });
      }
    }
  );

  console.log('Parsing existing windows...');
  chrome.windows.getAll({populate: true, windowTypes: ['normal']}, function(windowsArr) {
    var state = loadState();
    windowsArr.forEach(function(window) {
      console.log('Populating window', window);
      onWindowCreated(window);
      window.tabs.forEach(function(tab) {
        console.log('Populating tab', tab);
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
    console.log('Existing windows parsed!');
    saveState();
  });

  var searchBox = $('.sidebar-search-box');
  searchBox.on('input', function() {
    var searchText = searchBox.val().toLowerCase();
    console.log('Search text changed', searchBox.val());
    if (searchText.length === 0) {
      tree.show_all();
    } else {;
      // hide nodes that do not match query
      tree.hide_all();
      $.each(tree._model.data, function(key, node) {
        var nodeText = node.text;
        if (nodeText && (nodeText.toLowerCase().indexOf(searchText) > -1 || (node.original && node.original.url && node.original.url.toLowerCase().indexOf(searchText) > -1))) {
          var currentNodeId = node.id;
          while (currentNodeId) {
            tree.show_node(currentNodeId);
            currentNodeId = tree.get_parent(currentNodeId);
          }
        }
      });
    }
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
    console.log('Window created', window);
    tree.create_node(null, {
      'id': 'window-' + window.id,
      'text': 'Window',
      'windowId': window.id,
      'state': {'opened': true}
    });
  }

  function onWindowRemoved(windowId) {
    console.log('Window removed', windowId);
    tree.delete_node('window-' + windowId);
    saveState();
  }

  function onWindowFocusChanged(windowId) {
    console.log('Window focused', windowId);
    if (windowId != chrome.windows.WINDOW_ID_NONE) {
      // TODO Scroll to active tab in tree
      chrome.windows.get(windowId, {populate: true}, function(window) {
        $.each(window.tabs, function(i, tab) {
          // if (tab.active)
          // onTabActivated({tabId: tab.id});
        });
      });
    }
  }

  function onTabCreated(tab) {
    console.log('Tab created', tab);
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
    console.log('Tab removed', tabId, removeInfo);
    tree.delete_node('tab-' + tabId);
    saveState();
  }

  function onTabUpdated(tabId, changeInfo) {
    console.log('Tab updated', tabId, changeInfo);
    // TODO rethink - could be too much overhead
    chrome.tabs.get(tabId, function(tab) {
      var nodeId = 'tab-' + tabId;
      tree.set_text(nodeId, tab.title);
      tree.set_icon(nodeId, correctFavIconUrl(tab.favIconUrl));
      var node = tree.get_node(nodeId);
      console.log('Updating node', node)
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
    console.log('Tab moved', tabId, moveInfo);
    tree.move_node('tab-' + tabId, 'window-' + moveInfo.windowId, moveInfo.toIndex);
    saveState();
  }

  function onTabAttached(tabId, attachInfo) {
    console.log('Tab attached', tabId, attachInfo);
    tree.move_node('tab-' + tabId, 'window-' + attachInfo.newWindowId, attachInfo.newPosition);
    saveState();
  }

  function onTabActivated(activeInfo) {
    console.log('Tab activated', activeInfo);
    tree.deselect_all(true); // true to suppress selection event
    tree.select_node('tab-' + activeInfo.tabId, true); // true to suppress selection event
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

  // TODO: Rethink when state should be saved - currently it is saved very often
  function saveState() {
    chrome.windows.getAll({populate: true, windowTypes: ['normal']}, function(windowsArr) {
      var state = {windows:[]};
      windowsArr.forEach(function(window) {
        if (window.tabs.length > 0) {
          var node = tree.get_node('window-' + window.id);
          var windowInfo = {firstTabUrl: window.tabs[0].url, windowName: node.text};
          state.windows.push(windowInfo);
        } else {
          console.log('Window doesn\'t have tabs - cannot save information about it', window);
        }
      });
      console.log('Saving state', state);
      localStorage.setItem('tabs-lord-state', JSON.stringify(state));
    });
  }
}
