// 应用初始化
class GlassApp {
    constructor() {
        this.currentPage = 'home';
        this.animationsEnabled = true;
        window.currentUserID = null; // 初始化全局 userID
        this.initializeApp();
        this.bindEvents();
        this.loadSettings();
        this.checkBackdropFilterSupport();
    }

    initializeApp() {
        // 检测用户动画偏好
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            this.animationsEnabled = false;
            document.body.classList.remove('animations-enabled');
        } else {
            document.body.classList.add('animations-enabled');
        }

        // 初始化页面访问统计
        this.initPageStats();
        this.updateVisitTime();
    }

    bindEvents() {
        // 检测是否在Electron环境中
        if (window.electronAPI) {
            console.log('[INFO] Electron API 已检测到');

            // 接收用户ID

            // window.electronAPI.onUserId((event, userID) => {
            //     console.log('收到的用户ID:', userID);
            //     window.currentUserID = userID;
            //     // 如果 WebSocket 已连接，立即发送 GetUserData 请求
            //     // 注意：这里假设 ws-open 事件已处理或连接已就绪；否则依赖 ws-open 事件触发
            // });
            window.electronAPI.onUserId((event, userID) => {
                console.log('[INFO] 收到用户ID:', userID);
                window.currentUserID = userID;

                // 检查 WebSocket 状态
                window.electronAPI.wsGetStatus().then(status => {
                    console.log('[INFO] 当前 WebSocket 状态:', status);
                    if (status === 'connected') {
                        console.log('[INFO] WebSocket 已连接，发送 GetUserData 请求');
                        window.electronAPI.wsSend({
                            type: 'GetUserData',
                            UserID: window.currentUserID
                        });
                    } else {
                        console.log('[WARN] WebSocket 未连接，等待 wsOnOpen 事件触发请求');
                    }
                }).catch(err => {
                    console.error('[ERROR] 获取 WebSocket 状态失败:', err);
                });
            });

            // 监听 WebSocket 打开事件
            window.electronAPI.wsOnOpen(() => {
                console.log('[INFO] WebSocket 打开事件触发');
                if (window.currentUserID) {
                    console.log('[INFO] 发送 GetUserData 请求，UserID:', window.currentUserID);
                    window.electronAPI.wsSend({
                        type: 'GetUserData',
                        UserID: window.currentUserID
                    });
                } else {
                    console.log('[WARN] 用户ID尚未接收，等待 onUserId 回调');
                }
            });

            // 监听 WebSocket 消息事件
            window.electronAPI.wsOnMessage((msg) => {
                console.log('[INFO] 收到 WebSocket 消息:', msg);
                if (msg.type === 'ws-message' && msg.data && msg.data.type === 'GetUserData' && msg.data.code === 200) {
                    const userData = msg.data.UserData;
                    const { name, avatar } = userData;
                    console.log('[INFO] 获取用户数据成功:', userData);

                    // 更新用户昵称
                    const nicknameElements = document.querySelectorAll('#user-nickname, #current-nickname');
                    nicknameElements.forEach(el => {
                        el.textContent = name;
                    });
                    localStorage.setItem('userNickname', name);
                    console.log('[INFO] 用户昵称已更新:', name);

                    // 更新用户头像
                    if (avatar) {
                        const avatars = document.querySelectorAll('#user-avatar, #profile-avatar-preview');
                        avatars.forEach(avatarEl => avatarEl.src = avatar);
                        localStorage.setItem('userAvatar', avatar);
                        console.log('[INFO] 用户头像已更新:', avatar);
                    }

                    // 更新其他用户信息
                    this.updateUserProfile(userData);
                }
            });
        }

        console.log('bindEvents completed');
        // 导航链接事件
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigateToPage(page);
                this.trackPageVisit(page);
            });

            // 键盘支持
            link.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const page = link.dataset.page;
                    this.navigateToPage(page);
                    this.trackPageVisit(page);
                }
            });
        });

        // 动画开关事件
        const animationToggle = document.getElementById('animation-toggle');
        if (animationToggle) {
            animationToggle.addEventListener('click', () => this.toggleAnimations());
            animationToggle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.toggleAnimations();
                }
            });
        }

        // 标题栏按钮事件
        this.bindTitleBarEvents();

        // 用户头像事件
        const userAvatar = document.getElementById('user-avatar');
        if (userAvatar) {
            userAvatar.addEventListener('click', () => this.selectAvatar());
        }

        // 设置中的开关事件
        this.bindSettingsEvents();
    }

    bindTitleBarEvents() {
        // 检查是否在Electron环境中
        if (typeof window.electronAPI !== 'undefined') {
            document.getElementById('minimize')?.addEventListener('click', () => {
                window.electronAPI.windowControl('minimize');
            });

            document.getElementById('maximize')?.addEventListener('click', () => {
                window.electronAPI.windowControl('maximize');
            });

            document.getElementById('fullscreen')?.addEventListener('click', () => {
                window.electronAPI.windowControl('fullscreen');
            });

            document.getElementById('close')?.addEventListener('click', () => {
                window.electronAPI.windowControl('close');
            });
        } else {
            // 浏览器环境下的模拟功能
            document.getElementById('minimize')?.addEventListener('click', () => {
                logToFile('info', '最小化功能需要在Electron环境中使用'); // 修改为日志函数
            });

            document.getElementById('maximize')?.addEventListener('click', () => {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                } else {
                    document.documentElement.requestFullscreen();
                }
            });

            document.getElementById('fullscreen')?.addEventListener('click', () => {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                } else {
                    document.documentElement.requestFullscreen();
                }
            });

            document.getElementById('close')?.addEventListener('click', () => {
                if (confirm('确定要关闭应用吗？')) {
                    window.close();
                }
            });
        }
    }

    bindSettingsEvents() {
        // 玻璃效果开关
        const glassToggle = document.getElementById('glass-effect-toggle');
        if (glassToggle) {
            // 读取本地配置，默认 true/false
            const glassConfig = localStorage.getItem('glassEffect');
            if (glassConfig !== null) {
                const isEnabled = glassConfig === 'true';
                glassToggle.checked = isEnabled;
                if (isEnabled) {
                    this.enableGlassEffect();
                } else {
                    this.disableGlassEffect();
                }
            }

            // 点击事件
            glassToggle.addEventListener('click', () => {
                this.toggleGlassEffect();
                // 写入本地配置
                localStorage.setItem('glassEffect', glassToggle.checked);
            });
        }

        // 设置中的动画开关
        const settingsAnimationToggle = document.getElementById('settings-animation-toggle');
        if (settingsAnimationToggle) {
            // 读取本地配置，默认 true/false
            // const animationConfig = localStorage.getItem('settingsAnimation');
            // if (animationConfig !== null) {
                const isEnabled = "false"; // 默认禁用
                settingsAnimationToggle.checked = isEnabled;
                if (isEnabled) {
                    // this.enableAnimations();
                } else {
                    // this.disableAnimations();
                }
            // }

            // 点击事件
            settingsAnimationToggle.addEventListener('click', () => {
                this.toggleAnimations();
                // 写入本地配置
                localStorage.setItem('settingsAnimation', settingsAnimationToggle.checked);
            });
        }
    }


    navigateToPage(pageId) {
        // 移除所有活动状态
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
        });
        
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // 添加新的活动状态
        const activeNavLink = document.querySelector(`[data-page="${pageId}"]`);
        const activePage = document.getElementById(`page-${pageId}`);
        
        if (activeNavLink && activePage) {
            activeNavLink.classList.add('active');
            activeNavLink.setAttribute('aria-current', 'page');
            activePage.classList.add('active');
            this.currentPage = pageId;
        }
    }

    toggleAnimations() {
        this.animationsEnabled = !this.animationsEnabled;
        
        // 更新UI状态
        const toggles = document.querySelectorAll('#animation-toggle, #settings-animation-toggle');
        toggles.forEach(toggle => {
            if (this.animationsEnabled) {
                toggle.classList.add('active');
                toggle.setAttribute('aria-checked', 'true');
            } else {
                toggle.classList.remove('active');
                toggle.setAttribute('aria-checked', 'false');
            }
        });

        // 应用动画状态
        if (this.animationsEnabled) {
            document.body.classList.add('animations-enabled');
        } else {
            document.body.classList.remove('animations-enabled');
        }

        // 保存设置
        this.saveSettings();
        this.updateAnimationPreference();
    }

    updateUserProfile(userData) {
        try {
            // 更新邮箱信息（如果页面有显示的话）
            const emailElements = document.querySelectorAll('#user-email, .user-email');
            emailElements.forEach(el => {
                el.textContent = userData.email || '未设置邮箱';
            });

            // 更新用户UUID（用于调试或显示）
            const uuidElements = document.querySelectorAll('#user-uuid, .user-uuid');
            uuidElements.forEach(el => {
                el.textContent = userData.UUID || '未知';
            });

            // 更新注册时间
            const regTimeElements = document.querySelectorAll('#registration-time, .registration-time');
            regTimeElements.forEach(el => {
                el.textContent = userData.time || '未知';
            });

            // 更新最后登录时间
            const lastLoginElements = document.querySelectorAll('#last-login-time, .last-login-time');
            lastLoginElements.forEach(el => {
                el.textContent = userData.last_login || '未知';
            });

            // 更新会员到期时间
            const expiryElements = document.querySelectorAll('#expiry-time, .expiry-time');
            expiryElements.forEach(el => {
                el.textContent = userData.expiry_time || '未知';
            });

            // 更新主页用户信息
            const homeUserName = document.getElementById('home-user-name');
            if (homeUserName) {
                homeUserName.textContent = userData.name || '未知用户';
            }

            const homeUserAvatar = document.getElementById('home-user-avatar');
            if (homeUserAvatar && userData.avatar) {
                homeUserAvatar.src = userData.avatar;
            }

            // 检查会员状态
            const memberStatus = document.getElementById('home-member-status');
            if (memberStatus) {
                const expiryDate = new Date(userData.expiry_time);
                const now = new Date();
                if (expiryDate > now) {
                    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                    memberStatus.textContent = `会员有效 (剩余${daysLeft}天)`;
                    memberStatus.style.color = '#10B981'; // 绿色
                } else {
                    memberStatus.textContent = '会员已过期';
                    memberStatus.style.color = '#EF4444'; // 红色
                }
            }

            // 更新欢迎文本
            const welcomeText = document.getElementById('user-welcome-text');
            if (welcomeText) {
                welcomeText.textContent = `欢迎回来，${userData.name || '用户'}！`;
            }

            // 保存完整用户数据到本地存储
            localStorage.setItem('userData', JSON.stringify(userData));

            console.log('[INFO] 用户资料已全面更新');
        } catch (error) {
            console.error('[ERROR] 更新用户资料时出错:', error);
        }
    }
    toggleGlassEffect() {
        const body = document.body;
        const toggle = document.getElementById('glass-effect-toggle');
        
        body.classList.toggle('no-backdrop-filter');
        
        if (body.classList.contains('no-backdrop-filter')) {
            toggle.classList.remove('active');
            toggle.setAttribute('aria-checked', 'false');
        } else {
            toggle.classList.add('active');
            toggle.setAttribute('aria-checked', 'true');
        }
        
        this.saveSettings();
    }

    selectAvatar() {
        const input = document.getElementById('avatar-input');
        input.click();
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imageUrl = event.target.result;
                    this.updateAvatar(imageUrl);
                };
                reader.readAsDataURL(file);
            }
        };
    }

    updateAvatar(imageUrl) {
        const avatars = document.querySelectorAll('#user-avatar, #profile-avatar-preview');
        avatars.forEach(avatar => {
            avatar.src = imageUrl;
        });
        
        // 保存到localStorage
        localStorage.setItem('userAvatar', imageUrl);
    }

    resetAvatar() {
        const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='24' fill='%23667eea'/%3E%3Ctext x='24' y='32' text-anchor='middle' fill='white' font-size='20' font-family='sans-serif'%3E用%3C/text%3E%3C/svg%3E";
        this.updateAvatar(defaultAvatar);
    }

    changeNickname() {
        const currentNickname = localStorage.getItem('userNickname') || '用户昵称';
        const newNickname = prompt('请输入新的昵称：', currentNickname);
        
        if (newNickname && newNickname.trim() !== '') {
            const nickname = newNickname.trim();
            localStorage.setItem('userNickname', nickname);
            
            // 更新显示
            const nicknameElements = document.querySelectorAll('#user-nickname, #current-nickname');
            nicknameElements.forEach(el => {
                el.textContent = nickname;
            });
        }
    }

    checkBackdropFilterSupport() {
        const testDiv = document.createElement('div');
        testDiv.style.backdropFilter = 'blur(1px)';
        
        if (!testDiv.style.backdropFilter) {
            document.body.classList.add('no-backdrop-filter');
        }
    }

    initPageStats() {
        const stats = JSON.parse(localStorage.getItem('pageStats') || '{}');
        const pages = ['home', 'features', 'settings', 'about', 'profile'];
        
        pages.forEach(page => {
            if (!stats[page]) {
                stats[page] = 0;
            }
        });
        
        localStorage.setItem('pageStats', JSON.stringify(stats));
    }

    trackPageVisit(pageId) {
        const stats = JSON.parse(localStorage.getItem('pageStats') || '{}');
        stats[pageId] = (stats[pageId] || 0) + 1;
        localStorage.setItem('pageStats', JSON.stringify(stats));
    }

    updateVisitTime() {
        const now = new Date().toLocaleString('zh-CN');
        const firstVisit = localStorage.getItem('firstVisit');
        
        if (!firstVisit) {
            localStorage.setItem('firstVisit', now);
        }
        
        localStorage.setItem('lastVisit', now);
        
        // 更新显示
        setTimeout(() => {
            const firstVisitEl = document.getElementById('first-visit-time');
            const lastVisitEl = document.getElementById('last-visit-time');
            
            if (firstVisitEl) {
                firstVisitEl.textContent = localStorage.getItem('firstVisit') || '未知';
            }
            if (lastVisitEl) {
                lastVisitEl.textContent = localStorage.getItem('lastVisit') || '未知';
            }
        }, 100);
    }

    updateAnimationPreference() {
        const preferenceEl = document.getElementById('animation-preference');
        if (preferenceEl) {
            preferenceEl.textContent = this.animationsEnabled ? '已启用页面切换动画' : '已禁用页面切换动画';
        }
    }

    saveSettings() {
        const settings = {
            animationsEnabled: this.animationsEnabled,
            glassEffectEnabled: !document.body.classList.contains('no-backdrop-filter'),
            currentPage: this.currentPage
        };
        
        localStorage.setItem('appSettings', JSON.stringify(settings));
    }

    loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
            
            // 加载动画设置
            if (settings.hasOwnProperty('animationsEnabled')) {
                this.animationsEnabled = settings.animationsEnabled;
                this.toggleAnimations();
                this.toggleAnimations(); // 调用两次来正确设置状态
            }
            
            // 加载玻璃效果设置
            if (settings.hasOwnProperty('glassEffectEnabled') && !settings.glassEffectEnabled) {
                document.body.classList.add('no-backdrop-filter');
                const glassToggle = document.getElementById('glass-effect-toggle');
                if (glassToggle) {
                    glassToggle.classList.remove('active');
                    glassToggle.setAttribute('aria-checked', 'false');
                }
            }
            
            // 加载用户头像
            const savedAvatar = localStorage.getItem('userAvatar');
            if (savedAvatar) {
                this.updateAvatar(savedAvatar);
            }
            
            // 加载用户昵称
            const savedNickname = localStorage.getItem('userNickname');
            if (savedNickname) {
                const nicknameElements = document.querySelectorAll('#user-nickname, #current-nickname');
                nicknameElements.forEach(el => {
                    el.textContent = savedNickname;
                });
            }
            
        } catch (error) {
            logToFile('warn', '加载设置失败: ' + error.message); // 修改为日志函数
        }
    }
}

