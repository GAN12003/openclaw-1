"use strict";

const uart_watch = require("./uart_watch");
const gpio_watch = require("./gpio_watch");

/**
 * Aggregate UART + GPIO state for /status and /hw.
 */
function getHardwareState() {
  const uart = uart_watch.getUARTStatus();
  const gpio = gpio_watch.getGPIOStatus();
  const uartActive = uart.active && (uart.last_seen || uart.bytes > 0);
  const gpioActive = gpio.monitored.length > 0;
  return {
    uart: {
      active: uart.active,
      last_seen: uart.last_seen,
      bytes: uart.bytes,
    },
    gpio: {
      monitored: gpio.monitored,
      last_events: gpio.last_events,
    },
    summary: uartActive || gpioActive ? "active" : gpioActive ? "monitoring" : "idle",
  };
}

module.exports = { getHardwareState };
