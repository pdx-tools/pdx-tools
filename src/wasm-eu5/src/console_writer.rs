//! Minimal tracing subscriber for WASM console output
use std::fmt::Write as FmtWrite;
use tracing::field::{Field, Visit};
use tracing::span::{Attributes, Id, Record};
use tracing::{Level, Metadata, Subscriber};
use wasm_bindgen::prelude::*;

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
}

/// Visitor that extracts fields into a formatted string
struct FieldVisitor {
    output: String,
}

impl FieldVisitor {
    fn new() -> Self {
        Self {
            output: String::new(),
        }
    }
}

impl Visit for FieldVisitor {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        // Special handling for the "message" field (the primary log message)
        if field.name() == "message" {
            write!(&mut self.output, "{:?}", value).unwrap();
        } else {
            // Include other fields as key=value pairs
            if !self.output.is_empty() {
                write!(&mut self.output, " ").unwrap();
            }
            write!(&mut self.output, "{}={:?}", field.name(), value).unwrap();
        }
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.output.push_str(value);
        } else {
            if !self.output.is_empty() {
                write!(&mut self.output, " ").unwrap();
            }
            write!(&mut self.output, "{}=\"{}\"", field.name(), value).unwrap();
        }
    }
}

pub struct ConsoleSubscriber {
    max_level: Level,
}

impl ConsoleSubscriber {
    pub fn new(max_level: Level) -> Self {
        Self { max_level }
    }
}

impl Subscriber for ConsoleSubscriber {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        metadata.level() <= &self.max_level
    }

    fn new_span(&self, _span: &Attributes<'_>) -> Id {
        Id::from_u64(1) // Minimal span support - we don't track spans
    }

    fn record(&self, _span: &Id, _values: &Record<'_>) {}
    fn record_follows_from(&self, _span: &Id, _follows: &Id) {}
    fn enter(&self, _span: &Id) {}
    fn exit(&self, _span: &Id) {}

    fn event(&self, event: &tracing::Event<'_>) {
        let metadata = event.metadata();

        // Extract fields using our visitor
        let mut visitor = FieldVisitor::new();
        event.record(&mut visitor);

        // Format: "LEVEL message"
        let level_str = match *metadata.level() {
            Level::ERROR => "ERROR",
            Level::WARN => "WARN",
            Level::INFO => "INFO",
            Level::DEBUG => "DEBUG",
            Level::TRACE => "TRACE",
        };

        let msg = if visitor.output.is_empty() {
            format!("{} {}", level_str, metadata.name())
        } else {
            format!("{} {}", level_str, visitor.output)
        };

        // Route to appropriate console method for visual distinction in DevTools
        match *metadata.level() {
            Level::ERROR => console_error(&msg),
            Level::WARN => console_warn(&msg),
            Level::DEBUG | Level::TRACE => console_debug(&msg),
            Level::INFO => console_log(&msg),
        }
    }
}
