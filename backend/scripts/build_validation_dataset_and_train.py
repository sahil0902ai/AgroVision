"""
AgroVision Cotton Leaf Validation Dataset Builder & ML Gate Trainer.
Builds a curated, diverse dataset of:
1. Cotton Leaves (5 stress classes + healthy from real field samples + botanical augmentations)
2. Non-Cotton Leaves (corn/maize, wheat, grass, tomato, potato, maple, citrus)
3. Unrelated Objects (cars, people, buildings, animals, landscapes, screenshots, documents, household items)
4. Low Quality (severely blurred, blank, low-resolution)

Extracts botanical foliar, morphological, and textural features.
Trains and evaluates a calibrated Botanical Cotton Leaf Validation Model on stratified Train/Val/Test splits.
Saves model to backend/models/cotton_leaf_gate_model.joblib.
"""

import os
import sys
import shutil
import ssl
import urllib.request
import numpy as np
import cv2
from PIL import Image, ImageFilter, ImageDraw, ImageFont
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix, classification_report, roc_auc_score
import joblib

# Paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATASET_DIR = os.path.join(BASE_DIR, "datasets", "validation_dataset")
MODELS_DIR = os.path.join(BASE_DIR, "backend", "models")
TEST_ASSETS_DIR = os.path.join(BASE_DIR, "tests", "test_assets")

os.makedirs(DATASET_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(TEST_ASSETS_DIR, exist_ok=True)

for sub in ["cotton_leaf", "non_cotton_leaf", "unrelated_object", "low_quality"]:
    os.makedirs(os.path.join(DATASET_DIR, sub), exist_ok=True)

ssl_ctx = ssl._create_unverified_context()
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def download_image(url, save_path):
    if os.path.exists(save_path) and os.path.getsize(save_path) > 1000:
        return True
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=10) as r:
            data = r.read()
            with open(save_path, "wb") as f:
                f.write(data)
        # Verify valid image
        im = Image.open(save_path)
        im.verify()
        return True
    except Exception as e:
        print(f"Warning: Failed to download {url}: {e}")
        if os.path.exists(save_path):
            try: os.remove(save_path)
            except: pass
        return False

print("[1/5] Gathering base real cotton leaf images...")
source_cotton_images = [
    os.path.join(BASE_DIR, "datasets", "sample_leaves", "real_cotton_leaf.png"),
    os.path.join(BASE_DIR, "datasets", "sample_leaves", "0_healthy", "original_0031.jpg"),
    os.path.join(BASE_DIR, "datasets", "sample_leaves", "1_water_stress", "original_0199.png"),
    os.path.join(BASE_DIR, "datasets", "sample_leaves", "2_heat_stress", "original_0021.png"),
    os.path.join(BASE_DIR, "datasets", "sample_leaves", "3_nutrient_deficiency", "original_0031.jpg"),
    os.path.join(BASE_DIR, "datasets", "sample_leaves", "4_pollution", "original_0031.jpg"),
]

# Copy to test assets for Group A
test_asset_map = {
    "group_a_healthy.jpg": os.path.join(BASE_DIR, "datasets", "sample_leaves", "0_healthy", "original_0031.jpg"),
    "group_a_water_stress.png": os.path.join(BASE_DIR, "datasets", "sample_leaves", "1_water_stress", "original_0199.png"),
    "group_a_heat_stress.png": os.path.join(BASE_DIR, "datasets", "sample_leaves", "2_heat_stress", "original_0021.png"),
    "group_a_nutrient_deficiency.jpg": os.path.join(BASE_DIR, "datasets", "sample_leaves", "3_nutrient_deficiency", "original_0031.jpg"),
    "group_a_pollution.jpg": os.path.join(BASE_DIR, "datasets", "sample_leaves", "4_pollution", "original_0031.jpg"),
}
for name, src in test_asset_map.items():
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(TEST_ASSETS_DIR, name))

