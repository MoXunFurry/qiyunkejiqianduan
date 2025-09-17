// login.js (Electron 渲染进程安全版) - 融合版

// ===== WebSocket 初始化 =====
const WS_URL = 'ws://192.168.31.253:9503';
window.electronAPI.wsConnect(WS_URL);

// ===== 日志函数 =====
async function logToFile(level, ...args) {
    const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : a)).join(' ');
    try {
        const result = await window.electronAPI.logMessage(level, message);
        if (!result.success) console.error('IPC日志失败:', result.error);
    } catch (err) {
        console.error('IPC调用失败:', err);
    }
}

// ===== 容器和表单元素 =====
const authContainer = document.getElementById('auth-container');
const loginForm = document.getElementById('login-form'); // 只保留 form 本身的 id
const registerForm = document.getElementById('register-form');
const passwordLoginArea = document.getElementById('password-login-area');
const verifyLoginArea = document.getElementById('verify-login-area');
const methodOptions = document.querySelectorAll('.method-option');

// ===== 初始化容器高度 =====
window.addEventListener('load', () => {
    setContainerHeight(loginForm);

    // 切换登录方式时，动态管理 required
    methodOptions.forEach(option => {
        option.addEventListener('click', function () {
            methodOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');

            const method = this.getAttribute('data-method');
            const passwordInput = document.getElementById('login-password');
            const vercodeInput = document.getElementById('login-vercode');

            if (method === 'password') {
                passwordLoginArea.style.display = 'block';
                verifyLoginArea.style.display = 'none';

                // 密码登录时：密码必填，验证码不必填
                passwordInput.setAttribute('required', 'required');
                vercodeInput.removeAttribute('required');
            } else {
                passwordLoginArea.style.display = 'none';
                verifyLoginArea.style.display = 'block';

                // 验证码登录时：验证码必填，密码不必填
                vercodeInput.setAttribute('required', 'required');
                passwordInput.removeAttribute('required');
            }

            setContainerHeight(loginForm);
        });
    });
});

// ===== 设置容器高度 =====
function setContainerHeight(formElement) {
    const wasActive = formElement.classList.contains('active');
    if (!wasActive) formElement.classList.add('active', 'temp-visible');

    authContainer.style.height = `${formElement.offsetHeight}px`;

    if (!wasActive) formElement.classList.remove('active', 'temp-visible');
}

// ===== WebSocket 登录对接 =====
let currentLoginEmail = '';
let currentUserID = '';

// 监听 WebSocket 消息
window.electronAPI.wsOnMessage((message) => {
    console.log('收到 WebSocket 消息:', message); // 调试日志

    if (message.type === 'ws-message' && message.data) {
        const data = message.data;

        if (data.type === 'UserLogin') {
            const loginBtn = document.querySelector('#login-form .auth-button');
            loginBtn.textContent = '登录';
            loginBtn.disabled = false;

            if (data.code === 200) {
                currentUserID = data.UserID;
                if (!currentUserID) {
                    console.error('未收到 UserID，无法跳转');
                    提示弹窗('登录失败，请稍后重试', '红色');
                    return;
                }
                console.log('通知主进程切换到主窗口，携带 UserID:', currentUserID);
                window.electronAPI.switchToMainWindow(currentUserID);
            } else {
                提示弹窗(data.msg || '登录失败', '红色');
            }
        } else if (data.type === 'CAPTCHA') {
            const verifyBtn = document.getElementById('login-get-vercode');
            if (data.code === 200) {
                提示弹窗('验证码已发送至邮箱，请查收', '绿色');
                let countdown = 60;
                verifyBtn.disabled = true;
                verifyBtn.textContent = `重新发送(${countdown}s)`;
                const timer = setInterval(() => {
                    countdown--;
                    verifyBtn.textContent = `重新发送(${countdown}s)`;
                    if (countdown <= 0) {
                        clearInterval(timer);
                        verifyBtn.disabled = false;
                        verifyBtn.textContent = '获取验证码';
                    }
                }, 1000);
            } else {
                提示弹窗(data.msg || '验证码发送失败', '红色');
                verifyBtn.disabled = false;
                verifyBtn.textContent = '获取验证码';
            }
        } else if (data.type === 'pong') {
            console.log('[DEBUG] 收到心跳响应:', data.msg);
        } else {
            console.warn('收到未知类型的嵌套消息:', data);
        }
    } else {
        console.warn('收到未知类型的 WebSocket 消息:', message);
    }
});

