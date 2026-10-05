import numpy as np
import torch
import torch.nn.functional as F
from ai_models.agrovision_snn import SNN_CLASSES, AgroVisionSNN


def test_snn_inference():
    print("==========================================")
    print("Testing Task 2: AgroVisionSNN Inference Engine")
    print("==========================================")
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using execution device: {device}")
    
    # 1. Instantiate SNN Model
    model = AgroVisionSNN(input_size=33, hidden_size=64, output_size=3, beta=0.95, timesteps=10).to(device)
    model.eval()
    print("[OK] AgroVisionSNN model instantiated successfully.")
    
    # 2. Synthetic 33-dimensional normalized feature vector
    dummy_input = torch.rand(1, 33, dtype=torch.float32, device=device)
    print(f"[OK] Synthetic input feature vector shape: {dummy_input.shape}")
    
    # 3. Simulate SNN Spiking Dynamics over T=10 time steps
    with torch.no_grad():
        spike_stack = model(dummy_input) # Shape: (T=10, 1, 3)
        spike_counts = spike_stack.sum(dim=0).squeeze().cpu().numpy() # Shape: (3,)
        probs = F.softmax(torch.tensor(spike_counts, dtype=torch.float32), dim=0).numpy()

    print(f"[OK] Spike stack tensor output shape: {spike_stack.shape} (T=10 timesteps)")
    print(f"[OK] Total spike counts per class over T=10 steps: {spike_counts}")
    
    # 4. Class Severity Output Verification
    pred_idx = int(np.argmax(spike_counts))
    pred_severity = SNN_CLASSES[pred_idx]
    confidence = float(probs[pred_idx]) * 100.0
    
    print("\nSNN Severity Output Mapping:")
    for idx, severity_label in enumerate(SNN_CLASSES):
        print(f"  - [{idx}] {severity_label}: {int(spike_counts[idx])} spikes ({probs[idx] * 100:.2f}% softmax score)")
        
    print(f"\n[OK] Winner Severity Prediction: {pred_severity} with {confidence:.2f}% confidence")
    assert spike_stack.shape == (10, 1, 3), f"Invalid spike stack shape {spike_stack.shape}"
    print("\n>>> Task 2 Validation PASSED Successfully! <<<\n")

if __name__ == "__main__":
    test_snn_inference()
