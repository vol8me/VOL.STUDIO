//! Açık olay yazma reddi Tauri varsayılan iznini ezer; dinleme korunur.

use std::collections::BTreeMap;
use tauri::ipc::{Origin, RuntimeAuthority};
use tauri::utils::acl::{capability::Capability, manifest::Manifest, resolved::Resolved};
use tauri::utils::platform::Target;

fn core_event_manifest() -> BTreeMap<String, Manifest> {
    // Pinned Tauri core:event varsayılanı listen/unlisten/emit/emit_to verir.
    // Test yalnız bu sınırı çözer; diğer eklenti izinleri sonucu değiştirmez.
    serde_json::from_value(serde_json::json!({
        "core": {"default_permission": {
            "identifier": "default", "description": "core", "permissions": ["core:event:default"]
        }, "permissions": {}, "permission_sets": {}},
        "core:event": {
            "default_permission": {"identifier": "default", "description": "event", "permissions": [
                "allow-listen", "allow-unlisten", "allow-emit", "allow-emit-to"
            ]},
            "permissions": {
                "allow-listen": {"identifier": "allow-listen", "commands": {"allow": ["listen"]}},
                "allow-unlisten": {"identifier": "allow-unlisten", "commands": {"allow": ["unlisten"]}},
                "allow-emit": {"identifier": "allow-emit", "commands": {"allow": ["emit"]}},
                "allow-emit-to": {"identifier": "allow-emit-to", "commands": {"allow": ["emit_to"]}},
                "deny-emit": {"identifier": "deny-emit", "commands": {"deny": ["emit"]}},
                "deny-emit-to": {"identifier": "deny-emit-to", "commands": {"deny": ["emit_to"]}}
            }, "permission_sets": {}
        }
    })).unwrap()
}

#[test]
fn explicit_event_denials_override_default_allow_and_preserve_listeners() {
    for target in [
        Target::Linux,
        Target::Windows,
        Target::MacOS,
        Target::Android,
    ] {
        for denied in [false, true] {
            let mut permissions = vec!["core:default"];
            if denied {
                permissions.extend(["core:event:deny-emit", "core:event:deny-emit-to"]);
            }
            let capability: Capability = serde_json::from_value(serde_json::json!({
                "identifier": "main-events",
                "windows": ["main"],
                "permissions": permissions,
            }))
            .unwrap();
            let capabilities = BTreeMap::from([(capability.identifier.clone(), capability)]);
            let manifest = core_event_manifest();
            let resolved = Resolved::resolve(&manifest, capabilities, target).unwrap();
            let authority: RuntimeAuthority = tauri::runtime_authority!(manifest, resolved);
            for command in ["plugin:event|emit", "plugin:event|emit_to"] {
                assert_eq!(
                    authority
                        .resolve_access(command, "main", "main", &Origin::Local)
                        .is_none(),
                    denied,
                    "platform {target:?}, komut {command}, açık ret {denied}"
                );
            }
            for command in ["plugin:event|listen", "plugin:event|unlisten"] {
                assert!(
                    authority
                        .resolve_access(command, "main", "main", &Origin::Local)
                        .is_some(),
                    "native olay dinleme korunmalı: platform {target:?}, açık ret {denied}"
                );
            }
        }
    }
}
