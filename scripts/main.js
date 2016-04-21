chrome.browserAction.onClicked.addListener(function(tab) {
  var sidebarPageUrl = chrome.extension.getURL('sidebar.html');

  console.log('Browser action called!');

  chrome.tabs.query({url: sidebarPageUrl}, function(sidebarTabs) {
    if (sidebarTabs.length === 0) {
      chrome.windows.getCurrent(null, function(currentWindow) {
        console.log('Last focused window found', currentWindow);
        chrome.system.display.getInfo(function(displaysInfo) {
          console.log('Loaded displays info', displaysInfo);
          var workAreaLeft = displaysInfo[0].workArea.left;
          var workAreaTop = displaysInfo[0].workArea.top;
          var workAreaHeight = displaysInfo[0].workArea.height;
          var workAreaWidth = displaysInfo[0].workArea.width;
          chrome.windows.create(
            {
              url: sidebarPageUrl,
              type: 'popup',
              left: workAreaLeft,
              top: workAreaTop,
              width: 400,
              height: workAreaHeight
            },
            function(sidebarWindow) {
              console.log('Sidebar window created', sidebarWindow);
              chrome.windows.update(currentWindow.id, {left: workAreaLeft + 400, width: workAreaWidth - 400, top: workAreaTop, height: workAreaHeight});
              var activatingSidebar = false;
              chrome.windows.onFocusChanged.addListener(function(focusedWindowId) {
                if (focusedWindowId >= 0 && focusedWindowId != sidebarWindow.id && !activatingSidebar) {
                  console.log('Window focused', focusedWindowId);
                  chrome.windows.get(focusedWindowId, function(window) {
                    activatingSidebar = true;
                    chrome.windows.update(sidebarWindow.id, {focused: true}, function() {
                      chrome.windows.update(focusedWindowId, {focused: true}, function() {
                        activatingSidebar = false;
                      });
                    });
                  });
                }
              });
            });
        });
      });
    } else { // sidebar already exists
      for (var i = 1; i < sidebarTabs.length; i++) { // killing possible extra instances
        chrome.windows.remove(sidebarTabs[i].windowId);
      }
      chrome.windows.update(sidebarTabs[0].windowId, {focused: true});
    }
  });
});
