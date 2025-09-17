// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ===== 窗口控制 =====
    windowControl: (action) => ipcRenderer.send('window-control', action),

    // ===== 日志记录 =====
    logMessage: async (level, message) => {
        const result = await ipcRenderer.invoke('log-message', { level, message });
        return result;
    },

    // ===== Python 输出 =====
    onPythonOutput: (callback) => ipcRenderer.on('python-output', (event, data) => callback(data)),

    // ===== 登录 =====
    loginAttempt: (username, password) => ipcRenderer.send('login-attempt', { username, password }),
    onLoginResult: (callback) => ipcRenderer.on('login-result', (event, data) => callback(data)),

    // ===== 用户ID =====
    onUserId: (callback) => ipcRenderer.on('user-id', callback),

    // ===== WebSocket =====
    wsConnect: (url) => {
        ipcRenderer.send('ws-connect', url);
        console.log('尝试连接 WebSocket:', url); // 调试日志
    },
    wsSend: (data) => {
        console.log('发送 WebSocket 消息:', data); // 调试日志
        ipcRenderer.send('ws-send', data);
    },

    wsOnMessage: (callback) => {
        ipcRenderer.on('ws-on-message', (event, msg) => {
            console.log('收到 WebSocket 消息:', msg); // 调试日志
            callback(msg);
        });
    },

    wsOnOpen: (callback) => {
        ipcRenderer.on('ws-open', () => {
            console.log('WebSocket 连接成功'); // 调试日志
            callback();
        });
    },

    wsOnClose: (callback) => ipcRenderer.on('ws-close', (event, data) => callback(data)),

    wsOnError: (callback) => {
        ipcRenderer.on('ws-error', (event, msg) => {
            console.error('WebSocket 错误:', msg); // 调试日志
            callback(msg);
        });
    },

   // ===== WebSocket 状态 =====
    wsOnStatus: (callback) => ipcRenderer.on('ws-status', (event, status) => callback(status)),
    wsGetStatus: async () => {
        const status = await ipcRenderer.invoke('ws-on-status');
        return status;
    },

    // 发送关闭连接的指令，建议使用 ws-close 而不是 ws-send
    wsClose: () => ipcRenderer.send('ws-close'),

    // ===== 切换窗口 =====
    switchToMainWindow: (userID) => ipcRenderer.send('switch-to-main-window', userID)
});
