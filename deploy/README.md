# 웹 미리보기 배포 (GitHub Pages)

이 폴더의 `deploy-pages.yml`은 원래 `.github/workflows/deploy-pages.yml`로 두어
`secret-five-mvp` 브랜치에 푸시할 때마다 테스트·빌드·배포를 자동으로 돌리는 워크플로우입니다.
지금은 Pickle의 GitHub 연결 앱에 `workflows` 권한이 없어 `.github/workflows/`로 푸시가
거부되므로(remote rejected: refusing to allow a GitHub App to create or update workflow)
템플릿만 여기 두었습니다.

## 지금 배포되는 방식

`gh-pages` 브랜치에 `/MJ_Metal/` 서브패스를 기준으로 빌드한 결과물이 들어 있고,
GitHub Pages 소스를 **Deploy from a branch → gh-pages / (root)** 로 고르면
https://cj84368436-spec.github.io/MJ_Metal/ 이 열립니다.

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
