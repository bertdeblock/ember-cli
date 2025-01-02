'use strict';

module.exports = function (data, options) {
  options.project.version = require('../package.json').version;
};
