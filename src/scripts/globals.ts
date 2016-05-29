chrome = {
  bookmarks: {
    getChildren: function(parentId: number, callback: () => void): void { },
    search: function(query: any, callback: any[]): void { },
    update: function(id: number, updateInfo: any, callback: () => void): void { },
    removeTree: function(id: number, callback: () => void): void { },
    create: function(id: number, title: string, callback: () => void): void { },
  },
  extension: {
    getURL: function() {
      return 'chrome-extension://dnlmfamjfefjpjokgoafhofbabkipmaa/sidebar.html';
    }
  }
};
