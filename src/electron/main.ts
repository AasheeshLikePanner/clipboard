import { app, BrowserWindow, clipboard, globalShortcut, ipcMain } from "electron";
import { ipcMainHandle, isDev } from "./util.js";
import { getPreloadPath, getUIPath } from "./pathResolver.js";
import { getStaticData, pollResources } from "./test.js";
import { screen } from "electron";
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Tray, Menu } from 'electron';
import crypto from 'crypto';
import os from 'os'
import Store, {Schema} from 'electron-store'

app.disableHardwareAcceleration();

let tray: Tray | null = null;
let clipboardHistory: { format: string; content: string }[] = [];
let lastText = '';
let lastImage = '';
let allowHide = true; // Control window hiding behavior

interface AppConfig {
  startAtLogin: boolean;
}

const schema: Schema<AppConfig> = {
  startAtLogin: {
    type: 'boolean',
    default: true
  }
};

const config = new Store<AppConfig>({ schema });

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let appIsQuitting = false;

app.on("ready", () => {

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const { x: displayX, y: displayY } = screen.getPrimaryDisplay().workArea;

  const windowWidth = 1000;
  const windowHeight = 150;
  const x = Math.round((screenWidth - windowWidth) / 2) + displayX;
  const y = displayY;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    resizable: false,
    movable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    show: false, // Start hidden
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: isDev(),
      backgroundThrottling: false // Important for Windows
    },
  });

  // Debug event listeners
  mainWindow.on('show', () => {

  });

  mainWindow.on('hide', () => {

  });

  mainWindow.on('focus', () => {

  });

  mainWindow.on('close', (event) => {
    if (!appIsQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('blur', () => {
    if (allowHide && !mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('ready-to-show', () => {
  });

  // Load the app
  if (isDev()) {
    mainWindow.loadURL("http://localhost:3524")
      .then(() => console.log('Dev URL loaded successfully'))
      .catch(err => console.error('Failed to load dev URL:', err));
  } else {
    mainWindow.loadFile(getUIPath())
      .then(() => console.log('Production file loaded successfully'))
      .catch(err => console.error('Failed to load production file:', err));
  }

  // Initialize tray
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "..", "icon.png");

  tray = new Tray(iconPath);

  app.setLoginItemSettings({
    openAtLogin: config.get('startAtLogin'),
    openAsHidden: true,  // Starts minimized/hidden
    path: process.execPath,
    args: [
      '--hidden'  // Custom argument you can check in your app
    ]
  });


  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: config.get('startAtLogin'),
      click: ({checked}) => {
        config.get('startAtLogin', checked)
        app.setLoginItemSettings({
          openAtLogin: checked,
          openAsHidden: true,
          path: process.execPath
        });
      }
    },
    { label: 'Show App', click: () => mainWindow?.show() },
    {
      label: 'Quit',
      click: () => {
        appIsQuitting = true;
        globalShortcut.unregisterAll();
        if (tray) tray.destroy();
        mainWindow.destroy()
        app.quit();
      }
    }
  ]);
  tray.setToolTip('Clipboard App');
  tray.setContextMenu(contextMenu);
  tray.setToolTip('Clipboard App');
  tray.setContextMenu(contextMenu);

  // Register global shortcut
  const shortcutRegistered = globalShortcut.register('CommandOrControl+Shift+V', () => {

    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      allowHide = false;
      mainWindow.show();
      mainWindow.focus();

      // Windows-specific fixes
      if (process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        setTimeout(() => mainWindow.focus(), 100);
      }

      setTimeout(() => allowHide = true, 100);
    }
  });



  // IPC and other handlers
  ipcMainHandle("getStaticData", () => getStaticData());

  ipcMain.handle("getClipboardHistory", () => {
    return clipboardHistory;
  });

  ipcMain.handle("getPlatform", () => os.platform());

  // Clipboard polling
  setInterval(() => {
    const text = clipboard.readText();
    if (text && text !== lastText) {
      lastText = text;
      clipboardHistory.unshift({ format: 'text/plain', content: text });
      mainWindow.webContents.send("clipboard-history-update", clipboardHistory);
    }

    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const imageData = image.toDataURL();
      const imageHash = crypto.createHash('sha256').update(imageData).digest('hex');

      if (imageHash !== lastImage) {
        lastImage = imageHash;
        clipboardHistory.unshift({ format: 'image/png', content: imageData });
        mainWindow.webContents.send("clipboard-history-update", clipboardHistory);
      }
    }

    if (clipboardHistory.length > 50) clipboardHistory.pop();
  }, 500);

});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
