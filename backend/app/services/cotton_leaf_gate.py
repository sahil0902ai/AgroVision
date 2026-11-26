"""
AgroVision Cotton Leaf Validation Gate Service.

Validates whether an uploaded image contains a recognizable, genuine cotton plant leaf
before passing it to the 5-class AgroVisionCNN.

Rejection Categories & Farmer-Friendly User Messages:
1. UNRELATED_IMAGE:
   "Invalid Image — This image does not appear to contain a cotton leaf. Please upload a clear cotton leaf photograph."
2. UNSUPPORTED_PLANT:
   "Unsupported Plant — AgroVision currently analyses cotton leaves only. Please upload an image of a cotton plant leaf."
3. LOW_QUALITY:
   "Image Quality Too Low — Please upload a clearer photograph with the cotton leaf properly visible."
4. CORRUPTED:
   "Unable to Process Image — The uploaded file could not be opened. Please select another image."
5. MODEL_ERROR:
   "Analysis Failed — The image could not be analysed. Please try again."
"""

import logging
import os
from io import BytesIO
from pathlib import Path
from typing import Any, Tuple, Union

import cv2
import joblib
import numpy as np
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger("agrovision.cotton_leaf_gate")

MODEL_PATH_CANDIDATES = [
    Path("models/cotton_leaf_gate_model.joblib"),
    Path("backend/models/cotton_leaf_gate_model.joblib"),
    Path("../models/cotton_leaf_gate_model.joblib"),
    Path(__file__).resolve().parent.parent / "models" / "cotton_leaf_gate_model.joblib",
    Path(__file__).resolve().parent.parent.parent / "backend" / "models" / "cotton_leaf_gate_model.joblib",
]


