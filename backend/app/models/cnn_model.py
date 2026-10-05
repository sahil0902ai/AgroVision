import torch
from torch import nn
from torchvision import transforms


class AgroVisionCNN(nn.Module):
    """
    AgroVision Compact Custom CNN Architecture.
    - 3 Convolutional Blocks with BatchNorm, ReLU, and MaxPool 2x2.
    - Adaptive Global Average Pooling.
    - Dense Linear (128 -> 128) with ReLU and Dropout (0.3).
    - Final Linear (128 -> 5) outputting 5 cotton stress classes.
    - Total trainable parameters: ~110,853.
    """
    def __init__(self, num_classes: int = 5):
        super().__init__()
        
        self.features = nn.Sequential(
            # Block 1
            nn.Conv2d(3, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),
            
            # Block 2
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),
            
            # Block 3
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            nn.MaxPool2d(2)
        )
        
        self.classifier = nn.Sequential(
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Flatten(),
            nn.Linear(128, 128),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, num_classes)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feat_map = self.features(x)
        out = self.classifier(feat_map)
        return out

    def extract_features(self, x: torch.Tensor):
        """Extracts 128-dim dense feature embedding and convolutional feature map."""
        feat_map = self.features(x)
        pooled = self.classifier[0](feat_map)
        flat_feats = self.classifier[1](pooled)
        dense_feats = self.classifier[2](flat_feats)
        return dense_feats, feat_map


# Exact 5-class mapping in order (index 0 to 4)
CLASS_NAMES = [
    "Healthy",
    "Water Stress",
    "Heat Stress",
    "Nutrient Deficiency",
    "Pollution"
]

def get_inference_transforms():
    """
    Deterministic inference preprocessing matching training validation transform:
    - Resize to 224x224
    - ToTensor
    - Normalize using ImageNet mean & std
    """
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        )
    ])
