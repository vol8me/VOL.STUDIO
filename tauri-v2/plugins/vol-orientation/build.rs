const COMMANDS: &[&str] = &["get_state", "set_orientation"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
