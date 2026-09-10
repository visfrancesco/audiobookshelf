@props(['text' => '', 'collapsible' => false])
@php
    $plain = preg_replace('/<(script|style)\b[^>]*>.*?<\/\1>/is', '', $text);
    $plain = preg_replace('/<\/?(?:p|div|li|h[1-6]|ul|ol|blockquote)\b[^>]*>|<br\s*\/?>/i', "\n", $plain);
    $plain = trim(html_entity_decode(strip_tags($plain), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $plain = preg_replace('/\n[\t ]*\n(?:[\t ]*\n)+/', "\n\n", $plain);
@endphp
@if($plain !== '')
@if($collapsible && mb_strlen($plain) > 600)
<details class="synopsis"><summary>About this {{ $attributes->get('kind', 'item') }}</summary><div class="description">{{ $plain }}</div></details>
@else
<div class="description">{{ $plain }}</div>
@endif
@endif
