/// <reference no-default-lib="true"/>
/// <reference path="../../typings/lib.es6.d.ts" />

const LOG = true;

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