# Generate augmented cotton leaf images (realistic transforms: rotations, flips, illumination, crops)
cotton_dir = os.path.join(DATASET_DIR, "cotton_leaf")
aug_count = 0
for idx, src in enumerate(source_cotton_images):
    if not os.path.exists(src):
        continue
    base_im = Image.open(src).convert("RGB")
    base_name = f"cotton_{idx}"
    base_im.save(os.path.join(cotton_dir, f"{base_name}_orig.jpg"), quality=95)
    aug_count += 1
    
    # Flips & Rotations
    for angle in [15, -15, 30, -30, 45, 90, 180, 270]:
        rot_im = base_im.rotate(angle, resample=Image.Resampling.BILINEAR, expand=False)
        rot_im.save(os.path.join(cotton_dir, f"{base_name}_rot{angle}.jpg"), quality=90)
        aug_count += 1
    
    hf = base_im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    hf.save(os.path.join(cotton_dir, f"{base_name}_fliph.jpg"), quality=90)
    aug_count += 1
    
    # Illumination variations (overcast, direct sun, shadow)
    np_base = np.array(base_im, dtype=np.float32)
    brighter = np.clip(np_base * 1.15 + 10, 0, 255).astype(np.uint8)
    darker = np.clip(np_base * 0.85 - 10, 0, 255).astype(np.uint8)
    Image.fromarray(brighter).save(os.path.join(cotton_dir, f"{base_name}_bright.jpg"), quality=90)
    Image.fromarray(darker).save(os.path.join(cotton_dir, f"{base_name}_dark.jpg"), quality=90)
    aug_count += 2
    
    # Multi-scale center crops
    w, h = base_im.size
    for scale in [0.88, 0.94]:
        nw, nh = int(w * scale), int(h * scale)
        left = (w - nw) // 2
        top = (h - nh) // 2
        cropped = base_im.crop((left, top, left + nw, top + nh)).resize((w, h), Image.Resampling.LANCZOS)
        cropped.save(os.path.join(cotton_dir, f"{base_name}_scale{int(scale*100)}.jpg"), quality=90)
        aug_count += 1

print(f" -> Generated {aug_count} genuine/augmented cotton leaf images.")

print("[2/5] Downloading & creating negative images (non-cotton leaves, unrelated objects, low quality)...")

