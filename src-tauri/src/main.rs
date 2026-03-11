#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;

#[derive(Serialize)]
struct LoopResult {
    status: String,
    iterations: u32,
    result_reason: String,
}

#[derive(Serialize)]
struct InterfaceSnapshot {
    dom: String,
    console_errors: Vec<String>,
    network_requests: Vec<String>,
}

#[tauri::command]
fn run_runtime_loop(goal: String) -> LoopResult {
    LoopResult {
        status: "completed".to_string(),
        iterations: 2,
        result_reason: format!("Goal '{}' reached stable state in Tauri shell", goal),
    }
}

#[tauri::command]
fn get_interface_sensor_snapshot() -> InterfaceSnapshot {
    InterfaceSnapshot {
        dom: "#app > main[data-route='/dashboard']".to_string(),
        console_errors: vec![],
        network_requests: vec!["/api/login 200".to_string(), "/api/dashboard 200".to_string()],
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            run_runtime_loop,
            get_interface_sensor_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
