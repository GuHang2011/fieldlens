import { bindThemeControls, themeControl } from "./appearance.js";

export function renderHome(main, { apiEnabled, enterDemo }) {
  const open = (view, label, className = "home-link") =>
    `<a class="${className}" href="#${view}" ${!apiEnabled ? `data-home-demo="${view}"` : ""}>${label}</a>`;
  main.innerHTML = `<div class="home-page">
    <a class="home-skip" href="#home" id="home-skip">跳到首页内容</a>
    <header class="home-header"><div class="home-nav">
      <a class="home-brand" href="#home" aria-label="禾镜首页"><img src="./favicon.svg" alt="" width="26" height="26"/><strong>禾镜</strong><span>FieldLens</span></a>
      <nav aria-label="首页导航"><button id="home-explore" type="button">功能概览</button><a href="#guide">使用指南</a><a href="#about">关于禾镜</a></nav>
      <a class="home-nav-action" href="#workspace">进入工作台<span aria-hidden="true"> ↗</span></a>
    </div></header>
    <section class="home-hero" aria-labelledby="home-title" id="home-content" tabindex="-1">
      <picture class="home-hero-media"><source media="(max-width: 650px)" srcset="./home-field-mobile.webp"/><img src="./home-field.webp" width="1920" height="1080" alt="夕阳下的农田与整齐的作物行列" fetchpriority="high"/></picture>
      <div class="home-hero-copy"><p class="home-eyebrow">禾镜 FieldLens · 作物视觉巡检</p>
      <h1 id="home-title">田间巡检，<br>有图有记录。</h1>
      <p class="home-intro">采集作物图片，核对检测区域，<br>记录复核意见与下次巡检安排。</p>
      <div class="home-actions">${open("workspace", apiEnabled ? "开始检测" : "体验演示", "home-button")}<a class="home-link" href="#guide">了解如何使用 <span aria-hidden="true">›</span></a></div>
      <p class="home-caption">${apiEnabled ? "真实检测需配置作物模型，结果由人工复核。" : "无需账号 · 演示使用预置案例"}</p></div>
      <p class="home-photo-caption">田间场景摄影 · 非模型检测结果</p>
    </section>
    <nav class="home-module-nav" aria-label="巡检功能入口">${[
      ["workspace", "图像检测", "拍照上传，查看检测区域"],
      ["history", "记录复核", "筛选记录，安排后续复查"],
      ["dashboard", "巡检大屏", "统计进展，集中展示"],
      ["assistant", "复核助手", "操作答疑与记录整理"],
    ]
      .map(([view, title, text]) =>
        open(
          view,
          `<strong>${title}<span aria-hidden="true">↗</span></strong><span>${text}</span>`,
          "home-module home-module--" + view,
        ),
      )
      .join("")}</nav>
    <section class="home-capability-strip" aria-label="禾镜支持的工作环节">
      <span><strong>YOLO 检测</strong><small>接入授权模型</small></span>
      <span><strong>摄像头采集</strong><small>取景、重拍与确认</small></span>
      <span><strong>人工复核</strong><small>逐区域记录意见</small></span>
      <span><strong>报告导出</strong><small>PNG · CSV · JSON</small></span>
    </section>
    <section class="home-workspace home-section" id="home-features" aria-labelledby="home-workspace-title">
      <div class="home-section-heading"><div><p class="home-eyebrow">图像检测</p><h2 id="home-workspace-title">图片和结果，<br>放在一起看。</h2></div><div><p>上传图片或用摄像头拍照，查看检测区域。<br>核对标注、补充备注，再保存这次观察。</p>${open("workspace", '打开图像检测 <span aria-hidden="true">›</span>')}</div></div>
      <figure class="home-product"><img src="./home-workspace.webp" width="1440" height="960" loading="lazy" alt="禾镜检测工作台，左侧显示叶片示例与标注，右侧为检测参数和结果"/><figcaption>工作台界面 · 预设演示标注</figcaption></figure>
      <ol class="home-workflow"><li><span>01</span><strong>采集图片</strong><p>上传或拍照，补充地块信息。</p></li><li><span>02</span><strong>核对结果</strong><p>查看区域，记录人工意见。</p></li><li><span>03</span><strong>保存与复查</strong><p>安排下次复查，导出巡检报告。</p></li></ol>
    </section>
    <div class="home-feature-pair">
      <section class="home-feature home-records"><p class="home-eyebrow">检测记录</p><h2>上次的观察，<br>这次接着看。</h2><p>按地块、日期和复核状态查找记录，<br>比较两次结果，安排复查。</p>${open("history", '查看检测记录 <span aria-hidden="true">›</span>')}<img src="./home-records.webp" width="1200" height="800" loading="lazy" alt="检测记录界面，展示预置案例的筛选、复核状态与复查待办"/></section>
      <section class="home-feature home-screen"><p class="home-eyebrow">数据大屏</p><h2>巡检进展，<br>一屏看清。</h2><p>查看巡检趋势、地块分布和待办。<br>支持全屏、轮播和远距离展示。</p>${open("dashboard", '打开数据大屏 <span aria-hidden="true">›</span>')}<img src="./home-screen.webp" width="1200" height="800" loading="lazy" alt="数据大屏的预置演示趋势、类别分布和复查待办"/></section>
    </div>
    <section class="home-assistant home-section"><div><p class="home-eyebrow">复核助手</p><h2>需要帮助时，<br>就在手边。</h2></div><div><p>查找操作说明，整理复核清单，查看近 7 天巡检概览。<br>需要时再接入 DeepSeek 等兼容平台，围绕记录提问。</p>${open("assistant", '打开复核助手 <span aria-hidden="true">›</span>')}<p class="home-fineprint">操作说明和记录整理采用本地规则；平台 AI 属于可选接入能力。</p></div></section>
    <section class="home-questions home-section" aria-labelledby="home-questions-title">
      <div><p class="home-eyebrow">使用前了解</p><h2 id="home-questions-title">从这里开始。</h2><p>先体验流程，再按需要接入模型和账号服务。</p><a class="home-link" href="#guide">查看完整指南 <span aria-hidden="true">›</span></a></div>
      <div class="home-question-list">
        <details><summary>在线演示可以体验哪些操作？</summary><p>无需账号或安装，使用 12 条初始案例练习检测结果查看、人工复核、复查安排、报告导出和大屏展示。图片与标注为预设数据，不执行真实识别；演示修改留在独立空间，可随时重置。</p>${open("demo", '进入演示中心 <span aria-hidden="true">›</span>')}</details>
        <details><summary>怎样检测自己拍摄的作物图片？</summary><p>部署 Python 服务并配置有授权的 YOLO 作物检测模型。上传或拍照确认后，点击「开始检测」提交图片。支持的作物与病害取决于模型，结果需要人工复核。公开演示页可预览自己的图片。</p><a class="home-link" href="#guide">查看模型部署步骤 <span aria-hidden="true">›</span></a></details>
        <details><summary>记录存在哪里？换电脑还能看吗？</summary><p>巡检记录保存在当前浏览器，最多 30 条；不保存原图，也不会自动同步到其他设备。换设备前，请在「检测记录」导出 JSON 备份，再到新设备导入。原始照片请另外保存。</p></details>
        <details><summary>必须配置 AI 平台才能使用吗？</summary><p>不需要。复核助手中的操作答疑、复核清单和近 7 天概览可以直接使用。需要平台问答时，由管理员在服务端配置 DeepSeek 等兼容接口，核对发送预览后再提问。</p>${open("assistant", '查看复核助手 <span aria-hidden="true">›</span>')}</details>
      </div>
    </section>
    <footer class="home-footer"><div class="home-footer-inner"><p>在线演示使用原创插画与预设数据。识别自己的作物图片，需部署 YOLO 模型服务。<br>场景摄影来自 <a href="https://unsplash.com/photos/sYffw0LNr7s" target="_blank" rel="noopener">Unsplash</a>，按 <a href="https://unsplash.com/license" target="_blank" rel="noopener">Unsplash License</a> 使用。</p><div class="home-footer-row"><span>禾镜 FieldLens · 作物视觉巡检工作台</span><div><a href="#demo">演示中心</a><a href="#login">账号登录</a><a href="https://github.com/GuHang2011/fieldlens" target="_blank" rel="noopener">GitHub ↗</a></div>${themeControl("home-theme")}</div></div></footer>
  </div>`;
  main.querySelectorAll("[data-home-demo]").forEach((link) => {
    link.onclick = (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      enterDemo(link.dataset.homeDemo);
      window.scrollTo(0, 0);
    };
    // A new tab should enter the same independent demo space.
    const url = new URL(location.href);
    url.searchParams.set("demo", "1");
    url.hash = link.dataset.homeDemo;
    link.href = url.pathname + url.search + url.hash;
  });
  main.querySelector("#home-explore").onclick = () => {
    main
      .querySelector("#home-features")
      .scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  main.querySelector("#home-skip").onclick = (event) => {
    event.preventDefault();
    main.querySelector("#home-content").focus();
  };
  bindThemeControls(main);
}
