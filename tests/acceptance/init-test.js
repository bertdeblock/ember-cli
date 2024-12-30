'use strict';

const ember = require('../helpers/ember');
const walkSync = require('walk-sync');
const glob = require('glob');
const Blueprint = require('../../lib/models/blueprint');
const path = require('path');
const fs = require('fs');
const os = require('os');
let root = process.cwd();
const util = require('util');
const minimatch = require('minimatch');
const { intersection: intersect, remove } = require('ember-cli-lodash-subset');
const EOL = require('os').EOL;
const td = require('testdouble');

const { expect } = require('chai');
const { dir, file } = require('chai-files');

let defaultIgnoredFiles = Blueprint.ignoredFiles;

describe('Acceptance: ember init', function () {
  this.timeout(20000);

  async function makeTempDir() {
    let baseTmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'init-test'));
    let projectDir = path.join(baseTmpDir, 'hello-world');

    await fs.promises.mkdir(projectDir);

    return projectDir;
  }

  let tmpPath;
  beforeEach(async function () {
    Blueprint.ignoredFiles = defaultIgnoredFiles;

    tmpPath = await makeTempDir();
    process.chdir(tmpPath);
  });

  afterEach(function () {
    td.reset();
    process.chdir(root);
  });

  function confirmBlueprinted(typescript = false) {
    let blueprintPath = path.join(root, 'blueprints', 'app', 'files');
    // ignore TypeScript files
    let expected = walkSync(blueprintPath, {
      ignore: ['tsconfig.json', 'types', 'app/config'],
    }).map((name) => (typescript ? name : name.replace(/\.ts$/, '.js')));

    // This style of assertion can't handle conditionally available files
    if (expected.some((x) => x.endsWith('eslint.config.mjs'))) {
      expected = [...expected.filter((x) => !x.endsWith('eslint.config.mjs')), 'eslint.config.mjs'];
    }
    expected.sort();

    let actual = walkSync('.').sort();

    Object.keys(Blueprint.renamedFiles).forEach((srcFile) => {
      expected[expected.indexOf(srcFile)] = Blueprint.renamedFiles[srcFile];
    });

    removeIgnored(expected);
    removeIgnored(actual);

    removeTmp(expected);
    removeTmp(actual);

    expected.sort();

    expect(expected).to.deep.equal(
      actual,
      `${EOL} expected: ${util.inspect(expected)}${EOL} but got: ${util.inspect(actual)}`
    );
  }

  function confirmGlobBlueprinted(pattern) {
    let blueprintPath = path.join(root, 'blueprints', 'app', 'files');
    let actual = pickSync('.', pattern);
    let expected = intersect(actual, pickSync(blueprintPath, pattern));

    removeIgnored(expected);
    removeIgnored(actual);

    removeTmp(expected);
    removeTmp(actual);

    expected.sort();

    expect(expected).to.deep.equal(
      actual,
      `${EOL} expected: ${util.inspect(expected)}${EOL} but got: ${util.inspect(actual)}`
    );
  }

  function pickSync(filePath, pattern) {
    return glob
      .sync(`**/${pattern}`, {
        cwd: filePath,
        dot: true,
        mark: true,
        strict: true,
      })
      .sort();
  }

  function removeTmp(array) {
    remove(array, function (entry) {
      return /^tmp[\\/]$/.test(entry);
    });
  }
  function removeIgnored(array) {
    remove(array, function (fn) {
      return Blueprint.ignoredFiles.some(function (ignoredFile) {
        return minimatch(fn, ignoredFile, {
          matchBase: true,
        });
      });
    });
  }

  it('ember init', async function () {
    await ember(['init']);

    confirmBlueprinted();
  });

  it("init an already init'd folder", async function () {
    await ember(['init']);

    await ember(['init']);

    confirmBlueprinted();
  });

  it('init a single file', async function () {
    await ember(['init', 'app.js']);

    confirmGlobBlueprinted('app.js');
  });

  it("init a single file on already init'd folder", async function () {
    await ember(['init']);

    await ember(['init', 'app.js']);

    confirmBlueprinted();
  });

  it('init multiple files by glob pattern', async function () {
    await ember(['init', 'app/**']);

    confirmGlobBlueprinted('app/**');
  });

  it("init multiple files by glob pattern on already init'd folder", async function () {
    await ember(['init']);

    await ember(['init', 'app/**']);

    confirmBlueprinted();
  });

  it('init multiple files by glob patterns', async function () {
    await ember(['init', 'app/**', 'package.json', 'resolver.js']);

    confirmGlobBlueprinted('{app/**,package.json,resolver.js}');
  });

  it("init multiple files by glob patterns on already init'd folder", async function () {
    await ember(['init']);

    await ember(['init', 'app/**', 'package.json', 'resolver.js']);

    confirmBlueprinted();
  });

  it('should not create .git folder', async function () {
    await ember(['init']);

    expect(dir('.git')).to.not.exist;
  });

  it('no CI provider', async function () {
    await ember(['init', '--ci-provider=none', '--skip-install', '--skip-git']);

    expect(file('.github/workflows/ci.yml')).to.not.exist;
    expect(file('config/ember-cli-update.json')).to.include('--ci-provider=none');
  });
});
