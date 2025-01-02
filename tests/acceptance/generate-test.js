'use strict';

const ember = require('../helpers/ember');
const { outputFile, remove } = require('fs-extra');
const path = require('path');
const replaceFile = require('ember-cli-internal-test-helpers/lib/helpers/file-utils').replaceFile;
let root = process.cwd();
let tmproot = path.join(root, 'tmp');
const mkTmpDirIn = require('../helpers/mk-tmp-dir-in');
const td = require('testdouble');
const lintFix = require('../../lib/utilities/lint-fix');

const { expect } = require('chai');
const { file } = require('chai-files');

describe('Acceptance: ember generate', function () {
  this.timeout(20000);

  let tmpdir;

  beforeEach(async function () {
    tmpdir = await mkTmpDirIn(tmproot);
    process.chdir(tmpdir);
  });

  afterEach(function () {
    td.reset();
    process.chdir(root);
    return remove(tmproot);
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

  it('blueprint foo', async function () {
    await generate(['blueprint', 'foo']);

    expect(file('blueprints/foo/index.js')).to.contain(
      'module.exports = {\n' +
        "  description: ''\n" +
        '\n' +
        '  // locals(options) {\n' +
        '  //   // Return custom template variables here.\n' +
        '  //   return {\n' +
        '  //     foo: options.entity.options.foo\n' +
        '  //   };\n' +
        '  // }\n' +
        '\n' +
        '  // afterInstall(options) {\n' +
        '  //   // Perform extra work here.\n' +
        '  // }\n' +
        '};'
    );
  });

  it('blueprint foo/bar', async function () {
    await generate(['blueprint', 'foo/bar']);

    expect(file('blueprints/foo/bar/index.js').content).to.matchSnapshot();
  });

  it('uses blueprints from the project directory', async function () {
    await initApp();

    await outputFile(
      'blueprints/foo/files/app/foos/__name__.js',
      "import Ember from 'ember';\n" + 'export default Ember.Object.extend({ foo: true });\n'
    );

    await ember(['generate', 'foo', 'bar']);

    expect(file('app/foos/bar.js')).to.contain('foo: true');
  });

  it('allows custom blueprints to override built-ins', async function () {
    await initApp();
    await outputFile(
      'blueprints/controller/files/app/controllers/__name__.js',
      "import Ember from 'ember';\n\n" + 'export default Ember.Controller.extend({ custom: true });\n'
    );

    await ember(['generate', 'controller', 'foo']);

    expect(file('app/controllers/foo.js')).to.contain('custom: true');
  });

  it('allows a path to be specified to a blueprint', async function () {
    await outputFile('path/to/blueprints/foo/files/foo/__name__.js', "console.log('bar');\n");
    await generate([path.join('path', 'to', 'blueprints', 'foo'), 'bar']);

    expect(file('foo/bar.js')).to.contain("console.log('bar');\n");
  });

  it('passes custom cli arguments to blueprint options', async function () {
    await initApp();

    await outputFile(
      'blueprints/customblue/files/app/__name__.js',
      'Q: Can I has custom command? A: <%= hasCustomCommand %>'
    );

    await outputFile(
      'blueprints/customblue/index.js',
      'module.exports = {\n' +
        '  locals(options) {\n' +
        '    var loc = {};\n' +
        "    loc.hasCustomCommand = (options.customCommand) ? 'Yes!' : 'No. :C';\n" +
        '    return loc;\n' +
        '  },\n' +
        '};\n'
    );

    await ember(['generate', 'customblue', 'foo', '--custom-command']);

    expect(file('app/foo.js')).to.contain('A: Yes!');
  });

  it('correctly identifies the root of the project', async function () {
    await initApp();

    await outputFile(
      'blueprints/controller/files/app/controllers/__name__.js',
      "import Ember from 'ember';\n\n" + 'export default Ember.Controller.extend({ custom: true });\n'
    );

    process.chdir(path.join(tmpdir, 'app'));
    await ember(['generate', 'controller', 'foo']);

    process.chdir(tmpdir);
    expect(file('app/controllers/foo.js')).to.contain('custom: true');
  });

  it('custom blueprint availableOptions', async function () {
    await initApp();
    await ember(['generate', 'blueprint', 'foo']);

    replaceFile(
      'blueprints/foo/index.js',
      'module.exports = {',
      'module.exports = {\navailableOptions: [ \n' +
        "{ name: 'foo',\ntype: String, \n" +
        "values: ['one', 'two'],\n" +
        "default: 'one',\n" +
        "aliases: [ {'one': 'one'}, {'two': 'two'} ] } ],\n" +
        'locals(options) {\n' +
        'return { foo: options.foo };\n' +
        '},'
    );

    await outputFile(
      'blueprints/foo/files/app/foos/__name__.js',
      "import Ember from 'ember';\n" + 'export default Ember.Object.extend({ foo: <%= foo %> });\n'
    );

    await ember(['generate', 'foo', 'bar', '-two']);

    expect(file('app/foos/bar.js')).to.contain('export default Ember.Object.extend({ foo: two });');
  });

  it('calls lint fix function', async function () {
    let lintFixStub = td.replace(lintFix, 'run');

    await generate(['blueprint', 'foo', '--lint-fix']);

    td.verify(lintFixStub(), { ignoreExtraArgs: true, times: 1 });
  });

  it('successfully generates a blueprint with a scoped name', async function () {
    await initApp();
    await ember(['g', 'blueprint', '@foo/bar']);
    await outputFile('blueprints/@foo/bar/files/__name__.js', '');
    await ember(['g', '@foo/bar', 'baz']);

    expect(file('baz.js')).to.exist;
  });

  it(`throws the unknown blueprint error when \`name\` matches a folder's name, but doesn't include the \`${path.sep}\` char`, async function () {
    await expect(generate(['tests'])).to.be.rejectedWith('Unknown blueprint: tests');
  });
});
