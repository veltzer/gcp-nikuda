"""Make src/ importable and run tests from the repo root (the app opens its
data and static files relative to the repo root)."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))
os.chdir(ROOT)
