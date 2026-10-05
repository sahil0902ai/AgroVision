import os
import uuid
from datetime import date

from ai_models.cnn_inference import CNNInferenceEngine
from ai_models.snn_inference import SNNInferenceEngine
from ai_models.snn_preprocessing import SNN_DEFAULT_FIELD_INPUTS
from app.services.gradcam import GradCAM, overlay_heatmap_on_image
from app.services.recommendations import ExpertRecommendationEngine

MAX_PIPELINE_IMAGE_BYTES = 10 * 1024 * 1024


class AIPipelineService:
    """
    Multi-modal pipeline connecting CNN visual analysis and SNN environmental
    inference for the v1 persistence API (/api/v1/predict):
    - CNN leaf image classification.
    - SNN environmental spiking inference (exact 33-feature training pipeline).
    - Grad-CAM visual heatmap overlay generation.
    - Agronomic advice synthesis from the actual model outputs.

    The CNN and SNN outputs are returned independently; no multimodal fusion
    is applied (fusion is a planned future stage).
    """

    def __init__(
        self,
        cnn_weights_path="models/best_agrovision_cnn.pth",
        snn_weights_path="models/agrovision_snn.pth",
    ):
        self._cnn_weights_path = cnn_weights_path
        self._snn_weights_path = snn_weights_path
        self._pipeline = None

    def _get_pipeline(self):
        # Lazy init: models load on first request, not at module import, so
        # app startup does not pay for loading a second copy of both models.
        if self._pipeline is None:
            cnn_engine = CNNInferenceEngine(weights_path=self._cnn_weights_path)
            snn_engine = SNNInferenceEngine(weights_path=self._snn_weights_path)
            gradcam = GradCAM(cnn_engine.model)
            self._pipeline = (cnn_engine, snn_engine, gradcam)
        return self._pipeline

    def build_snn_payload(self, env_data: dict) -> dict:
        """
        Builds the trained SNN payload from the six v1 environmental form
        values, filling the remaining model inputs with the documented fixed
        defaults (SNN_DEFAULT_FIELD_INPUTS). Missing values are never invented
        silently: the six form values are always used as provided, and every
        default is a documented training-range midpoint.
        """
        payload = {
            "temperature": env_data.get("temperature"),
            "humidity": env_data.get("humidity"),
            "rainfall": env_data.get("rainfall_mm"),
            "soil_moisture": env_data.get("soil_moisture"),
            "aqi": env_data.get("aqi"),
            "ozone": env_data.get("ozone"),
            "growth_stage": env_data.get("growth_stage"),
            "observation_date": env_data.get("observation_date") or date.today().isoformat(),
        }
        for key, value in SNN_DEFAULT_FIELD_INPUTS.items():
            payload.setdefault(key, value)
        return payload

    def process_prediction(self, image_bytes, env_data, upload_dir="uploads"):
        """
        Executes the multi-modal pipeline:
        1. CNN visual prediction.
        2. SNN environmental spiking prediction across T=10 time steps.
        3. Grad-CAM visual heatmap overlay generation.
        4. Agronomic advice synthesis from the actual model outputs.
        """
        if not image_bytes or len(image_bytes) == 0:
            raise ValueError("Empty image data provided.")
        if len(image_bytes) > MAX_PIPELINE_IMAGE_BYTES:
            raise ValueError(
                f"Image size is too large (max {MAX_PIPELINE_IMAGE_BYTES // (1024 * 1024)}MB)."
            )

        cnn_engine, snn_engine, gradcam = self._get_pipeline()

        # 1. Run CNN leaf image inference
        cnn_result = cnn_engine.predict(image_bytes)
        cnn_dict = cnn_result["class_probabilities"]

        cnn_percents = {
            "healthy": round(cnn_dict["Healthy"] * 100, 1),
            "water_stress": round(cnn_dict["Water Stress"] * 100, 1),
            "heat_stress": round(cnn_dict["Heat Stress"] * 100, 1),
            "nutrient_deficiency": round(cnn_dict["Nutrient Deficiency"] * 100, 1),
            "pollution": round(cnn_dict.get("Pollution", 0.0) * 100, 1),
        }

        # 2. Run SNN environmental spiking inference (exact trained pipeline)
        snn_result = snn_engine.predict(self.build_snn_payload(env_data))
        predicted_severity = snn_result["predicted_severity"]
        snn_confidence = round(snn_result["class_scores"][predicted_severity] * 100, 1)
        spike_counts_dict = snn_result["spike_counts"]
        spike_list = [
            spike_counts_dict["High"],
            spike_counts_dict["Low"],
            spike_counts_dict["Moderate"],
        ]

        # 3. Generate Grad-CAM heatmap overlay
        img_tensor, pil_img = cnn_engine.preprocess_image(image_bytes)
        target_cls = cnn_result["predicted_class_index"]
        heatmap_np = gradcam.generate_heatmap(img_tensor, target_class_idx=target_cls)
        overlay_pil = overlay_heatmap_on_image(pil_img, heatmap_np)

        # Save uploaded leaf image & heatmap overlay
        rec_id = str(uuid.uuid4())[:8]
        img_dir = os.path.join(upload_dir, "images")
        map_dir = os.path.join(upload_dir, "heatmaps")
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(map_dir, exist_ok=True)

        orig_filename = f"leaf_{rec_id}.jpg"
        heatmap_filename = f"gradcam_{rec_id}.jpg"
        pil_img.save(os.path.join(img_dir, orig_filename))
        overlay_pil.save(os.path.join(map_dir, heatmap_filename))

        # 4. Agronomic advice synthesis from the actual model outputs
        recommendations = ExpertRecommendationEngine.evaluate(
            cnn_percents, predicted_severity, env_data
        )

        return {
            "record_uuid": rec_id,
            "image_url": f"/uploads/images/{orig_filename}",
            "heatmap_url": f"/uploads/heatmaps/{heatmap_filename}",
            "cnn_predictions": cnn_percents,
            "snn_result": {
                "severity": predicted_severity,
                "confidence_percent": snn_confidence,
                "spike_counts": spike_list,
                "timesteps": snn_result["timesteps"],
            },
            "recommendations": recommendations,
        }
