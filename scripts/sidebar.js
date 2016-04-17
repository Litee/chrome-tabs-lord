/*(function($, undefined) {
  'use strict';
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
      obj = parent.redraw_node.apply(this, arguments);
      if (obj) {
        var i, j, tmp = null, icon = null, temp = null;
        for (i = 0, j = obj.childNodes.length; i < j; i++) {
          if (obj.childNodes[i] && obj.childNodes[i].className && obj.childNodes[i].className.indexOf('jstree-anchor') !== -1) {
            tmp = obj.childNodes[i];
            break;
          }
        }
        if (tmp) {
          if (this._model.data[obj.id].state.icons && this._model.data[obj.id].state.icons.length) {
            icon = _s.cloneNode(false);
            for (i = 0, j = this._model.data[obj.id].state.icons.length; i < j; i++) {
              temp = _i.cloneNode(false);
              temp.className += ' ' + this._model.data[obj.id].state.icons[i];
              icon.appendChild(temp);
            }
            tmp.insertBefore(icon, tmp.childNodes[0]);
          }
        }
      }
      return obj;
    };
  };
})(jQuery);*/

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
        chrome.tabs.get(nodeMeta.tabId, function(tab) {
          chrome.windows.update(tab.windowId, {focused: true}, function() {
            chrome.tabs.update(tab.id, {active: true});
          });
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
    tree.create_node(null, {
      'id': 'window-' + window.id,
      'text': 'Window',
      'windowId': window.id,
      'state': {'opened': true}
    });
    chrome.contextMenus.create({
      id: 'tabs-lord-move-to-window-' + window.id,
      parentId: 'tabs-lord-move-to-window-root',
      title: 'Window ' + window.id,
      contexts: ['page_action', 'page', 'frame'],
      onclick: function(info, tab) {
        var targetWindowId = parseInt(info.menuItemId.substring('tabs-lord-move-to-window-'.length));
        console.log('Moving tab to another window', info, tab, targetWindowId);
        chrome.tabs.move(tab.id, {windowId: targetWindowId, index: -1});
      }
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
      //'parentWindowId': tab.windowId,
      'icon': correctFavIconUrl(tab.favIconUrl)
    });
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

  console.log('Existing windows parsed!');
}
