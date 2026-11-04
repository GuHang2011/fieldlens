// The camera is only requested after an explicit user action, never during boot.
export function createCamera({ onUsePhoto }) {
  let dialog, stream, photo, photoUrl, opener, readinessTimer;
  let generation = 0,
    phase = "idle",
    preferredDevice = "",
    nativePickerOpen = false;
  const endedListeners = new Map();
  const $ = (selector) => dialog?.querySelector(selector);
  const isCurrent = (token) => token === generation && dialog?.open;

  function stopStream() {
    clearTimeout(readinessTimer);
    for (const [track, handler] of endedListeners)
      track.removeEventListener("ended", handler);
    endedListeners.clear();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const video = $("#camera-video");
    if (video) {
      video.onloadeddata = null;
      video.srcObject = null;
    }
  }
  function clearPhoto() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
    photo = null;
  }
  function close() {
    if (!dialog) return;
    generation++;
    stopStream();
    clearPhoto();
    nativePickerOpen = false;
    dialog?.close();
    dialog?.remove();
    dialog = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
  function setPhase(value, message) {
    if (!dialog) return;
    phase = value;
    dialog.dataset.phase = value;
    $("#camera-status").textContent = message;
    $("#camera-shutter").disabled = value !== "ready";
    $("#camera-use").disabled = value !== "review";
    $("#camera-use").hidden = value !== "review";
    $("#camera-retake").hidden = value !== "review";
    $("#camera-retry").hidden = !["error", "idle"].includes(value);
    $("#camera-shutter").hidden = value === "review";
    $("#camera-device").disabled =
      value !== "ready" || $("#camera-device").options.length < 2;
    $("#camera-fallback").disabled = value === "capturing";
    $("#camera-video").hidden = value === "review";
    $("#camera-photo").hidden = value !== "review";
  }
  function fail(error, token) {
    if (!isCurrent(token)) return;
    generation++;
    stopStream();
    const messages = {
      NotAllowedError:
        "未获得摄像头权限。请在浏览器的网站设置中允许摄像头，再点击重新开启。",
      SecurityError: "浏览器阻止了摄像头访问，请检查网站权限或使用系统相机。",
      NotFoundError: "没有找到摄像头。连接设备后重试，或选择已有照片。",
      NotReadableError: "摄像头可能被其他程序占用，请关闭占用程序后重试。",
      OverconstrainedError: "选中的摄像头不可用，请重新开启以选择可用设备。",
      AbortError: "摄像头启动被中断，请重试。",
    };
    setPhase(
      "error",
      messages[error.name] ||
        error.message ||
        "摄像头无法启动，请重试或使用系统相机。",
    );
  }
  async function listDevices(token) {
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "videoinput" && device.deviceId,
      );
      if (!isCurrent(token) || !devices.length) return;
      const select = $("#camera-device");
      select.replaceChildren(
        ...devices.map(
          (device, index) =>
            new Option(device.label || `摄像头 ${index + 1}`, device.deviceId),
        ),
      );
      const current = stream?.getVideoTracks()[0]?.getSettings().deviceId;
      if (devices.some((device) => device.deviceId === current)) {
        select.value = current;
        preferredDevice = current;
      }
      select.disabled = phase !== "ready" || devices.length < 2;
    } catch {
      /* A preview can still work when device enumeration is unavailable. */
    }
  }
  async function start(deviceId = preferredDevice) {
    const token = ++generation;
    stopStream();
    clearPhoto();
    nativePickerOpen = false;
    if (!dialog?.open) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setPhase(
        "error",
        "当前环境不能直接打开摄像头。请使用 HTTPS 或 localhost，或选择系统相机 / 照片。",
      );
      return;
    }
    setPhase(
      "opening",
      "正在请求摄像头，请在浏览器提示中允许访问。可随时关闭此窗口。",
    );
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: "environment" } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (!isCurrent(token) || document.hidden) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState === "ended")
        throw Error("摄像头未提供有效画面，请重试。");
      const disconnected = () =>
        fail(Error("摄像头已断开或权限被撤回，请重新开启。"), token);
      track.addEventListener("ended", disconnected);
      endedListeners.set(track, disconnected);
      const video = $("#camera-video");
      const ready = () => {
        if (
          !isCurrent(token) ||
          phase !== "opening" ||
          video.readyState < 2 ||
          !video.videoWidth ||
          !video.videoHeight
        )
          return;
        clearTimeout(readinessTimer);
        setPhase(
          "ready",
          `预览已开启 · ${video.videoWidth} × ${video.videoHeight}。对准样本后点击拍照。`,
        );
      };
      video.onloadeddata = ready;
      video.srcObject = stream;
      readinessTimer = setTimeout(
        () =>
          fail(Error("未收到摄像头画面，请重新开启或使用系统相机。"), token),
        12000,
      );
      listDevices(token);
      await video.play();
      ready();
    } catch (error) {
      fail(error, token);
    }
  }
  async function capture() {
    if (phase !== "ready") return;
    const token = generation;
    const video = $("#camera-video");
    if (!video.videoWidth || !video.videoHeight) return;
    setPhase("capturing", "正在生成照片…");
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        2560 / Math.max(video.videoWidth, video.videoHeight),
      );
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw Error("当前浏览器无法生成照片，请使用系统相机。");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!isCurrent(token)) return;
      if (!blob || blob.size > 10 * 1024 * 1024)
        throw Error("照片生成失败或超过大小限制，请重拍或选择已有照片。");
      photo = new File([blob], `fieldlens-photo-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      photoUrl = URL.createObjectURL(photo);
      $("#camera-photo").src = photoUrl;
      generation++;
      stopStream();
      setPhase(
        "review",
        `拍摄完成 · ${canvas.width} × ${canvas.height}。摄像头已关闭，可重拍或使用这张照片。`,
      );
    } catch (error) {
      fail(error, token);
    }
  }
  function use(file) {
    close();
    onUsePhoto(file);
  }
  function open(button) {
    if (dialog?.open) return;
    opener = button;
    preferredDevice = "";
    dialog = document.createElement("dialog");
    const owner = dialog;
    dialog.className = "record-dialog camera-dialog";
    dialog.setAttribute("aria-labelledby", "camera-title");
    dialog.innerHTML = `<div class="panel-heading"><h2 id="camera-title">摄像头拍照</h2><button class="button outlined" id="camera-close">关闭</button></div><div class="camera-body"><p class="field-help">确认照片后放入工作台，再按需开始检测。取景画面不会自动上传，也不会录制视频或声音。</p><div class="camera-device-row"><label for="camera-device">摄像头</label><select id="camera-device" disabled><option value="">自动选择（优先后置）</option></select></div><div class="camera-stage"><video id="camera-video" autoplay playsinline muted aria-label="摄像头实时预览"></video><img id="camera-photo" alt="刚拍摄的照片" hidden/></div><p id="camera-status" class="camera-status" role="status" aria-live="polite"></p><button class="text-button" id="camera-fallback">使用系统相机 / 选择照片</button><p class="field-help">手机通常可打开系统相机；电脑会打开文件选择。设备与浏览器支持情况可能不同。</p><input id="camera-native-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden/></div><div class="camera-footer"><button class="button outlined" id="camera-retry" hidden>重新开启</button><button class="button outlined" id="camera-retake" hidden>重拍</button><button class="button primary" id="camera-shutter" disabled>拍照</button><button class="button primary" id="camera-use" hidden disabled>使用这张照片</button></div>`;
    document.body.append(dialog);
    $("#camera-close").onclick = close;
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    $("#camera-shutter").onclick = capture;
    $("#camera-retake").onclick = () => start();
    $("#camera-retry").onclick = () => {
      preferredDevice = "";
      start();
    };
    $("#camera-use").onclick = () => {
      if (photo) use(photo);
    };
    $("#camera-device").onchange = (event) => {
      preferredDevice = event.target.value;
      start();
    };
    const nativeFile = $("#camera-native-file");
    $("#camera-fallback").onclick = () => {
      generation++;
      stopStream();
      clearPhoto();
      nativePickerOpen = true;
      setPhase(
        "idle",
        "预览已停止。选择照片后将放入工作台；取消后可重新开启摄像头。",
      );
      nativeFile.value = "";
      nativeFile.click();
    };
    nativeFile.onchange = () => {
      if (dialog !== owner) return;
      nativePickerOpen = false;
      if (nativeFile.files[0]) use(nativeFile.files[0]);
    };
    nativeFile.addEventListener("cancel", () => {
      if (dialog === owner) nativePickerOpen = false;
    });
    dialog.showModal();
    start();
  }
  window.addEventListener("pagehide", close);
  document.addEventListener("visibilitychange", () => {
    if (
      document.hidden &&
      dialog?.open &&
      phase !== "review" &&
      !nativePickerOpen
    )
      close();
  });
  return { open, close };
}
