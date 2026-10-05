# pyrefly: ignore [missing-import]
"""
AgroVision SNN — exact architecture reproduced from notebooks/snn_training.ipynb (cell 36).

33 input features -> 64 hidden -> 64 hidden -> 3 output classes, run over T=10
time steps with snnTorch Leaky Integrate-and-Fire neurons. Output decoding during
training and evaluation: sum output spikes over time, argmax over classes.

The trained checkpoint (backend/models/agrovision_snn.pth) is a plain state_dict
saved by the same architecture; it loads with strict=True only into this
snnTorch-based definition (the Leaky neurons own the `lif*.beta / threshold /
graded_spikes_factor / reset_mechanism_val` entries).

Verified: checkpoint + reproduced preprocessing reproduce the training
notebook's test accuracy of 0.9181 exactly (scripts/validate_snn_parity.py).
"""
import snntorch as snn
import snntorch.surrogate as surrogate
import torch
from torch import nn

# Class index mapping from the training notebook's LabelEncoder (alphabetical):
# 0 = High, 1 = Low, 2 = Moderate
SNN_CLASSES = ["High", "Low", "Moderate"]


class AgroVisionSNN(nn.Module):
    """AgroVision environmental stress SNN (33 -> 64 -> 64 -> 3, T=10 Leaky LIF)."""

    def __init__(self, input_size=33, hidden_size=64, output_size=3, beta=0.95, timesteps=10):
        super().__init__()
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.output_size = output_size
        self.beta = beta
        self.timesteps = timesteps

        self.fc1 = nn.Linear(input_size, hidden_size)
        self.lif1 = snn.Leaky(beta=beta, spike_grad=surrogate.fast_sigmoid())

        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.lif2 = snn.Leaky(beta=beta, spike_grad=surrogate.fast_sigmoid())

        self.fc3 = nn.Linear(hidden_size, output_size)
        self.lif3 = snn.Leaky(beta=beta, spike_grad=surrogate.fast_sigmoid())

    def forward(self, x):
        """
        x shape: (batch, 33) — the same static input is presented at every step.
        Returns spike record of shape (T, batch, 3); decode with .sum(dim=0).
        """
        mem1 = self.lif1.init_leaky()
        mem2 = self.lif2.init_leaky()
        mem3 = self.lif3.init_leaky()

        spike_record = []
        for _ in range(self.timesteps):
            current1 = self.fc1(x)
            spike1, mem1 = self.lif1(current1, mem1)

            current2 = self.fc2(spike1)
            spike2, mem2 = self.lif2(current2, mem2)

            current3 = self.fc3(spike2)
            spike3, mem3 = self.lif3(current3, mem3)

            spike_record.append(spike3)

        return torch.stack(spike_record)
