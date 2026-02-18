const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let pythonProcess = null;

process.on('uncaughtException', (error) => {
  console.error('CRITICAL ERROR:', error);
});

function startBackend() {
  console.log('--- Initializing Nexus Backend Core ---');
  
  const isDev = process.argv.includes('--dev') || !app.isPackaged;
  
  // Determinamos rutas segun si es dev o prod
  let pythonExe = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe'); // Venv raiz
  let backendPath = path.join(__dirname, 'backend');

  if (!app.isPackaged) {
    // Si no esta empaquetado (npm run dev)
    pythonExe = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
    backendPath = path.join(__dirname, 'backend');
  } else {
    // Si esta empaquetado (dist/win-unpacked)
    // El venv se copia dentro de backend en el build
    pythonExe = path.join(__dirname, 'backend', '.venv', 'Scripts', 'python.exe');
    backendPath = path.join(__dirname, 'backend');
    
    // Fallback si el venv no se copio bien
    if (!require('fs').existsSync(pythonExe)) {
        pythonExe = 'python'; // Intenta usar el del sistema
    }
  }

  console.log('Python Exe:', pythonExe);
  console.log('Backend Path:', backendPath);

  pythonProcess = spawn(pythonExe, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], {
    cwd: backendPath
  });

  pythonProcess.stdout.on('data', (data) => console.log(`[Backend]: ${data}`));
  pythonProcess.stderr.on('data', (data) => console.error(`[Backend ERROR]: ${data}`));

  pythonProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
  });
}

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
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (pythonProcess) {
    console.log('Stopping backend process...');
    pythonProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
