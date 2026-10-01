"""Classifier for "Oye Quanela" (ADR 0016): 16 × 96 embeddings → probability."""
import torch
from torch import nn

class WakeNet(nn.Module):
    def __init__(self, dim=128, dropout=0.0):
        super().__init__()
        self.net = nn.Sequential(
            nn.Flatten(), nn.Dropout(dropout / 2), nn.Linear(16 * 96, dim), nn.LayerNorm(dim), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(dim, dim), nn.LayerNorm(dim), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(dim, 1),
        )

    def forward(self, x):  # logits
        return self.net(x).squeeze(-1)

class Exported(nn.Module):
    """What the browser runs: probability, shape [batch, 1]."""
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, features):
        return torch.sigmoid(self.model(features)).unsqueeze(-1)
