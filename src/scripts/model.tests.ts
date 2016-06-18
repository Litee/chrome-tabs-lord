/// <reference path="../../typings/lib.es6.d.ts" />
/// <reference path="../../typings/index.d.ts" />
/// <reference path="../../typings/jasmine-jquery.d.ts" />

describe('Tests for window models', () => {

  it('show add new window model', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:windowAddedToModel');

    // When
    model.addWindowModel(undefined, 10, 'My Window', false);

    // Then
    const windowModels = model.getWindowModels();
    expect(windowModels).toBeDefined();
    expect(windowModels.length).toBe(1);
    expect(windowModels[0]).toEqual(jasmine.objectContaining({windowId: 10, title: 'My Window', hibernated: false, tabsCount: 0, tabsToHide: 0}));
    expect(windowModels[0].windowGuid).toBeDefined();
    expect(model.getWindowModelById(10)).toEqual(jasmine.objectContaining({title: 'My Window'}));

    expect(spyEvent).toHaveBeenTriggered();
  });

  it('show remove window model', testDone => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:windowRemovedFromModel');
    model.addWindowModel('win-1', 10, 'My Window', false);
    model.addTabModel('win-1', 100, 'tab-1', 'My Tab 1', 'http://test.com/favicon.png', 'http://test.com', 0, false, false);

    // When, Then
    model.deleteWindowModel('win-1', () => {
      expect(model.getWindowModels().length).toBe(0);
      expect(model.getWindowModelByGuid('win-1')).toBeUndefined();
      expect(model.getWindowModelById(10)).toBeUndefined();

      expect(spyEvent).toHaveBeenTriggered();
      testDone();
    });
  });

  it('should re-use windowGuid if provided', () => {
    // Given
    const model = new models.Model();

    // When
    model.addWindowModel('win-1', 10, 'My Window', false);

    // Then
    const windowModels = model.getWindowModels();
    expect(windowModels[0].windowGuid).toBe('win-1');
    expect(model.getWindowModelByGuid('win-1')).toEqual(jasmine.objectContaining({ title: 'My Window' }));
  });

  it('should rename normal window', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:windowModelsUpdated');
    model.addWindowModel('win-1', 10, 'My Window', false);

    // When
    model.renameWindow('win-1', 'Renamed Window', () => { });

    // Then
    expect(model.getWindowModelByGuid('win-1').title).toBe('Renamed Window');
    expect(spyEvent).toHaveBeenTriggered();
  });

  it('should create bookmark on hibernating window', testDone => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:windowModelsUpdated');
    spyOn(chrome.bookmarks, 'search').and.callFake((query, callback) => {
      callback([{ id: 1001 }]);
    });
    spyOn(chrome.bookmarks, 'getChildren').and.callFake((parentId, callback) => {
      callback([{ id: 1002, title: 'My Window' }]);
    });
    spyOn(chrome.bookmarks, 'create').and.callFake((bookmarkId, title, callback) => {
      callback();
    });
    model.addWindowModel('win-1', 10, 'My Window', false);

    // When
    model.hibernateWindow('win-1', 'Renamed Window');

    // Then - TODO, currently bookmark is created with delay - need to mock to write proper test
    testDone();
  });

  it('should rename bookmark for hibernated window', testDone => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:windowModelsUpdated');
    model.addWindowModel('win-1', 10, 'My Window', true);
    spyOn(chrome.bookmarks, 'search').and.callFake((query, callback) => {
      callback([{id: 1001}]);
    });
    spyOn(chrome.bookmarks, 'getChildren').and.callFake((parentId, callback) => {
      callback([{id: 1002, title: 'My Window'}]);
    });
    spyOn(chrome.bookmarks, 'update').and.callFake((bookmarkId, newTitle, callback) => {
      callback();
    });

    // When, Then
    model.renameWindow('win-1', 'Renamed Window', () => {
      expect(model.getWindowModelByGuid('win-1').title).toBe('Renamed Window');
      expect(chrome.bookmarks.update).toHaveBeenCalledWith(1002, { title: 'Renamed Window' }, jasmine.any(Function));
      expect(spyEvent).toHaveBeenTriggered();
      testDone();
    });
  });

  it('should remove bookmark when removing hibernated window', testDone => {
    // Given
    const model = new models.Model();
    model.addWindowModel('win-1', 10, 'My Window', true);
    spyOn(chrome.bookmarks, 'search').and.callFake((query, callback) => {
      callback([{id: 1001}]);
    });
    spyOn(chrome.bookmarks, 'getChildren').and.callFake((parentId, callback) => {
      callback([{id: 1002, title: 'My Window'}]);
    });
    spyOn(chrome.bookmarks, 'removeTree').and.callFake((bookmarkId, callback) => {
      callback();
    });

    // When, Then
    model.deleteWindowModel('win-1', () => {
      expect(chrome.bookmarks.removeTree).toHaveBeenCalledWith(1002, jasmine.any(Function));
      testDone();
    });
  });

  it('should not throw an error when bookmark is missing when removing hibernated window', testDone => {
    // Given
    const model = new models.Model();
    model.addWindowModel('win-1', 10, 'My Window', true);
    spyOn(chrome.bookmarks, 'search').and.callFake((query, callback) => {
      callback([{id: 1001}]);
    });
    spyOn(chrome.bookmarks, 'getChildren').and.callFake((parentId, callback) => {
      callback([]);
    });
    spyOn(chrome.bookmarks, 'removeTree').and.callFake((bookmarkId, callback) => {
      callback();
    });

    // When, Then
    model.deleteWindowModel('win-1', () => {
      expect(chrome.bookmarks.removeTree).not.toHaveBeenCalledWith(1002, jasmine.any(Function));
      testDone();
    });
  });

});

