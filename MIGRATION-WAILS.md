# Tauri → Wails v3 마이그레이션 런북

> **상태: 핵심 검증 완료 (2026-06, Wails v3 alpha2.104, macOS arm64).** 이 문서 일부
> 코드는 초기 추측이었고, 이후 실제로 빌드해 **검증된 코드는 커밋된 파일이 1순위**다:
> [`main.go`](main.go) · [`tokens.go`](tokens.go) · [`src/tauri.ts`](src/tauri.ts) ·
> [`go.mod`](go.mod). 검증된 사실:
>
> - ✅ `go build` 성공 → Mach-O arm64 (Wails 앱 + `dist/` 임베드 + TokenService)
> - ✅ `wails3 generate bindings` → `src/bindings/andromeda/tokenservice` (커밋됨)
> - ✅ 프론트 배선: `src/tauri.ts`가 바인딩을 **isTauri() 가드 안에서 동적 import**
>   (웹/테스트는 `@wailsio/runtime` 미로드). 웹 빌드 typecheck·lint·format·build·테스트
>   44/44 모두 그린.
> - ⚠️ **미검증**: 실제 창 실행/키체인 왕복(`wails3 dev`, 디스플레이 필요) · `.app`/`.msi`
>   패키징(아래 8단계, 구조 결정 필요) · Windows 빌드(CI).
>
> 런북의 추측 코드와 커밋된 파일이 다르면 **커밋된 파일을 믿어라.**
>
> **Tauri는 건드리지 않았다.** `src-tauri/`, `.github/workflows/release.yml`, `v0.0.1`
> 릴리즈는 폴백으로 남아 있다. Wails가 완전히 초록불이 된 다음 9단계에서 제거한다.

마이그레이션의 핵심: **네이티브 표면이 작고 한 군데에 격리돼 있다.** 바뀌는 건
`src-tauri/`(Rust 51줄)와 `src/tauri.ts`(프론트 글루 37줄) 둘뿐이고, `App.tsx`·`gateway.ts`는
공개 API만 부르므로 **안 바뀐다**.

---

## 0. 사전 준비

```bash
go version                 # 1.24+ (현재 머신 1.26 OK)
go install github.com/wailsapp/wails/v3/cmd/wails3@latest
wails3 doctor              # 시스템 의존성 점검(webview 등)
```

## 1. Wails 스캐폴드 확보 (정석 부트스트랩)

알파 구조를 손으로 추측하지 말고 CLI가 만든 걸 기준으로 삼는다. 임시 폴더에 표준 템플릿을
뽑아 `main.go` / 빌드 설정 / 바인딩 생성 흐름을 확인한다:

```bash
cd /tmp && wails3 init -n andromeda-ref -t vite-react-ts
# 생성된 main.go, Taskfile.yml, build/ 설정, frontend 연동 방식을 참고용으로 본다.
```

그다음 이 저장소에 통합한다. Wails가 우리 기존 Vite 프론트(루트 `vite.config.ts`,
`src/`, 빌드 산출물 `dist/`)를 그대로 쓰도록 연결한다 — 프론트는 새로 만들지 않는다.

## 2. 네이티브 포트 (Rust 51줄 → Go)

`src-tauri/src/lib.rs`의 `token_set`/`token_get`/`token_from_file`을 그대로 옮긴 Go 서비스.
루트에 `tokens.go`로 둔다 (`go get github.com/zalando/go-keyring` 필요):

```go
package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/zalando/go-keyring"
)

const keychainService = "ai.deneb.andromeda"

// TokenService = Tauri의 token_* 커맨드 3종 포트. Wails 서비스로 등록하면
// 공개 메서드가 프론트 바인딩으로 노출된다.
type TokenService struct{}

// Set: OS 키체인에 토큰 저장 (macOS Keychain / Windows 자격증명 관리자).
func (t *TokenService) Set(account, token string) error {
	return keyring.Set(keychainService, account, token)
}

// Get: 키체인 토큰 반환, 없으면 "".
func (t *TokenService) Get(account string) (string, error) {
	v, err := keyring.Get(keychainService, account)
	if errors.Is(err, keyring.ErrNotFound) {
		return "", nil
	}
	return v, err
}

// FromFile: 게이트웨이가 쓰는 ~/.deneb/client_token 읽기, 없으면 "".
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
```

## 3. main.go — 서비스 등록 + 창 (v3 알파 근사치)

`wails3 init` 산출물의 `main.go`를 기준으로, 서비스 등록과 창 옵션만 우리 값으로 맞춘다:

```go
package main

import (
	"embed"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:dist
var assets embed.FS

func main() {
	app := application.New(application.Options{
		Name: "Andromeda",
		Services: []application.Service{
			application.NewService(&TokenService{}),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	app.NewWebviewWindowWithOptions(application.WebviewWindowOptions{
		Title:     "Andromeda",
		Width:     1280,
		Height:    800,
		MinWidth:  900,
		MinHeight: 600,
	})

	if err := app.Run(); err != nil {
		panic(err)
	}
}
```

