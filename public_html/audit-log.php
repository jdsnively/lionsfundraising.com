<?php
/**
 * Audit Logging System
 * Lions Fundraising - Security Event Logging
 * 
 * Logs all protection-related activities and unauthorized attempts
 */

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['error' => 'Method not allowed']));
}

// Get JSON input
$input = file_get_contents('php://input');
$logData = json_decode($input, true);

if (!$logData) {
    http_response_code(400);
    exit(json_encode(['error' => 'Invalid JSON data']));
}

// Add server-side data to log entry
$logEntry = [
    'timestamp' => date('Y-m-d H:i:s'),
    'server_ip' => $_SERVER['SERVER_ADDR'] ?? 'unknown',
    'client_ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
    'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
    'referrer' => $_SERVER['HTTP_REFERER'] ?? 'direct',
    'session_id' => session_id(),
    'request_uri' => $_SERVER['REQUEST_URI'] ?? 'unknown',
    'client_data' => $logData
];

// Determine log type and file
$logType = $logData['type'] ?? 'general';
$action = $logData['action'] ?? 'unknown';

// Create log directory if it doesn't exist
$logDir = __DIR__ . '/logs';
if (!is_dir($logDir)) {
    if (!mkdir($logDir, 0755, true)) {
        http_response_code(500);
        exit(json_encode(['error' => 'Failed to create log directory']));
    }
}

// Determine log file based on type
$date = date('Y-m-d');
$logFile = $logDir . "/audit_{$logType}_{$date}.log";

// Write log entry
$logLine = json_encode($logEntry) . "\n";
if (file_put_contents($logFile, $logLine, FILE_APPEND | LOCK_EX) === false) {
    http_response_code(500);
    exit(json_encode(['error' => 'Failed to write log']));
}

// For unauthorized attempts, also log to security file
if ($logData['type'] === 'unauthorized_attempt') {
    $securityFile = $logDir . "/security_incidents_{$date}.log";
    file_put_contents($securityFile, $logLine, FILE_APPEND | LOCK_EX);
    
    // Check for repeated attempts from same IP
    checkForRepeatedAttempts($_SERVER['REMOTE_ADDR'], $action);
}

// Log successful response
echo json_encode([
    'success' => true, 
    'logged' => true,
    'timestamp' => $logEntry['timestamp'],
    'log_file' => basename($logFile)
]);

/**
 * Check for repeated unauthorized attempts from same IP
 */
function checkForRepeatedAttempts($ip, $action) {
    $alertFile = __DIR__ . '/logs/alert_tracking.json';
    $alerts = [];
    
    // Load existing alert tracking
    if (file_exists($alertFile)) {
        $content = file_get_contents($alertFile);
        $alerts = $content ? json_decode($content, true) : [];
        if (!is_array($alerts)) {
            $alerts = [];
        }
    }
    
    $key = md5($ip . '_' . $action); // Hash for privacy
    $now = time();
    
    // Initialize or update attempt tracking
    if (!isset($alerts[$key])) {
        $alerts[$key] = [
            'count' => 1, 
            'first_seen' => $now, 
            'last_seen' => $now,
            'ip_hash' => md5($ip), // Store hashed IP for privacy
            'action' => $action
        ];
    } else {
        $alerts[$key]['count']++;
        $alerts[$key]['last_seen'] = $now;
    }
    
    // Alert if more than 5 attempts in 10 minutes
    $timeWindow = 600; // 10 minutes
    if ($alerts[$key]['count'] > 5 && ($now - $alerts[$key]['first_seen']) < $timeWindow) {
        sendSecurityAlert($ip, $action, $alerts[$key]['count']);
        
        // Reset counter after alert
        $alerts[$key]['count'] = 0;
        $alerts[$key]['first_seen'] = $now;
    }
    
    // Clean old entries (older than 1 hour)
    $maxAge = 3600; // 1 hour
    foreach ($alerts as $alertKey => $alertData) {
        if ($now - $alertData['last_seen'] > $maxAge) {
            unset($alerts[$alertKey]);
        }
    }
    
    // Save updated tracking
    file_put_contents($alertFile, json_encode($alerts), LOCK_EX);
}

/**
 * Send high-priority security alert
 */
function sendSecurityAlert($ip, $action, $count) {
    $alertData = [
        'timestamp' => date('Y-m-d H:i:s'),
        'alert_type' => 'repeated_unauthorized_attempts',
        'ip_hash' => md5($ip), // Hash IP for privacy in logs
        'action' => $action,
        'attempt_count' => $count,
        'severity' => 'high',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
        'referrer' => $_SERVER['HTTP_REFERER'] ?? 'direct'
    ];
    
    // Log to high-priority security alerts file
    $alertFile = __DIR__ . '/logs/security_alerts_' . date('Y-m-d') . '.log';
    $alertLine = json_encode($alertData) . "\n";
    file_put_contents($alertFile, $alertLine, FILE_APPEND | LOCK_EX);
    
    // Optional: Send email notification (uncomment and configure as needed)
    /*
    $subject = 'Lions Security Alert: Repeated Unauthorized Attempts';
    $message = "High-priority security alert:\n\n" . json_encode($alertData, JSON_PRETTY_PRINT);
    $headers = 'From: security@lionsfundraising.com';
    mail('admin@lionsfundraising.com', $subject, $message, $headers);
    */
    
    // Log the alert generation
    error_log("Security alert generated for repeated attempts: " . json_encode($alertData));
}

/**
 * Clean up old log files (can be called via cron job)
 * Uncomment and call this function periodically to manage disk space
 */
function cleanOldLogs($daysToKeep = 30) {
    $logDir = __DIR__ . '/logs';
    $files = glob($logDir . '/*.log');
    $cutoffTime = time() - ($daysToKeep * 24 * 60 * 60);
    
    foreach ($files as $file) {
        if (filemtime($file) < $cutoffTime) {
            unlink($file);
        }
    }
}

// Optional: Clean old logs (uncomment to enable automatic cleanup)
// if (rand(1, 100) === 1) { // 1% chance to run cleanup
//     cleanOldLogs(30);
// }
?>