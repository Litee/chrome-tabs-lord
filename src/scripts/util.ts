/// <reference no-default-lib="true"/>
/// <reference path="../../typings/lib.es6.d.ts" />

const LOG = true;
export const SIDEBAR_EXTENSION_URL = 'chrome-extension://dnlmfamjfefjpjokgoafhofbabkipmaa/sidebar.html';

export function debug(message?: any, ...additionalParams: any[]) {
  if (LOG) {
    console.debug(message, ...additionalParams);
  }
}

export function log(message?: any, ...additionalParams: any[]) {
  if (LOG) {
    console.log(message, ...additionalParams);
  }
}

export function warn(message?: any, ...additionalParams: any[]) {
  console.warn(message, ...additionalParams);
}

export function isSidebarExtensionUrl(url: string) : boolean {
  return url === SIDEBAR_EXTENSION_URL;
}
