/// <reference no-default-lib="true"/>
/// <reference path="../../typings/lib.es6.d.ts" />
"use strict";
var LOG = true;
exports.SIDEBAR_EXTENSION_URL = 'chrome-extension://dnlmfamjfefjpjokgoafhofbabkipmaa/sidebar.html';
function debug(message) {
    var additionalParams = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        additionalParams[_i - 1] = arguments[_i];
    }
    if (LOG) {
        console.debug.apply(console, [message].concat(additionalParams));
    }
}
exports.debug = debug;
function log(message) {
    var additionalParams = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        additionalParams[_i - 1] = arguments[_i];
    }
    if (LOG) {
        console.log.apply(console, [message].concat(additionalParams));
    }
}
exports.log = log;
function warn(message) {
    var additionalParams = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        additionalParams[_i - 1] = arguments[_i];
    }
    console.warn.apply(console, [message].concat(additionalParams));
}
exports.warn = warn;
function isSidebarExtensionUrl(url) {
    return url === exports.SIDEBAR_EXTENSION_URL;
}
exports.isSidebarExtensionUrl = isSidebarExtensionUrl;
