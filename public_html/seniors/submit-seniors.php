<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Credentials live above the docroot. A key inside public_html is one
// misconfigured handler away from being served as plain text, and it cannot be
// kept out of version control without also excluding the file that needs it.
//
// The lookup walks up from this file rather than deriving the path from
// DOCUMENT_ROOT. PHP sets DOCUMENT_ROOT to an empty string under the CLI, so
// dirname() on it returns '.' and the file is looked for in the working
// directory; that silently turned this whole block into a permanent failure
// when it was first written, and a vhost pointed somewhere unexpected would do
// the same in production. Walking up is also identical in both callers, which
// sit at different depths. Four levels is one more than the deepest caller
// needs and stops it wandering toward the filesystem root.
$secretsPath = '';
for ($dir = __DIR__, $up = 0; $up < 4; $up++, $dir = dirname($dir)) {
    if (is_readable($dir . '/lions-secrets.php')) {
        $secretsPath = $dir . '/lions-secrets.php';
        break;
    }
}

if ($secretsPath === '') {
    // Handled response rather than a fatal, so a missed upload shows the
    // visitor a sentence instead of a white screen. sendResponse is declared
    // later in this file; PHP hoists top level function declarations.
    error_log('Lions email: lions-secrets.php not found above ' . __DIR__);
    sendResponse(false, 'Email is temporarily unavailable. Please write to '
                      . 'fundraising@lionssports.club and we will pick it up.');
}

require_once $secretsPath;

$BREVO_API_KEY = LIONS_BREVO_API_KEY;

// A key that is present but malformed is the likely failure here. Brevo shows
// only the last six characters of a key in its list, those six look enough like
// a credential to be pasted by mistake, and the API answers a bare 401 that
// says nothing about why. Checking the shape names the cause instead.
$keyLooksReal = strpos($BREVO_API_KEY, 'xkeysib-') === 0
             && strlen($BREVO_API_KEY) >= 80
             // A real key's middle section is 64 hexadecimal characters and
             // uses most of the alphabet. Anything with almost no variety is a
             // worked example that has been pasted in by mistake, which is
             // exactly what happened on 2026-08-02: a correctly shaped run of
             // zeros passed the length and prefix tests and was only caught by
             // Brevo answering 401. Eight distinct characters is far below what
             // a real key shows and far above what a filler string does.
             && count(array_unique(str_split(substr($BREVO_API_KEY, 8, 64)))) >= 8;

if (!$keyLooksReal) {
    error_log('Lions email: LIONS_BREVO_API_KEY is not a whole Brevo key. It '
            . 'must be xkeysib- then 64 hex, a dash and 16 more, about 89 '
            . 'characters, and the middle section is a jumble rather than a run '
            . 'of one character. Brevo shows a key in full once, at creation.');
    sendResponse(false, 'Email is temporarily unavailable. Please write to '
                      . 'fundraising@lionssports.club and we will pick it up.');
}
$EMAIL_RECIPIENTS = [
    'fundraising@lionsfootballclub.com',
    'president@lionsfootballclub.com',
    'secretary@lionsfootballclub.com'
];

$FROM_EMAIL = 'noreply@lionsfundraising.com'; // Already verified in your Brevo account
$FROM_NAME = 'Lions Sports Club';

function sendResponse($success, $message) {
    echo json_encode(['success' => $success, 'message' => $message]);
    exit;
}

function validateInput($data) {
    $required = ['studentName', 'parentsNames'];
    
    foreach ($required as $field) {
        if (empty($data[$field])) {
            return false;
        }
    }
    
    return true;
}

function sanitizeInput($input) {
    return htmlspecialchars(trim($input), ENT_QUOTES, 'UTF-8');
}

