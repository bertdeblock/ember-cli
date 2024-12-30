'use strict';

const { existsSync, readFile, remove } = require('fs-extra');
const MockProject = require('../../helpers/mock-project');
const MockUI = require('console-ui/mock');
const { expect } = require('chai');
const path = require('path');
const glob = require('glob');
const walkSync = require('walk-sync');

const EOL = require('os').EOL;
let root = process.cwd();
let tempRoot = path.join(root, 'tmp');
const SilentError = require('silent-error');
const mkTmpDirIn = require('../../helpers/mk-tmp-dir-in');
const td = require('testdouble');
const Blueprint = require('../../../lib/models/blueprint');

let localsCalled;
let normalizeEntityNameCalled;
let fileMapTokensCalled;
let filesPathCalled;
let beforeUninstallCalled;
let beforeInstallCalled;
let afterInstallCalled;
let afterUninstallCalled;

function resetCalled() {
  localsCalled = false;
  normalizeEntityNameCalled = false;
  fileMapTokensCalled = false;
  filesPathCalled = false;
  beforeUninstallCalled = false;
  beforeInstallCalled = false;
  afterInstallCalled = false;
  afterUninstallCalled = false;
}

let instrumented = {
  locals(/* opts */) {
    localsCalled = true;
    return this._super.locals.apply(this, arguments);
  },

  normalizeEntityName(/* name */) {
    normalizeEntityNameCalled = true;
    return this._super.normalizeEntityName.apply(this, arguments);
  },

  fileMapTokens() {
    fileMapTokensCalled = true;
    return this._super.fileMapTokens.apply(this, arguments);
  },

  filesPath(/* opts */) {
    filesPathCalled = true;
    return this._super.filesPath.apply(this, arguments);
  },

  beforeInstall(/* opts */) {
    beforeInstallCalled = true;
    return this._super.beforeInstall.apply(this, arguments);
  },

  afterInstall(/* opts */) {
    afterInstallCalled = true;
    return this._super.afterInstall.apply(this, arguments);
  },

  beforeUninstall() {
    beforeUninstallCalled = true;
    return this._super.beforeUninstall.apply(this, arguments);
  },

  afterUninstall() {
    afterUninstallCalled = true;
    return this._super.afterUninstall.apply(this, arguments);
  },
};

let defaultBlueprints = path.resolve(__dirname, '..', '..', '..', 'blueprints');
let fixtureBlueprints = path.resolve(__dirname, '..', '..', 'fixtures', 'blueprints');
let basicBlueprint = path.join(fixtureBlueprints, 'basic');
let basicNewBlueprint = path.join(fixtureBlueprints, 'basic_2');

let basicBlueprintFiles = [
  '.ember-cli',
  '.gitignore',
  'app/',
  'app/basics/',
  'app/basics/mock-project.txt',
  'bar',
  'file-to-remove.txt',
  'foo.txt',
  'test.txt',
];

let basicBlueprintFilesAfterBasic2 = [
  '.ember-cli',
  '.gitignore',
  'app/',
  'app/basics/',
  'app/basics/mock-project.txt',
  'bar',
  'foo.txt',
  'test.txt',
];

