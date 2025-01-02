'use strict';

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const Command = require('../models/command');

module.exports = Command.extend({
  name: 'version',
  description: 'outputs ember-cli version',
  aliases: ['v', '--version', '-v'],
  works: 'everywhere',

  availableOptions: [{ name: 'verbose', type: Boolean, default: false }],

  run(options) {
    this.printVersion(
      'ember-cli',
      require('../../package.json').version + (isLocal ? ` - ${chalk.bold.red('local')}` : '')
    );

    let versions = process.versions;
    versions['os'] = `${process.platform} ${process.arch}`;

    let alwaysPrint = ['node', 'os'];

    for (let module in versions) {
      if (options.verbose || alwaysPrint.indexOf(module) > -1) {
        this.printVersion(module, versions[module]);
      }
    }
  },

  printVersion(module, version) {
    this.ui.writeLine(`${module}: ${version}`);
  },
});

function isLocal() {
  return fs.existsSync(path.join(__dirname, '..', '..', '.git'));
}
