<?php

namespace Tests\Unit;

use App\Calc;
use PHPUnit\Framework\TestCase;

class CalcTest extends TestCase
{
    public function testAdd(): void
    {
        $this->assertSame(3, (new Calc())->add(1, 2));
    }
}
