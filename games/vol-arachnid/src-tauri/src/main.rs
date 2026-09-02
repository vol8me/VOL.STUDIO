// Release modunda Windows'ta ek konsol penceresi açılmasını engeller. KALDIRMAYIN!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    vol_arachnid_lib::run()
}
