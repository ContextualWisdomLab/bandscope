with open(".github/workflows/opencode-review.yml", "r") as f:
    content = f.read()

content = content.replace(
'''          GH_TOKEN: ${{ steps.opencode_app_token.outputs.token || secrets.OPENCODE_APPROVE_TOKEN || github.token }}''',
'''          GH_TOKEN: ${{ secrets.OPENCODE_APP_TOKEN || steps.opencode_app_token.outputs.token || secrets.OPENCODE_APPROVE_TOKEN || github.token }}''')

with open(".github/workflows/opencode-review.yml", "w") as f:
    f.write(content)