function sendBrevoEmail($apiKey, $recipients, $subject, $htmlContent, $attachment = null, $fromEmail, $fromName) {
    $url = 'https://api.brevo.com/v3/smtp/email';
    
    // Prepare email data
    $emailData = [
        'sender' => [
            'name' => $fromName,
            'email' => $fromEmail
        ],
        'to' => array_map(function($email) {
            return ['email' => $email];
        }, $recipients),
        'subject' => $subject,
        'htmlContent' => $htmlContent
    ];
    
    // Add attachment if provided
    if ($attachment) {
        $emailData['attachment'] = [
            [
                'content' => base64_encode($attachment['content']),
                'name' => $attachment['name']
            ]
        ];
    }
    
    // Send via Brevo API
    $headers = [
        'Content-Type: application/json',
        'api-key: ' . $apiKey
    ];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($emailData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return $httpCode >= 200 && $httpCode < 300;
}

try {
    // Check if request method is POST
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendResponse(false, 'Invalid request method');
    }

    // Validate file upload
    if (!isset($_FILES['pdf']) || $_FILES['pdf']['error'] !== UPLOAD_ERR_OK) {
        sendResponse(false, 'PDF file upload failed');
    }

    // Validate and sanitize form data
    $formData = [
        'studentName' => isset($_POST['studentName']) ? sanitizeInput($_POST['studentName']) : '',
        'parentsNames' => isset($_POST['parentsNames']) ? sanitizeInput($_POST['parentsNames']) : '',
        'yearsWithLions' => isset($_POST['yearsWithLions']) ? sanitizeInput($_POST['yearsWithLions']) : ''
    ];

    if (!validateInput($formData)) {
        sendResponse(false, 'Required fields are missing');
    }

    // Get PDF file details
    $pdfFile = $_FILES['pdf'];
    $pdfContent = file_get_contents($pdfFile['tmp_name']);
    $fileName = $pdfFile['name'];

    // Email configuration
    $subject = "Lions 2025 Senior Form - " . $formData['studentName'];
    
    $emailBody = "
    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>
        <div style='background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #1e3c72; padding: 30px; text-align: center; border-radius: 8px; margin-bottom: 30px;'>
            <h1 style='margin: 0; font-size: 24px;'>Lions 2025 Senior Form</h1>
        </div>
        
        <div style='padding: 20px; background: #f8f9fa; border-radius: 8px; margin-bottom: 20px;'>
            <p style='margin-bottom: 20px;'>A new senior form has been submitted:</p>
            
            <div style='margin-bottom: 15px;'>
                <strong style='color: #1e3c72;'>Student Name:</strong> {$formData['studentName']}
            </div>
            
            <div style='margin-bottom: 15px;'>
                <strong style='color: #1e3c72;'>Parents' Names:</strong> {$formData['parentsNames']}
            </div>
            
            <div style='margin-bottom: 15px;'>
                <strong style='color: #1e3c72;'>Years with Lions:</strong> {$formData['yearsWithLions']}
            </div>
            
            <div style='margin-bottom: 15px;'>
                <strong style='color: #1e3c72;'>Submission Date:</strong> " . date('F j, Y g:i A') . "
            </div>
        </div>
        
        <div style='background: #e3f2fd; padding: 20px; border-radius: 8px; border-left: 4px solid #FFD700;'>
            <p style='margin: 0;'><strong>Attachment:</strong> The complete senior form is attached as a PDF.</p>
            <p style='margin: 10px 0 0 0; font-style: italic;'>Lions Pride</p>
        </div>
    </div>";

    // Prepare attachment
    $attachment = [
        'content' => $pdfContent,
        'name' => $fileName
    ];

    // Send email via Brevo
    $emailSent = sendBrevoEmail(
        $BREVO_API_KEY,
        $EMAIL_RECIPIENTS,
        $subject,
        $emailBody,
        $attachment,
        $FROM_EMAIL,
        $FROM_NAME
    );

    if ($emailSent) {
        sendResponse(true, "Senior form submitted successfully! All staff members have been notified via professional email delivery.");
    } else {
        sendResponse(false, "Form saved but email delivery failed. Please contact support.");
    }

} catch (Exception $e) {
    error_log("Lions Seniors Form Error: " . $e->getMessage());
    sendResponse(false, "An unexpected error occurred. Please try again.");
}
?>

<?php

?>