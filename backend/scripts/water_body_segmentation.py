import cv2
import numpy as np
import tensorflow as tf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import rasterio
import os
import glob
import csv
import json
import pathlib


# ============================================================
# 1. SETTINGS
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(BACKEND_DIR, "data")

MODEL_CANDIDATES = [
    pathlib.Path.home()
    / "Downloads"
    / "GeoAI-UNET"
    / "notebooks"
    / "IR_UNet_improved.keras",
    pathlib.Path(BACKEND_DIR) / "models" / "IR_UNet_improved.keras",
]
DEFAULT_MODEL_PATH = next(
    (candidate for candidate in MODEL_CANDIDATES if candidate.is_file()),
    MODEL_CANDIDATES[-1],
)
MODEL_PATH = os.environ.get("WATER_SEGMENTATION_MODEL_PATH", str(DEFAULT_MODEL_PATH))

# ============================================================
# INPUT FOLDER
# ============================================================

INPUT_FOLDER = os.environ.get(
    "PNG_SATELLITE_FOLDER",
    os.path.join(DATA_DIR, "png_satellite_images")
)


# ============================================================
# PNG OUTPUT FOLDER
# ============================================================

PNG_OUTPUT_FOLDER = os.environ.get(
    "PNG_OUTPUT_FOLDER",
    os.path.join(DATA_DIR, "gisoutputs", "png_water_masks")
)


# ============================================================
# REFERENCE TIF FOLDER
#
# These TIFs contain:
# - Correct width
# - Correct height
# - CRS
# - Transform
# - Pixel size
# - Geographic location
#
# Example:
# Velachery_Preprocessed_RGB_2017.tif
# Velachery_Preprocessed_RGB_2020.tif
# ============================================================

REFERENCE_TIF_FOLDER = os.environ.get(
    "REFERENCE_TIF_FOLDER",
    os.path.join(DATA_DIR, "ref_satellite_images")
)


# ============================================================
# GEOTIFF OUTPUT FOLDER
# ============================================================

OUTPUT_TIF_FOLDER = os.environ.get(
    "WATER_MASK_FOLDER",
    os.path.join(DATA_DIR, "water_masks_tif")
)


# ============================================================
# CREATE OUTPUT FOLDERS
# ============================================================

os.makedirs(
    PNG_OUTPUT_FOLDER,
    exist_ok=True
)

os.makedirs(
    OUTPUT_TIF_FOLDER,
    exist_ok=True
)


# ============================================================
# U-NET INPUT SIZE
# ============================================================

IMAGE_SIZE = 128


# ============================================================
# PREDICTION THRESHOLD
# ============================================================

THRESHOLD = 0.9


# ============================================================
# YEARS
#
# Used to find corresponding reference TIF.
# ============================================================

YEARS = json.loads(os.environ.get("WATER_SEGMENTATION_YEARS", "[]"))


# ============================================================
# 2. LOAD TRAINED MODEL
# ============================================================

print("=" * 60)
print("LOADING IR U-NET MODEL")
print("=" * 60)

print("Loading IR U-Net model...")

if not os.path.isfile(MODEL_PATH):
    raise FileNotFoundError(
        "Water segmentation model not found. Set "
        "WATER_SEGMENTATION_MODEL_PATH to the IR U-Net .keras model file. "
        f"Configured path: {MODEL_PATH}"
    )

model = tf.keras.models.load_model(
    MODEL_PATH,
    compile=False,
    safe_mode=False
)

print("Model loaded successfully!")


# ============================================================
# 3. GET ALL INPUT IMAGES
# ============================================================

image_paths = []

for extension in [
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.tif",
    "*.tiff"
]:

    image_paths.extend(
        glob.glob(
            os.path.join(
                INPUT_FOLDER,
                extension
            )
        )
    )


image_paths = sorted(image_paths)

