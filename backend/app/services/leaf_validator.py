"""
AgroVision Botanical Foliar Validation Service.
Analyzes image pixel distributions, chromaticity, foliar HSV masks (chlorophyll green,
chlorotic yellow, necrotic brown, dust/pest olive), and surface micro-texture.

Rejects non-plant out-of-domain images (such as vehicles, cars, human faces, buildings,
metallic surfaces, screenshots, and synthetic graphics) to ensure only genuine cotton plant
leaves are processed by the deep learning inference pipeline.
"""

import logging
from io import BytesIO
from pathlib import Path
from typing import Any, Union

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger("agrovision.leaf_validator")


def validate_cotton_leaf_image(
    image_input: Union[bytes, str, Path, BytesIO, Image.Image],
    min_foliar_ratio: float = 0.08,
) -> tuple[bool, str, dict[str, Any]]:
    """
    Validates whether the provided image contains a genuine botanical cotton plant leaf.

    Args:
        image_input: Image bytes, file path, BytesIO, or PIL Image.
        min_foliar_ratio: Minimum ratio of foliar plant pixels required (default 8%).

    Returns:
        (is_leaf: bool, message: str, stats: dict)
    """
    # 1. Resolve PIL Image
    pil_img: Image.Image
    try:
        if isinstance(image_input, (str, Path)):
            p = Path(image_input)
            if not p.is_file():
                return False, f"Image file does not exist: {p}", {}
            pil_img = Image.open(p)
        elif isinstance(image_input, bytes):
            if not image_input:
                return False, "Empty image data provided.", {}
            pil_img = Image.open(BytesIO(image_input))
        elif isinstance(image_input, BytesIO):
            pil_img = Image.open(image_input)
        elif isinstance(image_input, Image.Image):
            pil_img = image_input
        else:
            return False, "Unsupported image input type.", {}

        rgb_img = pil_img.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as err:
        return False, f"Unable to read or decode image file: {err}", {}

    w, h = rgb_img.size
    if w < 48 or h < 48:
        return (
            False,
            f"Image resolution is too low ({w}x{h} px). Please upload a clear photo of at least 150x150 pixels.",
            {"width": w, "height": h},
        )

    # 2. Convert to numpy RGB
    rgb = np.array(rgb_img)
    r = rgb[:, :, 0].astype(float)
    g = rgb[:, :, 1].astype(float)
    b = rgb[:, :, 2].astype(float)

    # 3. Calculate chromatic difference (filters out greyscale asphalt, road, grey car metal)
    chroma = np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])
    is_chromatic = chroma >= 16.0

    # 4. OpenCV HSV analysis (H: 0-180, S: 0-255, V: 0-255)
    try:
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        hue = hsv[:, :, 0]
        sat = hsv[:, :, 1]
        val = hsv[:, :, 2]
    except Exception as e:
        logger.warning(f"cv2.cvtColor failed: {e}, falling back to RGB heuristic")
        # Pure RGB fallback if OpenCV colorspace conversion encounters error
        mask_green = (g > r + 10) & (g > b) & is_chromatic
        mask_yellow = (r > 60) & (g > 60) & (b < g) & (abs(r - g) < 55) & is_chromatic
        mask_brown = (r > b + 15) & (g > b) & (r > 50) & (r < 210) & is_chromatic
        plant_mask = mask_green | mask_yellow | mask_brown
        foliar_ratio = float(np.count_nonzero(plant_mask) / plant_mask.size)
        if foliar_ratio < min_foliar_ratio:
            return False, "No cotton plant leaf detected in the uploaded image. Please upload a clear photo of a cotton plant leaf from your field.", {"foliar_ratio": foliar_ratio}
        return True, "Valid plant leaf detected.", {"foliar_ratio": foliar_ratio}

    # Foliar masks:
    # A. Green chlorophyll (healthy foliage, light to dark green)
    # H in [22, 92] corresponds to ~44° to 184° in 360° color space
    mask_green = (
        (hue >= 22)
        & (hue <= 92)
        & (sat >= 26)
        & (val >= 26)
        & (g >= r - 18)
        & (g >= b - 12)
        & is_chromatic
    )

    # B. Yellow chlorosis / nitrogen deficiency (pale green to bright yellow)
    # H in [14, 28] (~28° to 56°)
    mask_yellow = (
        (hue >= 14)
        & (hue <= 28)
        & (sat >= 30)
        & (val >= 35)
        & (r >= 45)
        & (g >= 45)
        & (b < g + 15)
        & is_chromatic
    )

    # C. Necrosis / heat scorch / drought wilting (earthy brownish-yellow to dark brown)
    # H in [5, 20] (~10° to 40°)
    mask_brown = (
        (hue >= 5)
        & (hue <= 20)
        & (sat >= 26)
        & (val >= 22)
        & (val <= 220)
        & (r > b + 8)
        & (g > b - 8)
        & is_chromatic
    )

    # D. Olive / grey-green dust-affected foliage
    mask_olive = (
        (hue >= 18)
        & (hue <= 88)
        & (sat >= 18)
        & (val >= 18)
        & (val <= 215)
        & (g >= b - 12)
        & is_chromatic
    )

    plant_mask = mask_green | mask_yellow | mask_brown | mask_olive
    foliar_ratio = float(np.count_nonzero(plant_mask) / plant_mask.size)

    # 5. Biological surface texture analysis (Laplacian variance)
    try:
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    except Exception:
        laplacian_var = 50.0

    stats = {
        "foliar_ratio": round(foliar_ratio, 4),
        "laplacian_var": round(laplacian_var, 2),
        "width": w,
        "height": h,
    }

    # Reject non-botanical images (cars, faces, buildings, random objects)
    if foliar_ratio < min_foliar_ratio:
        return (
            False,
            "No cotton plant leaf detected in the uploaded image. Please upload a clear photo of a cotton plant leaf from your field.",
            stats,
        )

    # Reject synthetic single-color blocks lacking physical texture
    if laplacian_var < 8.0 and foliar_ratio < 0.88:
        return (
            False,
            "Image lacks natural leaf surface texture. Please upload a real photograph of a cotton plant leaf.",
            stats,
        )

    return True, "Valid cotton leaf detected.", stats
