<?php
/**
 * XIMG - Image Processing Engine
 * GD-based WebP conversion, auto-rotation, EXIF stripping & thumbnail generator
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/Auth.php';

class ImageProcessor {
    /**
     * Process an incoming image (uploaded file path, URL, or base64 data string)
     */
    public static function processImage($sourceInput, $originalName = 'image.png', $isUrlOrBase64 = false) {
        $tempPath = null;

        try {
            if ($isUrlOrBase64) {
                $tempPath = DATA_DIR . '/temp_' . Auth::generateRandomHex(8);
                if (strpos($sourceInput, 'data:image/') === 0) {
                    // Base64 string
                    $dataParts = explode(',', $sourceInput);
                    $binaryData = base64_decode($dataParts[1] ?? $sourceInput);
                    if (!$binaryData) {
                        throw new Exception('Invalid base64 image data.');
                    }
                    file_put_contents($tempPath, $binaryData);
                } else if (filter_var($sourceInput, FILTER_VALIDATE_URL)) {
                    // Remote URL
                    $ch = curl_init($sourceInput);
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
                    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
                    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                    curl_setopt($ch, CURLOPT_USERAGENT, 'XIMG-Web-Optimizer/1.0');
                    $binaryData = curl_exec($ch);
                    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                    curl_close($ch);

                    if ($httpCode !== 200 || !$binaryData) {
                        throw new Exception('Failed to download image from URL.');
                    }
                    file_put_contents($tempPath, $binaryData);
                } else {
                    throw new Exception('Invalid input source for image processing.');
                }
                $sourceFile = $tempPath;
            } else {
                $sourceFile = $sourceInput;
            }

            if (!file_exists($sourceFile) || filesize($sourceFile) === 0) {
                if ($tempPath && file_exists($tempPath)) @unlink($tempPath);
                throw new Exception('Source image file does not exist or is empty.');
            }

            $origSize = filesize($sourceFile);
            if ($origSize > MAX_FILE_SIZE) {
                if ($tempPath && file_exists($tempPath)) @unlink($tempPath);
                throw new Exception('File size exceeds maximum allowed upload limit of 25MB.');
            }

            // Detect image type & dimensions
            $imageInfo = @getimagesize($sourceFile);
            if (!$imageInfo) {
                if ($tempPath && file_exists($tempPath)) @unlink($tempPath);
                throw new Exception('Uploaded file is not a valid recognized image format.');
            }

            $mimeType = $imageInfo['mime'];

            // Create GD Image Resource
            $gdImg = self::createGdResource($sourceFile, $mimeType);
            if (!$gdImg) {
                if ($tempPath && file_exists($tempPath)) @unlink($tempPath);
                throw new Exception('Failed to process image format with GD library.');
            }

            // Auto-Rotate based on EXIF orientation (JPEG only)
            if ($mimeType === 'image/jpeg' && function_exists('exif_read_data')) {
                $exif = @exif_read_data($sourceFile);
                if (!empty($exif['Orientation'])) {
                    switch ($exif['Orientation']) {
                        case 3: $gdImg = imagerotate($gdImg, 180, 0); break;
                        case 6: $gdImg = imagerotate($gdImg, -90, 0); break;
                        case 8: $gdImg = imagerotate($gdImg, 90, 0); break;
                    }
                }
            }

            $currentWidth = imagesx($gdImg);
            $currentHeight = imagesy($gdImg);

            // Downscale large 4K+ images
            if ($currentWidth > MAX_IMAGE_DIMENSION || $currentHeight > MAX_IMAGE_DIMENSION) {
                $scale = min(MAX_IMAGE_DIMENSION / $currentWidth, MAX_IMAGE_DIMENSION / $currentHeight);
                $newW = (int)round($currentWidth * $scale);
                $newH = (int)round($currentHeight * $scale);

                $resizedGd = imagecreatetruecolor($newW, $newH);
                self::preserveAlpha($resizedGd, $mimeType);
                imagecopyresampled($resizedGd, $gdImg, 0, 0, 0, 0, $newW, $newH, $currentWidth, $currentHeight);
                imagedestroy($gdImg);
                $gdImg = $resizedGd;
                $currentWidth = $newW;
                $currentHeight = $newH;
            }

            // Generate unique Short Code
            $shortCode = self::generateShortCode();
            $fileName = $shortCode . '.webp';
            $thumbName = 'thumb_' . $shortCode . '.webp';

            $destPath = UPLOAD_DIR . '/' . $fileName;
            $thumbPath = THUMB_DIR . '/' . $thumbName;

            $savedMime = 'image/webp';
            // Save WebP Optimized Image
            if (function_exists('imagewebp')) {
                imagewebp($gdImg, $destPath, WEBP_QUALITY);
            } else {
                $fileName = $shortCode . '.jpg';
                $destPath = UPLOAD_DIR . '/' . $fileName;
                imagejpeg($gdImg, $destPath, 85);
                $savedMime = 'image/jpeg';
            }

            $webSize = filesize($destPath);

            // Generate Thumbnail WebP
            $thumbGd = self::createResizedGd($gdImg, THUMB_WIDTH, THUMB_HEIGHT, $currentWidth, $currentHeight, $mimeType);
            if (function_exists('imagewebp')) {
                imagewebp($thumbGd, $thumbPath, 80);
            } else {
                $thumbName = 'thumb_' . $shortCode . '.jpg';
                $thumbPath = THUMB_DIR . '/' . $thumbName;
                imagejpeg($thumbGd, $thumbPath, 80);
            }
            imagedestroy($thumbGd);

            // Pre-generate .ico file if source was an ICO format or for ready favicon access
            $icoPath = UPLOAD_DIR . '/' . $shortCode . '.ico';
            $isIcoInput = in_array($mimeType, ['image/x-icon', 'image/vnd.microsoft.icon', 'image/ico', 'image/icon']) || strtolower(pathinfo($originalName, PATHINFO_EXTENSION)) === 'ico';
            if ($isIcoInput) {
                if ($isUrlOrBase64 || !copy($sourceFile, $icoPath)) {
                    self::createIcoFromGd($gdImg, $icoPath);
                }
            }

            imagedestroy($gdImg);

            if ($tempPath && file_exists($tempPath)) {
                @unlink($tempPath);
            }

            $savingsPercent = round((1 - ($webSize / max(1, $origSize))) * 100, 1);
            if ($savingsPercent < 0) $savingsPercent = 0;

            return [
                'short_code'     => $shortCode,
                'original_name'  => pathinfo($originalName, PATHINFO_BASENAME),
                'file_name'      => $fileName,
                'thumb_name'     => $thumbName,
                'mime_type'      => $savedMime,
                'orig_size'      => $origSize,
                'web_size'       => $webSize,
                'savings'        => $savingsPercent,
                'width'          => $currentWidth,
                'height'         => $currentHeight
            ];

        } catch (Throwable $e) {
            if ($tempPath && file_exists($tempPath)) @unlink($tempPath);
            throw new Exception($e->getMessage());
        }
    }

    private static function createGdResource($file, $mimeType) {
        switch ($mimeType) {
            case 'image/jpeg':
            case 'image/jpg':
                return @imagecreatefromjpeg($file);
            case 'image/png':
                $img = @imagecreatefrompng($file);
                if ($img) imagealphablending($img, true);
                return $img;
            case 'image/gif':
                return @imagecreatefromgif($file);
            case 'image/webp':
                return function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($file) : null;
            case 'image/bmp':
                return function_exists('imagecreatefrombmp') ? @imagecreatefrombmp($file) : null;
            case 'image/x-icon':
            case 'image/vnd.microsoft.icon':
            case 'image/ico':
            case 'image/icon':
                $content = @file_get_contents($file);
                if (!$content) return null;
                $img = @imagecreatefromstring($content);
                if ($img) {
                    imagealphablending($img, true);
                    return $img;
                }
                $pngPos = strpos($content, "\x89PNG\r\n\x1a\n");
                if ($pngPos !== false) {
                    $pngData = substr($content, $pngPos);
                    $img = @imagecreatefromstring($pngData);
                    if ($img) {
                        imagealphablending($img, true);
                        return $img;
                    }
                }
                return null;
            default:
                $content = @file_get_contents($file);
                return $content ? @imagecreatefromstring($content) : null;
        }
    }

    /**
     * Generate multi-resolution binary ICO file from a GD image resource
     */
    public static function createIcoFromGd($srcGd, $outputPath, $sizes = [16, 32, 48]) {
        if (!$srcGd) return false;

        $pngBuffers = [];
        $srcW = imagesx($srcGd);
        $srcH = imagesy($srcGd);

        foreach ($sizes as $size) {
            $resized = imagecreatetruecolor($size, $size);
            self::preserveAlpha($resized, 'image/png');
            imagecopyresampled($resized, $srcGd, 0, 0, 0, 0, $size, $size, $srcW, $srcH);

            ob_start();
            imagepng($resized);
            $pngData = ob_get_clean();
            imagedestroy($resized);

            if ($pngData) {
                $pngBuffers[] = [
                    'width'  => $size >= 256 ? 0 : $size,
                    'height' => $size >= 256 ? 0 : $size,
                    'data'   => $pngData
                ];
            }
        }

        if (empty($pngBuffers)) return false;

        $numImages = count($pngBuffers);
        $headerSize = 6;
        $dirEntrySize = 16;
        $currentOffset = $headerSize + ($dirEntrySize * $numImages);

        // Header: Reserved (2 bytes = 0), Type (2 bytes = 1 for ICO), Count (2 bytes = numImages)
        $icoData = pack('v3', 0, 1, $numImages);

        // Directory entries
        foreach ($pngBuffers as $buf) {
            $dataLen = strlen($buf['data']);
            $icoData .= pack('C4v2V2', $buf['width'], $buf['height'], 0, 0, 1, 32, $dataLen, $currentOffset);
            $currentOffset += $dataLen;
        }

        // Image payloads
        foreach ($pngBuffers as $buf) {
            $icoData .= $buf['data'];
        }

        return file_put_contents($outputPath, $icoData) !== false;
    }

    private static function preserveAlpha($gdResource, $mimeType) {
        imagealphablending($gdResource, false);
        imagesavealpha($gdResource, true);
        $transparent = imagecolorallocatealpha($gdResource, 255, 255, 255, 127);
        imagefilledrectangle($gdResource, 0, 0, imagesx($gdResource), imagesy($gdResource), $transparent);
    }

    private static function createResizedGd($srcGd, $maxW, $maxH, $srcW, $srcH, $mimeType) {
        $scale = min($maxW / $srcW, $maxH / $srcH);
        if ($scale > 1) $scale = 1;

        $targetW = (int)round($srcW * $scale);
        $targetH = (int)round($srcH * $scale);

        $dstGd = imagecreatetruecolor($targetW, $targetH);
        self::preserveAlpha($dstGd, $mimeType);
        imagecopyresampled($dstGd, $srcGd, 0, 0, 0, 0, $targetW, $targetH, $srcW, $srcH);
        return $dstGd;
    }

    public static function generateShortCode($length = 6) {
        $chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $maxIndex = strlen($chars) - 1;
        $code = '';
        for ($i = 0; $i < $length; $i++) {
            try {
                $code .= $chars[random_int(0, $maxIndex)];
            } catch (Throwable $e) {
                $code .= $chars[mt_rand(0, $maxIndex)];
            }
        }
        return $code;
    }
}
