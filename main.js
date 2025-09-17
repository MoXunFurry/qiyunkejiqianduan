const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const sudo = require('sudo-prompt');
const os = require('os');
const WebSocket = require('ws');

let mainWindow = null; // 只保留一个窗口实例
let pyProcess = null;

// ===== 日志工具 =====
function createLogDir() {
    const logDir = path.join(app.getPath('userData'), 'logs');
    const appLogDir = path.join(logDir, 'app');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    if (!fs.existsSync(appLogDir)) fs.mkdirSync(appLogDir, { recursive: true });
    return appLogDir;
}

function logToFile(level, ...args) {
    const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : a)).join(' ');
    try {
        const logDir = createLogDir();
        const date = new Date().toISOString().split('T')[0];
        const logFile = path.join(logDir, `app-log-${date}.txt`);
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
        fs.appendFileSync(logFile, logEntry, 'utf8');
    } catch (err) {
        process.stdout.write(`[FALLBACK LOG][${level}] ${message}\n`);
    }
}

// ===== 创建唯一窗口 =====
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1000, height: 700, minWidth: 800, minHeight: 600,
        frame: false, transparent: true, resizable: true, fullscreenable: true,
        autoHideMenuBar: true, roundedCorners: true,
        title: '旗云科技—TT语音 登录', // 初始为登录页标题
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // 初始加载登录页面
    mainWindow.loadFile(path.join(__dirname, 'login.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ===== WebSocket 管理 =====
let wsManager = null;

class WSManager {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.heartbeatInterval = null;
        this.reconnectTimeout = null;
        this.listeners = new Map();
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
            logToFile('info', `[WS] 连接成功: ${this.url}`);
            this.startHeartbeat();
            this.broadcast({ type: 'ws-open' });
        });

        this.ws.on('message', (msg) => {
            let data = null;
            try { data = JSON.parse(msg.toString()); }
            catch (err) { logToFile('error', `[WS] 消息解析错误: ${err}`); return; }

            this.broadcast({ type: 'ws-message', data });
        });

        this.ws.on('close', (code, reason) => {
            logToFile('warn', `[WS] 连接关闭 code=${code}, reason=${reason}`);
            this.stopHeartbeat();
            this.broadcast({ type: 'ws-close', code, reason });
            if (code !== 1000) this.reconnect(); // 非正常关闭时重连
        });

        this.ws.on('error', (err) => {
            logToFile('error', `[WS] 错误: ${err.message}`);
            this.stopHeartbeat();
            this.broadcast({ type: 'ws-error', error: err.message });
            this.reconnect();
        });
    }

    getStatus() {
        if (!this.ws) return 'disconnected';
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING: return 'connecting';
            case WebSocket.OPEN: return 'connected';
            case WebSocket.CLOSING: return 'closing';
            case WebSocket.CLOSED: return 'disconnected';
            default: return 'unknown';
        }
    }

    reconnect() {
        if (this.reconnectTimeout) return;
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.connect();
        }, 5000);
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            this.send({ type: 'ping' });
        }, 45000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
    }

    send(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        this.ws.send(JSON.stringify(data));
        return true;
    }

    onMessage(key, callback) { this.listeners.set(key, callback); }
    offMessage(key) { this.listeners.delete(key); }

    broadcast(msg) {
        this.listeners.forEach((cb, key) => {
            const window = BrowserWindow.fromId(parseInt(key));
            if (window && !window.isDestroyed()) cb(msg);
        });
    }

    close() {
        this.stopHeartbeat();
        if (this.ws) this.ws.close();
        this.ws = null;
    }
}

// IPC 对接
ipcMain.on('ws-connect', (event, url) => {
    if (!wsManager) wsManager = new WSManager(url);
    wsManager.onMessage(event.sender.id, (msg) => event.sender.send('ws-on-message', msg));
    wsManager.connect();
});

ipcMain.handle('ws-on-status', async () => {
    if (!wsManager) return 'disconnected';
    return wsManager.getStatus();
});

ipcMain.on('ws-send', (event, data) => { if (wsManager) wsManager.send(data); });
ipcMain.on('ws-close', () => { if (wsManager) wsManager.close(); });

