from torch import nn
from torchvision import transforms


class AgroVisionCNN(nn.Module):
    """
    Exact CNN architecture from notebooks/cnn_training.ipynb.
    Processes (B, 3, 224, 224) cotton leaf images and outputs 5 class logits:
    0: 0_healthy, 1: 1_water_stress, 2: 2_heat_stress, 3: 3_nutrient_deficiency, 4: 4_pollution.
    """
    def __init__(self, num_classes=5):
        super().__init__()
        
        self.features = nn.Sequential(
            # Block 1
            nn.Conv2d(3, 32, kernel_size=3, padding=1),  # idx 0
            nn.BatchNorm2d(32),                         # idx 1
            nn.ReLU(),                                   # idx 2
            nn.MaxPool2d(2),                             # idx 3
            
            # Block 2
            nn.Conv2d(32, 64, kernel_size=3, padding=1), # idx 4
            nn.BatchNorm2d(64),                         # idx 5
            nn.ReLU(),                                   # idx 6
            nn.MaxPool2d(2),                             # idx 7
            
            # Block 3
            nn.Conv2d(64, 128, kernel_size=3, padding=1),# idx 8 (Target for Grad-CAM)
            nn.BatchNorm2d(128),                        # idx 9
            nn.ReLU(),                                   # idx 10
            nn.MaxPool2d(2)                              # idx 11
        )

        self.classifier = nn.Sequential(
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Flatten(),
            nn.Linear(128, 128),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, num_classes)
        )

    def forward(self, x):
        feat_map = self.features(x)
        out = self.classifier(feat_map)
        return out

    def extract_features(self, x):
        """Returns the 128-dim dense feature embedding and conv feature maps."""
        feat_map = self.features(x)
        pooled = self.classifier[0](feat_map)
        flat_feats = self.classifier[1](pooled)
        dense_feats = self.classifier[2](flat_feats)
        return dense_feats, feat_map

CLASSES = [
    "0_healthy",
    "1_water_stress",
    "2_heat_stress",
    "3_nutrient_deficiency",
    "4_pollution"
]

CLASS_LABELS_MAP = {
    "0_healthy": "Healthy",
    "1_water_stress": "Water Stress",
    "2_heat_stress": "Heat Stress",
    "3_nutrient_deficiency": "Nutrient Deficiency",
    "4_pollution": "Pollution"
}

def get_cnn_transforms():
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        )
    ])
