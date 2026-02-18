const { app, BrowserWindow } = require('electron');
const path = require('path');

process.on('uncaughtException', (error) => {
  console.error('CRITICAL ERROR:', error);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#030514',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    title: "Nexus DMI v3.1 (Bridge Mode)"
  });

  // Forzar apertura de herramientas de desarrollo
  win.webContents.openDevTools();

  const isDev = process.argv.includes('--dev') || !app.isPackaged;
  const distPath = path.join(__dirname, 'dist', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');

  console.log('--- Dastsc System Check ---');
  console.log('App Path:', __dirname);
  console.log('Dev Mode:', isDev);

  if (isDev) {
    console.log('Trying Dev Server...');
    win.loadURL('http://localhost:5173').catch(() => {
      console.warn('Dev Server failed, trying built dist...');
      win.loadFile(distPath).catch(() => {
        console.warn('Dist failed, trying root index...');
        win.loadFile(rootPath);
      });
    });
  } else {
    win.loadFile(distPath).catch(() => {
      win.loadFile(rootPath);
    });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
