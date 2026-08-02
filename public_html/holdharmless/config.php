<?php
/**
 * Configuration for Hold Harmless Agreement Application
 * 
 * @package HoldHarmlessAgreement
 * @version 1.0
 * @author Lions Football Club
 */

defined('APPLICATION_ROOT') || define('APPLICATION_ROOT', dirname(__FILE__));

class Config 
{
    const EMAIL_RECIPIENT = 'fundraising@lionsfootballclub.com';
    const EMAIL_FROM = 'fundraising@lionsfootballclub.com';
    
    const EMAIL_CC = [
        // 'admin@lionsfootballclub.com',
        // 'coordinator@lionsfootballclub.com'
        'president@lionsfootballclub.com',
        'secretary@lionsfootballclub.com'
    ];
    
    const EMAIL_BCC = [
        // 'backup@lionsfootballclub.com',
        // 'records@lionsfootballclub.com'
    ];
    
    const EMAIL_RECIPIENTS = [
        'fundraising@lionsfootballclub.com'
        // 'admin@lionsfootballclub.com'
    ];
    
    const FORM_TITLE = 'Hold Harmless Agreement';
    const ORGANIZATION = 'Homeschool Football Classic';
    
    const LOGGING_ENABLED = true;
    const LOG_FILE = 'submissions.log';
    
    const UPLOAD_MAX_SIZE = 10485760; // 10MB
    const ALLOWED_MIME_TYPES = ['application/pdf'];
    
    const DATE_FORMAT = 'm-d-Y H:i';
    const DATE_FORMAT_SHORT = 'm-d-Y';
    
    public static function getEmailConfig(): array 
    {
        return [
            'to' => self::EMAIL_RECIPIENT,
            'additional_to' => self::EMAIL_RECIPIENTS,
            'cc' => self::EMAIL_CC,
            'bcc' => self::EMAIL_BCC,
            'from' => self::EMAIL_FROM,
            'reply_to' => self::EMAIL_FROM,
            'return_path' => self::EMAIL_FROM
        ];
    }
    
    public static function isProductionMode(): bool 
    {
        return !self::isDebugMode();
    }
    
    public static function isDebugMode(): bool 
    {
        return defined('DEBUG_MODE') && DEBUG_MODE === true;
    }
    
    public static function initializeEnvironment(): void 
    {
        if (self::isDebugMode()) {
            error_reporting(E_ALL);
            ini_set('display_errors', 1);
        } else {
            error_reporting(0);
            ini_set('display_errors', 0);
        }
        
        ini_set('log_errors', 1);
        
        self::setSecurityHeaders();
        self::createRequiredDirectories();
    }
    
    private static function setSecurityHeaders(): void 
    {
        if (headers_sent()) return;
        
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('X-XSS-Protection: 1; mode=block');
        header('Referrer-Policy: strict-origin-when-cross-origin');
    }
    
    private static function createRequiredDirectories(): void 
    {
        $directories = ['logs', 'uploads'];
        
        foreach ($directories as $dir) {
            if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
                error_log("Failed to create directory: {$dir}");
            }
        }
    }
}

// Legacy constant definitions for backward compatibility
define('RECIPIENT_EMAIL', Config::EMAIL_RECIPIENT);
define('FROM_EMAIL', Config::EMAIL_FROM);
define('FORM_NAME', Config::FORM_TITLE);
define('ENABLE_LOGGING', Config::LOGGING_ENABLED);
define('LOG_FILE', Config::LOG_FILE);

Config::initializeEnvironment();