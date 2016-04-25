  (function($) {
    var _s = document.createElement('SPAN');
    _s.className = 'fa-stack jstree-stackedicon';
    var _i = document.createElement('I');
    _i.className = 'jstree-icon';
    _i.setAttribute('role', 'presentation');

    $.jstree.plugins.tabLordNodeIcons = function(options, parent) {
      this.teardown = function() {
        this.element.find('.tabs-lord-icon').remove();
        parent.teardown.call(this);
      };
      this.redraw_node = function(obj) {
        obj = parent.redraw_node.apply(this, arguments);
        if (obj) {
          var node = this._model.data[obj.id];
          if (node && node.original && node.original.tabId !== undefined) {
            var liEl = $(obj);
            if (liEl.find('i.tabs-lord-close-icon').length === 0) {
              var closeIconEl = $('<i class="tabs-lord-icon tabs-lord-icon-close"></i>').click(function() {
                chrome.tabs.remove(node.original.tabId);
              });
              liEl.append(closeIconEl);
            }
            // Mark suspended tabs with gray font colour
            if (node.original.url && node.original.url.indexOf('chrome-extension://klbibkeccnjlkjkiokjodocebajanakg') === 0) {
              log('Hibernated tab found', node);
              liEl.find('a.jstree-anchor').css('color', '#C0C0C0').css('font-style', 'italic');
            }
            if (node.original.duplicate) {
              liEl.find('a.jstree-anchor').css('background-color', '#FFE0E0');
            }
          }
        }
        return obj;
      };
    };
  })(jQuery);

