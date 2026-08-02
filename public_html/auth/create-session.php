<?php
/**
 * Session Authentication System
 * Lions Fundraising - Protected Session Creation
 * 
 * Creates secure sessions for image proxy access and user authentication
 */

// Start session management
session_start();

// Security headers
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['error' => 'Method not allowed']));
}

// Get client data
$input = file_get_contents('php://input');
$requestData = json_decode($input, true);

// Validate referrer for basic security
$allowedDomains = [
    'lionsfundraising.com',
    'www.lionsfundraising.com',
    'localhost', // For development
    '127.0.0.1'  // For development
];

$referrer = $_SERVER['HTTP_REFERER'] ?? '';
$referrerHost = $referrer ? parse_url($referrer, PHP_URL_HOST) : '';

if ($referrer && !in_array($referrerHost, $allowedDomains)) {
    http_response_code(403);
    exit(json_encode(['error' => 'Unauthorized referrer']));
}

// Rate limiting - prevent session spam
$clientIP = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateLimitFile = sys_get_temp_dir() . '/lions_session_rate_' . md5($clientIP);
$now = time();
$maxSessions = 10; // Max 10 session creations per hour
$timeWindow = 3600; // 1 hour

if (file_exists($rateLimitFile)) {
    $sessionHistory = json_decode(file_get_contents($rateLimitFile), true) ?: [];
    
    // Remove old entries
    $sessionHistory = array_filter($sessionHistory, function($timestamp) use ($now, $timeWindow) {
        return ($now - $timestamp) < $timeWindow;
    });
    
    // Check rate limit
    if (count($sessionHistory) >= $maxSessions) {
        http_response_code(429);
        exit(json_encode([
            'error' => 'Rate limit exceeded',
            'retry_after' => 3600
        ]));
    }
} else {
    $sessionHistory = [];
}

// Create authenticated session for image access
$sessionData = [
    'user_authenticated' => true,
    'created_at' => $now,
    'last_activity' => $now,
    'ip_address' => $clientIP,
    'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
    'referrer' => $referrer,
    'session_type' => 'protected_access'
];

// Store session data
foreach ($sessionData as $key => $value) {
    $_SESSION[$key] = $value;
}

// Generate secure session token
$sessionToken = bin2hex(random_bytes(32));
$_SESSION['session_token'] = $sessionToken;
$_SESSION['token_expires'] = $now + 3600; // Token expires in 1 hour

// Generate access token for image proxy
$accessTokenData = [
    'session_id' => session_id(),
    'ip' => $clientIP,
    'timestamp' => $now,
    'expires' => $now + 3600
];

$accessToken = base64_encode(json_encode($accessTokenData));
$_SESSION['access_token'] = $accessToken;

// Update rate limiting
$sessionHistory[] = $now;
file_put_contents($rateLimitFile, json_encode($sessionHistory), LOCK_EX);

// Log session creation for security monitoring
$logEntry = [
    'timestamp' => date('Y-m-d H:i:s'),
    'action' => 'session_created',
    'session_id' => session_id(),
    'ip' => $clientIP,
    'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
    'referrer' => $referrer,
    'client_data' => $requestData
];

// Create log directory if it doesn't exist
$logDir = dirname(__DIR__) . '/logs';
if (!is_dir($logDir)) {
    mkdir($logDir, 0755, true);
}

// Log session creation
$logFile = $logDir . '/session_creation_' . date('Y-m-d') . '.log';
$logLine = json_encode($logEntry) . "\n";
file_put_contents($logFile, $logLine, FILE_APPEND | LOCK_EX);

// Prepare response
$response = [
    'success' => true,
    'session_id' => session_id(),
    'token' => $sessionToken,
    'access_token' => $accessToken,
    'expires_at' => $now + 3600,
    'timestamp' => $now,
    'message' => 'Protected session created successfully'
];

// Optional: Set secure session cookie settings
if (!headers_sent()) {
    $cookieParams = [
        'lifetime' => 3600, // 1 hour
        'path' => '/',
        'domain' => '', // Set to your domain if needed
        'secure' => isset($_SERVER['HTTPS']), // Only over HTTPS
        'httponly' => true, // Prevent XSS
        'samesite' => 'Strict' // CSRF protection
    ];
    
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params($cookieParams);
    } else {
        // Fallback for older PHP versions
        session_set_cookie_params(
            $cookieParams['lifetime'],
            $cookieParams['path'],
            $cookieParams['domain'],
            $cookieParams['secure'],
            $cookieParams['httponly']
        );
    }
}

// Send response
echo json_encode($response, JSON_PRETTY_PRINT);

/**
 * Clean up expired session tracking files
 * Runs occasionally to prevent disk usage buildup
 */
function cleanupExpiredSessions() {
    $tempDir = sys_get_temp_dir();
    $pattern = $tempDir . '/lions_session_rate_*';
    $files = glob($pattern);
    $now = time();
    $maxAge = 7200; // 2 hours
    
    foreach ($files as $file) {
        if (file_exists($file) && ($now - filemtime($file)) > $maxAge) {
            unlink($file);
        }
    }
}

// Occasionally clean up old files (1% chance)
if (rand(1, 100) === 1) {
    cleanupExpiredSessions();
}

/**
 * Validate existing session (helper function for other scripts)
 */
function validateSession() {
    if (!isset($_SESSION['user_authenticated']) || !$_SESSION['user_authenticated']) {
        return false;
    }
    
    // Check session timeout
    $now = time();
    if (isset($_SESSION['last_activity']) && ($now - $_SESSION['last_activity']) > 3600) {
        session_destroy();
        return false;
    }
    
    // Check token expiration
    if (isset($_SESSION['token_expires']) && $now > $_SESSION['token_expires']) {
        unset($_SESSION['session_token']);
        unset($_SESSION['access_token']);
        return false;
    }
    
    // Update last activity
    $_SESSION['last_activity'] = $now;
    
    return true;
}

/**
 * Get current session info (helper function)
 */
function getSessionInfo() {
    if (!validateSession()) {
        return null;
    }
    
    return [
        'session_id' => session_id(),
        'created_at' => $_SESSION['created_at'] ?? null,
        'last_activity' => $_SESSION['last_activity'] ?? null,
        'ip_address' => $_SESSION['ip_address'] ?? null,
        'token' => $_SESSION['session_token'] ?? null,
        'access_token' => $_SESSION['access_token'] ?? null
    ];
}
?>