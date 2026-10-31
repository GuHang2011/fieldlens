import io
import unittest
from PIL import Image
from server.app import create_app


class FakeDetector:
    ready = True
    name = "test-detector"

    def predict(self, image, confidence):
        self.size = image.size
        self.confidence = confidence
        return [{"label": "test-leaf", "confidence": 0.9, "box": [0.1, 0.2, 0.8, 0.9]}]


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.engine = FakeDetector()
        self.client = create_app(self.engine).test_client()

    def image(self):
        stream = io.BytesIO()
        Image.new("RGB", (40, 20), "green").save(stream, format="PNG")
        stream.seek(0)
        return stream

    def test_detection_contract(self):
        result = self.client.post("/api/detect", data={"image": (self.image(), "leaf.png"), "confidence": "0.75"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json["width"], 40)
        self.assertEqual(self.engine.confidence, .75)
        self.assertEqual(result.json["detections"][0]["box"], [.1, .2, .8, .9])
        self.assertEqual(result.headers["Cache-Control"], "no-store")

    def test_invalid_thresholds(self):
        for confidence in ["NaN", "inf", "0", "1.1", "word"]:
            response = self.client.post("/api/detect", data={"image": (self.image(), "leaf.png"), "confidence": confidence})
            self.assertEqual(response.status_code, 400)

    def test_missing_or_invalid_image(self):
        self.assertEqual(self.client.post("/api/detect").status_code, 400)
        self.assertEqual(self.client.post("/api/detect", data={"image": (io.BytesIO(b"not an image"), "leaf.png")}).status_code, 400)

    def test_missing_model_is_not_a_fake_success(self):
        self.engine.ready = False
        result = self.client.post("/api/detect", data={"image": (self.image(), "leaf.png")})
        self.assertEqual(result.status_code, 503)
        self.assertFalse(self.client.get("/api/health").json["ready"])

    def test_exif_orientation(self):
        stream = io.BytesIO()
        image = Image.new("RGB", (40, 20), "green")
        exif = image.getexif()
        exif[274] = 6
        image.save(stream, format="JPEG", exif=exif)
        stream.seek(0)
        result = self.client.post("/api/detect", data={"image": (stream, "rotated.jpg")})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.engine.size, (20, 40))

    def test_oversize_and_disallowed_image(self):
        result = self.client.post("/api/detect", data={"image": (io.BytesIO(b"x" * (10 * 1024 * 1024 + 1)), "large.png")})
        self.assertEqual(result.status_code, 413)
        stream = io.BytesIO()
        Image.new("RGB", (10, 10)).save(stream, format="GIF")
        stream.seek(0)
        self.assertEqual(self.client.post("/api/detect", data={"image": (stream, "leaf.gif")}).status_code, 415)


if __name__ == "__main__":
    unittest.main()
