'use strict';

const ember = require('./ember');

function initApp() {
  return ember(['init', '--name=my-app']);
}

module.exports = initApp;
