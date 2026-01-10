use std::sync::{Arc, Mutex};

use crate::LogicalPoint;

/// Axis-aligned bounding box in logical canvas coordinates
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SelectionBox {
    pub start: LogicalPoint<f32>,
    pub end: LogicalPoint<f32>,
}

impl SelectionBox {
    /// Create a new selection box from start and end points
    pub fn new(start: LogicalPoint<f32>, end: LogicalPoint<f32>) -> Self {
        Self { start, end }
    }

    /// Get the normalized rectangle with min/max points
    /// Handles backwards dragging (e.g., right-to-left or bottom-to-top)
    pub fn normalized_rect(&self) -> (LogicalPoint<f32>, LogicalPoint<f32>) {
        let min_x = self.start.x.min(self.end.x);
        let max_x = self.start.x.max(self.end.x);
        let min_y = self.start.y.min(self.end.y);
        let max_y = self.start.y.max(self.end.y);

        (
            LogicalPoint::new(min_x, min_y),
            LogicalPoint::new(max_x, max_y),
        )
    }

    /// Get the width and height of the selection box
    pub fn dimensions(&self) -> (f32, f32) {
        let (min, max) = self.normalized_rect();
        (max.x - min.x, max.y - min.y)
    }
}

/// Shared selection state that can be updated by InteractionController
/// and read by SelectionLayer
#[derive(Debug, Default, Clone)]
pub struct SelectionState {
    selection: Option<SelectionBox>,
}

impl SelectionState {
    /// Create a new empty selection state
    pub fn new() -> Self {
        Self { selection: None }
    }

    /// Set the current selection
    pub fn set(&mut self, selection: Option<SelectionBox>) {
        self.selection = selection;
    }

    /// Get the current selection
    pub fn get(&self) -> Option<SelectionBox> {
        self.selection
    }

    /// Clear the current selection
    pub fn clear(&mut self) {
        self.selection = None;
    }
}

/// Type alias for shared selection state using Arc<Mutex<>> for thread safety
pub type SharedSelectionState = Arc<Mutex<SelectionState>>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_selection_box_normalized_rect_forward() {
        let sel = SelectionBox::new(
            LogicalPoint::new(100.0, 100.0),
            LogicalPoint::new(200.0, 200.0),
        );
        let (min, max) = sel.normalized_rect();
        assert_eq!(min, LogicalPoint::new(100.0, 100.0));
        assert_eq!(max, LogicalPoint::new(200.0, 200.0));
    }

    #[test]
    fn test_selection_box_normalized_rect_backward() {
        // Drag right-to-left and bottom-to-top
        let sel = SelectionBox::new(
            LogicalPoint::new(200.0, 200.0),
            LogicalPoint::new(100.0, 100.0),
        );
        let (min, max) = sel.normalized_rect();
        assert_eq!(min, LogicalPoint::new(100.0, 100.0));
        assert_eq!(max, LogicalPoint::new(200.0, 200.0));
    }

    #[test]
    fn test_selection_box_dimensions() {
        let sel = SelectionBox::new(
            LogicalPoint::new(100.0, 100.0),
            LogicalPoint::new(250.0, 200.0),
        );
        let (width, height) = sel.dimensions();
        assert_eq!(width, 150.0);
        assert_eq!(height, 100.0);
    }

    #[test]
    fn test_selection_box_dimensions_backward() {
        let sel = SelectionBox::new(
            LogicalPoint::new(250.0, 200.0),
            LogicalPoint::new(100.0, 100.0),
        );
        let (width, height) = sel.dimensions();
        assert_eq!(width, 150.0);
        assert_eq!(height, 100.0);
    }

    #[test]
    fn test_selection_state() {
        let mut state = SelectionState::new();
        assert!(state.get().is_none());

        let sel = SelectionBox::new(
            LogicalPoint::new(100.0, 100.0),
            LogicalPoint::new(200.0, 200.0),
        );
        state.set(Some(sel));
        assert_eq!(state.get(), Some(sel));

        state.clear();
        assert!(state.get().is_none());
    }

    #[test]
    fn test_shared_selection_state() {
        let state: SharedSelectionState = Arc::new(Mutex::new(SelectionState::new()));

        // Clone for sharing
        let state_clone = state.clone();

        // Write via first reference
        state.lock().unwrap().set(Some(SelectionBox::new(
            LogicalPoint::new(0.0, 0.0),
            LogicalPoint::new(100.0, 100.0),
        )));

        // Read via second reference
        let sel = state_clone.lock().unwrap().get();
        assert!(sel.is_some());
        assert_eq!(sel.unwrap().start, LogicalPoint::new(0.0, 0.0));
    }
}
