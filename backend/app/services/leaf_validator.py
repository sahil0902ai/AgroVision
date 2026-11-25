"""
AgroVision Botanical Foliar & Cotton Leaf Validation Service.
Exposes validate_cotton_leaf_image powered by the CottonLeafGate ML model.
"""

from typing import Any, Tuple, Union
from io import BytesIO
from pathlib import Path
from PIL import Image

try:
    from .cotton_leaf_gate import CottonLeafGate, validate_cotton_leaf_image
except ImportError:
    from backend.app.services.cotton_leaf_gate import CottonLeafGate, validate_cotton_leaf_image

__all__ = ["CottonLeafGate", "validate_cotton_leaf_image"]