// ===== 登录表单处理 =====
// 在 alert 后添加 setTimeout 以恢复焦点
function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const loginBtn = document.querySelector('#login-form .auth-button');
    const isPasswordLogin = document.querySelector('.method-option[data-method="password"].active') !== null;

    if (!email) {
        提示弹窗('请输入邮箱地址', '红色');
        setTimeout(() => document.getElementById('login-email').focus(), 50);
        console.log('[DEBUG] 登录表单处理: 请输入邮箱地址');
        return;
    }

    if (isPasswordLogin) {
        const password = document.getElementById('login-password').value.trim();
        if (!password) {
            提示弹窗('请输入密码', '红色');
            setTimeout(() => document.getElementById('login-password').focus(), 50);
            return;
        }

        if (loginBtn.disabled) return; // 防止重复点击
        loginBtn.textContent = '登录中...';
        loginBtn.disabled = true;

        window.electronAPI.wsSend({ type: 'UserLogin', username: email, password });
    } else {
        const vercode = document.getElementById('login-vercode').value.trim();
        if (!vercode) {
            verifyLoginArea.style.display = 'block';
            setContainerHeight(loginForm);
            提示弹窗('请输入验证码', '红色');
            setTimeout(() => document.getElementById('login-vercode').focus(), 50);
            return;
        }

        // 新增：检查验证码过期
        if (Date.now() > vercodeExpiry) {
            提示弹窗('验证码已过期，请重新获取', '红色');
            setTimeout(() => document.getElementById('login-vercode').focus(), 50);
            return;
        }

        if (!currentLoginEmail) {
            提示弹窗('请先获取验证码并完成邮箱验证', '红色');
            setTimeout(() => document.getElementById('login-email').focus(), 50);
            return;
        }

        // 修改：发送登录请求到后端验证用户身份（本地已校验验证码）
        if (loginBtn.disabled) return;
        loginBtn.textContent = '登录中...';
        loginBtn.disabled = true;

        window.electronAPI.wsSend({ 
            type: 'UserLogin', 
            username: currentLoginEmail, 
            vercode: vercode,
            method: 'vercode'  // 区分登录方法
        });

        // 移除直接跳转，等待 wsOnMessage 的 UserLogin 响应处理
    }
}

// ===== 注册表单处理 =====
function handleRegister(event) {
    event.preventDefault();
    // TODO: 实现注册逻辑
    提示弹窗('注册功能开发中...', '黄色');
}

// ===== 获取验证码 =====
function getVerificationCode(type) {
    const emailInput = document.getElementById(type === 'login' ? 'login-email' : 'register-email');
    const verifyBtn = document.getElementById(type === 'login' ? 'login-get-vercode' : 'register-get-vercode');
    const email = emailInput.value.trim();

    // 自定义验证：邮箱是否为空
    if (!email) {
        提示弹窗('请输入邮箱地址', '红色');
        setTimeout(() => emailInput.focus(), 50);
        console.log('[DEBUG] 获取验证码: 请输入邮箱地址');
        return;
    }

    // 自定义验证：邮箱格式是否正确
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        提示弹窗('请输入有效的邮箱地址', '红色');
        setTimeout(() => emailInput.focus(), 50);
        return;
    }

    if (type === 'login') {
        currentLoginEmail = email;
        vercodeExpiry = Date.now() + 5 * 60 * 1000;  // 新增：5分钟过期

        verifyBtn.disabled = true;
        verifyBtn.textContent = '发送中...';

        try {
            // 修改：添加 code 字段，让后端发真实邮件
            window.electronAPI.wsSend({ 
                type: 'CAPTCHA', 
                email, 
                state: '验证码登录',
            });
        } catch (error) {
            console.error('验证码请求失败:', error);
            提示弹窗('验证码请求失败，请稍后重试。', '红色');
            verifyBtn.disabled = false;
            verifyBtn.textContent = '获取验证码';
            setTimeout(() => emailInput.focus(), 50);
        }
    } else {
        提示弹窗('注册验证码功能请补充实现', '黄色');
        setTimeout(() => emailInput.focus(), 50);
    }
}

// ===== 社交登录 =====
function socialLogin(provider) {
    logToFile('info', `尝试使用 ${provider} 登录`);
    提示弹窗(`${provider} 登录功能开发中...`, '黄色');
}

// ===== 切换注册 / 登录 =====
function switchToRegister() {
    setContainerHeight(registerForm);
    loginForm.classList.add('exiting');
    setTimeout(() => {
        loginForm.classList.remove('active', 'exiting');
        registerForm.classList.add('active');
        authContainer.scrollTop = 0;
    }, 300);
}

