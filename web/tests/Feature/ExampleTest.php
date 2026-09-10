<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * A basic test example.
     */
    public function test_anonymous_visitors_are_redirected_to_sign_in(): void
    {
        $response = $this->get('/');

        $response->assertRedirectToRoute('login');
    }
}
