/// <reference path="../../typings/lib.es6.d.ts" />
/// <reference path="../../typings/index.d.ts" />

describe('Tests for window models', () => {

  chrome = {
    bookmarks: {
      getChildren: function(parentId: number, callback: () => void): void { },
      search: function(query: any, callback: any[]): void { },
      update: function(id: number, updateInfo: any, callback: () => void): void {},
    }
  };

  it('show allow add new window', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:windowAddedToModel');

    // When
    model.addWindowModel(undefined, 123, 'My Window', false);

    // Then
    const windowModels = model.getWindowModels();
    expect(windowModels).toBeDefined();
    expect(windowModels.length).toBe(1);
    expect(windowModels[0]).toEqual(jasmine.objectContaining({windowId: 123, title: 'My Window', hibernated: false, tabsCount: 0, tabsToHide: 0}));
    expect(windowModels[0].windowGuid).toBeDefined();
    expect(model.getWindowModelById(123)).toEqual(jasmine.objectContaining({title: 'My Window'}));

    expect(spyEvent).toHaveBeenTriggered();
  });

  it('should re-use windowGuid if provided', () => {
    // Given
    const model = new models.Model();

    // When
    model.addWindowModel('123-456', 123, 'My Window', false);

    // Then
    const windowModels = model.getWindowModels();
    expect(windowModels[0].windowGuid).toBe('123-456');
    expect(model.getWindowModelByGuid('123-456')).toEqual(jasmine.objectContaining({ title: 'My Window' }));
  });

  it('should rename normal window', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:windowModelsUpdated');
    model.addWindowModel('123-456', 123, 'My Window', false);

    // When
    model.renameWindow('123-456', 'Renamed Window', () => {});

    // Then
    expect(model.getWindowModelByGuid('123-456').title).toBe('Renamed Window');
    expect(spyEvent).toHaveBeenTriggered();
  });

  it('should rename hibernated window', () => {
    // Given
    const model = new models.Model();
    const spyEvent = spyOnEvent(document, 'tabsLord:windowModelsUpdated');
    model.addWindowModel('123-456', 123, 'My Window', true);
    spyOn(chrome.bookmarks, 'search').and.callFake((query, callback) => {
      callback([{id: 492}]);
    });
    spyOn(chrome.bookmarks, 'getChildren').and.callFake((parentId, callback) => {
      callback([{id: 928, title: 'My Window'}]);
    });
    spyOn(chrome.bookmarks, 'update');

    // When, Then
    model.renameWindow('123-456', 'Renamed Window', () => {
      expect(spyEvent).toHaveBeenTriggered();
      expect(model.getWindowModelByGuid('123-456').title).toBe('Renamed Window');
      expect(chrome.bookmarks).toHaveBeenCalledWith(928, { title: 'Renamed Window' }, jasmine.any(Function));
    });

    // Then
  });
});
