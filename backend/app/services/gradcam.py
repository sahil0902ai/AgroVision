import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image


class GradCAM:
    """
    Grad-CAM Heatmap Visualizer for AgroVisionCNN.
    Targets Block 3 Convolutional Layer (features[8]).
    """
    def __init__(self, model, target_layer=None):
        self.model = model
        self.model.eval()
        self.target_layer = target_layer if target_layer is not None else model.features[8]
        
        self.gradients = None
        self.activations = None
        
        # Register hooks
        self.target_layer.register_forward_hook(self._save_activations)
        self.target_layer.register_full_backward_hook(self._save_gradients)

    def _save_activations(self, module, input, output):
        self.activations = output.detach()

    def _save_gradients(self, module, grad_input, grad_output):
        self.gradients = grad_output[0].detach()

    def generate_heatmap(self, input_tensor, target_class_idx=None):
        """
        input_tensor: (1, 3, 224, 224) PyTorch tensor
        Returns: 2D numpy array heatmap in range [0, 1]
        """
        input_tensor.requires_grad = True
        outputs = self.model(input_tensor)
        
        if target_class_idx is None:
            target_class_idx = torch.argmax(outputs, dim=1).item()
            
        score = outputs[0, target_class_idx]
        self.model.zero_grad()
        score.backward()
        
        weights = torch.mean(self.gradients, dim=(2, 3), keepdim=True)
        cam = torch.sum(weights * self.activations, dim=1, keepdim=True)
        cam = F.relu(cam) # Apply ReLU to keep positive activations
        
        heatmap = cam.squeeze().cpu().numpy()
        if np.max(heatmap) > 0:
            heatmap = heatmap / np.max(heatmap)
            
        heatmap = cv2.resize(heatmap, (224, 224))
        return heatmap

def overlay_heatmap_on_image(pil_img, heatmap_np, alpha=0.5):
    """
    Overlays a 2D float heatmap [0, 1] on a PIL RGB Image.
    Returns PIL Image with colored heatmap overlay.
    """
    orig_np = np.array(pil_img.resize((224, 224)))
    
    heatmap_colored = cv2.applyColorMap(np.uint8(255 * heatmap_np), cv2.COLORMAP_JET)
    heatmap_colored = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)
    
    overlayed = (alpha * heatmap_colored + (1 - alpha) * orig_np).astype(np.uint8)
    return Image.fromarray(overlayed)
