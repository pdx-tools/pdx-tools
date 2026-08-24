//! A [`Subscriber`] that formats tracing output into single lines and gives
//! them to a writer.

use std::fmt::Write;
use std::sync::Mutex;

use tracing::field::{Field, Visit};
use tracing::span::{Attributes, Id, Record};
use tracing::{Level, Metadata, Subscriber};

/// How the subscriber writes its output.
#[derive(Debug, Clone, Copy)]
pub struct LoggingConfig {
    /// The most verbose level to write.
    pub max_level: Level,

    /// Puts how long a span was entered in front of the span line.
    ///
    /// Keep this off in a cloudflare worker. A worker stops the clock until the
    /// next I/O operation, thus each span shows a duration of zero.
    pub span_durations: bool,
}

/// Where a formatted line goes, and where a timestamp comes from. The console
/// and the clock are only in wasm, thus the tests give their own.
pub trait LogOutput {
    fn write(&self, level: &Level, message: &str);

    fn now_ms(&self) -> f64;
}

#[derive(Debug)]
pub struct ConsoleSubscriber<O> {
    config: LoggingConfig,
    output: O,
    state: Mutex<State>,
}

impl<O> ConsoleSubscriber<O> {
    pub fn new(config: LoggingConfig, output: O) -> Self {
        Self {
            config,
            output,
            state: Mutex::new(State::default()),
        }
    }

    fn state(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().expect("tracing state lock is poisoned")
    }
}

/// Holds a scratch buffer to format into, and the spans that are open.
#[derive(Debug, Default)]
struct State {
    scratch: String,
    spans: SpanStore,
}

/// Stores the spans that are open.
///
/// A span id is the slot index plus one. Spans open and close in the order of a
/// stack, thus a free slot is used again almost immediately and the store stays
/// as large as the deepest nest of spans. This makes each operation an index,
/// with no hash to compute.
#[derive(Debug, Default)]
struct SpanStore {
    slots: Vec<Option<SpanData>>,
    free: Vec<usize>,
}

impl SpanStore {
    fn insert(&mut self, data: SpanData) -> u64 {
        let index = match self.free.pop() {
            Some(index) => {
                self.slots[index] = Some(data);
                index
            }
            None => {
                self.slots.push(Some(data));
                self.slots.len() - 1
            }
        };

        index as u64 + 1
    }

    fn get_mut(&mut self, id: &Id) -> Option<&mut SpanData> {
        self.slots.get_mut(slot_index(id)?)?.as_mut()
    }

    fn remove(&mut self, id: &Id) {
        let Some(index) = slot_index(id) else {
            return;
        };

        if self.slots.get(index).is_some_and(Option::is_some) {
            self.slots[index] = None;
            self.free.push(index);
        }
    }
}

fn slot_index(id: &Id) -> Option<usize> {
    usize::try_from(id.into_u64()).ok()?.checked_sub(1)
}

#[derive(Debug)]
struct SpanData {
    /// The span name and its fields, formatted when the span was made.
    message: String,
    level: Level,
    /// The number of handles to the span. The span data is dropped when this
    /// reaches zero.
    handles: u32,
    /// The number of times the span is entered. Only the last exit writes the
    /// duration.
    depth: u32,
    start_ms: f64,
}

impl<O> Subscriber for ConsoleSubscriber<O>
where
    O: LogOutput + Send + Sync + 'static,
{
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        metadata.level() <= &self.config.max_level
    }

    /// Keeps the span until it exits, because a field can be recorded after the
    /// span is made.
    fn new_span(&self, span: &Attributes<'_>) -> Id {
        let metadata = span.metadata();
        let State { scratch, spans } = &mut *self.state();

        scratch.clear();
        scratch.push_str(metadata.name());
        span.record(&mut FieldVisitor::new(scratch));

        let id = spans.insert(SpanData {
            message: scratch.clone(),
            level: *metadata.level(),
            handles: 1,
            depth: 0,
            start_ms: 0.0,
        });

        Id::from_u64(id)
    }

    fn record(&self, span: &Id, values: &Record<'_>) {
        let mut state = self.state();
        let Some(data) = state.spans.get_mut(span) else {
            return;
        };

        values.record(&mut FieldVisitor::new(&mut data.message));
    }

    fn record_follows_from(&self, _span: &Id, _follows: &Id) {}

    fn event(&self, event: &tracing::Event<'_>) {
        let scratch = &mut self.state().scratch;
        scratch.clear();
        event.record(&mut FieldVisitor::new(scratch));
        if scratch.is_empty() {
            scratch.push_str(event.metadata().name());
        }
        self.output.write(event.metadata().level(), scratch);
    }

    fn clone_span(&self, id: &Id) -> Id {
        if let Some(data) = self.state().spans.get_mut(id) {
            data.handles += 1;
        }

        id.clone()
    }

    fn try_close(&self, id: Id) -> bool {
        let mut state = self.state();
        let Some(data) = state.spans.get_mut(&id) else {
            return true;
        };

        data.handles -= 1;
        if data.handles > 0 {
            return false;
        }

        state.spans.remove(&id);
        true
    }

    fn enter(&self, span: &Id) {
        let mut state = self.state();
        let Some(data) = state.spans.get_mut(span) else {
            return;
        };

        if data.depth == 0 && self.config.span_durations {
            data.start_ms = self.output.now_ms();
        }
        data.depth += 1;
    }

    fn exit(&self, span: &Id) {
        let State { scratch, spans, .. } = &mut *self.state();
        let Some(data) = spans.get_mut(span) else {
            return;
        };

        data.depth -= 1;
        if data.depth > 0 {
            return;
        }

        scratch.clear();
        if self.config.span_durations {
            let elapsed = self.output.now_ms() - data.start_ms;
            write!(scratch, "[{elapsed:5.0}ms] ").expect("writing to a string failed");
        }
        scratch.push_str(&data.message);
        self.output.write(&data.level, scratch);
    }
}

