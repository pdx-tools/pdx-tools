//! Sends tracing output to the browser or worker console.

use tracing::Level;
use wasm_bindgen::prelude::*;

use crate::subscriber::{ConsoleSubscriber, LogOutput, LoggingConfig};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn console_log(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = debug)]
    fn console_debug(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = warn)]
    fn console_warn(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error(s: &str);
    #[wasm_bindgen(js_namespace = performance, js_name = now)]
    fn performance_now() -> f64;
}

/// Sends tracing output to the console of a browser, which has a clock that
/// runs continuously, thus each span shows how long it was entered.
///
/// Code that runs in a cloudflare worker must use [`init_with_config`] and keep
/// [`LoggingConfig::span_durations`] off.
pub fn init_with_level(level: Level) {
    init_with_config(LoggingConfig {
        max_level: level,
        span_durations: true,
    });
}

/// Sends tracing output to the console.
///
/// Repeat calls do nothing but write a warning, because a wasm instance can
/// have only one subscriber.
pub fn init_with_config(config: LoggingConfig) {
    let subscriber = ConsoleSubscriber::new(config, ConsoleOutput);
    if let Err(e) = tracing::subscriber::set_global_default(subscriber) {
        console_warn(&format!("unable to set the tracing subscriber: {e}"));
    }
}

/// Writes to the console, at the method that matches the level.
struct ConsoleOutput;

impl LogOutput for ConsoleOutput {
    fn write(&self, level: &Level, message: &str) {
        match *level {
            Level::ERROR => console_error(message),
            Level::WARN => console_warn(message),
            Level::INFO => console_log(message),
            Level::DEBUG | Level::TRACE => console_debug(message),
        }
    }

    fn now_ms(&self) -> f64 {
        performance_now()
    }
}
