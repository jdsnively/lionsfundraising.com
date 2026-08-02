<?php
/**
 * Hold Harmless Agreement Submission Handler
 * 
 * Processes legal agreement form submissions with comprehensive validation,
 * secure PDF handling, email notifications, and audit logging.
 * 
 * This system handles sensitive legal documents requiring strict data integrity,
 * security validation, and compliance with record-keeping requirements.
 * 
 * @package HoldHarmlessAgreement
 * @version 1.0
 * @author Lions Football Club
 */

require_once 'config.php';

/**
 * Main submission handler for Hold Harmless Agreement forms
 * 
 * Orchestrates the complete submission workflow:
 * 1. Request validation and security checks
 * 2. Form data sanitization and business rule validation
 * 3. PDF file validation and security scanning
 * 4. Email notification with secure attachment handling
 * 5. Audit logging for compliance tracking
 */
class SubmissionHandler 
{
    /** @var array Sanitized and validated form data */
    private array $formData = [];
    
    /** @var array Collection of validation errors */
    private array $errors = [];
    
    /** @var string Unique boundary identifier for email multipart content */
    private string $emailBoundary;
    
    public function __construct() 
    {
        $this->initializeSecurityHeaders();
        $this->handleCorsPreflightRequest();
        $this->emailBoundary = $this->generateEmailBoundary();
    }
    
    /**
     * Main request processing workflow
     * Coordinates all submission steps with comprehensive error handling
     */
    public function processRequest(): void 
    {
        try {
            $this->validateHttpRequest();
            $this->processAndValidateFormData();
            $this->validateSecurePdfUpload();
            $this->sendLegalDocumentNotification();
            $this->createAuditLogEntry();
            $this->respondWithSuccess();
            
        } catch (ValidationException $e) {
            $this->handleValidationError($e);
        } catch (SecurityException $e) {
            $this->handleSecurityError($e);
        } catch (Exception $e) {
            $this->handleSystemError($e);
        }
    }
    
    // =================================================================
    // REQUEST INITIALIZATION AND SECURITY
    // =================================================================
    
    /**
     * Set security headers for CORS and content protection
     * Essential for cross-origin form submissions while maintaining security
     */
    private function initializeSecurityHeaders(): void 
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
        
