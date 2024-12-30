'use strict';

const Command = require('../models/command');
const { isPnpmProject, isYarnProject } = require('../utilities/package-managers');

module.exports = Command.extend({
  name: 'install',
  aliases: ['i'],
  works: 'insideProject',
  skipHelp: true,

  async run(_, addonNames) {
    let addCommand = 'npm install -D';

    if (await isPnpmProject(this.project.root)) {
      addCommand = 'pnpm add -D';
    } else if (await isYarnProject(this.project.root)) {
      addCommand = 'yarn add -D';
    }

    throw new Error(
      `The \`install\` command is no longer supported. Please run \`${addCommand} ${addonNames.join(' ')}\` instead.`
    );
  },
});
