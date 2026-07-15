import { app, shell, BrowserWindow, Menu } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import electronUpdater from 'electron-updater'
import { registerIpc } from './ipc/handlers.js'
import { buildMenu } from './menu.js'
import { closeProject } from './db/connection.js'
import * as library from './library/store.js'

// electron-updater is CommonJS; destructure the default export for ESM interop.
const { autoUpdater } = electronUpdater

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    title: 'ART',
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite injects ELECTRON_RENDERER_URL in dev.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  library.open(join(app.getPath('userData'), 'library.sqlite'))
  registerIpc(() => mainWindow)
  createWindow()
  if (mainWindow) Menu.setApplicationMenu(buildMenu(mainWindow))

  // Check GitHub Releases for a newer AppImage and download it in the
  // background, prompting to restart when ready. Only in a packaged build.
  // Updates are best-effort: swallow rejections (offline, no releases yet, …)
  // so they never surface as unhandled promise rejections.
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // ignore — updates are best-effort
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeProject()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeProject()
  library.close()
})