describe('Blueprint', function () {
  const BasicBlueprintClass = require(basicBlueprint);
  let InstrumentedBasicBlueprint = BasicBlueprintClass.extend(instrumented);

  beforeEach(function () {
    resetCalled();
  });

  afterEach(function () {
    td.reset();
  });

  describe('.fileMapTokens', function () {
    it('adds additional tokens from fileMapTokens hook', function () {
      let blueprint = Blueprint.lookup(basicBlueprint);
      blueprint.fileMapTokens = function () {
        return {
          __foo__() {
            return 'foo';
          },
        };
      };
      let tokens = blueprint._fileMapTokens();
      expect(tokens.__foo__()).to.equal('foo');
    });
  });

  describe('.generateFileMap', function () {
    it('should not have locals in the fileMap', function () {
      let blueprint = Blueprint.lookup(basicBlueprint);

      let fileMapVariables = {
        pod: true,
        podPath: 'pods',
        isAddon: false,
        blueprintName: 'test',
        dasherizedModuleName: 'foo-baz',
        locals: { SOME_LOCAL_ARG: 'ARGH' },
      };

      let fileMap = blueprint.generateFileMap(fileMapVariables);
      let expected = {
        __name__: 'foo-baz',
        __path__: 'tests',
        __root__: 'app',
        __test__: 'foo-baz-test',
      };

      expect(fileMap).to.deep.equal(expected);
    });
  });

  describe('.lookup', function () {
    it('uses an explicit path if one is given', function () {
      const expectedClass = require(basicBlueprint);
      let blueprint = Blueprint.lookup(basicBlueprint);

      expect(blueprint.name).to.equal('basic');
      expect(blueprint.path).to.equal(basicBlueprint);
      expect(blueprint instanceof expectedClass).to.equal(true);
    });

    it('finds blueprints within given lookup paths', function () {
      const expectedClass = require(basicBlueprint);
      let blueprint = Blueprint.lookup('basic', {
        paths: [fixtureBlueprints],
      });

      expect(blueprint.name).to.equal('basic');
      expect(blueprint.path).to.equal(basicBlueprint);
      expect(blueprint instanceof expectedClass).to.equal(true);
    });

    it('finds blueprints in the ember-cli package', function () {
      let expectedPath = path.resolve(defaultBlueprints, 'app');
      let expectedClass = Blueprint;

      let blueprint = Blueprint.lookup('app');

      expect(blueprint.name).to.equal('app');
      expect(blueprint.path).to.equal(expectedPath);
      expect(blueprint instanceof expectedClass).to.equal(true);
    });

    it('can instantiate a blueprint that exports an object instead of a constructor', function () {
      let blueprint = Blueprint.lookup('exporting-object', {
        paths: [fixtureBlueprints],
      });

      expect(blueprint.woot).to.equal('someValueHere');
      expect(blueprint instanceof Blueprint).to.equal(true);
    });

    it('throws an error if no blueprint is found', function () {
      expect(() => {
        Blueprint.lookup('foo');
      }).to.throw('Unknown blueprint: foo');
    });

    it('returns undefined if no blueprint is found and ignoredMissing is passed', function () {
      let blueprint = Blueprint.lookup('foo', {
        ignoreMissing: true,
      });

      expect(blueprint).to.equal(undefined);
    });
  });

  it('exists', function () {
    let blueprint = new Blueprint(basicBlueprint);
    expect(!!blueprint).to.equal(true);
  });

  it('derives name from path', function () {
    let blueprint = new Blueprint(basicBlueprint);
    expect(blueprint.name).to.equal('basic');
  });

  describe('filesPath', function () {
    it('returns the blueprints default files path', function () {
      let blueprint = new Blueprint(basicBlueprint);

      expect(blueprint.filesPath()).to.equal(path.join(basicBlueprint, 'files'));
    });
  });

  describe('basic blueprint installation', function () {
    let blueprint;
    let ui;
    let project;
    let options;
    let tmpdir;

    beforeEach(async function () {
      const dir = await mkTmpDirIn(tempRoot);
      tmpdir = dir;
      blueprint = new InstrumentedBasicBlueprint(basicBlueprint);
      ui = new MockUI();
      td.replace(ui, 'prompt');

      project = new MockProject();
      options = {
        ui,
        project,
        target: tmpdir,
      };
    });

    afterEach(async function () {
      await remove(tempRoot);
    });

    it('installs basic files', async function () {
      expect(!!blueprint).to.equal(true);

      await blueprint.install(options);

      let actualFiles = walkSync(tmpdir).sort();
      let output = ui.output.trim().split(EOL);

      expect(output.shift()).to.match(/^installing/);
      expect(output.shift()).to.match(/create.* .ember-cli/);
      expect(output.shift()).to.match(/create.* .gitignore/);
      expect(output.shift()).to.match(/create.* app[/\\]basics[/\\]mock-project.txt/);
      expect(output.shift()).to.match(/create.* bar/);
      expect(output.shift()).to.match(/create.* file-to-remove.txt/);
      expect(output.shift()).to.match(/create.* foo.txt/);
      expect(output.shift()).to.match(/create.* test.txt/);
      expect(output.length).to.equal(0);
      expect(actualFiles).to.deep.equal(basicBlueprintFiles);
      expect(() => {
        readFile(path.join(tmpdir, 'test.txt'), 'utf-8', function (err, content) {
          if (err) {
            throw 'error';
          }
          expect(content).to.match(/I AM TESTY/);
        });
      }).not.to.throw();
    });

    it('re-installing identical files', async function () {
      await blueprint.install(options);

      let output = ui.output.trim().split(EOL);
      ui.output = '';

      expect(output.shift()).to.match(/^installing/);
      expect(output.shift()).to.match(/create.* .ember-cli/);
      expect(output.shift()).to.match(/create.* .gitignore/);
      expect(output.shift()).to.match(/create.* app[/\\]basics[/\\]mock-project.txt/);
      expect(output.shift()).to.match(/create.* bar/);
      expect(output.shift()).to.match(/create.* file-to-remove.txt/);
      expect(output.shift()).to.match(/create.* foo.txt/);
      expect(output.shift()).to.match(/create.* test.txt/);
      expect(output.length).to.equal(0);

      await blueprint.install(options);

      let actualFiles = walkSync(tmpdir).sort();
      output = ui.output.trim().split(EOL);

      expect(output.shift()).to.match(/^installing/);
      expect(output.shift()).to.match(/identical.* .ember-cli/);
      expect(output.shift()).to.match(/identical.* .gitignore/);
      expect(output.shift()).to.match(/identical.* app[/\\]basics[/\\]mock-project.txt/);
      expect(output.shift()).to.match(/identical.* bar/);
      expect(output.shift()).to.match(/identical.* file-to-remove.txt/);
      expect(output.shift()).to.match(/identical.* foo.txt/);
      expect(output.shift()).to.match(/identical.* test.txt/);
      expect(output.length).to.equal(0);

      expect(actualFiles).to.deep.equal(basicBlueprintFiles);
    });

    it('re-installing conflicting files', async function () {
      td.when(ui.prompt(td.matchers.anything())).thenReturn(
        Promise.resolve({ answer: 'skip' }),
        Promise.resolve({ answer: 'overwrite' })
      );

      await blueprint.install(options);

      let output = ui.output.trim().split(EOL);
      ui.output = '';

      expect(output.shift()).to.match(/^installing/);
      expect(output.shift()).to.match(/create.* .ember-cli/);
      expect(output.shift()).to.match(/create.* .gitignore/);
      expect(output.shift()).to.match(/create.* app[/\\]basics[/\\]mock-project.txt/);
      expect(output.shift()).to.match(/create.* bar/);
      expect(output.shift()).to.match(/create.* file-to-remove.txt/);
      expect(output.shift()).to.match(/create.* foo.txt/);
      expect(output.shift()).to.match(/create.* test.txt/);
      expect(output.length).to.equal(0);

      let blueprintNew = Blueprint.lookup(basicNewBlueprint);

      await blueprintNew.install(options);

      td.verify(ui.prompt(td.matchers.anything()), { times: 2 });

      let actualFiles = walkSync(tmpdir).sort();
      // Prompts contain \n EOL
      // Split output on \n since it will have the same affect as spliting on OS specific EOL
      output = ui.output.trim().split('\n');
      expect(output.shift()).to.match(/^installing/);
      expect(output.shift()).to.match(/identical.* \.ember-cli/);
      expect(output.shift()).to.match(/identical.* \.gitignore/);
      expect(output.shift()).to.match(/skip.* foo.txt/);
      expect(output.shift()).to.match(/overwrite.* test.txt/);
      expect(output.shift()).to.match(/remove.* file-to-remove.txt/);
      expect(output.length).to.equal(0);

      expect(actualFiles).to.deep.equal(basicBlueprintFilesAfterBasic2);
    });

    it('installs path globPattern file', async function () {
      options.targetFiles = ['foo.txt'];
      await blueprint.install(options);
      let actualFiles = walkSync(tmpdir).sort();
      let globFiles = glob
        .sync('**/foo.txt', {
          cwd: tmpdir,
          dot: true,
          mark: true,
          strict: true,
        })
        .sort();
      let output = ui.output.trim().split(EOL);

      expect(output.shift()).to.match(/^installing/);
      expect(output.shift()).to.match(/create.* foo.txt/);
      expect(output.length).to.equal(0);

      expect(actualFiles).to.deep.equal(globFiles);
    });

    it('installs multiple globPattern files', async function () {
      options.targetFiles = ['foo.txt', 'test.txt'];
      await blueprint.install(options);
      let actualFiles = walkSync(tmpdir).sort();
      let globFiles = glob
        .sync('**/*.txt', {
          cwd: tmpdir,
          dot: true,
          mark: true,
          strict: true,
        })
        .sort();
      let output = ui.output.trim().split(EOL);

      expect(output.shift()).to.match(/^installing/);
      expect(output.shift()).to.match(/create.* foo.txt/);
      expect(output.shift()).to.match(/create.* test.txt/);
      expect(output.length).to.equal(0);

      expect(actualFiles).to.deep.equal(globFiles);
    });

    describe('called on an existing project', function () {
      beforeEach(function () {
        Blueprint.ignoredUpdateFiles.push('foo.txt');
      });

      it('ignores files in ignoredUpdateFiles', async function () {
        td.when(ui.prompt(), { ignoreExtraArgs: true }).thenReturn(Promise.resolve({ answer: 'skip' }));
        await blueprint.install(options);

        let output = ui.output.trim().split(EOL);
        ui.output = '';

        expect(output.shift()).to.match(/^installing/);
        expect(output.shift()).to.match(/create.* .ember-cli/);
        expect(output.shift()).to.match(/create.* .gitignore/);
        expect(output.shift()).to.match(/create.* app[/\\]basics[/\\]mock-project.txt/);
        expect(output.shift()).to.match(/create.* bar/);
        expect(output.shift()).to.match(/create.* file-to-remove.txt/);
        expect(output.shift()).to.match(/create.* foo.txt/);
        expect(output.shift()).to.match(/create.* test.txt/);
        expect(output.length).to.equal(0);

        let blueprintNew = new Blueprint(basicNewBlueprint);

        options.project.isEmberCLIProject = function () {
          return true;
        };

        await blueprintNew.install(options);

        let actualFiles = walkSync(tmpdir).sort();
        // Prompts contain \n EOL
        // Split output on \n since it will have the same affect as spliting on OS specific EOL
        output = ui.output.trim().split('\n');
        expect(output.shift()).to.match(/^installing/);
        expect(output.shift()).to.match(/identical.* \.ember-cli/);
        expect(output.shift()).to.match(/identical.* \.gitignore/);
        expect(output.shift()).to.match(/skip.* test.txt/);
        expect(output.length).to.equal(0);

        expect(actualFiles).to.deep.equal(basicBlueprintFiles);
      });
    });

    describe('called on a new project', function () {
      beforeEach(function () {
        Blueprint.ignoredUpdateFiles.push('foo.txt');
      });

      it('does not ignores files in ignoredUpdateFiles', async function () {
        td.when(ui.prompt(), { ignoreExtraArgs: true }).thenReturn(Promise.resolve({ answer: 'skip' }));
        await blueprint.install(options);

        let output = ui.output.trim().split(EOL);
        ui.output = '';

        expect(output.shift()).to.match(/^installing/);
        expect(output.shift()).to.match(/create.* .ember-cli/);
        expect(output.shift()).to.match(/create.* .gitignore/);
        expect(output.shift()).to.match(/create.* app[/\\]basics[/\\]mock-project.txt/);
        expect(output.shift()).to.match(/create.* bar/);
        expect(output.shift()).to.match(/create.* file-to-remove.txt/);
        expect(output.shift()).to.match(/create.* foo.txt/);
        expect(output.shift()).to.match(/create.* test.txt/);
        expect(output.length).to.equal(0);

        let blueprintNew = new Blueprint(basicNewBlueprint);

        options.project.isEmberCLIProject = function () {
          return false;
        };

        await blueprintNew.install(options);

        let actualFiles = walkSync(tmpdir).sort();
        // Prompts contain \n EOL
        // Split output on \n since it will have the same affect as spliting on OS specific EOL
        output = ui.output.trim().split('\n');
        expect(output.shift()).to.match(/^installing/);
        expect(output.shift()).to.match(/identical.* \.ember-cli/);
        expect(output.shift()).to.match(/identical.* \.gitignore/);
        expect(output.shift()).to.match(/skip.* foo.txt/);
        expect(output.shift()).to.match(/skip.* test.txt/);
        expect(output.length).to.equal(0);

        expect(actualFiles).to.deep.equal(basicBlueprintFiles);
      });
    });

    it('throws error when there is a trailing forward slash in entityName', async function () {
      try {
        options.entity = { name: 'foo/' };
        await blueprint.install(options);
        expect.fail('expected rejection');
      } catch (e) {
        expect(e.message).to.match(
          /You specified "foo\/", but you can't use a trailing slash as an entity name with generators. Please re-run the command with "foo"./
        );
      }

      try {
        options.entity = { name: 'foo\\' };
        await blueprint.install(options);
        expect.fail('expected rejection');
      } catch (e) {
        expect(e.message).to.match(
          /You specified "foo\\", but you can't use a trailing slash as an entity name with generators. Please re-run the command with "foo"./
        );
      }

      options.entity = { name: 'foo' };
      await blueprint.install(options);
    });

    it('throws error when an entityName is not provided', async function () {
      try {
        options.entity = {};
        await blueprint.install(options);
        expect.fail('expected rejection)');
      } catch (e) {
        expect(e).to.be.instanceof(SilentError);
        expect(e.message).to.match(
          /The `ember generate <entity-name>` command requires an entity name to be specified./
        );
      }
    });

    it('throws error when an action does not exist', async function () {
      blueprint._actions = {};
      try {
        await blueprint.install(options);
        expect.fail('expected rejection');
      } catch (e) {
        expect(e.message).to.equal('Tried to call action "write" but it does not exist');
      }
    });

    it('calls normalizeEntityName hook during install', async function () {
      const wait = new Promise((resolve) => {
        blueprint.normalizeEntityName = function () {
          resolve();
        };
      });
      options.entity = { name: 'foo' };
      await blueprint.install(options);
      await wait;
    });

    it('normalizeEntityName hook can modify the entity name', async function () {
      blueprint.normalizeEntityName = function () {
        return 'foo';
      };
      options.entity = { name: 'bar' };

      await blueprint.install(options);
      let actualFiles = walkSync(tmpdir).sort();

      expect(actualFiles).to.contain('app/basics/foo.txt');
      expect(actualFiles).to.not.contain('app/basics/mock-project.txt');
    });

    it('calls normalizeEntityName before locals hook is called', async function () {
      blueprint.normalizeEntityName = function () {
        return 'foo';
      };
      let done;
      const waitForLocals = new Promise((resolve) => (done = resolve));
      blueprint.locals = function (options) {
        expect(options.entity.name).to.equal('foo');
        done();
      };
      options.entity = { name: 'bar' };
      await blueprint.install(options);
      await waitForLocals;
    });

    it('calls appropriate hooks with correct arguments', async function () {
      options.entity = { name: 'foo' };

      await blueprint.install(options);
      expect(localsCalled).to.be.true;
      expect(normalizeEntityNameCalled).to.be.true;
      expect(fileMapTokensCalled).to.be.true;
      expect(filesPathCalled).to.be.true;
      expect(beforeInstallCalled).to.be.true;
      expect(afterInstallCalled).to.be.true;
      expect(beforeUninstallCalled).to.be.false;
      expect(afterUninstallCalled).to.be.false;
    });

    it("doesn't throw when running uninstall without installing first", function () {
      return blueprint.uninstall(options);
    });
  });

  describe('basic blueprint uninstallation', function () {
    const BasicBlueprintClass = require(basicBlueprint);
    let blueprint;
    let ui;
    let project;
    let options;
    let tmpdir;

    function refreshUI() {
      ui = new MockUI();
      options.ui = ui;
    }

    beforeEach(async function () {
      let dir = await mkTmpDirIn(tempRoot);

      tmpdir = dir;
      blueprint = new BasicBlueprintClass(basicBlueprint);
      project = new MockProject();
      options = {
        project,
        target: tmpdir,
      };
      refreshUI();

      await blueprint.install(options);
      refreshUI();
    });

    afterEach(async function () {
      await remove(tempRoot);
    });

    it('uninstalls basic files', async function () {
      expect(!!blueprint).to.equal(true);

      await blueprint.uninstall(options);
      let actualFiles = walkSync(tmpdir);
      let output = ui.output.trim().split(EOL);

      expect(output.shift()).to.match(/^uninstalling/);
      expect(output.shift()).to.match(/remove.* .ember-cli/);
      expect(output.shift()).to.match(/remove.* .gitignore/);
      expect(output.shift()).to.match(/remove.* app[/\\]basics[/\\]mock-project.txt/);
      expect(output.shift()).to.match(/remove.* bar/);
      expect(output.shift()).to.match(/remove.* file-to-remove.txt/);
      expect(output.shift()).to.match(/remove.* foo.txt/);
      expect(output.shift()).to.match(/remove.* test.txt/);
      expect(output.length).to.equal(0);

      expect(actualFiles.length).to.equal(0);

      expect(existsSync(path.join(tmpdir, 'test.txt'))).to.be.false;
    });

    it("uninstall doesn't remove non-empty folders", async function () {
      options.entity = { name: 'foo' };

      await blueprint.install(options);
      let actualFiles = walkSync(tmpdir);

      expect(actualFiles).to.contain('app/basics/foo.txt');
      expect(actualFiles).to.contain('app/basics/mock-project.txt');

      await blueprint.uninstall(options);
      actualFiles = walkSync(tmpdir);

      expect(actualFiles).to.not.contain('app/basics/foo.txt');
      expect(actualFiles).to.contain('app/basics/mock-project.txt');
    });

    it("uninstall doesn't log remove messages when file does not exist", async function () {
      options.entity = { name: 'does-not-exist' };

      await blueprint.uninstall(options);
      let output = ui.output.trim().split(EOL);
      expect(output.shift()).to.match(/^uninstalling/);
      expect(output.shift()).to.match(/remove.* .ember-cli/);
      expect(output.shift()).to.match(/remove.* .gitignore/);
      expect(output.shift()).to.not.match(/remove.* app[/\\]basics[/\\]does-not-exist.txt/);
    });
  });

  describe('instrumented blueprint uninstallation', function () {
    let blueprint;
    let ui;
    let project;
    let options;
    let tmpdir;

    function refreshUI() {
      ui = new MockUI();
      options.ui = ui;
    }

    beforeEach(async function () {
      let dir = await mkTmpDirIn(tempRoot);
      tmpdir = dir;
      blueprint = new InstrumentedBasicBlueprint(basicBlueprint);
      project = new MockProject();
      options = {
        project,
        target: tmpdir,
      };
      refreshUI();
      await blueprint.install(options);
      resetCalled();
      refreshUI();
    });

    it('calls appropriate hooks with correct arguments', async function () {
      options.entity = { name: 'foo' };

      await blueprint.uninstall(options);
      expect(localsCalled).to.be.true;
      expect(normalizeEntityNameCalled).to.be.true;
      expect(fileMapTokensCalled).to.be.true;
      expect(filesPathCalled).to.be.true;
      expect(beforeUninstallCalled).to.be.true;
      expect(afterUninstallCalled).to.be.true;

      expect(beforeInstallCalled).to.be.false;
      expect(afterInstallCalled).to.be.false;
    });
  });

  describe('load', function () {
    it('loads and returns a blueprint object', function () {
      let blueprint = Blueprint.load(basicBlueprint);
      expect(blueprint).to.be.an('object');
      expect(blueprint.name).to.equal('basic');
    });

    it('loads only blueprints with an index.js', function () {
      expect(Blueprint.load(path.join(fixtureBlueprints, '.notablueprint'))).to.not.exist;
    });
  });

  describe('lookupBlueprint', function () {
    let blueprint;
    let tmpdir;
    let project;

    beforeEach(async function () {
      let dir = await mkTmpDirIn(tempRoot);
      tmpdir = dir;
      blueprint = new Blueprint(basicBlueprint);
      project = new MockProject();
      // normally provided by `install`, but mocked here for testing
      project.root = tmpdir;
      blueprint.project = project;
      project.blueprintLookupPaths = function () {
        return [fixtureBlueprints];
      };
    });

    afterEach(async function () {
      await remove(tempRoot);
    });

    it('can lookup other Blueprints from the project blueprintLookupPaths', function () {
      let result = blueprint.lookupBlueprint('basic_2');

      expect(result.description).to.equal('Another basic blueprint');
    });

    it('can find internal blueprints', function () {
      let result = blueprint.lookupBlueprint('blueprint');

      expect(result.description).to.equal('Generates a blueprint and definition.');
    });
  });

  describe('._generateFileMapVariables', function () {
    let blueprint;
    let project;
    let moduleName;
    let locals;
    let options;
    let result;
    let expectation;

    beforeEach(function () {
      blueprint = new Blueprint(basicBlueprint);
      project = new MockProject();
      moduleName = project.name();
      locals = {};

      blueprint.project = project;

      options = {
        project,
      };

      expectation = {
        blueprintName: 'basic',
        dasherizedModuleName: 'mock-project',
        hasPathToken: undefined,
        inAddon: false,
        in: undefined,
        inDummy: false,
        inRepoAddon: undefined,
        locals: {},
        originBlueprintName: 'basic',
        pod: undefined,
        podPath: '',
      };
    });

    it('should create the correct default fileMapVariables', function () {
      result = blueprint._generateFileMapVariables(moduleName, locals, options);

      expect(result).to.eql(expectation);
    });

    it('should use the moduleName method argument for moduleName', function () {
      moduleName = 'foo';
      expectation.dasherizedModuleName = 'foo';

      result = blueprint._generateFileMapVariables(moduleName, locals, options);

      expect(result).to.eql(expectation);
    });

    it('should use the locals method argument for its locals value', function () {
      locals = { foo: 'bar' };
      expectation.locals = locals;

      result = blueprint._generateFileMapVariables(moduleName, locals, options);

      expect(result).to.eql(expectation);
    });

    it('should use the option.originBlueprintName value as its originBlueprintName if included in the options hash', function () {
      options.originBlueprintName = 'foo';
      expectation.originBlueprintName = 'foo';

      result = blueprint._generateFileMapVariables(moduleName, locals, options);

      expect(result).to.eql(expectation);
    });

    it("should include a podPath if the project's podModulePrefix is defined", function () {
      blueprint.project.config = function () {
        return {
          podModulePrefix: 'foo/bar',
        };
      };

      expectation.podPath = 'bar';

      result = blueprint._generateFileMapVariables(moduleName, locals, options);

      expect(result).to.eql(expectation);
    });

    it('should include an inAddon and inDummy flag of true if the project is an addon', function () {
      options.dummy = true;

      blueprint.project.isEmberCLIAddon = function () {
        return true;
      };

      expectation.inAddon = true;
      expectation.inDummy = true;

      result = blueprint._generateFileMapVariables(moduleName, locals, options);

      expect(result).to.eql(expectation);
    });

    it('should include an inAddon and inRepoAddon flag of true if options.inRepoAddon is true', function () {
      options.inRepoAddon = true;

      expectation.inRepoAddon = true;
      expectation.inAddon = true;

      result = blueprint._generateFileMapVariables(moduleName, locals, options);

      expect(result).to.eql(expectation);
    });

    it('should include an in flag of true if options.in is true', function () {
      options.in = true;

      expectation.in = true;

      result = blueprint._generateFileMapVariables(moduleName, locals, options);

      expect(result).to.eql(expectation);
    });

    it('should have a hasPathToken flag of true if the blueprint hasPathToken is true', function () {
      blueprint.hasPathToken = true;

      expectation.hasPathToken = true;

      result = blueprint._generateFileMapVariables(moduleName, locals, options);

      expect(result).to.eql(expectation);
    });
  });

  describe('._locals', function () {
    let blueprint;
    let project;
    let options;
    let result;
    let expectation;

    beforeEach(function () {
      blueprint = new Blueprint(basicBlueprint);
      project = new MockProject();

      blueprint._generateFileMapVariables = function () {
        return {};
      };

      blueprint.generateFileMap = function () {
        return {};
      };

      options = {
        project,
      };

      expectation = {
        camelizedModuleName: 'mockProject',
        classifiedModuleName: 'MockProject',
        classifiedPackageName: 'MockProject',
        dasherizedModuleName: 'mock-project',
        dasherizedPackageName: 'mock-project',
        decamelizedModuleName: 'mock-project',
        fileMap: {},
      };
    });

    it('should return a default object if no custom options are passed', async function () {
      result = await blueprint._locals(options);

      expect(result).to.deep.include(expectation);
    });

    it('it should call the locals method with the correct arguments', function () {
      blueprint.locals = function (opts) {
        expect(opts).to.equal(options);
      };

      blueprint._locals(options);
    });

    it('should call _generateFileMapVariables with the correct arguments', function () {
      blueprint.locals = function () {
        return { foo: 'bar' };
      };

      blueprint._generateFileMapVariables = function (modName, lcls, opts) {
        expect(modName).to.equal('mock-project');
        expect(lcls).to.eql({ foo: 'bar' });
        expect(opts).to.eql(opts);
      };

      blueprint._locals(options);
    });

    it('should call generateFileMap with the correct arguments', function () {
      blueprint._generateFileMapVariables = function () {
        return { bar: 'baz' };
      };

      blueprint.generateFileMap = function (fileMapVariables) {
        expect(fileMapVariables).to.eql({ bar: 'baz' });
      };

      blueprint._locals(options);
    });

    it('should use the options.entity.name as its moduleName if its value is defined', async function () {
      options.entity = {
        name: 'foo',
      };

      expectation.camelizedModuleName = 'foo';
      expectation.classifiedModuleName = 'Foo';
      expectation.dasherizedModuleName = 'foo';
      expectation.decamelizedModuleName = 'foo';

      result = await blueprint._locals(options);

      expect(result).to.deep.include(expectation);
    });

    it('should update its fileMap values to match the generateFileMap result', async function () {
      blueprint.generateFileMap = function () {
        return { foo: 'bar' };
      };

      expectation.fileMap = { foo: 'bar' };

      result = await blueprint._locals(options);

      expect(result).to.deep.include(expectation);
    });

    it('should return an object containing custom local values', async function () {
      blueprint.locals = function () {
        return { foo: 'bar' };
      };

      expectation.foo = 'bar';

      result = await blueprint._locals(options);

      expect(result).to.deep.include(expectation);
    });
  });
});
