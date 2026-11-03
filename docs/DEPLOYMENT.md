# 部署与 API

## GitHub Pages 展示

仓库使用 `.github/workflows/pages.yml` 构建前端，并通过 GitHub Pages 发布。仓库 Settings → Pages 的 Source 应设为 GitHub Actions。推送 `main` 或手动执行工作流会生成部署。

Pages 只提供静态网页，不运行 Flask、PyTorch 或 YOLO。在线版可以体验原创标本的固定标注、阈值筛选、本地记录及导出；用户图片只在浏览器预览，真实检测须在本地启动完整服务。

## 本地完整运行

分别运行 `npm run dev` 和 `python -m server.app`。Vite 开发代理将 `/api/*` 转到 `127.0.0.1:5050`。默认前后端均只绑定环回地址，无需数据库、云密钥或外部图片存储。

若部署在自己的服务器，构建前设置 `VITE_ENABLE_API=true`，并用同源反向代理将 `/api` 转发到正式 WSGI 服务（例如 Linux 上的 Gunicorn）。Vite preview 不包含后端代理，不能代替完整部署。Flask 内置服务器仅供本地开发；公开服务还需要身份认证、请求速率/并发限制、传输加密和符合 AGPL 的源码获取入口。

## API

`GET /api/health`

```json
{"service":"fieldlens","ready":false,"model":null}
```

`ready` 表示已配置的本地模型文件存在，不表示权重兼容性或推理精度已验证。首次真实请求时加载 Ultralytics 和模型。

`POST /api/detect`，`multipart/form-data`：

| 参数 | 类型 | 约束 |
| --- | --- | --- |
| `image` | 文件 | JPEG / PNG / WebP；≤ 10 MB，≤ 2500 万像素 |
| `confidence` | 字符串数字 | 0.10–0.99，默认 0.5；拒绝 NaN 和无穷大 |

```json
{
  "detections": [
    {"label": "model-class-name", "confidence": 0.9, "box": [0.1, 0.2, 0.8, 0.9]}
  ],
  "model": "crop-detect.pt",
  "elapsed_ms": 120,
  "width": 1200,
  "height": 800
}
```

以上为接口格式示例，并非性能测试结果。`box` 为图片纠正 EXIF 方向后的归一化 `[x1, y1, x2, y2]`。标签来自权重的类别映射，最多返回 300 个目标。零个目标仍为成功响应，不能据此断定作物健康。

400：参数或图像内容无效；413：体积/像素超限；415：不支持的图像格式；503：未配置模型或未安装 YOLO；500：推理失败。所有错误返回 `{"error":"说明"}`，不向客户端暴露绝对路径或异常堆栈。

## 模型与数据

`FIELDLENS_MODEL` 必须指向可信、经授权且存在的本地文件；客户端不能指定文件系统路径。只支持目标检测模型，暂不处理分类、分割、姿态或旋转框模型。模型在首次推理时加载，单进程内串行调用；更换权重后重启服务。

不自动下载权重，不提供默认病害模型，不声称训练指标。对实际部署，应使用独立验证集评估识别类别、漏检/误检和跨环境表现。

## 可选 AI 平台

v1.3 保留 `/api/detect`，新增 `/api/assistant/status` 与 `/api/assistant`，接入兼容 Chat Completions 的文字平台。服务端配置 `FIELDLENS_AI_BASE_URL`、`FIELDLENS_AI_MODEL`、`FIELDLENS_AI_API_KEY`，详见 [平台接入与发送范围](AI_PLATFORM.md)。密钥不得放入 Vite 环境变量或静态站点。
