chrome.browserAction.onClicked.addListener(function(tab) {
  var sidebarPageUrl = chrome.extension.getURL('sidebar.html');

  console.log('Browser action called!');

  chrome.tabs.query({url: sidebarPageUrl}, function (sidebarTabs) {
    if (sidebarTabs.length === 0) {
      chrome.windows.getCurrent(null, function(currentWindow) {
        console.log('Last focused window found: ' + currentWindow);
        console.log('Creating sidebar...');
        chrome.system.display.getInfo(function(displaysInfo) {
          var horizontalAdjustment = displaysInfo[0].workArea.left;
          var workAreaHeight = displaysInfo[0].workArea.height;
          chrome.windows.create(
            {
              url: sidebarPageUrl,
              type: 'popup',
              left: 0,
              top: 0,
              width: 400,
              height: workAreaHeight
            },
            function() {
              console.log('Sidebar created!');
              chrome.windows.update(currentWindow.id, {left: horizontalAdjustment + 400, width: currentWindow.width - 400, height: workAreaHeight});
          });
        });
      });
    }
    else { // sidebar already exists
      for (var i = 1; i < sidebarTabs.length; i++) { // killing possible extra instances
        chrome.windows.remove(sidebarTabs[i].windowId);
      }
      chrome.windows.update(sidebarTabs[0].windowId, {focused: true});
    }
  });
});