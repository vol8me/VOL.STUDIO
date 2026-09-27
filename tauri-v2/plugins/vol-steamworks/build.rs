const COMMANDS: &[&str] = &[
    "status",
    "set_input_manifest",
    "activate_action_set",
    "controllers",
    "action_glyph",
    "show_text_input",
    "show_floating_input",
    "show_binding_panel",
    "cloud_list",
    "cloud_read",
    "cloud_write",
    "cloud_delete",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
