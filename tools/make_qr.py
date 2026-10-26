"""
Generate static, print-ready QR codes for each team member.

Usage:
    pip install "qrcode[pil]"
    python tools/make_qr.py https://<github-username>.github.io/<repo-name>/

Outputs to qr/:  <member>.svg (use this in Canva) and <member>.png (1200 px backup)
QR codes are static: they encode the URL directly, never expire and have no tracking redirect.
"""
import sys
from pathlib import Path

import qrcode
import qrcode.image.svg
from qrcode.constants import ERROR_CORRECT_Q

MEMBERS = ["sylvain", "gorata", "arabang"]  # must match `id` in docs/config.js


def main():
    if len(sys.argv) != 2 or not sys.argv[1].startswith("https://"):
        sys.exit("Usage: python tools/make_qr.py https://<user>.github.io/<repo>/")
    base = sys.argv[1].rstrip("/") + "/"
    if "/dev" in base or "script.google.com" in base:
        sys.exit("Use the GitHub Pages URL, not the Apps Script URL.")

    out = Path(__file__).resolve().parent.parent / "qr"
    out.mkdir(exist_ok=True)

    for m in MEMBERS:
        url = f"{base}?member={m}"
        qr = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, border=4, box_size=10)
        qr.add_data(url)
        qr.make(fit=True)

        qr.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(out / f"{m}.svg")

        img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        img = img.resize((1200, 1200), resample=0)  # nearest-neighbour keeps edges sharp
        img.save(out / f"{m}.png", dpi=(600, 600))
        print(f"{m:8s} -> {url}")

    print(f"\nSaved to {out}")


if __name__ == "__main__":
    main()
