var LOG = true;
function log() {
  if (LOG) {
    console.log.apply(console, arguments);
  }
}