Feature: Checkout
  Scenario: Pay for an order
    Given an order
    When I pay
    Then the order is paid
