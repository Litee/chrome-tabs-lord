chrome.browserAction.onClicked.addListener(function(tab) {
  var sidebarPageUrl = chrome.extension.getURL('sidebar.html');

  console.log('Browser action called!');

  chrome.tabs.query({url: sidebarPageUrl}, function (sidebarTabs) {
    if (sidebarTabs.length === 0) {
      chrome.windows.getLastFocused(null, function(lastFocusedWindow) {
        console.log('Last focused window found: ' + lastFocusedWindow);
        console.log('Creating sidebar...');
        chrome.windows.create({
          url: sidebarPageUrl,
          type: 'popup',
          left: 0,
          top: 0,
          width: 400,
          height: lastFocusedWindow.height
        }, function() {
          console.log('Sidebar created!');
        });
      });
    }
    else { // sidebar already exists
      for (var i = 1; i < sidebarTabs.length; i++) { // killing possible extra instances
        chrome.windows.remove(sidebarTabs[i].windowId);
      }
      chrome.windows.update(sidebarTabs[0].windowId, {focused: true});
    }
  })
});

