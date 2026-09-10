<?php

namespace Tests\Unit\Services;

use App\Services\MediaTime;
use Tests\TestCase;

class MediaTimeTest extends TestCase
{
    public function test_audiobook_duration_and_chapters_do_not_wrap_after_twenty_four_hours(): void
    {
        $this->assertSame('25:01:01', MediaTime::clock(90061.5));
        $this->assertSame('25h 1m', MediaTime::duration(90061.5));
        $this->assertSame('1:15', MediaTime::clock(75));
        $this->assertSame('0:00', MediaTime::clock(-1));
    }
}
