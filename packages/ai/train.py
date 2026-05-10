"""
train.py — Fine-tune YOLOv8-seg on your own AnnotateMe data.

Quick start
-----------
1. Export your annotations from AnnotateMe:
      Menu → Export → COCO JSON   (saves annotations.json + images/)

2. Run this script:
      python3 train.py --data annotations.json --images ./images

3. Point the server at your new weights:
      In model.py, change active_model to:
        active_model = ProductionModel(weights="runs/segment/train/weights/best.pt")

What this script does
---------------------
  • Converts AnnotateMe / COCO JSON format → YOLO segmentation format
  • Creates a dataset YAML that Ultralytics understands
  • Fine-tunes (transfer-learns) from a pre-trained YOLOv8 checkpoint
  • Saves the best weights to runs/segment/train/weights/best.pt

Requirements
------------
  pip install ultralytics pillow

For GPU training (strongly recommended for large datasets):
  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image


# ── COCO → YOLO conversion ────────────────────────────────────────────────────

def coco_to_yolo_seg(
    coco_json: Path,
    images_dir: Path,
    out_dir: Path,
    val_split: float = 0.1,
) -> Path:
    """
    Convert a COCO-format JSON (polygons) into a YOLO segmentation dataset.

    Directory layout produced:
        out_dir/
          dataset.yaml
          images/train/   images/val/
          labels/train/   labels/val/
    """
    print(f"Loading COCO annotations from {coco_json} …")
    with open(coco_json) as f:
        coco = json.load(f)

    # Build lookup maps
    categories: list[dict] = coco.get("categories", [])
    cat_id_to_idx: dict[int, int] = {c["id"]: i for i, c in enumerate(categories)}
    cat_names: list[str] = [c["name"] for c in categories]

    images_meta: dict[int, dict] = {img["id"]: img for img in coco.get("images", [])}
    annotations: list[dict] = coco.get("annotations", [])

    # Group annotations by image id
    img_to_anns: dict[int, list[dict]] = {}
    for ann in annotations:
        img_to_anns.setdefault(ann["image_id"], []).append(ann)

    # Train / val split
    all_image_ids = list(images_meta.keys())
    np.random.shuffle(all_image_ids)
    n_val = max(1, int(len(all_image_ids) * val_split))
    val_ids = set(all_image_ids[:n_val])

    # Create output directories
    for split in ("train", "val"):
        (out_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (out_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    converted = skipped = 0

    for img_id, meta in images_meta.items():
        split = "val" if img_id in val_ids else "train"
        src_img = images_dir / meta["file_name"]
        if not src_img.exists():
            # Try without subdirectory prefix
            src_img = images_dir / Path(meta["file_name"]).name
        if not src_img.exists():
            skipped += 1
            continue

        # Copy image
        dst_img = out_dir / "images" / split / src_img.name
        shutil.copy2(src_img, dst_img)

        # Write label file
        w, h = meta["width"], meta["height"]
        lines: list[str] = []

        for ann in img_to_anns.get(img_id, []):
            cat_idx = cat_id_to_idx.get(ann["category_id"])
            if cat_idx is None:
                continue

            seg = ann.get("segmentation", [])
            if not seg:
                # Fall back to bbox if no polygon
                bx, by, bw, bh = ann["bbox"]
                cx = (bx + bw / 2) / w
                cy = (by + bh / 2) / h
                nw, nh = bw / w, bh / h
                # Fake polygon from bbox corners (normalised)
                pts = f"{bx/w:.6f} {by/h:.6f} {(bx+bw)/w:.6f} {by/h:.6f} " \
                      f"{(bx+bw)/w:.6f} {(by+bh)/h:.6f} {bx/w:.6f} {(by+bh)/h:.6f}"
                lines.append(f"{cat_idx} {pts}")
                continue

            for poly in seg:
                if len(poly) < 6:  # need at least 3 points
                    continue
                pts_norm = []
                it = iter(poly)
                for px, py in zip(it, it):
                    pts_norm.append(f"{px / w:.6f} {py / h:.6f}")
                lines.append(f"{cat_idx} {' '.join(pts_norm)}")

        label_path = out_dir / "labels" / split / (src_img.stem + ".txt")
        label_path.write_text("\n".join(lines))
        converted += 1

    print(f"  Converted {converted} images ({len(all_image_ids) - n_val} train / {n_val} val), "
          f"skipped {skipped} missing images.")

    # Write dataset YAML
    yaml_path = out_dir / "dataset.yaml"
    yaml_path.write_text(
        f"path: {out_dir.resolve()}\n"
        f"train: images/train\n"
        f"val:   images/val\n"
        f"nc: {len(cat_names)}\n"
        f"names: {cat_names}\n"
    )
    print(f"  Dataset YAML → {yaml_path}")
    return yaml_path


# ── training ──────────────────────────────────────────────────────────────────

def train(
    data_yaml: Path,
    base_weights: str = "yolov8n-seg.pt",
    epochs: int = 50,
    imgsz: int = 640,
    batch: int = 8,
    device: str | None = None,
    project: str = "runs/segment",
    name: str = "train",
    resume: bool = False,
) -> None:
    """Run fine-tuning via Ultralytics Trainer."""
    try:
        from ultralytics import YOLO  # type: ignore
    except ImportError:
        print("ERROR: ultralytics is not installed.  Run:  pip install ultralytics")
        raise SystemExit(1)

    print(f"\nStarting fine-tuning")
    print(f"  Base weights : {base_weights}")
    print(f"  Dataset      : {data_yaml}")
    print(f"  Epochs       : {epochs}")
    print(f"  Image size   : {imgsz}")
    print(f"  Batch        : {batch}")
    print(f"  Device       : {device or 'auto'}\n")

    model = YOLO(base_weights)
    model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=device,
        project=project,
        name=name,
        resume=resume,
        # Augmentation — good defaults for annotation datasets
        hsv_h=0.015, hsv_s=0.7, hsv_v=0.4,
        fliplr=0.5, scale=0.5, translate=0.1, mosaic=1.0,
        # Disable plots to keep output clean
        plots=False,
    )

    best = Path(project) / name / "weights" / "best.pt"
    print(f"\nTraining complete.  Best weights: {best}")
    print(f"\nTo use your model, edit packages/ai/model.py and set:")
    print(f'    active_model = ProductionModel(weights="{best}")')


# ── evaluate ──────────────────────────────────────────────────────────────────

def evaluate(weights: str, data_yaml: Path, imgsz: int = 640) -> None:
    """Run mAP evaluation on the validation split."""
    try:
        from ultralytics import YOLO  # type: ignore
    except ImportError:
        raise SystemExit("Install ultralytics first.")

    model = YOLO(weights)
    metrics = model.val(data=str(data_yaml), imgsz=imgsz)
    print(f"\nValidation results:")
    print(f"  mAP50      (box) : {metrics.box.map50:.4f}")
    print(f"  mAP50-95   (box) : {metrics.box.map:.4f}")
    if hasattr(metrics, "seg"):
        print(f"  mAP50    (mask) : {metrics.seg.map50:.4f}")
        print(f"  mAP50-95 (mask) : {metrics.seg.map:.4f}")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fine-tune YOLOv8-seg on AnnotateMe exported data.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # ── train ──────────────────────────────────────────────────────────────
    t = sub.add_parser("train", help="Convert data and run fine-tuning")
    t.add_argument("--data",   required=True, help="Path to COCO annotations.json")
    t.add_argument("--images", required=True, help="Directory containing the images")
    t.add_argument("--out",    default="dataset", help="Where to write the YOLO dataset")
    t.add_argument("--weights",default="yolov8n-seg.pt",
                   help="Base checkpoint.  Use a larger model for better accuracy:\n"
                        "  yolov8n-seg.pt  yolov8s-seg.pt  yolov8m-seg.pt  yolov8l-seg.pt")
    t.add_argument("--epochs", type=int, default=50)
    t.add_argument("--imgsz",  type=int, default=640)
    t.add_argument("--batch",  type=int, default=8)
    t.add_argument("--device", default=None,
                   help="Training device: 'cpu', '0' (first GPU), '0,1' (multi-GPU), 'mps'")
    t.add_argument("--val-split", type=float, default=0.1,
                   help="Fraction of images held out for validation")
    t.add_argument("--resume", action="store_true",
                   help="Resume an interrupted training run")

    # ── eval ───────────────────────────────────────────────────────────────
    e = sub.add_parser("eval", help="Evaluate a trained model on the validation set")
    e.add_argument("--weights", required=True, help="Path to best.pt")
    e.add_argument("--data",    required=True, help="Path to COCO annotations.json")
    e.add_argument("--images",  required=True, help="Images directory")
    e.add_argument("--imgsz",   type=int, default=640)

    args = parser.parse_args()

    if args.cmd == "train":
        data_yaml = coco_to_yolo_seg(
            coco_json=Path(args.data),
            images_dir=Path(args.images),
            out_dir=Path(args.out),
            val_split=args.val_split,
        )
        train(
            data_yaml=data_yaml,
            base_weights=args.weights,
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch=args.batch,
            device=args.device,
            resume=args.resume,
        )

    elif args.cmd == "eval":
        data_yaml = coco_to_yolo_seg(
            coco_json=Path(args.data),
            images_dir=Path(args.images),
            out_dir=Path("dataset_eval"),
            val_split=1.0,
        )
        evaluate(args.weights, data_yaml, args.imgsz)


if __name__ == "__main__":
    main()