// 全局函数，供按钮调用
let app;

function selectAvatar() {
    if (app) app.selectAvatar();
}

function resetAvatar() {
    if (app) app.resetAvatar();
}

function changeNickname() {
    if (app) app.changeNickname();
}

function testMinimize() {
    if (typeof window.electronAPI !== 'undefined') {
        window.electronAPI.windowControl('minimize');
    } else {
        alert('最小化功能需要在Electron环境中使用');
    }
}

function testFullscreen() {
    if (typeof window.electronAPI !== 'undefined') {
        window.electronAPI.windowControl('fullscreen');
    } else {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen();
        }
    }
}

function showWindowInfo() {
    const info = `
窗口控制功能说明：

✓ 拖拽标题栏：移动窗口位置
✓ 最小化：隐藏窗口到任务栏  
✓ 最大化/还原：切换窗口大小
✓ 全屏模式：进入/退出全屏显示
✓ 关闭应用：安全退出程序
✓ 调整大小：拖拽窗口边缘

当前状态：${typeof window.electronAPI !== 'undefined' ? 'Electron环境' : '浏览器环境'}
窗口模式：${document.fullscreenElement ? '全屏模式' : '窗口模式'}
    `.trim();
    
    alert(info);
}

function showPageStats() {
    const stats = JSON.parse(localStorage.getItem('pageStats') || '{}');
    const pageNames = {
        'home': '主页',
        'features': '功能',
        'settings': '设置',
        'about': '关于',
        'profile': '我的'
    };
    
    let statsText = '页面访问统计：\n\n';
    Object.entries(stats).forEach(([page, count]) => {
        statsText += `${pageNames[page] || page}: ${count} 次\n`;
    });
    
    alert(statsText);
}

