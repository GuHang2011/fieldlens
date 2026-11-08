# 接入通用 AI 平台

禾镜使用兼容 OpenAI Chat Completions 的文字接口。可配置 DeepSeek 等平台，也可连接本机提供兼容接口的服务。YOLO 检测接口独立保留；不配置 AI 时，检测、复核、报告与备份照常使用。

## 本地配置

先安装基础后端依赖，不使用 YOLO 时无需安装 PyTorch：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r server/requirements.txt
$env:FIELDLENS_AI_BASE_URL = 'https://api.deepseek.com/v1'
$env:FIELDLENS_AI_MODEL = 'deepseek-chat'
$secret = Read-Host '输入平台 API Key' -AsSecureString
$env:FIELDLENS_AI_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
.\.venv\Scripts\python.exe -m server.app
```

以上为兼容配置示例，模型 ID、权限和计费以平台当前提供的服务为准。其他平台替换 API 基础地址、模型 ID 与对应密钥；基础地址不包含 `/chat/completions`。程序在其后追加该路径。远程平台必须使用 HTTPS；HTTP 仅允许 `localhost`、`127.0.0.1` 或 `::1`，本机接口可不配置密钥。

另开终端执行 `npm ci` 和 `npm run dev`。接入 YOLO 时在启动 Python 服务前同时设置 `FIELDLENS_MODEL`，详见 [部署文档](DEPLOYMENT.md)。

macOS / Linux 可使用 `export FIELDLENS_AI_BASE_URL=...`、`export FIELDLENS_AI_MODEL=...`，通过终端或部署环境的秘密配置注入 `FIELDLENS_AI_API_KEY`，再运行 `python -m server.app`。配置仅从进程环境变量读取，程序不会自动加载 `.env`。

## 使用步骤

1. 进入「复核助手 → 平台 AI」，选择一条已保存记录。也可在检测记录详情切换到「AI 辅助」标签，辅助复核面板自动展开。
2. 点击「检查 AI 配置」。显示已配置仅表示本地配置齐全，首次发送才会验证平台调用。
3. 选择“复核要点”或“巡检摘要”，也可填写自己的问题。
4. 展开「发送内容预览」。需要使用刚修改的表单内容时，点击「重新读取当前填写内容」。
5. 点击「发送预览内容」。回答以普通文字显示，可导出 TXT，附带来源、时间、问题及发送快照。

AI 不会自动改变检测框、人工意见或复查状态。回答暂存在当前助手页或详情弹窗，离页、关闭、更换记录或重新读取后清除；需要保留请先导出。切换助手页的能力标签会保留当前回答。每次平台请求独立回答，不携带前次问答。取消仅停止浏览器等待，已经发出的平台请求可能仍会完成并计费。

## 发送哪些数据

用户点击发送后，经同源 Flask 服务转发到配置的平台。发送来源标识、检测模型名、阈值、作物名、类别/置信度/坐标、逐区域人工意见、整图备注和问题。不自动发送图片、文件名、样本编号、地块、批次或采集时间。备注和问题由用户填写，发送前应核对预览。

密钥只用于服务端 Authorization 请求头，不返回浏览器，不写入记录、备份、前端构建或日志。不要设置为 `VITE_` 开头的环境变量。项目不会读取参考系统的旧密钥，也不提供公共共享密钥。

GitHub Pages 可使用内置操作说明、本地复核清单和巡检概览，这些功能不调用语言模型，界面明确标注来源；平台 AI 入口保留发送预览和接入文档，不会请求真实 AI 平台。自部署时设置 `VITE_ENABLE_API=true` 并配置同源 `/api` 代理；公开部署还应配置身份认证、访问控制和费用限制，见 [部署文档](DEPLOYMENT.md)。

## 接口及限制

- `GET /api/assistant/status`：返回 `configured`、平台主机名和模型 ID，不返回密钥。
- `POST /api/assistant`：JSON `{context, question}`，使用页面发送预览所示结构。只允许已定义的上下文字段；客户端无法指定平台地址、密钥或系统提示词。
- 问题最多 500 字符、备注 1000 字符、区域说明 300 字符、检测区域 300 个、请求 128 KiB。单进程一次处理一个 AI 请求。
- 上游请求 30 秒超时，不跟随重定向；输出大小和格式会检查。返回 400/413/415 表示输入无效，429 表示忙碌或平台额度/限流，503 表示未配置，502/504 表示平台错误或网络问题。错误不会原样暴露平台响应。

本次用模拟平台验证了请求格式、上下文、鉴权/限流错误及取消流程，未使用真实付费密钥调用，也未评估任何平台的农业诊断准确性。文字模型没有看到原图，回答只能作为记录整理与复核参考。


独立助手页使用已保存的记录快照；其他标签页更新记录时会提示重新读取，当前问题和回答不会被自动替换。点击左侧「重新读取记录」会取消等待、清除当前结果并载入最新已保存内容。原详情页仍可预览并发送尚未保存的表单内容。
