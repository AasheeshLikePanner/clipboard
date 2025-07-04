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
    
    let y;
    const platform = os.platform();
    
    if (platform === 'win32') {
        y = displayY; 
    } else if (platform === 'darwin') {
        y = displayY + 35;
    } else {
        y = displayY + 10;
    }
    
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
        mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.webContents.insertCSS(`
                body {
                    -webkit-app-region: drag;
                    background: transparent !important;
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                }
                
                #root {
                    width: 100%;
                    height: 100vh;
                    background: linear-gradient(135deg, 
                        rgba(255, 255, 255, 0.95) 0%, 
                        rgba(255, 255, 255, 0.85) 100%);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    box-shadow: 
                        0 8px 32px rgba(0, 0, 0, 0.12),
                        0 2px 8px rgba(0, 0, 0, 0.08),
                        inset 0 1px 0 rgba(255, 255, 255, 0.5);
                    border-radius: 0 0 20px 20px;
                    position: relative;
                    overflow: hidden;
                    -webkit-app-region: no-drag;
                }
                
                #root::before,
                #root::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    width: 20px;
                    height: 20px;
                    background: transparent;
                    border-radius: 0 0 20px 0;
                    box-shadow: 0 0 0 20px rgba(255, 255, 255, 0.95);
                    z-index: -1;
                }
                
                #root::before {
                    left: -20px;
                    transform: rotate(90deg);
                }
                
                #root::after {
                    right: -20px;
                    transform: rotate(180deg);
                }
                
                @media (prefers-color-scheme: dark) {
                    #root {
                        background: linear-gradient(135deg, 
                            rgba(30, 30, 30, 0.95) 0%, 
                            rgba(20, 20, 20, 0.85) 100%);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        box-shadow: 
                            0 8px 32px rgba(0, 0, 0, 0.3),
                            0 2px 8px rgba(0, 0, 0, 0.2),
                            inset 0 1px 0 rgba(255, 255, 255, 0.1);
                        color: white;
                    }
                    
                    #root::before,
                    #root::after {
                        box-shadow: 0 0 0 20px rgba(30, 30, 30, 0.95);
                    }
                }
                
                #root:hover {
                    transform: translateY(-2px);
                    box-shadow: 
                        0 12px 48px rgba(0, 0, 0, 0.15),
                        0 4px 12px rgba(0, 0, 0, 0.1),
                        inset 0 1px 0 rgba(255, 255, 255, 0.6);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
            `);
        });
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
            mainWindow?.show();
            mainWindow?.focus();
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
