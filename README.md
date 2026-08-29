# pi-theme-skyline

一个柔和蓝色系的 pi 主题包：**skyline 配色 + 外观 extension**。

![skyline 主题](./screenshots/skyline.png)

## 配色

柔和、低饱和的暗色蓝系。

| 元素 | 颜色 |
|------|------|
| 主色 / 边框 | `#5bc0eb` 天空蓝 |
| 强调（亮色） | `#8bd7f7` 亮蓝 |
| 错误 | `#e05959` 红 |
| 成功 | `#98c379` 绿 |
| 警告 | `#e5c07b` 黄 |

## 外观

安装后自动启用：

- **Header**：彩色 π logo 动画 + 版本号 + 每日鸡汤（内置语句池 + 一言接口兜底）+ 模型 / thinking 级别 + 资源统计
- **编辑器**：清爽的蓝色边框
- **Footer**：三行 —— git 详情 / token 统计 / 上下文进度条 + 实时时钟

## 安装

```bash
pi install git:github.com/se1zer/pi-theme-skyline
```

## 启用

主题会在进入 pi 交互会话时**自动应用**：扩展把 `~/.pi/agent/settings.json` 的 `theme` 设为 `"skyline"` 并立即切换，无需手动选择。

> 由于扩展每次启动都会确保使用 skyline 主题，如果你想换回其他主题，需要卸载本插件；`/settings` 里的临时切换会在下次进入会话时被切回。

## License

本项目采用 [MIT](./LICENSE) 许可证，可自由使用、修改和分发。
