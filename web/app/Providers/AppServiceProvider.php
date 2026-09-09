<?php

namespace App\Providers;

use App\Http\Middleware\ShelfSession;
use App\Services\ShelfApi;
use Illuminate\Auth\GenericUser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;
use Livewire\Livewire;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->scoped(ShelfApi::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Auth::viaRequest('knowledgeshelf', function (Request $request): ?GenericUser {
            $user = $request->hasSession() ? $request->session()->get('shelf.user') : null;

            return $user ? new GenericUser($user) : null;
        });
        Livewire::addPersistentMiddleware([ShelfSession::class]);
    }
}