class CottonLeafGate:
    _instance = None

    def __init__(self):
        self.model = None
        self.feature_names = None
        self.metrics = None
        self._face_cascade = None
        self._load_model()
        self._load_face_cascade()

    @classmethod
    def get_instance(cls) -> "CottonLeafGate":
        if cls._instance is None:
            cls._instance = CottonLeafGate()
        return cls._instance

    def _load_model(self):
        for candidate in MODEL_PATH_CANDIDATES:
            if candidate.exists() and candidate.is_file():
                try:
                    artifact = joblib.load(candidate)
                    if isinstance(artifact, dict) and "model" in artifact:
                        self.model = artifact["model"]
                        self.feature_names = artifact.get("feature_names")
                        self.metrics = artifact.get("metrics")
                    else:
                        self.model = artifact
                    logger.info(f"Cotton Leaf Gate model loaded from: {candidate}")
                    return
                except Exception as e:
                    logger.warning(f"Failed to load Cotton Leaf Gate from {candidate}: {e}")

        logger.warning(
            "Cotton Leaf Gate model file 'cotton_leaf_gate_model.joblib' not found. "
            "Gate will operate in fail-closed deterministic botanical mode."
        )

    def _load_face_cascade(self):
        try:
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            if os.path.exists(cascade_path):
                self._face_cascade = cv2.CascadeClassifier(cascade_path)
        except Exception as e:
            logger.warning(f"Failed to initialize Haar face cascade: {e}")

    def extract_features(self, cv_img: np.ndarray) -> Tuple[np.ndarray, dict]:
        """
        Extracts standardized botanical feature vector from an OpenCV BGR image.
        """
        h_orig, w_orig = cv_img.shape[:2]
        img = cv2.resize(cv_img, (256, 256), interpolation=cv2.INTER_AREA)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        ycbcr = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)

        total_px = 256 * 256

        # 1. Sharpness & Intensity Variation
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        int_std = float(np.std(gray))

        # 2. Foliar masks
        # Green chlorophyll: H in [30, 95], S >= 30, V >= 30
        mask_green = (hsv[:, :, 0] >= 30) & (hsv[:, :, 0] <= 95) & (hsv[:, :, 1] >= 30) & (hsv[:, :, 2] >= 30)
        # Yellow chlorosis: H in [18, 30], S >= 40, V >= 50
        mask_yellow = (hsv[:, :, 0] >= 18) & (hsv[:, :, 0] < 30) & (hsv[:, :, 1] >= 40) & (hsv[:, :, 2] >= 50)
        # Brown necrosis: H in [8, 20], S >= 35, V in [30, 200]
        mask_brown = (hsv[:, :, 0] >= 8) & (hsv[:, :, 0] <= 20) & (hsv[:, :, 1] >= 35) & (hsv[:, :, 2] >= 30) & (hsv[:, :, 2] <= 200)

        plant_mask = mask_green | mask_yellow | mask_brown
        foliar_count = np.count_nonzero(plant_mask)
        foliar_ratio = float(foliar_count / total_px)
        green_ratio = float(np.count_nonzero(mask_green) / total_px)
        chlorosis_ratio = float(np.count_nonzero(mask_yellow) / total_px)
        necrosis_ratio = float(np.count_nonzero(mask_brown) / total_px)

        # 3. Non-plant indicators
        # Skin locus
        cr = ycbcr[:, :, 1]
        cb = ycbcr[:, :, 2]
        mask_skin = (cr >= 133) & (cr <= 173) & (cb >= 77) & (cb <= 127)
        skin_ratio = float(np.count_nonzero(mask_skin) / total_px)

        # Sky blue
        mask_sky = (hsv[:, :, 0] >= 98) & (hsv[:, :, 0] <= 130) & (hsv[:, :, 1] >= 40) & (hsv[:, :, 2] >= 80)
        sky_ratio = float(np.count_nonzero(mask_sky) / total_px)

        # Document pure white
        mask_doc = (img[:, :, 0] > 235) & (img[:, :, 1] > 235) & (img[:, :, 2] > 235)
        doc_white_ratio = float(np.count_nonzero(mask_doc) / total_px)

        # 4. Morphology & Contour Dominance
        contours, _ = cv2.findContours(plant_mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        sig_contours = [c for c in contours if cv2.contourArea(c) > 200]
        contour_count = len(sig_contours)

        if sig_contours and foliar_count > 0:
            largest_c = max(sig_contours, key=cv2.contourArea)
            largest_area = cv2.contourArea(largest_c)
            hull = cv2.convexHull(largest_c)
            hull_area = cv2.contourArea(hull)
            solidity = float(largest_area / hull_area) if hull_area > 0 else 0.5
            convexity_deficit = float(1.0 - solidity)
            x, y, w, h = cv2.boundingRect(largest_c)
            aspect_ratio = float(max(w, h) / max(min(w, h), 1))
            extent = float(largest_area / (w * h)) if (w * h) > 0 else 0.5
            foliar_dominance = float(largest_area / foliar_count)
        else:
            solidity = 0.0
            convexity_deficit = 1.0
            aspect_ratio = 1.0
            extent = 0.0
            foliar_dominance = 0.0

        if foliar_ratio > 0.01:
            mean_hue = float(np.mean(hsv[:, :, 0][plant_mask]))
            mean_sat = float(np.mean(hsv[:, :, 1][plant_mask]))
        else:
            mean_hue = 0.0
            mean_sat = 0.0

        # Face check
        face_count = 0
        if self._face_cascade is not None:
            try:
                faces = self._face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3, minSize=(32, 32))
                face_count = len(faces)
            except Exception:
                face_count = 0

        feats = np.array([
            foliar_ratio,
            green_ratio,
            chlorosis_ratio,
            necrosis_ratio,
            lap_var,
            int_std,
            skin_ratio,
            sky_ratio,
            doc_white_ratio,
            aspect_ratio,
            solidity,
            convexity_deficit,
            float(contour_count),
            extent,
            mean_hue,
            mean_sat
        ], dtype=np.float32)

        diagnostics = {
            "width": w_orig,
            "height": h_orig,
            "laplacian_var": round(lap_var, 2),
            "intensity_std": round(int_std, 2),
            "foliar_ratio": round(foliar_ratio, 4),
            "green_ratio": round(green_ratio, 4),
            "chlorosis_ratio": round(chlorosis_ratio, 4),
            "necrosis_ratio": round(necrosis_ratio, 4),
            "aspect_ratio": round(aspect_ratio, 2),
            "solidity": round(solidity, 3),
            "convexity_deficit": round(convexity_deficit, 3),
            "contour_count": contour_count,
            "foliar_dominance": round(foliar_dominance, 3),
            "skin_ratio": round(skin_ratio, 4),
            "sky_ratio": round(sky_ratio, 4),
            "doc_white_ratio": round(doc_white_ratio, 4),
            "face_count": face_count,
        }
        return feats, diagnostics

    def validate(
        self,
        image_input: Union[bytes, str, Path, BytesIO, Image.Image]
    ) -> Tuple[bool, str, str, dict]:
        """
        Validates whether the image contains an authentic cotton plant leaf.

        Returns:
            (is_valid: bool, category: str, message: str, diagnostics: dict)
        """
        # 1. Image Decode & Basic File Integrity
        pil_img: Image.Image
        try:
            if isinstance(image_input, (str, Path)):
                p = Path(image_input)
                if not p.is_file():
                    return False, "CORRUPTED", "Unable to Process Image — The uploaded file could not be opened. Please select another image.", {}
                pil_img = Image.open(p)
            elif isinstance(image_input, bytes):
                if not image_input or len(image_input) == 0:
                    return False, "CORRUPTED", "Unable to Process Image — The uploaded file could not be opened. Please select another image.", {}
                pil_img = Image.open(BytesIO(image_input))
            elif isinstance(image_input, BytesIO):
                pil_img = Image.open(image_input)
            elif isinstance(image_input, Image.Image):
                pil_img = image_input
            else:
                return False, "CORRUPTED", "Unable to Process Image — The uploaded file could not be opened. Please select another image.", {}

            rgb_img = pil_img.convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError) as err:
            logger.warning(f"Image decode failed: {err}")
            return False, "CORRUPTED", "Unable to Process Image — The uploaded file could not be opened. Please select another image.", {}

        w, h = rgb_img.size

        # 2. Resolution Check (Minimum 150x150 required for reliable 224x224 CNN foliar analysis)
        if w < 150 or h < 150:
            return (
                False,
                "LOW_QUALITY",
                "Image Quality Too Low — Please upload a clearer photograph with the cotton leaf properly visible.",
                {"width": w, "height": h}
            )

        # Convert to OpenCV BGR for feature extraction
        np_rgb = np.array(rgb_img)
        cv_bgr = cv2.cvtColor(np_rgb, cv2.COLOR_RGB2BGR)

        feats, diag = self.extract_features(cv_bgr)

        # 3. Quality & Blur Check
        # Severely blurred or out-of-focus (Laplacian var < 18.0) or blank/uniform (intensity std < 14.0)
        if diag["laplacian_var"] < 18.0 or diag["intensity_std"] < 14.0:
            return (
                False,
                "LOW_QUALITY",
                "Image Quality Too Low — Please upload a clearer photograph with the cotton leaf properly visible.",
                diag
            )

        # 4. Foliar Presence vs Unrelated Object Check
        # A. Face detection check: human faces have skin locus >= 18% and lack chlorophyll (green < 15%)
        # Note: Leaf veins/spots can occasionally trigger false positive Haar detections, so verify lack of chlorophyll green
        if diag.get("face_count", 0) > 0 and diag["green_ratio"] < 0.15 and diag["skin_ratio"] >= 0.18:
            return (
                False,
                "UNRELATED_IMAGE",
                "Invalid Image — This image does not appear to contain a cotton leaf. Please upload a clear cotton leaf photograph.",
                diag
            )

        # Mammalian skin / animal fur locus >= 30% (when not accompanied by substantial green chlorophyll)
        if diag["skin_ratio"] >= 0.30 and diag["green_ratio"] < 0.15:
            return (
                False,
                "UNRELATED_IMAGE",
                "Invalid Image — This image does not appear to contain a cotton leaf. Please upload a clear cotton leaf photograph.",
                diag
            )

        # B. Landscape sky blue > 25%
        if diag["sky_ratio"] >= 0.25:
            return (
                False,
                "UNRELATED_IMAGE",
                "Invalid Image — This image does not appear to contain a cotton leaf. Please upload a clear cotton leaf photograph.",
                diag
            )

        # C. Document / UI pure white check:
        # High white is only a document if foliar presence is absent (< 10%)
        # (Farmers and researchers frequently photograph cotton leaves on white paper or clean trays)
        color_foliar = float(diag["green_ratio"] + diag["chlorosis_ratio"] + diag["necrosis_ratio"])
        if diag["doc_white_ratio"] >= 0.65 and diag["foliar_ratio"] < 0.10 and color_foliar < 0.08:
            return (
                False,
                "UNRELATED_IMAGE",
                "Invalid Image — This image does not appear to contain a cotton leaf. Please upload a clear cotton leaf photograph.",
                diag
            )

        # D. Non-plant images (cars, buildings, animals, random objects without foliage):
        if diag["foliar_ratio"] < 0.10 and color_foliar < 0.08:
            return (
                False,
                "UNRELATED_IMAGE",
                "Invalid Image — This image does not appear to contain a cotton leaf. Please upload a clear cotton leaf photograph.",
                diag
            )

        # E. Foliar dominance check: in vehicles or buildings parked on grass, foliar is scattered noise (< 0.40)
        if diag["foliar_dominance"] < 0.40:
            return (
                False,
                "UNRELATED_IMAGE",
                "Invalid Image — This image does not appear to contain a cotton leaf. Please upload a clear cotton leaf photograph.",
                diag
            )

        # 5. Machine Learning Cotton Leaf Model Inference
        if self.model is not None:
            try:
                feat_vec = feats.reshape(1, -1)
                prob_cotton = float(self.model.predict_proba(feat_vec)[0, 1])
                diag["cotton_probability"] = round(prob_cotton, 4)

                # A. High ML Cotton Leaf Confidence (prob_cotton >= 0.30)
                if prob_cotton >= 0.30:
                    return True, "VALID_COTTON_LEAF", "Valid cotton leaf detected.", diag

                # B. Broad Foliar Geometry with Supporting Cotton Probability (0.14 <= prob_cotton < 0.30)
                # Cotton (Gossypium) leaves possess palmate/cordate structure (aspect ratio <= 2.2),
                # single dominant blade, and are robust to field lighting, shadows, and stress spots.
                is_broad_foliar = (diag["aspect_ratio"] <= 2.2) and (diag["contour_count"] <= 8)
                is_canopy_close_up = (diag["foliar_ratio"] >= 0.40) and (diag["aspect_ratio"] <= 2.2)
                if (prob_cotton >= 0.14) and (is_broad_foliar or is_canopy_close_up) and (diag["foliar_dominance"] >= 0.40):
                    return True, "VALID_COTTON_LEAF", "Valid cotton leaf detected.", diag

                # C. Confirmed Non-Cotton Botanical Species (REJECT as UNSUPPORTED_PLANT)
                # Botanical criteria for confirmed non-cotton plants:
                # 1. Monocot grass blade / corn / maize / sugarcane: elongated linear blade (aspect ratio >= 2.4)
                is_confirmed_monocot = (diag["aspect_ratio"] >= 2.4) and (diag["green_ratio"] >= 0.10 or diag["foliar_ratio"] >= 0.15)
                # 2. Fern or highly segmented compound leaf: >= 8 disconnected leaflets with high convexity deficit
                is_confirmed_compound = (diag["contour_count"] >= 8) and (diag["convexity_deficit"] >= 0.50)
                # 3. Decisive non-cotton species by ML model (< 0.05 probability) with clear non-cotton traits
                is_confirmed_other_species = (prob_cotton < 0.05) and (diag["green_ratio"] >= 0.15 or diag["foliar_ratio"] >= 0.25) and (diag["skin_ratio"] >= 0.20 or diag["aspect_ratio"] >= 2.2)

                if is_confirmed_monocot or is_confirmed_compound or is_confirmed_other_species:
                    return (
                        False,
                        "UNSUPPORTED_PLANT",
                        "Unsupported Plant — AgroVision currently analyses cotton leaves only. Please upload an image of a cotton plant leaf.",
                        diag
                    )

                # D. Uncertain Botanical Foliar Tissue Zone (Separate Classification)
                # Real cotton leaves subjected to severe chlorosis/necrosis, extreme sunlight/shadow,
                # white paper background, or acute angles may score in the uncertain zone.
                # Per engineering requirements: reject confirmed non-cotton, but classify uncertain
                # images separately as eligible for CNN foliar diagnostic analysis rather than falsely rejecting.
                has_foliar_tissue = (diag["foliar_ratio"] >= 0.10 or color_foliar >= 0.10) and (diag["foliar_dominance"] >= 0.40)
                if has_foliar_tissue:
                    diag["is_uncertain"] = True
                    diag["uncertainty_advisory"] = "Cotton leaf detected with moderate confidence under challenging field conditions. Proceeding with diagnostic analysis."
                    return (
                        True,
                        "UNCERTAIN_COTTON_LEAF",
                        "Cotton leaf detected with moderate confidence. Proceeding with diagnostic analysis.",
                        diag
                    )
                else:
                    return (
                        False,
                        "UNRELATED_IMAGE",
                        "Invalid Image — This image does not appear to contain a cotton leaf. Please upload a clear cotton leaf photograph.",
                        diag
                    )
            except Exception as e:
                logger.error(f"Error during Cotton Leaf Gate model inference: {e}", exc_info=True)

        # 6. Deterministic Fallback if model unavailable
        # A. Confirmed non-cotton plants:
        is_monocot = (diag["aspect_ratio"] >= 2.4) and (diag["green_ratio"] >= 0.10 or diag["foliar_ratio"] >= 0.15)
        is_compound = (diag["contour_count"] >= 8) and (diag["foliar_dominance"] < 0.35)
        if is_monocot or is_compound:
            return (
                False,
                "UNSUPPORTED_PLANT",
                "Unsupported Plant — AgroVision currently analyses cotton leaves only. Please upload an image of a cotton plant leaf.",
                diag
            )

        # B. Standard cotton geometry
        is_cotton_geometry = (diag["aspect_ratio"] <= 2.2) and (diag["contour_count"] <= 8) and (diag["foliar_dominance"] >= 0.40)
        has_foliar = (diag["foliar_ratio"] >= 0.10) or (color_foliar >= 0.10)
        
        if is_cotton_geometry and (diag["foliar_ratio"] >= 0.15):
            return True, "VALID_COTTON_LEAF", "Valid cotton leaf detected.", diag
        elif has_foliar and (diag["foliar_dominance"] >= 0.40):
            diag["is_uncertain"] = True
            diag["uncertainty_advisory"] = "Cotton leaf detected with moderate confidence under challenging field conditions. Proceeding with diagnostic analysis."
            return (
                True,
                "UNCERTAIN_COTTON_LEAF",
                "Cotton leaf detected with moderate confidence. Proceeding with diagnostic analysis.",
                diag
            )
        else:
            return (
                False,
                "UNRELATED_IMAGE",
                "Invalid Image — This image does not appear to contain a cotton leaf. Please upload a clear cotton leaf photograph.",
                diag
            )


# Global helper matching previous function signature for seamless backward compatibility
def validate_cotton_leaf_image(
    image_input: Union[bytes, str, Path, BytesIO, Image.Image],
    min_foliar_ratio: float = 0.15,
) -> Tuple[bool, str, dict]:
    """
    Validates whether the provided image contains a genuine botanical cotton plant leaf.
    Returns:
        (is_leaf: bool, user_message: str, diagnostics: dict)
    """
    gate = CottonLeafGate.get_instance()
    is_valid, category, message, diagnostics = gate.validate(image_input)
    diagnostics["category"] = category
    return is_valid, message, diagnostics
