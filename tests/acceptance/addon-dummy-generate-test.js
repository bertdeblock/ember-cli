'use strict';

const ember = require('../helpers/ember');
const fs = require('fs-extra');
const path = require('path');
let root = process.cwd();
let tmproot = path.join(root, 'tmp');
const mkTmpDirIn = require('../helpers/mk-tmp-dir-in');

const { expect } = require('chai');
const { file } = require('chai-files');

describe('Acceptance: ember generate in-addon-dummy', function () {
  this.timeout(20000);

  beforeEach(async function () {
    let tmpdir = await mkTmpDirIn(tmproot);
    process.chdir(tmpdir);
  });

  afterEach(function () {
    process.chdir(root);
    return fs.remove(tmproot);
  });

  function initAddon() {
    return ember(['addon', 'my-addon', '--skip-npm']);
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

  // ember addon foo --lang
  // -------------------------------
  // Good: Correct Usage
  it('ember addon foo --lang=(valid code): no message + set `lang` in index.html', async function () {
    await ember(['addon', 'foo', '--skip-npm', '--skip-git', '--lang=en-US']);
    expect(file('tests/dummy/app/index.html')).to.contain('<html lang="en-US">');
  });

  // Edge Case: both valid code AND programming language abbreviation, possible misuse
  it('ember addon foo --lang=(valid code + programming language abbreviation): emit warning + set `lang` in index.html', async function () {
    await ember(['addon', 'foo', '--skip-npm', '--skip-git', '--lang=css']);
    expect(file('tests/dummy/app/index.html')).to.contain('<html lang="css">');
  });

  // Misuse: possibly an attempt to set app programming language
  it('ember addon foo --lang=(programming language): emit warning + do not set `lang` in index.html', async function () {
    await ember(['addon', 'foo', '--skip-npm', '--skip-git', '--lang=JavaScript']);
    expect(file('tests/dummy/app/index.html')).to.contain('<html>');
  });

  // Misuse: possibly an attempt to set app programming language
  it('ember addon foo --lang=(programming language abbreviation): emit warning + do not set `lang` in index.html', async function () {
    await ember(['addon', 'foo', '--skip-npm', '--skip-git', '--lang=JS']);
    expect(file('tests/dummy/app/index.html')).to.contain('<html>');
  });

  // Misuse: possibly an attempt to set app programming language
  it('ember addon foo --lang=(programming language file extension): emit warning + do not set `lang` in index.html', async function () {
    await ember(['addon', 'foo', '--skip-npm', '--skip-git', '--lang=.js']);
    expect(file('tests/dummy/app/index.html')).to.contain('<html>');
  });

  // Misuse: Invalid Country Code
  it('ember addon foo --lang=(invalid code): emit warning + do not set `lang` in index.html', async function () {
    await ember(['addon', 'foo', '--skip-npm', '--skip-git', '--lang=en-UK']);
    expect(file('tests/dummy/app/index.html')).to.contain('<html>');
  });
});
