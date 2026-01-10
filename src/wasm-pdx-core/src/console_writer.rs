//! Minimal tracing subscriber for WASM console output
use std::cell::RefCell;
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

pub fn init_with_level(level: Level) {
    tracing::subscriber::set_global_default(ConsoleSubscriber::new(level))
        .expect("setting tracing default failed");
}

/// Visitor that extracts fields into a formatted string.
struct FieldVisitor<'a> {
    output: &'a mut String,
}

impl<'a> FieldVisitor<'a> {
    fn new(output: &'a mut String) -> Self {
        output.clear();
        Self { output }
    }
}

impl Visit for FieldVisitor<'_> {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        // Special handling for the "message" field (the primary log message)
        if field.name() == "message" {
            write!(self.output, "{:?}", value).unwrap();
        } else {
            // Include other fields as key=value pairs
            if !self.output.is_empty() {
                write!(self.output, " ").unwrap();
            }
            write!(self.output, "{}={:?}", field.name(), value).unwrap();
        }
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.output.push_str(value);
        } else {
            if !self.output.is_empty() {
                write!(self.output, " ").unwrap();
            }
            write!(self.output, "{}=\"{}\"", field.name(), value).unwrap();
        }
    }
}

#[derive(Debug)]
pub struct ConsoleSubscriber {
    max_level: Level,
    state: RefCell<SpanState>,
}

impl ConsoleSubscriber {
    pub fn new(max_level: Level) -> Self {
        Self {
            max_level,
            state: RefCell::new(SpanState {
                spans: Vec::new(),
                scratch: String::new(),
            }),
        }
    }
}

// WASM is single-threaded here, so interior mutability is safe in practice.
unsafe impl Sync for ConsoleSubscriber {}

#[derive(Debug)]
struct SpanState {
    spans: Vec<SpanData>,
    scratch: String,
}

#[derive(Debug)]
struct SpanData {
    name: &'static str,
    level: Level,
    fields: String,
    entered: bool,
}

impl Subscriber for ConsoleSubscriber {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        metadata.level() <= &self.max_level
    }

    fn new_span(&self, span: &Attributes<'_>) -> Id {
        let mut state = self.state.borrow_mut();
        let SpanState { spans, scratch } = &mut *state;
        let mut visitor = FieldVisitor::new(scratch);
        span.record(&mut visitor);

        let data = SpanData {
            name: span.metadata().name(),
            level: *span.metadata().level(),
            fields: scratch.clone(),
            entered: false,
        };

        let id = Id::from_u64(spans.len() as u64 + 1);
        spans.push(data);
        id
    }

    fn record(&self, span: &Id, values: &Record<'_>) {
        let mut state = self.state.borrow_mut();
        let SpanState { spans, scratch } = &mut *state;
        let mut visitor = FieldVisitor::new(scratch);
        values.record(&mut visitor);
        if scratch.is_empty() {
            return;
        }

        if let Some(data) = spans.get_mut(span.into_u64() as usize - 1) {
            if !data.fields.is_empty() {
                data.fields.push(' ');
            }
            data.fields.push_str(scratch);
        }
    }

    fn record_follows_from(&self, _span: &Id, _follows: &Id) {}

    fn enter(&self, span: &Id) {
        let mut state = self.state.borrow_mut();
        let SpanState { spans, scratch } = &mut *state;
        let Some(data) = spans.get_mut(span.into_u64() as usize - 1) else {
            return;
        };
        if !self.enabled_for_level(&data.level) {
            return;
        }
        if data.entered {
            // Already entered, avoid duplicate logs for async spans
            return;
        }

        data.entered = true;
        scratch.clear();
        scratch.push_str(data.name);
        if !data.fields.is_empty() {
            scratch.push(' ');
            scratch.push_str(&data.fields);
        }
        log_for_level(&data.level, scratch);
    }

    fn exit(&self, _span: &Id) {}

    fn event(&self, event: &tracing::Event<'_>) {
        let metadata = event.metadata();

        // Extract fields using our visitor
        let mut state = self.state.borrow_mut();
        let scratch = &mut state.scratch;
        let mut visitor = FieldVisitor::new(scratch);
        event.record(&mut visitor);
        if scratch.is_empty() {
            scratch.push_str(metadata.name());
        }

        // Route to appropriate console method for visual distinction in DevTools
        log_for_level(metadata.level(), scratch);
    }
}

impl ConsoleSubscriber {
    fn enabled_for_level(&self, level: &Level) -> bool {
        level <= &self.max_level
    }
}

fn log_for_level(level: &Level, msg: &str) {
    match *level {
        Level::ERROR => console_error(msg),
        Level::WARN => console_warn(msg),
        Level::DEBUG | Level::TRACE => console_debug(msg),
        Level::INFO => console_log(msg),
    }
}
