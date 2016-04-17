$(document).ready(onReady);

function onReady() {
  console.log('Sidebar view loaded! Reading information about existing windows...');

  var jsTree = $('#tree-root').jstree({
    'core': {
      'check_callback': true,
      'themes': {
        'dots': false
      }
    },
    'plugins': ['dnd']
  });

  var tree = $('#tree-root').jstree(true);

  jsTree.on('select_node.jstree',
    function(evt, data) {
      var nodeMeta = data.node.original;
      if (nodeMeta.tabId) {
        chrome.windows.update(nodeMeta.parentWindowId, {focused: true}, function() {
          chrome.tabs.update(nodeMeta.tabId, {active: true});
        });
      }
    }
  );

  /*jsTree.on('create_node.jstree', function(e, data) {
    var tabId = data.node.original.tabId;
    if (tabId) {
      var nodeElement = $('li#' + data.node.id).find('a');
      nodeElement.dblclick(function() {
        alert('Clicked ' + data.node.id);
      });
      var closeIcon = $('<span>').css('background-image', 'url("/images/close.png")').click(function() {
        chrome.tabs.remove(tabId);
      }).append('<p>[X]</p>').appendTo(nodeElement);
    }
  });*/
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
  chrome.windows.onCreated.addListener(onWindowCreated);
  chrome.windows.onRemoved.addListener(onWindowRemoved);
  chrome.tabs.onCreated.addListener(onTabCreated);
  chrome.tabs.onRemoved.addListener(onTabRemoved);
  chrome.tabs.onUpdated.addListener(onTabUpdated);
  chrome.tabs.onMoved.addListener(onTabMoved);
  chrome.tabs.onAttached.addListener(onTabAttached);

  function onWindowCreated(window) {
    console.log('Window created', window);
    return tree.create_node(null, {
      'id': 'window-' + window.id,
      'text': 'Window',
      'windowId': window.id,
      'state': {'opened': true}
    });
  }

  function onWindowRemoved(windowId) {
    console.log('Window removed', windowId);
    tree.delete_node('window-' + windowId);
  }

  function onTabCreated(tab) {
    console.log('Tab created', tab);
    tree.create_node('window-' + tab.windowId, {
      'id': 'tab-' + tab.id,
      'text': tab.title,
      'tabId': tab.id,
      'parentWindowId': tab.windowId,
      'icon': correctFavIconUrl(tab.favIconUrl)
    });
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

  console.log('Existing windows parsed!');
}
