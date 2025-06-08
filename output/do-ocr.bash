#!/bin/bash
# filepath: c:\Users\Cris\Documents\GitHub\death-test-mapper\output\do-ocr.bash

echo "=== Death Test OCR Processing Script ==="
echo "Starting at $(date)"
echo ""

# Create log file
LOG_FILE="ocr_process.log"
echo "OCR Processing started at $(date)" > "$LOG_FILE"

# Check if PNG files already exist
png_files=$(ls page-*.png 2>/dev/null | wc -l)

# Convert PDF to high-resolution images (only if needed)
if [ "$png_files" -eq 0 ]; then
  echo "Step 1: Converting PDF to images (density 600 dpi)..."
  start_time=$(date +%s)
  magick -density 600 "C:\Users\Cris\Downloads\DT1_Steps.pdf" -strip -quality 100 page-%03d.png
  end_time=$(date +%s)
  conversion_time=$((end_time - start_time))
  echo "  - PDF conversion completed in ${conversion_time} seconds"
  echo "  - Created $(ls page-*.png | wc -l) image files"
  echo "  - First image size: $(du -h page-001.png | cut -f1)"
  echo ""
  echo "PDF conversion completed in ${conversion_time} seconds. Created $(ls page-*.png | wc -l) images." >> "$LOG_FILE"
else
  echo "Step 1: Found $png_files existing PNG files, skipping PDF conversion"
  echo "  - To regenerate PNG files, delete them first"
  echo ""
  echo "PDF conversion skipped - using $png_files existing PNG files." >> "$LOG_FILE"
fi

# Process each image for better OCR
echo "Step 2: Processing images and running OCR..."
echo ""
total_files=$(ls page-*.png | wc -l)
current_file=0

for file in page-*.png; do
  current_file=$((current_file + 1))
  filename=$(basename "$file" .png)
  echo "Processing image ${current_file}/${total_files}: $file"
  
  # Enhance image for OCR
  # echo "  - Enhancing image..."
  # start_time=$(date +%s)
  # magick "$file" -colorspace gray -background white -alpha remove \
  #   -sharpen 0x1 -normalize -level 10%,90% "processed-$file"
  # end_time=$(date +%s)
  # enhance_time=$((end_time - start_time))
  # echo "    - Enhancement completed in ${enhance_time} seconds"
  
  # Run OCR on the processed image
  echo "  - Running Tesseract OCR..."
  start_time=$(date +%s)

  # Convert to Windows path format for Tesseract
  # win_input_path=$(cygpath -w "$(pwd)/processed-$file")
  win_input_path=$(cygpath -w "$(pwd)/$file")
  win_output_path=$(cygpath -w "$(pwd)/output-${filename}")

  echo "    - Using Windows paths:"
  echo "      Input: $win_input_path"
  echo "      Output: $win_output_path"

  tesseract "$win_input_path" "$win_output_path" -l eng --psm 3 --oem 3 -c tessedit_char_whitelist="0123456789.,;:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ()-\"' "

  end_time=$(date +%s)
  ocr_time=$((end_time - start_time))

  # Count words in output
  word_count=$(wc -w < "output-${filename}.txt")
  
  echo "    - OCR completed in ${ocr_time} seconds"
  echo "    - Extracted approximately ${word_count} words"
  echo "  - Page ${current_file} completed"
  echo ""
  
  # Log progress
  echo "Processed page ${current_file}/${total_files}: ${filename} - Words: ${word_count}" >> "$LOG_FILE"
done

# Combine all text files
echo "Step 3: Combining results into single text file..."
cat output-*.txt > raw_ocr_text.txt
total_words=$(wc -w < raw_ocr_text.txt)
total_lines=$(wc -l < raw_ocr_text.txt)
file_size=$(du -h raw_ocr_text.txt | cut -f1)

echo "OCR processing complete!"
echo "  - Final text file: raw_ocr_text.txt"
echo "  - Total words: ${total_words}"
echo "  - Total lines: ${total_lines}"
echo "  - File size: ${file_size}"
echo ""
echo "Finished at $(date)"

# Final log entry
echo "OCR completed at $(date). Total words: ${total_words}, lines: ${total_lines}" >> "$LOG_FILE"
echo "=== Processing Complete ==="
