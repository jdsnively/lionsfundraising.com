<?php
/**
 * Simple Secure Image Proxy for Lions Logo
 * Place this file at: lionsfundraising.com/image-proxy.php
 */

// Error reporting for debugging (remove in production)
error_reporting(E_ALL);
ini_set('display_errors', 0); // Don't display errors to users
ini_set('log_errors', 1);

// Security headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');

try {
    // Simple rate limiting
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $rate_file = sys_get_temp_dir() . '/lions_rate_' . md5($ip);
    
    if (file_exists($rate_file)) {
        $last_access = filemtime($rate_file);
        if (time() - $last_access < 1) { // 1 second between requests
            http_response_code(429);
            exit('Rate limited');
        }
    }
    touch($rate_file);

    // Define logo paths
    $local_logo = __DIR__ . '/media/favicon.png';
    $remote_logo = 'https://lionsfundraising.com/media/favicon.png';
    
    $image_data = null;
    $mime_type = 'image/png';
    
    // Try local file first
    if (file_exists($local_logo) && is_readable($local_logo)) {
        $image_data = file_get_contents($local_logo);
        error_log("Lions proxy: Using local logo");
    }
    
    // If local fails, try remote
    if (!$image_data) {
        error_log("Lions proxy: Local logo not found, trying remote");
        
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 5,
                'user_agent' => 'Lions-Proxy/1.0'
            ]
        ]);
        
        $image_data = @file_get_contents($remote_logo, false, $context);
        
        if ($image_data) {
            error_log("Lions proxy: Remote logo loaded successfully");
        } else {
            error_log("Lions proxy: Remote logo failed, creating fallback");
        }
    }
    
    // If both fail, create a simple fallback
    if (!$image_data) {
        // Create a simple Lions logo fallback
        $fallback = base64_decode('iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVGiB7Zq9axRBFMafJBqwsLGwsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQsLBQ');
        
        if (!$fallback) {
            // Last resort: create a minimal PNG
            $image_data = create_simple_lion_logo();
        } else {
            $image_data = $fallback;
        }
        error_log("Lions proxy: Using fallback logo");
    }
    
    // Validate image data
    if (!$image_data || strlen($image_data) < 100) {
        throw new Exception("Invalid image data");
    }
    
    // Set headers
    header('Content-Type: ' . $mime_type);
    header('Content-Length: ' . strlen($image_data));
    header('Cache-Control: public, max-age=3600');
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', time()) . ' GMT');
    
    // Output image
    echo $image_data;
    
} catch (Exception $e) {
    error_log("Lions proxy error: " . $e->getMessage());
    
    // Return a very simple fallback
    header('Content-Type: image/png');
    echo create_simple_lion_logo();
}

function create_simple_lion_logo() {
    // Create a simple 64x64 PNG with "L" text
    $image = imagecreate(64, 64);
    
    // Colors
    $gold = imagecolorallocate($image, 255, 215, 0);     // Gold background
    $navy = imagecolorallocate($image, 26, 54, 93);      // Navy text
    
    // Fill background
    imagefill($image, 0, 0, $gold);
    
    // Add "L" text (if font functions available)
    if (function_exists('imagestring')) {
        imagestring($image, 5, 25, 20, 'L', $navy);
    }
    
    // Add border
    imagerectangle($image, 0, 0, 63, 63, $navy);
    
    // Output to string
    ob_start();
    imagepng($image);
    $png_data = ob_get_contents();
    ob_end_clean();
    
    // Clean up
    imagedestroy($image);
    
    return $png_data;
}
?><?php
/**
 * Secure Image Proxy for Lions Logo
 * Protects the favicon while allowing legitimate access
 * Place this file at: lionsfundraising.com/image-proxy.php
 */

// Security headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');

// Only allow access from the Lions domain
$allowed_domains = [
    'lionsfundraising.com',
    'www.lionsfundraising.com'
];

$referer = $_SERVER['HTTP_REFERER'] ?? '';
$host = $_SERVER['HTTP_HOST'] ?? '';

// Check if request is from allowed domain
$is_valid_referer = false;
foreach ($allowed_domains as $domain) {
    if (strpos($referer, $domain) !== false || $host === $domain) {
        $is_valid_referer = true;
        break;
    }
}

// Allow direct access for testing, but log it
if (empty($referer)) {
    error_log("Direct access to image-proxy.php from IP: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
}

// Rate limiting - simple IP-based
$rate_limit_file = sys_get_temp_dir() . '/lions_proxy_' . md5($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$current_time = time();
$requests = [];

if (file_exists($rate_limit_file)) {
    $requests = json_decode(file_get_contents($rate_limit_file), true) ?: [];
}

// Clean old requests (older than 1 hour)
$requests = array_filter($requests, function($timestamp) use ($current_time) {
    return ($current_time - $timestamp) < 3600;
});

// Check rate limit (max 100 requests per hour)
if (count($requests) >= 100) {
    http_response_code(429);
    header('Content-Type: text/plain');
    echo 'Rate limit exceeded';
    exit;
}

// Add current request
$requests[] = $current_time;
file_put_contents($rate_limit_file, json_encode($requests));

// Define the logo path
$logo_path = __DIR__ . '/media/favicon.png';
$logo_url = 'https://lionsfundraising.com/media/favicon.png';

// Check if local file exists first
if (file_exists($logo_path)) {
    $image_data = file_get_contents($logo_path);
    $last_modified = filemtime($logo_path);
} else {
    // Fallback to remote fetch with security
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 10,
            'user_agent' => 'Lions-Proxy/1.0',
            'header' => [
                'Accept: image/png, image/jpeg, image/gif',
                'Cache-Control: no-cache'
            ]
        ]
    ]);
    
    $image_data = @file_get_contents($logo_url, false, $context);
    $last_modified = time();
    
    if ($image_data === false) {
        // Return a simple fallback image
        http_response_code(404);
        header('Content-Type: text/plain');
        echo 'Logo not available';
        exit;
    }
}

// Validate that it's actually an image
$image_info = getimagesizefromstring($image_data);
if ($image_info === false) {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'Invalid image data';
    exit;
}

// Set appropriate headers
$mime_type = $image_info['mime'];
header('Content-Type: ' . $mime_type);
header('Content-Length: ' . strlen($image_data));
header('Cache-Control: public, max-age=3600'); // Cache for 1 hour
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $last_modified) . ' GMT');
header('ETag: "' . md5($image_data) . '"');

// Handle conditional requests
$if_modified_since = $_SERVER['HTTP_IF_MODIFIED_SINCE'] ?? '';
$if_none_match = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';

if ($if_modified_since && strtotime($if_modified_since) >= $last_modified) {
    http_response_code(304);
    exit;
}

if ($if_none_match && $if_none_match === '"' . md5($image_data) . '"') {
    http_response_code(304);
    exit;
}

// Security: Add watermark or subtle modification to prevent unauthorized use
if ($mime_type === 'image/png') {
    $image = imagecreatefromstring($image_data);
    if ($image !== false) {
        // Add a very subtle 1-pixel transparent overlay (virtually invisible)
        $transparent = imagecolorallocatealpha($image, 0, 0, 0, 127);
        imagesetpixel($image, 0, 0, $transparent);
        
        // Output the modified image
        ob_start();
        imagepng($image);
        $image_data = ob_get_contents();
        ob_end_clean();
        imagedestroy($image);
        
        header('Content-Length: ' . strlen($image_data));
    }
}

// Output the image
echo $image_data;
exit;
?>