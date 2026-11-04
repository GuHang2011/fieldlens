// Canvas-generated media only: this fixture never opens a physical camera.
export async function installCameraFixture(page) {
  await page.addInitScript(() => {
    const state = (window.cameraTest = {
      mode: "normal",
      requests: [],
      streams: [],
      pending: [],
      blobFailure: false,
    });
    const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      if (state.blobFailure) {
        callback(null);
        return;
      }
      return nativeToBlob.call(this, callback, ...args);
    };
    const getUserMedia = async (constraints) => {
      state.requests.push(constraints);
      const failure = {
        denied: "NotAllowedError",
        missing: "NotFoundError",
        busy: "NotReadableError",
      }[state.mode];
      if (failure) throw new DOMException("Synthetic test failure", failure);
      if (state.mode === "deferred")
        await new Promise((resolve) => state.pending.push(resolve));
      const canvas = document.createElement("canvas");
      canvas.width = 3200;
      canvas.height = 1800;
      const context = canvas.getContext("2d");
      const draw = () => {
        context.fillStyle = "#e9efe5";
        context.fillRect(0, 0, 3200, 1800);
        context.fillStyle = "#315b42";
        context.font = "70px sans-serif";
        context.fillText("SYNTHETIC CAMERA / TEST FRAME", 150, 170);
        context.fillStyle = "#94b479";
        context.beginPath();
        context.ellipse(1600, 960, 520, 650, Math.PI / 5, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "#d5dfae";
        context.lineWidth = 20;
        context.beginPath();
        context.moveTo(1200, 1500);
        context.lineTo(1950, 430);
        context.stroke();
        context.fillStyle = "#eee1bc";
        context.beginPath();
        context.arc(1450, 800, 70, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#695740";
        context.beginPath();
        context.arc(1450, 800, 35, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#315b42";
        context.font = "52px sans-serif";
        context.fillText(
          "Generated fixture. No real camera or model inference.",
          150,
          1660,
        );
      };
      draw();
      const stream = canvas.captureStream(10);
      const track = stream.getVideoTracks()[0];
      const timer = setInterval(draw, 100);
      const stop = track.stop.bind(track);
      track.stop = () => {
        clearInterval(timer);
        stop();
      };
      track.getSettings = () => ({
        width: 3200,
        height: 1800,
        deviceId: constraints.video.deviceId?.exact || "rear-test",
      });
      state.streams.push(stream);
      return stream;
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: async () => [
          {
            kind: "videoinput",
            deviceId: "rear-test",
            label: "测试后置摄像头（合成）",
          },
          {
            kind: "videoinput",
            deviceId: "front-test",
            label: "测试前置摄像头（合成）",
          },
        ],
      },
    });
  });
}
