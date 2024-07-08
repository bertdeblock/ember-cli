'use strict';

const ember = require('../helpers/ember');
const fs = require('fs-extra');
const path = require('path');
let root = process.cwd();
let tmproot = path.join(root, 'tmp');
const Blueprint = require('../../lib/models/blueprint');
const BlueprintNpmTask = require('ember-cli-internal-test-helpers/lib/helpers/disable-npm-on-blueprint');
const mkTmpDirIn = require('../../lib/utilities/mk-tmp-dir-in');

const { expect } = require('chai');
const { file } = require('chai-files');

describe('Acceptance: ember generate in-addon-dummy', function () {
  this.timeout(20000);

  before(function () {
    BlueprintNpmTask.disableNPM(Blueprint);
  });

  after(function () {
    BlueprintNpmTask.restoreNPM(Blueprint);
  });

  beforeEach(async function () {
    let tmpdir = await mkTmpDirIn(tmproot);
    process.chdir(tmpdir);
  });

  afterEach(function () {
    process.chdir(root);
    return fs.remove(tmproot);
  });

  function initAddon() {
    return ember(['addon', 'my-addon']);
  }

  function generateInAddon(args) {
    let generateArgs = ['generate'].concat(args);

    return initAddon().then(function () {
      return ember(generateArgs);
    });
  }

  it('dummy blueprint foo', async function () {
    await generateInAddon(['blueprint', 'foo', '--dummy']);

    expect(file('blueprints/foo/index.js').content).to.matchSnapshot();
  });

  it('dummy blueprint foo/bar', async function () {
    await generateInAddon(['blueprint', 'foo/bar', '--dummy']);

    expect(file('blueprints/foo/bar/index.js').content).to.matchSnapshot();
  });

  it('ember addon foo --lang=(valid code): no message + set `lang` in index.html', async function () {
    await ember(['addon', 'foo', '--skip-git', '--lang=en-US']);
    expect(file('tests/dummy/app/index.html')).to.contain('<html lang="en-US">');
  });
});