function switchToLogin() {
    setContainerHeight(loginForm);
    registerForm.classList.add('exiting');
    setTimeout(() => {
        registerForm.classList.remove('active', 'exiting');
        loginForm.classList.add('active');
        authContainer.scrollTop = 0;
    }, 300);
}

// ===== WebSocket 发送逻辑 =====
window.electronAPI.wsSend = async function (message) {
    try {
        const isConnected = window.electronAPI.wsConnect(WS_URL); // 确保连接
        if (!isConnected) throw new Error('WebSocket 未连接');
        await window.electronAPI.sendMessage(message);
    } catch (error) {
        console.error('WebSocket发送失败:', error);
        提示弹窗('网络连接失败，请检查您的网络设置或稍后重试。', '红色');
    }
};

// ===== 页面加载完成 =====
document.addEventListener('DOMContentLoaded', () => {
    // ===== 窗口控制事件绑定 =====
    if (typeof window.electronAPI !== 'undefined') {
        // Electron 环境
        document.getElementById('minimize')?.addEventListener('click', () => {
            logToFile('info', '点击了最小化按钮');
            window.electronAPI.windowControl('minimize');
        });
        document.getElementById('maximize')?.addEventListener('click', () => {
            logToFile('info', '点击了最大化按钮');
            window.electronAPI.windowControl('maximize');
        });
        document.getElementById('fullscreen')?.addEventListener('click', () => {
            logToFile('info', '点击了全屏按钮');
            window.electronAPI.windowControl('fullscreen');
        });
        document.getElementById('close')?.addEventListener('click', () => {
            logToFile('info', '点击了关闭按钮');
            window.electronAPI.windowControl('close');
        });
    } else {
        // 浏览器环境
        document.getElementById('minimize')?.addEventListener('click', () => {
            logToFile('info', '最小化功能需要在Electron环境中使用');
        });
        document.getElementById('maximize')?.addEventListener('click', () => {
            logToFile('info', '点击了最大化按钮(浏览器)');
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.documentElement.requestFullscreen();
            }
        });
        document.getElementById('fullscreen')?.addEventListener('click', () => {
            logToFile('info', '点击了全屏按钮(浏览器)');
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.documentElement.requestFullscreen();
            }
        });
        document.getElementById('close')?.addEventListener('click', () => {
            logToFile('info', '点击了关闭按钮(浏览器)');
            if (confirm('确定要关闭应用吗？')) {
                window.close();
            }
        });
    }

    // ===== 输入框焦点效果 =====
    document.querySelectorAll('.form-input').forEach(input => {
        input.addEventListener('focus', () => input.closest('.form-group').style.transform = 'translateY(-2px)');
        input.addEventListener('blur', () => input.closest('.form-group').style.transform = 'translateY(0)');
    });

    // ===== 忘记密码演示 =====
    document.querySelectorAll('.forgot-link').forEach(link => {
        if (link.textContent === '忘记密码？') {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                提示弹窗('忘记密码功能（演示）：将发送重置链接至您的邮箱', '绿色');
            });
        }
    });

    // ===== 表单提交事件 =====
    const formElement = document.getElementById('login-form-inner');
    if (formElement) {
        formElement.addEventListener('submit', function(event) {
            event.preventDefault();
            handleLogin(event);
        });
    }

    // ===== 注册表单提交 =====
    document.getElementById('register-form')?.addEventListener('submit', (event) => {
        handleRegister(event);
    });

    // ===== 验证码按钮事件 =====
    const loginVerifyBtn = document.getElementById('login-get-vercode');
    if (loginVerifyBtn) {
        loginVerifyBtn.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            console.log('[DEBUG] 获取验证码按钮点击事件触发', new Date().toISOString());
            getVerificationCode('login');
        });
    }

    document.getElementById('register-get-vercode')?.addEventListener('click', () => {
        getVerificationCode('register');
    });

    // ===== 社交登录按钮 =====
    document.getElementById('google-login')?.addEventListener('click', () => {
        socialLogin('google');
    });
    document.getElementById('github-login')?.addEventListener('click', () => {
        socialLogin('github');
    });

    // ===== 切换注册/登录链接 =====
    document.getElementById('switch-to-register')?.addEventListener('click', () => {
        switchToRegister();
    });
    document.getElementById('switch-to-login')?.addEventListener('click', () => {
        switchToLogin();
    });
});