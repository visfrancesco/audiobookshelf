<?php

namespace App\Services;

class MediaSize
{
    public static function format(float|int $bytes): string
    {
        $bytes = max(0, $bytes);
        $unit = 0;
        $units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
        while ($bytes >= 1024 && $unit < count($units) - 1) {
            $bytes /= 1024;
            $unit++;
        }

        return number_format($bytes, $unit === 0 ? 0 : 2).' '.$units[$unit];
    }
}
