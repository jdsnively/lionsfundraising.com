<?php
/**
 * Hold Harmless Agreement Submission Handler
 * 
 * Processes form submissions, validates data, generates PDFs, and sends email notifications.
 * 
 * @package HoldHarmlessAgreement
 * @version 1.0
 * @author Lions Football Club
 */

require_once 'config.php';

class SubmissionHandler 
{
    private array $formData = [];
    private array $errors = [];
    
    public function __construct() 
    {
        $this->setResponseHeaders();
        $this->handlePreflightRequest();
    }
    
    public function processRequest(): void 
    {
        try {
            $this->validateRequestMethod();
            $this->validateAndSanitizeInput();
            $this->validateFileUpload();
            $this->sendEmailNotification();
            $this->logSubmission();
            $this->sendSuccessResponse();
            
        } catch (ValidationException $e) {
            $this->sendErrorResponse($e->getMessage(), 400);
        } catch (Exception $e) {
            $this->logError($e);
            $this->sendErrorResponse('Submission processing failed. Please try again.', 500);
        }
    }
    
    private function setResponseHeaders(): void 
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
    }
    
    private function handlePreflightRequest(): void 
    {
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(200);
            exit;
        }
    }
    
    private function validateRequestMethod(): void 
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            throw new ValidationException('Only POST requests are supported');
        }
    }
    
    private function validateAndSanitizeInput(): void 
    {
        $requiredFields = [
            'participantName' => 'Participant name',
            'guardianName' => 'Guardian name', 
            'email' => 'Email address',
            'phone' => 'Phone number'
        ];
        
        foreach ($requiredFields as $field => $label) {
            $value = trim($_POST[$field] ?? '');
            if (empty($value)) {
                throw new ValidationException("Missing required field: {$label}");
            }
            $this->formData[$field] = $this->sanitizeInput($value);
        }
        
        $this->validateEmail();
        $this->validatePhoneNumber();
        $this->sanitizeOptionalFields();
    }
    
    private function sanitizeInput(string $input): string 
    {
        return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
    }
    
    private function validateEmail(): void 
    {
        if (!filter_var($this->formData['email'], FILTER_VALIDATE_EMAIL)) {
            throw new ValidationException('Invalid email address format');
        }
    }
    
    private function validatePhoneNumber(): void 
    {
        $phone = preg_replace('/[^\d+\-\(\)\s\.]/', '', $this->formData['phone']);
        if (strlen($phone) < 7) {
            throw new ValidationException('Invalid phone number format');
        }
        $this->formData['phone'] = $phone;
    }
    
    private function sanitizeOptionalFields(): void 
    {
        $optionalFields = ['address', 'participantDOB', 'signatureDate'];
        
        foreach ($optionalFields as $field) {
            $this->formData[$field] = $this->sanitizeInput($_POST[$field] ?? '');
        }
    }
    
    private function validateFileUpload(): void 
    {
        if (!isset($_FILES['pdf']) || $_FILES['pdf']['error'] !== UPLOAD_ERR_OK) {
            throw new ValidationException('PDF file upload failed or missing');
        }
        
        $file = $_FILES['pdf'];
        
        if ($file['size'] > Config::UPLOAD_MAX_SIZE) {
            $maxSizeMB = Config::UPLOAD_MAX_SIZE / 1048576;
            throw new ValidationException("File too large. Maximum size: {$maxSizeMB}MB");
        }
        
        if (!in_array($file['type'], Config::ALLOWED_MIME_TYPES)) {
            throw new ValidationException('Only PDF files are allowed');
        }
        
        $this->validateFileContent($file['tmp_name']);
    }
    
    private function validateFileContent(string $filePath): void 
    {
        if (!function_exists('finfo_open')) {
            return; // Skip validation if finfo extension not available
        }
        
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $detectedType = finfo_file($finfo, $filePath);
        finfo_close($finfo);
        
        if ($detectedType !== 'application/pdf') {
            throw new ValidationException('File content does not match PDF format');
        }
    }
    
    private function sendEmailNotification(): void 
    {
        $emailConfig = Config::getEmailConfig();
        $pdfContent = $this->getPdfContent();
        
        $subject = $this->buildEmailSubject();
        $message = $this->buildEmailMessage();
        $headers = $this->buildEmailHeaders($emailConfig);
        $body = $this->buildEmailBodyWithAttachment($message, $pdfContent);
        $recipients = $this->buildRecipientList($emailConfig);
        
        if (!mail($recipients, $subject, $body, $headers)) {
            throw new Exception('Email delivery failed');
        }
    }
    
    private function getPdfContent(): string 
    {
        $content = file_get_contents($_FILES['pdf']['tmp_name']);
        if ($content === false) {
            throw new Exception('Failed to read PDF file');
        }
        return $content;
    }
    
    private function buildEmailSubject(): string 
    {
        $timestamp = date(Config::DATE_FORMAT);
        return Config::FORM_TITLE . " - {$this->formData['participantName']} - {$timestamp}";
    }
    
    private function buildEmailMessage(): string 
    {
        $timestamp = date(Config::DATE_FORMAT);
        
        return "New " . Config::FORM_TITLE . " Submission\n\n" .
               "Event: " . Config::ORGANIZATION . "\n" .
               "Submission Date: {$timestamp}\n\n" .
               "Participant Information:\n" .
               "Name: {$this->formData['participantName']}\n" .
               "Date of Birth: {$this->formData['participantDOB']}\n\n" .
               "Guardian Information:\n" .
               "Name: {$this->formData['guardianName']}\n" .
               "Email: {$this->formData['email']}\n" .
               "Phone: {$this->formData['phone']}\n" .
               "Address: {$this->formData['address']}\n\n" .
               "Please find the completed agreement attached.\n\n" .
               "This is an automated message from the " . Config::ORGANIZATION . " registration system.";
    }
    
    private function buildEmailHeaders(array $emailConfig): string 
    {
        $boundary = $this->generateBoundary();
        
        $headers = [
            "From: {$emailConfig['from']}",
            "Reply-To: {$this->formData['email']}",
            "Return-Path: {$emailConfig['return_path']}",
            "X-Mailer: PHP/" . phpversion(),
            "MIME-Version: 1.0",
            "Content-Type: multipart/mixed; boundary=\"{$boundary}\""
        ];
        
        // Add CC recipients if specified
        if (!empty($emailConfig['cc'])) {
            $ccList = implode(', ', array_filter($emailConfig['cc']));
            if ($ccList) {
                $headers[] = "Cc: {$ccList}";
            }
        }
        
        // Add BCC recipients if specified
        if (!empty($emailConfig['bcc'])) {
            $bccList = implode(', ', array_filter($emailConfig['bcc']));
            if ($bccList) {
                $headers[] = "Bcc: {$bccList}";
            }
        }
        
        return implode("\r\n", $headers);
    }
    
    private function buildRecipientList(array $emailConfig): string 
    {
        // Use multiple TO addresses if specified, otherwise use single recipient
        if (!empty($emailConfig['additional_to']) && count($emailConfig['additional_to']) > 1) {
            return implode(', ', array_filter($emailConfig['additional_to']));
        }
        
        return $emailConfig['to'];
    }
    
    private function buildEmailBodyWithAttachment(string $message, string $pdfContent): string 
    {
        $boundary = $this->generateBoundary();
        $filename = $this->generateFilename();
        $encodedPdf = chunk_split(base64_encode($pdfContent));
        
        $body = "--{$boundary}\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: 7bit\r\n\r\n";
        $body .= $message . "\r\n\r\n";
        
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Type: application/pdf; name=\"{$filename}\"\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n";
        $body .= "Content-Disposition: attachment; filename=\"{$filename}\"\r\n\r\n";
        $body .= $encodedPdf . "\r\n";
        $body .= "--{$boundary}--\r\n";
        
        return $body;
    }
    
    private function generateBoundary(): string 
    {
        static $boundary;
        return $boundary ?: $boundary = md5(time() . uniqid());
    }
    
    private function generateFilename(): string 
    {
        $safeName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $this->formData['participantName']);
        $timestamp = date('Y-m-d_H-i-s');
        return "Hold_Harmless_Agreement_{$safeName}_{$timestamp}.pdf";
    }
    
    private function logSubmission(): void 
    {
        if (!Config::LOGGING_ENABLED) return;
        
        $logEntry = [
            'timestamp' => date('Y-m-d H:i:s'),
            'participant' => $this->formData['participantName'],
            'guardian' => $this->formData['guardianName'],
            'email' => $this->formData['email'],
            'phone' => $this->formData['phone'],
            'ip_address' => $this->getClientIpAddress(),
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown'
        ];
        
        $logLine = json_encode($logEntry) . "\n";
        file_put_contents(Config::LOG_FILE, $logLine, FILE_APPEND | LOCK_EX);
    }
    
    private function getClientIpAddress(): string 
    {
        $ipHeaders = ['HTTP_CF_CONNECTING_IP', 'HTTP_CLIENT_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'];
        
        foreach ($ipHeaders as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = explode(',', $_SERVER[$header])[0];
                $ip = trim($ip);
                if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                    return $ip;
                }
            }
        }
        
        return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }
    
    private function logError(Exception $e): void 
    {
        $errorMessage = sprintf(
            "[%s] %s in %s:%d\nStack trace:\n%s",
            date('Y-m-d H:i:s'),
            $e->getMessage(),
            $e->getFile(),
            $e->getLine(),
            $e->getTraceAsString()
        );
        
        error_log($errorMessage);
    }
    
    private function sendSuccessResponse(): void 
    {
        echo json_encode([
            'success' => true,
            'message' => 'Agreement submitted successfully. Confirmation email sent.',
            'timestamp' => date('Y-m-d H:i:s')
        ]);
    }
    
    private function sendErrorResponse(string $message, int $httpCode = 400): void 
    {
        http_response_code($httpCode);
        echo json_encode([
            'success' => false,
            'message' => $message,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
    }
}

class ValidationException extends Exception {}

// Process the request
try {
    $handler = new SubmissionHandler();
    $handler->processRequest();
} catch (Throwable $e) {
    error_log("Fatal error in submission handler: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'A system error occurred. Please try again later.',
        'timestamp' => date('Y-m-d H:i:s')
    ]);
}