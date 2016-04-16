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

  function onWindowFocusChanged(windowId) {

  }

  function onTabCreated(tab) {
    console.log('Tab created', tab);
    tree.create_node('window-' + tab.windowId, {
      'id': 'tab-' + tab.id,
      'text': tab.title,
      'tabId': tab.id,
      'parentWindowId': tab.windowId,
      'icon': tab.favIconUrl
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
      tree.set_icon('tab-' + tabId, tab.favIconUrl);
    });
  }

  console.log('Existing windows parsed!');
}
