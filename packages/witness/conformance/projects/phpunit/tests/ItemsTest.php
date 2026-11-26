<?php

declare(strict_types=1);

namespace Kit;

use PHPUnit\Framework\TestCase;

final class ItemsTest extends TestCase
{
    /** Witness evidence: append what this test saw to its timeline (a no-op outside witness). */
    private function record(string $kind, array $data): void
    {
        $root = getenv('WITNESS_ARTIFACTS');
        if (!$root) {
            return;
        }
        $dir = $root . '/' . preg_replace('/[^\w.@-]+/', '_', static::class . '#' . $this->name());
        @mkdir($dir, 0777, true);
        file_put_contents($dir . '/evidence.jsonl', json_encode(['v' => 1, 'kind' => $kind, 'data' => $data]) . "\n", FILE_APPEND);
    }

    private function get(string $path): array
    {
        $app = getenv('WITNESS_APP_URL') ?: 'http://127.0.0.1:8080';
        $body = file_get_contents($app . $path);
        $status = (int) explode(' ', $http_response_header[0])[1];
        $this->record('http', ['method' => 'GET', 'url' => $app . $path, 'status' => $status, 'response' => ['body' => $body]]);
        return [$status, json_decode($body, true)];
    }

    public function testListsItems(): void
    {
        [$status, $items] = $this->get('/api/items');
        $this->assertSame(200, $status);
        $this->assertSame(['apple', 'pear'], array_column($items, 'name'));
    }

    public function testItemName(): void
    {
        [, $item] = $this->get('/api/items/1');
        $this->assertSame('banana', $item['name']);
    }

    public function testSkipped(): void
    {
        $this->markTestSkipped('kit: always skipped');
    }

    public function testHangs(): void
    {
        if (getenv('WITNESS_KIT_HANG') !== '1') {
            $this->markTestSkipped('kit: hangs only when WITNESS_KIT_HANG=1');
        }
        $this->get('/api/hang');
    }
}
