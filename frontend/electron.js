// frontend/electron.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

// We will hard-code this for development. No more helper packages.
const isDev = true; 

function createWindow() {
  console.log("--- Starting to create the window ---");

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
  });

  console.log("--- Window object created ---");

  mainWindow.loadURL('http://localhost:5173');

  console.log("--- Attempting to load URL ---");

  if (isDev) {
    mainWindow.webContents.openDevTools();
    console.log("--- Opening DevTools ---");
  }

  mainWindow.on('closed', () => {
    console.log("--- Window was closed ---");
  });
}

// This event fires when Electron has finished initialization.
app.on('ready', () => {
    console.log("--- Electron App is Ready ---");
    createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});