struct FieldVisitor<'a> {
    output: &'a mut String,
}

impl<'a> FieldVisitor<'a> {
    fn new(output: &'a mut String) -> Self {
        Self { output }
    }

    fn separator(&mut self) {
        if !self.output.is_empty() {
            self.output.push(' ');
        }
    }
}

impl Visit for FieldVisitor<'_> {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        self.separator();
        if field.name() == "message" {
            write!(self.output, "{value:?}").expect("writing to a string failed");
        } else {
            write!(self.output, "{}={value:?}", field.name()).expect("writing to a string failed");
        }
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        self.separator();
        if field.name() == "message" {
            self.output.push_str(value);
        } else {
            write!(self.output, "{}={value:?}", field.name()).expect("writing to a string failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};
    use std::sync::Arc;

    use tracing::field;
    use tracing::subscriber::with_default;
    use tracing::{info, info_span, warn};

    use super::*;

    thread_local! {
        static LINES: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
        static CLOCK_MS: Cell<f64> = const { Cell::new(0.0) };
    }

    struct TestOutput;

    impl LogOutput for TestOutput {
        fn write(&self, level: &Level, message: &str) {
            LINES.with_borrow_mut(|lines| lines.push(format!("{level} {message}")));
        }

        fn now_ms(&self) -> f64 {
            CLOCK_MS.get()
        }
    }

    /// Moves the test clock forward, as a span measures its duration.
    fn advance(ms: f64) {
        CLOCK_MS.set(CLOCK_MS.get() + ms);
    }

    fn lines() -> Vec<String> {
        LINES.with_borrow(Clone::clone)
    }

    fn subscriber(max_level: Level, span_durations: bool) -> Arc<ConsoleSubscriber<TestOutput>> {
        LINES.with_borrow_mut(Vec::clear);
        CLOCK_MS.set(0.0);
        Arc::new(ConsoleSubscriber::new(
            LoggingConfig {
                max_level,
                span_durations,
            },
            TestOutput,
        ))
    }

    /// The slots that the store holds, and the slots that it can use again.
    fn slot_counts(subscriber: &ConsoleSubscriber<TestOutput>) -> (usize, usize) {
        let spans = &subscriber.state().spans;
        (spans.slots.len(), spans.free.len())
    }

    #[test]
    fn writes_an_event_with_its_fields() {
        let subscriber = subscriber(Level::INFO, false);
        with_default(subscriber, || {
            info!(match_id = 7, "match started");
        });

        assert_eq!(lines(), ["INFO match started match_id=7"]);
    }

    #[test]
    fn drops_an_event_that_is_too_verbose() {
        let subscriber = subscriber(Level::WARN, false);
        with_default(subscriber, || {
            info!("ignored");
            warn!("kept");
        });

        assert_eq!(lines(), ["WARN kept"]);
    }

    #[test]
    fn writes_a_span_one_time_when_it_exits() {
        let subscriber = subscriber(Level::INFO, false);
        with_default(Arc::clone(&subscriber), || {
            let span = info_span!("handle_action", match_id = 7);
            let _guard = span.enter();
            advance(5.0);
        });

        assert_eq!(lines(), ["INFO handle_action match_id=7"]);
        assert_eq!(slot_counts(&subscriber), (1, 1));
    }

    #[test]
    fn writes_a_field_that_is_recorded_after_the_span_is_made() {
        let subscriber = subscriber(Level::INFO, false);
        with_default(subscriber, || {
            let span = info_span!("handle_action", match_id = 7, result = field::Empty);
            let _guard = span.enter();
            span.record("result", "win");
        });

        assert_eq!(lines(), ["INFO handle_action match_id=7 result=\"win\""]);
    }

    #[test]
    fn writes_a_span_duration_when_the_span_exits() {
        let subscriber = subscriber(Level::INFO, true);
        with_default(subscriber, || {
            let span = info_span!("handle_action", match_id = 7);
            advance(100.0);
            let _guard = span.enter();
            advance(5.0);
        });

        assert_eq!(lines(), ["INFO [    5ms] handle_action match_id=7"]);
    }

    #[test]
    fn writes_one_duration_for_a_span_that_is_entered_again() {
        let subscriber = subscriber(Level::INFO, true);
        with_default(subscriber, || {
            let span = info_span!("work");
            let handle = span.clone();
            let outer = span.enter();
            advance(3.0);
            let inner = handle.enter();
            advance(4.0);
            drop(inner);
            advance(2.0);
            drop(outer);
        });

        assert_eq!(lines(), ["INFO [    9ms] work"]);
    }

    #[test]
    fn uses_a_slot_again_after_a_span_closes() {
        let subscriber = subscriber(Level::INFO, true);
        with_default(Arc::clone(&subscriber), || {
            for _ in 0..100 {
                let span = info_span!("work");
                let _guard = span.enter();
                advance(1.0);
            }
        });

        assert_eq!(lines().len(), 100);
        assert_eq!(slot_counts(&subscriber), (1, 1));
    }

    #[test]
    fn keeps_a_span_open_until_the_last_handle_closes() {
        let subscriber = subscriber(Level::INFO, true);
        with_default(Arc::clone(&subscriber), || {
            let span = info_span!("work");
            let handle = span.clone();
            drop(span);
            assert_eq!(slot_counts(&subscriber), (1, 0));
            drop(handle);
        });

        assert_eq!(slot_counts(&subscriber), (1, 1));
    }
}