describe('Tests for tab models', () => {
  it('should add new tab model', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:tabAddedToModel');
    model.addWindowModel('win-1', 10, 'My Window', false);

    // When
    model.addTabModel('win-1', 100, 'tab-1', 'My Tab 1', 'http://test.com/favicon.png', 'http://test.com', 0, false, false);

    // Then
    expect(model.getWindowModelByGuid('win-1')).toEqual(jasmine.objectContaining({ title: 'My Window', tabsCount: 1, tabsToHide: 0 }));
    expect(model.getTabModels().length).toBe(1);
    expect(model.getTabModelByGuid('tab-1')).toEqual(jasmine.objectContaining({
      title: 'My Tab 1',
      tabId: 100,
      index: 0,
      snoozed: false,
      selected: false,
      audible: false,
      matchesFilter: true,
      favIconUrl: 'http://test.com/favicon.png',
      url: 'http://test.com',
      normalizedUrl: 'test.com' }));
    expect(model.getTabsByWindowGuid('win-1').length).toBe(1);

    expect(spyEvent).toHaveBeenTriggered();
  });

  it('should generate guid when adding new tab model', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:tabAddedToModel');
    model.addWindowModel('win-1', 10, 'My Window', false);

    // When
    model.addTabModel('win-1', 100, undefined, 'My Tab 1', 'http://test.com/favicon.png', 'http://test.com', 0, false, false);

    // Then
    expect(model.getWindowModelByGuid('win-1')).toEqual(jasmine.objectContaining({ title: 'My Window', tabsCount: 1, tabsToHide: 0 }));
    expect(model.getTabModels().length).toBe(1);
    expect(model.getTabModelById(100).tabGuid).toBeDefined();
    expect(model.getTabModelById(100)).toEqual(jasmine.objectContaining({
      title: 'My Tab 1',
      tabId: 100,
      index: 0,
      snoozed: false,
      selected: false,
      audible: false,
      matchesFilter: true,
      favIconUrl: 'http://test.com/favicon.png',
      url: 'http://test.com',
      normalizedUrl: 'test.com' }));

    expect(spyEvent).toHaveBeenTriggered();
  });

  it('should not add new tab model if window model not found', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:tabAddedToModel');
    model.addWindowModel('win-1', 10, 'My Window', false);

    // When
    model.addTabModel('win-2', 100, 'tab-1', 'My Tab 1', 'http://test.com/favicon.png', 'http://test.com', 0, false, false);

    // Then
    expect(model.getTabsCount()).toBe(0);
    expect(model.getTabModels().length).toBe(0);
    expect(spyEvent).not.toHaveBeenTriggered();
  });

  it('should mark tab as snoozed', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:tabAddedToModel');
    model.addWindowModel('win-1', 10, 'My Window', false);

    // When
    model.addTabModel('win-1', 100, 'tab-1', 'My Tab 1', 'http://test.com/favicon.png', 'chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#uri=http://test.com', 0, false, false);

    // Then
    expect(model.getWindowModelByGuid('win-1')).toEqual(jasmine.objectContaining({ title: 'My Window', tabsCount: 1, tabsToHide: 0 }));
    expect(model.getTabModels().length).toBe(1);
    expect(model.getTabModelByGuid('tab-1')).toEqual(jasmine.objectContaining({
      title: 'My Tab 1',
      snoozed: true,
      url: 'chrome-extension://klbibkeccnjlkjkiokjodocebajanakg/suspended.html#uri=http://test.com',
      normalizedUrl: 'test.com'
    }));
  });

  it('should remove tab model', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:tabRemovedFromModel');
    model.addWindowModel('win-1', 10, 'My Window', false);
    model.addTabModel('win-1', 100, 'tab-1', 'My Tab 1', 'http://test.com/favicon.png', 'http://test.com', 0, false, false);

    // When
    model.deleteTabModel('tab-1');

    // Then
    expect(model.getWindowModelByGuid('win-1')).toEqual(jasmine.objectContaining({ title: 'My Window', tabsCount: 0, tabsToHide: 0 }));
    expect(model.getTabModels().length).toBe(0);
    expect(model.getTabModelByGuid('tab-1')).toBeUndefined();

    expect(spyEvent).toHaveBeenTriggered();
  });

  it('show remove child tab models when removing parent window model', testDone => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:tabRemovedFromModel');
    model.addWindowModel('win-1', 10, 'My Window', false);
    model.addTabModel('win-1', 100, 'tab-1', 'My Tab 1', 'http://test1.com/favicon.png', 'http://test1.com', 0, false, false);
    model.addTabModel('win-1', 101, 'tab-2', 'My Tab 2', 'http://test2.com/favicon.png', 'http://test2.com', 1, false, false);

    // When, Then
    model.deleteWindowModel('win-1', () => {
      expect(model.getTabsCount()).toBe(0);
      expect(model.getTabModels().length).toBe(0);
      expect(model.getTabModelByGuid('tab-1')).toBeUndefined();
      expect(model.getTabModelById(100)).toBeUndefined();

      expect(spyEvent).toHaveBeenTriggered();
      testDone();
    });

  });

  it('should ignore if trying to remove non-existing tab model', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:tabRemovedFromModel');
    model.addWindowModel('win-1', 123, 'My Window', false);
    model.addTabModel('win-1', 934, 'tab-1', 'My Tab 1', 'http://test.com/favicon.png', 'http://test.com', 0, false, false);

    // When
    model.deleteTabModel('non-existing-tab-guid');

    // Then
    expect(model.getWindowModelByGuid('win-1')).toEqual(jasmine.objectContaining({ title: 'My Window', tabsCount: 1, tabsToHide: 0 }));
    expect(model.getTabModels().length).toBe(1);
    expect(model.getTabModelByGuid('tab-1')).toBeDefined();

    expect(spyEvent).not.toHaveBeenTriggered();
  });


  it('should remove tab bookmark when removing tab hosted in hibernated window', testDone => {
    // Given
    const model = new models.Model();
    model.addWindowModel('win-1', 10, 'My Window', true);
    model.addTabModel('win-1', 100, 'tab-1', 'My Tab 1', 'http://test1.com/favicon.png', 'http://test1.com', 0, false, false);
    spyOn(chrome.bookmarks, 'search').and.callFake((query, callback) => {
      callback([{ id: 1001 }]);
    });
    spyOn(chrome.bookmarks, 'getChildren').and.callFake((parentId, callback) => {
      if (parentId === 1001) {
        callback([{ id: 1002, title: 'My Window' }]);
      }
      else if (parentId === 1002) {
        callback([{ id: 1003, title: 'My Tab 1', url: 'http://test1.com' }]);
      }
    });
    spyOn(chrome.bookmarks, 'remove').and.callFake((bookmarkId, callback) => {
      callback();
    });

    // When, Then
    model.deleteTabModel('tab-1', () => {
      expect(chrome.bookmarks.remove).toHaveBeenCalledWith(1003, jasmine.any(Function));
      testDone();
    });
  });


  it('should mark model as audible when sound is played', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:tabModelsUpdated');
    const spyEvent2 = spyOnEvent(document, 'tabsLord:globalFlagsChanged');
    model.addWindowModel('win-1', 10, 'My Window', false);
    model.addTabModel('win-1', 100, 'tab-1', 'My Tab 1', 'http://test.com/favicon.png', 'http://test.com', 0, false, false);

    // When
    model.updateTabModel('tab-1', {audible: true});

    // Then
    expect(model.getTabModelByGuid('tab-1').audible).toBe(true);

    expect(spyEvent).toHaveBeenTriggered();
    expect(spyEvent2).toHaveBeenTriggered();
  });

  it('should mark model as non-audible when sound has stopped', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:tabModelsUpdated');
    const spyEvent2 = spyOnEvent(document, 'tabsLord:globalFlagsChanged');
    model.addWindowModel('win-1', 10, 'My Window', false);
    model.addTabModel('win-1', 100, 'tab-1', 'My Tab 1', 'http://test.com/favicon.png', 'http://test.com', 0, false, true);

    // When
    model.updateTabModel('tab-1', { audible: false });

    // Then
    expect(model.getTabModelByGuid('tab-1').audible).toBe(false);

    expect(spyEvent).toHaveBeenTriggered();
    expect(spyEvent2).toHaveBeenTriggered();
  });

  it('should set global audible flag if audible tab model is added', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:globalFlagsChanged');
    model.addWindowModel('win-1', 10, 'My Window', false);

    // When
    model.addTabModel('win-1', 100, 'tab-1', 'My Tab 1', 'http://test.com/favicon.png', 'http://test.com', 0, false, true);

    // Then
    expect(model.getTabModelByGuid('tab-1').audible).toBe(true);

    expect(spyEvent).toHaveBeenTriggered();
  });

  it('should show/hide new tabs depending on whether they match search pattern', () => {
    // Given
    const model = new models.Model();
    model.changeSearchPattern('test2');
    const spyEvent = spyOnEvent(document, 'tabsLord:tabAddedToModel');
    model.addWindowModel('win-1', 123, 'My Window', false);

    // When
    model.addTabModel('win-1', 101, 'tab-1', 'My Tab 1', 'http://test1.com/favicon.png', 'http://test1.com', 0, false, false);
    model.addTabModel('win-1', 102, 'tab-2', 'My Tab 2', 'http://test2.com/favicon.png', 'http://test2.com', 1, false, false);
    model.addTabModel('win-1', 103, 'tab-3', 'My Tab 3 (test2)', 'http://test3.com/favicon.png', 'http://test3.com', 2, false, false);

    // Then
    expect(model.getTabModels().length).toBe(3);
    expect(model.getWindowModelByGuid('win-1')).toEqual(jasmine.objectContaining({ title: 'My Window', tabsCount: 3, tabsToHide: 1 }));
    expect(model.getTabModelByGuid('tab-1')).toEqual(jasmine.objectContaining({ title: 'My Tab 1', matchesFilter: false }));
    expect(model.getTabModelByGuid('tab-2')).toEqual(jasmine.objectContaining({ title: 'My Tab 2', matchesFilter: true }));
    expect(model.getTabModelByGuid('tab-3')).toEqual(jasmine.objectContaining({ title: 'My Tab 3 (test2)', matchesFilter: true }));

    expect(spyEvent).toHaveBeenTriggered();
  });

  it('should unselect all tabs', () => {
    // Given
    const model = new models.Model();
    model.changeSearchPattern('test2');
    const spyEvent = spyOnEvent(document, 'tabsLord:tabAddedToModel');
    model.addWindowModel('win-1', 123, 'My Window', false);
    model.addTabModel('win-1', 101, 'tab-1', 'My Tab 1', 'http://test1.com/favicon.png', 'http://test1.com', 0, true, false);
    model.addTabModel('win-1', 102, 'tab-2', 'My Tab 2', 'http://test2.com/favicon.png', 'http://test2.com', 1, true, false);

    // When
    model.unselectAllTabs();

    // Then
    expect(model.getTabsCount()).toBe(2);
    expect(model.getTabModelByGuid('tab-1')).toEqual(jasmine.objectContaining({ title: 'My Tab 1', selected: false }));
    expect(model.getTabModelByGuid('tab-2')).toEqual(jasmine.objectContaining({ title: 'My Tab 2', selected: false }));

    expect(spyEvent).toHaveBeenTriggered();
  });
});