if not YEARS:
    YEARS = sorted({
        int(pathlib.Path(image_path).stem.removeprefix("satellite_"))
        for image_path in image_paths
        if pathlib.Path(image_path).stem.startswith("satellite_")
        and pathlib.Path(image_path).stem.removeprefix("satellite_").isdigit()
    })

print(
    f"\nFound {len(image_paths)} images."
)


if len(image_paths) == 0:

    raise FileNotFoundError(
        f"No images found in folder: {INPUT_FOLDER}"
    )

if len(YEARS) == 0:
    raise FileNotFoundError(
        f"No satellite_YYYY.png images found in folder: {INPUT_FOLDER}"
    )


# ============================================================
# 4. RESULTS LIST
# ============================================================

all_results = []


# ============================================================
# 5. PROCESS EACH IMAGE
# ============================================================

for index, image_path in enumerate(image_paths):


    print("\n" + "=" * 60)

    print(
        f"Processing {index + 1}/{len(image_paths)}"
    )

    filename = os.path.basename(
        image_path
    )

    print(
        f"Image: {filename}"
    )

    print("=" * 60)


    # ========================================================
    # 5.1 FIND YEAR FROM FILE NAME
    # ========================================================

    detected_year = None

    for year in YEARS:
        if pathlib.Path(filename).stem == f"satellite_{year}":
            detected_year = year
            break


    if detected_year is None:

        print(
            "\nCould not detect year from filename."
        )

        print(
            "Skipping this image."
        )

        continue


    print(
        f"Detected year: {detected_year}"
    )


    # ========================================================
    # 5.2 FIND CORRESPONDING REFERENCE TIF
    # ========================================================

    reference_tif = os.path.join(
        REFERENCE_TIF_FOLDER,
        f"Velachery_Preprocessed_RGB_{detected_year}.tif"
    )


    # ========================================================
    # 5.3 CHECK REFERENCE TIF
    # ========================================================

    if not os.path.exists(reference_tif):

        print(
            "\nReference TIF not found:"
        )

        print(
            reference_tif
        )

        print(
            "Skipping this image."
        )

        continue


    # ========================================================
    # 5.4 READ AOI DIMENSIONS FROM REFERENCE TIF
    #
    # NO HARD-CODED AOI DIMENSIONS
    # ========================================================

    with rasterio.open(reference_tif) as src:

        AOI_WIDTH = src.width
        AOI_HEIGHT = src.height

        reference_profile = src.profile.copy()

        reference_crs = src.crs

        reference_transform = src.transform


    print("\nREFERENCE TIF INFORMATION")
    print("-" * 50)

    print(
        "Reference TIF:",
        reference_tif
    )

    print(
        "Width:",
        AOI_WIDTH
    )

    print(
        "Height:",
        AOI_HEIGHT
    )

    print(
        "CRS:",
        reference_crs
    )

    print(
        "Transform:",
        reference_transform
    )


    # ========================================================
    # 5.5 LOAD IMAGE
    # ========================================================

    image = cv2.imread(
        image_path,
        cv2.IMREAD_COLOR
    )


    if image is None:

        print(
            "Could not read image. Skipping..."
        )

        continue


    # ========================================================
    # 5.6 BGR → RGB
    # ========================================================

    image = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2RGB
    )


    # ========================================================
    # 5.7 CHECK ORIGINAL IMAGE SIZE
    # ========================================================

    original_height, original_width, channels = (
        image.shape
    )


    print(
        f"\nOriginal image size: "
        f"{original_width} × {original_height}"
    )


    print(
        f"Reference TIF size: "
        f"{AOI_WIDTH} × {AOI_HEIGHT}"
    )


    # ========================================================
    # 5.8 RESIZE IMAGE TO REFERENCE TIF SIZE
    #
    # AOI dimensions come dynamically from TIF.
    # ========================================================

    if (
        original_width != AOI_WIDTH
        or
        original_height != AOI_HEIGHT
    ):

        print(
            f"Resizing input to "
            f"{AOI_WIDTH} × {AOI_HEIGHT}..."
        )


        aoi_image = cv2.resize(
            image,
            (
                AOI_WIDTH,
                AOI_HEIGHT
            ),
            interpolation=cv2.INTER_AREA
        )


    else:

        print(
            "Image already matches "
            "reference TIF dimensions."
        )

        aoi_image = image.copy()


    # ========================================================
    # 5.9 KEEP AOI IMAGE FOR DISPLAY
    # ========================================================

    display_image = aoi_image.copy()


    # ========================================================
    # 5.10 RESIZE TO U-NET INPUT SIZE
    # ========================================================

    model_image = cv2.resize(
        aoi_image,
        (
            IMAGE_SIZE,
            IMAGE_SIZE
        ),
        interpolation=cv2.INTER_AREA
    )


    print(
        f"Model input size: "
        f"{IMAGE_SIZE} × {IMAGE_SIZE}"
    )


    # ========================================================
    # 5.11 HISTOGRAM EQUALIZATION
    # ========================================================

    ycrcb = cv2.cvtColor(
        model_image,
        cv2.COLOR_RGB2YCrCb
    )


    ycrcb[:, :, 0] = cv2.equalizeHist(
        ycrcb[:, :, 0]
    )


    model_image = cv2.cvtColor(
        ycrcb,
        cv2.COLOR_YCrCb2RGB
    )


    # ========================================================
    # 5.12 NORMALIZATION
    # ========================================================

    model_image = (
        model_image.astype(
            np.float32
        ) / 255.0
    )


    # ========================================================
    # 5.13 ADD BATCH DIMENSION
    # ========================================================

    input_image = np.expand_dims(
        model_image,
        axis=0
    )


    print(
        "Input tensor shape:",
        input_image.shape
    )


    # Expected:
    # (1, 128, 128, 3)


    # ========================================================
    # 6. U-NET PREDICTION
    # ========================================================

    prediction = model.predict(
        input_image,
        verbose=0
    )


    print(
        "Prediction shape:",
        prediction.shape
    )


    # Expected:
    # (1, 128, 128, 1)


    probability = prediction[
        0, :, :, 0
    ]


    # ========================================================
    # 7. APPLY THRESHOLD
    # ========================================================

    predicted_mask_128 = (
        probability >= THRESHOLD
    ).astype(
        np.uint8
    )


    print(
        "Predicted mask size:",
        predicted_mask_128.shape
    )


    # ========================================================
    # 8. RESIZE MASK BACK TO REFERENCE TIF SIZE
    #
    # This is important.
    #
    # 128 × 128
    #       ↓
    # Reference TIF dimensions
    #
    # Example:
    # 128 × 128 → 218 × 84
    #
    # But now 218 × 84 is NOT hard-coded.
    # ========================================================

    predicted_mask = cv2.resize(
        predicted_mask_128,
        (
            AOI_WIDTH,
            AOI_HEIGHT
        ),
        interpolation=cv2.INTER_NEAREST
    )


    print(
        "Final AOI mask size:",
        predicted_mask.shape
    )


    # ========================================================
    # 9. PIXEL COUNT
    #
    # No area calculation.
    # ========================================================

    total_pixels = (
        AOI_WIDTH *
        AOI_HEIGHT
    )


    water_pixels = np.sum(
        predicted_mask == 1
    )


    non_water_pixels = np.sum(
        predicted_mask == 0
    )


    print("\n" + "-" * 60)
    print("PIXEL COUNT")
    print("-" * 60)


    print(
        f"Total pixels     : "
        f"{total_pixels:,}"
    )


    print(
        f"Water pixels     : "
        f"{water_pixels:,}"
    )


    print(
        f"Non-water pixels : "
        f"{non_water_pixels:,}"
    )


    # ========================================================
    # 10. SAVE PNG MASK
    #
    # Values:
    #
    # 0   = Non-water
    # 255 = Water
    # ========================================================

    name_without_extension = (
        os.path.splitext(filename)[0]
    )


    png_output_path = os.path.join(
        PNG_OUTPUT_FOLDER,
        name_without_extension + "_mask.png"
    )


    display_mask = (
        predicted_mask * 255
    ).astype(
        np.uint8
    )


    cv2.imwrite(
        png_output_path,
        display_mask
    )


    print(
        "\nPNG mask saved:"
    )

    print(
        png_output_path
    )


    # ========================================================
    # 11. OUTPUT GEOTIFF PATH
    # ========================================================

    output_tif = os.path.join(
        OUTPUT_TIF_FOLDER,
        f"water_{detected_year}.tif"
    )


    # ========================================================
    # 12. CREATE GEOTIFF PROFILE
    #
    # Use the reference TIF's:
    # - CRS
    # - Transform
    # - Width
    # - Height
    # - Pixel size
    # ========================================================

    profile = reference_profile.copy()


    profile.update(
        driver="GTiff",
        width=AOI_WIDTH,
        height=AOI_HEIGHT,
        dtype="uint8",
        count=1,
        nodata=255,
        compress="lzw"
    )


    # ========================================================
    # 13. CHECK DIMENSIONS
    # ========================================================

    expected_shape = (
        AOI_HEIGHT,
        AOI_WIDTH
    )


    if display_mask.shape != expected_shape:

        print(
            "\nERROR:"
        )

        print(
            "Mask and reference TIF dimensions "
            "do not match."
        )

        print(
            "Mask:",
            display_mask.shape
        )

        print(
            "Reference TIF:",
            expected_shape
        )

        print(
            "GeoTIFF will NOT be created."
        )

        geotiff_created = False

    else:

        geotiff_created = True


        # ====================================================
        # 14. WRITE GEOTIFF
        # ====================================================

        with rasterio.open(
            output_tif,
            "w",
            **profile
        ) as dst:

            dst.write(predicted_mask.astype(np.uint8), 1)


        # ====================================================
        # 15. GEOTIFF SUCCESS
        # ====================================================

        print(
            "\n" + "-" * 50
        )

        print(
            "GeoTIFF created successfully!"
        )

        print(
            "-" * 50
        )

        print(
            "Output:"
        )

        print(
            output_tif
        )

        print(
            "Output dimensions:",
            display_mask.shape
        )

        print(
            "Output values:",
            np.unique(display_mask)
        )

        print(
            "CRS:",
            reference_crs
        )

        print(
            "Water pixels:",
            np.sum(
                predicted_mask == 1
            )
        )

        print(
            "Non-water pixels:",
            np.sum(
                predicted_mask == 0
            )
        )

        print(
            "-" * 50
        )


    # ========================================================
    # 16. DISPLAY RESULTS
    # ========================================================

    plt.figure(
        figsize=(25, 5)
    )


    # --------------------------------------------------------
    # ORIGINAL AOI
    # --------------------------------------------------------

    plt.subplot(
        1,
        5,
        1
    )


    plt.imshow(
        display_image
    )


    plt.title(
        f"Original AOI\n"
        f"{filename}\n"
        f"{AOI_WIDTH} × {AOI_HEIGHT}"
    )


    plt.axis(
        "off"
    )


    # --------------------------------------------------------
    # U-NET INPUT
    # --------------------------------------------------------

    plt.subplot(
        1,
        5,
        2
    )


    input_image_128_display = (
        model_image * 255.0
    ).astype(
        np.uint8
    )


    plt.imshow(
        input_image_128_display
    )


    plt.title(
        "U-Net Input\n"
        "128 × 128"
    )


    plt.axis(
        "off"
    )


    # --------------------------------------------------------
    # PROBABILITY MAP
    # --------------------------------------------------------

    plt.subplot(
        1,
        5,
        3
    )


    plt.imshow(
        probability,
        cmap="gray",
        vmin=0,
        vmax=1
    )


    plt.title(
        "Probability Map\n"
        "128 × 128"
    )


    plt.axis(
        "off"
    )


    # --------------------------------------------------------
    # PREDICTED MASK 128 × 128
    # --------------------------------------------------------

    plt.subplot(
        1,
        5,
        4
    )


    plt.imshow(
        predicted_mask_128,
        cmap="gray",
        vmin=0,
        vmax=1
    )


    plt.title(
        f"Predicted Mask\n"
        f"128 × 128\n"
        f"Threshold = {THRESHOLD}"
    )


    plt.axis(
        "off"
    )


    # --------------------------------------------------------
    # FINAL AOI MASK
    # --------------------------------------------------------

    plt.subplot(
        1,
        5,
        5
    )


    plt.imshow(
        predicted_mask,
        cmap="gray",
        vmin=0,
        vmax=1
    )


    plt.title(
        f"Final AOI Water Mask\n"
        f"{AOI_WIDTH} × {AOI_HEIGHT}"
    )


    plt.axis(
        "off"
    )


    plt.tight_layout()

    plt.close()


    # ========================================================
    # 17. STORE PIXEL RESULTS
    #
    # No area calculations.
    # ========================================================

    result = {

        "image": filename,

        "year": detected_year,

        "aoi_width": AOI_WIDTH,

        "aoi_height": AOI_HEIGHT,

        "model_input_size": IMAGE_SIZE,

        "threshold": THRESHOLD,

        "total_pixels": int(
            total_pixels
        ),

        "water_pixels": int(
            water_pixels
        ),

        "non_water_pixels": int(
            non_water_pixels
        ),

        "png_mask": png_output_path,

        "geotiff": (
            output_tif
            if geotiff_created
            else None
        )

    }


    all_results.append(
        result
    )