> ⚠️ v3 알파: `application.Options`·`AssetOptions`·`NewService`·임베드 경로(`dist` vs
> `frontend/dist`)가 템플릿과 다를 수 있다. 1단계 참고 스캐폴드의 시그니처에 맞춰라.

## 4. 바인딩 생성

```bash
wails3 generate bindings        # frontend의 bindings/ 경로에 TS 생성
```

생성된 `TokenService.Get/Set/FromFile`의 **정확한 import 경로**를 확인한다(5단계에서 씀).

## 5. 프론트 글루 교체 (`src/tauri.ts` 내부만)

**export 시그니처는 그대로 유지**하고 내부의 Tauri `invoke`만 Wails 바인딩 호출로 바꾼다.
그러면 `App.tsx`·`gateway.ts`는 한 줄도 안 바뀐다. (선택: 파일명을 `desktop.ts`로 바꾸고
`isTauri`→`isDesktop` 리네임 + import 2~3곳 갱신 — 더 깔끔하지만 필수는 아님.)

```ts
// 4단계에서 확인한 실제 경로로 교체
import { Get, Set, FromFile } from "../bindings/andromeda/main/tokenservice";

// Wails 웹뷰면 런타임이 window._wails 를 주입한다 (기존 isTauri 대체).
export function isTauri(): boolean {
  return typeof window !== "undefined" && "_wails" in window;
}

export async function secureGetToken(account: string): Promise<string | null> {
  if (!isTauri()) return null;
  return (await Get(account).catch(() => "")) || null;
}

export async function secureSetToken(account: string, token: string): Promise<void> {
  if (!isTauri()) return;
  await Set(account, token);
}

// 기존 readDesktopToken 시그니처 유지: 키체인 우선, 없으면 토큰 파일.
export async function readDesktopToken(account = "client:main"): Promise<string | null> {
  if (!isTauri()) return null;
  const fromKeychain = (await Get(account).catch(() => "")) || "";
  if (fromKeychain) return fromKeychain;
  return (await FromFile().catch(() => "")) || null;
}
```

`src/tauri.test.ts`도 같은 export를 쓰므로, 웹(비데스크탑) 분기 테스트는 그대로 통과한다
(`isTauri()===false` 경로). 데스크탑 경로는 `wails3 dev`로 수동 확인.

## 6. 아이콘

이미 만들어 둔 `src-tauri/icons/icon.png`(1024 RGBA)를 Wails 소스로 재사용:

```bash
cp src-tauri/icons/icon.png build/appicon.png    # v3 기본 앱 아이콘 경로(템플릿 확인)
```

## 7. 검증 (← 진짜 검증은 여기서)

```bash
wails3 dev      # 핫리로드. 확인: ① 현재 프론트가 웹뷰에 뜨는가
                #                  ② 사이드바 연결 → secureSetToken/Get 키체인 왕복
                #                  ③ ~/.deneb/client_token 자동연결(FromFile)
```

세 개 다 되면 마이그레이션 본체는 끝. 안 되면 에러 붙여줘 — 내가 고친다.

## 8. 릴리즈 워크플로 (스켈레톤)

v3는 `tauri-action` 같은 올인원이 없어 좀 더 수동이다. mac+win 매트릭스 빌드 후
`softprops/action-gh-release`로 draft에 업로드. **빌드 산출물 경로는 `wails3 build` 출력
확인 후 맞출 것:**

```yaml
name: Release (Wails)
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  release:
    strategy:
      fail-fast: false
      matrix:
        platform: [macos-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.24" }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: go install github.com/wailsapp/wails/v3/cmd/wails3@latest
      - run: pnpm install --frozen-lockfile
      - run: wails3 build # → bin/ 에 .app/.exe (플랫폼별 패키징 옵션 확인)
      - uses: softprops/action-gh-release@v2
        with:
          draft: true
          files: bin/* # 실제 산출물 경로/패키지(.dmg/.msi)로 조정
```

## 9. Tauri 제거 (Wails 초록불 확인 후에만)

```bash
git rm -r src-tauri
git rm .github/workflows/release.yml
pnpm remove @tauri-apps/api @tauri-apps/cli
# package.json scripts에서 tauri / tauri:dev / tauri:build 제거
# CLAUDE.md·docs/DESIGN.md 스택 표기 Tauri→Wails 갱신
```

## 캐비엇 (정직한 미지수)

- **v3 알파 API**: `application.New` 옵션, 에셋 임베드, 서비스 등록, 바인딩 import 경로가
  이 문서와 다를 수 있다 — 1단계 참고 스캐폴드 + v3 문서가 1순위, 이 문서는 2순위.
- **검증 불가 항목**: 이 저장소 환경에선 위 Go/Wails 어느 것도 컴파일·실행 못 했다. 전부
  네 머신의 `wails3 dev`/`wails3 build`에서 처음으로 검증된다.
- **범위**: mac + Windows만 (Linux 미포함, DESIGN과 동일). 모바일은 KMP `client-android`라 무관.
