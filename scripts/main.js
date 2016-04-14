chrome.browserAction.onClicked.addListener(function(tab) {
  console.log('Browser action called! Finding active window...');

  chrome.windows.getLastFocused(null, function(lastFocusedWindow) {
    console.log('Last focused window found: ' + lastFocusedWindow);

    console.log('Creating sidebar...');
    chrome.windows.create({
      url: chrome.extension.getURL('sidebar.html'),
      type: 'popup',
      left: 0,
      top: 0,
      width: 400,
      height: lastFocusedWindow.height
    }, function() {
      console.log('Sidebar created!');
    });

  });
});