# ============================================================
# 18. SAVE CSV
# ============================================================

csv_path = os.path.join(
    OUTPUT_TIF_FOLDER,
    "segmentation_results.csv"
)


if len(all_results) > 0:

    fieldnames = list(
        all_results[0].keys()
    )


    with open(
        csv_path,
        "w",
        newline=""
    ) as csv_file:

        writer = csv.DictWriter(
            csv_file,
            fieldnames=fieldnames
        )


        writer.writeheader()


        writer.writerows(
            all_results
        )


    print(
        f"\nCSV saved: {csv_path}"
    )


else:

    print(
        "\nNo results available for CSV."
    )


# ============================================================
# 19. SAVE JSON
# ============================================================

json_path = os.path.join(
    OUTPUT_TIF_FOLDER,
    "segmentation_results.json"
)


with open(
    json_path,
    "w"
) as json_file:

    json.dump(
        all_results,
        json_file,
        indent=4
    )


print(
    f"JSON saved: {json_path}"
)


# ============================================================
# 20. FINAL MESSAGE
# ============================================================

print("\n" + "=" * 60)

print(
    "ALL IMAGES PROCESSED SUCCESSFULLY!"
)

print("=" * 60)


print(
    f"Input folder        : {INPUT_FOLDER}"
)


print(
    f"PNG output folder   : {PNG_OUTPUT_FOLDER}"
)


print(
    f"Reference TIF       : {REFERENCE_TIF_FOLDER}"
)


print(
    f"GeoTIFF output      : {OUTPUT_TIF_FOLDER}"
)


print(
    "AOI dimensions      : "
    "Read dynamically from each reference TIF"
)


print(
    f"Model input         : "
    f"{IMAGE_SIZE} × {IMAGE_SIZE}"
)


print(
    f"Threshold           : "
    f"{THRESHOLD}"
)


print(
    f"CSV results         : "
    f"{csv_path}"
)


print(
    f"JSON results        : "
    f"{json_path}"
)


print("=" * 60)