<?php

namespace Tests\Feature;

use Tests\TestCase;

class OrdersTest extends TestCase
{
    public function test_lists_orders(): void
    {
        $this->getJson('/api/orders')->assertOk()->assertExactJson([]);
    }
}
