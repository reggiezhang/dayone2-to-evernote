#!/usr/bin/env node
/*
 * dayone-to-evernote.js
 * Copyright (C) 2017 Reggie Zhang <reggy.zhang@gmail.com>
 * Licensed under the terms of The GNU Lesser General Public License (LGPLv3):
 * http://www.opensource.org/licenses/lgpl-3.0.html
 *
 */
'use-strict';
require('dotenv').config();
function getEntriesPath(doPath) {
  return `${doPath}/entries/`;
}

function getPhotosPath(doPath) {
  return `${doPath}/photos/`;
}

function getSyncMetaDirPath(doPath) {
  return `${doPath}/.dayone-to-evernote/`;
}

function getSyncMetaFilePath(doPath, filename) {
  const syncMetaDirPath = getSyncMetaDirPath(doPath);
  return `${syncMetaDirPath}/.${filename}.json`;
}

function initProgressBar(totalLength, notebookName, counter) {
  let ProgressBar = require('progress');
  console.log();
  return new ProgressBar(':percent|:bar|  :current/:total  elapsed: :elapseds  eta: :etas', {
    complete: '█',
    incomplete: ' ',
    width: 20,
    total: totalLength,
    renderThrottle: 0,
    clear: false,
    callback: function importCompleted() {  // Method which will display type of Animal
      if (counter.created > 0) {
        console.log(`${counter.created} note(s) created in [${notebookName}], ${counter.updated} note(s) updated.`);
      } else {
        console.log(`${counter.created} note(s) created, ${counter.updated} note(s) updated.`);
      }
    },
  });
}

function getNoteDate(itemPath) {
  return new Promise((resolve, reject) => {
    require('fs').readFile(itemPath, 'utf8', (error, file) => {
      if (error) {
        reject(error);
      } else {
        let obj = require('plist').parse(file, 'utf8');
        resolve(new Date(obj['Creation Date']));
      }
    });
  });
}

function getNoteFiles(doPath) {
  let entriesPath = getEntriesPath(doPath);
  console.log(entriesPath);
  return new Promise((resolve, reject) => {
    require('fs').readdir(entriesPath, (error, files) => {
      if (error) {
        reject(error);
      } else {
        resolve(files);
      }
    });
  });
}

function assemblePhotoPath(doPath, doNote) {
  return new Promise((resolve, reject) => {
    let photoPath = `${getPhotosPath(doPath)}${doNote['UUID']}.jpg`;
    require('fs').exists(photoPath, exists => {
      if (exists) {
        doNote['Photo Path'] = photoPath;
      }
      resolve(doNote);
    });
  });
}

function getDoNote(doPath, filename) {
  const fs = require('fs');
  const plist = require('plist');
  return new Promise((resolve, reject) => {
    fs.readFile(`${getEntriesPath(doPath)}/${filename}`, 'utf8', (error, data) => {
      if (error) {
        reject(error);
      } else {
        let doNote = plist.parse(data);
        if (doNote['Tags'] == undefined) doNote['Tags'] = [];
        doNote['Tags'][doNote['Tags'].length] = 'dayone';
        resolve(doNote);
      }
    });
  });
}

function syncNotes(files, doPath, bar) {
  files.forEach(item => {
    getDoNote(doPath, item).then(doNote => {
      return assemblePhotoPath(doPath, doNote);
    }).then(doNote => {

    }).catch(e => {
      console.log(e);
    });
  });
}

function getNoteFilesAfterDate(doPath, files, afterDate) {
  let filesAfterDate = [];
  let total = files.length;
  return new Promise((resolve, reject) => {
    files.forEach((item, idx) => {
      getNoteDate(`${getEntriesPath(doPath)}/${item}`).then(noteDate => {
        if (noteDate > afterDate) {
          filesAfterDate.push(item);
        }
        if (idx + 1 === total) {
          resolve(filesAfterDate);
        }
      }).catch(e => {
        console.log(e);
        reject(e);
      });
    });
  });
}

function main(argv) {
  const evernote = require('evernote-jxa');
  let program = require('commander');
  require('pkginfo')(module, 'version');
  program
    .version(module.exports.version)
    .option('-a, --after <date>', 'date with ISO8601 format. e.g. 2016-05-10T03:08:07+08:00', Date.parse)
    .option('-n, --notebook <notebook>', 'Target Notebook Name, a local notebook will be created if not specified.')
    .option('-r, --reset', 'reset sync state, fully sync will be performed.')
    .arguments('<Journal_dayone_dir>')
    .parse(argv);
  if (!program.args.length
    || program.after !== undefined && isNaN(program.after)) program.help();

  let notebookName = program.notebook;
  if (!notebookName) notebookName = `Dayone: ${new Date().toDateString()}`;
  // let doPath = program.args[0];
  let doPath = '/Users/i070159/Library/Mobile Documents/5U8NS4GX82~com~dayoneapp~dayone/Documents/Journal_dayone';
  getNoteFiles(doPath).then(files => {
    return getNoteFilesAfterDate(doPath, files, new Date('2017-05-10T03:08:07+08:00'));
  }).then(files => {
    const counter = { 'created': 0, 'updated': 0 };
    let bar = initProgressBar(files.length, notebookName, counter);
  }).catch(e => {
    console.log(e);
  });
}

if (typeof require != 'undefined' && require.main == module) {
  main(process.argv);
}
