mod commands;

use commands::AppState;
use eu5save::BasicTokenResolver;
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Load token resolver from embedded token file
  let token_data = include_bytes!("../../../../assets/tokens/eu5.txt");
  let token_resolver = BasicTokenResolver::from_text_lines(token_data.as_slice())
    .expect("Failed to load EU5 token resolver");

  let app_state = AppState {
    token_resolver: Arc::new(token_resolver),
  };

  tauri::Builder::default()
    .manage(app_state)
    .invoke_handler(tauri::generate_handler![
      commands::get_default_save_directory,
      commands::scan_save_directory,
      commands::read_save_file,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
