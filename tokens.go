package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/zalando/go-keyring"
)

// keychainService namespaces our entries in the OS secure store.
const keychainService = "ai.deneb.andromeda"

// TokenService ports the Tauri token_* commands (src-tauri/src/lib.rs). Registered
// as a Wails service, its exported methods are callable from the frontend via the
// generated bindings.
type TokenService struct{}

// Set persists the Deneb client token in the OS keychain (macOS Keychain /
// Windows Credential Manager) rather than localStorage — DESIGN §6.
func (t *TokenService) Set(account, token string) error {
	return keyring.Set(keychainService, account, token)
}

// Get returns the keychain token for account, or "" if none is stored.
func (t *TokenService) Get(account string) (string, error) {
	v, err := keyring.Get(keychainService, account)
	if errors.Is(err, keyring.ErrNotFound) {
		return "", nil
	}
	return v, err
}

// FromFile returns the canonical token the gateway writes to ~/.deneb/client_token
// so the desktop app auto-connects without the user pasting it. Missing file → "".
func (t *TokenService) FromFile() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(filepath.Join(home, ".deneb", "client_token"))
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(b)), nil
}
