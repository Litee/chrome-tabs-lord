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
          if (liEl.find('.tabs-lord-close-icon').length === 0) {
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
    'plugins': ['dnd'/*, 'contextmenu'*/, 'stackedicon']
  });

  var tree = $('#tree-root').jstree(true);

  jsTree.on('select_node.jstree',
    function(evt, data) {
      var nodeMeta = data.node.original;
      if (nodeMeta.tabId) {
        chrome.tabs.get(nodeMeta.tabId, function(tab) {
          chrome.windows.update(tab.windowId, {focused: true}, function() {
            chrome.tabs.update(tab.id, {active: true});
          });
        });
      }
    }
  );

  chrome.windows.getAll({populate: true, windowTypes: ['normal']}, function(windowsArr) {
    windowsArr.forEach(function(window) {
      console.log('Populating window', window);
      onWindowCreated(window);
      window.tabs.forEach(function(tab) {
        console.log('Populating tab', tab);
        onTabCreated(tab);
      });
    });
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
        if (nodeText && nodeText.toLowerCase().indexOf(searchText) > -1) {
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

  var createdMoveToWindowContextMenus = [];

  function onWindowCreated(window) {
    console.log('Window created', window);
    tree.create_node(null, {
      'id': 'window-' + window.id,
      'text': 'Window',
      'windowId': window.id,
      'state': {'opened': true}
    });
    var menuItemId = 'tabs-lord-move-to-window-' + window.id;
    if (!$.inArray(createdMoveToWindowContextMenus, menuItemId)) {
      chrome.contextMenus.create({
        id: menuItemId,
        parentId: 'tabs-lord-move-to-window-root',
        title: 'Window ' + window.id,
        contexts: ['page_action', 'page', 'frame'],
        onclick: function(info, tab) {
          createdMoveToWindowContextMenus.push(menuItemId);
          var targetWindowId = parseInt(info.menuItemId.substring('tabs-lord-move-to-window-'.length));
          console.log('Moving tab to another window', info, tab, targetWindowId);
          chrome.tabs.move(tab.id, {windowId: targetWindowId, index: -1});
        }
      });
    }
  }

  function onWindowRemoved(windowId) {
    console.log('Window removed', windowId);
    tree.delete_node('window-' + windowId);
    // TODO Remove context menu item
  }

  function onWindowFocusChanged(windowId) {
    console.log('Window focused', windowId);
    if (windowId != chrome.windows.WINDOW_ID_NONE) {
      // TODO Scroll to active tab in tree
      chrome.windows.get(windowId, {populate: true}, function(window) {
        $.each(window.tabs, function(i, tab) {
          if (tab.active)
            onTabActivated({tabId: tab.id});
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
    }, tab.index);
    if (tab.index === 0) {
      chrome.contextMenus.update('tabs-lord-move-to-window-' + tab.windowId, {title: 'With tab "' + tab.title + '"'});
    }
  }

  function onTabRemoved(tabId, removeInfo) {
    console.log('Tab removed', tabId, removeInfo);
    tree.delete_node('tab-' + tabId);
  }

  function onTabUpdated(tabId, changeInfo) {
    console.log('Tab updated', tabId, changeInfo);
    // TODO rethink - could be too much overhead
    chrome.tabs.get(tabId, function(tab) {
      tree.set_text('tab-' + tabId, tab.title);
      tree.set_icon('tab-' + tabId, correctFavIconUrl(tab.favIconUrl));
      if (tab.index === 0) {
        chrome.contextMenus.update('tabs-lord-move-to-window-' + tab.windowId, {title: 'With tab "' + tab.title + '"'});
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
    console.log('Tab moved', tabId, moveInfo);
    tree.move_node('tab-' + tabId, 'window-' + moveInfo.windowId, moveInfo.toIndex);
  }

  function onTabAttached(tabId, attachInfo) {
    console.log('Tab attached', tabId, attachInfo);
    tree.move_node('tab-' + tabId, 'window-' + attachInfo.newWindowId, attachInfo.newPosition);
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

  console.log('Existing windows parsed!');
}
