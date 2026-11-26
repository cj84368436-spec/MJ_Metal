# 웹 미리보기 배포 (GitHub Pages)

이 폴더의 `deploy-pages.yml`은 원래 `.github/workflows/deploy-pages.yml`로 두어
`secret-five-mvp` 브랜치에 푸시할 때마다 테스트·빌드·배포를 자동으로 돌리는 워크플로우입니다.
지금은 Pickle의 GitHub 연결 앱에 `workflows` 권한이 없어 `.github/workflows/`로 푸시가
거부되므로(remote rejected: refusing to allow a GitHub App to create or update workflow)
템플릿만 여기 두었습니다.

## 지금 배포되는 방식

GitHub Pages가 켜져 있고 소스는 **Deploy from a branch → gh-pages / (root)** 입니다.
`gh-pages` 브랜치에는 `npm run build:pages` 결과물(`/MJ_Metal/` 기준, `404.html` 폴백 포함)이
들어 있어서, 이 브랜치에 푸시하면 Pages가 자동으로 다시 빌드합니다.

- 주소: https://cj84368436-spec.github.io/MJ_Metal/ (HTTPS 강제)
- 코드 갱신 후 재배포: `bash /workspace/mjmetal-preview-deploy.sh`
  (코드를 받아 빌드하고 gh-pages에 푸시한 뒤 HTTP 200과 자산 응답까지 확인합니다)
- 웹 미리보기는 `VITE_DATA_MODE=mock`으로 빌드해 브라우저 localStorage(`mockStore`)로 동작합니다.
  `.env.local`은 `.ait`(토스 앱) 빌드에만 쓰고, 미리보기 빌드에서만 이 값으로 덮어씁니다.
  덕분에 미리보기에서 만든 방이 실제 Supabase에 쌓이지 않고, 보상형 광고도 모의 시청으로 체험할 수 있습니다.

## 나중에 자동 배포로 바꾸려면

`.github/workflows/` 쓰기 권한이 있는 계정/토큰으로 아래를 실행하고
Settings → Pages 의 Source를 **GitHub Actions** 로 바꾸면 됩니다.

```bash
mkdir -p .github/workflows
git mv deploy/deploy-pages.yml .github/workflows/deploy-pages.yml
git commit -m "Enable automatic GitHub Pages deployment"
git push
```

빌드 스크립트는 `npm run build:pages` (`tsc --noEmit && vite build --base=/MJ_Metal/`)이고,
`npm run build`/`build:ait`(토스 앱인토스 번들)는 루트 경로 그대로라 영향을 받지 않습니다.
