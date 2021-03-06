var electron = require('electron')
var setupIpc = require('./lib/background-ipc')
var openWindow = require('./lib/window')
var createSbot = require('./lib/ssb-server')
var serveBlobs = require('./lib/serve-blobs')
var makeSingleInstance = require('./lib/make-single-instance')
var pull = require('pull-stream')
var pullFile = require('pull-file')
var Path = require('path')
var fs = require('fs')

var windows = {
  dialogs: new Set()
}

var context = null
if (process.argv[2] === '--test-peer') {
  // helpful for testing peers on a single machine
  context = setupContext('ferment-peer', {
    port: 43762
  })

  if (process.argv[3]) {
    context.sbot.gossip.add(process.argv[3], 'local')
  }
} else if (process.argv[2] === '--create-invite') {
  context = setupContext('ferment', { allowPrivate: true })
  context.sbot.invite.create(1, (err, code) => {
    if (err) throw err
    console.log(`invite code:\n\n${code}\n`)
  })
} else {
  makeSingleInstance(windows, openMainWindow)
  context = setupContext('ferment')
  console.log('address:', context.sbot.getAddress())
}


electron.ipcMain.on('add-blob', (ev, id, path, cb) => {
  pull(
    pullFile(path),
    context.sbot.blobs.add((err, hash) => {
      if (err) return ev.sender.send('response', id, err)
      ev.sender.send('response', id, null, hash)
    })
  )
})

electron.app.on('ready', function () {
  setupIpc(windows)
  startBackgroundProcess()
  openMainWindow()
})

electron.app.on('activate', function (e) {
  openMainWindow()
})

electron.ipcMain.on('open-add-window', openAddWindow)
electron.ipcMain.on('open-edit-profile-window', (ev, data) => openEditProfileWindow(data))
electron.ipcMain.on('open-join-pub-window', openJoinPubWindow)

function openMainWindow () {
  if (!windows.main) {
    windows.main = openWindow(context, Path.join(__dirname, 'main-window.js'), {
      minWidth: 800,
      width: 1024,
      height: 768,
      titleBarStyle: 'hidden-inset',
      title: 'Ferment',
      show: true,
      backgroundColor: '#444',
      acceptFirstMouse: true,
      webPreferences: {
        experimentalFeatures: true
      }
    })
    windows.main.setSheetOffset(40)
    windows.main.on('closed', function () {
      windows.main = null
    })
  }
}

function openAddWindow () {
  var window = openWindow(context, Path.join(__dirname, 'add-audio-window.js'), {
    parent: windows.main,
    show: true,
    width: 850,
    height: 350,
    useContentSize: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    resizable: false,
    title: 'Add Audio File',
    backgroundColor: '#444',
    acceptFirstMouse: true
  })

  windows.dialogs.add(window)

  window.on('closed', function () {
    windows.dialogs.delete(window)
  })
}

function openEditProfileWindow (opts) {
  var window = openWindow(context, Path.join(__dirname, 'edit-profile-window.js'), {
    parent: windows.main,
    modal: true,
    show: true,
    width: 800,
    height: 300,
    useContentSize: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    resizable: false,
    title: 'Edit Profile',
    backgroundColor: '#444',
    acceptFirstMouse: true,
    data: opts
  })

  windows.dialogs.add(window)

  window.on('closed', function () {
    windows.dialogs.delete(window)
  })
}

function openJoinPubWindow () {
  var window = openWindow(context, Path.join(__dirname, 'join-pub-window.js'), {
    parent: windows.main,
    modal: true,
    show: true,
    width: 650,
    height: 280,
    useContentSize: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    resizable: false,
    title: 'Join Public Server',
    backgroundColor: '#444',
    acceptFirstMouse: true
  })

  windows.dialogs.add(window)

  window.on('closed', function () {
    windows.dialogs.delete(window)
  })
}

function startBackgroundProcess () {
  windows.background = openWindow(context, Path.join(__dirname, 'background-window.js'), {
    center: true,
    fullscreen: false,
    fullscreenable: false,
    height: 150,
    maximizable: false,
    minimizable: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    title: 'ferment-background-window',
    useContentSize: true,
    width: 150
  })
}

function setupContext (appName, opts) {
  var ssbConfig = require('./lib/ssb-config')(appName, opts)
  var context = {
    sbot: createSbot(ssbConfig),
    config: ssbConfig
  }

  ssbConfig.manifest = context.sbot.getManifest()
  serveBlobs(context)
  fs.writeFileSync(Path.join(ssbConfig.path, 'manifest.json'), JSON.stringify(ssbConfig.manifest))
  return context
}
