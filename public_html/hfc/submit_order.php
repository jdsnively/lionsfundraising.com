<?php
// submit_order.php - SECURE VERSION
require_once 'config.php';

// Security headers
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');

// Secure CORS - Use your config
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, ALLOWED_ORIGINS)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Check for AJAX request
if (!isset($_SERVER['HTTP_X_REQUESTED_WITH']) || 
    strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) !== 'xmlhttprequest') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Invalid request type']);
    exit;
}

// Rate limiting with session
session_start();
$currentTime = time();
$lastSubmit = $_SESSION['last_order_submit'] ?? 0;
$submitCount = $_SESSION['order_submit_count'] ?? 0;
$resetTime = $_SESSION['rate_limit_reset'] ?? 0;

// Reset counter every hour
if ($currentTime > $resetTime) {
    $submitCount = 0;
    $_SESSION['rate_limit_reset'] = $currentTime + 3600; // 1 hour
}

// Check rate limits: max 5 orders per hour, 30 seconds between orders
if (($currentTime - $lastSubmit < 30) || ($submitCount >= 5)) {
    http_response_code(429);
    echo json_encode(['success' => false, 'error' => 'Too many requests. Please wait before submitting another order.']);
    exit;
}

// Content length protection
$maxSize = 50000; // 50KB max
if (isset($_SERVER['CONTENT_LENGTH']) && $_SERVER['CONTENT_LENGTH'] > $maxSize) {
    http_response_code(413);
    echo json_encode(['success' => false, 'error' => 'Request too large']);
    exit;
}

