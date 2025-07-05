import { app, BrowserWindow, clipboard, globalShortcut, ipcMain } from "electron"
import { ipcMainHandle, isDev } from "./util.js";
import { getPreloadPath, getUIPath } from "./pathResolver.js";
import { getStaticData, pollResources } from "./test.js";
import { screen } from "electron";
import path from 'path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Tray, Menu } from 'electron';
import crypto from 'crypto'
import os from 'os';

let tray: Tray | null = null;
let clipboardHistory: { format: string; content: string }[] = [];
let lastText = '';
let lastImage = '';

app.on("ready", () => {

    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const { x: displayX, y: displayY } = screen.getPrimaryDisplay().workArea;

    const windowWidth = 1000;
    const windowHeight = 150;
    const x = Math.round((screenWidth - windowWidth) / 2) + displayX;

    let y = displayY;
    // const platform = os.platform();

    // if (platform === 'win32') {
    //     y = displayY; 
    // } else if (platform === 'darwin') {
    //     y = displayY;
    // } else {
    //     y = displayY;
    // }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x: x,
        y: y,
        resizable: false,
        movable: false,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: true, // Enhanced shadow for better depth
        opacity: 0,        // <-- start hidden
        show: false,       // <-- don’t auto-show (we’ll show manually)

        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
        },
    });

    pollClipboard(mainWindow);

    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; " +
                    "img-src 'self' data: blob:; " +
                    "style-src 'self' 'unsafe-inline'; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval';"
                ]
            }
        });
    });

    if (isDev()) {
        mainWindow.loadURL("http://localhost:3524")
    } else {
        mainWindow.loadFile(getUIPath());
    }

    pollResources(mainWindow);

    ipcMainHandle("getStaticData", () => {
        return getStaticData();
    })

    ipcMain.handle("getClipboardHistory", () => {
        console.log(clipboardHistory);
        return clipboardHistory;
    });

    // Add IPC handler for platform detection
    ipcMain.handle("getPlatform", () => {
        return os.platform();
    });

    mainWindow.on('close', (event) => {
        event.preventDefault();
        mainWindow?.hide();
    });

    mainWindow.on('blur', () => {
        if (!mainWindow.webContents.isDevToolsOpened() && !mainWindow.isMinimized()) {
            mainWindow.hide();
        }
    });

    mainWindow.on('focus', () => {
        mainWindow.show();
    });

    app.whenReady().then(() => {
        tray = new Tray('public/icon.png');
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Show App', click: () => mainWindow?.show() },
            { label: 'Quit', click: () => app.quit() }
        ]);
        tray.setToolTip('Clipboard App');
        tray.setContextMenu(contextMenu);

        globalShortcut.register('CommandOrControl+Shift+V', () => {
            if (!mainWindow.isVisible()) {
                mainWindow.setOpacity(0);
                mainWindow.showInactive(); // show without stealing focus

                let opacity = 0;
                const interval = setInterval(() => {
                    opacity += 0.05;
                    mainWindow.setOpacity(opacity);
                    if (opacity >= 1) {
                        clearInterval(interval);
                        mainWindow.focus(); // focus after fade-in
                    }
                }, 0.2); // ~60fps
            } else {
                mainWindow.hide(); // Toggle off if already visible
            }

        });

    });
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function pollClipboard(mainWindow: BrowserWindow) {
    setInterval(() => {
        const text = clipboard.readText();
        if (text && text !== lastText) {
            const existingTextIndex = clipboardHistory.findIndex(e => e.format === 'text/plain' && e.content === text);
            if (existingTextIndex !== -1) {
                clipboardHistory.splice(existingTextIndex, 1);
            }

            lastText = text;
            clipboardHistory.unshift({ format: 'text/plain', content: text });
            mainWindow.webContents.send("clipboard-history-update", clipboardHistory);
        }

        const image = clipboard.readImage();
        if (!image.isEmpty()) {
            const imageData = image.toDataURL();
            const imageHash = crypto.createHash('sha256').update(imageData).digest('hex');

            if (imageHash !== lastImage) {
                const existingImageIndex = clipboardHistory.findIndex(e => {
                    if (e.format === 'image/png') {
                        const hash = crypto.createHash('sha256').update(e.content).digest('hex');
                        return hash === imageHash;
                    }
                    return false;
                });

                if (existingImageIndex !== -1) {
                    clipboardHistory.splice(existingImageIndex, 1);
                }

                lastImage = imageHash;
                clipboardHistory.unshift({ format: 'image/png', content: imageData });
                mainWindow.webContents.send("clipboard-history-update", clipboardHistory);
            }
        }

        if (clipboardHistory.length > 50) clipboardHistory.pop();
    }, 500);
}
