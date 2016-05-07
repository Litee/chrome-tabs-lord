const LOG = true;

export function debug(...args: any[]) {
  if (LOG) {
    console.debug(...args);
  }
}

export function log(...args: any[]) {
  if (LOG) {
    console.log(...args);
  }
}

export function warn(...args: any[]) {
  console.warn(...args);
}

