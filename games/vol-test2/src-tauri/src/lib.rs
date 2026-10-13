#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    volstudio_tauri_lib::run_with_context(tauri::generate_context!())
}
