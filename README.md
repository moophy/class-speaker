# 班级小喇叭

老师在网页上发一条通知，教室电视立刻弹大字并朗读出来。

- **教师端**：网页，手机上打开就能用 —— <https://moophy.github.io/class-speaker/>
- **教室大屏 / 学生端**：电脑上的独立小软件（免安装）—— <https://moophy.github.io/class-speaker/desktop.html>

## 教师端（网页）

打开 <https://moophy.github.io/class-speaker/>，**输入姓名就能进**，不需要密码、不用扫码。

进去以后：

1. 第一次用，在「班级」页新建一个班级，系统会给你一个 **6 位绑定码**，并自动建好「放学提醒」「眼保健操」两个定时任务。
2. 把绑定码填到教室大屏、学生端，它们就跟着这个班走，不用登录。
3. 其他老师想一起用，把绑定码给他，他输入后就是同一个班，可以同时发通知。

能做的事：打字 / 说话 / 对讲（按住说话，教室立刻响）、传图片、定时通知（每周一至五、每天、自选星期）、点名、随机抽人、倒计时、看班级有没有收到。

收到确认不用学生手机：通知挂在教室大屏上，学生在屏幕上点一下「收到了」，老师端的记录里就显示「班级已收到」。

## 教室大屏 / 学生端（桌面软件）

1. 打开 <https://moophy.github.io/class-speaker/desktop.html>，点「下载桌面版」，得到 zip，解压到任意文件夹。
2. 进入 `desktop` 文件夹：
   - 大屏：双击 `start-screen.vbs`
   - 学生端：双击 `start-student.vbs`
   - 没反应就改用同名的 `.bat`（会用系统默认浏览器打开）
3. 第一次打开会让你输入 6 位绑定码，之后自动记住。

大屏启动后是无地址栏的全屏窗口，跟普通软件一样。需要电脑上有 Microsoft Edge（Win10/11 自带）或 Chrome。

## 网页版也能直接用

大屏、学生、点名三个页面在网页上同样可以打开（`screen.html`、`student.html`、`rollcall.html`），输入绑定码即可，适合临时用别人的电脑。

## 目录说明

```
index.html          教师端
screen.html         教室大屏
student.html        收到页（班级共用一台设备）
rollcall.html       点名 / 倒计时
desktop.html        桌面版下载与说明
cloud-bridge.html   云端请求桥（见下）
css/ js/            样式与脚本
desktop/            桌面版文件（本地双击运行）
```

## 关于 cloud-bridge.html

这个项目的数据存在 WorkBuddy 云数据库里。云端网关只允许「应用自身域名」和本地来源访问，GitHub Pages 这样的第三方域名会被 CORS 拦截。

`js/bridge.js` + `cloud-bridge.html` 解决了这个问题：页面用一个 `sandbox="allow-scripts"` 的 iframe（其 `window.origin` 为 `null`）代为发起请求，网关对 `null` 来源是放行的，于是 GitHub Pages 上的页面也能正常读写云端。

在应用自身域名、`localhost` 或本地 `file://` 下运行时，桥会自动关闭，走直连。