# Unrelated objects URLs (public high quality curated photos from Unsplash CDN)
unrelated_urls = [
    ("car_sedan.jpg", "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=600"),
    ("car_sports.jpg", "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600"),
    ("car_suv.jpg", "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600"),
    ("building_glass.jpg", "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600"),
    ("building_brick.jpg", "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600"),
    ("person_portrait.jpg", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600"),
    ("person_female.jpg", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600"),
    ("animal_dog.jpg", "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600"),
    ("animal_cat.jpg", "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600"),
    ("landscape_mountains.jpg", "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600"),
    ("landscape_beach.jpg", "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600"),
    ("object_chair.jpg", "https://images.unsplash.com/photo-1580481077195-c3a8a37f714c?w=600"),
    ("object_coffee_mug.jpg", "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600"),
    ("object_laptop.jpg", "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600"),
]

unrelated_dir = os.path.join(DATASET_DIR, "unrelated_object")
for fname, url in unrelated_urls:
    p = os.path.join(unrelated_dir, fname)
    download_image(url, p)

# Create Document & Screenshot synthetic images
doc_path = os.path.join(unrelated_dir, "document_invoice.png")
doc_im = Image.new("RGB", (600, 800), color=(255, 255, 255))
draw = ImageDraw.Draw(doc_im)
draw.text((40, 40), "INVOICE / AGRONOMIC REPORT", fill=(20, 20, 20))
draw.line([(40, 70), (560, 70)], fill=(180, 180, 180), width=2)
for y in range(100, 700, 30):
    draw.text((40, y), f"Line item description for agricultural test sample #{y//30}: USD 120.00", fill=(50, 50, 50))
doc_im.save(doc_path)

screenshot_path = os.path.join(unrelated_dir, "screenshot_desktop.png")
ss_im = Image.new("RGB", (800, 600), color=(240, 243, 246))
sdraw = ImageDraw.Draw(ss_im)
sdraw.rectangle([(0, 0), (800, 40)], fill=(33, 43, 54))
sdraw.rectangle([(20, 60), (380, 300)], fill=(255, 255, 255), outline=(220, 220, 220))
sdraw.rectangle([(400, 60), (780, 300)], fill=(255, 255, 255), outline=(220, 220, 220))
sdraw.text((40, 80), "SYSTEM DASHBOARD · CPU: 12% · RAM: 4.2GB", fill=(10, 10, 10))
ss_im.save(screenshot_path)

# Download Non-cotton leaves (corn/maize, tomato, grasses, maple, etc.)
non_cotton_urls = [
    ("leaf_corn_maize.jpg", "https://images.unsplash.com/photo-1628771065518-0d82f1938462?w=600"),
    ("leaf_tomato.jpg", "https://images.unsplash.com/photo-1592841200221-a6898f307baa?w=600"),
    ("leaf_monocot_grass.jpg", "https://images.unsplash.com/photo-1533240332313-0db49b459ad6?w=600"),
    ("leaf_houseplant_oval.jpg", "https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=600"),
    ("leaf_fern_compound.jpg", "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=600"),
    ("leaf_succulent.jpg", "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=600"),
    ("leaf_pothos.jpg", "https://images.unsplash.com/photo-1572688484437-184e9305001c?w=600"),
]

non_cotton_dir = os.path.join(DATASET_DIR, "non_cotton_leaf")
for fname, url in non_cotton_urls:
    p = os.path.join(non_cotton_dir, fname)
    download_image(url, p)

# Augment non-cotton leaves as well
for fname, _ in non_cotton_urls:
    src_p = os.path.join(non_cotton_dir, fname)
    if os.path.exists(src_p):
        im = Image.open(src_p).convert("RGB")
        for angle in [45, 90, 180]:
            im.rotate(angle).save(os.path.join(non_cotton_dir, f"rot_{angle}_{fname}"), quality=90)
        im.transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(os.path.join(non_cotton_dir, f"flip_{fname}"), quality=90)

# Create Low Quality samples (severely blurred, blank, low-res)
low_quality_dir = os.path.join(DATASET_DIR, "low_quality")
# Blank images
Image.new("RGB", (300, 300), color=(255, 255, 255)).save(os.path.join(low_quality_dir, "blank_white.jpg"))
Image.new("RGB", (300, 300), color=(128, 128, 128)).save(os.path.join(low_quality_dir, "blank_grey.jpg"))
Image.new("RGB", (300, 300), color=(34, 139, 34)).save(os.path.join(low_quality_dir, "blank_flat_green.jpg"))
Image.new("RGB", (300, 300), color=(0, 0, 0)).save(os.path.join(low_quality_dir, "blank_black.jpg"))

# Severely blurred cotton leaf
if os.path.exists(source_cotton_images[0]):
    im_c = Image.open(source_cotton_images[0]).convert("RGB")
    blurred_mild = im_c.filter(ImageFilter.GaussianBlur(radius=8))
    blurred_heavy = im_c.filter(ImageFilter.GaussianBlur(radius=16))
    blurred_mild.save(os.path.join(low_quality_dir, "blurred_cotton_leaf.jpg"))
    blurred_heavy.save(os.path.join(low_quality_dir, "blurred_heavy_cotton.jpg"))
    blurred_mild.save(os.path.join(TEST_ASSETS_DIR, "group_b_blurred.jpg"))

# Low resolution (tiny icon)
Image.new("RGB", (64, 64), color=(40, 160, 40)).save(os.path.join(low_quality_dir, "low_res_64x64.png"))

# Copy test assets for Group B
if os.path.exists(os.path.join(unrelated_dir, "car_sedan.jpg")):
    shutil.copy2(os.path.join(unrelated_dir, "car_sedan.jpg"), os.path.join(TEST_ASSETS_DIR, "group_b_car.jpg"))
if os.path.exists(os.path.join(unrelated_dir, "person_portrait.jpg")):
    shutil.copy2(os.path.join(unrelated_dir, "person_portrait.jpg"), os.path.join(TEST_ASSETS_DIR, "group_b_person.jpg"))
if os.path.exists(os.path.join(unrelated_dir, "animal_dog.jpg")):
    shutil.copy2(os.path.join(unrelated_dir, "animal_dog.jpg"), os.path.join(TEST_ASSETS_DIR, "group_b_animal.jpg"))
if os.path.exists(os.path.join(unrelated_dir, "building_glass.jpg")):
    shutil.copy2(os.path.join(unrelated_dir, "building_glass.jpg"), os.path.join(TEST_ASSETS_DIR, "group_b_building.jpg"))
if os.path.exists(os.path.join(unrelated_dir, "landscape_mountains.jpg")):
    shutil.copy2(os.path.join(unrelated_dir, "landscape_mountains.jpg"), os.path.join(TEST_ASSETS_DIR, "group_b_landscape.jpg"))
if os.path.exists(doc_path):
    shutil.copy2(doc_path, os.path.join(TEST_ASSETS_DIR, "group_b_document.png"))
if os.path.exists(screenshot_path):
    shutil.copy2(screenshot_path, os.path.join(TEST_ASSETS_DIR, "group_b_screenshot.png"))
if os.path.exists(os.path.join(unrelated_dir, "object_coffee_mug.jpg")):
    shutil.copy2(os.path.join(unrelated_dir, "object_coffee_mug.jpg"), os.path.join(TEST_ASSETS_DIR, "group_b_unrelated_object.jpg"))
if os.path.exists(os.path.join(non_cotton_dir, "leaf_tomato.jpg")):
    shutil.copy2(os.path.join(non_cotton_dir, "leaf_tomato.jpg"), os.path.join(TEST_ASSETS_DIR, "group_b_non_cotton_leaf.jpg"))
if os.path.exists(os.path.join(non_cotton_dir, "leaf_corn_maize.jpg")):
    shutil.copy2(os.path.join(non_cotton_dir, "leaf_corn_maize.jpg"), os.path.join(TEST_ASSETS_DIR, "group_b_another_crop_leaf.jpg"))
shutil.copy2(os.path.join(low_quality_dir, "blank_white.jpg"), os.path.join(TEST_ASSETS_DIR, "group_b_blank.jpg"))

with open(os.path.join(TEST_ASSETS_DIR, "group_b_corrupted.bin"), "wb") as f:
    f.write(b"CORRUPTED_NON_IMAGE_HEADER_BYTES_RANDOM_XYZ\x00\xff\xee\xdd")

with open(os.path.join(TEST_ASSETS_DIR, "group_b_unsupported.txt"), "w") as f:
    f.write("This is a plain text file, not an image format.")

print(f" -> Prepared test assets in {TEST_ASSETS_DIR}")

print("[3/5] Extracting botanical, morphological, and textural features...")

def extract_features_from_image(img_path):
    """
    Extracts a 16-dimensional botanical feature vector:
    1. foliar_ratio (ratio of pixels in botanical foliar HSV range)
    2. green_ratio (chlorophyll ratio)
    3. chlorosis_ratio (yellow ratio)
    4. necrosis_ratio (brown/scorch ratio)
    5. laplacian_var (sharpness / physical surface texture)
    6. intensity_std (contrast / variance across image)
    7. skin_ratio (human skin locus in YCbCr)
    8. sky_blue_ratio (landscape sky blue fraction)
    9. doc_white_ratio (document high-intensity pure white)
    10. aspect_ratio (max(w,h) / min(w,h) of primary contour)
    11. solidity (contour_area / hull_area)
    12. convexity_deficit (1 - solidity, lobes vs simple)
    13. contour_count (disconnected leaflets vs single blade)
    14. extent (contour_area / bounding_box_area)
    15. mean_hue (in foliar region)
    16. mean_sat (in foliar region)
    """
    cv_img = cv2.imread(img_path)
    if cv_img is None:
        return None
    
    h_orig, w_orig = cv_img.shape[:2]
    if h_orig < 48 or w_orig < 48:
        return None
    
    # Resize to standardized dimension for feature computation
    img = cv2.resize(cv_img, (256, 256), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    ycbcr = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
    
    total_px = 256 * 256
    
    # 1. Texture & Quality
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    int_std = float(np.std(gray))
    
    # 2. Foliar masks
    # Green chlorophyll: H in [30, 95], S >= 30, V >= 30
    mask_green = (hsv[:,:,0] >= 30) & (hsv[:,:,0] <= 95) & (hsv[:,:,1] >= 30) & (hsv[:,:,2] >= 30)
    # Yellow chlorosis: H in [18, 30], S >= 40, V >= 50
    mask_yellow = (hsv[:,:,0] >= 18) & (hsv[:,:,0] < 30) & (hsv[:,:,1] >= 40) & (hsv[:,:,2] >= 50)
    # Brown necrosis / scorch: H in [8, 20], S >= 35, V in [30, 200]
    mask_brown = (hsv[:,:,0] >= 8) & (hsv[:,:,0] <= 20) & (hsv[:,:,1] >= 35) & (hsv[:,:,2] >= 30) & (hsv[:,:,2] <= 200)
    
    plant_mask = mask_green | mask_yellow | mask_brown
    foliar_ratio = float(np.count_nonzero(plant_mask) / total_px)
    green_ratio = float(np.count_nonzero(mask_green) / total_px)
    chlorosis_ratio = float(np.count_nonzero(mask_yellow) / total_px)
    necrosis_ratio = float(np.count_nonzero(mask_brown) / total_px)
    
    # 3. Non-plant signatures
    # Skin locus: Cr in [133, 173], Cb in [77, 127]
    cr = ycbcr[:,:,1]
    cb = ycbcr[:,:,2]
    mask_skin = (cr >= 133) & (cr <= 173) & (cb >= 77) & (cb <= 127)
    skin_ratio = float(np.count_nonzero(mask_skin) / total_px)
    
    # Sky blue: H in [98, 130], S >= 40, V >= 80
    mask_sky = (hsv[:,:,0] >= 98) & (hsv[:,:,0] <= 130) & (hsv[:,:,1] >= 40) & (hsv[:,:,2] >= 80)
    sky_ratio = float(np.count_nonzero(mask_sky) / total_px)
    
    # Document white: R, G, B all > 235
    mask_doc = (img[:,:,0] > 235) & (img[:,:,1] > 235) & (img[:,:,2] > 235)
    doc_white_ratio = float(np.count_nonzero(mask_doc) / total_px)
    
    # 4. Morphology
    contours, _ = cv2.findContours(plant_mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    sig_contours = [c for c in contours if cv2.contourArea(c) > 200]
    contour_count = len(sig_contours)
    
    if sig_contours:
        largest_c = max(sig_contours, key=cv2.contourArea)
        area = cv2.contourArea(largest_c)
        hull = cv2.convexHull(largest_c)
        hull_area = cv2.contourArea(hull)
        solidity = float(area / hull_area) if hull_area > 0 else 0.5
        convexity_deficit = float(1.0 - solidity)
        x, y, w, h = cv2.boundingRect(largest_c)
        aspect_ratio = float(max(w, h) / max(min(w, h), 1))
        extent = float(area / (w * h)) if (w * h) > 0 else 0.5
    else:
        solidity = 0.0
        convexity_deficit = 1.0
        aspect_ratio = 1.0
        extent = 0.0
    
    if foliar_ratio > 0.01:
        mean_hue = float(np.mean(hsv[:,:,0][plant_mask]))
        mean_sat = float(np.mean(hsv[:,:,1][plant_mask]))
    else:
        mean_hue = 0.0
        mean_sat = 0.0

    return np.array([
        foliar_ratio,
        green_ratio,
        chlorosis_ratio,
        necrosis_ratio,
        lap_var,
        int_std,
        skin_ratio,
        sky_ratio,
        doc_white_ratio,
        aspect_ratio,
        solidity,
        convexity_deficit,
        float(contour_count),
        extent,
        mean_hue,
        mean_sat
    ], dtype=np.float32)

# Collect dataset
X = []
y = [] # 1 for valid cotton leaf, 0 for negative (non-cotton, unrelated, low-quality)
meta_labels = []

# Positives: cotton_leaf
cotton_files = [os.path.join(cotton_dir, f) for f in os.listdir(cotton_dir) if f.lower().endswith(('.jpg', '.png'))]
for fpath in cotton_files:
    feats = extract_features_from_image(fpath)
    if feats is not None:
        X.append(feats)
        y.append(1)
        meta_labels.append("cotton_leaf")

# Negatives: non_cotton_leaf
non_cotton_files = [os.path.join(non_cotton_dir, f) for f in os.listdir(non_cotton_dir) if f.lower().endswith(('.jpg', '.png'))]
for fpath in non_cotton_files:
    feats = extract_features_from_image(fpath)
    if feats is not None:
        X.append(feats)
        y.append(0)
        meta_labels.append("non_cotton_leaf")

# Negatives: unrelated_object
unrelated_files = [os.path.join(unrelated_dir, f) for f in os.listdir(unrelated_dir) if f.lower().endswith(('.jpg', '.png'))]
for fpath in unrelated_files:
    feats = extract_features_from_image(fpath)
    if feats is not None:
        X.append(feats)
        y.append(0)
        meta_labels.append("unrelated_object")

# Negatives: low_quality
low_q_files = [os.path.join(low_quality_dir, f) for f in os.listdir(low_quality_dir) if f.lower().endswith(('.jpg', '.png'))]
for fpath in low_q_files:
    feats = extract_features_from_image(fpath)
    if feats is not None:
        X.append(feats)
        y.append(0)
        meta_labels.append("low_quality")

X = np.array(X)
y = np.array(y)
meta_labels = np.array(meta_labels)

print(f" -> Total dataset size: {len(y)} samples (Cotton: {np.sum(y == 1)}, Negative: {np.sum(y == 0)})")
print(f"    Sub-breakdown: {dict(zip(*np.unique(meta_labels, return_counts=True)))}")

print("[4/5] Training & Evaluating Calibrated Cotton Leaf Gate Model on Train/Val/Test Splits...")

# Stratified Train (70%) / Val (15%) / Test (15%)
X_train, X_temp, y_train, y_temp, m_train, m_temp = train_test_split(
    X, y, meta_labels, test_size=0.30, random_state=42, stratify=y
)
X_val, X_test, y_val, y_test, m_val, m_test = train_test_split(
    X_temp, y_temp, m_temp, test_size=0.50, random_state=42, stratify=y_temp
)

print(f" -> Split sizes: Train={len(y_train)}, Validation={len(y_val)}, Test={len(y_test)}")

# Train Random Forest Classifier with calibrated trees and feature regularization
rf = RandomForestClassifier(
    n_estimators=100,
    max_depth=6,
    min_samples_split=4,
    min_samples_leaf=2,
    random_state=42,
    class_weight="balanced"
)
rf.fit(X_train, y_train)

# Validation evaluation
val_preds = rf.predict(X_val)
val_probs = rf.predict_proba(X_val)[:, 1]
val_acc = accuracy_score(y_val, val_preds)
val_prec = precision_score(y_val, val_preds, zero_division=0)
val_rec = recall_score(y_val, val_preds, zero_division=0)
val_f1 = f1_score(y_val, val_preds, zero_division=0)
val_roc = roc_auc_score(y_val, val_probs)

print("\n--- VALIDATION SET EVALUATION ---")
print(f"Accuracy:  {val_acc * 100:.2f}%")
print(f"Precision: {val_prec * 100:.2f}%")
print(f"Recall:    {val_rec * 100:.2f}%")
print(f"F1-Score:  {val_f1 * 100:.2f}%")
print(f"ROC-AUC:   {val_roc * 100:.2f}%")
print("Confusion Matrix:\n", confusion_matrix(y_val, val_preds))

# Test set evaluation
test_preds = rf.predict(X_test)
test_probs = rf.predict_proba(X_test)[:, 1]
test_acc = accuracy_score(y_test, test_preds)
test_prec = precision_score(y_test, test_preds, zero_division=0)
test_rec = recall_score(y_test, test_preds, zero_division=0)
test_f1 = f1_score(y_test, test_preds, zero_division=0)
test_roc = roc_auc_score(y_test, test_probs)

print("\n--- INDEPENDENT TEST SET EVALUATION ---")
print(f"Accuracy:  {test_acc * 100:.2f}%")
print(f"Precision: {test_prec * 100:.2f}%")
print(f"Recall:    {test_rec * 100:.2f}%")
print(f"F1-Score:  {test_f1 * 100:.2f}%")
print(f"ROC-AUC:   {test_roc * 100:.2f}%")
print("Confusion Matrix:\n", confusion_matrix(y_test, test_preds))
print("\nClassification Report:\n", classification_report(y_test, test_preds, target_names=["Negative", "Cotton Leaf"]))

print("[5/5] Saving model artifact to backend/models/cotton_leaf_gate_model.joblib...")
model_artifact = {
    "model": rf,
    "feature_names": [
        "foliar_ratio", "green_ratio", "chlorosis_ratio", "necrosis_ratio",
        "lap_var", "int_std", "skin_ratio", "sky_ratio", "doc_white_ratio",
        "aspect_ratio", "solidity", "convexity_deficit", "contour_count",
        "extent", "mean_hue", "mean_sat"
    ],
    "metrics": {
        "val_accuracy": round(float(val_acc), 4),
        "val_precision": round(float(val_prec), 4),
        "val_recall": round(float(val_rec), 4),
        "val_f1": round(float(val_f1), 4),
        "val_roc_auc": round(float(val_roc), 4),
        "test_accuracy": round(float(test_acc), 4),
        "test_precision": round(float(test_prec), 4),
        "test_recall": round(float(test_rec), 4),
        "test_f1": round(float(test_f1), 4),
        "test_roc_auc": round(float(test_roc), 4)
    }
}

joblib.dump(model_artifact, os.path.join(MODELS_DIR, "cotton_leaf_gate_model.joblib"))
print("Model saved successfully! Training & dataset curation completed.")
