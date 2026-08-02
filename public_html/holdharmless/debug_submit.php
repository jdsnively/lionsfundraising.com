<?php
/**
 * Debug version to find exactly what's causing the error
 * This will help identify why PHP is returning HTML instead of JSON
 */

// Capture ALL output to prevent HTML from interfering with JSON
ob_start();

// Enable all error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

$debug = [];
$errors = [];

try {
    $debug[] = "=== DEBUG SUBMIT START ===";
    $debug[] = "Request method: " . ($_SERVER['REQUEST_METHOD'] ?? 'unknown');
    $debug[] = "Content type: " . ($_SERVER['CONTENT_TYPE'] ?? 'not set');
    $debug[] = "Script name: " . (__FILE__);
    $debug[] = "Current directory: " . getcwd();
    
    // Step 1: Check if config.php exists
    $debug[] = "=== CHECKING CONFIG FILE ===";
    if (!file_exists('config.php')) {
        throw new Exception('config.php file does not exist in current directory');
    }
    $debug[] = "✓ config.php exists";
    
    // Step 2: Try to require config.php
    $debug[] = "=== LOADING CONFIG ===";
    require_once 'config.php';
    $debug[] = "✓ config.php loaded";
    
    // Step 3: Check required constants
    $debug[] = "=== CHECKING CONSTANTS ===";
    $required_constants = ['RECIPIENT_EMAIL', 'FROM_EMAIL', 'FORM_NAME'];
    foreach ($required_constants as $const) {
        if (!defined($const)) {
            throw new Exception("Required constant '$const' is not defined in config.php");
        }
        $debug[] = "✓ $const = " . constant($const);
    }
    
    // Step 4: Check request method
    $debug[] = "=== CHECKING REQUEST ===";
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('Only POST requests allowed, got: ' . $_SERVER['REQUEST_METHOD']);
    }
    $debug[] = "✓ POST request confirmed";
    
    // Step 5: Check POST data
    $debug[] = "=== CHECKING FORM DATA ===";
    $debug[] = "POST keys: " . implode(', ', array_keys($_POST));
    $debug[] = "FILES keys: " . implode(', ', array_keys($_FILES));
    
    $required_fields = ['participantName', 'guardianName', 'email'];
    foreach ($required_fields as $field) {
        if (empty($_POST[$field])) {
            throw new Exception("Missing required field: $field");
        }
        $debug[] = "✓ $field = " . substr($_POST[$field], 0, 50) . (strlen($_POST[$field]) > 50 ? '...' : '');
    }
    
    // Step 6: Check file upload
    $debug[] = "=== CHECKING FILE UPLOAD ===";
    if (!isset($_FILES['pdf'])) {
        throw new Exception('No PDF file in upload');
    }
    
    $upload_error = $_FILES['pdf']['error'];
    if ($upload_error !== UPLOAD_ERR_OK) {
        $error_messages = [
            UPLOAD_ERR_INI_SIZE => 'File exceeds upload_max_filesize',
            UPLOAD_ERR_FORM_SIZE => 'File exceeds MAX_FILE_SIZE',
            UPLOAD_ERR_PARTIAL => 'File only partially uploaded',
            UPLOAD_ERR_NO_FILE => 'No file uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
            UPLOAD_ERR_EXTENSION => 'File upload stopped by extension'
        ];
        throw new Exception('File upload error: ' . ($error_messages[$upload_error] ?? "Unknown error $upload_error"));
    }
    
    $debug[] = "✓ File upload successful";
    $debug[] = "File size: " . $_FILES['pdf']['size'] . " bytes";
    $debug[] = "File type: " . $_FILES['pdf']['type'];
    $debug[] = "Temp file: " . $_FILES['pdf']['tmp_name'];
    
    // Step 7: Check mail function
    $debug[] = "=== CHECKING MAIL FUNCTION ===";
    if (!function_exists('mail')) {
        throw new Exception('PHP mail() function is not available on this server');
    }
    $debug[] = "✓ mail() function available";
    
    // Step 8: Try simple email (without attachment first)
    $debug[] = "=== TESTING EMAIL ===";
    $test_subject = "Test: " . FORM_NAME . " - " . $_POST['participantName'];
    $test_message = "Test email from debug script\n\nParticipant: " . $_POST['participantName'] . "\nTime: " . date('Y-m-d H:i:s');
    $test_headers = "From: " . FROM_EMAIL . "\r\nContent-Type: text/plain; charset=UTF-8";
    
    $mail_result = mail(RECIPIENT_EMAIL, $test_subject, $test_message, $test_headers);
    if (!$mail_result) {
        $last_error = error_get_last();
        throw new Exception('Mail function failed: ' . ($last_error['message'] ?? 'Unknown mail error'));
    }
    $debug[] = "✓ Simple email sent successfully";
    
    // Step 9: Try email with attachment (simplified)
    $debug[] = "=== TESTING EMAIL WITH ATTACHMENT ===";
    $pdf_data = file_get_contents($_FILES['pdf']['tmp_name']);
    if ($pdf_data === false) {
        throw new Exception('Failed to read uploaded PDF file');
    }
    $debug[] = "✓ PDF data read successfully (" . strlen($pdf_data) . " bytes)";
    
    // Success - return debug info
    $debug[] = "=== ALL TESTS PASSED ===";
    
} catch (Exception $e) {
    $errors[] = "Exception: " . $e->getMessage();
    $errors[] = "File: " . $e->getFile();
    $errors[] = "Line: " . $e->getLine();
} catch (Error $e) {
    $errors[] = "Fatal Error: " . $e->getMessage();
    $errors[] = "File: " . $e->getFile(); 
    $errors[] = "Line: " . $e->getLine();
}

// Capture any output that might have been generated
$captured_output = ob_get_contents();
ob_end_clean();

// Now output clean JSON
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');

// Handle OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    echo json_encode(['success' => true, 'message' => 'Options handled']);
    exit;
}

$response = [
    'success' => empty($errors),
    'message' => empty($errors) ? 'Debug test completed successfully' : 'Errors found during debug',
    'debug' => $debug,
    'errors' => $errors,
    'timestamp' => date('Y-m-d H:i:s'),
    'php_version' => phpversion(),
    'captured_output' => $captured_output,
    'captured_output_length' => strlen($captured_output)
];

// If there was captured output, that's likely the problem
if (!empty($captured_output)) {
    $response['warning'] = 'PHP generated output before JSON - this is likely the problem!';
    $response['captured_preview'] = substr($captured_output, 0, 500);
}

echo json_encode($response, JSON_PRETTY_PRINT);
?>