        // Additional security headers for legal document handling
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Cache-Control: no-cache, no-store, must-revalidate');
    }
    
    /**
     * Handle CORS preflight requests
     * Required for browser cross-origin form submissions
     */
    private function handleCorsPreflightRequest(): void 
    {
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(200);
            exit;
        }
    }
    
    /**
     * Validate HTTP request method and basic security requirements
     */
    private function validateHttpRequest(): void 
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            throw new ValidationException('Only POST requests are supported for form submissions');
        }
        
        // Basic request integrity checks
        if (empty($_POST) && empty($_FILES)) {
            throw new ValidationException('No form data received');
        }
    }
    
    // =================================================================
    // FORM DATA VALIDATION AND SANITIZATION
    // =================================================================
    
    /**
     * Process and validate all form data with business rule enforcement
     * Implements comprehensive validation for legal document requirements
     */
    private function processAndValidateFormData(): void 
    {
        $this->validateRequiredFields();
        $this->validateBusinessRules();
        $this->sanitizeOptionalFields();
        $this->performCrossFieldValidation();
    }
    
    /**
     * Validate all required fields with appropriate error messaging
     * Legal agreements require complete participant and guardian information
     */
    private function validateRequiredFields(): void 
    {
        $requiredFields = [
            'participantName' => 'Participant full name',
            'guardianName' => 'Parent/Guardian full name', 
            'email' => 'Guardian email address',
            'phone' => 'Guardian phone number'
        ];
        
        foreach ($requiredFields as $fieldName => $displayName) {
            $value = $this->extractAndTrimField($fieldName);
            
            if (empty($value)) {
                throw new ValidationException("Missing required field: {$displayName}");
            }
            
            $this->formData[$fieldName] = $this->sanitizeTextInput($value);
        }
    }
    
    /**
     * Extract and trim field value from POST data
     */
    private function extractAndTrimField(string $fieldName): string 
    {
        return trim($_POST[$fieldName] ?? '');
    }
    
    /**
     * Sanitize text input for safe database storage and display
     * Prevents XSS while preserving legitimate characters in names/addresses
     */
    private function sanitizeTextInput(string $input): string 
    {
        return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
    }
    
    /**
     * Validate business rules specific to legal agreements
     * Enforces data quality standards required for legal documents
     */
    private function validateBusinessRules(): void 
    {
        $this->validateEmailAddress();
        $this->validatePhoneNumber();
        $this->validateNameFields();
    }
    
    /**
     * Validate email address format and domain requirements
     * Critical for legal document delivery and communication
     */
    private function validateEmailAddress(): void 
    {
        $email = $this->formData['email'];
        
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ValidationException('Invalid email address format');
        }
        
        // Additional validation for common email issues
        if (strlen($email) > 254) { // RFC 5321 limit
            throw new ValidationException('Email address is too long');
        }
        
        // Check for obvious fake emails in legal context
        $suspiciousPatterns = ['test@test', 'fake@', 'temp@', 'disposable@'];
        foreach ($suspiciousPatterns as $pattern) {
            if (stripos($email, $pattern) !== false) {
                throw new ValidationException('Please provide a valid, permanent email address');
            }
        }
    }
    
    /**
     * Validate and normalize phone number format
     * Ensures contact information is usable for emergency situations
     */
    private function validatePhoneNumber(): void 
    {
        $rawPhone = $this->formData['phone'];
        $cleanPhone = preg_replace('/[^\d+\-\(\)\s\.]/', '', $rawPhone);
        
        // Remove common formatting and extract digits
        $digitsOnly = preg_replace('/\D/', '', $cleanPhone);
        
        if (strlen($digitsOnly) < 10) {
            throw new ValidationException('Phone number must be at least 10 digits');
        }
        
        if (strlen($digitsOnly) > 15) { // ITU-T E.164 international limit
            throw new ValidationException('Phone number is too long');
        }
        
        $this->formData['phone'] = $cleanPhone;
    }
    
    /**
     * Validate participant and guardian name fields
     * Ensures names meet legal document standards
     */
    private function validateNameFields(): void 
    {
        foreach (['participantName', 'guardianName'] as $nameField) {
            $name = $this->formData[$nameField];
            
            if (strlen($name) < 2) {
                $label = $nameField === 'participantName' ? 'Participant' : 'Guardian';
                throw new ValidationException("{$label} name must be at least 2 characters");
            }
            
            if (strlen($name) > 100) {
                $label = $nameField === 'participantName' ? 'Participant' : 'Guardian';
                throw new ValidationException("{$label} name is too long (maximum 100 characters)");
            }
            
            // Basic name format validation - allow letters, spaces, hyphens, apostrophes
            if (!preg_match("/^[a-zA-Z\s\-'\.]+$/", $name)) {
                $label = $nameField === 'participantName' ? 'Participant' : 'Guardian';
                throw new ValidationException("{$label} name contains invalid characters");
            }
        }
    }
    
    /**
     * Sanitize optional fields with appropriate defaults
     * Handles non-required fields that may still need validation
     */
    private function sanitizeOptionalFields(): void 
    {
        $optionalFields = ['address', 'participantDOB', 'signatureDate'];
        
        foreach ($optionalFields as $field) {
            $this->formData[$field] = $this->sanitizeTextInput($_POST[$field] ?? '');
        }
        
        // Validate date fields if provided
        $this->validateDateFields();
    }
    
    /**
     * Validate date fields for proper format and reasonable values
     */
    private function validateDateFields(): void 
    {
        if (!empty($this->formData['participantDOB'])) {
            if (!$this->isValidDate($this->formData['participantDOB'])) {
                throw new ValidationException('Invalid participant date of birth format');
            }
        }
        
        if (!empty($this->formData['signatureDate'])) {
            if (!$this->isValidDate($this->formData['signatureDate'])) {
                throw new ValidationException('Invalid signature date format');
            }
        }
    }
    
    /**
     * Validate date string format and reasonable range
     */
    private function isValidDate(string $dateString): bool 
    {
        $date = DateTime::createFromFormat('Y-m-d', $dateString);
        if (!$date || $date->format('Y-m-d') !== $dateString) {
            return false;
        }
        
        // Check reasonable date ranges for legal agreements
        $now = new DateTime();
        $minDate = new DateTime('-100 years'); // Reasonable age limit
        $maxDate = new DateTime('+1 day'); // Allow slight future dates for signature
        
        return $date >= $minDate && $date <= $maxDate;
    }
    
    /**
     * Perform cross-field validation for business logic consistency
     */
    private function performCrossFieldValidation(): void 
    {
        // Ensure guardian and participant names are different (basic sanity check)
        if (!empty($this->formData['participantName']) && 
            !empty($this->formData['guardianName']) && 
            $this->formData['participantName'] === $this->formData['guardianName']) {
            
            // Only warn if both names are identical (could be legitimate in some cases)
            error_log("Warning: Participant and guardian names are identical: " . $this->formData['participantName']);
        }
    }
    
    // =================================================================
    // PDF FILE VALIDATION AND SECURITY
    // =================================================================
    
    /**
     * Comprehensive PDF validation for security and integrity
     * Legal documents require strict file validation to prevent malicious uploads
     */
    private function validateSecurePdfUpload(): void 
    {
        $this->checkFileUploadStatus();
        $this->validateFileSize();
        $this->validateFileType();
        $this->performSecurityScan();
    }
    
    /**
     * Check basic file upload status and error conditions
     */
    private function checkFileUploadStatus(): void 
    {
        if (!isset($_FILES['pdf'])) {
            throw new ValidationException('PDF file is required for agreement submission');
        }
        
        $uploadError = $_FILES['pdf']['error'];
        
        switch ($uploadError) {
            case UPLOAD_ERR_OK:
                break; // Success - continue processing
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                throw new ValidationException('PDF file is too large');
            case UPLOAD_ERR_PARTIAL:
                throw new ValidationException('PDF file upload was interrupted');
            case UPLOAD_ERR_NO_FILE:
                throw new ValidationException('No PDF file was uploaded');
            case UPLOAD_ERR_NO_TMP_DIR:
            case UPLOAD_ERR_CANT_WRITE:
                throw new Exception('Server configuration error during file upload');
            default:
                throw new ValidationException('PDF file upload failed');
        }
    }
    
    /**
     * Validate file size against configuration limits
     */
    private function validateFileSize(): void 
    {
        $fileSize = $_FILES['pdf']['size'];
        
        if ($fileSize > Config::UPLOAD_MAX_SIZE) {
            $maxSizeMB = round(Config::UPLOAD_MAX_SIZE / 1048576, 1);
            throw new ValidationException("PDF file too large. Maximum size: {$maxSizeMB}MB");
        }
        
        if ($fileSize < 1024) { // Minimum 1KB for valid PDF
            throw new ValidationException('PDF file appears to be corrupted or empty');
        }
    }
    
    /**
     * Validate file type using multiple detection methods
     * Critical security measure to prevent malicious file uploads
     */
    private function validateFileType(): void 
    {
        $uploadedFile = $_FILES['pdf'];
        
        // Check reported MIME type
        if (!in_array($uploadedFile['type'], Config::ALLOWED_MIME_TYPES)) {
            throw new ValidationException('Only PDF files are allowed');
        }
        
        // Verify file extension
        $filename = $uploadedFile['name'];
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if ($extension !== 'pdf') {
            throw new ValidationException('File must have .pdf extension');
        }
        
        // Perform content-based validation
        $this->validatePdfContent($uploadedFile['tmp_name']);
    }
    
    /**
     * Validate actual PDF content using file signature analysis
     * Prevents disguised malicious files from bypassing MIME type checks
     */
    private function validatePdfContent(string $filePath): void 
    {
        // Check PDF magic bytes (file signature)
        $fileHandle = fopen($filePath, 'rb');
        if (!$fileHandle) {
            throw new Exception('Unable to read uploaded file for validation');
        }
        
        $header = fread($fileHandle, 8);
        fclose($fileHandle);
        
        // PDF files must start with "%PDF-" signature
        if (substr($header, 0, 5) !== '%PDF-') {
            throw new SecurityException('File content does not match PDF format');
        }
        
        // Additional MIME type validation using finfo if available
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $detectedType = finfo_file($finfo, $filePath);
            finfo_close($finfo);
            
            if ($detectedType !== 'application/pdf') {
                throw new SecurityException('File content validation failed - not a valid PDF');
            }
        }
    }
    
    /**
     * Perform additional security scanning on uploaded PDF
     * Implements defense-in-depth for legal document processing
     */
    private function performSecurityScan(): void 
    {
        $filePath = $_FILES['pdf']['tmp_name'];
        $fileSize = filesize($filePath);
        
        // Check for suspiciously large files that might contain embedded content
        if ($fileSize > (5 * 1048576)) { // 5MB threshold for simple legal forms
            error_log("Large PDF uploaded: {$fileSize} bytes from IP: " . $this->getClientIpAddress());
        }
        
        // Basic content scanning - look for suspicious patterns
        $content = file_get_contents($filePath, false, null, 0, 8192); // Read first 8KB
        
        // Check for embedded JavaScript (security risk in PDFs)
        if (stripos($content, '/JavaScript') !== false || stripos($content, '/JS') !== false) {
            throw new SecurityException('PDF contains embedded JavaScript - not allowed for security');
        }
        
        // Check for embedded files
        if (stripos($content, '/EmbeddedFile') !== false) {
            throw new SecurityException('PDF contains embedded files - not allowed');
        }
    }
    
    // =================================================================
    // EMAIL NOTIFICATION SYSTEM
    // =================================================================
    
    /**
     * Send legal document notification email with secure PDF attachment
     * Handles multi-part MIME email construction for reliable delivery
     */
    private function sendLegalDocumentNotification(): void 
    {
        $emailConfig = Config::getEmailConfig();
        $pdfContent = $this->getSecurePdfContent();
        
        $emailPackage = $this->buildCompleteEmailPackage($emailConfig, $pdfContent);
        
        $deliverySuccess = mail(
            $emailPackage['recipients'],
            $emailPackage['subject'],
            $emailPackage['body'],
            $emailPackage['headers']
        );
        
        if (!$deliverySuccess) {
            // Log the failure but don't expose internal details to user
            error_log("Email delivery failed for submission: " . $this->formData['participantName']);
            throw new Exception('Email notification could not be sent. Please contact support.');
        }
        
        // Log successful email delivery for audit trail
        error_log("Legal agreement email sent successfully for: " . $this->formData['participantName']);
    }
    
    /**
     * Securely read PDF content for email attachment
     */
    private function getSecurePdfContent(): string 
    {
        $content = file_get_contents($_FILES['pdf']['tmp_name']);
        if ($content === false) {
            throw new Exception('Failed to read PDF file for email attachment');
        }
        return $content;
    }
    
    /**
     * Build complete email package with all components
     * Centralizes email construction for consistency and maintainability
     */
    private function buildCompleteEmailPackage(array $emailConfig, string $pdfContent): array 
    {
        return [
            'recipients' => $this->determineEmailRecipients($emailConfig),
            'subject' => $this->buildProfessionalSubject(),
            'headers' => $this->buildSecureEmailHeaders($emailConfig),
            'body' => $this->buildMultipartEmailBody($pdfContent)
        ];
    }
    
    /**
     * Determine final recipient list based on configuration
     */
    private function determineEmailRecipients(array $emailConfig): string 
    {
        // Use multiple TO addresses if configured, otherwise single recipient
        if (!empty($emailConfig['additional_to']) && count($emailConfig['additional_to']) > 1) {
            return implode(', ', array_filter($emailConfig['additional_to']));
        }
        
        return $emailConfig['to'];
    }
    
    /**
     * Build professional subject line with essential identifying information
     */
    private function buildProfessionalSubject(): string 
    {
        $timestamp = date(Config::DATE_FORMAT);
        $participantName = $this->formData['participantName'];
        
        return Config::FORM_TITLE . " - {$participantName} - {$timestamp}";
    }
    
    /**
     * Build secure email headers with proper MIME configuration
     * Ensures reliable delivery and proper handling of attachments
     */
    private function buildSecureEmailHeaders(array $emailConfig): string 
    {
        $headers = [
            "From: {$emailConfig['from']}",
            "Reply-To: {$this->formData['email']}",
            "Return-Path: {$emailConfig['return_path']}",
            "X-Mailer: Legal Agreement System v1.0",
            "X-Priority: 2", // High priority for legal documents
            "MIME-Version: 1.0",
            "Content-Type: multipart/mixed; boundary=\"{$this->emailBoundary}\""
        ];
        
        // Add CC recipients if configured
        $this->addOptionalRecipients($headers, $emailConfig, 'cc', 'Cc');
        $this->addOptionalRecipients($headers, $emailConfig, 'bcc', 'Bcc');
        
        return implode("\r\n", $headers);
    }
    
    /**
     * Add optional recipients (CC/BCC) to headers if configured
     */
    private function addOptionalRecipients(array &$headers, array $emailConfig, string $type, string $headerName): void 
    {
        if (!empty($emailConfig[$type])) {
            $recipientList = implode(', ', array_filter($emailConfig[$type]));
            if ($recipientList) {
                $headers[] = "{$headerName}: {$recipientList}";
            }
        }
    }
    
    /**
     * Build complete multipart email body with text and PDF attachment
     */
    private function buildMultipartEmailBody(string $pdfContent): string 
    {
        $textContent = $this->buildEmailTextContent();
        $attachmentFilename = $this->generateSecureFilename();
        $encodedPdf = chunk_split(base64_encode($pdfContent));
        
        $body = $this->buildTextPart($textContent);
        $body .= $this->buildAttachmentPart($encodedPdf, $attachmentFilename);
        $body .= "--{$this->emailBoundary}--\r\n";
        
        return $body;
    }
    
    /**
     * Build professional email text content with complete submission details
     */
    private function buildEmailTextContent(): string 
    {
        $timestamp = date(Config::DATE_FORMAT);
        
        return "New " . Config::FORM_TITLE . " Submission\n\n" .
               "Event: " . Config::ORGANIZATION . "\n" .
               "Submission Date: {$timestamp}\n\n" .
               "PARTICIPANT INFORMATION:\n" .
               "Name: {$this->formData['participantName']}\n" .
               "Date of Birth: {$this->formData['participantDOB']}\n\n" .
               "GUARDIAN INFORMATION:\n" .
               "Name: {$this->formData['guardianName']}\n" .
               "Email: {$this->formData['email']}\n" .
               "Phone: {$this->formData['phone']}\n" .
               "Address: {$this->formData['address']}\n\n" .
               "DOCUMENT DETAILS:\n" .
               "PDF Size: " . number_format($_FILES['pdf']['size']) . " bytes\n" .
               "Submission IP: " . $this->getClientIpAddress() . "\n\n" .
               "Please find the completed, signed agreement attached.\n\n" .
               "This is an automated message from the " . Config::ORGANIZATION . " registration system.\n" .
               "For questions, please contact the event coordinators.";
    }
    
    /**
     * Build text part of multipart email
     */
    private function buildTextPart(string $textContent): string 
    {
        return "--{$this->emailBoundary}\r\n" .
               "Content-Type: text/plain; charset=UTF-8\r\n" .
               "Content-Transfer-Encoding: 7bit\r\n\r\n" .
               $textContent . "\r\n\r\n";
    }
    
    /**
     * Build PDF attachment part of multipart email
     */
    private function buildAttachmentPart(string $encodedPdf, string $filename): string 
    {
        return "--{$this->emailBoundary}\r\n" .
               "Content-Type: application/pdf; name=\"{$filename}\"\r\n" .
               "Content-Transfer-Encoding: base64\r\n" .
               "Content-Disposition: attachment; filename=\"{$filename}\"\r\n\r\n" .
               $encodedPdf . "\r\n";
    }
    
    /**
     * Generate unique email boundary identifier
     */
    private function generateEmailBoundary(): string 
    {
        return md5(time() . uniqid() . 'legal_agreement');
    }
    
    /**
     * Generate secure, descriptive filename for PDF attachment
     * Includes participant name and timestamp for easy identification
     */
    private function generateSecureFilename(): string 
    {
        $safeName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $this->formData['participantName']);
        $timestamp = date('Y-m-d_H-i-s');
        return "Hold_Harmless_Agreement_{$safeName}_{$timestamp}.pdf";
    }
    
    // =================================================================
    // AUDIT LOGGING AND COMPLIANCE
    // =================================================================
    
    /**
     * Create comprehensive audit log entry for compliance tracking
     * Legal agreements require detailed audit trails for regulatory compliance
     */
    private function createAuditLogEntry(): void 
    {
        if (!Config::LOGGING_ENABLED) {
            return;
        }
        
        $auditEntry = $this->buildAuditRecord();
        $this->writeSecureLogEntry($auditEntry);
    }
    
    /**
     * Build complete audit record with all relevant submission data
     */
    private function buildAuditRecord(): array 
    {
        return [
            'timestamp' => date('Y-m-d H:i:s'),
            'event_type' => 'legal_agreement_submission',
            'participant_name' => $this->formData['participantName'],
            'guardian_name' => $this->formData['guardianName'],
            'guardian_email' => $this->formData['email'],
            'guardian_phone' => $this->formData['phone'],
            'participant_dob' => $this->formData['participantDOB'],
            'signature_date' => $this->formData['signatureDate'],
            'pdf_size' => $_FILES['pdf']['size'],
            'pdf_original_name' => $_FILES['pdf']['name'],
            'client_ip' => $this->getClientIpAddress(),
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown',
            'server_time' => time(),
            'session_id' => session_id() ?: 'none'
        ];
    }
    
    /**
     * Write audit entry to secure log file with proper locking
     */
    private function writeSecureLogEntry(array $auditEntry): void 
    {
        $logLine = json_encode($auditEntry) . "\n";
        
        $bytesWritten = file_put_contents(
            Config::LOG_FILE, 
            $logLine, 
            FILE_APPEND | LOCK_EX
        );
        
        if ($bytesWritten === false) {
            error_log("Failed to write audit log entry for: " . $auditEntry['participant_name']);
        }
    }
    
    /**
     * Determine client IP address with proxy-aware detection
     * Important for audit trails and security monitoring
     */
    private function getClientIpAddress(): string 
    {
        // Check multiple headers in order of reliability
        $ipHeaders = [
            'HTTP_CF_CONNECTING_IP',    // Cloudflare
            'HTTP_X_REAL_IP',           // Nginx proxy
            'HTTP_CLIENT_IP',           // Proxy servers
            'HTTP_X_FORWARDED_FOR',     // Load balancers
            'REMOTE_ADDR'               // Direct connection
        ];
        
        foreach ($ipHeaders as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = $this->extractFirstIpAddress($_SERVER[$header]);
                if ($this->isValidPublicIpAddress($ip)) {
                    return $ip;
                }
            }
        }
        
        return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }
    
    /**
     * Extract first IP address from comma-separated list
     */
    private function extractFirstIpAddress(string $ipList): string 
    {
        $ip = explode(',', $ipList)[0];
        return trim($ip);
    }
    
    /**
     * Validate that IP address is a valid public address
     */
    private function isValidPublicIpAddress(string $ip): bool 
    {
        return filter_var(
            $ip, 
            FILTER_VALIDATE_IP, 
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) !== false;
    }
    
    // =================================================================
    // ERROR HANDLING AND RESPONSE MANAGEMENT
    // =================================================================
    
    /**
     * Handle validation errors with appropriate user feedback
     */
    private function handleValidationError(ValidationException $e): void 
    {
        $this->logSecurityEvent('validation_error', $e->getMessage());
        $this->sendErrorResponse($e->getMessage(), 400);
    }
    
    /**
     * Handle security-related errors with enhanced logging
     */
    private function handleSecurityError(SecurityException $e): void 
    {
        $this->logSecurityEvent('security_violation', $e->getMessage());
        $this->sendErrorResponse('File validation failed. Please ensure you are uploading a valid PDF.', 400);
    }
    
    /**
     * Handle system errors with proper logging and user feedback
     */
    private function handleSystemError(Exception $e): void 
    {
        $this->logSystemError($e);
        $this->sendErrorResponse('Submission processing failed. Please try again.', 500);
    }
    
    /**
     * Log security events for monitoring and investigation
     */
    private function logSecurityEvent(string $eventType, string $message): void 
    {
        $securityLog = [
            'timestamp' => date('Y-m-d H:i:s'),
            'event_type' => $eventType,
            'message' => $message,
            'ip_address' => $this->getClientIpAddress(),
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown',
            'post_data_size' => strlen(serialize($_POST)),
            'files_count' => count($_FILES)
        ];
        
        error_log("SECURITY_EVENT: " . json_encode($securityLog));
    }
    
    /**
     * Log system errors with full context for debugging
     */
    private function logSystemError(Exception $e): void 
    {
        $errorContext = sprintf(
            "[%s] SYSTEM_ERROR: %s in %s:%d\nStack trace:\n%s\nRequest data: %s",
            date('Y-m-d H:i:s'),
            $e->getMessage(),
            $e->getFile(),
            $e->getLine(),
            $e->getTraceAsString(),
            json_encode(['POST' => $_POST, 'FILES' => array_keys($_FILES)])
        );
        
        error_log($errorContext);
    }
    
    /**
     * Send successful response with confirmation details
     */
    private function respondWithSuccess(): void 
    {
        $response = [
            'success' => true,
            'message' => 'Legal agreement submitted successfully. Confirmation email sent.',
            'timestamp' => date('Y-m-d H:i:s'),
            'participant' => $this->formData['participantName'],
            'confirmation_id' => $this->generateConfirmationId()
        ];
        
        echo json_encode($response);
    }
    
    /**
     * Generate unique confirmation ID for tracking
     */
    private function generateConfirmationId(): string 
    {
        return 'HHA-' . date('Ymd') . '-' . substr(md5($this->formData['participantName'] . time()), 0, 8);
    }
    
    /**
     * Send error response with appropriate HTTP status code
     */
    private function sendErrorResponse(string $message, int $httpCode = 400): void 
    {
        http_response_code($httpCode);
        
        $response = [
            'success' => false,
            'message' => $message,
            'timestamp' => date('Y-m-d H:i:s'),
            'error_code' => $httpCode
        ];
        
        echo json_encode($response);
    }
}

/**
 * Custom exception for validation errors
 * Allows specific handling of user input validation failures
 */
class ValidationException extends Exception {}

/**
 * Custom exception for security-related errors
 * Handles file upload security violations and suspicious activity
 */
class SecurityException extends Exception {}

// =================================================================
// APPLICATION ENTRY POINT
// =================================================================

/**
 * Main application entry point with comprehensive error handling
 * Ensures all errors are properly caught and logged for legal compliance
 */
try {
    $submissionHandler = new SubmissionHandler();
    $submissionHandler->processRequest();
    
} catch (Throwable $e) {
    // Final safety net for any uncaught errors
    error_log("FATAL_ERROR in legal agreement submission: " . $e->getMessage());
    error_log("Stack trace: " . $e->getTraceAsString());
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'A critical system error occurred. Please contact technical support.',
        'timestamp' => date('Y-m-d H:i:s'),
        'error_reference' => 'ERR_' . time()
    ]);
}