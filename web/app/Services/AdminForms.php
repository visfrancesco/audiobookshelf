<?php

namespace App\Services;

use Illuminate\Http\Request;

class AdminForms
{
    public static function fields(string $section): array
    {
        return match ($section) {
            'settings' => [
                'scannerParseSubtitle' => ['Parse subtitles from filenames', 'checkbox'],
                'scannerFindCovers' => ['Find missing covers automatically', 'checkbox'],
                'scannerPreferMatchedMetadata' => ['Prefer matched metadata', 'checkbox'],
                'scannerDisableWatcher' => ['Disable automatic file watching', 'checkbox'],
                'storeCoverWithItem' => ['Store covers beside media files', 'checkbox'],
                'storeMetadataWithItem' => ['Store metadata beside media files', 'checkbox'],
                'metadataFileFormat' => ['Metadata format', 'select', ['json' => 'JSON', 'abs' => 'ABS']],
                'scannerCoverProvider' => ['Cover provider', 'text'],
                'podcastEpisodeSchedule' => ['Default podcast check schedule', 'text'],
                'backupSchedule' => ['Backup schedule (blank disables)', 'text'],
                'backupsToKeep' => ['Backups to keep', 'number', 'required|integer|min:1|max:1000'],
                'maxBackupSize' => ['Maximum backup size in GB (0 is unlimited)', 'number', 'required|numeric|min:0|max:1000'],
                'loggerDailyLogsToKeep' => ['Days of logs to keep', 'number', 'required|integer|min:1|max:3650'],
                'loggerScannerLogsToKeep' => ['Scanner logs to keep', 'number', 'required|integer|min:1|max:1000'],
                'logLevel' => ['Log level', 'select', ['1' => 'Debug', '2' => 'Info', '3' => 'Warning', '4' => 'Error']],
                'sortingIgnorePrefix' => ['Ignore title prefixes when sorting', 'checkbox'],
                'allowedOrigins' => ['Additional allowed origins (one per line)', 'lines'],
                'allowIframe' => ['Allow embedding the shelf in an iframe', 'checkbox'],
                'rateLimitLoginRequests' => ['Login attempts per window', 'number', 'required|integer|min:1|max:1000'],
                'rateLimitLoginWindow' => ['Login rate limit window (milliseconds)', 'number', 'required|integer|min:1000|max:86400000'],
            ],
            'authentication' => [
                'authLoginCustomMessage' => ['Sign-in message', 'textarea'],
                'authOpenIDIssuerURL' => ['OpenID issuer URL', 'url'],
                'authOpenIDAuthorizationURL' => ['Authorization URL', 'url'],
                'authOpenIDTokenURL' => ['Token URL', 'url'],
                'authOpenIDUserInfoURL' => ['User information URL', 'url'],
                'authOpenIDJwksURL' => ['Signing keys URL', 'url'],
                'authOpenIDLogoutURL' => ['Logout URL', 'url'],
                'authOpenIDClientID' => ['Client ID', 'text'],
                'authOpenIDClientSecret' => ['Client secret (leave blank to keep)', 'password'],
                'authOpenIDTokenSigningAlgorithm' => ['Token signing algorithm', 'text'],
                'authOpenIDButtonText' => ['Sign-in button text', 'text'],
                'authOpenIDAutoLaunch' => ['Open the identity provider automatically', 'checkbox'],
                'authOpenIDAutoRegister' => ['Create accounts on first OpenID sign-in', 'checkbox'],
                'authOpenIDMatchExistingBy' => ['Match existing users by', 'select', ['' => 'Do not match', 'email' => 'Email', 'username' => 'Username']],
                'authOpenIDGroupClaim' => ['Group claim', 'text'],
                'authOpenIDAdvancedPermsClaim' => ['Advanced permissions claim', 'text'],
                'authOpenIDMobileRedirectURIs' => ['Mobile redirect URIs (one per line)', 'lines'],
                'authOpenIDSubfolderForRedirectURLs' => ['Subfolder for redirect URLs', 'text'],
            ],
            'email' => [
                'host' => ['SMTP host', 'text'], 'port' => ['SMTP port', 'number', 'required|integer|min:1|max:65535'],
                'secure' => ['Use TLS', 'checkbox'], 'rejectUnauthorized' => ['Verify server certificate', 'checkbox'],
                'user' => ['SMTP username', 'text'], 'pass' => ['SMTP password (leave blank to keep)', 'password'],
                'fromAddress' => ['Sender address', 'email'], 'testAddress' => ['Test recipient', 'email'],
            ],
            'notifications' => [
                'appriseApiUrl' => ['Apprise API URL', 'url'],
                'maxFailedAttempts' => ['Maximum failed attempts', 'number', 'required|integer|min:1|max:100'],
                'maxNotificationQueue' => ['Maximum queued notifications', 'number', 'required|integer|min:1|max:1000'],
            ],
            default => [],
        };
    }

    public static function values(Request $request, string $section): array
    {
        $rules = [];
        foreach (self::fields($section) as $key => $field) {
            $rules[$key] = match ($field[1]) {
                'checkbox' => 'sometimes|boolean',
                'select' => 'nullable|in:'.implode(',', array_keys($field[2])),
                'number' => $field[2], 'url' => 'nullable|url|max:4000', 'email' => 'nullable|email|max:300',
                default => 'nullable|string|max:10000',
            };
        }
        $data = $request->validate($rules);
        foreach (self::fields($section) as $key => $field) {
            if ($field[1] === 'checkbox') {
                $data[$key] = $request->boolean($key);
            } elseif ($field[1] === 'password' && ! $request->filled($key)) {
                unset($data[$key]);
            } elseif ($field[1] === 'number') {
                $data[$key] = $data[$key] + 0;
            } elseif ($field[1] === 'lines') {
                $data[$key] = self::lines($data[$key] ?? '');
            }
        }
        if ($section === 'settings') {
            $data['backupSchedule'] = $data['backupSchedule'] ?: false;
            $data['logLevel'] = (int) $data['logLevel'];
        }
        if ($section === 'authentication') {
            $methods = $request->validate(['authActiveAuthMethods' => 'required|array|min:1', 'authActiveAuthMethods.*' => 'in:local,openid']);
            $data['authActiveAuthMethods'] = $methods['authActiveAuthMethods'];
        }

        return $data;
    }

    public static function permissions(): array
    {
        return ['download' => 'Download files', 'upload' => 'Upload and narrate documents', 'update' => 'Edit library metadata', 'delete' => 'Delete media', 'accessExplicitContent' => 'Access explicit content', 'accessAllLibraries' => 'Access every library', 'accessAllTags' => 'Access every tag', 'createEreader' => 'Create e-reader devices', 'selectedTagsNotAccessible' => 'Exclude selected tags instead of allowing them'];
    }

    public static function lines(string $value): array
    {
        return array_values(array_unique(array_filter(array_map('trim', preg_split('/\r?\n/', $value)))));
    }
}
