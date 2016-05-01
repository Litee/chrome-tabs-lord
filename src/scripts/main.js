chrome.browserAction.onClicked.addListener(() => {
  'use strict';
  const sidebarPageUrl = chrome.extension.getURL('sidebar.html');

  console.log('Browser action called!');

  chrome.windows.getCurrent(null, currentWindow => {
    console.log('Last focused window found', currentWindow);
    getOrCreateSidebarWindow(sidebarWindow => {
      updateWindowsPosition(sidebarWindow, currentWindow);
    });
  });

  chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);

  function onWindowFocusChanged(windowId) {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      // TODO Scroll to active tab in tree
      chrome.windows.get(windowId, {}, focusedWindow => {
        console.log('Window focused', focusedWindow);
        if (focusedWindow.type === 'normal') {
          getOrCreateSidebarWindow(sidebarWindow => {
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
    chrome.tabs.query({url: sidebarPageUrl}, sidebarTabs => {
      console.log('Sidebar tabs found', sidebarTabs);
      if (sidebarTabs.length > 1) {
        console.log('Killing extra sidebars...');
        for (let i = sidebarTabs.length - 1; i > 0 ; i--) { // killing possible extra instances
          chrome.windows.remove(sidebarTabs[i].windowId);
          sidebarTabs.splice(i, 1);
        }
      }
      if (sidebarTabs.length === 0) {
        chrome.windows.create({url: sidebarPageUrl, type: 'popup' }, sidebarWindow => {
          callback(sidebarWindow);
        });
      }
      else {
        chrome.windows.get(sidebarTabs[0].windowId, {}, sidebarWindow => {
          callback(sidebarWindow);
        });
      }
    });
  }


  let updatingWindowPosition = false;
  function updateWindowsPosition(sidebarWindow, currentWindow) {
    if (updatingWindowPosition)
      return;
    updatingWindowPosition = true;
    console.log('Updating windows position', sidebarWindow, currentWindow);
    chrome.system.display.getInfo(displaysInfo => {
      console.log('Identifying monitor for window', currentWindow, displaysInfo);
      const windowMidX = currentWindow.left + currentWindow.width / 2;
      const windowMidY = currentWindow.top + currentWindow.height / 2;
      let bestDisplay = 0;
      let bestDistance = 10E6;
      for (let i = 0; i < displaysInfo.length; i++) {
        const displayMidX = displaysInfo[i].workArea.left + displaysInfo[i].workArea.width;
        const displayMidY = displaysInfo[i].workArea.top + displaysInfo[i].workArea.height;
        const distanceToDisplayCenter = Math.sqrt(Math.pow(windowMidX - displayMidX, 2) + Math.pow(windowMidY - displayMidY, 2));
        if (distanceToDisplayCenter < bestDistance) {
          bestDisplay = i;
          bestDistance = distanceToDisplayCenter;
        }
      }
      const bestDisplayInfo = displaysInfo[bestDisplay];
      console.log('Best display', bestDisplayInfo, currentWindow.id);
      const workAreaLeft = bestDisplayInfo.workArea.left;
      const workAreaTop = bestDisplayInfo.workArea.top;
      const workAreaHeight = bestDisplayInfo.workArea.height;
      const workAreaWidth = bestDisplayInfo.workArea.width;
      chrome.windows.update(sidebarWindow.id, {
        focused: true,
        left: workAreaLeft,
        top: workAreaTop,
        width: 400,
        height: workAreaHeight
      }, () => {
        chrome.windows.update(currentWindow.id, {left: workAreaLeft + 400, width: workAreaWidth - 400, top: workAreaTop, height: workAreaHeight, focused: true}, () => {
          setTimeout(() => {
            updatingWindowPosition = false;
          }, 500);
        });
      });
    });
  }
});
