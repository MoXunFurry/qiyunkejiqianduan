(function () {
  // ======= 注入样式 =======
  const styleContent = `
  #connection-stack {
    position: fixed;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 9999;
    pointer-events: none; /* 不阻挡点击 */
  }
  .connection-status {
    background: rgba(255,255,255,0.1);
    backdrop-filter: blur(20px) saturate(120%);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 12px;
    padding: 8px 16px;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-20px);
    transition: all 0.3s ease;
    max-width: 300px;
    pointer-events: auto;
  }
  .connection-status.show {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
  .connection-status.绿色 { border-color: rgba(16, 185, 129, 0.3); background: rgba(16, 185, 129, 0.1); color: #10B981; }
  .connection-status.黄色 { border-color: rgba(245, 158, 11, 0.3); background: rgba(245, 158, 11, 0.1); color: #F59E0B; }
  .connection-status.红色 { border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.1); color: #EF4444; }
  .connection-status i { margin-right: 6px; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  `;
  const style = document.createElement("style");
  style.textContent = styleContent;
  document.head.appendChild(style);

  // ======= 创建堆叠容器 =======
  let stack = document.getElementById("connection-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "connection-stack";
    document.body.appendChild(stack);
  }

  // ======= 中文提示弹窗函数，支持位置 =======
  /**
   * @param {string} message 提示内容
   * @param {string} color 绿色/黄色/红色
   * @param {number} duration 显示时间，毫秒
   * @param {string} position 弹窗位置: 左上/中上/右上/左中/中/右中/左下/中下/右下
   */
  window.提示弹窗 = function (message, color = "绿色", duration = 5000, position = "中上") {
    // ===== 设置位置 =====
    const posMap = {
      "左上": { top: "20px", left: "20px", right: "auto", bottom: "auto", align: "flex-start" },
      "中上": { top: "20px", left: "50%", transform: "translateX(-50%)", right: "auto", bottom: "auto", align: "center" },
      "右上": { top: "20px", right: "20px", left: "auto", bottom: "auto", align: "flex-end" },
      "左中": { top: "50%", left: "20px", bottom: "auto", right: "auto", transform: "translateY(-50%)", align: "flex-start" },
      "中": { top: "50%", left: "50%", bottom: "auto", right: "auto", transform: "translate(-50%, -50%)", align: "center" },
      "右中": { top: "50%", right: "20px", bottom: "auto", left: "auto", transform: "translateY(-50%)", align: "flex-end" },
      "左下": { bottom: "20px", left: "20px", top: "auto", right: "auto", align: "flex-start" },
      "中下": { bottom: "20px", left: "50%", top: "auto", right: "auto", transform: "translateX(-50%)", align: "center" },
      "右下": { bottom: "20px", right: "20px", top: "auto", left: "auto", align: "flex-end" },
    };
    const pos = posMap[position] || posMap["中上"];

    stack.style.top = pos.top || "auto";
    stack.style.bottom = pos.bottom || "auto";
    stack.style.left = pos.left || "auto";
    stack.style.right = pos.right || "auto";
    stack.style.transform = pos.transform || "";
    stack.style.alignItems = pos.align;

    // ===== 创建弹窗 =====
    const notif = document.createElement("div");
    notif.className = "connection-status " + color;

    const icon = document.createElement("i");
    icon.className =
      color === "绿色"
        ? "fas fa-check-circle"
        : color === "黄色"
        ? "fas fa-spinner fa-spin"
        : "fas fa-exclamation-triangle";

    const text = document.createElement("span");
    text.textContent = message;

    notif.appendChild(icon);
    notif.appendChild(text);

    stack.insertBefore(notif, stack.firstChild);
    requestAnimationFrame(() => notif.classList.add("show"));

    if (stack.children.length > 5) stack.removeChild(stack.lastChild);

    setTimeout(() => {
      notif.classList.remove("show");
      setTimeout(() => {
        if (notif.parentNode) notif.parentNode.removeChild(notif);
      }, 300);
    }, duration);
  };
})();
// 示例用法
// 提示弹窗('这是一个绿色提示', '绿色', 4000, '右下');
// 提示弹窗('这是一个黄色警告', '黄色', 6000, '中');
// 提示弹窗('这是一个红色错误', '红色', 8000, '左上');