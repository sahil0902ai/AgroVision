import glob
import os
import sys
import unittest
from io import BytesIO

import torch
from PIL import Image

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.models.cnn_model import CLASS_NAMES, AgroVisionCNN
from app.services.cnn_service import CNNService


class TestCNNInferencePipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cnn_service = CNNService.get_instance()
        cls.sample_leaves_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../datasets/sample_leaves")
        )

    def test_01_model_architecture_and_parameters(self):
        """Verify model architecture parameter count is exactly 110,853 and output shape is (1, 5)."""
        model = AgroVisionCNN(num_classes=5)
        trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
        self.assertEqual(trainable_params, 110853, f"Expected 110,853 parameters, got {trainable_params}")
        
        dummy_input = torch.randn(1, 3, 224, 224)
        output = model(dummy_input)
        self.assertEqual(output.shape, (1, 5), f"Expected output shape (1, 5), got {output.shape}")

    def test_02_weights_loaded_successfully(self):
        """Verify model weights are loaded and service reports weights_loaded is True."""
        self.assertTrue(
            self.cnn_service.weights_loaded,
            "CNN model weights should be loaded from best_agrovision_cnn.pth or AgroVision_CNN_baseline.pth"
        )

    def test_03_png_image_support(self):
        """Verify inference succeeds on valid 3-channel PNG image buffer."""
        img = Image.new("RGB", (256, 256), color=(34, 139, 34))
        buf = BytesIO()
        img.save(buf, format="PNG")
        result = self.cnn_service.predict(buf.getvalue())
        self.assertTrue(result["success"])
        self.assertEqual(len(result["probabilities"]), 5)
        self.assertAlmostEqual(sum(result["probabilities"].values()), 1.0, places=2)

    def test_04_jpeg_image_support(self):
        """Verify inference succeeds on valid JPEG image buffer."""
        img = Image.new("RGB", (300, 300), color=(50, 160, 50))
        buf = BytesIO()
        img.save(buf, format="JPEG")
        result = self.cnn_service.predict(buf.getvalue())
        self.assertTrue(result["success"])
        self.assertEqual(len(result["probabilities"]), 5)
        self.assertAlmostEqual(sum(result["probabilities"].values()), 1.0, places=2)

    def test_05_grayscale_image_conversion(self):
        """Verify 1-channel grayscale image is converted to 3-channel RGB and processed without error."""
        gray_img = Image.new("L", (224, 224), color=128)
        buf = BytesIO()
        gray_img.save(buf, format="PNG")
        result = self.cnn_service.predict(buf.getvalue())
        self.assertTrue(result["success"])
        self.assertEqual(len(result["probabilities"]), 5)

    def test_06_rgba_image_conversion(self):
        """Verify 4-channel RGBA image is converted to 3-channel RGB and processed without error."""
        rgba_img = Image.new("RGBA", (224, 224), color=(34, 139, 34, 255))
        buf = BytesIO()
        rgba_img.save(buf, format="PNG")
        result = self.cnn_service.predict(buf.getvalue())
        self.assertTrue(result["success"])
        self.assertEqual(len(result["probabilities"]), 5)

    def test_07_corrupted_image_handling(self):
        """Verify corrupted or invalid binary input raises ValueError cleanly without crashing."""
        corrupted_bytes = b"CORRUPTED_NON_IMAGE_HEADER_BYTES_12345"
        with self.assertRaises(ValueError):
            self.cnn_service.predict(corrupted_bytes)

    def test_08_empty_image_handling(self):
        """Verify empty byte input raises ValueError cleanly."""
        with self.assertRaises(ValueError):
            self.cnn_service.predict(b"")

    def test_09_real_multi_class_leaf_images(self):
        """Verify real cotton leaf images across classes produce valid 5-class distributions."""
        sample_files = glob.glob(os.path.join(self.sample_leaves_dir, "*/*.*"))
        if not sample_files:
            self.skipTest("No sample leaf images found.")

        print(f"\n--- Multi-Class Real Leaf Inference Test ({len(sample_files)} images) ---")
        for fpath in sorted(sample_files):
            with open(fpath, "rb") as f:
                img_bytes = f.read()

            result = self.cnn_service.predict(img_bytes)
            self.assertTrue(result["success"])
            
            pred = result["prediction"]
            probs = result["probabilities"]
            
            self.assertIn(pred["class"], CLASS_NAMES)
            self.assertGreaterEqual(pred["confidence"], 0.0)
            self.assertLessEqual(pred["confidence"], 1.0)
            
            # Check probability integrity
            self.assertEqual(len(probs), 5)
            prob_sum = sum(probs.values())
            self.assertAlmostEqual(prob_sum, 1.0, places=2)
            
            # Max probability must match predicted class
            max_class = max(probs, key=probs.get)
            self.assertEqual(pred["class"], max_class)
            
            fname = os.path.basename(fpath)
            folder = os.path.basename(os.path.dirname(fpath))
            print(f"[{folder}] {fname} -> Predicted: {pred['class']} ({pred['confidence']*100:.2f}%) | Latency: {result['inference_time_ms']}ms")

if __name__ == "__main__":
    unittest.main()
