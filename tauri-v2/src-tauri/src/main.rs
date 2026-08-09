// Release modunda Windows'ta ek konsol penceresi açılmasını engeller. KALDIRMAYIN!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    volstudio_tauri_lib::run()
}
