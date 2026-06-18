use keyring::Entry;

// Service namespace for keychain entries (one token per account, e.g. session key).
const SERVICE: &str = "ai.deneb.andromeda";

// Persist the Deneb client token in the OS keychain (macOS Keychain, Windows
// Credential Manager, Linux libsecret) rather than localStorage — DESIGN §6 calls
// for secure-store on the desktop shell.
#[tauri::command]
fn token_set(account: String, token: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &account).map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn token_get(account: String) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![token_set, token_get])
        .run(tauri::generate_context!())
        .expect("error while running Andromeda");
}
