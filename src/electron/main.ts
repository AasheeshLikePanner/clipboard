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

// Debug setup
const debug = {
  logWindowState: (win: BrowserWindow) => {
    console.log('--- Window State ---');
    console.log('Visible:', win.isVisible());
    console.log('Focused:', win.isFocused());
    console.log('Minimized:', win.isMinimized());
    console.log('Opacity:', win.getOpacity());
    console.log('AlwaysOnTop:', win.isAlwaysOnTop());
    console.log('-------------------');
  },
  logShortcutInfo: () => {
    console.log('--- Shortcut Info ---');
    console.log('Registered:', globalShortcut.isRegistered('CommandOrControl+Shift+V'));
    console.log('-------------------');
  }
};

app.disableHardwareAcceleration();

let tray: Tray | null = null;
let clipboardHistory: { format: string; content: string }[] = [];
let lastText = '';
let lastImage = '';
let allowHide = true; // Control window hiding behavior

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on("ready", () => {
  console.log('--- App Ready ---');
  
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const { x: displayX, y: displayY } = screen.getPrimaryDisplay().workArea;

  const windowWidth = 1000;
  const windowHeight = 150;
  const x = Math.round((screenWidth - windowWidth) / 2) + displayX;
  const y = displayY;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  console.log('Creating main window...');
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
    console.log('Window show event triggered');
    debug.logWindowState(mainWindow);
  });

  mainWindow.on('hide', () => {
    console.log('Window hide event triggered');
    debug.logWindowState(mainWindow);
  });

  mainWindow.on('focus', () => {
    console.log('Window focus event triggered');
    debug.logWindowState(mainWindow);
  });

  mainWindow.on('blur', () => {
    console.log('Window blur event triggered');
    if (allowHide && !mainWindow.webContents.isDevToolsOpened()) {
      console.log('Hiding window due to blur');
      mainWindow.hide();
    }
  });

  mainWindow.on('ready-to-show', () => {
    console.log('Window ready-to-show event triggered');
    debug.logWindowState(mainWindow);
  });

  // Load the app
  console.log('Loading app content...');
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
  console.log('Initializing tray...');
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "..", "icon.png");

  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show App', 
      click: () => {
        console.log('Tray "Show App" clicked');
        allowHide = false;
        mainWindow.show();
        mainWindow.focus();
        setTimeout(() => allowHide = true, 100);
      } 
    },
    { label: 'Open DevTools', click: () => mainWindow.webContents.openDevTools() },
    { label: 'Debug Info', click: () => debug.logWindowState(mainWindow) },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('Clipboard App');
  tray.setContextMenu(contextMenu);

  // Register global shortcut
  console.log('Registering global shortcut...');
  const shortcutRegistered = globalShortcut.register('CommandOrControl+Shift+V', () => {
    console.log('\nShortcut triggered');
    debug.logWindowState(mainWindow);
    debug.logShortcutInfo();

    if (mainWindow.isVisible()) {
      console.log('Hiding window');
      mainWindow.hide();
    } else {
      console.log('Showing window');
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

  if (!shortcutRegistered) {
    console.error('Failed to register shortcut');
  } else {
    console.log('Shortcut registered successfully');
    debug.logShortcutInfo();
  }

  // IPC and other handlers
  ipcMainHandle("getStaticData", () => getStaticData());
  
  ipcMain.handle("getClipboardHistory", () => {
    console.log('Clipboard history requested');
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

  console.log('App initialization complete');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});