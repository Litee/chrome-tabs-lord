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

    // When, Then
    model.deleteWindowModel('win-1', () => {
      const windowModels = model.getWindowModels();
      expect(windowModels.length).toBe(0);
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

  it('should rename hibernated window', testDone => {
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
    spyOn(chrome.bookmarks, 'update').and.callFake((windowBookmarkId, newTitle, callback) => {
      callback();
    });

    // When, Then
    model.renameWindow('win-1', 'Renamed Window', () => {
      expect(model.getWindowModelByGuid('win-1').title).toBe('Renamed Window');
      expect(chrome.bookmarks.update).toHaveBeenCalledWith(1002, { title: 'Renamed Window' }, jasmine.any(Function));
      expect(spyEvent).toHaveBeenTriggered();
      testDone();
    });

    // Then
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

    expect(spyEvent).toHaveBeenTriggered();
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

  it('should show/hide new tabs depending on whether they match search pattern', () => {
    // Given
    const model = new models.Model();
    model.changeSearchPattern('test2');
    const spyEvent = spyOnEvent(document, 'tabsLord:tabAddedToModel');
    model.addWindowModel('win-1', 123, 'My Window', false);

    // When
    model.addTabModel('win-1', 101, 'tab-1', 'My Tab 1', 'http://test1.com/favicon.png', 'http://test1.com', 0, false, false);
    model.addTabModel('win-1', 102, 'tab-2', 'My Tab 2', 'http://test2.com/favicon.png', 'http://test2.com', 1, false, false);
    model.addTabModel('win-1', 103, 'tab-3', 'My Tab 3 (test2)', 'http://test1.com/favicon.png', 'http://test1.com', 2, false, false);

    // Then
    expect(model.getTabModels().length).toBe(3);
    expect(model.getWindowModelByGuid('win-1')).toEqual(jasmine.objectContaining({ title: 'My Window', tabsCount: 3, tabsToHide: 1 }));
    expect(model.getTabModelByGuid('tab-1')).toEqual(jasmine.objectContaining({ title: 'My Tab 1', matchesFilter: false }));
    expect(model.getTabModelByGuid('tab-2')).toEqual(jasmine.objectContaining({ title: 'My Tab 2', matchesFilter: true }));
    expect(model.getTabModelByGuid('tab-3')).toEqual(jasmine.objectContaining({ title: 'My Tab 3 (test2)', matchesFilter: true }));

    expect(spyEvent).toHaveBeenTriggered();
  });

});
