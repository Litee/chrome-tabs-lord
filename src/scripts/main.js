chrome.browserAction.onClicked.addListener(function() {
  var sidebarPageUrl = chrome.extension.getURL('sidebar.html');

  console.log('Browser action called!');

  chrome.windows.getCurrent(null, function(currentWindow) {
    console.log('Last focused window found', currentWindow);
    getOrCreateSidebarWindow(function(sidebarWindow) {
      updateWindowsPosition(sidebarWindow, currentWindow);
    });
  });

  chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);

  function onWindowFocusChanged(windowId) {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      // TODO Scroll to active tab in tree
      chrome.windows.get(windowId, {populate: true}, function(focusedWindow) {
        console.log('Window focused', focusedWindow);
        if (focusedWindow.type === 'normal') {
          getOrCreateSidebarWindow(function(sidebarWindow) {
            updateWindowsPosition(sidebarWindow, focusedWindow);
          });
        }
      });
    }
    else {
      console.log('Chrome windows lost focus');
    }
  }

  function getOrCreateSidebarWindow(callback) {
    chrome.tabs.query({url: sidebarPageUrl}, function(sidebarTabs) {
      console.log('Sidebar tabs found', sidebarTabs);
      if (sidebarTabs.length > 1) {
        console.log('Killing extra sidebars...');
        for (var i = sidebarTabs.length - 1; i > 0 ; i--) { // killing possible extra instances
          chrome.windows.remove(sidebarTabs[i].windowId);
          sidebarTabs.splice(i, 1);
        }
      }
      if (sidebarTabs.length === 0) {
        chrome.windows.create({url: sidebarPageUrl, type: 'popup' }, function(sidebarWindow) {
          callback(sidebarWindow);
        });
      }
      else {
        chrome.windows.get(sidebarTabs[0].windowId, {}, function(sidebarWindow) {
          callback(sidebarWindow);
        });
      }
    });
  }


  function updateWindowsPosition(sidebarWindow, currentWindow) {
    console.log('Updating windows position', sidebarWindow, currentWindow);
    chrome.system.display.getInfo(function(displaysInfo) {
      console.log('Identifying monitor for window', currentWindow, displaysInfo);
      var windowMidX = currentWindow.left + currentWindow.width / 2;
      var windowMidY = currentWindow.top + currentWindow.height / 2;
      var bestDisplay = 0;
      var bestDistance = 10E6;
      for (var i = 0; i < displaysInfo.length; i++) {
        var displayMidX = displaysInfo[i].workArea.left + displaysInfo[i].workArea.width;
        var displayMidY = displaysInfo[i].workArea.top + displaysInfo[i].workArea.height;
        var distanceToDisplayCenter = Math.sqrt(Math.pow(windowMidX - displayMidX, 2) + Math.pow(windowMidY - displayMidY, 2));
        if (distanceToDisplayCenter < bestDistance) {
          bestDisplay = i;
          bestDistance = distanceToDisplayCenter;
        }
      }
      var bestDisplayInfo = displaysInfo[bestDisplay];
      var workAreaLeft = bestDisplayInfo.workArea.left;
      var workAreaTop = bestDisplayInfo.workArea.top;
      var workAreaHeight = bestDisplayInfo.workArea.height;
      var workAreaWidth = bestDisplayInfo.workArea.width;
      chrome.windows.update(sidebarWindow.id, {
        // focused: true,
        left: workAreaLeft,
        top: workAreaTop,
        width: 400,
        height: workAreaHeight
      });
      console.log('Best display', bestDisplayInfo, currentWindow.id);
      chrome.windows.update(currentWindow.id, {left: workAreaLeft + 400, width: workAreaWidth - 400, top: workAreaTop, height: workAreaHeight});
      /*var activatingSidebar = false;
      chrome.windows.onFocusChanged.addListener(function(focusedWindowId) {
        if (focusedWindowId >= 0 && focusedWindowId !== sidebarWindow.id && !activatingSidebar) {
          console.log('Window focused', focusedWindowId);
          chrome.windows.get(focusedWindowId, function() {
            activatingSidebar = true;
            chrome.windows.update(sidebarWindow.id, {focused: true}, function() {
              chrome.windows.update(focusedWindowId, {focused: true}, function() {
                activatingSidebar = false;
              });
            });
          });
        }
      });*/
    });
  }
});
