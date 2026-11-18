use crate::ViewportBounds;

/// Whether a surface still shows the current picture: nothing it draws has
/// changed since its last frame, and the view is the one that frame drew.
#[derive(Debug)]
pub(crate) struct FrameTracker {
    changed: bool,
    drawn: Option<ViewportBounds>,
}

impl FrameTracker {
    pub(crate) fn new() -> Self {
        Self {
            changed: true,
            drawn: None,
        }
    }

    /// Whether a frame of `bounds` would show a different picture.
    pub(crate) fn is_due(&self, bounds: ViewportBounds) -> bool {
        self.changed || self.drawn != Some(bounds)
    }

    /// Something drawn has changed, or the surface may have lost its picture.
    pub(crate) fn invalidate(&mut self) {
        self.changed = true;
    }

    /// Write `value` to a setting, and invalidate the picture if it differs.
    pub(crate) fn update<T: PartialEq>(&mut self, setting: &mut T, value: T) {
        if *setting != value {
            *setting = value;
            self.invalidate();
        }
    }

    /// A frame of `bounds` reached the surface.
    pub(crate) fn drawn(&mut self, bounds: ViewportBounds) {
        self.changed = false;
        self.drawn = Some(bounds);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{WorldPoint, WorldRect, WorldSize};

    fn view(x: u32) -> ViewportBounds {
        ViewportBounds {
            rect: WorldRect::new(WorldPoint::new(x, 0), WorldSize::new(64, 32)),
            zoom_level: 1.0,
        }
    }

    #[test]
    fn a_frame_is_due_until_the_current_picture_is_drawn() {
        let mut frame = FrameTracker::new();
        assert!(frame.is_due(view(0)));

        // A failed frame never reports drawn, so it stays due
        frame.invalidate();
        assert!(frame.is_due(view(0)));

        frame.drawn(view(0));
        assert!(!frame.is_due(view(0)));

        // Another view is another picture, and returning to the drawn one
        // needs no frame
        assert!(frame.is_due(view(1)));
        assert!(!frame.is_due(view(0)));

        frame.invalidate();
        assert!(frame.is_due(view(0)));
    }

    #[test]
    fn only_a_setting_that_changes_makes_a_frame_due() {
        let mut frame = FrameTracker::new();
        frame.drawn(view(0));

        let mut borders = true;
        frame.update(&mut borders, true);
        assert!(!frame.is_due(view(0)));

        frame.update(&mut borders, false);
        assert!(!borders);
        assert!(frame.is_due(view(0)));
    }
}
