package com.acme.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;

class CalcTest {
    @Test
    void addsTwoNumbers() {
        assertEquals(3, new Calc(mock(Clock.class)).add(1, 2));
    }
}
