'use strict';

const ember = require('../helpers/ember');
const replaceFile = require('ember-cli-internal-test-helpers/lib/helpers/file-utils').replaceFile;
const fs = require('fs-extra');
const path = require('path');
let root = process.cwd();
let tmproot = path.join(root, 'tmp');
const mkTmpDirIn = require('../helpers/mk-tmp-dir-in');

const { expect } = require('chai');
const { file } = require('chai-files');

describe('Acceptance: ember generate pod', function () {
  this.timeout(60000);

  let tmpdir;

  beforeEach(async function () {
    tmpdir = await mkTmpDirIn(tmproot);
    process.chdir(tmpdir);
  });

  afterEach(function () {
    process.chdir(root);
    return fs.remove(tmproot);
  });

  function initApp() {
    return ember(['init', '--name=my-app', '--skip-npm']);
  }

  function generate(args) {
    let generateArgs = ['generate'].concat(args);

    return initApp().then(function () {
      return ember(generateArgs);
    });
  }

  function generateWithPrefix(args) {
    let generateArgs = ['generate'].concat(args);

    return initApp().then(function () {
      replaceFile('config/environment.js', '(var|let|const) ENV = {', "$1 ENV = {\npodModulePrefix: 'app/pods', \n");
      return ember(generateArgs);
    });
  }

  it('blueprint foo --pod', async function () {
    await generate(['blueprint', 'foo', '--pod']);

    expect(file('blueprints/foo/index.js').content).to.matchSnapshot();
  });

  it('blueprint foo/bar --pod', async function () {
    await generate(['blueprint', 'foo/bar', '--pod']);

    expect(file('blueprints/foo/bar/index.js').content).to.matchSnapshot();
  });

  it('uses blueprints from the project directory', async function () {
    await initApp();
    await fs.outputFile(
      'blueprints/foo/files/app/foos/__name__.js',
      "import Ember from 'ember';\n" + 'export default Ember.Object.extend({ foo: true });\n'
    );

    await ember(['generate', 'foo', 'bar', '--pod']);

    expect(file('app/foos/bar.js')).to.contain('foo: true');
  });

  it('allows custom blueprints to override built-ins', async function () {
    await initApp();
    await fs.outputFile(
      'blueprints/controller/files/app/__path__/__name__.js',
      "import Ember from 'ember';\n\n" + 'export default Ember.Controller.extend({ custom: true });\n'
    );

    await ember(['generate', 'controller', 'foo', '--pod']);

    expect(file('app/foo/controller.js')).to.contain('custom: true');
  });

  it('passes custom cli arguments to blueprint options', async function () {
    await initApp();
    await fs.outputFile(
      'blueprints/customblue/files/app/__name__.js',
      'Q: Can I has custom command? A: <%= hasCustomCommand %>'
    );

    await fs.outputFile(
      'blueprints/customblue/index.js',
      'module.exports = {\n' +
        '  fileMapTokens(options) {\n' +
        '    return {\n' +
        '      __name__(options) {\n' +
        '         return options.dasherizedModuleName;\n' +
        '      }\n' +
        '    };\n' +
        '  },\n' +
        '  locals(options) {\n' +
        '    var loc = {};\n' +
        "    loc.hasCustomCommand = (options.customCommand) ? 'Yes!' : 'No. :C';\n" +
        '    return loc;\n' +
        '  },\n' +
        '};\n'
    );

    await ember(['generate', 'customblue', 'foo', '--custom-command', '--pod']);

    expect(file('app/foo.js')).to.contain('A: Yes!');
  });

  it('correctly identifies the root of the project', async function () {
    await initApp();
    await fs.outputFile(
      'blueprints/controller/files/app/__path__/__name__.js',
      "import Ember from 'ember';\n\n" + 'export default Ember.Controller.extend({ custom: true });\n'
    );

    process.chdir(path.join(tmpdir, 'app'));
    await ember(['generate', 'controller', 'foo', '--pod']);

    process.chdir(tmpdir);
    expect(file('app/foo/controller.js')).to.contain('custom: true');
  });

  // Skip until podModulePrefix is deprecated
  it.skip('podModulePrefix deprecation warning', async function () {
    let result = await generateWithPrefix(['controller', 'foo', '--pod']);

    expect(result.outputStream.join()).to.include(
      '`podModulePrefix` is deprecated and will be' +
        ' removed from future versions of ember-cli. Please move existing pods from' +
        " 'app/pods/' to 'app/'."
    );
  });
});