function exportSettings() {
    const settings = {
        appSettings: JSON.parse(localStorage.getItem('appSettings') || '{}'), // APP 设置
        userNickname: localStorage.getItem('userNickname'), // 用户昵称
        userAvatar: localStorage.getItem('userAvatar'), // 用户头像
        pageStats: JSON.parse(localStorage.getItem('pageStats') || '{}'), // 页面访问统计
        firstVisit: localStorage.getItem('firstVisit'), // 首次访问时间
        lastVisit: localStorage.getItem('lastVisit'), // 最后访问时间
        audioGainConfig: localStorage.getItem('audioGainConfig') // 音频增益配置
    };
    
    const dataStr = JSON.stringify(settings, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `glass-app-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function importSettings() {
    const input = document.getElementById('settings-input');
    input.click();
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const settings = JSON.parse(event.target.result);
                    
                    // 导入各项设置
                    if (settings.appSettings) {
                        localStorage.setItem('appSettings', JSON.stringify(settings.appSettings));
                    }
                    if (settings.userNickname) {
                        localStorage.setItem('userNickname', settings.userNickname);
                    }
                    if (settings.userAvatar) {
                        localStorage.setItem('userAvatar', settings.userAvatar);
                    }
                    if (settings.pageStats) {
                        localStorage.setItem('pageStats', JSON.stringify(settings.pageStats));
                    }
                    if (settings.firstVisit) {
                        localStorage.setItem('firstVisit', settings.firstVisit);
                    }
                    if (settings.lastVisit) {
                        localStorage.setItem('lastVisit', settings.lastVisit);
                    }
                    
                    alert('设置导入成功！页面将刷新以应用新设置。');
                    location.reload();
                } catch (error) {
                    alert('设置文件格式错误，导入失败！');
                }
            };
            reader.readAsText(file);
        }
    };
}

function resetAllSettings() {
    if (confirm('确定要重置所有设置吗？这将清除所有个人数据和偏好设置。')) {
        localStorage.clear();
        alert('所有设置已重置！页面将刷新。');
        location.reload();
    }
}

// 重写console以拦截所有日志（放在代码顶部执行）
const originalConsole = console;
console = {
  log: (...args) => {
    logToFile('info', ...args);
    originalConsole.log(...args); // 可选保留原输出，生产时可移除
  },
  warn: (...args) => {
    logToFile('warn', ...args);
    originalConsole.warn(...args);
  },
  error: (...args) => {
    logToFile('error', ...args);
    originalConsole.error(...args);
  }
};

// ---------- 音频部分代码（已替换console为logToFile） ----------
document.addEventListener("DOMContentLoaded", function () {
    const toggle = document.getElementById("gain-toggle");
    const inputSelect = document.getElementById("input-device");
    const outputSelect = document.getElementById("output-device");
    const gainSlider = document.getElementById("gain-slider");
    const gainValueDisplay = document.getElementById("gain-value-display");
    const saveButton = document.getElementById("save-settings");

    // ---------- 初始配置 ----------
    let config = {
        state: false,
        gain: 2.0,
        input: null,   // 使用索引
        output: null   // 使用索引
    };

    // ---------- 从 localStorage 加载配置 ----------
    function loadLocalConfig() {
        const saved = localStorage.getItem("audioGainConfig");
        if (saved) {
            config = JSON.parse(saved);
            logToFile('info', "加载本地配置：", config); // 修改
        }
    }

    // ---------- 保存配置到 localStorage ----------
    function saveLocalConfig() {
        localStorage.setItem("audioGainConfig", JSON.stringify(config));
    }

    // ---------- 同步配置到后端 ----------
    async function syncToServer() {
        try {
            const res = await fetch("http://127.0.0.1:8124/Settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config)
            });

            const data = await res.json();
            if (data.code !== 200) {
                logToFile('warn', "同步失败:", data.message || "未知错误"); // 修改
            } else {
                logToFile('info', "同步成功:", data.current); // 修改
            }
        } catch (error) {
            logToFile('error', "请求失败:", error); // 修改
        }
    }

    // ---------- 初始化设备列表 ----------
    async function loadDevices() {
        try {
            const res = await fetch("http://127.0.0.1:8124/Settings");
            const data = await res.json();

            logToFile('info', "后端返回原始设备数据：", data); // 修改

            if (data.code !== 200) {
                alert("获取设备列表失败: " + (data.message || "未知错误"));
                inputSelect.innerHTML = `<option value="">系统默认（无数据）</option>`;
                outputSelect.innerHTML = `<option value="">系统默认（无数据）</option>`;
                return;
            }

            function normalizeList(list) {
                if (!Array.isArray(list)) return [];
                if (list.length === 0) return [];
                if (typeof list[0] === "object" && list[0] !== null && ('index' in list[0] || 'name' in list[0])) {
                    return list.map((dev, i) => ({ index: (typeof dev.index === 'number' ? dev.index : i), name: String(dev.name || dev.label || `设备 ${i}`) }));
                }
                if (typeof list[0] === "string") {
                    return list.map((name, i) => ({ index: i, name: String(name) }));
                }
                return [];
            }

            const inputList = normalizeList(data.input || []);
            const outputList = normalizeList(data.output || []);

            // 渲染下拉列表
            inputSelect.innerHTML = inputList.length > 0
                ? inputList.map(dev => `<option value="${dev.index}">${dev.name}</option>`).join('')
                : `<option value="">系统默认</option>`;

            outputSelect.innerHTML = outputList.length > 0
                ? outputList.map(dev => `<option value="${dev.index}">${dev.name}</option>`).join('')
                : `<option value="">系统默认</option>`;

            // 默认选择第一个（如果本地没有缓存）
            if (config.input === null || config.input === undefined || config.input === "") {
                config.input = inputList.length > 0 ? inputList[0].index : "";
            }
            if (config.output === null || config.output === undefined || config.output === "") {
                config.output = outputList.length > 0 ? outputList[0].index : "";
            }

        } catch (error) {
            logToFile('error', "请求 /Settings 失败：", error); // 修改
            alert("请求失败: " + error);
            if (!inputSelect.innerHTML) inputSelect.innerHTML = `<option value="">系统默认（请求失败）</option>`;
            if (!outputSelect.innerHTML) outputSelect.innerHTML = `<option value="">系统默认（请求失败）</option>`;
        }
    }

    // ---------- 初始化界面 ----------
    function initUI() {
        // 设置开关状态
        toggle.classList.toggle("active", config.state);
        toggle.setAttribute("aria-checked", config.state);

        // 设置增益值c
        gainSlider.value = config.gain;
        updateSliderUI();

        // 设置选择框
        inputSelect.value = String(config.input);
        outputSelect.value = String(config.output);
    }

    // ---------- 更新滑块进度条和数值 ----------
    function updateSliderUI() {
        const value = parseFloat(gainSlider.value);
        gainValueDisplay.textContent = `${value.toFixed(1)}x`;

        const percentage = ((value - parseFloat(gainSlider.min)) / (parseFloat(gainSlider.max) - parseFloat(gainSlider.min))) * 100;
        gainSlider.style.background = `linear-gradient(to right, var(--primary-color) 0%, var(--primary-color) ${percentage}%, rgba(255,255,255,0.1) ${percentage}%, rgba(255,255,255,0.1) 100%)`;
    }

    // ---------- 事件绑定 ----------
    // 开关切换
    toggle.addEventListener("click", function () {
        config.state = !config.state;
        toggle.classList.toggle("active", config.state);
        toggle.setAttribute("aria-checked", config.state);
        saveLocalConfig();
    });

    // 滑块拖动
    gainSlider.addEventListener("input", function () {
        updateSliderUI();
        config.gain = parseFloat(gainSlider.value);
        saveLocalConfig();
    });

    // 输入设备切换
    inputSelect.addEventListener("change", function () {
        config.input = parseInt(inputSelect.value);
        saveLocalConfig();
    });

    // 输出设备切换
    outputSelect.addEventListener("change", function () {
        config.output = parseInt(outputSelect.value);
        saveLocalConfig();
    });

    // ---------- 下拉框获得焦点时刷新设备列表 ----------
    inputSelect.addEventListener("focus", async function () {
        await loadDevices();
        inputSelect.value = config.input; // 保留当前选中
    });

    outputSelect.addEventListener("focus", async function () {
        await loadDevices();
        outputSelect.value = config.output; // 保留当前选中
    });

    // 保存按钮点击
    saveButton.addEventListener("click", function () {
        saveLocalConfig();
        syncToServer();
        alert("设置已保存并同步到后端！");
    });

    // ---------- 初始化流程 ----------
    loadLocalConfig();
    loadDevices().then(initUI);
});

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
    app = new GlassApp();
});