try {
    // Get and validate JSON input
    $input = file_get_contents('php://input');
    if (strlen($input) > $maxSize) {
        throw new Exception('Request too large');
    }
    
    $data = json_decode($input, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Invalid JSON data');
    }
    
    if (!is_array($data)) {
        throw new Exception('Invalid data format');
    }

    // SECURE VALIDATION FUNCTIONS
    function validateText($value, $fieldName, $minLength = 1, $maxLength = 200) {
        if (!is_string($value)) {
            throw new Exception("$fieldName must be text");
        }
        
        // Remove dangerous characters and HTML
        $cleaned = trim(strip_tags($value));
        $cleaned = preg_replace('/[^\p{L}\p{N}\s\-\'\.]/u', '', $cleaned);
        
        if (strlen($cleaned) < $minLength) {
            throw new Exception("$fieldName is too short (minimum $minLength characters)");
        }
        
        if (strlen($cleaned) > $maxLength) {
            throw new Exception("$fieldName is too long (maximum $maxLength characters)");
        }
        
        return $cleaned;
    }

    function validateEmail($email) {
        if (!is_string($email)) {
            throw new Exception('Email must be text');
        }
        
        $cleaned = trim(strtolower($email));
        $cleaned = filter_var($cleaned, FILTER_SANITIZE_EMAIL);
        
        if (!filter_var($cleaned, FILTER_VALIDATE_EMAIL)) {
            throw new Exception('Invalid email address format');
        }
        
        if (strlen($cleaned) > 254) {
            throw new Exception('Email address too long');
        }
        
        // Check for suspicious patterns
        if (preg_match('/[<>"\'\\\\\x00-\x1f\x7f]/', $cleaned)) {
            throw new Exception('Email contains invalid characters');
        }
        
        return $cleaned;
    }

    function validatePhone($phone) {
        if (!is_string($phone)) {
            throw new Exception('Phone must be text');
        }
        
        $cleaned = trim($phone);
        $cleaned = preg_replace('/[^\d\s\-\(\)\+\.]/', '', $cleaned);
        
        if (strlen($cleaned) < 10 || strlen($cleaned) > 25) {
            throw new Exception('Invalid phone number length');
        }
        
        return $cleaned;
    }

    function validateCart($cart) {
        if (!is_array($cart) || empty($cart)) {
            throw new Exception('Cart cannot be empty');
        }
        
        if (count($cart) > 50) {
            throw new Exception('Too many items in cart');
        }
        
        $validatedCart = [];
        $totalAmount = 0;
        $totalItems = 0;
        
        foreach ($cart as $item) {
            if (!is_array($item)) {
                throw new Exception('Invalid cart item format');
            }
            
            if (!isset($item['id'], $item['name'], $item['price'], $item['quantity'])) {
                throw new Exception('Missing cart item data');
            }
            
            $id = validateText($item['id'], 'Item ID', 1, 100);
            $name = validateText($item['name'], 'Item name', 1, 200);
            
            // Validate price
            if (!is_numeric($item['price'])) {
                throw new Exception('Invalid item price');
            }
            $price = round(floatval($item['price']), 2);
            if ($price < 0.01 || $price > 1000.00) {
                throw new Exception('Item price out of valid range ($0.01 - $1000.00)');
            }
            
            // Validate quantity
            if (!is_numeric($item['quantity'])) {
                throw new Exception('Invalid item quantity');
            }
            $quantity = intval($item['quantity']);
            if ($quantity < 1 || $quantity > 100) {
                throw new Exception('Item quantity out of valid range (1-100)');
            }
            
            $itemTotal = $price * $quantity;
            $totalAmount += $itemTotal;
            $totalItems += $quantity;
            
            $validatedCart[] = [
                'id' => $id,
                'name' => $name,
                'price' => $price,
                'quantity' => $quantity,
                'total' => $itemTotal
            ];
        }
        
        // Check total limits
        if ($totalAmount > 25000.00) {
            throw new Exception('Order total exceeds maximum ($25,000)');
        }
        
        if ($totalItems > 500) {
            throw new Exception('Too many total items in order');
        }
        
        return ['items' => $validatedCart, 'total' => $totalAmount, 'item_count' => $totalItems];
    }

    // Validate all inputs
    $customerName = validateText($data['customerName'] ?? '', 'Customer name', 2, 100);
    $customerEmail = validateEmail($data['customerEmail'] ?? '');
    $customerPhone = validatePhone($data['customerPhone'] ?? '');
    $teamName = validateText($data['teamName'] ?? 'Lions Football', 'Team name', 1, 100);
    $specialInstructions = isset($data['specialInstructions']) ? 
        validateText($data['specialInstructions'], 'Special instructions', 0, 1000) : '';
    
    // Validate cart
    $cartData = validateCart($data['cart'] ?? []);
    
    // Generate secure order details
    $orderNumber = 'LFC-' . date('Ymd') . '-' . sprintf('%06d', random_int(100000, 999999));
    $orderDate = date('Y-m-d H:i:s T');
    
    // Build order summary for email
    $orderSummary = [];
    foreach ($cartData['items'] as $item) {
        $orderSummary[] = sprintf(
            "%s: %d × $%.2f = $%.2f",
            $item['name'],
            $item['quantity'],
            $item['price'],
            $item['total']
        );
    }
    
    // Create secure email content
    $subject = "HFC Order $orderNumber - $teamName - $customerName";
    
$emailBody = "NEW LIONS FOOTBALL MERCHANDISE ORDER
=========================================

ORDER NUMBER: $orderNumber
ORDER DATE: $orderDate
EVENT: Homeschool Football Classic - August 23, 2025

CUSTOMER INFORMATION:
Name: $customerName
Email: $customerEmail
Phone: $customerPhone
Team: $teamName

ITEMS ORDERED:
================
" . implode("\n", $orderSummary) . "
================

ORDER SUMMARY:
Total Amount: $" . number_format($cartData['total'], 2) . "
Total Items: " . $cartData['item_count'] . "

SPECIAL INSTRUCTIONS:
" . ($specialInstructions ?: 'None') . "

TECHNICAL INFO:
Submitted: $orderDate
Customer IP: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "
User Agent: " . substr($_SERVER['HTTP_USER_AGENT'] ?? 'unknown', 0, 200) . "

Faith • Family • Football
Lions Football Team";

    // Secure email headers
    $headers = [
        'From: ' . STORE_NAME . ' <' . FROM_EMAIL . '>',
        'Reply-To: ' . $customerName . ' <' . $customerEmail . '>',
        'Cc: orders@lionsfundraising.com',
        'Return-Path: ' . FROM_EMAIL,
        'X-Mailer: ' . STORE_NAME . ' v2.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'MIME-Version: 1.0',
        'Message-ID: <' . $orderNumber . '.' . time() . '@lionsfootballclub.com>',
        'Date: ' . date('r'),
        'X-Priority: 1 (Highest)',
        'Importance: High'
    ];
    
    // Send email
    $emailSuccess = mail(RECIPIENT_EMAIL, $subject, $emailBody, implode("\r\n", $headers));
    
    if (!$emailSuccess) {
        error_log("Failed to send order email for $orderNumber to " . RECIPIENT_EMAIL);
        throw new Exception('Email delivery failed. Please try again or contact support.');
    }
    
// Send customer confirmation
$customerSubject = "Order Confirmation - Lions Football ($orderNumber)";
$customerBody = "Thank you for your Lions Football merchandise order!

Order Number: $orderNumber
Order Date: $orderDate
Event: Homeschool Football Classic - August 23, 2025

YOUR ORDER DETAILS:
================
" . implode("\n", $orderSummary) . "
================

Order Total: $" . number_format($cartData['total'], 2) . "
Total Items: " . $cartData['item_count'] . "

We have received your order and will contact you soon with payment and pickup details.

Go Lions!
Faith • Family • Football

Lions Football Team
Central Indiana

Questions? Reply to this email or visit lionsfootballclub.com";

    mail($customerEmail, $customerSubject, $customerBody, implode("\r\n", $headers));
    
    // Secure logging
    if (ENABLE_LOGGING) {
        $logEntry = [
            'timestamp' => $orderDate,
            'order_number' => $orderNumber,
            'customer_name' => $customerName,
            'customer_email' => $customerEmail,
            'total' => $cartData['total'],
            'item_count' => $cartData['item_count'],
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
        ];
        
        $logLine = json_encode($logEntry) . "\n";
        
        try {
            if (file_put_contents(LOG_FILE, $logLine, FILE_APPEND | LOCK_EX) === false) {
                error_log("Failed to write to order log file: " . LOG_FILE);
            }
        } catch (Exception $e) {
            error_log("Order logging error: " . $e->getMessage());
        }
    }
    
    // Update rate limiting
    $_SESSION['last_order_submit'] = $currentTime;
    $_SESSION['order_submit_count'] = $submitCount + 1;
    
    // Success response
    echo json_encode([
        'success' => true,
        'message' => 'Order submitted successfully!',
        'order_number' => $orderNumber
    ]);

} catch (Exception $e) {
    // Log error securely
    error_log("Order submission error: " . $e->getMessage() . " | IP: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    
    // Return user-safe error
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
    
} catch (Error $e) {
    // Log system errors
    error_log("PHP Error in order submission: " . $e->getMessage() . " | File: " . $e->getFile() . " | Line: " . $e->getLine());
    
    // Generic error for security
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'A system error occurred. Please try again later.'
    ]);
}
?>