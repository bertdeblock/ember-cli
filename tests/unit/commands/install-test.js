'use strict';

const { expect } = require('chai');
const commandOptions = require('../../factories/command-options');
const InstallCommand = require('../../../lib/commands/install');

describe('install command', function () {
  it('throws', async function () {
    const installCommand = new InstallCommand(commandOptions());

    await expect(installCommand.validateAndRun(['ember-data'])).to.be.rejectedWith(
      /The `install` command is no longer supported. Please run `pnpm add -D ember-data` instead./
    );
  });
});
