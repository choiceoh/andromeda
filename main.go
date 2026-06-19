package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// The Vite build output is embedded into the binary and served to the webview.
//
//go:embed all:dist
var assets embed.FS

func main() {
	app := application.New(application.Options{
		Name:        "Andromeda",
		Description: "Deneb 데스크탑 워크스테이션",
		Services: []application.Service{
			application.NewService(&TokenService{}),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Andromeda",
		Width:            1280,
		Height:           800,
		MinWidth:         900,
		MinHeight:        600,
		BackgroundColour: application.NewRGB(20, 22, 28),
		URL:              "/",
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