// ===== 登录成功切换页面 =====
ipcMain.on('switch-to-main-window', (event, userID) => {
    if (!mainWindow) return;

    mainWindow.loadFile(path.join(__dirname, 'index.html')).then(() => {
        // 页面加载完成后发送 userID
        mainWindow.webContents.send('user-id', userID);
    });

    mainWindow.setTitle('旗云科技—TT语音');

    startPython();
    checkAndInstallVBCable();

    logToFile('info', `切换到主窗口，用户ID: ${userID}`);
});

// ======== 检测 VB-Cable ========
function checkAndInstallVBCable() {
    const checkCmd = 'powershell "Get-CimInstance Win32_SoundDevice | Where-Object {$_.Name -like \'*VB-Audio Virtual Cable*\'}"';
    exec(checkCmd, (error, stdout) => {
        if (error) {
            logToFile('error', '检测 VB-Cable 出错:', error);
            return;
        }
        const installed = stdout && stdout.trim().length > 0;
        if (!installed) {
            logToFile('warn', 'VB-Cable 未安装，准备静默安装...');
            installVBCable();
        } else {
            logToFile('info', 'VB-Cable 已安装');
        }
    });
}

function installVBCable() {
    const arch = os.arch();
    const installerFile = arch === 'x64' ? 'VBCABLE_Setup_x64.exe' : 'VBCABLE_Setup.exe';
    const installerPath = path.join(__dirname, '..', 'resources', 'VBCABLE_Setup', installerFile);
    if (!fs.existsSync(installerPath)) {
        logToFile('error', 'VB-Cable 安装文件不存在:', installerPath);
        return;
    }
    sudo.exec(`"${installerPath}" /S`, { name: '旗云科技-TT语音' }, (err) => {
        if (err) logToFile('error', 'VB-Cable 安装失败:', err);
        else logToFile('info', 'VB-Cable 安装完成');
    });
}

// ======== 启动 Python ========
function startPython() {
    try {
        const scriptPath = path.join(__dirname, '..', 'backend', '音频增益.py');
        if (!fs.existsSync(scriptPath)) {
            logToFile('error', 'Python 文件不存在:', scriptPath);
            return;
        }

        pyProcess = spawn('python', [scriptPath], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
            encoding: 'utf-8'
        });

        pyProcess.stdout.on('data', (data) => {
            const msg = data.toString().trim();
            logToFile('info', 'Python 输出:', msg);
            if (mainWindow) mainWindow.webContents.send('python-output', msg);
        });

        pyProcess.stderr.on('data', (data) => {
            logToFile('error', 'Python 错误:', data.toString());
        });

        pyProcess.on('close', (code) => {
            logToFile('warn', `Python 进程退出，代码: ${code}`);
        });
    } catch (err) {
        logToFile('error', '启动 Python 错误:', err);
    }
}

// ======== 日志 IPC ========
ipcMain.handle('log-message', async (event, { level, message }) => {
    try {
        const logDir = createLogDir();
        const date = new Date().toISOString().split('T')[0];
        const logFile = path.join(logDir, `app-log-${date}.txt`);
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFile, `[${timestamp}] [${level.toUpperCase()}] ${message}\n`, 'utf8');
        return { success: true, path: logFile };
    } catch (err) {
        logToFile('error', '日志写入失败:', err);
        return { success: false, error: err.message };
    }
});

// ======== 窗口控制 ========
ipcMain.on('window-control', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
        logToFile('error', 'window-control 找不到窗口');
        return;
    }
    switch (action) {
        case 'minimize': win.minimize(); break;
        case 'maximize': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
        case 'fullscreen': win.setFullScreen(!win.isFullScreen()); break;
        case 'close': win.close(); break;
    }
});

// ======== 生命周期 ========
app.whenReady().then(() => {
    createMainWindow(); // 应用启动时只创建一个窗口
});

app.on('window-all-closed', () => {
    if (pyProcess) pyProcess.kill(); // 关闭 Python 进程
    if (process.platform !== 'darwin') app.quit(); // 非 macOS 平台退出应用
});

app.on('activate', () => {
    if (!mainWindow) createMainWindow(); // macOS 平台重新激活应用时创建窗口
});
