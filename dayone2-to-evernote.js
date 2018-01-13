#!/usr/bin/env node
/*
 * dayone-to-evernote.js
 * Copyright (C) 2017 Reggie Zhang <reggy.zhang@gmail.com>
 * Licensed under the terms of The GNU Lesser General Public License (LGPLv3):
 * http://www.opensource.org/licenses/lgpl-3.0.html
 *
 */
'use-strict';

function composePhotosPath(doPath) {
  return `${doPath}/photos/`;
}

function composeSyncLogDirPath(doPath) {
  return `${doPath}/.dayone2-to-evernote/`;
}

function composeSyncLogPath(doPath, filename) {
  const syncLogDirPath = composeSyncLogDirPath(doPath);
  return `${syncLogDirPath}/.${filename}.json`;
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

function loadSyncLog(doPath, filename) {
  let syncLog = null;
  const fs = require('fs');
  const syncLogDirPath = composeSyncLogDirPath(doPath);
  if (!fs.existsSync(syncLogDirPath)) fs.mkdirSync(syncLogDirPath);
  const syncLogFilePath = composeSyncLogPath(doPath, filename);
  if (!fs.existsSync(syncLogFilePath)) return syncLog;
  syncLog = JSON.parse(fs.readFileSync(syncLogFilePath, 'utf8'));
  return syncLog;
}

function prepareEvernotePrarmsFile(doPath, doNote, notebookName) {
  let params = {};
  params.withText = doNote['text'].replace(/!\[\].*\)\n\n/g, '').replace(/!\[\].*\)/g, ''); // remove placeholder for images
  params.title = getNoteTitle(params.withText);
  params.notebook = notebookName;
  if (doNote['tags'] == undefined) doNote['tags'] = [];
  doNote['tags'][doNote['tags'].length] = 'dayone';
  params.tags = doNote['tags'];
  params.created = new Date(doNote['creationDate']);
  if (doNote.location) {
    params.latitude = doNote.location.latitude;
    params.longitude = doNote.location.longitude;
  }
  params.attachments = [];
  if (doNote['photos']) {
    doNote['photos'].forEach(item => { // eslint-disable-line
      let photoPath = `${composePhotosPath(doPath)}${item.md5}.${item.type}`;
      params.attachments.push(photoPath);
    });
  }

  const uuidV4 = require('uuid/v4');
  const fs = require('fs');
  const os = require('os');
  let paramsFilePath = `${os.tmpdir()}/${uuidV4()}.json`;
  fs.writeFileSync(paramsFilePath, JSON.stringify(params));
  return paramsFilePath;
}

function getNoteTitle(noteText) {
  return noteText ? noteText.split('\n')[0] : '';
}

function loadEntries(doPath, afterDate) {
  let entries = loadEntriesFromJournalJson(doPath);
  if (afterDate === undefined) return entries;
  let filteredEntries = entries.filter(function compareNoteDate(item) {
    let noteDate = new Date(item['creationDate']);
    return noteDate > afterDate;
  });
  return filteredEntries;
}

function prepareSyncLog(doPath, doEntry) { // return syncLog if should sync, otherwise return null
  const evernote = require('evernote-jxa');
  const hash = require('object-hash');
  let doNote = doEntry; // loadDoNote(doPath, filename);
  let latestEntryMd5 = hash(JSON.stringify(doNote));// md5ForEntry(doPath, filename);
  let syncLog = loadSyncLog(doPath, doNote['uuid']);
  if (!syncLog) {
    syncLog = { 'path': composeSyncLogPath(doPath, doNote['uuid']), 'uuid': doNote['uuid'], 'entry-md5': latestEntryMd5, doNote };
    return syncLog;
  } else {
    syncLog.doNote = doNote;
    if (latestEntryMd5 !== syncLog['entry-md5']
      || syncLog.noteId === undefined || !evernote.findNote(syncLog.noteId.trim())) {
      syncLog['entry-md5'] = latestEntryMd5;
      if (syncLog.noteId !== undefined) {
        const nbName = evernote.deleteNote(syncLog.noteId.trim());
        if (nbName) syncLog.notebook = nbName;
      }
      return syncLog;
    }
    return null;
  }
}
function saveSyncLog(doPath, syncLog) {
  const fs = require('fs');
  syncLog.date = new Date();
  delete syncLog['doNote'];
  delete syncLog['notebook'];
  const fd = fs.openSync(syncLog.path, 'w');
  fs.writeSync(fd, JSON.stringify(syncLog, null, '    '));
  fs.closeSync(fd);
}
function resetSyncState(reset, doPath) {
  if (!reset) return;
  require('fs-extra').emptyDirSync(composeSyncLogDirPath(doPath));
}
function loadEntriesFromJournalJson(doPath) {
  const fs = require('fs');
  const hash = require('object-hash');
  // load dayone2 JSON file
  let journalJson = JSON.parse(fs.readFileSync(`${doPath}/Journal.json`, 'utf8'));
  if (journalJson['metadata']['version'] !== '1.0') {
    console.log('Cannot process Journal metadata other than 1.0');
    return null;
  }
  return journalJson.entries;
}
function main(argv) {
  const evernote = require('evernote-jxa');
  let program = require('commander');
  require('pkginfo')(module, 'version');
  program
    .version(module.exports.version)
    .option('-n, --notebook <notebook>', 'Target Notebook Name, a local notebook will be created if not specified.')
    .option('-a, --after <date>', 'date with ISO8601 format. e.g. 2016-05-10T03:08:07+08:00', Date.parse)
    .option('-r, --reset', 'reset sync state, fully sync will be performed.')
    .arguments('<Journal_dayone2_dir>')
    .parse(argv);
  if (!program.args.length
    || program.after !== undefined && isNaN(program.after)) program.help();

  let notebookName = program.notebook;
  if (!notebookName) notebookName = `Dayone: ${new Date().toDateString()}`;
  let doPath = program.args[0];

  // genDoEntries(doPath);

  let fs = require('fs');
  let entries = loadEntries(doPath, program.after);
  const counter = { 'created': 0, 'updated': 0 }; // eslint-disable-line
  let bar = initProgressBar(entries.length, notebookName, counter);
  resetSyncState(program.reset, doPath);

  require('async-foreach').forEach(entries, function createNote(doEntry) {
    let done = this.async();
    let syncLog = prepareSyncLog(doPath, doEntry);
    if (syncLog) {
      let paramsFilePath = prepareEvernotePrarmsFile(doPath, doEntry, syncLog.notebook ? syncLog.notebook : notebookName);
      try {
        syncLog.notebook ? ++counter.updated : ++counter.created;
        if (counter.created > 0) {
          evernote.createNotebook(notebookName);
        }
        syncLog.noteId = evernote.createNote(paramsFilePath);
        saveSyncLog(doPath, syncLog);
      } catch (e) {
        console.log(e);
      } finally {
        fs.unlinkSync(paramsFilePath);
      }
    }
    bar.tick(1);
    setTimeout(done, 1);
  });
}

if (typeof require != 'undefined' && require.main == module) {
  main(process.argv);
}
