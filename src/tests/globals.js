'use strict';
chrome = {
  bookmarks: {
    create: function(id, title, callback) { },
    getChildren: function(parentId, callback) { },
    search: function(query, callback) { },
    update: function(id, updateInfo, callback) { },
    remove: function(id, callback) { },
    removeTree: function(id, callback) { }
  },
  extension: {
    getURL: function() {
      return 'chrome-extension://dnlmfamjfefjpjokgoafhofbabkipmaa/sidebar.html';
    }
  }
};
