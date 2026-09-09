<?php

namespace App\Services;

class MediaTime
{
    public static function clock(float|int $seconds): string
    {
        $seconds = max(0, (int) $seconds);
        $hours = intdiv($seconds, 3600);

        return $hours > 0 ? sprintf('%d:%02d:%02d', $hours, intdiv($seconds % 3600, 60), $seconds % 60) : sprintf('%d:%02d', intdiv($seconds, 60), $seconds % 60);
    }

    public static function duration(float|int $seconds): string
    {
        $seconds = max(0, (int) $seconds);

        return sprintf('%dh %dm', intdiv($seconds, 3600), intdiv($seconds % 3600, 60));
    }
}
