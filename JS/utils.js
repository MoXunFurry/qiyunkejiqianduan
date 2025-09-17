// logToFile 通用工具函数
window.logToFile = async function logToFile(level, ...args) {
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      return JSON.stringify(arg, null, 2);
    }
    return arg;
  }).join(' ');
  if (typeof window.electronAPI !== 'undefined') {
    try {
      const result = await window.electronAPI.logMessage(level, message);
      if (!result.success) {
        console.error('IPC日志失败:', result.error); // fallback
      }
    } catch (error) {
      console.error('IPC调用失败:', error);
    }
  } else {
    // 浏览器环境，fallback到原console
    console[level](message);
  }
};
