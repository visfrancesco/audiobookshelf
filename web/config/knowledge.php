<?php

return [
    'backend' => rtrim(env('KNOWLEDGESHELF_BACKEND_URL', 'http://127.0.0.1:3333'), '/'),
    'public_prefix' => rtrim(env('KNOWLEDGESHELF_PUBLIC_PREFIX', ''), '/'),
];
