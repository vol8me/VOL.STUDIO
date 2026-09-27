const COMMANDS: &[&str] = &["report", "env_info"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
