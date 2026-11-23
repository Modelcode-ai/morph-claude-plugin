package com.acme.web;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrdersApiTest {
    @Autowired
    TestRestTemplate rest;

    @Test
    void listsOrders() {
        assertEquals(200, rest.getForEntity("/api/orders", String.class).getStatusCode().value());
    }
}
