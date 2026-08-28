<?php
/**
 * XIMG - Database Manager
 * PDO SQLite implementation with JSON file-based fallback
 */

require_once __DIR__ . '/../config.php';

class Database {
    private static $pdo = null;
    private static $useFallback = false;

    private static function getJsonFile() {
        return DATA_DIR . '/images.json';
    }

    public static function getConn() {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        if (self::$useFallback) {
            return null;
        }

        $dbFile = DATA_DIR . '/ximg.sqlite';

        try {
            if (extension_loaded('pdo_sqlite')) {
                self::$pdo = new PDO("sqlite:" . $dbFile);
                self::$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                self::$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                self::initSchema();
                return self::$pdo;
            } else {
                self::$useFallback = true;
                return null;
            }
        } catch (Throwable $e) {
            self::$useFallback = true;
            return null;
        }
    }

    private static function initSchema() {
        if (!self::$pdo) return;

        $sql = "CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            short_code TEXT UNIQUE NOT NULL,
            original_name TEXT NOT NULL,
            file_name TEXT NOT NULL,
            thumb_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            orig_size INTEGER NOT NULL,
            web_size INTEGER NOT NULL,
            width INTEGER DEFAULT 0,
            height INTEGER DEFAULT 0,
            user_key TEXT DEFAULT 'anonymous',
            delete_token TEXT NOT NULL,
            view_count INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_short_code ON images(short_code);
        CREATE INDEX IF NOT EXISTS idx_user_key ON images(user_key);";

        self::$pdo->exec($sql);
    }

    public static function saveImageRecord($data) {
        $pdo = self::getConn();

        $token = !empty($data['delete_token']) ? $data['delete_token'] : bin2hex(random_bytes(16));

        $record = [
            'short_code'     => $data['short_code'],
            'original_name'  => $data['original_name'],
            'file_name'      => $data['file_name'],
            'thumb_name'     => $data['thumb_name'],
            'mime_type'      => $data['mime_type'],
            'orig_size'      => (int)$data['orig_size'],
            'web_size'       => (int)$data['web_size'],
            'width'          => (int)($data['width'] ?? 0),
            'height'         => (int)($data['height'] ?? 0),
            'user_key'       => $data['user_key'] ?? 'anonymous',
            'delete_token'   => $token,
            'view_count'     => 0,
            'created_at'     => time()
        ];

        if ($pdo) {
            try {
                $stmt = $pdo->prepare("INSERT INTO images (short_code, original_name, file_name, thumb_name, mime_type, orig_size, web_size, width, height, user_key, delete_token, view_count, created_at)
                    VALUES (:short_code, :original_name, :file_name, :thumb_name, :mime_type, :orig_size, :web_size, :width, :height, :user_key, :delete_token, :view_count, :created_at)");
                $stmt->execute($record);
                return $record;
            } catch (Throwable $e) {
                // Fallback to JSON if SQLite write fails
                self::$useFallback = true;
            }
        }

        // JSON File Fallback
        $records = self::loadJsonRecords();
        $records[$record['short_code']] = $record;
        self::saveJsonRecords($records);
        return $record;
    }

    public static function getImageByCode($shortCode) {
        $pdo = self::getConn();
        if ($pdo) {
            try {
                $stmt = $pdo->prepare("SELECT * FROM images WHERE short_code = :code LIMIT 1");
                $stmt->execute(['code' => $shortCode]);
                return $stmt->fetch() ?: null;
            } catch (Throwable $e) {
                // fallback
            }
        }

        $records = self::loadJsonRecords();
        return $records[$shortCode] ?? null;
    }

    public static function incrementViewCount($shortCode) {
        $pdo = self::getConn();
        if ($pdo) {
            try {
                $stmt = $pdo->prepare("UPDATE images SET view_count = view_count + 1 WHERE short_code = :code");
                $stmt->execute(['code' => $shortCode]);
                return;
            } catch (Throwable $e) {
                // fallback
            }
        }

        $records = self::loadJsonRecords();
        if (isset($records[$shortCode])) {
            $records[$shortCode]['view_count'] = ($records[$shortCode]['view_count'] ?? 0) + 1;
            self::saveJsonRecords($records);
        }
    }

    public static function getUserImages($userKey, $limit = 50, $offset = 0) {
        $pdo = self::getConn();
        if ($pdo) {
            try {
                $stmt = $pdo->prepare("SELECT * FROM images WHERE user_key = :user_key ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
                $stmt->bindValue(':user_key', $userKey, PDO::PARAM_STR);
                $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
                $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
                $stmt->execute();
                return $stmt->fetchAll();
            } catch (Throwable $e) {
                // fallback
            }
        }

        $records = self::loadJsonRecords();
        $userRecords = array_filter($records, function($img) use ($userKey) {
            return ($img['user_key'] ?? 'anonymous') === $userKey;
        });
        usort($userRecords, function($a, $b) {
            return ($b['created_at'] ?? 0) <=> ($a['created_at'] ?? 0);
        });
        return array_slice(array_values($userRecords), $offset, $limit);
    }

    public static function deleteImage($shortCode, $deleteToken = null, $userKey = null) {
        $img = self::getImageByCode($shortCode);
        if (!$img) return false;

        // Verify authorization
        if ($deleteToken !== null && ($img['delete_token'] ?? '') !== $deleteToken) {
            if ($userKey === null || ($img['user_key'] ?? '') !== $userKey) {
                return false;
            }
        }

        // Remove files safely
        $mainFile = UPLOAD_DIR . '/' . ($img['file_name'] ?? '');
        $thumbFile = THUMB_DIR . '/' . ($img['thumb_name'] ?? '');
        $icoFile = UPLOAD_DIR . '/' . $shortCode . '.ico';
        if (file_exists($mainFile)) @unlink($mainFile);
        if (file_exists($thumbFile)) @unlink($thumbFile);
        if (file_exists($icoFile)) @unlink($icoFile);

        $pdo = self::getConn();
        if ($pdo) {
            try {
                $stmt = $pdo->prepare("DELETE FROM images WHERE short_code = :code");
                $stmt->execute(['code' => $shortCode]);
            } catch (Throwable $e) {
                // fallback
            }
        }

        $records = self::loadJsonRecords();
        unset($records[$shortCode]);
        self::saveJsonRecords($records);

        return true;
    }

    private static function loadJsonRecords() {
        $file = self::getJsonFile();
        if (!file_exists($file)) return [];
        $content = @file_get_contents($file);
        return $content ? (json_decode($content, true) ?: []) : [];
    }

    private static function saveJsonRecords($records) {
        $file = self::getJsonFile();
        @file_put_contents($file, json_encode($records, JSON_PRETTY_PRINT));
    }
}
