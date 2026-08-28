<?php
/**
 * XIMG - Authentication & User Identity Manager
 * Integrates with XSITE/EZsite key ecosystem
 */

require_once __DIR__ . '/../config.php';

class Auth {
    /**
     * Resolves active user key from request headers, params, or cookies
     */
    public static function getUserKey() {
        try {
            // 1. HTTP Headers
            $headers = function_exists('getallheaders') ? @getallheaders() : [];
            if (!is_array($headers)) $headers = [];

            $headerKey = $headers['X-API-Key'] ?? $headers['x-api-key'] ?? null;
            if (!$headerKey && isset($headers['Authorization'])) {
                if (preg_match('/Bearer\s+(.*)$/i', $headers['Authorization'], $matches)) {
                    $headerKey = trim($matches[1]);
                }
            }

            // Decode JWT payload if Bearer token or unified session token provided
            if ($headerKey && strpos($headerKey, '.') !== false) {
                $jwtUser = self::parseJwtPayload($headerKey);
                if ($jwtUser) return self::sanitizeKey($jwtUser);
            }

            // 2. Query / POST Parameters
            if (!empty($_REQUEST['api_key'])) return self::sanitizeKey($_REQUEST['api_key']);
            if (!empty($_REQUEST['licenseKey'])) return self::sanitizeKey($_REQUEST['licenseKey']);
            if (!empty($_REQUEST['key'])) return self::sanitizeKey($_REQUEST['key']);

            // 3. Cookies (Unified xstream_token cookie or legacy keys)
            if (!empty($_COOKIE['xstream_token'])) {
                $jwtUser = self::parseJwtPayload($_COOKIE['xstream_token']);
                if ($jwtUser) return self::sanitizeKey($jwtUser);
            }
            if (!empty($_COOKIE['xsites_key'])) return self::sanitizeKey($_COOKIE['xsites_key']);
            if (!empty($_COOKIE['ximg_key'])) return self::sanitizeKey($_COOKIE['ximg_key']);

            if ($headerKey) return self::sanitizeKey($headerKey);

            // 4. Session / Anonymous fallback
            if (session_status() === PHP_SESSION_NONE) {
                @session_start();
            }

            if (empty($_SESSION['anon_id'])) {
                $_SESSION['anon_id'] = 'anon_' . self::generateRandomHex(8);
            }

            return $_SESSION['anon_id'];
        } catch (Throwable $e) {
            return 'anonymous';
        }
    }

    /**
     * Parses JWT payload string securely
     */
    public static function parseJwtPayload($jwtToken) {
        $parts = explode('.', $jwtToken);
        if (count($parts) !== 3) return null;
        try {
            $payloadJson = base64_decode(str_replace(['-', '_'], ['+', '/'], $parts[1]));
            $payload = json_decode($payloadJson, true);
            if (!is_array($payload)) return null;
            if (isset($payload['exp']) && $payload['exp'] < time()) return null; // Expired
            return $payload['sub'] ?? $payload['email'] ?? null;
        } catch (Throwable $e) {
            return null;
        }
    }

    /**
     * Clean and format user key
     */
    public static function sanitizeKey($key) {
        $clean = preg_replace('/[^a-zA-Z0-9_\-\.]/', '', trim($key));
        return substr($clean, 0, 128) ?: 'anonymous';
    }

    /**
     * Validate key format and status
     */
    public static function validateKey($key) {
        $cleanKey = self::sanitizeKey($key);
        if (empty($cleanKey) || $cleanKey === 'anonymous' || strpos($cleanKey, 'anon_') === 0) {
            return [
                'valid' => true,
                'type'  => 'anonymous',
                'key'   => $cleanKey ?: 'anonymous'
            ];
        }

        // Check if key is XSITE / EZsite format
        $isXsite = (strpos($cleanKey, 'EZSITE') === 0 || strpos($cleanKey, 'XSITE') === 0 || strlen($cleanKey) >= 12);

        return [
            'valid' => true,
            'type'  => $isXsite ? 'xsite_pro' : 'standard',
            'key'   => $cleanKey
        ];
    }

    public static function generateRandomHex($bytes = 8) {
        try {
            return bin2hex(random_bytes($bytes));
        } catch (Throwable $e) {
            return substr(md5(uniqid((string)mt_rand(), true)), 0, $bytes * 2);
        }
    }
}
