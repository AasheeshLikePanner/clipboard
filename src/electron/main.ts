import { app, BrowserWindow, clipboard, globalShortcut, ipcMain } from "electron"
import { ipcMainHandle, isDev } from "./util.js";
import { getPreloadPath, getUIPath } from "./pathResolver.js";
import { getStaticData, pollResources } from "./test.js";
import { screen } from "electron";
import path from 'path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Tray, Menu } from 'electron';


let tray: Tray | null = null;
let clipboardHistory: { format: string; content: string }[] = [];
let lastText = '';
let lastImage = '';

app.on("ready", () => {

    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
    const windowWidth = 1000;
    const windowHeight = 200;
    const x = Math.round((screenWidth - windowWidth) / 2);
    const y = 10;
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
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    pollClipboard(mainWindow);

    if (isDev()) mainWindow.loadURL("http://localhost:3524")
    else mainWindow.loadFile(getUIPath());

    pollResources(mainWindow);

    ipcMainHandle("getStaticData", () => {
        return getStaticData();
    })

    ipcMain.handle("getClipboardHistory", () => {
        console.log(clipboardHistory);
        
        return clipboardHistory;
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
            lastText = text;
            clipboardHistory.unshift({ format: 'text/plain', content: text });
            mainWindow.webContents.send("clipboard-history-update", clipboardHistory);
        }

        const image = clipboard.readImage();
        const imageData = image.toDataURL();
        if (image && imageData && imageData !== lastImage) {
            lastImage = imageData;
            clipboardHistory.unshift({ format: 'image/png', content: imageData });
            mainWindow.webContents.send("clipboard-history-update", clipboardHistory);
        }

        if (clipboardHistory.length > 50) clipboardHistory.pop();
    }, 500);
}