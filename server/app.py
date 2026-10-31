"""Local-only inference API. Images stay in memory and weights are supplied by the operator."""
import io
import math
import os
import threading
import time
import warnings
from pathlib import Path

from flask import Flask, jsonify, request
from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.exceptions import RequestEntityTooLarge

Image.MAX_IMAGE_PIXELS = 25_000_000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class YoloDetector:
    def __init__(self):
        self.path = os.environ.get("FIELDLENS_MODEL", "")
        self.model = None
        self.lock = threading.Lock()

    @property
    def ready(self):
        return bool(self.path and Path(self.path).is_file())

    @property
    def name(self):
        return Path(self.path).name if self.ready else None

    def predict(self, image, confidence):
        with self.lock:
            if self.model is None:
                from ultralytics import YOLO
                # Only a local, operator-configured weight path is accepted.
                self.model = YOLO(self.path, task="detect")
            if self.model.task != "detect":
                raise ValueError("FieldLens requires a YOLO object detection model")
            results = self.model.predict(source=image, conf=confidence, max_det=300, verbose=False)
            output = []
            for result in results:
                if result.boxes is None:
                    continue
                for box, score, category in zip(result.boxes.xyxyn.cpu().tolist(), result.boxes.conf.cpu().tolist(), result.boxes.cls.cpu().tolist()):
                    normalized = [max(0.0, min(1.0, float(v))) for v in box]
                    if normalized[0] >= normalized[2] or normalized[1] >= normalized[3]:
                        continue
                    output.append({"label": str(result.names[int(category)]), "confidence": float(score), "box": normalized})
            return output


def create_app(detector=None):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 11 * 1024 * 1024
    engine = detector if detector is not None else YoloDetector()

    @app.after_request
    def headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.errorhandler(RequestEntityTooLarge)
    def too_large(_error):
        return jsonify(error="图片不能超过 10 MB"), 413

    @app.get("/api/health")
    def health():
        return jsonify(service="fieldlens", ready=engine.ready, model=engine.name)

    @app.post("/api/detect")
    def detect():
        if "image" not in request.files:
            return jsonify(error="请选择图片"), 400
        try:
            confidence = float(request.form.get("confidence", "0.5"))
            if not math.isfinite(confidence) or not 0.1 <= confidence <= 0.99:
                raise ValueError()
        except (TypeError, ValueError):
            return jsonify(error="置信度必须在 0.10 到 0.99 之间"), 400
        payload = request.files["image"].read(10 * 1024 * 1024 + 1)
        if len(payload) > 10 * 1024 * 1024:
            return jsonify(error="图片不能超过 10 MB"), 413
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(payload)) as source:
                    if source.format not in ALLOWED_FORMATS:
                        return jsonify(error="仅支持 JPEG、PNG、WebP 图片"), 415
                    if source.width * source.height > 25_000_000:
                        return jsonify(error="图片分辨率不能超过 2500 万像素"), 413
                    source.load()
                    # Match browser orientation so normalized boxes align with the preview.
                    image = ImageOps.exif_transpose(source).convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            return jsonify(error="图片无法读取或分辨率过大"), 400
        if not engine.ready:
            return jsonify(error="尚未配置模型：请设置 FIELDLENS_MODEL 为经授权的本地权重路径，并重启服务"), 503
        started = time.perf_counter()
        try:
            detections = engine.predict(image, confidence)
        except ImportError:
            return jsonify(error="缺少 YOLO 依赖，请安装 server/requirements-yolo.txt"), 503
        except Exception:
            app.logger.exception("Inference failed")
            return jsonify(error="模型推理失败，请检查权重兼容性与服务日志"), 500
        return jsonify(detections=detections, model=engine.name, elapsed_ms=round((time.perf_counter() - started) * 1000), width=image.width, height=image.height)

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5050, debug=False)
