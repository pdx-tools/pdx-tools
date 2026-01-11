use std::time::Duration;

/// Time source
pub trait Clock: Send {
    fn now(&mut self) -> Duration;
}

#[cfg(not(target_arch = "wasm32"))]
mod instant_clock {
    use super::{Clock, Duration};

    #[derive(Debug)]
    pub struct InstantClock {
        start: std::time::Instant,
    }

    impl Clock for InstantClock {
        fn now(&mut self) -> Duration {
            self.start.elapsed()
        }
    }

    impl InstantClock {
        pub fn new() -> Self {
            Self {
                start: std::time::Instant::now(),
            }
        }
    }

    impl Default for InstantClock {
        fn default() -> Self {
            Self::new()
        }
    }
}

#[cfg(target_arch = "wasm32")]
mod wasm_clock {
    use super::{Clock, Duration};
    use wasm_bindgen::prelude::wasm_bindgen;

    #[wasm_bindgen]
    extern "C" {
        /// Type for the [`Performance` object](https://developer.mozilla.org/en-US/docs/Web/API/Performance).
        pub(super) type Performance;

        /// Holds the [`Performance`](https://developer.mozilla.org/en-US/docs/Web/API/Performance) object.
        #[wasm_bindgen(thread_local_v2, js_namespace = globalThis, js_name = performance)]
        pub(super) static PERFORMANCE: Option<Performance>;

        /// Binding to [`Performance.now()`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now).
        #[wasm_bindgen(method)]
        pub(super) fn now(this: &Performance) -> f64;
    }

    #[derive(Debug, Default)]
    pub struct PerformanceClock;

    impl PerformanceClock {
        pub fn new() -> Self {
            Self
        }
    }

    impl Clock for PerformanceClock {
        fn now(&mut self) -> Duration {
            PERFORMANCE.with(|performance| {
                let Some(performance) = performance.as_ref() else {
                    return Duration::ZERO;
                };
                Duration::from_secs_f64(performance.now() / 1000.0)
            })
        }
    }
}

pub fn default_clock() -> Box<dyn Clock> {
    #[cfg(target_arch = "wasm32")]
    {
        Box::new(wasm_clock::PerformanceClock::new())
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        Box::new(instant_clock::InstantClock::new())
    }
}
