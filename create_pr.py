import urllib.request
import json
import os
import subprocess

def get_remote_url():
    result = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True)
    return result.stdout.strip()

def main():
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        print("GITHUB_TOKEN or GH_TOKEN not found in environment.")
        return

    url = get_remote_url()

    # Check if url ends with .git and strip it
    if url.endswith(".git"):
        url = url[:-4]

    # Parse owner and repo from URL (https://github.com/owner/repo)
    parts = url.split("github.com/")
    if len(parts) != 2:
        print(f"Could not parse repository from URL: {url}")
        return

    owner_repo = parts[1]

    api_url = f"https://api.github.com/repos/{owner_repo}/pulls"

    data = {
        "title": "🛡️ Sentinel: [ENHANCEMENT] 입력 컴포넌트 최대 길이 제한 추가 (DoS 방지)",
        "head": "feature/add-input-max-length",
        "base": "develop",
        "body": "🚨 심각도: ENHANCEMENT\n💡 취약점: 텍스트 입력 필드에 최대 길이 제한이 없어, 매우 긴 문자열이 입력될 경우 클라이언트 측 정규식 평가 등에서 리소스 고갈(DoS) 및 메모리 초과가 발생할 위험이 있습니다.\n🎯 영향: 악의적이거나 비정상적으로 긴 텍스트 입력으로 인해 애플리케이션 성능 저하 및 충돌이 발생할 수 있습니다.\n🔧 해결 방법: `apps/desktop/src/components/ui/input.tsx`의 `<Input>` 컴포넌트에 기본 `maxLength={2048}` 속성을 추가하여 과도한 입력을 차단했습니다.\n✅ 검증 방법: 테스트 스위트를 실행하여 회귀가 없음을 확인합니다."
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
    }

    req = urllib.request.Request(api_url, data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))
            print(f"Pull request created successfully: {result['html_url']}")
    except urllib.error.HTTPError as e:
        print(f"Failed to create pull request: {e.code} {e.reason}")
        error_body = e.read().decode("utf-8")
        print(error_body)

if __name__ == "__main__":
    main()
