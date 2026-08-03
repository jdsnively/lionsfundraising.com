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
    'fundraising@lionsfootballclub.com'
];

$FROM_EMAIL = 'noreply@lionsfundraising.com'; // Already verified in your Brevo account
$FROM_NAME = 'Lions Sports Club';

function sendResponse($success, $message) {
    echo json_encode(['success' => $success, 'message' => $message]);
    exit;
}

function validateInput($data) {
    $required = ['name', 'email', 'message'];
    
    foreach ($required as $field) {
        if (empty($data[$field])) {
            return false;
        }
    }
    
    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        return false;
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
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
    $result = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        error_log("Brevo API CURL Error: " . $error);
        return false;
    }
    
    if ($httpCode >= 200 && $httpCode < 300) {
        return true;
    } else {
        error_log("Brevo API Error: HTTP " . $httpCode . " - " . $result);
        return false;
    }
}

// Main processing
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendResponse(false, "Only POST requests are allowed.");
    }
    
    // Get form data
    $formData = [
        'name' => sanitizeInput($_POST['name'] ?? ''),
        'email' => sanitizeInput($_POST['email'] ?? ''),
        'phone' => sanitizeInput($_POST['phone'] ?? 'Not provided'),
        'message' => sanitizeInput($_POST['message'] ?? ''),
        'form_type' => sanitizeInput($_POST['form_type'] ?? 'contact'),
        'source' => sanitizeInput($_POST['source'] ?? 'Website')
    ];
    
    // Validate required fields
    if (!validateInput($formData)) {
        sendResponse(false, "Please fill in all required fields with valid information.");
    }
    
    // Determine email subject based on form type
    $subject = "Lions Sports Club - ";
    switch ($formData['form_type']) {
        case 'contact':
            $subject .= "Contact Form Submission";
            break;
        case 'senior':
            $subject .= "Senior Form Submission";
            break;
        default:
            $subject .= "Website Form Submission";
    }
    
    // Create professional email content
    $emailBody = "
    <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;'>
        <div style='background: #1e40af; color: white; padding: 20px; text-align: center;'>
            <h1 style='margin: 0; font-size: 24px;'>Lions Sports Club</h1>
            <p style='margin: 5px 0 0 0; opacity: 0.9;'>New Contact Form Submission</p>
        </div>
        
        <div style='padding: 30px; background: #f8fafc;'>
            <h2 style='color: #1e40af; margin-top: 0;'>Contact Details</h2>
            
            <div style='background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;'>
                <p style='margin: 0 0 10px 0;'><strong>Name:</strong> " . htmlspecialchars($formData['name']) . "</p>
                <p style='margin: 0 0 10px 0;'><strong>Email:</strong> " . htmlspecialchars($formData['email']) . "</p>
                <p style='margin: 0 0 10px 0;'><strong>Phone:</strong> " . htmlspecialchars($formData['phone']) . "</p>
                <p style='margin: 0;'><strong>Source:</strong> " . htmlspecialchars($formData['source']) . "</p>
            </div>
            
            <h3 style='color: #1e40af; margin-bottom: 10px;'>Message</h3>
            <div style='background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;'>
                <p style='margin: 0; line-height: 1.6; white-space: pre-line;'>" . htmlspecialchars($formData['message']) . "</p>
            </div>
        </div>
        
        <div style='background: #e3f2fd; padding: 20px; text-align: center; border-top: 3px solid #1e40af;'>
            <p style='margin: 0; color: #666; font-size: 14px;'>
                Submitted on " . date('F j, Y g:i A') . " via Lions Sports Club Website
            </p>
            <p style='margin: 10px 0 0 0; font-style: italic; color: #1e40af;'>Giving God The Glory Through Sports</p>
        </div>
    </div>";
    
    // Send email via Brevo
    $emailSent = sendBrevoEmail(
        $BREVO_API_KEY,
        $EMAIL_RECIPIENTS,
        $subject,
        $emailBody,
        null, // No attachment for contact forms
        $FROM_EMAIL,
        $FROM_NAME
    );
    
    if ($emailSent) {
        sendResponse(true, "Thank you for your message! We will get back to you soon.");
    } else {
        sendResponse(false, "Sorry, there was an error sending your message. Please try again or email us directly at fundraising@lionsfootballclub.com");
    }

} catch (Exception $e) {
    error_log("Lions Contact Form Error: " . $e->getMessage());
    sendResponse(false, "An unexpected error occurred. Please try again or contact us directly.");
}
?>

<?php
/*
Endpoint notes.

POST here with name, email, phone, message, form_type and source. The reply is
JSON: {"success": true|false, "message": "..."}.

The Brevo key is NOT in this file. It is a constant defined in
lions-secrets.php at the hosting account root, one level above public_html, and
required in at the top. A previous version of this comment block restated the
key in full, which meant redacting the assignment alone would not have removed
it from the repository.

Sending account: noreply@lionsfundraising.com, verified in Brevo against the
lionsfundraising.com domain. The free tier allows 300 a day and 9,000 a month,
which is well clear of the roster size.
*/
