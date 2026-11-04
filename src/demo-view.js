export function renderDemoCenter(
  main,
  { active, available, count, enter, reset, share },
) {
  main.innerHTML = `<section class="page-heading"><div><h1>在线演示</h1><p>用一组巡检案例，走完检测、复核与展示流程。</p></div><button class="button outlined" id="demo-share">复制演示链接</button></section>
  <section class="panel demo-intro"><div class="demo-intro-copy"><span class="demo-eyebrow">FIELDLENS / 交互体验</span><h2>从一张叶片，<br>到一份巡检记录。</h2><p>无需注册或安装。预置一周巡检案例，打开后就能练习筛选、复核、复查安排和报告导出。</p><div class="demo-intro-actions"><button class="button primary" data-demo-go="workspace" ${!available ? "disabled" : ""}>${active ? "体验图像检测" : "开始演示"}</button><button class="button outlined" data-demo-go="dashboard" ${!available ? "disabled" : ""}>直接看大屏</button></div><p class="demo-provenance">原创合成插画与预设标注，仅演示操作流程，不进行真实模型识别。</p></div><figure><img src="./specimen.svg" alt="用于交互演示的原创叶片插画"/><figcaption>演示样本 · 非田间照片</figcaption></figure></section>
  <div class="demo-overview"><span><strong>${active ? count : 12}</strong>${active ? "当前演示记录" : "预置巡检记录"}</span><span><strong>3</strong>初始示意地块</span><span><strong>7</strong>天初始案例</span><span><strong>免登录</strong>无需安装</span></div>
  ${!available ? '<p class="demo-boundary">当前为本地服务模式。完整演示请打开 <a href="https://guhang2011.github.io/fieldlens/?demo=1#demo" target="_blank" rel="noopener">公开在线演示 ↗</a>，账号和模型功能继续使用本地工作台。</p>' : ""}
  <section class="demo-steps" aria-label="体验顺序"><article class="panel"><span class="step-index">01</span><h2>检测一张图片</h2><p>查看预设区域，调节置信度、缩放图片，填写样本信息并保存。</p><button class="text-button" data-demo-go="workspace" ${!available ? "disabled" : ""}>进入检测工作台 →</button></article><article class="panel"><span class="step-index">02</span><h2>复核与生成报告</h2><p>筛选待办、记录区域意见，比较两次记录，再生成可打印的巡检报告。</p><button class="text-button" data-demo-go="history" ${!available ? "disabled" : ""}>查看巡检案例 →</button></article><article class="panel"><span class="step-index">03</span><h2>展示巡检概况</h2><p>查看趋势、类别和地块分布，切换视距，体验全屏与双屏轮播。</p><button class="text-button" data-demo-go="dashboard" ${!available ? "disabled" : ""}>打开数据大屏 →</button></article></section>
  <section class="panel demo-notes"><div><h2>可以放心试用</h2><p>演示记录保存在独立空间，重置只替换演示案例。换肤、拍照预览和导出都可体验；自己的照片需要接入模型服务才能识别，AI 接口的配置说明仍保留。</p></div>${active ? '<button class="button outlined" id="demo-reset">重置演示数据</button>' : '<a class="button outlined" href="#guide">查看模型与 AI 接入</a>'}</section>`;
  main
    .querySelectorAll("[data-demo-go]")
    .forEach((button) => (button.onclick = () => enter(button.dataset.demoGo)));
  main.querySelector("#demo-reset")?.addEventListener("click", reset);
  main.querySelector("#demo-share").onclick = share;
}
