<?php
// config.php - SECURE Email configuration settings

// Email Settings
define('RECIPIENT_EMAIL', 'piercerachel@lionsfundraising.com, treasurer@lionsfundraising.com, treasurer@lionsfootballclub.com, fundraising@lionsfootballclub.com');
define('FROM_EMAIL', 'fundraising@lionsfootballclub.com');
define('STORE_NAME', 'Lions Football HFC Merchandise Store');

// Security Settings - CRITICAL: Update these domains to match your actual website
define('ALLOWED_ORIGINS', [
    'https://lionsfootballclub.com',
    'https://www.lionsfootballclub.com',
    // Remove localhost in production!
    'http://localhost:3000', // For testing only - DELETE for production
    'http://127.0.0.1:3000'  // For testing only - DELETE for production
]);

// Rate Limiting Settings
define('MAX_ORDERS_PER_HOUR', 5);
define('MIN_SECONDS_BETWEEN_ORDERS', 30);
define('MAX_REQUEST_SIZE', 50000); // 50KB

// Validation Limits
define('MAX_CART_ITEMS', 50);
define('MAX_ITEM_QUANTITY', 100);
define('MAX_ORDER_TOTAL', 25000.00);
define('MAX_TOTAL_ITEMS', 500);

// Logging
define('ENABLE_LOGGING', true);
define('LOG_FILE', __DIR__ . '/orders.log'); // Full path for security

// Error Reporting (set to false in production)
define('DEBUG_MODE', false); // Set to false for production!

// Optional: Advanced Email Settings
// Uncomment and configure if basic mail() doesn't work on your server
/*
define('USE_SMTP', true);
define('SMTP_HOST', 'smtp.lionsfootballclub.com');
define('SMTP_PORT', 587);
define('SMTP_USERNAME', 'noreply@lionsfootballclub.com');
define('SMTP_PASSWORD', 'your-secure-password');
define('SMTP_SECURE', 'tls'); // 'tls' or 'ssl'
define('SMTP_AUTH', true);
*/

// Database Settings (if you want to store orders)
/*
define('DB_HOST', 'localhost');
define('DB_NAME', 'lions_football');
define('DB_USERNAME', 'your_db_user');
define('DB_PASSWORD', 'your_secure_db_password');
define('DB_CHARSET', 'utf8mb4');
*/

// Security validation
if (DEBUG_MODE && !in_array($_SERVER['HTTP_HOST'] ?? '', ['localhost', '127.0.0.1'])) {
    error_log('WARNING: DEBUG_MODE is enabled on production server!');
}

// Ensure log directory is writable
if (ENABLE_LOGGING && !is_writable(dirname(LOG_FILE))) {
    error_log('WARNING: Log directory is not writable: ' . dirname(LOG_FILE));
}

// PHP Settings for security
ini_set('display_errors', DEBUG_MODE ? 1 : 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/php_errors.log');

// Session security settings
if (!headers_sent()) {
    ini_set('session.cookie_httponly', 1);
    ini_set('session.cookie_secure', isset($_SERVER['HTTPS']) ? 1 : 0);
    ini_set('session.cookie_samesite', 'Strict');
    ini_set('session.use_strict_mode', 1);
    ini_set('session.gc_maxlifetime', 3600); // 1 hour
}

?>