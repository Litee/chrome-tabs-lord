const LOG = true;

function debug() {
  'use strict';
  if (LOG) {
    console.debug.apply(console, arguments);
  }
}

function log() {
  'use strict';
  if (LOG) {
    console.log.apply(console, arguments);
  }
}

function warn() {
  'use strict';
  if (LOG) {
    console.warn.apply(console, arguments);
  }
}

